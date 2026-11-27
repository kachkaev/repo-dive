import {
  type ScaleLinear,
  scaleLinear,
  type ScaleTime,
  scaleTime,
} from "d3-scale";

import { cachedBy } from "../../shared/cached-by.ts";
import {
  type PointUnit,
  timeAxisTicks,
  type TimeTick,
} from "../../shared/time-axis.ts";
import type { ChartMode, TimePoint } from "./schemas.ts";

export const margin = { top: 8, right: 12, bottom: 24, left: 44 } as const;
export const chartHeight = 260;
export const innerHeight = chartHeight - margin.top - margin.bottom;

/**
 * How far an area or line chart's hover reaches past its data: the hover area
 * overhangs the plot's left and right edges by this much, and the cursor still
 * snaps to the first or last point this far outside the data's span. Overshoot
 * the edge a little and the card shows the outermost point, as does an edge a
 * few pixels past a variant whose samples start or end inside an axis widened
 * for its siblings. A genuine gap, wider than this, still reads "No data".
 * Bars need none: the edge bars are centred half a slot inside the plot, and
 * the snap slack already spans that half slot.
 */
const hoverOverhangPx = 4;

/** A point as the marks draw it: `dateMs` plus a value per series key. */
export type ChartRow = Record<string, number>;

/** The chart's points in time order, one value per series key. */
export type ChartRows = {
  readonly seriesKeys: readonly string[];
  readonly rows: readonly ChartRow[];
  /** Per-row sums across every series — the denominator for shares. */
  readonly totals: readonly number[];
};

/**
 * The points as rows, sorted here rather than trusted from the caller:
 * everything downstream — the area paths, the nearest-point search, the
 * first/last row read as the data's span — assumes x increases, and a single
 * point out of order draws as a zigzag instead of failing loudly. `index`
 * writes chronological data, but a dashboard served against a catalog indexed
 * by an older version may not.
 */
export const chartRowsOf = cachedBy(
  (points: readonly TimePoint[], seriesKeys: readonly string[]): ChartRows => {
    const rows = points
      .toSorted((left, right) => left.dateMs - right.dateMs)
      .map((point) => {
        const row: ChartRow = { dateMs: point.dateMs };
        for (const key of seriesKeys) {
          row[key] = point.values[key] ?? 0;
        }
        return row;
      });
    const totals = rows.map((row) =>
      seriesKeys.reduce((sum, key) => sum + (row[key] ?? 0), 0),
    );
    return { seriesKeys, rows, totals };
  },
);

/**
 * What the marks are drawn from: raw values, or per-row shares in % mode.
 * Tooltips always read the raw rows so both value and share can be shown.
 */
export const displayRowsOf = cachedBy(
  (chartRows: ChartRows, showPercent: boolean): readonly ChartRow[] =>
    showPercent
      ? chartRows.rows.map((row, index) => {
          const total = chartRows.totals[index] ?? 0;
          const shares: ChartRow = { dateMs: row["dateMs"] ?? 0 };
          for (const key of chartRows.seriesKeys) {
            shares[key] = total === 0 ? 0 : (row[key] ?? 0) / total;
          }
          return shares;
        })
      : chartRows.rows,
);

/** Scales, ticks and hover bounds of one chart at one width. */
export type ChartLayout = {
  readonly mode: ChartMode;
  readonly width: number;
  readonly innerWidth: number;
  /** Half a bar slot for bars (see {@link chartLayoutOf}), else 0. */
  readonly xInset: number;
  readonly xMin: number;
  readonly xMax: number;
  readonly xScale: ScaleTime<number, number>;
  readonly yScale: ScaleLinear<number, number>;
  readonly showPercent: boolean;
  readonly xTicks: readonly TimeTick[];
  /** The value axis's labelled ticks. */
  readonly yTicks: readonly number[];
  /** The horizontal grid lines' values. */
  readonly gridTicks: readonly number[];
  readonly barWidth: number;
  /** How far the hover rect overhangs the plot on each side. */
  readonly overhangPx: number;
  /** The first and last data points' instants, if any. */
  readonly dataMinMs: number | undefined;
  readonly dataMaxMs: number | undefined;
  /** How far outside the data's span the cursor still snaps to its edge. */
  readonly snapSlackMs: number;
};

export const chartLayoutOf = cachedBy(
  (
    chartRows: ChartRows,
    mode: ChartMode,
    width: number,
    pointUnit: PointUnit,
    showPercent: boolean,
    domainStartMs: number | undefined,
    domainEndMs: number | undefined,
    domainPeak: number | undefined,
  ): ChartLayout => {
    const { rows, seriesKeys } = chartRows;
    const innerWidth = Math.max(10, width - margin.left - margin.right);

    // Bars are centred on their data point, so with points pinned to the
    // chart edges the first and last bars spill out by half a bar. Inset the
    // range by half a bucket slot so every bar sits inside the plot area.
    // Areas and lines want their points on the edges, so they keep the full
    // range.
    const xInset =
      mode === "bar" ? innerWidth / Math.max(1, rows.length) / 2 : 0;

    const xDates = rows.map((row) => row["dateMs"] ?? 0);
    let xMin = Math.min(...xDates);
    let xMax = Math.max(...xDates);
    // Widen (never crop) the domain to any caller-supplied bounds, so a
    // series that begins mid-history is drawn against the repo's full
    // timeline.
    if (domainStartMs !== undefined) {
      xMin = Math.min(xMin, domainStartMs);
    }
    if (domainEndMs !== undefined) {
      xMax = Math.max(xMax, domainEndMs);
    }
    if (xMin === xMax) {
      // A single point collapses the time scale; pad it by two weeks.
      xMin -= 14 * 86_400_000;
      xMax += 14 * 86_400_000;
    }
    const xScale = scaleTime<number, number>()
      .domain([xMin, xMax])
      .range([xInset, innerWidth - xInset]);
    const xTicks = timeAxisTicks({
      startMs: xMin,
      endMs: xMax,
      pointUnit,
      widthPx: innerWidth,
    });

    let yPeak = 0;
    for (const row of rows) {
      const total =
        mode === "line"
          ? Math.max(...seriesKeys.map((key) => row[key] ?? 0))
          : seriesKeys.reduce((sum, key) => sum + (row[key] ?? 0), 0);
      yPeak = Math.max(yPeak, total);
    }
    // Widen (never crop) to a caller-supplied peak, the same way the time
    // domain takes its bounds — so one variant of a chart never rescales
    // away another's.
    if (domainPeak !== undefined) {
      yPeak = Math.max(yPeak, domainPeak);
    }
    const yMax = yPeak || 1;
    const yScale = scaleLinear<number, number>()
      .domain(showPercent ? [0, 1] : [0, yMax * 1.05])
      .range([innerHeight, 0]);
    if (!showPercent) {
      yScale.nice();
    }

    const overhangPx = mode === "bar" ? 0 : hoverOverhangPx;
    return {
      mode,
      width,
      innerWidth,
      xInset,
      xMin,
      xMax,
      xScale,
      yScale,
      showPercent,
      xTicks,
      // Every series here counts something whole, and formatCount rounds —
      // so a fractional step labels two grid lines the same ("0 · 0 · 1 ·
      // 1"). Asking for fewer ticks than the peak keeps the step at a whole
      // number on a chart that never leaves single digits, e.g. a tree
      // holding a single TODO comment (or none).
      yTicks: yScale.ticks(showPercent ? 4 : Math.min(4, Math.ceil(yMax))),
      gridTicks: yScale.ticks(4),
      barWidth: Math.max(
        1,
        Math.min(24, (innerWidth / Math.max(1, rows.length)) * 0.8),
      ),
      overhangPx,
      dataMinMs: rows[0]?.["dateMs"],
      dataMaxMs: rows.at(-1)?.["dateMs"],
      // The outermost bars are centred on the first and last points, so
      // their outer halves hang past the data's span — the half slot that
      // `xInset` reserves. Without the same slack here, those edge pixels
      // sit over a bar yet fall outside the span and read as a gap ("No
      // data"). Lines and areas put their points on the range edges, so
      // `xInset` is 0 for them; their slack is the hover overhang instead
      // (see `hoverOverhangPx`). Half a pixel more absorbs floating-point
      // error at the clamped edge, which a bar chart's slack would otherwise
      // match exactly.
      snapSlackMs:
        ((xInset + overhangPx + 0.5) * (xMax - xMin)) /
        Math.max(1, innerWidth - 2 * xInset),
    };
  },
);

/**
 * The instant under the cursor, `x` px from the hover rect's left edge (which
 * overhangs the plot by `overhangPx`). Clamped to the plot: the overhang
 * reads as its nearest edge, and so does a sub-pixel overshoot of the hit
 * area. Even a fraction of a pixel past the last point used to read as a gap,
 * and at around a day per pixel the card's date could already be the next
 * day. The clamp is the fix, not the overhang: it keeps the cursor inside the
 * axis, which without widening is the data's span (plus the bars' half slot).
 */
export const hoverMsAt = (layout: ChartLayout, x: number): number =>
  layout.xScale
    .invert(Math.min(layout.innerWidth, Math.max(0, x - layout.overhangPx)))
    .getTime();

/**
 * The row nearest to `hoverMs` while it is within the data's own span (plus
 * the snap slack); outside it (e.g. before the first lockfile) there is
 * nothing to snap to, so the crosshair follows the cursor and the tooltip
 * reports "No data".
 */
export const hoverIndexOf = (
  chartRows: ChartRows,
  layout: ChartLayout,
  hoverMs: number,
): number | undefined => {
  const { rows } = chartRows;
  const { dataMinMs, dataMaxMs, snapSlackMs } = layout;
  if (
    dataMinMs === undefined ||
    dataMaxMs === undefined ||
    hoverMs < dataMinMs - snapSlackMs ||
    hoverMs > dataMaxMs + snapSlackMs
  ) {
    return undefined;
  }
  let low = 0;
  let high = rows.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if ((rows[mid]?.["dateMs"] ?? 0) < hoverMs) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  // `low` is the first row at/after the cursor; its predecessor may be nearer.
  const previous = Math.max(0, low - 1);
  const previousMs = rows[previous]?.["dateMs"] ?? -Infinity;
  const nextMs = rows[low]?.["dateMs"] ?? Infinity;
  return hoverMs - previousMs <= nextMs - hoverMs ? previous : low;
};
