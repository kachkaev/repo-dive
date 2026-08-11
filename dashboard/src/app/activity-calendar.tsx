import { useId, useState } from "react";

import type { ContributorKind } from "../data.ts";
import { ScrollArea } from "./shared/@ui-primitive/scroll-area.tsx";
import { Tooltip, TooltipContent } from "./shared/@ui-primitive/tooltip.tsx";
import {
  kindColors,
  type KindFilter,
  kindNouns,
} from "./shared/contributor-kinds.tsx";
import {
  formatDateWithDayOfWeek,
  formatMonth,
  monthShortNames,
} from "./shared/format.ts";
import { DateStamp } from "./shared/primitives.tsx";

export type WeekStart = "monday" | "sunday";

/** The commits a calendar aggregates — a filtered subset enables per-contributor calendars later. */
export type CalendarCommit = {
  /** ISO timestamp with the committer's UTC offset (git `%cI`). */
  date: string;
  /** Author kind; missing in dashboard.json written before per-commit kinds. */
  kind?: ContributorKind;
  /** At least one AI co-author trailer on the commit. */
  ai: boolean;
};

export type CalendarRange =
  | "last-12-months"
  | "this-year"
  | `last-${number}-years`
  | "all-years"
  | `year-${number}`;

/** Which author kind the calendar shows; "all" stacks every kind per cell. */
export type CalendarKindFilter = KindFilter;

const dayMs = 86_400_000;
const binSize = 12;
const cellSize = 10;
const marginLeft = 20;
const marginTop = 16;
/** Horizontal breathing room between months — makes month boundaries readable. */
const gapColumns = 2;

/**
 * Two letters: the grid is 10px cells, so the gutter should not cost more —
 * and seven labels stacked in weekday order carry each other. Everywhere a
 * weekday stands alone next to a date it is spelled out in full instead.
 */
const dayLabels: Record<WeekStart, string[]> = {
  monday: ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"],
  sunday: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"],
};

/**
 * Zero + four intensity steps. A cell's kind segments keep their full colors;
 * the day's commit volume fades the whole stack toward the surface via group
 * opacity — the same "less is closer to the background" reading as before,
 * one mechanism for any number of segments.
 */
const levelOpacities = [0, 0.3, 0.55, 0.78, 1];

/**
 * An AI-assisted slice projecting to fewer pixels than this folds into its
 * plain segment — a sub-2px hatch reads as noise, and the tooltip keeps the
 * exact count either way.
 */
const hatchFoldPx = 2;

type DayTotal = {
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
const filterValueOf = (day: DayTotal, filter: CalendarKindFilter): number =>
  filter === "all"
    ? totalOf(day)
    : filter === "human"
      ? day.human
      : filter === "bot"
        ? day.bot
        : day.agent;

type StackPart = { kind: ContributorKind; hatched: boolean; value: number };

/**
 * A day's stack for the active filter, top-down: human (plain, then the
 * AI-assisted slice hatched) → AI agent → bot. Filtering never changes the
 * rule — a single-kind view simply has fewer parts. Hatched slices thinner
 * than {@link hatchFoldPx} fold into their plain segment.
 */
const stackPartsOf = (
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
const roundPartPx = (values: readonly number[], size: number): number[] => {
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
    if (value === 0 && (values[index] ?? 0) > 0) {
      const tallest = px.indexOf(Math.max(...px));
      px[tallest] = (px[tallest] ?? 0) - 1;
      px[index] = 1;
    }
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

type StripLayout = {
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
 * One cell: a miniature stacked bar. Kind segments (full color) stack
 * bottom-up in fixed order, the AI-assisted human slice carries the hatch
 * pattern, and the whole stack's opacity encodes the day's volume — the same
 * building block as the monthly bars, normalized to cell height.
 */
function CellStack({
  day,
  x,
  y,
  level,
  filter,
  hatchId,
  clipId,
}: {
  day: DayTotal;
  x: number;
  y: number;
  level: number;
  filter: CalendarKindFilter;
  hatchId: string;
  clipId: string;
}) {
  if (level === 0) {
    return (
      <rect
        x={x}
        y={y}
        width={cellSize}
        height={cellSize}
        rx={2}
        fill="var(--surface-2)"
      />
    );
  }
  const parts = stackPartsOf(day, filter);
  const heights = roundPartPx(
    parts.map((part) => part.value),
    cellSize,
  );
  const segments: Array<{ part: StackPart; partHeight: number; topY: number }> =
    [];
  let nextTopY = y + cellSize;
  for (const [index, part] of parts.entries()) {
    const partHeight = heights[index] ?? 0;
    if (partHeight <= 0) {
      continue;
    }
    nextTopY -= partHeight;
    segments.push({ part, partHeight, topY: nextTopY });
  }
  return (
    <g opacity={levelOpacities[level]} clipPath={`url(#${clipId})`}>
      {segments.map(({ part, partHeight, topY }) => (
        <g key={`${part.kind}-${String(part.hatched)}`}>
          <rect
            x={x}
            y={topY}
            width={cellSize}
            height={partHeight}
            fill={kindColors[part.kind]}
          />
          {part.hatched && (
            <rect
              x={x}
              y={topY}
              width={cellSize}
              height={partHeight}
              fill={`url(#${hatchId})`}
            />
          )}
        </g>
      ))}
    </g>
  );
}

function CalendarStrip({
  title,
  layout,
  weekStartsOn,
  levelOf,
  filter,
  onHover,
  onHoverEnd,
}: {
  title: string;
  layout: StripLayout;
  weekStartsOn: WeekStart;
  levelOf: (value: number) => number;
  filter: CalendarKindFilter;
  onHover: (cell: Cell, target: SVGRectElement) => void;
  onHoverEnd: () => void;
}) {
  const patternIdBase = useId();
  const hatchId = `${patternIdBase}-hatch`;
  const clipId = `${patternIdBase}-clip`;
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
        onMouseLeave={onHoverEnd}
      >
        <defs>
          {/* AI-assist hatch: 1px lines at a 3px pitch — 2/3 author fill, 1/3 helper. */}
          <pattern
            id={hatchId}
            width={3}
            height={3}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width={1} height={3} fill={kindColors.ai} />
          </pattern>
          {/* Rounds each cell's stacked segments as one shape (scales to any cell). */}
          <clipPath id={clipId} clipPathUnits="objectBoundingBox">
            <rect width={1} height={1} rx={0.2} ry={0.2} />
          </clipPath>
        </defs>
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
        {layout.cells.map((cell) =>
          cell.day === undefined ? (
            /* An empty day's own fill, drawn as an outline: subtle enough to
               stay background, with the ring the only thing that says "no
               data". Half a pixel of inset keeps the stroke on the grid. */
            <rect
              key={cell.isoDate}
              x={marginLeft + cell.column * binSize + 0.5}
              y={marginTop + cell.row * binSize + 0.5}
              width={cellSize - 1}
              height={cellSize - 1}
              rx={1.5}
              fill="none"
              stroke="var(--surface-2)"
            />
          ) : (
            <CellStack
              key={cell.isoDate}
              day={cell.day}
              x={marginLeft + cell.column * binSize}
              y={marginTop + cell.row * binSize}
              level={levelOf(filterValueOf(cell.day, filter))}
              filter={filter}
              hatchId={hatchId}
              clipId={clipId}
            />
          ),
        )}
        {/* Hover targets on top, so segment boundaries never break hovering. */}
        {layout.cells.map((cell) => (
          <rect
            key={`hover-${cell.isoDate}`}
            x={marginLeft + cell.column * binSize}
            y={marginTop + cell.row * binSize}
            width={cellSize}
            height={cellSize}
            fill="transparent"
            onMouseEnter={(event) => {
              onHover(cell, event.currentTarget);
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
  kindFilter,
}: {
  commits: readonly CalendarCommit[];
  /** ISO timestamp the data was generated at — the calendar's "today". */
  generatedAt: string;
  /** ISO timestamp of the repo's first commit. */
  firstCommitDate: string;
  weekStartsOn: WeekStart;
  range: CalendarRange;
  kindFilter: CalendarKindFilter;
}) {
  // The hovered cell outlives its hover so the tooltip has something to render
  // while it animates out; `tooltipOpen` is what the pointer actually drives.
  const [hovered, setHovered] = useState<
    { cell: Cell; target: SVGRectElement } | undefined
  >();
  const [tooltipOpen, setTooltipOpen] = useState(false);

  // Committer-local day bucketing: the ISO timestamp carries the committer's
  // UTC offset, so its date part is the day the commit landed where it landed.
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

  // Intensity thresholds are quartiles of nonzero daily counts over the WHOLE
  // history, computed per filter — switching ranges never recolors a day, and
  // each kind gets its own max so bot bursts don't flatten the human view.
  const nonzero = [...dayTotals.values()]
    .map((total) => filterValueOf(total, kindFilter))
    .filter((value) => value > 0)
    .toSorted((left, right) => left - right);
  const quartile = (share: number): number =>
    nonzero[Math.floor(share * (nonzero.length - 1))] ?? 0;
  const thresholds = [quartile(0.25), quartile(0.5), quartile(0.75)];
  const levelOf = (value: number): number =>
    value <= 0
      ? 0
      : 1 + thresholds.filter((threshold) => value > threshold).length;

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
    case "all-years": {
      for (let year = anchorYear; year >= firstYear; year -= 1) {
        strips.push({ title: `${year}`, months: monthsOfYear(year) });
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
            strips.push({ title: `${year}`, months: monthsOfYear(year) });
          }
        }
        break;
      }
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

  const rangeTotal: DayTotal = { ...emptyDay };
  let busiest: { isoDate: string; day: DayTotal } | undefined;
  for (const { layout } of layouts) {
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

  // Every count below is the one the calendar is drawing: filtering to bots
  // must not leave the caption quoting a repo-wide total, or a busiest day
  // picked by its bot count described by its (much larger) overall one.
  const countPhrase = (day: DayTotal): string => {
    const total = filterValueOf(day, kindFilter);
    const noun = kindFilter === "all" ? "" : `${kindNouns[kindFilter]} `;
    return `${total} ${noun}${total === 1 ? "commit" : "commits"}`;
  };

  /** What the count phrase leaves unsaid: the kind split, or just the AI share. */
  const detailOf = (day: DayTotal): string => {
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

  const summarize = (day: DayTotal): string => {
    const detail = detailOf(day);
    return `${countPhrase(day)}${detail ? ` — ${detail}` : ""}`;
  };

  /** Why a day has no totals — the calendar's own edges, in the reader's terms. */
  const noDataReason = (isoDate: string): string =>
    isoDate < minIsoDate
      ? "Before the first commit"
      : "After this report was generated";

  const rangeDetail = detailOf(rangeTotal);
  const rangeSummary = `${countPhrase(rangeTotal)} in this range${
    rangeDetail ? ` — ${rangeDetail}` : ""
  }`;

  const legendColor =
    kindFilter === "all" ? kindColors.human : kindColors[kindFilter];

  return (
    <div>
      <ScrollArea>
        {/* Strips are only as wide as the months they hold, so how much room
            they need swings by a year's worth of week columns. `mx-auto`
            spends whatever is left over evenly instead of pooling it on the
            right — and collapses to nothing once a strip has to scroll. pb
            clears the overlay horizontal scrollbar (h-2.5) so it never covers
            the last strip's bottom day row. */}
        <div className="mx-auto flex w-max flex-col gap-3 pb-2.5">
          {layouts.map(({ title, layout }) => (
            <CalendarStrip
              key={title}
              title={title}
              layout={layout}
              weekStartsOn={weekStartsOn}
              levelOf={levelOf}
              filter={kindFilter}
              onHover={(cell, target) => {
                setHovered({ cell, target });
                setTooltipOpen(true);
              }}
              onHoverEnd={() => {
                setTooltipOpen(false);
              }}
            />
          ))}
        </div>
      </ScrollArea>
      {/* A day's detail belongs in a tooltip rather than in the caption below:
          the caption's height varies with the text, and the whole calendar
          used to jump as the pointer moved from one day to the next.
          `disableHoverablePopup` makes the popup inert, so the days it covers
          keep receiving the pointer. */}
      <Tooltip
        open={tooltipOpen}
        onOpenChange={setTooltipOpen}
        disableHoverablePopup
      >
        {hovered && (
          <TooltipContent
            anchor={hovered.target}
            arrow={false}
            // Up-and-left of the cell (right edge on the cell), keeping the
            // cells ahead in reading order visible; Base UI's collision
            // handling shifts it back into view near the calendar's start.
            align="end"
            className="tabular-nums"
          >
            <div className="mb-1 font-medium text-(--text-secondary)">
              <DateStamp isoDate={hovered.cell.isoDate} />
            </div>
            {hovered.cell.day === undefined ? (
              <div className="text-(--text-muted)">
                {noDataReason(hovered.cell.isoDate)}
              </div>
            ) : (
              <div>{summarize(hovered.cell.day)}</div>
            )}
          </TooltipContent>
        )}
      </Tooltip>
      {/* Centered under the strips like a figure caption (see Legend): the
          intensity scale first, then one claim per line — the range's own
          total and the day that stands out. */}
      <div className="mt-3 flex flex-col items-center gap-2.5 text-center text-xs text-(--text-secondary)">
        <span className="flex items-center gap-1 text-(--text-muted)">
          Less
          {levelOpacities.map((opacity, level) => (
            <span
              key={level}
              className="inline-block size-2.5 rounded-xs"
              style={
                level === 0
                  ? { background: "var(--surface-2)" }
                  : { background: legendColor, opacity }
              }
            />
          ))}
          More
        </span>
        <div className="tabular-nums">
          <div>{rangeSummary}</div>
          {busiest && (
            <div>
              Busiest day {formatDateWithDayOfWeek(busiest.isoDate)}:{" "}
              {summarize(busiest.day)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
