/**
 * The visx grid and axes the React DivergingBars draws (`GridRows`,
 * `AxisLeft`, `AxisBottom`), re-implemented as view functions over the
 * scales' ticks. Each writes the markup visx renders for the props
 * diverging-bars.tsx passes — the same groups, classes, the `<svg>` wrapper
 * visx's `Text` puts around every label, and its `dy` — so the pixels match.
 */
import type { Html } from "@effect/ui/html";

/** The stroke the React chart gives its grid and axis lines. */
const lineStroke = "var(--grid-line)";

/** A visx `Line`: a 1px crisp line with the class visx gives it. */
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
    stroke: lineStroke,
    "stroke-width": "1",
  });

/**
 * One tick label as visx's `Text` draws it: an overflowing `<svg>` that
 * carries the `dx` offset, around a `<text>` with a single `<tspan>`.
 */
const TickLabel = <M>(
  h: Html.H<M>,
  options: {
    readonly x: number;
    readonly y: number;
    readonly dx: number;
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
        .attrs({ x: String(options.dx), y: "0", "font-size": "10" })
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

/** visx `GridRows`: a horizontal line across the plot at each y tick. */
export const GridRows = <M>(
  h: Html.H<M>,
  options: { readonly ticksY: readonly number[]; readonly width: number },
) =>
  h.g
    .class("visx-group visx-rows")
    .attr("transform", "translate(0, 0)")
    .children(
      options.ticksY.map((y) =>
        VisxLine(h, {
          className: "visx-line",
          x1: 0,
          y1: y,
          x2: options.width,
          y2: y,
        }),
      ),
    );

/**
 * visx `AxisLeft` with `hideTicks`: labels 8px (the hidden tick's length)
 * plus `dx: -4` left of the axis, vertically centred on their value.
 */
export const AxisLeft = <M>(
  h: Html.H<M>,
  options: {
    readonly ticks: ReadonlyArray<{
      readonly y: number;
      readonly label: string;
    }>;
    /** The scale's range, bottom then top. */
    readonly range: readonly [number, number];
  },
) =>
  h.g
    .class("visx-group visx-axis visx-axis-left")
    .attr("transform", "translate(0, 0)")
    .children(
      options.ticks.map((tick) =>
        TickLabel(h, {
          x: -8,
          y: tick.y,
          dx: -4,
          dy: "0.355em",
          textAnchor: "end",
          label: tick.label,
        }),
      ),
      VisxLine(h, {
        className: "visx-line visx-axis-line",
        x1: 0,
        y1: options.range[0] + 0.5,
        x2: 0,
        y2: options.range[1] + 0.5,
      }),
    );

/**
 * visx `AxisBottom` with `hideTicks`: labels centred under their value, one
 * hidden tick (8px) plus the 10px font size below the axis. `rangePadding`
 * stretches the axis line past the scale's range on both ends.
 */
export const AxisBottom = <M>(
  h: Html.H<M>,
  options: {
    readonly top: number;
    readonly ticks: ReadonlyArray<{
      readonly x: number;
      readonly label: string;
    }>;
    /** The scale's range, left then right. */
    readonly range: readonly [number, number];
    readonly rangePadding: number;
  },
) =>
  h.g
    .class("visx-group visx-axis visx-axis-bottom")
    .attr("transform", `translate(0, ${options.top})`)
    .children(
      options.ticks.map((tick) =>
        TickLabel(h, {
          x: tick.x,
          y: 18,
          dx: 0,
          dy: "0em",
          textAnchor: "middle",
          label: tick.label,
        }),
      ),
      VisxLine(h, {
        className: "visx-line visx-axis-line",
        x1: options.range[0] + 0.5 - options.rangePadding,
        y1: 0,
        x2: options.range[1] + 0.5 + options.rangePadding,
        y2: 0,
      }),
    );
