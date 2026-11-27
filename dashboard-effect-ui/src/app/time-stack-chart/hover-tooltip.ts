import type { Html } from "@effect/ui/html";

import { cn } from "../shared/cn.ts";
import { formatMonth, formatPercent } from "../shared/format.ts";
import { DateStamp, Swatch } from "../shared/primitives.ts";
import type { PointUnit } from "../shared/time-axis.ts";
import { type ChartRow, margin } from "./shared/geometry.ts";
import type { SeriesGroup } from "./shared/schemas.ts";

/**
 * The floating value card next to the cursor, the React `HoverTooltip`.
 * Drawn on every pointer move that changes the hovered point, which is cheap:
 * the marks under it are a lazy node the move leaves alone. Like the
 * crosshair it lives on its own compositor layer (`will-change-transform`),
 * so repainting the card as it moves over the marks never re-rasterizes the
 * paths beneath it.
 */
export const HoverTooltip = <M>(
  h: Html.H<M>,
  options: {
    readonly crosshairMs: number;
    readonly crosshairX: number;
    readonly pointUnit: PointUnit;
    readonly hovered: ChartRow | undefined;
    readonly hoveredTotal: number;
    readonly width: number;
    readonly supportsPercent: boolean;
    readonly showPercent: boolean;
    readonly seriesKeys: readonly string[];
    readonly colors: readonly string[];
    readonly seriesHatch: Readonly<Record<string, string>> | undefined;
    readonly tooltipGroups: readonly SeriesGroup[] | undefined;
    /**
     * Rows the legend has hidden from the marks. They keep their place and
     * their numbers here — the card reports the data, not the drawing — and
     * are only crossed out the way the legend crosses them out.
     */
    readonly hiddenLabels: ReadonlySet<string>;
    readonly legendRank: (label: string) => number;
    readonly formatValue: (value: number) => string;
    readonly zeroLabel: string | undefined;
    /**
     * Closes the rows with a total, preceded by the drawn sum and its share
     * while the legend hides any of them.
     */
    readonly showSummary: boolean;
  },
) => {
  const {
    hovered,
    hoveredTotal,
    hiddenLabels,
    showPercent,
    supportsPercent,
    formatValue,
  } = options;
  const entries =
    hovered === undefined
      ? []
      : options.tooltipGroups
        ? options.tooltipGroups.map((group) => ({
            key: group.label,
            color: group.color,
            hatch: undefined,
            value: group.keys.reduce(
              (sum, key) => sum + (hovered[key] ?? 0),
              0,
            ),
          }))
        : options.seriesKeys
            .map((key, index) => ({
              key,
              color: options.colors[index] ?? "var(--series-1)",
              hatch: options.seriesHatch?.[key],
              value: hovered[key] ?? 0,
            }))
            .toSorted(
              (left, right) =>
                options.legendRank(left.key) - options.legendRank(right.key),
            );
  // Summed over every entry, before the card drops zero rows, so the summary
  // never depends on which rows are listed.
  const hasHiddenEntries = entries.some((entry) => hiddenLabels.has(entry.key));
  const shownTotal = entries
    .filter((entry) => !hiddenLabels.has(entry.key))
    .reduce((sum, entry) => sum + entry.value, 0);
  const summaryRows = [
    ...(hasHiddenEntries
      ? [
          {
            label: "Shown",
            value: shownTotal,
            share:
              hoveredTotal === 0
                ? "—"
                : formatPercent(shownTotal / hoveredTotal),
          },
        ]
      : []),
    // A total is always 100%, so its share cell stays empty.
    { label: "Total", value: hoveredTotal, share: "" },
  ];

  // The card sits left of the dashed line so it never covers the hovered
  // point; only when the line is too close to the chart's start to fit the
  // card's estimated width does it flip to the right side. The estimate only
  // picks the side — the left placement anchors the card's right edge (via
  // `right`), so the gap to the line stays 10px whatever the card's true
  // width.
  const cardWidth = supportsPercent ? 220 : 180;
  const { crosshairX, width } = options;
  const fitsLeftOfLine = crosshairX >= 10 + cardWidth;
  const valueClass = cn(
    "ml-auto pl-3 tabular-nums",
    showPercent ? "text-(--text-muted)" : "font-medium",
  );
  const shareClass = cn(
    "min-w-9 pl-2 text-right tabular-nums",
    showPercent ? "font-medium" : "text-(--text-muted)",
  );
  const body = () => {
    if (hovered === undefined) {
      // Nothing was collected at this instant — a genuine gap.
      return h.div.class("text-(--text-muted)").children("No data");
    }
    if (hoveredTotal === 0 && options.zeroLabel !== undefined) {
      // A collected point that came back empty; say so concretely.
      return h.div.class("text-(--text-muted)").children(options.zeroLabel);
    }
    return [
      ...entries
        .filter((entry) => entry.value !== 0 || options.seriesKeys.length <= 3)
        // A card that sums its rows lists all of them, or the rows would fall
        // short of the total with nothing to say why — e.g. the default 8
        // contributors plus "Other". Those stacks are bounded by config; only
        // the others need a cap.
        .slice(0, options.showSummary ? entries.length : 10)
        .map((entry) =>
          h.div
            .key(entry.key)
            .class("flex items-center gap-1.5")
            .children(
              Swatch(h, {
                color: entry.color,
                hatch: entry.hatch,
                class: cn(
                  "inline-block size-2 rounded-xs",
                  hiddenLabels.has(entry.key) && "opacity-35",
                ),
              }),
              h.span
                .class(
                  hiddenLabels.has(entry.key)
                    ? "text-(--text-secondary) line-through opacity-60"
                    : "text-(--text-secondary)",
                )
                .children(entry.key),
              h.span.class(valueClass).children(formatValue(entry.value)),
              supportsPercent &&
                h.span
                  .class(shareClass)
                  .children(
                    hoveredTotal === 0
                      ? "—"
                      : formatPercent(entry.value / hoveredTotal),
                  ),
            ),
        ),
      options.showSummary &&
        // The same 4px the date line keeps above the rows, so the list sits
        // evenly between the two; rows without a swatch need no divider.
        h.div.class("mt-1").children(
          summaryRows.map((row) =>
            h.div
              .key(row.label)
              .class("flex items-center gap-1.5")
              .children(
                // Stands in for a swatch so the labels line up with the rows
                // above.
                h.span.class("inline-block size-2"),
                h.span.class("text-(--text-secondary)").children(row.label),
                h.span.class(valueClass).children(formatValue(row.value)),
                h.span.class(shareClass).children(row.share),
              ),
          ),
        ),
    ];
  };

  return h.div
    .class(
      "pointer-events-none absolute top-2 z-10 rounded-md border border-(--grid-line) bg-(--surface-2) px-2.5 py-1.5 text-xs shadow-sm will-change-transform",
    )
    .style(
      fitsLeftOfLine
        ? { right: `${width - crosshairX + 10}px` }
        : {
            left: `${Math.min(crosshairX + 10, Math.max(0, width - cardWidth))}px`,
          },
    )
    .children(
      h.div
        .class(
          hovered
            ? "mb-1 font-medium text-(--text-secondary) tabular-nums"
            : "font-medium text-(--text-secondary) tabular-nums",
        )
        .children(
          options.pointUnit === "month"
            ? formatMonth(
                new Date(options.crosshairMs).toISOString().slice(0, 7),
              )
            : DateStamp(h, new Date(options.crosshairMs).toISOString()),
        ),
      body(),
    );
};

/** The crosshair's x within the chart container. */
export const crosshairXOf = (
  xScale: (valueMs: number) => number,
  crosshairMs: number,
): number => margin.left + xScale(crosshairMs);
