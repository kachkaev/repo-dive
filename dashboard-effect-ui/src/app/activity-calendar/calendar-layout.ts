/**
 * The commit calendar's pure logic, copied from the React
 * `activity-calendar.tsx`: day totals, intensity levels, cell stacks, the
 * month strips a range lays out, and the captions. What the React component
 * derives on every render is cached here per input ({@link calendarOf}), so
 * the chart's view gets the same objects back on every render and can hand
 * them to `h.lazy`.
 */
import type { ContributorKind } from "../../data.ts";
import { type KindFilter, kindNouns } from "../shared/contributor-kinds.ts";
import { formatMonth } from "../shared/format.ts";
import type { DaySpan, HistoryRange } from "../shared/history-range.ts";

export type WeekStart = "monday" | "sunday";

/** The commits a calendar aggregates — a filtered subset enables per-contributor calendars later. */
export type CalendarCommit = {
  /** ISO timestamp with the author's UTC offset (git `%aI`). */
  readonly date: string;
  /** Author kind; missing in dashboard.json written before per-commit kinds. */
  readonly kind?: ContributorKind | undefined;
  /** At least one AI co-author trailer on the commit. */
  readonly ai: boolean;
};

/** Which author kind the calendar shows; "all" stacks every kind per cell. */
export type CalendarKindFilter = KindFilter;

const dayMs = 86_400_000;
export const binSize = 12;
export const cellSize = 10;
export const marginLeft = 20;
export const marginTop = 16;
/** Horizontal breathing room between months — makes month boundaries readable. */
const gapColumns = 2;

/**
 * Two letters: the grid is 10px cells, so the gutter should not cost more —
 * and seven labels stacked in weekday order carry each other. Everywhere a
 * weekday stands alone next to a date it is spelled out in full instead.
 */
export const dayLabels: Record<WeekStart, string[]> = {
  monday: ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"],
  sunday: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"],
};

/**
 * Zero + four intensity steps. A cell's kind segments keep their full colors;
 * the day's commit volume fades the whole stack toward the surface via group
 * opacity — the same "less is closer to the background" reading as before,
 * one mechanism for any number of segments.
 */
export const levelOpacities = [0, 0.3, 0.55, 0.78, 1];

/**
 * An AI-assisted slice projecting to fewer pixels than this folds into its
 * plain segment — a sub-2px hatch reads as noise, and the tooltip keeps the
 * exact count either way.
 */
const hatchFoldPx = 2;

export type DayTotal = {
  /** Human-authored commits (including the AI-assisted ones). */
  human: number;
  /** Human-authored commits with an AI co-author trailer. */
  humanAi: number;
  bot: number;
  /** Commits authored by an AI agent. */
  agent: number;
};

const emptyDay: DayTotal = { human: 0, humanAi: 0, bot: 0, agent: 0 };

const totalOf = (day: DayTotal): number => day.human + day.bot + day.agent;

/** The value the active filter maps to a cell's intensity (and stack sum). */
export const filterValueOf = (
  day: DayTotal,
  filter: CalendarKindFilter,
): number =>
  filter === "all"
    ? totalOf(day)
    : filter === "human"
      ? day.human
      : filter === "bot"
        ? day.bot
        : day.agent;

export type StackPart = {
  kind: ContributorKind;
  hatched: boolean;
  value: number;
};

/**
 * A day's stack for the active filter, top-down: human (plain, then the
 * AI-assisted slice hatched) → AI agent → bot. Filtering never changes the
 * rule — a single-kind view simply has fewer parts. Hatched slices thinner
 * than {@link hatchFoldPx} fold into their plain segment.
 */
export const stackPartsOf = (
  day: DayTotal,
  filter: CalendarKindFilter,
): StackPart[] => {
  const parts: StackPart[] = [];
  if (filter === "all" || filter === "human") {
    parts.push(
      { kind: "human", hatched: false, value: day.human - day.humanAi },
      { kind: "human", hatched: true, value: day.humanAi },
    );
  }
  if (filter === "all" || filter === "ai") {
    parts.push({ kind: "ai", hatched: false, value: day.agent });
  }
  if (filter === "all" || filter === "bot") {
    parts.push({ kind: "bot", hatched: false, value: day.bot });
  }
  const kept = parts.filter((part) => part.value > 0);

  const sum = kept.reduce((total, part) => total + part.value, 0);
  if (sum === 0) {
    return [];
  }
  const folded: StackPart[] = [];
  for (const part of kept) {
    if (part.hatched && (part.value / sum) * cellSize < hatchFoldPx) {
      const host = folded.find(
        (candidate) => candidate.kind === part.kind && !candidate.hatched,
      );
      if (host) {
        host.value += part.value;
      } else {
        folded.push({ ...part, hatched: false });
      }
    } else {
      folded.push({ ...part });
    }
  }
  // Parts are assembled in top-down reading order; the renderer stacks
  // bottom-up, so reverse to put humans at the top and bots at the bottom.
  return folded.toReversed();
};

/**
 * Largest-remainder rounding of part values to pixel heights summing exactly
 * to `size`, with a 1px floor so a present kind never rounds away entirely.
 */
export const roundPartPx = (
  values: readonly number[],
  size: number,
): number[] => {
  const sum = values.reduce((total, value) => total + value, 0);
  if (sum <= 0) {
    return values.map(() => 0);
  }
  const raw = values.map((value) => (value / sum) * size);
  const px = raw.map((value) => Math.floor(value));
  const byRemainder = raw
    .map((value, index) => [value - (px[index] ?? 0), index] as const)
    .toSorted(([left], [right]) => right - left);
  let remaining = size - px.reduce((total, value) => total + value, 0);
  for (const [, index] of byRemainder) {
    if (remaining <= 0) {
      break;
    }
    px[index] = (px[index] ?? 0) + 1;
    remaining -= 1;
  }
  for (const [index, value] of px.entries()) {
    if (!(value === 0 && (values[index] ?? 0) > 0)) {
      continue;
    }

    const tallest = px.indexOf(Math.max(...px));
    px[tallest] = (px[tallest] ?? 0) - 1;
    px[index] = 1;
  }
  return px;
};

/** UTC midnight for an ISO `YYYY-MM-DD` — calendar math never touches the viewer's timezone. */
const msOfIsoDate = (isoDate: string): number => {
  const [year, month, day] = isoDate.split("-").map(Number);
  return Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1);
};

const isoDateOfMs = (ms: number): string =>
  new Date(ms).toISOString().slice(0, 10);

/** ISO `YYYY-MM` for the month `offset` months after (or before) `isoMonth`. */
const shiftMonth = (isoMonth: string, offset: number): string => {
  const [year, month] = isoMonth.split("-").map(Number);
  const shifted = new Date(
    Date.UTC(year ?? 1970, (month ?? 1) - 1 + offset, 1),
  );
  return shifted.toISOString().slice(0, 7);
};

const monthsOfYear = (year: number): string[] =>
  Array.from(
    { length: 12 },
    (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`,
  );

/** `count` consecutive months ending with (and including) `lastMonth`. */
const monthsEndingAt = (lastMonth: string, count: number): string[] =>
  Array.from({ length: count }, (_, index) =>
    shiftMonth(lastMonth, index - (count - 1)),
  );

type Cell = {
  isoDate: string;
  column: number;
  row: number;
  /** Undefined outside the covered range — a day the calendar knows nothing about. */
  day: DayTotal | undefined;
};

export type StripLayout = {
  cells: Cell[];
  /** Column each month's label is drawn at. */
  monthLabels: Array<{ isoMonth: string; column: number }>;
  columnCount: number;
};

/**
 * Lays out one horizontal strip of months: GitHub-style week columns, with
 * {@link gapColumns} empty columns inserted at each month boundary (a week
 * spanning two months splits across the gap). Days outside
 * [`minIsoDate`, `maxIsoDate`] — before the first commit or after the data was
 * generated — get a cell with no totals, drawn as an outline: "we have no data
 * for this day" has to read differently from both "zero commits" and the void
 * between months.
 */
export const layOutStrip = (
  months: string[],
  dayTotals: ReadonlyMap<string, DayTotal>,
  minIsoDate: string,
  maxIsoDate: string,
  weekStartsOn: WeekStart,
): StripLayout => {
  const ordinalOfMonth = new Map(
    months.map((isoMonth, index) => [isoMonth, index]),
  );
  const firstMonth = months[0] ?? "1970-01";
  const startMs = msOfIsoDate(`${firstMonth}-01`);
  const endExclusiveMs = msOfIsoDate(
    `${shiftMonth(months.at(-1) ?? firstMonth, 1)}-01`,
  );
  const firstDow = weekStartsOn === "monday" ? 1 : 0;
  const rowOfMs = (ms: number): number =>
    (new Date(ms).getUTCDay() - firstDow + 7) % 7;
  // Monday (or Sunday) of the week containing the strip's first day.
  const weekZeroMs = startMs - rowOfMs(startMs) * dayMs;

  const cells: Cell[] = [];
  const monthLabels: Array<{ isoMonth: string; column: number }> = [];
  let columnCount = 0;
  for (let ms = startMs; ms < endExclusiveMs; ms += dayMs) {
    const isoDate = isoDateOfMs(ms);
    const isoMonth = isoDate.slice(0, 7);
    const week = Math.floor((ms - weekZeroMs) / (dayMs * 7));
    const column = week + (ordinalOfMonth.get(isoMonth) ?? 0) * gapColumns;
    const row = rowOfMs(ms);
    columnCount = Math.max(columnCount, column + 1);
    if (isoDate.endsWith("-01")) {
      // A month whose 1st is not on the week's first day only fills the bottom
      // of its opening column, leaving the label hovering over the gap that
      // precedes it. One column right, and it sits above the month's own days.
      monthLabels.push({ isoMonth, column: row === 0 ? column : column + 1 });
    }
    const covered = isoDate >= minIsoDate && isoDate <= maxIsoDate;
    cells.push({
      isoDate,
      column,
      row,
      day: covered ? (dayTotals.get(isoDate) ?? emptyDay) : undefined,
    });
  }
  return { cells, monthLabels, columnCount };
};

/**
 * Author-local day bucketing: the ISO timestamp carries the author's UTC
 * offset, so its date part is the day the commit was written, in the
 * author's own timezone.
 */
export const dayTotalsOf = (
  commits: readonly CalendarCommit[],
): Map<string, DayTotal> => {
  const dayTotals = new Map<string, DayTotal>();
  for (const commit of commits) {
    const isoDate = commit.date.slice(0, 10);
    const total = dayTotals.get(isoDate) ?? { ...emptyDay };
    const kind = commit.kind ?? "human";
    if (kind === "human") {
      total.human += 1;
      if (commit.ai) {
        total.humanAi += 1;
      }
    } else if (kind === "bot") {
      total.bot += 1;
    } else {
      total.agent += 1;
    }
    dayTotals.set(isoDate, total);
  }
  return dayTotals;
};

/**
 * Intensity thresholds are quartiles of nonzero daily counts over the WHOLE
 * history, computed per filter — switching ranges never recolors a day, and
 * each kind gets its own max so bot bursts don't flatten the human view.
 */
export const levelOfFor = (
  dayTotals: ReadonlyMap<string, DayTotal>,
  kindFilter: CalendarKindFilter,
): ((value: number) => number) => {
  const nonzero = dayTotals
    .values()
    .map((total) => filterValueOf(total, kindFilter))
    .filter((value) => value > 0)
    .toArray()
    .toSorted((left, right) => left - right);
  const quartile = (share: number): number =>
    nonzero[Math.floor(share * (nonzero.length - 1))] ?? 0;
  const thresholds = [quartile(0.25), quartile(0.5), quartile(0.75)];
  return (value) =>
    value <= 0
      ? 0
      : 1 + thresholds.filter((threshold) => value > threshold).length;
};

export type Strip = { title: string; layout: StripLayout };

/** Newest strip first, so the most recent activity needs no scrolling. */
export const stripsOf = (
  dayTotals: ReadonlyMap<string, DayTotal>,
  historyDays: DaySpan,
  weekStartsOn: WeekStart,
  range: HistoryRange,
): Strip[] => {
  const minIsoDate = historyDays.first;
  const maxIsoDate = historyDays.last;
  const anchorMonth = maxIsoDate.slice(0, 7);
  const anchorYear = Number(anchorMonth.slice(0, 4));
  const firstYear = Number(minIsoDate.slice(0, 4));

  const strips: Array<{ title: string; months: string[] }> = [];
  switch (range) {
    case "last-12-months": {
      const months = monthsEndingAt(anchorMonth, 12);
      strips.push({
        title: `${formatMonth(months[0] ?? anchorMonth)} — ${formatMonth(anchorMonth)}`,
        months,
      });
      break;
    }
    case "this-year": {
      strips.push({
        title: String(anchorYear),
        months: monthsOfYear(anchorYear),
      });
      break;
    }
    case "all-years": {
      for (let year = anchorYear; year >= firstYear; year -= 1) {
        strips.push({ title: String(year), months: monthsOfYear(year) });
      }
      break;
    }
    default: {
      // "last-<n>-years" for any n the range select offers (5, 10, 15, …);
      // anything else is a single "year-<n>" entry.
      const lastYears = /^last-(\d+)-years$/.exec(range)?.[1];
      if (lastYears !== undefined) {
        for (
          let year = anchorYear;
          year > anchorYear - Number(lastYears);
          year -= 1
        ) {
          if (year >= firstYear) {
            strips.push({ title: String(year), months: monthsOfYear(year) });
          }
        }
        break;
      }
      const year = Number(range.slice("year-".length));
      strips.push({ title: String(year), months: monthsOfYear(year) });
    }
  }

  return strips.map((strip) => ({
    title: strip.title,
    layout: layOutStrip(
      strip.months,
      dayTotals,
      minIsoDate,
      maxIsoDate,
      weekStartsOn,
    ),
  }));
};

/**
 * Every count below is the one the calendar is drawing: filtering to bots
 * must not leave the caption quoting a repo-wide total, or a busiest day
 * picked by its bot count described by its (much larger) overall one.
 */
const countPhrase = (day: DayTotal, kindFilter: CalendarKindFilter): string => {
  const total = filterValueOf(day, kindFilter);
  const noun = kindFilter === "all" ? "" : `${kindNouns[kindFilter]} `;
  return `${total} ${noun}${total === 1 ? "commit" : "commits"}`;
};

/** What the count phrase leaves unsaid: the kind split, or just the AI share. */
const detailOf = (day: DayTotal, kindFilter: CalendarKindFilter): string => {
  if (kindFilter !== "all") {
    return kindFilter === "human" && day.humanAi > 0
      ? `${day.humanAi} AI-assisted`
      : "";
  }
  return [
    day.human > 0
      ? `${day.human} human${day.humanAi > 0 ? ` (${day.humanAi} AI-assisted)` : ""}`
      : undefined,
    day.bot > 0 ? `${day.bot} bot` : undefined,
    day.agent > 0 ? `${day.agent} AI agent` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
};

/** What the caption under the strips says about the drawn range. */
export type RangeCaption = {
  rangeSummary: string;
  busiest: { isoDate: string; day: DayTotal } | undefined;
};

export const rangeCaptionOf = (
  strips: readonly Strip[],
  kindFilter: CalendarKindFilter,
): RangeCaption => {
  const rangeTotal: DayTotal = { ...emptyDay };
  let busiest: { isoDate: string; day: DayTotal } | undefined;
  for (const { layout } of strips) {
    for (const cell of layout.cells) {
      if (cell.day === undefined) {
        continue;
      }
      rangeTotal.human += cell.day.human;
      rangeTotal.humanAi += cell.day.humanAi;
      rangeTotal.bot += cell.day.bot;
      rangeTotal.agent += cell.day.agent;
      if (
        filterValueOf(cell.day, kindFilter) >
        filterValueOf(busiest?.day ?? emptyDay, kindFilter)
      ) {
        busiest = { isoDate: cell.isoDate, day: cell.day };
      }
    }
  }
  const rangeDetail = detailOf(rangeTotal, kindFilter);
  return {
    rangeSummary: `${countPhrase(rangeTotal, kindFilter)} in this range${
      rangeDetail ? ` — ${rangeDetail}` : ""
    }`,
    busiest,
  };
};

export const summarize = (
  day: DayTotal,
  kindFilter: CalendarKindFilter,
): string => {
  const detail = detailOf(day, kindFilter);
  return `${countPhrase(day, kindFilter)}${detail ? ` — ${detail}` : ""}`;
};

/** Why a day has no totals — the calendar's own edges, in the reader's terms. */
export const noDataReason = (isoDate: string, minIsoDate: string): string =>
  isoDate < minIsoDate
    ? "Before the first commit"
    : "After this report was generated";

/**
 * Everything the calendar draws for one set of props, worked out once: the
 * React component derives it on every render, and here the same objects come
 * back for the same inputs, so the strips can be memoized on them.
 */
export type CalendarView = {
  strips: readonly Strip[];
  levelOf: (value: number) => number;
  caption: RangeCaption;
  /** Each drawn cell by its date, for the hovered day's tooltip. */
  cellsByIsoDate: ReadonlyMap<string, Cell>;
};

/** A small per-key cache: the calendar re-renders with few distinct inputs. */
const memo = <A>(cache: Map<string, A>, key: string, compute: () => A): A => {
  const hit = cache.get(key);
  if (hit !== undefined) {
    return hit;
  }
  if (cache.size >= 32) {
    cache.clear();
  }
  const value = compute();
  cache.set(key, value);
  return value;
};

type CommitsCache = {
  dayTotals: Map<string, DayTotal>;
  levelScales: Map<string, (value: number) => number>;
  strips: Map<
    string,
    { strips: Strip[]; cellsByIsoDate: ReadonlyMap<string, Cell> }
  >;
  views: Map<string, CalendarView>;
};

const caches = new WeakMap<readonly CalendarCommit[], CommitsCache>();

export const calendarOf = (
  commits: readonly CalendarCommit[],
  historyDays: DaySpan,
  weekStartsOn: WeekStart,
  range: HistoryRange,
  kindFilter: CalendarKindFilter,
): CalendarView => {
  let cache = caches.get(commits);
  if (cache === undefined) {
    cache = {
      dayTotals: dayTotalsOf(commits),
      levelScales: new Map(),
      strips: new Map(),
      views: new Map(),
    };
    caches.set(commits, cache);
  }
  const { dayTotals } = cache;
  const stripsKey = `${historyDays.first}|${historyDays.last}|${weekStartsOn}|${range}`;
  return memo(cache.views, `${stripsKey}|${kindFilter}`, () => {
    const { strips, cellsByIsoDate } = memo(cache.strips, stripsKey, () => {
      const laidOut = stripsOf(dayTotals, historyDays, weekStartsOn, range);
      return {
        strips: laidOut,
        cellsByIsoDate: new Map(
          laidOut.flatMap(({ layout }) =>
            layout.cells.map((cell) => [cell.isoDate, cell] as const),
          ),
        ),
      };
    });
    return {
      strips,
      levelOf: memo(cache.levelScales, kindFilter, () =>
        levelOfFor(dayTotals, kindFilter),
      ),
      caption: rangeCaptionOf(strips, kindFilter),
      cellsByIsoDate,
    };
  });
};
