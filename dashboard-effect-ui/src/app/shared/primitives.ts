import type { View } from "@effect/ui";
import type { Html } from "@effect/ui/html";

import { Tooltip } from "./@ui-primitive/tooltip.ts";
import { formatDate, formatDayOfWeek } from "./format.ts";
import { InfoIcon, LoaderCircleIcon } from "./icons.ts";
import { Markdown } from "./markdown.ts";

/** What a {@link Section} shows above its controls — plain data, known before the chart is. */
export type SectionHeading = {
  title: string;
  /**
   * Keep the wording constant across whatever the controls select: the
   * subtitle sits between the title and the controls, so a length change on
   * switch would shift the controls away from the cursor.
   */
  subtitle?: string | undefined;
  /**
   * Markdown note from the analyzed repo's config, rendered as a callout
   * between the heading and the controls. Shown in skeleton mode too — like
   * the title and subtitle it is plain data, so landing it early means the
   * real section never shifts the layout.
   */
  annotation?: string | undefined;
};

/** The spinner row a skeleton shows where the controls will be (mt-2, h-7 — the xs control size). */
const SpinnerRow = <M>(h: Html.H<M>) =>
  h.div
    .attr("aria-hidden", "true")
    .class("mt-2 flex h-7 items-center")
    .children(
      LoaderCircleIcon(
        h,
        "size-4 text-muted-foreground motion-safe:animate-spin",
      ),
    );

const SectionHeader = <M>(h: Html.H<M>, heading: SectionHeading) => [
  h.h2.class("text-base font-semibold").children(heading.title),
  heading.subtitle
    ? h.p
        .class("mt-0.5 text-sm text-(--text-secondary)")
        .children(heading.subtitle)
    : undefined,
  heading.annotation
    ? h.aside
        .class(
          "mt-2 flex max-w-prose gap-2 rounded-md border border-border bg-muted px-3 py-2 text-sm text-(--text-secondary)",
        )
        .children(
          InfoIcon(h, "mt-0.5 size-4 shrink-0 text-muted-foreground"),
          h.div(Markdown(h, heading.annotation)),
        )
    : undefined,
];

/**
 * A report section: heading, optional controls in a wrapping row, the chart
 * card and an optional footer ("View data" tables and the like, rendered
 * after the frame — the frame itself holds only the visual, its legend and an
 * optional caption).
 */
export const Section = <
  M,
  C extends View.Children<M>,
  K extends View.Children<M> = [],
  F extends View.Children<M> = [],
>(
  h: Html.H<M>,
  options: SectionHeading & {
    readonly controls?: K | undefined;
    readonly footer?: F | undefined;
    readonly children: C;
  },
) =>
  h.section.class("mb-10").children(
    SectionHeader(h, options),
    // Drawn whenever controls are passed, even if each of them turns out to
    // render nothing (a kind filter in a single-kind repo): the React
    // dashboard's row is there for any element it is given, and its margin
    // is part of the layout.
    options.controls === undefined
      ? undefined
      : h.div
          .class("mt-2 flex flex-wrap items-center gap-2")
          .children(options.controls),
    h.div
      .class("mt-3 rounded-md border border-(--grid-line) bg-(--surface-1) p-4")
      .children(options.children),
    options.footer,
  );

/**
 * A {@link Section} that has not arrived yet: only its heading over a small
 * spinner, skipping the controls, the chart card and the footer. The reveal
 * tail shows the next section this way — its heading is plain data,
 * unaffected by the chart body it waits for, so it can land early and never
 * reflow. The spinner row copies the controls row's spacing and height, so
 * when the real section arrives the controls replace it without any shift and
 * the chart card only extends below.
 */
export const SectionHeadingSkeleton = <M>(
  h: Html.H<M>,
  heading: SectionHeading,
) =>
  h.section.class("mb-10").children(SectionHeader(h, heading), SpinnerRow(h));

/**
 * Ghost of a {@link Section} — muted title and subtitle bars over the same
 * spinner row {@link SectionHeadingSkeleton} uses. Rendered where the report
 * will continue while nothing about its next section is known yet, so the
 * page visibly promises more content. The ghost bars are kept narrower than
 * any real title ("Contributors" is the shortest) so the text that replaces
 * them only ever extends — pixels appearing reads as loading, pixels
 * vanishing as a flash.
 */
export const SectionSkeleton = <M>(h: Html.H<M>) =>
  h.div
    .attr("aria-hidden", "true")
    .class("mb-10")
    .children(
      h.div.class("h-5 w-20 rounded-sm bg-muted motion-safe:animate-pulse"),
      h.div.class(
        "mt-1.5 h-3.5 w-80 max-w-full rounded-sm bg-muted motion-safe:animate-pulse",
      ),
      SpinnerRow(h),
    );

export const StatTile = <M>(
  h: Html.H<M>,
  options: {
    readonly label: string;
    readonly value: string;
    readonly hint?: string | undefined;
  },
) =>
  h.div
    .class("rounded-md border border-(--grid-line) bg-(--surface-1) px-4 py-3")
    .children(
      h.div
        .class(
          "text-xs font-medium tracking-wide text-(--text-muted) uppercase",
        )
        .children(options.label),
      h.div
        .class("mt-1 text-2xl font-semibold tabular-nums")
        .children(options.value),
      options.hint
        ? h.div
            .class("mt-0.5 text-xs tabular-nums text-(--text-secondary)")
            .children(options.hint)
        : undefined,
    );

/**
 * One table cell: plain text, a number, or markup such as a linked name —
 * one node, or several placed side by side in the cell.
 */
type DataTableCell<M> =
  string | number | View.Content<M> | View.Children<M, never>;

/**
 * A "View data" table behind a closed `<details>`. The body can hold
 * thousands of rows (one per commit), so build it inside `h.lazy` at the call
 * site, with the rows' source as the first argument: the section's own
 * re-renders (a control flipping the chart) then reuse the table's nodes
 * untouched instead of diffing every row. The React dashboard defers the rows with
 * `useDeferredValue` for the same reason; Effect UI renders synchronously, so
 * memoizing them is what keeps a click cheap.
 */
export const DataTable = <M>(
  h: Html.H<M>,
  options: {
    readonly caption: string;
    readonly header: readonly string[];
    readonly rows: ReadonlyArray<ReadonlyArray<DataTableCell<M>>>;
  },
) =>
  h.details
    .class("mt-3 text-xs text-(--text-secondary)")
    .children(
      h.summary
        .class("select-none hover:text-(--text-primary)")
        .children(options.caption),
      h.div
        .class("mt-2 max-h-64 overflow-auto")
        .children(
          h.table
            .class("w-full text-left tabular-nums")
            .children(
              h.thead(
                h.tr(
                  options.header.map((cell) =>
                    h.th.class("pr-4 pb-1 font-medium").children(cell),
                  ),
                ),
              ),
              h.tbody(
                options.rows.map((row) =>
                  h.tr
                    .class("border-t border-(--grid-line)")
                    .children(
                      row.map((cell) =>
                        h.td
                          .class("py-0.5 pr-4")
                          .children(
                            typeof cell === "number" ? String(cell) : cell,
                          ),
                      ),
                    ),
                ),
              ),
            ),
        ),
    );

/** The longest weekday name — what the slot below is sized against. */
const widestDayName = "Wednesday";

/**
 * A date and the weekday it fell on, as a hover card stamps it. A card is only
 * as wide as its widest line, so on charts with short value rows the weekday
 * sets that width — and the card would grow and shrink under the cursor as the
 * name changed length. The name therefore sits in a slot as wide as
 * {@link widestDayName}: an invisible copy holds the width open and the real
 * name overlays it in the same grid cell, which keeps the slot correct in any
 * font rather than at one hand-measured pixel width.
 */
export const DateStamp = <M>(h: Html.H<M>, isoDate: string) =>
  // `tabular-nums` does for the date what the slot does for the weekday: with
  // both fixed, the whole stamp is one width for every day of the calendar.
  h.span
    .class("tabular-nums")
    .children(
      `${formatDate(isoDate)} · `,
      h.span
        .class("inline-grid")
        .children(
          h.span
            .attr("aria-hidden", "true")
            .class("invisible col-start-1 row-start-1")
            .children(widestDayName),
          h.span
            .class("col-start-1 row-start-1")
            .children(formatDayOfWeek(isoDate)),
        ),
    );

export type LegendEntry = {
  label: string;
  color: string;
  /** Overlays diagonal hatching in this color — "assisted by" in the kind legend. */
  hatch?: string | undefined;
};

/**
 * A legend/tooltip swatch: base color, plus the same hatch the marks use
 * (2px lines at a 6px pitch — 2/3 base fill, 1/3 helper color).
 *
 * `135deg` is the CSS spelling of the charts' `rotate(45)` SVG patterns: CSS
 * angles run clockwise from "to top" and the bands sit perpendicular to that
 * axis, so 135deg — not 45deg — is what leans bottom-left to top-right.
 */
export const Swatch = <M>(
  h: Html.H<M>,
  options: {
    readonly color: string;
    readonly hatch?: string | undefined;
    readonly className?: string | undefined;
  },
) =>
  h.span.class(options.className ?? "inline-block size-2.5 rounded-xs").style({
    backgroundColor: options.color,
    backgroundImage: options.hatch
      ? `repeating-linear-gradient(135deg, transparent 0 4px, ${options.hatch} 4px 6px)`
      : undefined,
  });

/**
 * How the legend tooltips name the modifier that isolates a series: the key
 * is ⌥ on Apple keyboards and Alt everywhere else. Sniffed once — the report
 * is a static page and the keyboard does not change under it.
 */
const altKeyName = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌥" : "Alt";

/**
 * The chart-side half of a {@link Legend} with toggles: which labels are
 * hidden, and the chart's messages for a click and a modifier click on a
 * label.
 */
export type LegendToggles<M> = {
  hiddenLabels: ReadonlySet<string>;
  /** A click: hides a visible label, shows a hidden one. */
  onToggle: (label: string) => M;
  /**
   * An alt/option click: shows only this label while any other is showing,
   * and shows every label again once none is — so a second modifier click
   * undoes the first, and an emptied chart comes back with one click.
   */
  onSolo: (label: string) => M;
};

/**
 * Rendered below its chart, centered like a figure caption: legends change
 * with the controls, and above the marks a height change would shift them
 * mid-read. Laid out as inline boxes rather than a wrapping flexbox so
 * `text-balance` applies — it balances line boxes, which flex rows are not —
 * and a wrapped legend fills its rows evenly instead of stranding the last
 * item (usually "Other") alone on the final row. The margins reproduce the
 * old flex gaps: `mx-2` meets another item's `mx-2` for the 16px column gap,
 * `my-0.5` for the 4px row gap.
 *
 * With `toggles`, every item is a button that hides its series from the
 * chart, with a tooltip saying so. A hidden item stays in place, crossed out
 * at partial opacity, so the legend never reflows under the cursor. Each
 * item's tooltip is a child component keyed by its label, so a chart draws
 * one legend with toggles at most.
 */
export const Legend = <M>(
  h: Html.H<M>,
  options: {
    readonly items: readonly LegendEntry[];
    /** Replaces the default `mt-2` — e.g. a second legend standing further off. */
    readonly marginClassName?: string | undefined;
    readonly toggles?: LegendToggles<M> | undefined;
  },
) => {
  const { items, toggles } = options;
  const hiddenLabels = toggles?.hiddenLabels;
  return h.div
    .class(
      `${options.marginClassName ?? "mt-2"} text-center text-xs text-balance text-(--text-secondary)`,
    )
    .children(
      items.map((item) => {
        const hidden = hiddenLabels?.has(item.label) ?? false;
        const swatch = Swatch(h, {
          color: item.color,
          hatch: item.hatch,
          className: hidden
            ? "inline-block size-2.5 rounded-xs opacity-35"
            : "inline-block size-2.5 rounded-xs",
        });
        if (toggles === undefined) {
          return h.span
            .key(item.label)
            .class("mx-2 my-0.5 inline-flex items-center gap-1.5")
            .children(swatch, item.label);
        }
        // What the modifier click will do, phrased from the current state:
        // it isolates the item while anything else is showing, and brings
        // everything back once nothing else is (see LegendToggles.onSolo).
        const othersVisible = items.some(
          (other) =>
            other.label !== item.label && !hiddenLabels?.has(other.label),
        );
        return Tooltip(h, {
          key: item.label,
          props: {
            delay: 400,
            pressed: !hidden,
            // `select-none`: quick repeated clicks would otherwise select the
            // label as a word. `group` lets the label preview the click on
            // hover; besides that and the text shift the ring is the only
            // feedback — no fill, so the row stays a caption.
            triggerClass:
              "group mx-2 my-0.5 inline-flex items-center gap-1.5 rounded-xs outline-none select-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
          },
          slots: {
            trigger: [
              swatch,
              // Hovering a visible label previews the click with a faint
              // strike-through — the line it will get. A hidden label keeps
              // its crossed-out look on hover; the text shift is enough.
              h.span
                .class(
                  hidden
                    ? "line-through opacity-60"
                    : "group-hover:line-through group-hover:decoration-muted-foreground/40",
                )
                .children(item.label),
            ],
            content: `Click to ${hidden ? "show" : "hide"} · ${altKeyName}-click to ${othersVisible ? "show only this" : "show all"}`,
          },
          onEmit: {
            Clicked: ({ alt }) =>
              alt ? toggles.onSolo(item.label) : toggles.onToggle(item.label),
          },
        });
      }),
    );
};
