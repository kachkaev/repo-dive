import { Schema } from "effect";
import { describe, expect, test } from "vitest";

import {
  calendarHistoryOf,
  defaultCalendarRangeOf,
  HistoryRangeSchema,
  rangeItemsOf,
} from "./history-ranges.ts";

describe("HistoryRangeSchema", () => {
  const isHistoryRange = Schema.is(HistoryRangeSchema);

  test.each([
    "last-12-months",
    "this-year",
    "all-years",
    "last-5-years",
    "year-2019",
  ])("accepts %s", (range) => {
    expect(isHistoryRange(range)).toBe(true);
  });

  test.each(["", "last-months", "year-", "years-2019", "all"])(
    "rejects %j",
    (range) => {
      expect(isHistoryRange(range)).toBe(false);
    },
  );
});

test("calendarHistoryOf counts the calendar years a history spans", () => {
  expect(
    calendarHistoryOf({ first: "2026-03-01", last: "2026-11-27" }),
  ).toStrictEqual({ underAYear: true, years: 1 });
  expect(
    calendarHistoryOf({ first: "2025-11-28", last: "2026-11-27" }),
  ).toStrictEqual({ underAYear: true, years: 2 });
  expect(
    calendarHistoryOf({ first: "2019-05-01", last: "2026-11-27" }),
  ).toStrictEqual({ underAYear: false, years: 8 });
});

test("defaultCalendarRangeOf shows everything while it still fits", () => {
  expect(defaultCalendarRangeOf({ underAYear: true, years: 2 })).toBe(
    "last-12-months",
  );
  expect(defaultCalendarRangeOf({ underAYear: false, years: 1 })).toBe(
    "last-12-months",
  );
  expect(defaultCalendarRangeOf({ underAYear: false, years: 7 })).toBe(
    "all-years",
  );
  expect(defaultCalendarRangeOf({ underAYear: false, years: 8 })).toBe(
    "last-5-years",
  );
});

describe("rangeItemsOf", () => {
  test("offers no year entries within a single calendar year", () => {
    const historyDays = { first: "2026-03-01", last: "2026-11-27" };
    expect(
      rangeItemsOf(calendarHistoryOf(historyDays), historyDays),
    ).toStrictEqual([
      { value: "last-12-months", label: "Last 12 months" },
      { value: "this-year", label: "This year" },
    ]);
  });

  test("offers a multi-year range once a year falls outside it, then every year, newest first", () => {
    const historyDays = { first: "2020-06-01", last: "2026-11-27" };
    expect(
      rangeItemsOf(calendarHistoryOf(historyDays), historyDays).map(
        (item) => item.label,
      ),
    ).toStrictEqual([
      "Last 12 months",
      "This year",
      "Last 5 years",
      "All 7 years",
      "2026",
      "2025",
      "2024",
      "2023",
      "2022",
      "2021",
      "2020",
    ]);
  });
});
