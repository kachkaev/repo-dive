import { stack } from "d3-shape";
import { expect, test } from "vitest";

import { stackedBarsOf } from "./chart-marks.ts";
import {
  chartLayoutOf,
  type ChartRow,
  chartRowsOf,
} from "./shared/geometry.ts";

test("stackedBarsOf rounds only the lowest and highest non-empty segments", () => {
  const seriesKeys = ["a", "b", "c"];
  const chartRows = chartRowsOf(
    [
      { dateMs: 0, values: { a: 1, b: 1, c: 1 } },
      // Only the middle series: it is both ends of its bar.
      { dateMs: 1, values: { a: 0, b: 2, c: 0 } },
      { dateMs: 2, values: { a: 1, b: 1, c: 0 } },
    ],
    seriesKeys,
  );
  const layout = chartLayoutOf(
    chartRows,
    "bar",
    456,
    "month",
    false,
    undefined,
    undefined,
    undefined,
  );
  const stacks = stack<ChartRow>().keys(seriesKeys)(chartRows.rows);
  const bars = stackedBarsOf(stacks, layout);
  const flags = bars.map(
    (bar) =>
      `${bar.index}${bar.key}:${bar.roundBottom ? "B" : "-"}${bar.roundTop ? "T" : "-"}`,
  );
  // Empty segments are left out; the rest come series by series.
  expect(flags).toStrictEqual([
    "0a:B-",
    "2a:B-",
    "0b:--",
    "1b:BT",
    "2b:-T",
    "0c:-T",
  ]);
  for (const bar of bars) {
    expect(bar.width).toBe(layout.barWidth);
    // Centred on the point's date.
    expect(bar.x + bar.width / 2).toBeCloseTo(
      layout.xScale(chartRows.rows[bar.index]?.["dateMs"] ?? 0),
    );
  }
});
