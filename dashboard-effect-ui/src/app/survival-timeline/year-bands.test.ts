import { expect, test } from "vitest";

import { makeYearScale, shapeYearBands, sumValues } from "./year-bands.ts";

test("makeYearScale keeps every year while they fit", () => {
  const scale = makeYearScale(["2024", "2026", "2025", "2026", "n/a"]);
  expect(scale.buckets).toEqual(["2024", "2025", "2026"]);
  expect(scale.bucketOf("2025")).toBe("2025");
  // Newest at full color; two steps of 25% (capped) toward the surface.
  expect(scale.colorOf("red", "2026")).toBe("red");
  expect(scale.colorOf("red", "2025")).toBe(
    "color-mix(in oklab, red 75%, var(--surface-1))",
  );
  expect(scale.colorOf("red", "2024")).toBe(
    "color-mix(in oklab, red 50%, var(--surface-1))",
  );
});

test("makeYearScale folds the oldest years past eight shades", () => {
  const years = Array.from({ length: 12 }, (_, index) => String(2015 + index));
  const scale = makeYearScale(years);
  expect(scale.buckets).toEqual([
    "≤2019",
    "2020",
    "2021",
    "2022",
    "2023",
    "2024",
    "2025",
    "2026",
  ]);
  expect(scale.bucketOf("2015")).toBe("≤2019");
  expect(scale.bucketOf("2020")).toBe("2020");
  // The oldest band reaches the full 55% fade.
  expect(scale.colorOf("red", "≤2019")).toBe(
    "color-mix(in oklab, red 45%, var(--surface-1))",
  );
});

test("sumValues adds up a record", () => {
  expect(sumValues({})).toBe(0);
  expect(sumValues({ a: 1, b: 2.5 })).toBe(3.5);
});

test("shapeYearBands ranks groups by their latest total and folds the rest", () => {
  const scale = makeYearScale(["2025", "2026"]);
  const chart = shapeYearBands(
    [
      {
        date: "2025-06-01T00:00:00Z",
        byGroupYear: { a: { "2025": 5 }, c: { "2025": 9 } },
      },
      {
        date: "2026-06-01T00:00:00Z",
        byGroupYear: {
          a: { "2025": 4, "2026": 6 },
          b: { "2026": 20 },
          c: { "2025": 1 },
        },
      },
    ],
    2,
    scale,
    (label, rank) => `${label}-color-${rank}`,
  );
  expect(chart.legendItems).toEqual([
    { label: "b", color: "b-color-0" },
    { label: "a", color: "a-color-1" },
    { label: "Other", color: "var(--text-muted)" },
  ]);
  expect(chart.tooltipGroups?.map((group) => group.keys)).toEqual([
    ["b2025", "b2026"],
    ["a2025", "a2026"],
    ["Other2025", "Other2026"],
  ]);
  expect(chart.seriesKeys).toHaveLength(6);
  expect(chart.colors[0]).toBe(
    "color-mix(in oklab, b-color-0 75%, var(--surface-1))",
  );
  expect(chart.colors[1]).toBe("b-color-0");
  expect(chart.points.map((point) => point.values)).toEqual([
    { a2025: 5, Other2025: 9 },
    { a2025: 4, a2026: 6, b2026: 20, Other2025: 1 },
  ]);
  expect(chart.separateGroups).toBe(true);
});

test("shapeYearBands keeps a fixed vocabulary in order and drops empty groups", () => {
  const scale = makeYearScale(["2026"]);
  const chart = shapeYearBands(
    [
      {
        date: "2026-06-01T00:00:00Z",
        byGroupYear: { Tests: { "2026": 3 }, Production: { "2026": 7 } },
      },
    ],
    3,
    scale,
    (label) => label,
    ["Production", "Docs", "Tests"],
  );
  expect(chart.legendItems?.map((item) => item.label)).toEqual([
    "Production",
    "Tests",
  ]);
});
