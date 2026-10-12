import { expect, test } from "vitest";

import { historyDaySpanOf, monthSpanOf } from "./history-range.ts";

const commitsAt = (...dates: string[]) => dates.map((date) => ({ date }));

test("historyDaySpanOf reaches a commit made past midnight before the report", () => {
  // 00:30+01:00 on the 13th is 23:30Z on the 12th, a quarter of an hour
  // before the report was generated.
  expect(
    historyDaySpanOf(
      commitsAt("2026-10-12T10:00:00Z", "2026-10-13T00:30:00+01:00"),
      "2026-10-12T10:00:00Z",
      "2026-10-12T23:45:00.000Z",
    ),
  ).toEqual({ first: "2026-10-12", last: "2026-10-13" });
});

test("historyDaySpanOf reaches back to a later commit's earlier local day", () => {
  // The first commit is 20:00Z on January 1, the second 21:00Z the same day,
  // yet in their authors' offsets one falls on the 2nd and the other on the 1st.
  expect(
    historyDaySpanOf(
      commitsAt("2020-01-02T01:00:00+05:00", "2020-01-01T13:00:00-08:00"),
      "2020-01-02T01:00:00+05:00",
      "2026-10-12T17:52:07.000Z",
    ),
  ).toEqual({ first: "2020-01-01", last: "2026-10-12" });
});

test("historyDaySpanOf does not stretch to an author clock that ran ahead", () => {
  expect(
    historyDaySpanOf(
      commitsAt(
        "2026-10-12T10:00:00Z",
        // 00:00Z on the 13th: after the report, however close.
        "2026-10-13T01:00:00+01:00",
        "2026-12-25T10:00:00Z",
      ),
      "2026-10-12T10:00:00Z",
      "2026-10-12T23:45:00.000Z",
    ),
  ).toEqual({ first: "2026-10-12", last: "2026-10-12" });
});

test("historyDaySpanOf covers just the report's day for an empty history", () => {
  expect(historyDaySpanOf([], undefined, "2026-10-12T23:45:00.000Z")).toEqual({
    first: "2026-10-12",
    last: "2026-10-12",
  });
});

test("monthSpanOf leaves the whole history unbounded", () => {
  expect(monthSpanOf("all-years", "2026-10-12")).toBeUndefined();
});

test("monthSpanOf counts the last 12 months back from the history's last", () => {
  expect(monthSpanOf("last-12-months", "2026-10-12")).toEqual({
    first: "2025-11",
    last: "2026-10",
  });
  // The year boundaries, where the first month changes year or stays put.
  expect(monthSpanOf("last-12-months", "2026-01-31")).toEqual({
    first: "2025-02",
    last: "2026-01",
  });
  expect(monthSpanOf("last-12-months", "2026-12-01")).toEqual({
    first: "2026-01",
    last: "2026-12",
  });
});

test("monthSpanOf keeps a month the report only reached in its authors' offsets", () => {
  // Generated at 23:45Z on October 31, with a commit from 00:30+01:00 on
  // November 1 already in: November is part of the last 12 months.
  const historyDays = historyDaySpanOf(
    commitsAt("2026-10-20T12:00:00Z", "2026-11-01T00:30:00+01:00"),
    "2026-10-20T12:00:00Z",
    "2026-10-31T23:45:00.000Z",
  );
  expect(monthSpanOf("last-12-months", historyDays.last)).toEqual({
    first: "2025-12",
    last: "2026-11",
  });
});

test("monthSpanOf covers whole calendar years for the year ranges", () => {
  const lastIsoDate = "2026-10-12";
  expect(monthSpanOf("this-year", lastIsoDate)).toEqual({
    first: "2026-01",
    last: "2026-12",
  });
  expect(monthSpanOf("last-5-years", lastIsoDate)).toEqual({
    first: "2022-01",
    last: "2026-12",
  });
  expect(monthSpanOf("year-2021", lastIsoDate)).toEqual({
    first: "2021-01",
    last: "2021-12",
  });
});
