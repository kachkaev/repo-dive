/**
 * visx's GridRows, AxisLeft and AxisBottom re-implemented as view functions
 * over a chart's {@link ChartLayout}, writing the elements, classes and
 * attributes visx renders for the React chart's props — so the two dashboards
 * draw the same SVG. Each is a pure function of the layout, built through
 * `h.lazy` by the chart, so a hover reuses it untouched.
 */
import type { Html } from "@effect/ui/html";

import { formatCount } from "../shared/format.ts";
import { type ChartLayout, innerHeight } from "./geometry.ts";

/** What visx's `<Line>` writes. */
const VisxLine = <M>(
  h: Html.H<M>,
  options: {
    readonly className: string;
    readonly x1: number;
    readonly y1: number;
    readonly x2: number;
    readonly y2: number;
  },
) =>
  h.line.class(options.className).attrs({
    x1: String(options.x1),
    y1: String(options.y1),
    x2: String(options.x2),
    y2: String(options.y2),
    fill: "transparent",
    "shape-rendering": "crispEdges",
    stroke: "var(--grid-line)",
    "stroke-width": "1",
  });

/**
 * What visx's `<Text>` writes for a one-line tick label: an overflowing
 * `<svg>` shifted by `dx`, holding the `<text>` and its one `<tspan>`.
 */
const TickLabel = <M>(
  h: Html.H<M>,
  options: {
    readonly x: number;
    readonly y: number;
    readonly dx: number;
    /** The `<tspan>`'s `dy`, which is how visx anchors a label vertically. */
    readonly dy: string;
    readonly textAnchor: "end" | "middle";
    readonly label: string;
  },
) =>
  h.g
    .class("visx-group visx-axis-tick")
    .attr("transform", "translate(0, 0)")
    .children(
      h.svg
        .attrs({
          x: String(options.dx),
          y: "0",
          "font-size": "10",
        })
        .style({ overflow: "visible" })
        .children(
          h.svgText
            .attrs({
              transform: "",
              x: String(options.x),
              y: String(options.y),
              fill: "var(--text-muted)",
              "font-size": "10",
              "font-family": "inherit",
              "text-anchor": options.textAnchor,
            })
            .children(
              h.tspan
                .attrs({ x: String(options.x), dy: options.dy })
                .children(options.label),
            ),
        ),
    );

/** The horizontal grid lines, under the marks. */
export const GridRows = <M>(h: Html.H<M>, layout: ChartLayout) =>
  h.g
    .class("visx-group visx-rows")
    .attr("transform", "translate(0, 0)")
    .children(
      layout.gridTicks.map((tick) => {
        const y = layout.yScale(tick);
        return VisxLine(h, {
          className: "visx-line",
          x1: 0,
          y1: y,
          x2: layout.innerWidth,
          y2: y,
        });
      }),
    );

/** visx's tick length: labels sit this far from the axis line. */
const tickLength = 8;

/** The value axis: counts, or whole percentages in % mode. */
export const AxisLeft = <M>(h: Html.H<M>, layout: ChartLayout) => {
  const [rangeStart = 0, rangeEnd = 0] = layout.yScale.range();
  return h.g
    .class("visx-group visx-axis visx-axis-left")
    .attr("transform", "translate(0, 0)")
    .children(
      layout.yTicks.map((tick) =>
        TickLabel(h, {
          x: -tickLength,
          y: layout.yScale(tick),
          dx: -4,
          // visx's `verticalAnchor: "middle"`: half its 0.71em cap height.
          dy: "0.355em",
          textAnchor: "end",
          label: layout.showPercent
            ? `${Math.round(tick * 100)}%`
            : formatCount(tick),
        }),
      ),
      VisxLine(h, {
        className: "visx-line visx-axis-line",
        x1: 0,
        y1: rangeStart + 0.5,
        x2: 0,
        y2: rangeEnd + 0.5,
      }),
    );
};

/**
 * The time axis, at the calendar ticks `timeAxisTicks` picked. The axis line
 * spans the scale's range, which `xInset` shrinks for bars; it is padded back
 * out (visx's `rangePadding`) so the line runs the full plot width rather
 * than relying on the zero grid line to cover the gap.
 */
export const AxisBottom = <M>(h: Html.H<M>, layout: ChartLayout) => {
  const [rangeStart = 0, rangeEnd = 0] = layout.xScale.range();
  return h.g
    .class("visx-group visx-axis visx-axis-bottom")
    .attr("transform", `translate(0, ${innerHeight})`)
    .children(
      layout.xTicks.map((tick) =>
        TickLabel(h, {
          x: layout.xScale(tick.valueMs),
          // Below the tick's end, by the label's 10px font size.
          y: tickLength + 10,
          dx: 0,
          dy: "0em",
          textAnchor: "middle",
          label: tick.label,
        }),
      ),
      VisxLine(h, {
        className: "visx-line visx-axis-line",
        x1: rangeStart + 0.5 - layout.xInset,
        y1: 0,
        x2: rangeEnd + 0.5 + layout.xInset,
        y2: 0,
      }),
    );
};
