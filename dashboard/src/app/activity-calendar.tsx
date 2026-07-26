import { useId, useState } from "react";

import type { ContributorKind } from "../data.ts";
import { ScrollArea } from "./shared/@ui-primitive/scroll-area.tsx";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "./shared/@ui-primitive/toggle-group.tsx";
import { formatMonth, monthShortNames } from "./shared/format.ts";

export type WeekStart = "monday" | "sunday";

/** The commits a calendar aggregates — a filtered subset enables per-contributor calendars later. */
export type CalendarCommit = {
  /** ISO timestamp with the author's UTC offset (git `%aI`). */
  date: string;
  /** Author kind; missing in dashboard.json written before per-commit kinds. */
  kind?: ContributorKind;
  /** At least one AI co-author trailer on the commit. */
  ai: boolean;
};

export type CalendarRange =
  | "last-12-months"
  | "this-year"
  | "last-3-years"
  | "all-years"
  | `year-${number}`;

/** Which author kind the calendar shows; "all" stacks every kind per cell. */
export type CalendarKindFilter = "all" | ContributorKind;

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

/** The reserved contributor-kind colors (see styles.css). */
const kindColors: Record<ContributorKind, string> = {
  human: "var(--kind-human)",
  bot: "var(--kind-bot)",
  ai: "var(--kind-ai)",
};

const kindFilterLabels: Record<Exclude<CalendarKindFilter, "all">, string> = {
  human: "Humans",
  bot: "Bots",
  ai: "AI agents",
};

/** Qualifies a count once a single kind is filtered: "4 bot commits". */
const kindNouns: Record<Exclude<CalendarKindFilter, "all">, string> = {
  human: "human",
  bot: "bot",
  ai: "AI-agent",
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
  day: DayTotal;
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
    cells.push({
      isoDate,
      column,
      row: rowOfMs(ms),
      day: dayTotals.get(isoDate) ?? emptyDay,
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
  cell,
  x,
  y,
  level,
  filter,
  hatchId,
  clipId,
}: {
  cell: Cell;
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
  const parts = stackPartsOf(cell.day, filter);
  const heights = roundPartPx(
    parts.map((part) => part.value),
    cellSize,
  );
  let nextTopY = y + cellSize;
  const rects = parts
    .map((part, index) => ({ part, partHeight: heights[index] ?? 0 }))
    .filter(({ partHeight }) => partHeight > 0)
    .map(({ part, partHeight }) => {
      nextTopY -= partHeight;
      return (
        <g key={`${part.kind}-${String(part.hatched)}`}>
          <rect
            x={x}
            y={nextTopY}
            width={cellSize}
            height={partHeight}
            fill={kindColors[part.kind]}
          />
          {part.hatched && (
            <rect
              x={x}
              y={nextTopY}
              width={cellSize}
              height={partHeight}
              fill={`url(#${hatchId})`}
            />
          )}
        </g>
      );
    });
  return (
    <g opacity={levelOpacities[level]} clipPath={`url(#${clipId})`}>
      {rects}
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
}: {
  title: string;
  layout: StripLayout;
  weekStartsOn: WeekStart;
  levelOf: (value: number) => number;
  filter: CalendarKindFilter;
  onHover: (cell: Cell | undefined) => void;
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
        onMouseLeave={() => {
          onHover(undefined);
        }}
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
        {layout.cells.map((cell) => (
          <CellStack
            key={cell.isoDate}
            cell={cell}
            x={marginLeft + cell.column * binSize}
            y={marginTop + cell.row * binSize}
            level={levelOf(filterValueOf(cell.day, filter))}
            filter={filter}
            hatchId={hatchId}
            clipId={clipId}
          />
        ))}
        {/* Hover targets on top, so segment boundaries never break hovering. */}
        {layout.cells.map((cell) => (
          <rect
            key={`hover-${cell.isoDate}`}
            x={marginLeft + cell.column * binSize}
            y={marginTop + cell.row * binSize}
            width={cellSize}
            height={cellSize}
            fill="transparent"
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
  kindFilter,
  onKindFilterChange,
}: {
  commits: readonly CalendarCommit[];
  /** ISO timestamp the data was generated at — the calendar's "today". */
  generatedAt: string;
  /** ISO timestamp of the repo's first commit. */
  firstCommitDate: string;
  weekStartsOn: WeekStart;
  range: CalendarRange;
  kindFilter: CalendarKindFilter;
  onKindFilterChange: (filter: CalendarKindFilter) => void;
}) {
  const [hovered, setHovered] = useState<Cell | undefined>();

  // Author-local day bucketing: the ISO timestamp carries the author's UTC
  // offset, so its date part is the day the author actually committed on.
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

  const presentKinds = new Set<ContributorKind>();
  for (const total of dayTotals.values()) {
    if (total.human > 0) {
      presentKinds.add("human");
    }
    if (total.bot > 0) {
      presentKinds.add("bot");
    }
    if (total.agent > 0) {
      presentKinds.add("ai");
    }
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

  const rangeTotal: DayTotal = { ...emptyDay };
  let busiest: Cell | undefined;
  for (const { layout } of layouts) {
    for (const cell of layout.cells) {
      rangeTotal.human += cell.day.human;
      rangeTotal.humanAi += cell.day.humanAi;
      rangeTotal.bot += cell.day.bot;
      rangeTotal.agent += cell.day.agent;
      if (
        filterValueOf(cell.day, kindFilter) >
        filterValueOf(busiest?.day ?? emptyDay, kindFilter)
      ) {
        busiest = cell;
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

  const describe = (cell: Cell): string => {
    const detail = detailOf(cell.day);
    return `${cell.isoDate}: ${countPhrase(cell.day)}${detail ? ` — ${detail}` : ""}`;
  };

  const rangeDetail = detailOf(rangeTotal);
  const rangeSummary = `${countPhrase(rangeTotal)} in this range${
    rangeDetail ? ` (${rangeDetail})` : ""
  }${busiest ? ` · busiest day ${describe(busiest)}` : ""}`;

  const legendColor =
    kindFilter === "all" ? kindColors.human : kindColors[kindFilter];

  const filterOptions: CalendarKindFilter[] = [
    "all",
    ...(["human", "bot", "ai"] as const).filter((kind) =>
      presentKinds.has(kind),
    ),
  ];

  return (
    <div>
      {presentKinds.size > 1 && (
        <ToggleGroup
          value={[kindFilter]}
          onValueChange={(groupValue) => {
            // Single-select semantics on an array-valued group: re-clicking the
            // pressed chip yields [] — keep the current filter (one is always
            // active) rather than allowing an empty selection.
            const next = groupValue.at(-1);
            if (typeof next === "string") {
              onKindFilterChange(next as CalendarKindFilter);
            }
          }}
          aria-label="Filter calendar by contributor kind"
          variant="outline"
          size="sm"
          className="mb-3 flex-wrap gap-1.5"
        >
          {filterOptions.map((option) => (
            <ToggleGroupItem
              key={option}
              value={option}
              className="h-auto gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-normal text-(--text-secondary) shadow-none hover:bg-transparent hover:text-(--text-primary) data-pressed:border-(--text-muted) data-pressed:text-(--text-primary)"
            >
              <span
                className="inline-block size-2.5 rounded-xs"
                style={{
                  background:
                    option === "all"
                      ? // Mirrors a cell's stacking order, top-down.
                        `linear-gradient(to bottom, ${kindColors.human} 0 34%, ${kindColors.ai} 34% 67%, ${kindColors.bot} 67% 100%)`
                      : kindColors[option],
                }}
              />
              {option === "all" ? "All" : kindFilterLabels[option]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
      <ScrollArea>
        {/* pb clears the overlay horizontal scrollbar (h-2.5) so it never
            covers the last strip's bottom day row. */}
        <div className="flex w-max min-w-full flex-col gap-3 pb-2.5">
          {layouts.map(({ title, layout }) => (
            <CalendarStrip
              key={title}
              title={title}
              layout={layout}
              weekStartsOn={weekStartsOn}
              levelOf={levelOf}
              filter={kindFilter}
              onHover={setHovered}
            />
          ))}
        </div>
      </ScrollArea>
      <div className="mt-2 flex items-center justify-between gap-4 text-xs text-(--text-secondary)">
        <span className="tabular-nums">
          {hovered ? describe(hovered) : rangeSummary}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-(--text-muted)">
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
      </div>
    </div>
  );
}
