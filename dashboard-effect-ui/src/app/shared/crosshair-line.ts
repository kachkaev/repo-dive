import type { Html } from "@effect/ui/html";

/**
 * The dashed cursor line every time chart shares. Drawn as its own 1px-wide
 * overlay next to the chart's `<svg>` rather than as a `<line>` inside it, and
 * moved with a transform on its own compositor layer (`will-change-transform`):
 * a line inside the chart would invalidate the layer holding the marks, and the
 * browser then re-rasterizes every path under the damaged tiles on each mouse
 * move — with a dense per-commit series that is megabytes of path data, and the
 * card lags behind the cursor however little the view itself changes. On a
 * separate layer the move is compositor-only and the marks stay cached.
 *
 * Takes the x scale as a plain function, so this file needs no d3 types.
 */
export const CrosshairLine = <M>(
  h: Html.H<M>,
  options: {
    readonly xScale: (valueMs: number) => number;
    readonly valueMs: number;
    /** The plot area's offset within the positioned chart container. */
    readonly left: number;
    readonly top: number;
    readonly height: number;
  },
) => {
  // Snapped to whole pixels: a fractional translate would smear the 1px dashes
  // across two columns, and half a pixel is well below what a cursor resolves.
  const x = options.left + Math.round(options.xScale(options.valueMs));
  return h.svg
    .attrs({
      "aria-hidden": "true",
      width: "1",
      height: String(options.height),
    })
    .class("pointer-events-none absolute will-change-transform")
    .style({
      left: "0px",
      top: `${options.top}px`,
      transform: `translateX(${x}px)`,
    })
    .children(
      h.line.attrs({
        x1: "0.5",
        x2: "0.5",
        y1: "0",
        y2: String(options.height),
        stroke: "var(--text-muted)",
        "stroke-width": "1",
        "stroke-dasharray": "3,3",
      }),
    );
};
