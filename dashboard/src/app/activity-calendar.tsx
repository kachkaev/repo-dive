import { useState } from "react";

import { formatMonth, monthShortNames } from "./shared/format.ts";

export type WeekStart = "monday" | "sunday";

/** The commits a calendar aggregates — a filtered subset enables per-contributor calendars later. */
export type CalendarCommit = {
  /** ISO timestamp with the author's UTC offset (git `%aI`). */
  date: string;
  ai: boolean;
};

export type CalendarRange =
  | "last-12-months"
  | "this-year"
  | "last-3-years"
  | "all-years"
  | `year-${number}`;

const dayMs = 86_400_000;
const binSize = 12;
const cellSize = 10;
const marginLeft = 30;
const marginTop = 16;
/** Horizontal breathing room between months — makes month boundaries readable. */
const gapColumns = 2;

const dayLabels: Record<WeekStart, string[]> = {
  monday: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  sunday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};

/**
 * Zero + four intensity steps of the primary series hue. Mixing toward the
 * surface keeps "less" closer to the background in both themes.
 */
const levelColors = [
  "var(--surface-2)",
  "color-mix(in oklab, var(--series-1) 30%, var(--surface-1))",
  "color-mix(in oklab, var(--series-1) 55%, var(--surface-1))",
  "color-mix(in oklab, var(--series-1) 78%, var(--surface-1))",
  "var(--series-1)",
];

type DayTotal = { commits: number; ai: number };

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
  commits: number;
  ai: number;
};

type StripLayout = {
  cells: Cell[];
  /** Column of each month's first day, for label placement. */
  monthLabels: Array<{ isoMonth: string; column: number }>;
  columnCount: number;
};

/**
 * Lays out one horizontal strip of months: GitHub-style week columns, with
 * {@link gapColumns} empty columns inserted at each month boundary (a week
 * spanning two months splits across the gap). Days outside
 * [`minIsoDate`, `maxIsoDate`] — before the first commit or after the data was
 * generated — get no cell at all, distinguishing "unknown" from "zero commits".
 */
const layOutStrip = (
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
    columnCount = Math.max(columnCount, column + 1);
    if (isoDate.endsWith("-01")) {
      monthLabels.push({ isoMonth, column });
    }
    if (isoDate < minIsoDate || isoDate > maxIsoDate) {
      continue;
    }
    const total = dayTotals.get(isoDate);
    cells.push({
      isoDate,
      column,
      row: rowOfMs(ms),
      commits: total?.commits ?? 0,
      ai: total?.ai ?? 0,
    });
  }
  return { cells, monthLabels, columnCount };
};

function CalendarStrip({
  title,
  layout,
  weekStartsOn,
  levelOf,
  onHover,
}: {
  title: string;
  layout: StripLayout;
  weekStartsOn: WeekStart;
  levelOf: (commits: number) => number;
  onHover: (cell: Cell | undefined) => void;
}) {
  const width = marginLeft + layout.columnCount * binSize + 2;
  const height = marginTop + 7 * binSize;
  return (
    <div>
      <div className="text-xs font-medium text-(--text-secondary)">{title}</div>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Commit calendar, ${title}`}
        onMouseLeave={() => {
          onHover(undefined);
        }}
      >
        {layout.monthLabels.map((label) => (
          <text
            key={label.isoMonth}
            x={marginLeft + label.column * binSize}
            y={marginTop - 5}
            fontSize={9}
            fill="var(--text-muted)"
          >
            {monthShortNames[Number(label.isoMonth.slice(5)) - 1]}
          </text>
        ))}
        {dayLabels[weekStartsOn].map((label, row) => (
          <text
            key={label}
            x={0}
            y={marginTop + row * binSize + binSize / 2 + 3}
            fontSize={9}
            fill="var(--text-muted)"
          >
            {label}
          </text>
        ))}
        {layout.cells.map((cell) => (
          <rect
            key={cell.isoDate}
            x={marginLeft + cell.column * binSize}
            y={marginTop + cell.row * binSize}
            width={cellSize}
            height={cellSize}
            rx={2}
            fill={levelColors[levelOf(cell.commits)]}
            onMouseEnter={() => {
              onHover(cell);
            }}
          />
        ))}
      </svg>
    </div>
  );
}

export function CommitCalendar({
  commits,
  generatedAt,
  firstCommitDate,
  weekStartsOn,
  range,
}: {
  commits: readonly CalendarCommit[];
  /** ISO timestamp the data was generated at — the calendar's "today". */
  generatedAt: string;
  /** ISO timestamp of the repo's first commit. */
  firstCommitDate: string;
  weekStartsOn: WeekStart;
  range: CalendarRange;
}) {
  const [hovered, setHovered] = useState<Cell | undefined>();

  // Author-local day bucketing: the ISO timestamp carries the author's UTC
  // offset, so its date part is the day the author actually committed on.
  const dayTotals = new Map<string, DayTotal>();
  for (const commit of commits) {
    const isoDate = commit.date.slice(0, 10);
    const total = dayTotals.get(isoDate) ?? { commits: 0, ai: 0 };
    total.commits += 1;
    if (commit.ai) {
      total.ai += 1;
    }
    dayTotals.set(isoDate, total);
  }

  // Intensity thresholds are quartiles of nonzero daily counts over the WHOLE
  // history, not the visible range — switching ranges never recolors a day.
  const nonzero = [...dayTotals.values()]
    .map((total) => total.commits)
    .toSorted((left, right) => left - right);
  const quartile = (share: number): number =>
    nonzero[Math.floor(share * (nonzero.length - 1))] ?? 0;
  const thresholds = [quartile(0.25), quartile(0.5), quartile(0.75)];
  const levelOf = (dayCommits: number): number =>
    dayCommits <= 0
      ? 0
      : 1 + thresholds.filter((threshold) => dayCommits > threshold).length;

  const minIsoDate = firstCommitDate.slice(0, 10);
  const maxIsoDate = generatedAt.slice(0, 10);
  const anchorMonth = maxIsoDate.slice(0, 7);
  const anchorYear = Number(anchorMonth.slice(0, 4));
  const firstYear = Number(minIsoDate.slice(0, 4));

  // Newest strip first, so the most recent activity needs no scrolling.
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
      strips.push({ title: `${anchorYear}`, months: monthsOfYear(anchorYear) });
      break;
    }
    case "last-3-years": {
      for (let year = anchorYear; year > anchorYear - 3; year -= 1) {
        if (year >= firstYear) {
          strips.push({ title: `${year}`, months: monthsOfYear(year) });
        }
      }
      break;
    }
    case "all-years": {
      for (let year = anchorYear; year >= firstYear; year -= 1) {
        strips.push({ title: `${year}`, months: monthsOfYear(year) });
      }
      break;
    }
    default: {
      const year = Number(range.slice("year-".length));
      strips.push({ title: `${year}`, months: monthsOfYear(year) });
    }
  }

  const layouts = strips.map((strip) => ({
    title: strip.title,
    layout: layOutStrip(
      strip.months,
      dayTotals,
      minIsoDate,
      maxIsoDate,
      weekStartsOn,
    ),
  }));

  let rangeCommits = 0;
  let rangeAi = 0;
  let busiest: Cell | undefined;
  for (const { layout } of layouts) {
    for (const cell of layout.cells) {
      rangeCommits += cell.commits;
      rangeAi += cell.ai;
      if (cell.commits > (busiest?.commits ?? 0)) {
        busiest = cell;
      }
    }
  }

  const describe = (cell: Cell): string =>
    `${cell.isoDate}: ${cell.commits} ${cell.commits === 1 ? "commit" : "commits"}${
      cell.ai > 0 ? ` (${cell.ai} AI-assisted)` : ""
    }`;

  return (
    <div>
      <div className="overflow-x-auto">
        <div className="flex w-max min-w-full flex-col gap-3">
          {layouts.map(({ title, layout }) => (
            <CalendarStrip
              key={title}
              title={title}
              layout={layout}
              weekStartsOn={weekStartsOn}
              levelOf={levelOf}
              onHover={setHovered}
            />
          ))}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-4 text-xs text-(--text-secondary)">
        <span className="tabular-nums">
          {hovered
            ? describe(hovered)
            : `${rangeCommits} commits in this range${
                rangeAi > 0 ? ` (${rangeAi} AI-assisted)` : ""
              }${busiest ? ` · busiest day ${describe(busiest)}` : ""}`}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-(--text-muted)">
          Less
          {levelColors.map((color) => (
            <span
              key={color}
              className="inline-block size-2.5 rounded-xs"
              style={{ background: color }}
            />
          ))}
          More
        </span>
      </div>
    </div>
  );
}
