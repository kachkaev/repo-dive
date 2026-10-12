import { expect, test } from "vitest";

import { monthSpanOf } from "./history-range.ts";

test("monthSpanOf leaves the whole history unbounded", () => {
  expect(monthSpanOf("all-years", "2026-10-12T17:52:07Z")).toBeUndefined();
});

test("monthSpanOf counts the last 12 months back from the report's own", () => {
  expect(monthSpanOf("last-12-months", "2026-10-12T17:52:07Z")).toEqual({
    first: "2025-11",
    last: "2026-10",
  });
  // The year boundaries, where the first month changes year or stays put.
  expect(monthSpanOf("last-12-months", "2026-01-31T23:00:00Z")).toEqual({
    first: "2025-02",
    last: "2026-01",
  });
  expect(monthSpanOf("last-12-months", "2026-12-01T00:00:00Z")).toEqual({
    first: "2026-01",
    last: "2026-12",
  });
});

test("monthSpanOf covers whole calendar years for the year ranges", () => {
  const generatedAt = "2026-10-12T17:52:07Z";
  expect(monthSpanOf("this-year", generatedAt)).toEqual({
    first: "2026-01",
    last: "2026-12",
  });
  expect(monthSpanOf("last-5-years", generatedAt)).toEqual({
    first: "2022-01",
    last: "2026-12",
  });
  expect(monthSpanOf("year-2021", generatedAt)).toEqual({
    first: "2021-01",
    last: "2021-12",
  });
});
