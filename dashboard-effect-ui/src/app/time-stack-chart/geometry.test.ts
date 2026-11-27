import { describe, expect, test } from "vitest";

import {
  chartLayoutOf,
  chartRowsOf,
  displayRowsOf,
  hoverIndexOf,
  hoverMsAt,
} from "./geometry.ts";

const dayMs = 86_400_000;

const pointsOf = (days: number[]) =>
  days.map((day) => ({ dateMs: day * dayMs, values: { a: day, b: 1 } }));

describe("chartRowsOf", () => {
  test("sorts the points by time and sums each row", () => {
    const chartRows = chartRowsOf(pointsOf([20, 0, 10]), ["a", "b"]);
    expect(chartRows.rows.map((row) => row["dateMs"])).toStrictEqual([
      0,
      10 * dayMs,
      20 * dayMs,
    ]);
    expect(chartRows.totals).toStrictEqual([1, 11, 21]);
  });

  test("keeps its result for the same arrays", () => {
    const points = pointsOf([0, 10]);
    const seriesKeys = ["a", "b"];
    expect(chartRowsOf(points, seriesKeys)).toBe(
      chartRowsOf(points, seriesKeys),
    );
  });
});

test("displayRowsOf draws shares in percent mode", () => {
  const chartRows = chartRowsOf(pointsOf([0, 3]), ["a", "b"]);
  expect(displayRowsOf(chartRows, false)).toBe(chartRows.rows);
  expect(displayRowsOf(chartRows, true)[1]).toStrictEqual({
    dateMs: 3 * dayMs,
    a: 0.75,
    b: 0.25,
  });
});

describe("chartLayoutOf", () => {
  test("insets bars by half a slot and widens to the domain bounds", () => {
    const chartRows = chartRowsOf(pointsOf([0, 31, 62, 93]), ["a", "b"]);
    const bars = chartLayoutOf(
      chartRows,
      "bar",
      456,
      "month",
      false,
      undefined,
      undefined,
      undefined,
    );
    // 456 − 44 − 12 = 400px over 4 bars: 100px slots, so a 50px inset.
    expect(bars.innerWidth).toBe(400);
    expect(bars.xScale.range()).toStrictEqual([50, 350]);
    expect(bars.barWidth).toBe(24);
    expect(bars.overhangPx).toBe(0);

    const areas = chartLayoutOf(
      chartRows,
      "area",
      456,
      "day",
      false,
      -31 * dayMs,
      undefined,
      1000,
    );
    expect(areas.xScale.range()).toStrictEqual([0, 400]);
    expect(areas.xMin).toBe(-31 * dayMs);
    expect(areas.yScale.domain()[1]).toBeGreaterThanOrEqual(1000);
  });
});

// 30 days over 400px: a day is 13⅓px; the hover rect overhangs by 4px.
const xOfDay = (day: number) => 4 + (day / 30) * 400;

describe("hover", () => {
  const chartRows = chartRowsOf(pointsOf([10, 20, 30]), ["a", "b"]);
  const layout = chartLayoutOf(
    chartRows,
    "area",
    456,
    "day",
    false,
    0,
    undefined,
    undefined,
  );

  test("clamps the overhang to the plot", () => {
    expect(hoverMsAt(layout, 0)).toBe(0);
    expect(hoverMsAt(layout, 408)).toBe(30 * dayMs);
  });

  test("snaps to the nearest point within the data's span", () => {
    expect(hoverIndexOf(chartRows, layout, hoverMsAt(layout, xOfDay(14)))).toBe(
      0,
    );
    expect(hoverIndexOf(chartRows, layout, hoverMsAt(layout, xOfDay(16)))).toBe(
      1,
    );
    expect(hoverIndexOf(chartRows, layout, hoverMsAt(layout, xOfDay(30)))).toBe(
      2,
    );
  });

  test("reads a gap before the data as no point, but snaps just outside it", () => {
    expect(hoverIndexOf(chartRows, layout, hoverMsAt(layout, xOfDay(5)))).toBe(
      undefined,
    );
    // 4px of overhang (plus half a pixel) still snap to the first point.
    expect(
      hoverIndexOf(chartRows, layout, hoverMsAt(layout, xOfDay(10) - 4)),
    ).toBe(0);
    expect(
      hoverIndexOf(chartRows, layout, hoverMsAt(layout, xOfDay(10) - 5)),
    ).toBe(undefined);
  });
});
