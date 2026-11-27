import { expect, test } from "vitest";

import { shapeStacked } from "./stacked-series.ts";

const rows = [
  { date: "2026-01-01", values: { Tests: 1, Production: 2 } },
  { date: "2026-02-01", values: { Tests: 5, Production: 4, Other: 9 } },
];

test("an Other folded upstream never takes a named series' place", () => {
  const { seriesKeys, points } = shapeStacked(rows, 1);
  expect(seriesKeys).toStrictEqual(["Tests", "Other"]);
  expect(points.at(-1)?.values).toStrictEqual({ Tests: 5, Other: 13 });
});

test("a fixed vocabulary stacks in its own order and folds nothing", () => {
  const { seriesKeys, points } = shapeStacked(rows, 2, [
    "Production",
    "Docs",
    "Tests",
    "Other",
  ]);
  expect(seriesKeys).toStrictEqual(["Production", "Tests", "Other"]);
  expect(points.at(-1)?.values).toStrictEqual({
    Production: 4,
    Tests: 5,
    Other: 9,
  });
});
