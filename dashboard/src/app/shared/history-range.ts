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

/** Inclusive ISO `YYYY-MM` bounds. */
export type MonthSpan = { first: string; last: string };

const yearsSpan = (firstYear: number, lastYear: number): MonthSpan => ({
  first: `${firstYear}-01`,
  last: `${lastYear}-12`,
});

/**
 * The months a range covers, counted back from the month the report was
 * generated in — the very months the commit calendar draws for it — or
 * undefined for the whole history, which needs no bounds.
 */
export const monthSpanOf = (
  range: HistoryRange,
  generatedAt: string,
): MonthSpan | undefined => {
  const anchorMonth = generatedAt.slice(0, 7);
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
