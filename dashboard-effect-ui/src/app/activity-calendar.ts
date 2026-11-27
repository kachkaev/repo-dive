import { UiSchema } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { Tooltip as TooltipPrimitive } from "@effect/ui-kit";
import { Schema } from "effect";

import {
  calendarOf,
  levelOpacities,
  noDataReason,
  summarize,
} from "./activity-calendar/calendar-layout.ts";
import { CalendarStrip } from "./activity-calendar/calendar-strip.ts";
import { ScrollArea } from "./shared/@ui-primitive/scroll-area.ts";
import { TooltipContent } from "./shared/@ui-primitive/tooltip.ts";
import { cn } from "./shared/cn.ts";
import {
  ContributorKindSchema,
  kindColors,
  KindFilterSchema,
} from "./shared/contributor-kinds.ts";
import { formatDateWithDayOfWeek } from "./shared/format.ts";
import { HistoryRangeSchema } from "./shared/history-range-schema.ts";
import { DateStamp } from "./shared/primitives.ts";

const CalendarCommitSchema = Schema.Struct({
  date: Schema.String,
  kind: Schema.optional(ContributorKindSchema),
  ai: Schema.Boolean,
});

export const CommitCalendarMessage = UiSchema.TaggedEnum({
  HoveredDay: { isoDate: Schema.String },
  LeftStrip: {},
  RequestedOpenTooltip: {},
  RequestedCloseTooltip: {},
});

/**
 * What the strips send, built once: the strips are memoized with `h.lazy`,
 * which compares its arguments by reference.
 */
const hoveredDay = (isoDate: string) =>
  CommitCalendarMessage.HoveredDay({ isoDate });
const leftStrip = CommitCalendarMessage.LeftStrip();

/**
 * The start of each hover target's id, which the tooltip anchors to. `h.id`
 * spells out the instance's whole path, well over a hundred characters, and
 * every day of every strip carries one, so the targets take a short digest
 * of it instead, a 32-bit string hash: still one per calendar instance.
 */
const dayIdPrefixOf = (instanceId: string): string => {
  let digest = 2_166_136_261;
  for (const character of instanceId) {
    digest = Math.imul(digest ^ (character.codePointAt(0) ?? 0), 16_777_619);
  }
  return `calendar-${(digest >>> 0).toString(36)}-`;
};

/** The commit calendar: one strip of week columns per year (or rolling year). */
export const CommitCalendar = Html.component({
  name: "CommitCalendar",
  props: Schema.Struct({
    commits: Schema.Array(CalendarCommitSchema),
    /**
     * The days the whole history covers, in its authors' own calendars — the
     * last one is the calendar's "today". Days outside it are drawn as "no
     * data", so it has to reach every day the commits bucket into.
     */
    historyDays: Schema.Struct({ first: Schema.String, last: Schema.String }),
    weekStartsOn: Schema.Literals(["monday", "sunday"]),
    range: HistoryRangeSchema,
    kindFilter: KindFilterSchema,
  }),
  model: Schema.Struct({
    /**
     * The hovered day outlives its hover, as in the React calendar, so the
     * tooltip keeps its content once the pointer leaves; `tooltipOpen` is
     * what the pointer actually drives.
     */
    hoveredIsoDate: Schema.UndefinedOr(Schema.String),
    tooltipOpen: Schema.Boolean,
  }),
  message: CommitCalendarMessage,
  // What only the pointer knew; after a reload nothing is hovered.
  restore: false,
}).make({
  init: () => ({ hoveredIsoDate: undefined, tooltipOpen: false }),
  update: {
    HoveredDay: ($, { isoDate }) =>
      $.evolve({ hoveredIsoDate: isoDate, tooltipOpen: true }),
    LeftStrip: ($) => $.evolve({ tooltipOpen: false }),
    RequestedOpenTooltip: ($) => $.evolve({ tooltipOpen: true }),
    RequestedCloseTooltip: ($) => $.evolve({ tooltipOpen: false }),
  },
  view: (h, model) => {
    const { commits, historyDays, weekStartsOn, range, kindFilter } = h.props;
    const calendar = calendarOf(
      commits,
      historyDays,
      weekStartsOn,
      range,
      kindFilter,
    );
    const dayIdPrefix = dayIdPrefixOf(h.id("day"));
    const hoveredCell =
      model.hoveredIsoDate === undefined
        ? undefined
        : calendar.cellsByIsoDate.get(model.hoveredIsoDate);
    const { rangeSummary, busiest } = calendar.caption;

    const legendColor =
      kindFilter === "all" ? kindColors.human : kindColors[kindFilter];

    return h.div.children(
      ScrollArea(h, {
        // Strips are only as wide as the months they hold, so how much room
        // they need swings by a year's worth of week columns. `mx-auto`
        // spends whatever is left over evenly instead of pooling it on the
        // right — and collapses to nothing once a strip has to scroll. pb
        // clears the overlay horizontal scrollbar (h-2.5) so it never covers
        // the last strip's bottom day row.
        contentClass: cn("mx-auto flex w-max flex-col gap-3 pb-2.5"),
        children: calendar.strips.map((strip, index) =>
          h.lazy(
            CalendarStrip,
            strip.layout,
            strip.title,
            weekStartsOn,
            calendar.levelOf,
            kindFilter,
            h.id("strip", index),
            dayIdPrefix,
            hoveredDay,
            leftStrip,
          ),
        ),
      }),
      // A day's detail belongs in a tooltip rather than in the caption below:
      // the caption's height varies with the text, and the whole calendar
      // used to jump as the pointer moved from one day to the next.
      // `disableHoverablePopup` makes the popup inert, so the days it covers
      // keep receiving the pointer.
      hoveredCell !== undefined &&
        TooltipPrimitive(h, {
          props: {
            open: model.tooltipOpen,
            disableHoverablePopup: true,
            anchor: `${dayIdPrefix}${hoveredCell.isoDate}`,
            side: "top",
            sideOffset: 6,
            // Up-and-left of the cell (right edge on the cell), keeping the
            // cells ahead in reading order visible; collision handling
            // shifts it back into view near the calendar's start.
            align: "end",
            alignOffset: 0,
          },
          onEmit: {
            RequestedOpen: () => CommitCalendarMessage.RequestedOpenTooltip(),
            RequestedClose: () => CommitCalendarMessage.RequestedCloseTooltip(),
          },
          view: (tooltip) =>
            TooltipContent(
              h,
              tooltip,
              [
                h.div
                  .class("mb-1 font-medium text-(--text-secondary)")
                  .children(DateStamp(h, hoveredCell.isoDate)),
                hoveredCell.day === undefined
                  ? h.div
                      .class("text-(--text-muted)")
                      .children(
                        noDataReason(hoveredCell.isoDate, historyDays.first),
                      )
                  : h.div.children(summarize(hoveredCell.day, kindFilter)),
              ],
              { arrow: false, class: cn("tabular-nums") },
            ),
        }),
      // Centered under the strips like a figure caption (see Legend): the
      // intensity scale first, then one claim per line — the range's own
      // total and the day that stands out.
      h.div
        .class(
          "mt-3 flex flex-col items-center gap-2.5 text-center text-xs text-(--text-secondary)",
        )
        .children(
          h.span.class("flex items-center gap-1 text-(--text-muted)").children(
            "Less",
            levelOpacities.map((opacity, level) =>
              h.span
                .key(String(level))
                .class("inline-block size-2.5 rounded-xs")
                .style(
                  level === 0
                    ? { background: "var(--surface-2)" }
                    : { background: legendColor, opacity: String(opacity) },
                ),
            ),
            "More",
          ),
          h.div
            .class("tabular-nums")
            .children(
              h.div.children(rangeSummary),
              busiest &&
                h.div.children(
                  `Busiest day ${formatDateWithDayOfWeek(busiest.isoDate)}: ${summarize(busiest.day, kindFilter)}`,
                ),
            ),
        ),
    );
  },
});
