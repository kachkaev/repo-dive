/** Corner radius of every bar the dashboard draws. */
const barCornerRadius = 1;

/**
 * SVG path of one bar segment, rounded only on the ends that are the bar's own
 * top or bottom. A `<rect rx>` rounds all four corners, so in a stack every
 * seam between two segments would get notched; here a segment in the middle of
 * a stack stays square and the stack reads as one bar.
 */
export function barPath({
  x,
  y,
  width,
  height,
  roundTop,
  roundBottom,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  roundTop: boolean;
  roundBottom: boolean;
}): string {
  // Clamped like `rx` is, so a sliver of a segment never bulges out of its box.
  const roundedEnds = (roundTop ? 1 : 0) + (roundBottom ? 1 : 0);
  const radius =
    roundedEnds === 0
      ? 0
      : Math.max(0, Math.min(barCornerRadius, width / 2, height / roundedEnds));
  const top = roundTop ? radius : 0;
  const bottom = roundBottom ? radius : 0;
  return [
    `M${x},${y + top}`,
    top > 0 ? `a${top},${top} 0 0 1 ${top},${-top}` : "",
    `h${width - 2 * top}`,
    top > 0 ? `a${top},${top} 0 0 1 ${top},${top}` : "",
    `v${height - top - bottom}`,
    bottom > 0 ? `a${bottom},${bottom} 0 0 1 ${-bottom},${bottom}` : "",
    `h${-(width - 2 * bottom)}`,
    bottom > 0 ? `a${bottom},${bottom} 0 0 1 ${-bottom},${-bottom}` : "",
    "Z",
  ].join("");
}
