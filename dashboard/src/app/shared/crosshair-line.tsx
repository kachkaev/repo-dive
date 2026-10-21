import type { scaleTime } from "@visx/scale";

/**
 * The dashed cursor line every time chart shares. Drawn as its own 1px-wide
 * overlay next to the chart's `<svg>` rather than as a `<line>` inside it, and
 * moved with a transform on its own compositor layer (`will-change-transform`):
 * a line inside the chart would invalidate the layer holding the marks, and the
 * browser then re-rasterizes every path under the damaged tiles on each mouse
 * move — with a dense per-commit series that is megabytes of path data, and the
 * card lags behind the cursor although React itself re-renders almost nothing.
 * On a separate layer the move is compositor-only and the marks stay cached.
 *
 * A component (rather than an `xScale(…)` call in the chart body) so the chart
 * never calls its scale with a hover-reactive argument: React Compiler cannot
 * know a d3 scale function is pure, so such a call would extend the scale's
 * mutable range into the hover scope, fusing every derived value — including
 * the marks' props — into one memo block that recomputes on each mouse move.
 * Inside a child, the call runs on a frozen prop instead.
 */
export function CrosshairLine({
  xScale,
  valueMs,
  left,
  top,
  height,
}: {
  xScale: ReturnType<typeof scaleTime<number>>;
  valueMs: number;
  /** The plot area's offset within the positioned chart container. */
  left: number;
  top: number;
  height: number;
}) {
  // Snapped to whole pixels: a fractional translate would smear the 1px dashes
  // across two columns, and half a pixel is well below what a cursor resolves.
  const x = left + Math.round(xScale(valueMs));
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute will-change-transform"
      style={{ left: 0, top, transform: `translateX(${x}px)` }}
      width={1}
      height={height}
    >
      <line
        x1={0.5}
        x2={0.5}
        y1={0}
        y2={height}
        stroke="var(--text-muted)"
        strokeWidth={1}
        strokeDasharray="3,3"
      />
    </svg>
  );
}
