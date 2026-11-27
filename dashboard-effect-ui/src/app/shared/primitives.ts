import type { View } from "@effect/ui";
import type { Html } from "@effect/ui/html";

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

/** One table cell: plain text, a number, or markup such as a linked name. */
type DataTableCell<M> = string | number | View.Content<M>;

/**
 * A "View data" table behind a closed `<details>`. The body can hold
 * thousands of rows (one per commit), so build it inside `h.lazy` at the call
 * site, keyed on the rows' source array: the section's own re-renders (a
 * control flipping the chart) then reuse the table's nodes untouched instead
 * of diffing every row. The React dashboard defers the rows with
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
