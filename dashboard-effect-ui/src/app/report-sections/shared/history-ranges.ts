import type { DashboardData } from "../../../data.ts";
import { cachedBy } from "../../shared/cached-by.ts";
import {
  type DaySpan,
  historyDaySpanOf,
  type HistoryRange,
} from "../../shared/history-range.ts";

/**
 * The calendar's multi-year unit, in calendar years (one strip each). Every
 * multi-year range on offer is a multiple of it — "Last 5 years", "Last 10
 * years", … — and the shortest of them is what an old repo's calendar opens
 * on: five strips are still a glance rather than a scroll.
 */
const calendarYearStep = 5;

/**
 * The longest history the calendar still opens in full, in calendar years.
 * A little past {@link calendarYearStep}: trading a glance for the whole story
 * is worth a strip or two of extra scrolling, not more.
 */
const maxDefaultCalendarYears = 7;

/**
 * The multi-year ranges a repo spanning this many calendar years offers: 5,
 * 10, 15, … A range earns its row once a calendar year falls outside it — up
 * to that point it draws strip for strip what the whole history draws, and
 * two options drawing the same thing is one option too many.
 */
const multiYearSpansOf = (years: number): number[] => {
  const spans: number[] = [];
  for (let span = calendarYearStep; years > span; span += calendarYearStep) {
    spans.push(span);
  }
  return spans;
};

/**
 * How much history the repo holds, in the two units the calendar's controls
 * care about: whether it goes back a year at all, and how many calendar years
 * — i.e. strips — it spans.
 */
export type CalendarHistory = { underAYear: boolean; years: number };

export const calendarHistoryOf = (historyDays: DaySpan): CalendarHistory => {
  // ISO dates compare as strings, so "a year before the last day" needs no
  // date math beyond swapping the year in.
  const lastYear = Number(historyDays.last.slice(0, 4));
  const aYearBefore = `${lastYear - 1}${historyDays.last.slice(4)}`;
  return {
    underAYear: historyDays.first > aYearBefore,
    years: lastYear - Number(historyDays.first.slice(0, 4)) + 1,
  };
};

/**
 * The range the calendar opens on. The old fixed "last 12 months" default was
 * one thin strip whatever the repo — for anything but a young one it hid most
 * of the history behind a dropdown nobody touches. So: show everything when
 * everything still fits ({@link maxDefaultCalendarYears}), fall back to the
 * newest {@link calendarYearStep} years when it doesn't, and keep the rolling
 * twelve months only for a repo too young to fill even one calendar year,
 * where whole-year strips would be mostly empty.
 */
export const defaultCalendarRangeOf = (
  history: CalendarHistory,
): HistoryRange => {
  // A repo spanning a single calendar year is a year old at most, so this is
  // the same branch twice over — but it also keeps the default off "all years",
  // which such a repo does not offer (it would duplicate "This year").
  const tooYoungForYearStrips = history.underAYear || history.years <= 1;
  return tooYoungForYearStrips
    ? "last-12-months"
    : history.years <= maxDefaultCalendarYears
      ? "all-years"
      : `last-${calendarYearStep}-years`;
};

/**
 * The ranges the calendar and the contributors chart both offer. Fixed ranges
 * first, then one entry per year of history, newest first. A range only earns
 * its row once the repo outlives it ({@link multiYearSpansOf} for the
 * multi-year ones), and inside a single calendar year "All …" and that year's
 * own entry would both draw what "This year" draws. The whole-history option
 * names its own span ("All 7 years") rather than saying "All years": how much
 * history the repo holds is the one thing the reader cannot infer from the
 * label, and it decides whether the option is worth a click.
 */
export const rangeItemsOf = (
  calendarHistory: CalendarHistory,
  historyDays: DaySpan,
): Array<{ value: HistoryRange; label: string }> => [
  { value: "last-12-months", label: "Last 12 months" },
  { value: "this-year", label: "This year" },
  ...multiYearSpansOf(calendarHistory.years).map((span) => ({
    value: `last-${span}-years` as const,
    label: `Last ${span} years`,
  })),
  ...(calendarHistory.years > 1
    ? [
        {
          value: "all-years" as const,
          label: `All ${calendarHistory.years} years`,
        },
      ]
    : []),
  ...(calendarHistory.years > 1
    ? Array.from(
        { length: calendarHistory.years },
        (_, index) => Number(historyDays.last.slice(0, 4)) - index,
      ).map((year) => ({
        value: `year-${year}` as const,
        label: String(year),
      }))
    : []),
];

/**
 * The bounds the calendar and the contributors chart both draw the history
 * in, and the ranges they offer over it, worked out once per data. Both draw
 * the history as its authors' own days, so the bounds come from
 * {@link historyDaySpanOf} rather than from the report's UTC date.
 */
export const historyOf = cachedBy((data: DashboardData) => {
  const historyDays = historyDaySpanOf(
    data.commits,
    data.repo.firstCommitDate,
    data.generatedAt,
  );
  const calendarHistory = calendarHistoryOf(historyDays);
  return {
    historyDays,
    calendarHistory,
    rangeItems: rangeItemsOf(calendarHistory, historyDays),
  };
});
