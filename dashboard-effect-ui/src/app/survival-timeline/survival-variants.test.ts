import { expect, test } from "vitest";

import { survivalTimelinePropsOf } from "./survival-timeline-fixture.ts";
import {
  effectiveSelectionOf,
  survivalVariantsOf,
} from "./survival-variants.ts";

const variantsOf = (props: ReturnType<typeof survivalTimelinePropsOf>) =>
  survivalVariantsOf(
    props.flatRows,
    props.survivalRows,
    props.purposeOrder,
    props.maxContributorsInCharts,
    props.colorScales,
    props.unit,
  );

test("shares one domain across every variant", () => {
  const variants = variantsOf(survivalTimelinePropsOf());
  expect(variants.domainStartMs).toBe(Date.parse("2026-01-10T12:00:00Z"));
  expect(variants.domainEndMs).toBe(Date.parse("2026-03-01T12:00:00Z"));
  // The second survival sample holds 300 units, as the last flat row does.
  expect(variants.domainPeak).toBe(300);
  expect(variants.shadedYearCount).toBe(2);
  expect(variants.yearLegendItems.map((item) => item.label)).toEqual([
    "2025",
    "2026",
  ]);
});

test("shapes each variant once and hands back the same arrays", () => {
  const props = survivalTimelinePropsOf();
  const variants = variantsOf(props);
  expect(variantsOf(props)).toBe(variants);
  const shaded = variants.variantOf("contributor", true);
  expect(variants.variantOf("contributor", true)).toBe(shaded);
  expect(shaded.tableColumns.map((column) => column.label)).toEqual([
    "Alice",
    "Bob",
  ]);
  expect(variants.variantOf("contributor", false).chart.seriesKeys).toEqual([
    "Alice",
    "Bob",
  ]);
});

test("names the single all-units stack after the unit", () => {
  const variants = variantsOf(survivalTimelinePropsOf());
  const { chart, tableColumns } = variants.variantOf("all", false);
  expect(chart.seriesKeys).toEqual(["All lines"]);
  expect(chart.legendItems).toEqual([]);
  expect(chart.points.map((point) => point.values)).toEqual([
    { "All lines": 110 },
    { "All lines": 300 },
  ]);
  expect(tableColumns).toEqual([{ label: "All lines", keys: ["All lines"] }]);
});

test("falls back to what the data can draw, keeping the preferences", () => {
  // No per-commit rows: the flat variants are out, so shading is forced on.
  const variants = variantsOf(survivalTimelinePropsOf({ flatRows: [] }));
  expect(effectiveSelectionOf(variants, "language", false)).toEqual({
    dimension: "language",
    shaded: true,
  });
  expect(effectiveSelectionOf(variants, "all", false)).toEqual({
    dimension: "all",
    shaded: true,
  });

  // No survival samples: only the flat language and all-units splits.
  const flatOnly = variantsOf(survivalTimelinePropsOf({ survivalRows: [] }));
  expect(flatOnly.canDraw("contributor")).toBe(false);
  expect(flatOnly.canDraw("purpose")).toBe(false);
  expect(effectiveSelectionOf(flatOnly, "contributor", true)).toEqual({
    dimension: "language",
    shaded: false,
  });
});
