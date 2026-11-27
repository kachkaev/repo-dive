// cspell:ignore linepath -- the class visx gives its LinePath
import type { Html } from "@effect/ui/html";
import { area, curveMonotoneX, line, type SeriesPoint, stack } from "d3-shape";

import { barPath } from "../shared/bar-path.ts";
import { GridRows } from "./axes.ts";
import type { ChartLayout, ChartRow } from "./geometry.ts";
import type { ChartMode } from "./schemas.ts";

/** Everything the marks are drawn from; none of it follows the cursor. */
export type ChartMarksInput = {
  readonly mode: ChartMode;
  readonly layout: ChartLayout;
  /** Raw values, or shares in % mode. */
  readonly displayRows: readonly ChartRow[];
  /** Raw values, which lines are drawn from. */
  readonly rows: readonly ChartRow[];
  /** Every series, in stack order — what `colors` is indexed by. */
  readonly seriesKeys: readonly string[];
  /** The subset of `seriesKeys` actually drawn, in the same order. */
  readonly drawnKeys: readonly string[];
  readonly colors: readonly string[];
  readonly separateGroups: boolean;
  readonly groupBoundaryKeys: ReadonlySet<string>;
  /** Series key → hatch color, and the distinct colors' pattern order. */
  readonly seriesHatch: Readonly<Record<string, string>>;
  readonly hatchColors: readonly string[];
  /** What the hatch `<pattern>` ids start with. */
  readonly hatchIdBase: string;
};

const dateOf = (row: ChartRow): number => row["dateMs"] ?? 0;

/**
 * The static marks — grid, stacked areas/bars/lines and single-point dots,
 * the React `ChartMarks`. The chart builds them through `h.lazy` with
 * {@link ChartMarksInput} memoized per input, so moving the mouse (which only
 * updates the crosshair and tooltip) reuses this node and skips its patch.
 *
 * A `<g>` holds what the React component returns as a fragment: a view
 * returns one node. It carries no attributes, so nothing moves.
 */
export const ChartMarks = <M>(h: Html.H<M>, input: ChartMarksInput) => {
  const { mode, layout, displayRows, rows, drawnKeys, seriesKeys, colors } =
    input;
  const { xScale, yScale } = layout;
  const colorOf = (key: string) => colors[seriesKeys.indexOf(key)];
  const hatchUrlOf = (key: string): string | undefined => {
    const hatchColor = input.seriesHatch[key];
    return hatchColor === undefined
      ? undefined
      : `url(#${input.hatchIdBase}-${input.hatchColors.indexOf(hatchColor)})`;
  };
  // visx's AreaStack and BarStack: d3's stack with its default order and
  // offset, over the drawn keys.
  const stacks =
    mode === "line" ? [] : stack<ChartRow>().keys(drawnKeys)(displayRows);

  const marks = () => {
    switch (mode) {
      case "area": {
        const path = area<SeriesPoint<ChartRow>>()
          .x((datum) => xScale(dateOf(datum.data)))
          .y0((datum) => yScale(datum[0]))
          .y1((datum) => yScale(datum[1]))
          .curve(curveMonotoneX);
        const boundary = line<SeriesPoint<ChartRow>>()
          .x((point) => xScale(dateOf(point.data)))
          .y((point) => yScale(point[1]))
          .curve(curveMonotoneX);
        return [
          ...stacks.map((series) => {
            const d = path(series) ?? "";
            const hatchUrl = hatchUrlOf(series.key);
            return h.g.key(series.key).children(
              h.path.attrs({
                d,
                fill: colorOf(series.key),
                stroke: "var(--surface-1)",
                "stroke-width": input.separateGroups ? "0.5" : "1",
                "stroke-opacity": input.separateGroups ? "0.35" : "1",
              }),
              hatchUrl !== undefined && h.path.attrs({ d, fill: hatchUrl }),
            );
          }),
          ...stacks
            .filter((series) => input.groupBoundaryKeys.has(series.key))
            .map((series) =>
              h.path
                .key(`boundary-${series.key}`)
                .class("visx-linepath")
                .attrs({
                  d: boundary(series) ?? "",
                  fill: "transparent",
                  "stroke-linecap": "round",
                  stroke: "var(--surface-1)",
                  "stroke-width": "1",
                }),
            ),
        ];
      }
      case "bar": {
        // Per data point, the stack index of its lowest and highest non-empty
        // segment — the only two whose outer end is rounded, so the seams
        // inside a stack stay square and it reads as one bar.
        const [rangeStart = 0, rangeEnd = 0] = xScale.range();
        // visx's bandwidth of a continuous scale (range over domain size),
        // which it centres each bar on and the chart then re-centres; kept so
        // the coordinates come out to the same floating-point digits.
        const bandwidth = Math.abs(rangeEnd - rangeStart) / 2;
        const bars = stacks.map((series, stackIndex) =>
          series.map((point, index) => ({
            stackIndex,
            index,
            key: series.key,
            x: Math.max((xScale(dateOf(point.data)) || 0) - bandwidth / 2) || 0,
            y: yScale(point[1]) || 0,
            height: (yScale(point[0]) || 0) - (yScale(point[1]) || 0),
          })),
        );
        const lowestStack = new Map<number, number>();
        const highestStack = new Map<number, number>();
        for (const stackBars of bars) {
          for (const bar of stackBars) {
            if (bar.height <= 0) {
              continue;
            }
            if (!lowestStack.has(bar.index)) {
              lowestStack.set(bar.index, bar.stackIndex);
            }
            highestStack.set(bar.index, bar.stackIndex);
          }
        }
        return bars.flatMap((stackBars) =>
          stackBars
            .filter((bar) => bar.height > 0)
            .map((bar) => {
              const d = barPath({
                x: bar.x + bandwidth / 2 - layout.barWidth / 2,
                y: bar.y,
                width: layout.barWidth,
                height: bar.height,
                roundTop: highestStack.get(bar.index) === bar.stackIndex,
                roundBottom: lowestStack.get(bar.index) === bar.stackIndex,
              });
              const hatchUrl = hatchUrlOf(bar.key);
              // No stroke: segment boundaries come from hue/hatch changes,
              // so stacked heights read as exact totals (and match the
              // gapless churn bars).
              return h.g
                .key(`${bar.stackIndex}-${bar.index}`)
                .children(
                  h.path.attrs({ d, fill: colorOf(bar.key) }),
                  hatchUrl !== undefined && h.path.attrs({ d, fill: hatchUrl }),
                );
            }),
        );
      }
      case "line": {
        return drawnKeys.map((key) =>
          h.path
            .key(key)
            .class("visx-linepath")
            .attrs({
              d:
                line<ChartRow>()
                  .x((datum) => xScale(dateOf(datum)))
                  .y((datum) => yScale(datum[key] ?? 0))
                  .curve(curveMonotoneX)(rows) ?? "",
              fill: "transparent",
              "stroke-linecap": "round",
              stroke: colorOf(key),
              "stroke-width": "2",
            }),
        );
      }
    }
  };

  // A single snapshot can't draw an area/line — show dot markers.
  const firstRow = displayRows[0];
  const dots =
    mode !== "bar" && firstRow !== undefined && rows.length === 1
      ? drawnKeys.map((key, index) => {
          let stackBase = 0;
          if (mode === "area") {
            for (const priorKey of drawnKeys.slice(0, index)) {
              stackBase += firstRow[priorKey] ?? 0;
            }
          }
          const value = (firstRow[key] ?? 0) + stackBase;
          return h.circle.key(`dot-${key}`).attrs({
            cx: String(xScale(dateOf(firstRow))),
            cy: String(yScale(value)),
            r: "4",
            fill: colorOf(key),
            stroke: "var(--surface-1)",
            "stroke-width": "1",
          });
        })
      : [];

  return h.g.children(GridRows(h, layout), marks(), dots);
};
