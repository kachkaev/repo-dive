/**
 * Matches the chart's `TimePoint` — declared here rather than imported because
 * this .ts module is also swept by the root (non-JSX) tsconfig, which cannot
 * resolve an import from a .tsx file.
 */
type TimePoint = { dateMs: number; values: Record<string, number> };

export const categoricalColors = Array.from(
  { length: 20 },
  (_, index) => `var(--series-${index + 1})`,
);
export const otherColor = "var(--text-muted)";

/**
 * Top n keys by importance; the rest fold into "Other". Importance is the
 * latest snapshot's value by default — fine when today's series are the ones
 * worth naming. Pass `rankBy: "peak"` when a series can matter historically yet
 * be absent now (e.g. a package manager used before a migration): ranking by
 * each key's peak keeps it a named series across the whole timeline instead of
 * dropping it into "Other" the moment it disappears from the latest snapshot.
 */
export function shapeStacked(
  rows: ReadonlyArray<{ date: string; values: Record<string, number> }>,
  maxSeries: number,
  rankBy: "latest" | "peak" = "latest",
): { points: TimePoint[]; seriesKeys: string[]; colors: string[] } {
  const weights: Record<string, number> = {};
  if (rankBy === "peak") {
    for (const row of rows) {
      for (const [key, value] of Object.entries(row.values)) {
        weights[key] = Math.max(weights[key] ?? 0, value);
      }
    }
  } else {
    for (const [key, value] of Object.entries(rows.at(-1)?.values ?? {})) {
      weights[key] = value;
    }
  }
  const ranked = Object.keys(weights).toSorted(
    (left, right) => (weights[right] ?? 0) - (weights[left] ?? 0),
  );
  const kept = ranked.slice(0, maxSeries);
  const hasOther =
    ranked.length > maxSeries ||
    rows.some((row) =>
      Object.keys(row.values).some((key) => !kept.includes(key)),
    );

  const points = rows.map((row) => {
    const values: Record<string, number> = {};
    let other = 0;
    for (const [key, value] of Object.entries(row.values)) {
      if (kept.includes(key)) {
        values[key] = value;
      } else {
        other += value;
      }
    }
    if (hasOther) {
      values["Other"] = other;
    }
    return { dateMs: new Date(row.date).getTime(), values };
  });

  const seriesKeys = hasOther ? [...kept, "Other"] : kept;
  const colors = seriesKeys.map((key, index) =>
    key === "Other"
      ? otherColor
      : (categoricalColors[index % categoricalColors.length] ?? otherColor),
  );
  return { points, seriesKeys, colors };
}
