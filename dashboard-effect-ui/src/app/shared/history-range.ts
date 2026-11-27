/**
 * A stretch of the history a chart can be narrowed to, in whole calendar
 * months: the twelve months up to the report's own, one calendar year, the
 * newest few of them, or all of them.
 */
export type HistoryRange =
  | "last-12-months"
  | "this-year"
  | `last-${number}-years`
  | "all-years"
  | `year-${number}`;

/** Inclusive ISO `YYYY-MM-DD` bounds. */
export type DaySpan = { first: string; last: string };

/** Inclusive ISO `YYYY-MM` bounds. */
export type MonthSpan = { first: string; last: string };

/**
 * The days the history covers on the clock every count of work bins by: the
 * date part of each commit's author date, in the author's own UTC offset.
 * `generatedAt` is in UTC and `firstCommitDate` in one commit's offset, so
 * their dates alone can stop a day short of a commit made around someone
 * else's midnight — a report generated at 23:45Z on the 12th ends on the 12th,
 * yet a commit authored at 00:30+01:00 a quarter of an hour earlier counts
 * towards the 13th. Each end stretches to the commits' own days instead. The
 * last day only stretches for commits authored by the time the report was
 * generated, though: an author clock that ran ahead says nothing about days
 * that had not happened yet. An empty history covers just the report's day.
 */
export const historyDaySpanOf = (
  commits: ReadonlyArray<{ date: string }>,
  firstCommitDate: string | undefined,
  generatedAt: string,
): DaySpan => {
  const generatedAtMs = Date.parse(generatedAt);
  let first = (firstCommitDate ?? generatedAt).slice(0, 10);
  let last = generatedAt.slice(0, 10);
  for (const commit of commits) {
    // ISO dates compare as strings.
    const isoDate = commit.date.slice(0, 10);
    if (isoDate < first) {
      first = isoDate;
    }
    if (isoDate > last && Date.parse(commit.date) <= generatedAtMs) {
      last = isoDate;
    }
  }
  return { first, last };
};

const yearsSpan = (firstYear: number, lastYear: number): MonthSpan => ({
  first: `${firstYear}-01`,
  last: `${lastYear}-12`,
});

/**
 * The months a range covers, counted back from the month of the history's
 * last day (see {@link historyDaySpanOf}) — the very months the commit
 * calendar draws for it — or undefined for the whole history, which needs no
 * bounds.
 */
export const monthSpanOf = (
  range: HistoryRange,
  lastIsoDate: string,
): MonthSpan | undefined => {
  const anchorMonth = lastIsoDate.slice(0, 7);
  const anchorYear = Number(anchorMonth.slice(0, 4));
  switch (range) {
    case "all-years": {
      return undefined;
    }
    case "last-12-months": {
      // Twelve months ending with this one start right after the same month a
      // year ago — or, in December, with this January.
      const month = Number(anchorMonth.slice(5, 7));
      return {
        first:
          month === 12
            ? `${anchorYear}-01`
            : `${anchorYear - 1}-${String(month + 1).padStart(2, "0")}`,
        last: anchorMonth,
      };
    }
    case "this-year": {
      return yearsSpan(anchorYear, anchorYear);
    }
    default: {
      // "last-<n>-years" for any n the range select offers (5, 10, 15, …);
      // anything else is a single "year-<n>" entry.
      const lastYears = /^last-(\d+)-years$/.exec(range)?.[1];
      if (lastYears !== undefined) {
        return yearsSpan(anchorYear - Number(lastYears) + 1, anchorYear);
      }
      const year = Number(range.slice("year-".length));
      return yearsSpan(year, year);
    }
  }
};
