import type { Html } from "@effect/ui/html";

import type { ContributorKind } from "../data.ts";
import {
  kindBadge,
  kindColors,
  type KindFilter,
  kindLabels,
  kindOrder,
} from "./shared/contributor-kinds.ts";
import { formatCount } from "./shared/format.ts";

export type ContributorBarsItem = {
  /** Stable, unique element key; labels aren't guaranteed unique. */
  id: string;
  label: string;
  href?: string | undefined;
  kind: ContributorKind;
  /** Commits this contributor authored — the length of the first bar. */
  authored: number;
  /**
   * Own commits carrying at least one co-author of that other kind. Counted
   * once per commit per kind, so these can sum above the number of distinct
   * assisted commits when one commit was helped by two kinds at once.
   */
  assistedBy: Partial<Record<ContributorKind, number>>;
  /**
   * Commits by an author of that other kind that this contributor co-authored.
   * Each commit has exactly one author, so these sum to the second bar.
   */
  assisted: Partial<Record<ContributorKind, number>>;
};

/**
 * The same hatch the charts and legend swatches use (2px lines at a 6px
 * pitch). Throughout the dashboard it reads as "another kind was involved".
 *
 * `135deg` is the CSS spelling of the charts' `rotate(45)` SVG patterns: CSS
 * angles run clockwise from "to top" and the bands sit perpendicular to that
 * axis, so 135deg — not 45deg — is what leans bottom-left to top-right.
 */
const hatchOf = (color: string): string =>
  `repeating-linear-gradient(135deg, transparent 0 4px, ${color} 4px 6px)`;

/**
 * Shared by the header and every row so the number columns line up. The bar
 * track takes the slack; the four fixed columns are the total plus one per kind.
 */
const gridTemplate = "1fr 3rem 2.75rem 2.75rem 2.75rem";

const sumCounts = (counts: Partial<Record<ContributorKind, number>>): number =>
  Object.values(counts).reduce((total, count) => total + count, 0);

const totalOf = (spans: ReadonlyArray<{ value: number }>): number =>
  spans.reduce((total, span) => total + span.value, 0);

/**
 * One bar: a base split into colored segments, overlaid with a hatch.
 *
 * `segments` are drawn left to right in `kindOrder`. `hatchSpans` says how much
 * of the bar's *right-hand end* is hatched, again per kind — the tail that
 * marks cross-kind involvement.
 */
const Bar = <M>(
  h: Html.H<M>,
  options: {
    readonly total: number;
    readonly max: number;
    /** Used when `segments` is empty — a single-color bar. */
    readonly baseColor: string;
    readonly segments: ReadonlyArray<{ kind: ContributorKind; value: number }>;
    /** Hatch color for a tail segment of that kind. */
    readonly hatchColorOf: (kind: ContributorKind) => string;
    readonly hatchSpans: ReadonlyArray<{
      kind: ContributorKind;
      value: number;
    }>;
    readonly title: string;
  },
) => {
  const { total, max, segments, hatchSpans } = options;
  const width = total === 0 ? 0 : Math.max(0.5, (total / max) * 100);
  const denominator = Math.max(total, 1);
  // A commit helped by two kinds at once counts under both, so the spans can
  // sum above the bar. Scale them down together in that case: the exact
  // per-kind numbers live in the columns, and the tail stays inside the bar.
  const hatchTotal = totalOf(hatchSpans);
  const hatchScale =
    hatchTotal > total && hatchTotal > 0 ? total / hatchTotal : 1;

  const basePieces = segments.map((segment, index) => ({
    ...segment,
    offsetPercent: (totalOf(segments.slice(0, index)) / denominator) * 100,
    widthPercent: (segment.value / denominator) * 100,
  }));
  const hatchPieces = hatchSpans.map((span, index) => ({
    ...span,
    offsetPercent:
      ((totalOf(hatchSpans.slice(0, index)) * hatchScale) / denominator) * 100,
    widthPercent: ((span.value * hatchScale) / denominator) * 100,
  }));

  return h.span
    .class("relative h-4 w-full rounded-xs bg-muted")
    .attr("title", options.title)
    .children(
      // No hover feedback: a bar is static content, not a click target.
      h.span
        .class("absolute inset-y-0 left-0 overflow-hidden rounded-xs")
        .style({ width: `${width}%`, background: options.baseColor })
        .children(
          // React keys these by kind within each list; here the two lists are
          // one run of siblings, so the keys say which list a piece is from.
          basePieces.map((piece) =>
            h.span
              .key(`base-${piece.kind}`)
              .class("absolute inset-y-0")
              .style({
                left: `${piece.offsetPercent}%`,
                width: `${piece.widthPercent}%`,
                background: kindColors[piece.kind],
              }),
          ),
          hatchPieces.map((piece) =>
            h.span
              .key(`hatch-${piece.kind}`)
              .class("absolute inset-y-0")
              .style({
                // Anchored to the right so the hatched tail always ends at the
                // bar's tip, whichever kinds are present.
                right: `${piece.offsetPercent}%`,
                width: `${piece.widthPercent}%`,
                backgroundImage: hatchOf(options.hatchColorOf(piece.kind)),
              }),
          ),
        ),
    );
};

/** A number cell, blank when the pairing can't happen or never did. */
const CountCell = <M>(h: Html.H<M>, key: string, value: number | undefined) =>
  h.span
    .key(key)
    .class("text-right text-xs text-(--text-secondary) tabular-nums")
    .children(
      value === undefined || value === 0
        ? h.span.class("text-muted-foreground").children("·")
        : formatCount(value),
    );

/** The per-kind spans of `counts` in `kinds` order, without the empty ones. */
const spansOf = (
  kinds: readonly ContributorKind[],
  counts: Partial<Record<ContributorKind, number>>,
): Array<{ kind: ContributorKind; value: number }> =>
  kinds.flatMap((kind) => {
    const value = counts[kind] ?? 0;
    return value === 0 ? [] : [{ kind, value }];
  });

const ContributorRow = <M>(
  h: Html.H<M>,
  item: ContributorBarsItem,
  max: number,
) => {
  const assistedTotal = sumCounts(item.assisted);
  const others = kindOrder.filter((kind) => kind !== item.kind);
  const badge = item.kind === "human" ? undefined : kindBadge[item.kind];

  return h.li
    .key(item.id)
    .class("space-y-1")
    .children(
      h.div
        .class("flex items-center gap-1.5 text-sm")
        .children(
          badge
            ? h.span
                .attr("title", badge.title)
                .class("select-none")
                .children(badge.icon)
            : h.span
                .attr("aria-hidden", "true")
                .class("inline-block size-2.5 rounded-xs")
                .style({ background: kindColors[item.kind] }),
          item.href
            ? h.a
                .attrs({ href: item.href, target: "_blank", rel: "noreferrer" })
                .class("truncate font-medium hover:underline")
                .children(item.label)
            : h.span.class("truncate font-medium").children(item.label),
        ),

      h.div
        .class("grid items-center gap-x-3 gap-y-1")
        .style({ gridTemplateColumns: gridTemplate })
        .children(
          Bar(h, {
            total: item.authored,
            max,
            baseColor: kindColors[item.kind],
            segments: [],
            hatchColorOf: (kind) => kindColors[kind],
            hatchSpans: spansOf(others, item.assistedBy),
            title: `${formatCount(item.authored)} commits authored`,
          }),
          h.span
            .class("text-right text-xs font-medium tabular-nums")
            .children(formatCount(item.authored)),
          kindOrder.map((kind) =>
            CountCell(
              h,
              `authored-${kind}`,
              kind === item.kind ? undefined : item.assistedBy[kind],
            ),
          ),

          Bar(h, {
            total: assistedTotal,
            max,
            baseColor: kindColors[item.kind],
            segments: spansOf(others, item.assisted),
            // The whole assisted bar is hatched in this contributor's own
            // color: the exact inverse of the bar above, where their base
            // color carries someone else's hatch.
            hatchColorOf: () => kindColors[item.kind],
            hatchSpans:
              assistedTotal === 0
                ? []
                : [{ kind: item.kind, value: assistedTotal }],
            title: `${formatCount(assistedTotal)} commits co-authored for others`,
          }),
          h.span
            .class("text-right text-xs font-medium tabular-nums")
            .children(
              assistedTotal === 0
                ? h.span.class("text-muted-foreground").children("·")
                : formatCount(assistedTotal),
            ),
          kindOrder.map((kind) =>
            CountCell(
              h,
              `assisted-${kind}`,
              kind === item.kind ? undefined : item.assisted[kind],
            ),
          ),
        ),
    );
};

/**
 * Every contributor as a pair of bars: what they authored (hatched where other
 * kinds helped) and what they helped others with (colored by whom they helped).
 * The two are inverses of each other, so a human and the agent that assists
 * them are measured on one shared scale.
 *
 * A view function rather than a component: like its React counterpart it
 * holds no state. The only hover is CSS (a linked name gains an underline),
 * and the bars, badges and kind columns explain themselves through native
 * `title` tooltips, as in React. The filter and the shared scale are derived
 * here, as React derives them on every render; the section builds this in
 * `h.lazy`, so that runs only when the items, the filter or the cap change.
 */
export const ContributorBars = <M>(
  h: Html.H<M>,
  options: {
    /** Every contributor on the list, ranked. */
    readonly items: readonly ContributorBarsItem[];
    readonly kindFilter: KindFilter;
    /** How many of the filtered items get bars. */
    readonly maxItems: number;
  },
) => {
  const { kindFilter } = options;
  const shownItems = options.items
    .filter((item) => kindFilter === "all" || item.kind === kindFilter)
    .slice(0, options.maxItems);
  if (shownItems.length === 0) {
    return h.p
      .class("text-sm text-muted-foreground")
      .children("Nothing to show.");
  }

  const max = Math.max(
    ...shownItems.map((item) =>
      Math.max(item.authored, sumCounts(item.assisted)),
    ),
    1,
  );

  return h.div.class("space-y-4").children(
    h.div
      .class("grid items-end gap-x-3 pl-1 text-[0.65rem] text-muted-foreground")
      .style({ gridTemplateColumns: gridTemplate })
      .children(
        h.span.children("authored above, assisted below"),
        h.span.class("text-right").children("total"),
        kindOrder.map((kind) =>
          h.span
            .key(kind)
            .class("flex items-center justify-end gap-1")
            .attr(
              "title",
              `Cross-kind collaboration with ${kindLabels[kind].toLowerCase()}`,
            )
            .children(
              h.span
                .attr("aria-hidden", "true")
                .class("inline-block size-2 rounded-xs")
                .style({ background: kindColors[kind] }),
              h.span.class("sr-only").children(kindLabels[kind]),
            ),
        ),
      ),

    h.ul
      .class("space-y-4")
      .children(shownItems.map((item) => ContributorRow(h, item, max))),
  );
};
