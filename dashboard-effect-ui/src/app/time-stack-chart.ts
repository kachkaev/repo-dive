import { Mount, UiSchema } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { Schema } from "effect";

import { AxisBottom, AxisLeft } from "./shared/axes.ts";
import { cachedBy } from "./shared/cached-by.ts";
import { cn } from "./shared/cn.ts";
import { CrosshairLine } from "./shared/crosshair-line.ts";
import { formatCount } from "./shared/format.ts";
import { MeasureWidth } from "./shared/measure-width.ts";
import { Legend, type LegendToggles } from "./shared/primitives.ts";
import { TrackPointer } from "./shared/track-pointer.ts";
import {
  ChartMarks,
  type ChartMarksInput,
} from "./time-stack-chart/chart-marks.ts";
import {
  crosshairXOf,
  HoverTooltip,
} from "./time-stack-chart/hover-tooltip.ts";
import {
  drawnKeysOf,
  groupBoundaryKeysOf,
  hatchColorsOf,
  hiddenLabelSetOf,
  resolvedLegendItemsOf,
  soloedLabels,
  toggledLabels,
} from "./time-stack-chart/legend-state.ts";
import {
  chartHeight,
  type ChartLayout,
  chartLayoutOf,
  type ChartRows,
  chartRowsOf,
  displayRowsOf,
  hoverIndexOf,
  hoverMsAt,
  innerHeight,
  margin,
} from "./time-stack-chart/shared/geometry.ts";
import {
  ChartModeSchema,
  type LegendItem,
  LegendItemSchema,
  PointUnitSchema,
  SeriesGroupSchema,
  TimePointSchema,
  ValueFormatSchema,
} from "./time-stack-chart/shared/schemas.ts";

export type {
  LegendItem,
  SeriesGroup,
  TimePoint,
} from "./time-stack-chart/shared/schemas.ts";

const TimeSeriesChartProps = Schema.Struct({
  points: Schema.Array(TimePointSchema),
  /** Every series, in stack order (bottom first). */
  seriesKeys: Schema.Array(Schema.String),
  /** One per series key, in the same order. */
  colors: Schema.Array(Schema.String),
  /**
   * Series key → hatch color: overlays 45° diagonal lines in that color on
   * the series' marks (2px lines at a 6px pitch — 2/3 base fill, 1/3 hatch).
   * The kind legend uses it for "authored by X, assisted by Y" series.
   */
  seriesHatch: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  mode: ChartModeSchema,
  /** What one point covers; defaults to a day. See `PointUnit`. */
  pointUnit: Schema.optional(PointUnitSchema),
  /**
   * Draw per-row shares instead of raw values. Owned by the section's
   * controls (above the frame); ignored when the chart can't show shares —
   * lines aren't parts of a whole, and a single series is always 100%.
   */
  percentMode: Schema.optional(Schema.Boolean),
  /** Formats values in the hover card; `formatCount` by default. */
  valueFormat: Schema.optional(ValueFormatSchema),
  /** Overrides the per-series legend — e.g. one swatch per contributor. */
  legendItems: Schema.optional(Schema.Array(LegendItemSchema)),
  /**
   * A second legend row on its own line below the first — e.g. the year
   * shades when the primary legend already names the groups. A separate row
   * (rather than more items in one) so wrapping on narrow screens never
   * interleaves the two vocabularies.
   */
  secondaryLegendItems: Schema.optional(Schema.Array(LegendItemSchema)),
  /** When set, the tooltip sums each group's sub-series into one row. */
  tooltipGroups: Schema.optional(Schema.Array(SeriesGroupSchema)),
  /**
   * Lets the viewer hide series by clicking their legend items (alt/option
   * click isolates one) — to read the slopes of the remaining ones without a
   * spike lower in the stack bending them. The hidden series leave the
   * stack; everything else holds still: both axes, the legend's layout (the
   * item stays put, crossed out) and the hover card's rows and numbers. Off
   * by default — a legend that names age shades or one series explains
   * nothing by hiding, and a chart with a kind filter above it already has a
   * way to subset its series.
   */
  legendToggles: Schema.optional(Schema.Boolean),
  /**
   * Extends the time axis back to this instant when it predates the first
   * data point, so a series that starts mid-history (e.g. dependencies,
   * tracked only once a lockfile exists) still shares the repo's full
   * timeline. Only ever widens the domain outward — a value inside the data
   * range is ignored.
   */
  domainStartMs: Schema.optional(Schema.Number),
  /** Like `domainStartMs`, extending the axis forward past the last point. */
  domainEndMs: Schema.optional(Schema.Number),
  /**
   * Raises the value axis to at least this. Sibling variants of one chart —
   * switched by a control above it, each with its own tallest stack — pass a
   * shared peak so they draw against a single y scale instead of every toggle
   * resizing the areas under the cursor. Like `domainStartMs` it only ever
   * widens the domain, and it has no effect in percentage mode, which always
   * spans 0–100%.
   */
  domainPeak: Schema.optional(Schema.Number),
  /**
   * Tooltip text for a data point whose series all sum to zero — a value that
   * was collected and came back empty, as opposed to a stretch with no data
   * point at all (which always reads "No data"). Lets a chart say something
   * concrete, e.g. "No lockfile", instead of an ambiguous run of zeros.
   */
  zeroLabel: Schema.optional(Schema.String),
  /**
   * Area mode only: fade the strokes between a group's stacked sub-series
   * and draw a crisp line only where one `tooltipGroups` group meets the
   * next, so primary categories stay separated while their inner bands
   * blend.
   */
  separateGroups: Schema.optional(Schema.Boolean),
});
type TimeSeriesChartProps = typeof TimeSeriesChartProps.Type;

export const TimeSeriesChartMessage = UiSchema.TaggedEnum({
  ChangedWidth: { width: Schema.Number },
  /** The pointer moved over the hover rect, `x` px from its left edge. */
  MovedPointer: { x: Schema.Number },
  LeftPlot: {},
  /** A click on a legend item, which hides or shows its series. */
  ToggledLegendItem: { label: Schema.String },
  /** An alt/option click on a legend item, which isolates its series. */
  AltToggledLegendItem: { label: Schema.String },
});

/** A legend click and an alt/option click, as this chart's messages. */
const legendToggleMessages: Omit<
  LegendToggles<typeof TimeSeriesChartMessage.Type>,
  "hiddenLabels"
> = {
  onToggle: (label) => TimeSeriesChartMessage.ToggledLegendItem({ label }),
  onSolo: (label) => TimeSeriesChartMessage.AltToggledLegendItem({ label }),
};

const noHatch: Readonly<Record<string, string>> = {};
const noGroups: ReadonlySet<string> = new Set();

/** What both `update` and `view` derive from the props and the width. */
type ChartGeometry = {
  readonly chartRows: ChartRows;
  readonly layout: ChartLayout;
  readonly supportsPercent: boolean;
};

const geometryOf = (
  props: TimeSeriesChartProps,
  width: number,
): ChartGeometry => {
  const chartRows = chartRowsOf(props.points, props.seriesKeys);
  // Lines aren't parts of a whole, and a single series is always 100%.
  const supportsPercent = props.mode !== "line" && props.seriesKeys.length > 1;
  const layout = chartLayoutOf(
    chartRows,
    props.mode,
    width,
    props.pointUnit ?? "day",
    supportsPercent && (props.percentMode ?? false),
    props.domainStartMs,
    props.domainEndMs,
    props.domainPeak,
  );
  return { chartRows, layout, supportsPercent };
};

/** Two items at least: hiding the only one would leave nothing to compare. */
const canToggleOf = (
  props: TimeSeriesChartProps,
  legendItems: readonly LegendItem[],
): boolean => (props.legendToggles ?? false) && legendItems.length > 1;

/**
 * The marks' input, one object per distinct input so that it is the one
 * argument `h.lazy` compares: a hover keeps every part of it, and so the
 * whole object.
 */
const marksInputOf = cachedBy(
  (
    layout: ChartLayout,
    displayRows: ChartMarksInput["displayRows"],
    rows: ChartMarksInput["rows"],
    seriesKeys: ChartMarksInput["seriesKeys"],
    drawnKeys: ChartMarksInput["drawnKeys"],
    colors: ChartMarksInput["colors"],
    separateGroups: boolean,
    groupBoundaryKeys: ReadonlySet<string>,
    seriesHatch: Readonly<Record<string, string>>,
    hatchColors: readonly string[],
  ): ChartMarksInput => ({
    mode: layout.mode,
    layout,
    displayRows,
    rows,
    seriesKeys,
    drawnKeys,
    colors,
    separateGroups,
    groupBoundaryKeys,
    seriesHatch,
    hatchColors,
  }),
);

/** Assist hatch: 2px lines at a 6px pitch — 2/3 base fill, 1/3 helper. */
const HatchPatterns = <M>(
  h: Html.H<M>,
  hatchColors: readonly string[],
  hatchIdBase: string,
) =>
  h.defs.children(
    hatchColors.map((hatchColor, index) =>
      h.pattern
        .key(hatchColor)
        .attrs({
          id: `${hatchIdBase}-${index}`,
          width: "6",
          height: "6",
          patternUnits: "userSpaceOnUse",
          patternTransform: "rotate(45)",
        })
        .children(h.rect.attrs({ width: "2", height: "6", fill: hatchColor })),
    ),
  );

/**
 * The value axis: counts, or whole percentages in % mode. Each axis leads
 * with its own first argument for `h.lazy`, since both are built from the
 * layout.
 */
const ChartAxisLeft = <M>(
  h: Html.H<M>,
  _id: "axis-left",
  layout: ChartLayout,
) => {
  const [rangeStart = 0, rangeEnd = 0] = layout.yScale.range();
  return AxisLeft(h, {
    ticks: layout.yTicks.map((tick) => ({
      y: layout.yScale(tick),
      label: layout.showPercent
        ? `${Math.round(tick * 100)}%`
        : formatCount(tick),
    })),
    range: [rangeStart, rangeEnd],
  });
};

/**
 * The time axis, at the calendar ticks `timeAxisTicks` picked. The axis line
 * spans the scale's range, which `xInset` shrinks for bars; it is padded back
 * out so the line runs the full plot width rather than relying on the zero
 * grid line to cover the gap.
 */
const ChartAxisBottom = <M>(
  h: Html.H<M>,
  _id: "axis-bottom",
  layout: ChartLayout,
) => {
  const [rangeStart = 0, rangeEnd = 0] = layout.xScale.range();
  return AxisBottom(h, {
    top: innerHeight,
    ticks: layout.xTicks.map((tick) => ({
      x: layout.xScale(tick.valueMs),
      label: tick.label,
    })),
    range: [rangeStart, rangeEnd],
    rangePadding: layout.xInset,
  });
};

/**
 * The legend under the frame, built through `h.lazy` so a hover reuses it.
 * `hiddenLabels` is undefined when the legend has no toggles.
 */
const PrimaryLegend = <M>(
  h: Html.H<M>,
  legendItems: readonly LegendItem[],
  hiddenLabels: ReadonlySet<string> | undefined,
  toggleMessages: Omit<LegendToggles<M>, "hiddenLabels">,
) =>
  Legend(h, {
    items: legendItems,
    toggles:
      hiddenLabels === undefined
        ? undefined
        : { hiddenLabels, ...toggleMessages },
  });

/**
 * The second legend stands off by 12px, clearly more than the 4px between a
 * wrapped legend's rows — so the two read as separate vocabularies, not as
 * more rows of the first.
 */
const SecondaryLegend = <M>(
  h: Html.H<M>,
  secondaryLegendItems: readonly LegendItem[],
) => Legend(h, { items: secondaryLegendItems, marginClass: cn("mt-3") });

/**
 * Stacked series over time — areas for dense series, bars for monthly
 * buckets, lines for non-stacked comparison — with a dashed crosshair and a
 * hover card that snaps to the nearest point, the port of the React
 * `TimeSeriesChart` (`time-stack-chart.tsx`). The props mirror the React
 * ones, with `TimePoint`, `LegendItem` and `SeriesGroup` exported here.
 *
 * The chart owns what only it knows: its measured width, the instant under
 * the pointer and the legend labels the viewer has hidden (when
 * `legendToggles` is on). Hidden labels are kept as labels rather than series
 * keys, so one entry covers a group's year bands, and they survive prop
 * changes: a series hidden in one variant of a chart (switched by a control
 * above the frame) stays hidden in the next, and labels a variant does not
 * draw simply wait for it to come back. Re-key the chart to start over.
 *
 * Everything else is derived from the props and the width through `cachedBy`
 * helpers keyed by the prop arrays, so pass the same arrays on every render
 * (from `cachedBy` in the section), and give each chart arrays of its own:
 * those caches keep one slot per key, so two charts drawn from one `points`
 * array with different options would recompute each other's rows and scales
 * on every render. The marks, axes and legends are lazy nodes; a pointer move
 * redraws only the crosshair and the card.
 *
 * Deviations from the React chart:
 *
 * - No `useDeferredValue` and no `StaleOverlay`: a control above the frame
 *   or a legend click redraws the marks synchronously. The root is a plain
 *   `<div>` where React writes the overlay's two wrappers.
 * - Until its first width arrives the chart draws an empty 260px `<svg>`,
 *   where React draws the marks against a 10px plot; the layout is the same.
 * - The grid and the marks sit in a `<g>` of their own, which React writes
 *   as a fragment.
 */
export const TimeSeriesChart = Html.component({
  name: "TimeSeriesChart",
  props: TimeSeriesChartProps,
  model: Schema.Struct({
    width: Schema.Number,
    /**
     * The instant under the cursor (continuous), not a data index — so the
     * crosshair reaches the whole domain, including stretches with no data
     * point. Snapped to the nearest point in `view`.
     */
    hoverMs: Schema.UndefinedOr(Schema.Number),
    /** Legend labels the viewer has hidden, in the order they were. */
    hiddenLabels: Schema.Array(Schema.String),
  }),
  message: TimeSeriesChartMessage,
  // What only the pointer, the layout and the viewer's legend clicks knew;
  // after a reload the chart starts afresh, hidden labels included, as the
  // React one forgets them too.
  restore: false,
}).make({
  init: () => ({ width: 0, hoverMs: undefined, hiddenLabels: [] }),
  update: {
    ChangedWidth: ($, { width }) => $.evolve({ width }),
    // The latest instant, as React keeps it, even when it snaps to the same
    // point: a re-layout under a resting pointer (new props, a new width)
    // snaps the instant afresh. Such a move re-renders only the crosshair
    // and the card; the marks, axes and legends are lazy.
    MovedPointer: ($, { x }) =>
      $.evolve({
        hoverMs: hoverMsAt(geometryOf($.props, $.model.width).layout, x),
      }),
    LeftPlot: ($) => $.evolve({ hoverMs: undefined }),
    ToggledLegendItem: ($, { label }) =>
      $.evolve({ hiddenLabels: (labels) => toggledLabels(labels, label) }),
    // Judged against the state the click lands on.
    AltToggledLegendItem: ($, { label }) =>
      $.evolve({
        hiddenLabels: (labels) =>
          soloedLabels(labels, label, resolvedLegendItemsOf($.props)),
      }),
  },
  view: (h, model) => {
    const { props } = h;
    if (props.points.length === 0) {
      return h.p
        .class("text-sm text-(--text-muted)")
        .children("No data collected yet.");
    }
    const { width } = model;
    const { chartRows, layout, supportsPercent } = geometryOf(props, width);
    const { showPercent } = layout;
    const { rows, totals } = chartRows;
    const formatValue = props.valueFormat ?? formatCount;
    // The hover card sums its rows only where the stack is one quantity
    // split into parts — area charts for now. A lone row is its own total
    // already.
    const tooltipRowCount =
      props.tooltipGroups?.length ?? props.seriesKeys.length;
    const showSummary = props.mode === "area" && tooltipRowCount > 1;

    const legendItems = resolvedLegendItemsOf(props);
    const canToggle = canToggleOf(props, legendItems);
    const hiddenLabels = hiddenLabelSetOf(
      model.hiddenLabels,
      legendItems,
      canToggle,
    );
    const drawnKeys = drawnKeysOf(
      props.seriesKeys,
      hiddenLabels,
      props.tooltipGroups,
    );
    const seriesHatch = props.seriesHatch ?? noHatch;
    const hatchColors = hatchColorsOf(seriesHatch);
    const hatchIdBase = h.id("hatch");

    // Snap to the nearest data point while the cursor is within the data's
    // own span; outside it there is nothing to snap to, so the crosshair
    // follows the cursor and the tooltip reports "No data".
    const hoverIndex =
      model.hoverMs === undefined
        ? undefined
        : hoverIndexOf(chartRows, layout, model.hoverMs);
    const hovered = hoverIndex === undefined ? undefined : rows[hoverIndex];
    const hoveredTotal =
      hoverIndex === undefined ? 0 : (totals[hoverIndex] ?? 0);
    // Crosshair x: the snapped point in the data range, else the raw cursor
    // date.
    const crosshairMs = hovered?.["dateMs"] ?? model.hoverMs;

    // When a legend override is supplied without tooltip groups, the tooltip
    // follows the legend's reading order — the stack order may be reversed
    // for display (e.g. humans drawn on top of each bar but listed first).
    const legendRank = (label: string): number => {
      const index =
        props.legendItems?.findIndex((item) => item.label === label) ?? -1;
      return index === -1 ? Number.MAX_SAFE_INTEGER : index;
    };

    const plot =
      width > 0 &&
      h.g
        .class("visx-group")
        .attr("transform", `translate(${margin.left}, ${margin.top})`)
        .children(
          h.lazy(
            ChartMarks,
            marksInputOf(
              layout,
              displayRowsOf(chartRows, showPercent),
              rows,
              props.seriesKeys,
              drawnKeys,
              props.colors,
              props.separateGroups ?? false,
              props.separateGroups && props.tooltipGroups
                ? groupBoundaryKeysOf(props.tooltipGroups)
                : noGroups,
              seriesHatch,
              hatchColors,
            ),
            // The instance's own id stays out of the cached input, so it
            // never invalidates a slot another chart's arrays could share.
            hatchIdBase,
          ),
          h.lazy(ChartAxisLeft, "axis-left", layout),
          h.lazy(ChartAxisBottom, "axis-bottom", layout),
          h.rect
            .attrs({
              x: String(-layout.overhangPx),
              width: String(layout.innerWidth + 2 * layout.overhangPx),
              height: String(innerHeight),
              fill: "transparent",
            })
            .onMount(
              TrackPointer().pipe(
                Mount.map((position) =>
                  position === undefined
                    ? TimeSeriesChartMessage.LeftPlot()
                    : TimeSeriesChartMessage.MovedPointer({ x: position.x }),
                ),
              ),
            ),
        );

    return h.div.children(
      h.div
        .class("relative")
        .onMount(
          MeasureWidth().pipe(
            Mount.map((measured) =>
              TimeSeriesChartMessage.ChangedWidth({ width: measured }),
            ),
          ),
        )
        .children(
          h.svg
            .attrs({
              width: String(width),
              height: String(chartHeight),
              role: "img",
            })
            .children(
              width > 0 &&
                hatchColors.length > 0 &&
                h.lazy(HatchPatterns, hatchColors, hatchIdBase),
              plot,
            ),
          // Over the chart, under the card — both outside the <svg>, see
          // CrosshairLine.
          width > 0 &&
            crosshairMs !== undefined &&
            CrosshairLine(h, {
              xScale: layout.xScale,
              valueMs: crosshairMs,
              left: margin.left,
              top: margin.top,
              height: innerHeight,
            }),
          width > 0 &&
            crosshairMs !== undefined &&
            HoverTooltip(h, {
              crosshairMs,
              crosshairX: crosshairXOf(layout.xScale, crosshairMs),
              pointUnit: props.pointUnit ?? "day",
              hovered,
              hoveredTotal,
              width,
              supportsPercent,
              showPercent,
              seriesKeys: props.seriesKeys,
              colors: props.colors,
              seriesHatch: props.seriesHatch,
              tooltipGroups: props.tooltipGroups,
              hiddenLabels,
              legendRank,
              formatValue,
              zeroLabel: props.zeroLabel,
              showSummary,
            }),
        ),
      // An empty `legendItems` hides the legend — a one-entry legend for a
      // chart like the all-lines total explains nothing.
      legendItems.length > 0 &&
        h.lazy(
          PrimaryLegend,
          legendItems,
          canToggle ? hiddenLabels : undefined,
          legendToggleMessages,
        ),
      props.secondaryLegendItems !== undefined &&
        props.secondaryLegendItems.length > 0 &&
        h.lazy(SecondaryLegend, props.secondaryLegendItems),
    );
  },
});
