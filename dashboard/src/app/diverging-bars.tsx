import { AxisBottom, AxisLeft } from "@visx/axis";
import { GridRows } from "@visx/grid";
import { Group } from "@visx/group";
import { scaleLinear, scaleTime } from "@visx/scale";
import { useId, useState } from "react";

import { barPath } from "./shared/bar-path.ts";
import { CrosshairLine } from "./shared/crosshair-line.tsx";
import { formatCount, formatMonth } from "./shared/format.ts";
import { Legend, Swatch } from "./shared/primitives.tsx";
import { monthBucketMs, timeAxisTicks } from "./shared/time-axis.ts";
import { useMeasuredWidth } from "./shared/use-measure.ts";

const margin = { top: 8, right: 12, bottom: 24, left: 52 };
const height = 240;

type TimeScale = ReturnType<typeof scaleTime<number>>;
type LinearScale = ReturnType<typeof scaleLinear<number>>;

type DivergingPoint = {
  month: string;
  positive: number;
  negative: number;
  /** A sub-part of `positive`, drawn as a hatched band from the baseline up. */
  positiveSecondary?: number;
};

/**
 * The bars, grid and baseline. Split out so none of its props depend on the
 * cursor: React Compiler then reuses the element on every mouse move, which
 * only updates the crosshair and card (see the editing-react skill).
 */
function DivergingMarks({
  points,
  dates,
  xScale,
  yScale,
  innerWidth,
  barWidth,
  hatchFill,
}: {
  points: DivergingPoint[];
  dates: number[];
  xScale: TimeScale;
  yScale: LinearScale;
  innerWidth: number;
  barWidth: number;
  /** `url(#…)` of the hatch pattern, when the secondary band is drawn. */
  hatchFill: string | undefined;
}) {
  const zero = yScale(0);
  return (
    <>
      <GridRows
        scale={yScale}
        width={innerWidth}
        numTicks={4}
        stroke="var(--grid-line)"
      />
      {points.map((point, index) => {
        const x = xScale(dates[index] ?? 0) - barWidth / 2;
        const positiveTop = yScale(point.positive);
        const secondary = point.positiveSecondary ?? 0;
        const secondaryTop = yScale(secondary);
        return (
          <g key={point.month}>
            <path
              d={barPath({
                x,
                y: positiveTop,
                width: barWidth,
                height: Math.max(0, zero - positiveTop),
                roundTop: true,
                roundBottom: true,
              })}
              fill="var(--diverge-pos)"
            />
            {hatchFill !== undefined && secondary > 0 && (
              // The assisted share of "added", anchored to the baseline. Its
              // top is a seam inside the bar unless it fills the whole bar.
              <path
                d={barPath({
                  x,
                  y: secondaryTop,
                  width: barWidth,
                  height: Math.max(0, zero - secondaryTop),
                  roundTop: secondary >= point.positive,
                  roundBottom: true,
                })}
                fill={hatchFill}
              />
            )}
            <path
              d={barPath({
                x,
                y: zero,
                width: barWidth,
                height: Math.max(0, yScale(-point.negative) - zero),
                roundTop: true,
                roundBottom: true,
              })}
              fill="var(--diverge-neg)"
            />
          </g>
        );
      })}
      {/* Drawn over the bars like the other charts' x axis, in the same
          recessive stroke. */}
      <line
        x1={0}
        x2={innerWidth}
        y1={zero}
        y2={zero}
        stroke="var(--grid-line)"
        strokeWidth={1}
      />
    </>
  );
}

/**
 * The value card beside the crosshair, laid out like the stacked charts' card:
 * one swatch row per series. Its own component so the `xScale` call that
 * positions it runs on frozen props (see {@link CrosshairLine}).
 */
function HoverCard({
  point,
  dateMs,
  xScale,
  width,
  rows,
}: {
  point: DivergingPoint;
  dateMs: number;
  xScale: TimeScale;
  width: number;
  rows: Array<{ label: string; color: string; hatch?: string; value: string }>;
}) {
  // Left of the dashed line so it never covers the hovered bar; only when the
  // line is too close to the chart's start to fit the card's estimated width
  // does it flip to the right side. The estimate only picks the side — the
  // left placement anchors the card's right edge (via `right`), so the gap to
  // the line stays 10px whatever the card's true width.
  const cardWidth = 180;
  const crosshairX = margin.left + xScale(dateMs);
  const fitsLeftOfLine = crosshairX >= 10 + cardWidth;
  return (
    <div
      className="pointer-events-none absolute top-2 z-10 rounded-md border border-(--grid-line) bg-(--surface-2) px-2.5 py-1.5 text-xs shadow-sm will-change-transform"
      style={
        fitsLeftOfLine
          ? { right: width - crosshairX + 10 }
          : { left: Math.min(crosshairX + 10, Math.max(0, width - cardWidth)) }
      }
    >
      <div className="mb-1 font-medium tabular-nums text-(--text-secondary)">
        {formatMonth(point.month)}
      </div>
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-1.5">
          <Swatch
            color={row.color}
            hatch={row.hatch}
            className="inline-block size-2 rounded-xs"
          />
          <span className="text-(--text-secondary)">{row.label}</span>
          <span className="ml-auto pl-3 font-medium tabular-nums">
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/** A card value with its direction sign; a zero stays unsigned. */
function signedCount(sign: "+" | "−", value: number): string {
  return value === 0 ? "0" : `${sign}${formatCount(value)}`;
}

/** Monthly added lines above the baseline, deleted lines below it. */
export function DivergingBars({
  points,
  positiveLabel,
  negativeLabel,
  positiveSecondaryLabel,
  positiveSecondaryHatch,
}: {
  points: DivergingPoint[];
  positiveLabel: string;
  negativeLabel: string;
  /** Legend/tooltip label for the hatched `positiveSecondary` band. */
  positiveSecondaryLabel?: string | undefined;
  /** Hatch color for the `positiveSecondary` band (e.g. the AI kind color). */
  positiveSecondaryHatch?: string | undefined;
}) {
  const [containerRef, width] = useMeasuredWidth<HTMLDivElement>();
  const [hoverIndex, setHoverIndex] = useState<number | undefined>();
  const hatchId = useId();

  if (points.length === 0) {
    return (
      <p className="text-sm text-(--text-muted)">No data collected yet.</p>
    );
  }

  const showSecondary =
    positiveSecondaryLabel !== undefined &&
    positiveSecondaryHatch !== undefined &&
    points.some((point) => (point.positiveSecondary ?? 0) > 0);

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
  const xScale = scaleTime({
    domain: [xMin, xMax],
    range: [xInset, innerWidth - xInset],
  });
  const xTicks = timeAxisTicks({
    startMs: xMin,
    endMs: xMax,
    pointUnit: "month",
    widthPx: innerWidth,
  });
  // Mapped here, not inline in the JSX, to keep it out of the hover scope (see
  // the same line in TimeSeriesChart).
  const xTickValues = xTicks.map((tick) => tick.valueMs);

  const maxPositive = Math.max(1, ...points.map((point) => point.positive));
  const maxNegative = Math.max(1, ...points.map((point) => point.negative));
  const yScale = scaleLinear({
    domain: [-maxNegative * 1.05, maxPositive * 1.05],
    range: [innerHeight, 0],
    nice: true,
  });

  const barWidth = Math.max(
    1,
    Math.min(18, (innerWidth / Math.max(1, points.length)) * 0.7),
  );

  const legendItems = [
    { label: positiveLabel, color: "var(--diverge-pos)" },
    ...(showSecondary
      ? [
          {
            label: positiveSecondaryLabel,
            color: "var(--diverge-pos)",
            hatch: positiveSecondaryHatch,
          },
        ]
      : []),
    { label: negativeLabel, color: "var(--diverge-neg)" },
  ];

  const hovered = hoverIndex === undefined ? undefined : points[hoverIndex];
  const hoveredMs = hoverIndex === undefined ? undefined : dates[hoverIndex];
  // The card lists every legend row in legend order, zeros included — like the
  // stacked cards with up to three series — so it keeps its shape while the
  // cursor scrubs across months with and without an assisted share.
  const hoverRows =
    hovered === undefined
      ? []
      : [
          {
            label: positiveLabel,
            color: "var(--diverge-pos)",
            value: signedCount("+", hovered.positive),
          },
          ...(showSecondary
            ? [
                {
                  label: positiveSecondaryLabel,
                  color: "var(--diverge-pos)",
                  hatch: positiveSecondaryHatch,
                  value: signedCount("+", hovered.positiveSecondary ?? 0),
                },
              ]
            : []),
          {
            label: negativeLabel,
            color: "var(--diverge-neg)",
            value: signedCount("−", hovered.negative),
          },
        ];

  return (
    <div>
      <div ref={containerRef} className="relative">
        <svg width={width} height={height} role="img">
          {showSecondary && (
            <defs>
              {/* Assist hatch: 2px lines at a 6px pitch — 2/3 base fill, 1/3 helper. */}
              <pattern
                id={hatchId}
                width={6}
                height={6}
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width={2} height={6} fill={positiveSecondaryHatch} />
              </pattern>
            </defs>
          )}
          <Group left={margin.left} top={margin.top}>
            <DivergingMarks
              points={points}
              dates={dates}
              xScale={xScale}
              yScale={yScale}
              innerWidth={innerWidth}
              barWidth={barWidth}
              hatchFill={showSecondary ? `url(#${hatchId})` : undefined}
            />
            <AxisLeft
              scale={yScale}
              numTicks={5}
              hideTicks
              stroke="var(--grid-line)"
              tickFormat={(value) => formatCount(Math.abs(Number(value)))}
              tickLabelProps={() => ({
                fill: "var(--text-muted)",
                fontSize: 10,
                fontFamily: "inherit",
                dx: -4,
                textAnchor: "end" as const,
                verticalAnchor: "middle" as const,
              })}
            />
            <AxisBottom
              top={innerHeight}
              scale={xScale}
              // The axis line spans the scale's range, which `xInset` shrinks;
              // pad it back out so the line runs the full plot width.
              rangePadding={xInset}
              tickValues={xTickValues}
              tickFormat={(_, index) => xTicks[index]?.label}
              hideTicks
              stroke="var(--grid-line)"
              tickLabelProps={() => ({
                fill: "var(--text-muted)",
                fontSize: 10,
                fontFamily: "inherit",
                textAnchor: "middle" as const,
              })}
            />
            <rect
              width={innerWidth}
              height={innerHeight}
              fill="transparent"
              onMouseMove={(event) => {
                const bounds = event.currentTarget.getBoundingClientRect();
                const x = event.clientX - bounds.left;
                let nearest = 0;
                let nearestDistance = Infinity;
                for (const [index, dateMs] of dates.entries()) {
                  const distance = Math.abs(xScale(dateMs) - x);
                  if (distance < nearestDistance) {
                    nearestDistance = distance;
                    nearest = index;
                  }
                }
                setHoverIndex(nearest);
              }}
              onMouseLeave={() => {
                setHoverIndex(undefined);
              }}
            />
          </Group>
        </svg>
        {/* Over the chart, under the card — both outside the <svg>, see CrosshairLine. */}
        {hoveredMs !== undefined && (
          <CrosshairLine
            xScale={xScale}
            valueMs={hoveredMs}
            left={margin.left}
            top={margin.top}
            height={innerHeight}
          />
        )}
        {hovered !== undefined && hoveredMs !== undefined && (
          <HoverCard
            point={hovered}
            dateMs={hoveredMs}
            xScale={xScale}
            width={width}
            rows={hoverRows}
          />
        )}
      </div>
      <Legend items={legendItems} />
    </div>
  );
}
