import { AxisBottom, AxisLeft } from "@visx/axis";
import { curveMonotoneX } from "@visx/curve";
import { GridRows } from "@visx/grid";
import { Group } from "@visx/group";
import { scaleLinear, scaleTime } from "@visx/scale";
import { AreaStack, BarStack, LinePath } from "@visx/shape";
import { bisector } from "d3-array";
import { useMemo, useState } from "react";

import { formatCount, formatDate, formatPercent } from "../format.ts";
import { Legend } from "./primitives.tsx";
import { useMeasuredWidth } from "./use-measure.ts";

export type TimePoint = {
  dateMs: number;
  values: Record<string, number>;
};

export type LegendItem = { label: string; color: string };

/**
 * Collapses several stacked sub-series (e.g. one contributor's per-year bands)
 * into a single legend + tooltip row summing the listed `keys`.
 */
export type SeriesGroup = { label: string; color: string; keys: string[] };

const margin = { top: 8, right: 12, bottom: 24, left: 44 };
const height = 260;

const axisTickLabelProps = {
  fill: "var(--text-muted)",
  fontSize: 10,
  fontFamily: "inherit",
} as const;

/**
 * Stacked series over time — areas for dense series, bars for monthly buckets,
 * lines for non-stacked comparison. Crosshair tooltip on hover.
 */
export function TimeSeriesChart({
  points,
  seriesKeys,
  colors,
  mode,
  valueFormat = formatCount,
  legendItems,
  tooltipGroups,
  separateGroups,
}: {
  points: TimePoint[];
  seriesKeys: string[];
  colors: string[];
  mode: "area" | "bar" | "line";
  valueFormat?: (value: number) => string;
  /** Overrides the per-series legend — e.g. one swatch per contributor. */
  legendItems?: LegendItem[];
  /** When set, the tooltip sums each group's sub-series into one row. */
  tooltipGroups?: SeriesGroup[];
  /**
   * Area mode only: fade the strokes between a group's stacked sub-series and
   * draw a crisp line only where one `tooltipGroups` group meets the next, so
   * primary categories stay separated while their inner bands blend.
   */
  separateGroups?: boolean;
}) {
  const [containerRef, width] = useMeasuredWidth<HTMLDivElement>();
  const [hoverIndex, setHoverIndex] = useState<number | undefined>();
  const [percentMode, setPercentMode] = useState(false);

  // Lines aren't parts of a whole, and a single series is always 100%.
  const supportsPercent = mode !== "line" && seriesKeys.length > 1;
  const showPercent = supportsPercent && percentMode;

  const rows = useMemo(
    () =>
      points.map((point) => {
        const row: Record<string, number> = { dateMs: point.dateMs };
        for (const key of seriesKeys) {
          row[key] = point.values[key] ?? 0;
        }
        return row;
      }),
    [points, seriesKeys],
  );

  /** Per-row sums across every series — the denominator for shares. */
  const totals = useMemo(
    () =>
      rows.map((row) =>
        seriesKeys.reduce((sum, key) => sum + (row[key] ?? 0), 0),
      ),
    [rows, seriesKeys],
  );

  // What the marks are drawn from: raw values, or per-row shares in % mode.
  // Tooltips always read the raw `rows` so both value and share can be shown.
  const displayRows = useMemo(() => {
    if (!showPercent) {
      return rows;
    }
    return rows.map((row, index) => {
      const total = totals[index] ?? 0;
      const shares: Record<string, number> = { dateMs: row["dateMs"] ?? 0 };
      for (const key of seriesKeys) {
        shares[key] = total === 0 ? 0 : (row[key] ?? 0) / total;
      }
      return shares;
    });
  }, [rows, totals, seriesKeys, showPercent]);

  const innerWidth = Math.max(10, width - margin.left - margin.right);
  const innerHeight = height - margin.top - margin.bottom;

  const xScale = useMemo(() => {
    const dates = rows.map((row) => row["dateMs"] ?? 0);
    let min = Math.min(...dates);
    let max = Math.max(...dates);
    if (min === max) {
      // A single point collapses the time scale; pad it by two weeks.
      min -= 14 * 86_400_000;
      max += 14 * 86_400_000;
    }
    return scaleTime({ domain: [min, max], range: [0, innerWidth] });
  }, [rows, innerWidth]);

  const yMax = useMemo(() => {
    let max = 0;
    for (const row of rows) {
      const total =
        mode === "line"
          ? Math.max(...seriesKeys.map((key) => row[key] ?? 0))
          : seriesKeys.reduce((sum, key) => sum + (row[key] ?? 0), 0);
      max = Math.max(max, total);
    }
    return max || 1;
  }, [rows, seriesKeys, mode]);

  const yScale = useMemo(
    () =>
      showPercent
        ? scaleLinear({ domain: [0, 1], range: [innerHeight, 0] })
        : scaleLinear({
            domain: [0, yMax * 1.05],
            range: [innerHeight, 0],
            nice: true,
          }),
    [yMax, innerHeight, showPercent],
  );

  const bisectDate = useMemo(
    () => bisector<Record<string, number>, number>((row) => row["dateMs"] ?? 0),
    [],
  );

  // The topmost sub-series of every group but the last — where a crisp divider
  // is drawn between adjacent primary categories.
  const groupBoundaryKeys = useMemo(() => {
    const keys = new Set<string>();
    if (!separateGroups || !tooltipGroups) {
      return keys;
    }
    for (const group of tooltipGroups.slice(0, -1)) {
      const top = group.keys.at(-1);
      if (top !== undefined) {
        keys.add(top);
      }
    }
    return keys;
  }, [separateGroups, tooltipGroups]);

  const handleMove = (event: React.MouseEvent<SVGRectElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const dateMs = xScale.invert(x).getTime();
    const index = bisectDate.center(rows, dateMs);
    setHoverIndex(Math.max(0, Math.min(rows.length - 1, index)));
  };

  const hovered = hoverIndex === undefined ? undefined : rows[hoverIndex];
  const hoveredTotal = hoverIndex === undefined ? 0 : (totals[hoverIndex] ?? 0);
  const barWidth = Math.max(
    1,
    Math.min(24, (innerWidth / Math.max(1, rows.length)) * 0.8),
  );

  if (points.length === 0) {
    return (
      <p className="text-sm text-(--text-muted)">No data collected yet.</p>
    );
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <Legend
          items={
            legendItems ??
            seriesKeys.map((key, index) => ({
              label: key,
              color: colors[index] ?? "var(--series-1)",
            }))
          }
        />
        {supportsPercent && (
          <div
            role="group"
            aria-label="Value display"
            className="flex shrink-0 overflow-hidden rounded-md border border-(--grid-line) text-xs"
          >
            {(
              [
                { percent: false, label: "#", title: "Absolute values" },
                { percent: true, label: "%", title: "Share of total" },
              ] as const
            ).map((option) => (
              <button
                key={option.label}
                type="button"
                title={option.title}
                aria-pressed={percentMode === option.percent}
                onClick={() => {
                  setPercentMode(option.percent);
                }}
                className={`px-2 py-0.5 ${
                  percentMode === option.percent
                    ? "bg-(--surface-2) font-medium"
                    : "cursor-pointer text-(--text-muted) hover:text-(--text-secondary)"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div ref={containerRef} className="relative">
        <svg width={width} height={height} role="img">
          <Group left={margin.left} top={margin.top}>
            <GridRows
              scale={yScale}
              width={innerWidth}
              numTicks={4}
              stroke="var(--grid-line)"
            />
            {mode === "area" && (
              <AreaStack
                data={displayRows}
                keys={seriesKeys}
                x={(datum) => xScale(datum.data["dateMs"] ?? 0)}
                y0={(datum) => yScale(datum[0])}
                y1={(datum) => yScale(datum[1])}
                curve={curveMonotoneX}
              >
                {({ stacks, path }) => (
                  <>
                    {stacks.map((stack) => (
                      <path
                        key={stack.key}
                        d={path(stack) ?? ""}
                        fill={colors[seriesKeys.indexOf(stack.key)]}
                        stroke="var(--surface-1)"
                        strokeWidth={separateGroups ? 0.5 : 1}
                        strokeOpacity={separateGroups ? 0.35 : 1}
                      />
                    ))}
                    {stacks
                      .filter((stack) => groupBoundaryKeys.has(stack.key))
                      .map((stack) => (
                        <LinePath
                          key={`boundary-${stack.key}`}
                          data={stack}
                          x={(point) => xScale(point.data["dateMs"] ?? 0)}
                          y={(point) => yScale(point[1])}
                          stroke="var(--surface-1)"
                          strokeWidth={1}
                          curve={curveMonotoneX}
                        />
                      ))}
                  </>
                )}
              </AreaStack>
            )}
            {mode === "bar" && (
              <BarStack
                data={displayRows}
                keys={seriesKeys}
                x={(datum) => datum["dateMs"] ?? 0}
                xScale={xScale}
                yScale={yScale}
                color={(key) => colors[seriesKeys.indexOf(key)] ?? ""}
              >
                {(barStacks) =>
                  barStacks.map((barStack) =>
                    barStack.bars.map((bar) => (
                      <rect
                        key={`${barStack.index}-${bar.index}`}
                        x={bar.x + bar.width / 2 - barWidth / 2}
                        y={bar.y}
                        width={barWidth}
                        height={Math.max(0, bar.height)}
                        fill={bar.color}
                        stroke="var(--surface-1)"
                        strokeWidth={1}
                        rx={1}
                      />
                    )),
                  )
                }
              </BarStack>
            )}
            {mode === "line" &&
              seriesKeys.map((key, index) => (
                <LinePath
                  key={key}
                  data={rows}
                  x={(datum) => xScale(datum["dateMs"] ?? 0)}
                  y={(datum) => yScale(datum[key] ?? 0)}
                  stroke={colors[index]}
                  strokeWidth={2}
                  curve={curveMonotoneX}
                />
              ))}
            {/* A single snapshot can't draw an area/line — show dot markers. */}
            {rows.length === 1 &&
              mode !== "bar" &&
              seriesKeys.map((key, index) => {
                let stackBase = 0;
                if (mode === "area") {
                  for (const priorKey of seriesKeys.slice(0, index)) {
                    stackBase += displayRows[0]?.[priorKey] ?? 0;
                  }
                }
                const value = (displayRows[0]?.[key] ?? 0) + stackBase;
                return (
                  <circle
                    key={key}
                    cx={xScale(displayRows[0]?.["dateMs"] ?? 0)}
                    cy={yScale(value)}
                    r={4}
                    fill={colors[index]}
                    stroke="var(--surface-1)"
                    strokeWidth={1}
                  />
                );
              })}
            {hovered !== undefined && (
              <line
                x1={xScale(hovered["dateMs"] ?? 0)}
                x2={xScale(hovered["dateMs"] ?? 0)}
                y1={0}
                y2={innerHeight}
                stroke="var(--text-muted)"
                strokeWidth={1}
                strokeDasharray="3,3"
                pointerEvents="none"
              />
            )}
            <AxisLeft
              scale={yScale}
              numTicks={4}
              hideTicks
              stroke="var(--grid-line)"
              tickFormat={(value) =>
                showPercent
                  ? `${Math.round(Number(value) * 100)}%`
                  : formatCount(Number(value))
              }
              tickLabelProps={() => ({
                ...axisTickLabelProps,
                dx: -4,
                textAnchor: "end" as const,
                verticalAnchor: "middle" as const,
              })}
            />
            <AxisBottom
              top={innerHeight}
              scale={xScale}
              numTicks={Math.min(8, Math.floor(innerWidth / 90))}
              hideTicks
              stroke="var(--grid-line)"
              tickLabelProps={() => ({
                ...axisTickLabelProps,
                textAnchor: "middle" as const,
              })}
            />
            <rect
              width={innerWidth}
              height={innerHeight}
              fill="transparent"
              onMouseMove={handleMove}
              onMouseLeave={() => {
                setHoverIndex(undefined);
              }}
            />
          </Group>
        </svg>
        {hovered !== undefined && (
          <div
            className="pointer-events-none absolute top-2 z-10 rounded-md border border-(--grid-line) bg-(--surface-2) px-2.5 py-1.5 text-xs shadow-sm"
            style={{
              left: Math.min(
                Math.max(0, margin.left + xScale(hovered["dateMs"] ?? 0) + 10),
                Math.max(0, width - (supportsPercent ? 220 : 180)),
              ),
            }}
          >
            <div className="mb-1 font-medium text-(--text-secondary)">
              {formatDate(new Date(hovered["dateMs"] ?? 0).toISOString())}
            </div>
            {(tooltipGroups
              ? tooltipGroups.map((group) => ({
                  key: group.label,
                  color: group.color,
                  value: group.keys.reduce(
                    (sum, key) => sum + (hovered[key] ?? 0),
                    0,
                  ),
                }))
              : seriesKeys.map((key, index) => ({
                  key,
                  color: colors[index] ?? "var(--series-1)",
                  value: hovered[key] ?? 0,
                }))
            )
              .filter((entry) => entry.value !== 0 || seriesKeys.length <= 3)
              .slice(0, 10)
              .map((entry) => (
                <div key={entry.key} className="flex items-center gap-1.5">
                  <span
                    className="inline-block size-2 rounded-xs"
                    style={{ background: entry.color }}
                  />
                  <span className="text-(--text-secondary)">{entry.key}</span>
                  <span
                    className={`ml-auto pl-3 tabular-nums ${
                      showPercent ? "text-(--text-muted)" : "font-medium"
                    }`}
                  >
                    {valueFormat(entry.value)}
                  </span>
                  {supportsPercent && (
                    <span
                      className={`min-w-9 pl-2 text-right tabular-nums ${
                        showPercent ? "font-medium" : "text-(--text-muted)"
                      }`}
                    >
                      {hoveredTotal === 0
                        ? "—"
                        : formatPercent(entry.value / hoveredTotal)}
                    </span>
                  )}
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
