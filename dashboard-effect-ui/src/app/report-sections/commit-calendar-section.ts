import { UiSchema } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { Schema } from "effect";

import { type DashboardData, DashboardDataSchema } from "../../data.ts";
import { CommitCalendar } from "../activity-calendar.ts";
import {
  KindFilterControl,
  KindFilterSchema,
} from "../shared/contributor-kinds.ts";
import { Section, type SectionHeading } from "../shared/primitives.ts";
import { HistoryRangeSelect } from "./history-range-select.ts";
import { commitKindsOf } from "./shared/commit-kinds.ts";
import {
  defaultCalendarRangeOf,
  historyOf,
  HistoryRangeSchema,
} from "./shared/history-ranges.ts";
import type { ReportSection } from "./shared/report-section.ts";

const commitCalendarHeading = (
  annotation: string | undefined,
): SectionHeading => ({
  title: "Commit calendar",
  subtitle:
    "commits per day; days bucketed by the author's local date, i.e. when each commit was written",
  annotation,
});

const CommitCalendarSectionMessage = UiSchema.TaggedEnum({
  ToggledKindFilter: { kindFilter: KindFilterSchema },
  PickedRange: { range: HistoryRangeSchema },
});

/**
 * The commit calendar with its kind filter and range select. The section owns
 * both choices: in the React dashboard they live in `ReportSections`, lifted
 * out of the calendar so they survive its remount on a range change; here the
 * section is that owner, and the calendar below it can be re-keyed on the
 * range without losing them.
 */
const CommitCalendarSection = Html.component({
  name: "CommitCalendarSection",
  props: Schema.Struct({ data: DashboardDataSchema }),
  model: Schema.Struct({
    range: HistoryRangeSchema,
    kindFilter: KindFilterSchema,
  }),
  message: CommitCalendarSectionMessage,
}).make({
  init: ($) => {
    return {
      range: defaultCalendarRangeOf(historyOf($.props.data).calendarHistory),
      kindFilter: "all" as const,
    };
  },
  update: {
    ToggledKindFilter: ($, { kindFilter }) => $.evolve({ kindFilter }),
    PickedRange: ($, { range }) => $.evolve({ range }),
  },
  view: (h, model) => {
    const { data } = h.props;
    return Section(h, {
      ...commitCalendarHeading(
        data.config?.charts?.annotations?.["commit-calendar"],
      ),
      controls: [
        KindFilterControl(h, {
          key: "kind-filter",
          label: "Filter calendar by contributor kind",
          value: model.kindFilter,
          onChange: (kindFilter) =>
            CommitCalendarSectionMessage.ToggledKindFilter({ kindFilter }),
          presentKinds: commitKindsOf(data),
        }),
        HistoryRangeSelect(h, {
          props: {
            label: "Calendar range",
            value: model.range,
            items: historyOf(data).rangeItems,
          },
          onEmit: {
            Picked: ({ value }) =>
              CommitCalendarSectionMessage.PickedRange({ range: value }),
          },
        }),
      ],
      children: [
        CommitCalendar(h, {
          // Restart on range change so a hovered day from the previous range
          // is not reported over the new one (mouseleave never fires when
          // the strips under the cursor are swapped).
          key: model.range,
          props: {
            commits: data.commits,
            historyDays: historyOf(data).historyDays,
            weekStartsOn: data.config?.charts?.weekStartsOn ?? "monday",
            range: model.range,
            kindFilter: model.kindFilter,
          },
        }),
      ],
    });
  },
});

export const commitCalendarSectionOf = (
  data: DashboardData,
): ReportSection | undefined =>
  data.repo.firstCommitDate !== undefined && data.commits.length > 0
    ? {
        id: "commit-calendar",
        skeleton: commitCalendarHeading(
          data.config?.charts?.annotations?.["commit-calendar"],
        ),
        view: (h, key) => CommitCalendarSection(h, { key, props: { data } }),
      }
    : undefined;
