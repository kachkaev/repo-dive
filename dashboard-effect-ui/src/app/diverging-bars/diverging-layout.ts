import { scaleLinear, scaleTime } from "d3-scale";

import { formatCount } from "../shared/format.ts";
import { monthBucketMs, timeAxisTicks } from "../shared/time-axis.ts";

export const margin = { top: 8, right: 12, bottom: 24, left: 52 };
export const height = 240;

export type DivergingPoint = {
  readonly month: string;
  readonly positive: number;
  readonly negative: number;
  /** A sub-part of `positive`, drawn as a hatched band from the baseline up. */
  readonly positiveSecondary?: number | undefined;
};

/**
 * Everything DivergingBars draws that depends on its points and width only —
 * what the React component derives on every render, worked out here once per
 * points array and width ({@link divergingLayoutOf}), so the marks can be
 * memoized on it and a pointer move finds the nearest bar without rebuilding
 * the scales.
 */
export type DivergingLayout = {
  readonly points: readonly DivergingPoint[];
  readonly innerWidth: number;
  readonly innerHeight: number;
  /** Each point's month, as the x scale's input (mid-month, UTC). */
  readonly dates: readonly number[];
  readonly xScale: (valueMs: number) => number;
  /** Half a month slot: how far the x range is inset on each side. */
  readonly xInset: number;
  readonly xRange: readonly [number, number];
  readonly xTicks: ReadonlyArray<{
    readonly x: number;
    readonly label: string;
  }>;
  readonly yScale: (value: number) => number;
  readonly yRange: readonly [number, number];
  /** y positions of the grid rows (4 ticks). */
  readonly gridY: readonly number[];
  /** The left axis ticks (5 ticks), labelled with their absolute value. */
  readonly yTicks: ReadonlyArray<{
    readonly y: number;
    readonly label: string;
  }>;
  readonly barWidth: number;
};

const computeLayout = (
  points: readonly DivergingPoint[],
  width: number,
): DivergingLayout => {
  const innerWidth = Math.max(10, width - margin.left - margin.right);
  const innerHeight = height - margin.top - margin.bottom;

  const dates = points.map((point) => monthBucketMs(point.month));

  // Bars are centred on their month, so pinning the first and last months to
  // the chart edges spills half a bar off each side. Inset the range by half a
  // month slot so every bar sits inside the plot area.
  const xInset = innerWidth / Math.max(1, points.length) / 2;

  let xMin = Math.min(...dates);
  let xMax = Math.max(...dates);
  if (xMin === xMax) {
    xMin -= 14 * 86_400_000;
    xMax += 14 * 86_400_000;
  }
  const xScale = scaleTime()
    .domain([xMin, xMax])
    .range([xInset, innerWidth - xInset]);
  const xTicks = timeAxisTicks({
    startMs: xMin,
    endMs: xMax,
    pointUnit: "month",
    widthPx: innerWidth,
  });

  const maxPositive = Math.max(1, ...points.map((point) => point.positive));
  const maxNegative = Math.max(1, ...points.map((point) => point.negative));
  const yScale = scaleLinear()
    .domain([-maxNegative * 1.05, maxPositive * 1.05])
    .range([innerHeight, 0])
    .nice();

  const barWidth = Math.max(
    1,
    Math.min(18, (innerWidth / Math.max(1, points.length)) * 0.7),
  );

  return {
    points,
    innerWidth,
    innerHeight,
    dates,
    xScale: (valueMs) => xScale(valueMs),
    xInset,
    xRange: [xInset, innerWidth - xInset],
    xTicks: xTicks.map((tick) => ({
      x: xScale(tick.valueMs),
      label: tick.label,
    })),
    yScale: (value) => yScale(value),
    yRange: [innerHeight, 0],
    gridY: yScale.ticks(4).map((value) => yScale(value)),
    yTicks: yScale.ticks(5).map((value) => ({
      y: yScale(value),
      label: formatCount(Math.abs(value)),
    })),
    barWidth,
  };
};

/**
 * Layouts per points array, each remembering the widths it was drawn at: a
 * chart re-renders at one width for as long as nothing resizes it, and the
 * array stays the same object for as long as its section's data and filter
 * do.
 */
const layouts = new WeakMap<
  readonly DivergingPoint[],
  Map<number, DivergingLayout>
>();

/** The layout of `points` at `width`, the same object for the same pair. */
export const divergingLayoutOf = (
  points: readonly DivergingPoint[],
  width: number,
): DivergingLayout => {
  let byWidth = layouts.get(points);
  if (byWidth === undefined) {
    byWidth = new Map();
    layouts.set(points, byWidth);
  }
  let layout = byWidth.get(width);
  if (layout === undefined) {
    // Widths come and go as the window resizes; only the latest few matter.
    if (byWidth.size >= 8) {
      byWidth.clear();
    }
    layout = computeLayout(points, width);
    byWidth.set(width, layout);
  }
  return layout;
};

/** The index of the point whose bar is nearest to `x` (px into the plot). */
export const nearestIndexOf = (layout: DivergingLayout, x: number): number => {
  let nearest = 0;
  let nearestDistance = Infinity;
  for (const [index, dateMs] of layout.dates.entries()) {
    const distance = Math.abs(layout.xScale(dateMs) - x);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = index;
    }
  }
  return nearest;
};
