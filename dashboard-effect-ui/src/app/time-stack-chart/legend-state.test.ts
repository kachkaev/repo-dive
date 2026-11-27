import { describe, expect, test } from "vitest";

import {
  drawnKeysOf,
  groupBoundaryKeysOf,
  hiddenLabelSetOf,
  resolvedLegendItemsOf,
  soloedLabels,
  toggledLabels,
} from "./legend-state.ts";

const items = ["a", "b", "c"].map((label) => ({ label, color: "red" }));

test("toggledLabels hides a visible label and shows a hidden one", () => {
  expect(toggledLabels([], "a")).toStrictEqual(["a"]);
  expect(toggledLabels(["a", "b"], "a")).toStrictEqual(["b"]);
});

test("soloedLabels isolates a label, then brings everything back", () => {
  expect(soloedLabels([], "b", items)).toStrictEqual(["a", "c"]);
  expect(soloedLabels(["a", "c"], "b", items)).toStrictEqual([]);
  // Another label hidden too: isolating is still the first click's effect.
  expect(soloedLabels(["c"], "b", items)).toStrictEqual(["a", "c"]);
});

describe("hiddenLabelSetOf", () => {
  test("counts only the labels this legend names, and only with toggles", () => {
    expect([...hiddenLabelSetOf(["a", "x"], items, true)]).toStrictEqual(["a"]);
    expect(hiddenLabelSetOf(["a"], items, false).size).toBe(0);
  });
});

test("drawnKeysOf drops a hidden label's series, or its group's", () => {
  const seriesKeys = ["a 2025", "a 2026", "b 2026"];
  const groups = [
    { label: "a", color: "red", keys: ["a 2025", "a 2026"] },
    { label: "b", color: "blue", keys: ["b 2026"] },
  ];
  expect(drawnKeysOf(seriesKeys, new Set(["a"]), groups)).toStrictEqual([
    "b 2026",
  ]);
  expect(drawnKeysOf(seriesKeys, new Set(), groups)).toBe(seriesKeys);
});

test("resolvedLegendItemsOf names one item per series unless overridden", () => {
  expect(
    resolvedLegendItemsOf({
      seriesKeys: ["a", "b"],
      colors: ["red"],
      seriesHatch: { b: "blue" },
    }),
  ).toStrictEqual([
    { label: "a", color: "red", hatch: undefined },
    { label: "b", color: "var(--series-1)", hatch: "blue" },
  ]);
  expect(
    resolvedLegendItemsOf({ seriesKeys: ["a"], colors: [], legendItems: [] }),
  ).toStrictEqual([]);
});

test("groupBoundaryKeysOf picks the top series of every group but the last", () => {
  expect([
    ...groupBoundaryKeysOf([
      { label: "a", color: "red", keys: ["a 2025", "a 2026"] },
      { label: "b", color: "blue", keys: [] },
      { label: "c", color: "green", keys: ["c 2025", "c 2026"] },
    ]),
  ]).toStrictEqual(["a 2026"]);
  expect(
    groupBoundaryKeysOf([{ label: "a", color: "red", keys: ["a"] }]).size,
  ).toBe(0);
});
