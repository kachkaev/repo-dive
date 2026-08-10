import { AxisBottom, AxisLeft } from "@visx/axis";
import { GridRows } from "@visx/grid";
import { Group } from "@visx/group";
import { scaleLinear, scaleTime } from "@visx/scale";
import { useId, useState } from "react";

import { formatCount, formatMonth } from "./shared/format.ts";
import { Legend } from "./shared/primitives.tsx";
import { useMeasuredWidth } from "./shared/use-measure.ts";

const margin = { top: 8, right: 12, bottom: 24, left: 52 };
const height = 240;

/** Monthly added lines above the baseline, deleted lines below it. */
export function DivergingBars({
  points,
  positiveLabel,
  negativeLabel,
  positiveSecondaryLabel,
  positiveSecondaryHatch,
}: {
  points: Array<{
    month: string;
    positive: number;
    negative: number;
    /** A sub-part of `positive`, drawn as a hatched band from the baseline up. */
    positiveSecondary?: number;
  }>;
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
  const showSecondary =
    positiveSecondaryLabel !== undefined &&
    positiveSecondaryHatch !== undefined &&
    points.some((point) => (point.positiveSecondary ?? 0) > 0);

  const innerWidth = Math.max(10, width - margin.left - margin.right);
  const innerHeight = height - margin.top - margin.bottom;

  const dates = points.map((point) => new Date(`${point.month}-15`).getTime());

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

  const maxPositive = Math.max(1, ...points.map((point) => point.positive));
  const maxNegative = Math.max(1, ...points.map((point) => point.negative));
  const yScale = scaleLinear({
    domain: [-maxNegative * 1.05, maxPositive * 1.05],
    range: [innerHeight, 0],
    nice: true,
  });

  if (points.length === 0) {
    return (
      <p className="text-sm text-(--text-muted)">No data collected yet.</p>
    );
  }

  const barWidth = Math.max(
    1,
    Math.min(18, (innerWidth / Math.max(1, points.length)) * 0.7),
  );
  const hovered = hoverIndex === undefined ? undefined : points[hoverIndex];
  // Hover card position: left of the hovered bar so it never covers it; only
  // when the bar is too close to the chart's start to fit the card's estimated
  // width does it flip to the right side. The estimate only picks the side —
  // the left placement anchors the card's right edge (via `right`), so the gap
  // to the bar stays 10px whatever the card's true width.
  const hoverBarX =
    hoverIndex === undefined ? 0 : margin.left + xScale(dates[hoverIndex] ?? 0);
  const cardPosition =
    hoverBarX - 10 - 170 >= 0
      ? { right: width - hoverBarX + 10 }
      : { left: Math.min(hoverBarX + 10, Math.max(0, width - 170)) };

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
            <GridRows
              scale={yScale}
              width={innerWidth}
              numTicks={4}
              stroke="var(--grid-line)"
            />
            {points.map((point, index) => {
              const x = xScale(dates[index] ?? 0) - barWidth / 2;
              const zero = yScale(0);
              return (
                <g
                  key={point.month}
                  opacity={
                    hoverIndex === undefined || hoverIndex === index ? 1 : 0.45
                  }
                >
                  <rect
                    x={x}
                    y={yScale(point.positive)}
                    width={barWidth}
                    height={Math.max(0, zero - yScale(point.positive))}
                    fill="var(--diverge-pos)"
                    rx={1}
                  />
                  {showSecondary && (point.positiveSecondary ?? 0) > 0 && (
                    // The assisted share of "added", anchored to the baseline.
                    <rect
                      x={x}
                      y={yScale(point.positiveSecondary ?? 0)}
                      width={barWidth}
                      height={Math.max(
                        0,
                        zero - yScale(point.positiveSecondary ?? 0),
                      )}
                      fill={`url(#${hatchId})`}
                      rx={1}
                    />
                  )}
                  <rect
                    x={x}
                    y={zero}
                    width={barWidth}
                    height={Math.max(0, yScale(-point.negative) - zero)}
                    fill="var(--diverge-neg)"
                    rx={1}
                  />
                </g>
              );
            })}
            <line
              x1={0}
              x2={innerWidth}
              y1={yScale(0)}
              y2={yScale(0)}
              stroke="var(--text-muted)"
              strokeWidth={1}
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
              numTicks={Math.min(8, Math.floor(innerWidth / 90))}
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
                let nearestDistance = Number.POSITIVE_INFINITY;
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
        {hovered !== undefined && hoverIndex !== undefined && (
          <div
            className="pointer-events-none absolute top-2 z-10 rounded-md border border-(--grid-line) bg-(--surface-2) px-2.5 py-1.5 text-xs shadow-sm"
            style={cardPosition}
          >
            <div className="mb-1 font-medium tabular-nums text-(--text-secondary)">
              {formatMonth(hovered.month)}
            </div>
            <div>
              {positiveLabel}:{" "}
              <span className="font-medium tabular-nums">
                +{formatCount(hovered.positive)}
              </span>
            </div>
            {showSecondary && (hovered.positiveSecondary ?? 0) > 0 && (
              <div>
                {positiveSecondaryLabel}:{" "}
                <span className="font-medium tabular-nums">
                  +{formatCount(hovered.positiveSecondary ?? 0)}
                </span>
              </div>
            )}
            <div>
              {negativeLabel}:{" "}
              <span className="font-medium tabular-nums">
                −{formatCount(hovered.negative)}
              </span>
            </div>
          </div>
        )}
      </div>
      <Legend
        items={[
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
        ]}
      />
    </div>
  );
}
