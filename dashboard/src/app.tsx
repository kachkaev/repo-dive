import { useId, useState } from "react";

import {
  type CalendarKindFilter,
  type CalendarRange,
  CommitCalendar,
} from "./app/activity-calendar.tsx";
import { BarList } from "./app/bar-list.tsx";
import { DivergingBars } from "./app/diverging-bars.tsx";
import { Checkbox } from "./app/shared/@ui-primitive/checkbox.tsx";
import { Label } from "./app/shared/@ui-primitive/label.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./app/shared/@ui-primitive/select.tsx";
import {
  formatBytes,
  formatCount,
  formatDate,
  formatPercent,
} from "./app/shared/format.ts";
import { DataTable, Section, StatTile } from "./app/shared/primitives.tsx";
import { type TimePoint, TimeSeriesChart } from "./app/time-stack-chart.tsx";
import type { DashboardData } from "./data.ts";

const categoricalColors = Array.from(
  { length: 20 },
  (_, index) => `var(--series-${index + 1})`,
);
const otherColor = "var(--text-muted)";

/**
 * How many age bands the survival charts distinguish before folding the oldest
 * years together. The actual count is the repo's age in years capped at this,
 * kept constant across every survival chart so a given year reads the same
 * shade everywhere. (Intended to become a config option.)
 */
const maxYearShades = 10;

/** How far the oldest band fades toward the surface; newest stays full color. */
const maxYearFade = 70;

/**
 * A per-year lightness band of a category's base color: the newest year keeps
 * the full color, older years mix progressively toward the surface so they
 * recede. Theme-aware — "paler" means closer to the background in either theme.
 */
function yearBandColor(
  baseColor: string,
  ageFromNewest: number,
  shadeCount: number,
): string {
  if (shadeCount <= 1 || ageFromNewest <= 0) {
    return baseColor;
  }
  const fade = Math.round((ageFromNewest / (shadeCount - 1)) * maxYearFade);
  return `color-mix(in oklab, ${baseColor} ${100 - fade}%, var(--surface-1))`;
}

type YearScale = {
  /** Age buckets, oldest first; the oldest may be a folded `≤YYYY` label. */
  buckets: string[];
  /** Maps a cohort year to its bucket (folding years past the window). */
  bucketOf: (year: string) => string;
  /** The shade of `baseColor` for a bucket — full for newest, palest for oldest. */
  colorOf: (baseColor: string, bucket: string) => string;
};

/**
 * Builds a repo-wide age scale from the years present in the survival data.
 * The number of shades stays constant across charts so colors stay comparable;
 * years older than the window fold into a single `≤YYYY` bucket.
 */
function makeYearScale(years: Iterable<string>): YearScale {
  const sorted = [...new Set(years)].filter((year) => /^\d{4}$/.test(year));
  sorted.sort();

  let buckets: string[];
  let foldBelow: number | undefined;
  let foldLabel: string | undefined;
  if (sorted.length <= maxYearShades) {
    buckets = sorted;
  } else {
    const keptNewest = sorted.slice(-(maxYearShades - 1));
    const oldestKept = Number(keptNewest[0]);
    foldBelow = oldestKept;
    foldLabel = `≤${oldestKept - 1}`;
    buckets = [foldLabel, ...keptNewest];
  }

  const shadeCount = Math.max(1, buckets.length);
  const bucketOf = (year: string) =>
    foldLabel !== undefined && Number(year) < (foldBelow ?? 0)
      ? foldLabel
      : year;
  const colorOf = (baseColor: string, bucket: string) => {
    const index = buckets.indexOf(bucket);
    const ageFromNewest =
      index === -1 ? shadeCount - 1 : shadeCount - 1 - index;
    return yearBandColor(baseColor, ageFromNewest, shadeCount);
  };

  return { buckets, bucketOf, colorOf };
}

type StackedChart = {
  points: TimePoint[];
  seriesKeys: string[];
  colors: string[];
  legendItems?: Array<{ label: string; color: string }>;
  tooltipGroups?: Array<{ label: string; color: string; keys: string[] }>;
  separateGroups?: boolean;
};

/** Separates a group (contributor, language) from its year in a stack key. */
const yearBandSeparator = "";

/** Sum of a group's living lines across all its year bands. */
function sumYears(byYear: Record<string, number>): number {
  return Object.values(byYear).reduce((total, lines) => total + lines, 0);
}

/**
 * Shapes a survival cross-tab into year-banded stacks: each group (contributor,
 * language, …) is a contiguous run of sub-series (oldest→newest), colored as
 * lightness bands of the group's base color. Top groups are kept; the rest fold
 * into "Other". The legend and tooltip collapse the bands back to one row each.
 */
function shapeYearBands(
  rows: ReadonlyArray<{
    date: string;
    byGroupYear: Record<string, Record<string, number>>;
  }>,
  maxSeries: number,
  yearScale: YearScale,
  /** Base color per kept group given its rank; defaults to the palette order. */
  baseColorOf: (label: string, rank: number) => string = (_, rank) =>
    categoricalColors[rank % categoricalColors.length] ?? otherColor,
): StackedChart {
  const latest = rows.at(-1)?.byGroupYear ?? {};
  const ranked = Object.entries(latest)
    .toSorted(([, left], [, right]) => sumYears(right) - sumYears(left))
    .map(([name]) => name);
  const kept = ranked.slice(0, maxSeries);
  const hasOther =
    ranked.length > maxSeries ||
    rows.some((row) =>
      Object.keys(row.byGroupYear).some((name) => !kept.includes(name)),
    );
  const groups = hasOther ? [...kept, "Other"] : kept;

  const seriesKeys: string[] = [];
  const colors: string[] = [];
  const legendItems: Array<{ label: string; color: string }> = [];
  const tooltipGroups: Array<{ label: string; color: string; keys: string[] }> =
    [];
  for (const [index, name] of groups.entries()) {
    const baseColor = name === "Other" ? otherColor : baseColorOf(name, index);
    const keys: string[] = [];
    for (const bucket of yearScale.buckets) {
      const key = `${name}${yearBandSeparator}${bucket}`;
      keys.push(key);
      seriesKeys.push(key);
      colors.push(yearScale.colorOf(baseColor, bucket));
    }
    legendItems.push({ label: name, color: baseColor });
    tooltipGroups.push({ label: name, color: baseColor, keys });
  }

  const points = rows.map((row) => {
    const values: Record<string, number> = {};
    for (const [name, byYear] of Object.entries(row.byGroupYear)) {
      const group = kept.includes(name) ? name : "Other";
      for (const [year, lines] of Object.entries(byYear)) {
        const key = `${group}${yearBandSeparator}${yearScale.bucketOf(year)}`;
        values[key] = (values[key] ?? 0) + lines;
      }
    }
    return { dateMs: new Date(row.date).getTime(), values };
  });

  return {
    points,
    seriesKeys,
    colors,
    legendItems,
    tooltipGroups,
    separateGroups: true,
  };
}

/** Keeps every nth row so dense per-commit series stay light to render. */
function decimate<T>(rows: readonly T[], maxPoints: number): T[] {
  if (rows.length <= maxPoints) {
    return [...rows];
  }
  const step = rows.length / maxPoints;
  const result: T[] = [];
  for (let index = 0; index < maxPoints; index += 1) {
    const row = rows[Math.floor(index * step)];
    if (row) {
      result.push(row);
    }
  }
  const last = rows.at(-1);
  if (last && result.at(-1) !== last) {
    result.push(last);
  }
  return result;
}

/**
 * Top n keys by importance; the rest fold into "Other". Importance is the
 * latest snapshot's value by default — fine when today's series are the ones
 * worth naming. Pass `rankBy: "peak"` when a series can matter historically yet
 * be absent now (e.g. a package manager used before a migration): ranking by
 * each key's peak keeps it a named series across the whole timeline instead of
 * dropping it into "Other" the moment it disappears from the latest snapshot.
 */
function shapeStacked(
  rows: ReadonlyArray<{ date: string; values: Record<string, number> }>,
  maxSeries: number,
  rankBy: "latest" | "peak" = "latest",
): { points: TimePoint[]; seriesKeys: string[]; colors: string[] } {
  const weights: Record<string, number> = {};
  if (rankBy === "peak") {
    for (const row of rows) {
      for (const [key, value] of Object.entries(row.values)) {
        weights[key] = Math.max(weights[key] ?? 0, value);
      }
    }
  } else {
    for (const [key, value] of Object.entries(rows.at(-1)?.values ?? {})) {
      weights[key] = value;
    }
  }
  const ranked = Object.keys(weights).toSorted(
    (left, right) => (weights[right] ?? 0) - (weights[left] ?? 0),
  );
  const kept = ranked.slice(0, maxSeries);
  const hasOther =
    ranked.length > maxSeries ||
    rows.some((row) =>
      Object.keys(row.values).some((key) => !kept.includes(key)),
    );

  const points = rows.map((row) => {
    const values: Record<string, number> = {};
    let other = 0;
    for (const [key, value] of Object.entries(row.values)) {
      if (kept.includes(key)) {
        values[key] = value;
      } else {
        other += value;
      }
    }
    if (hasOther) {
      values["Other"] = other;
    }
    return { dateMs: new Date(row.date).getTime(), values };
  });

  const seriesKeys = hasOther ? [...kept, "Other"] : kept;
  const colors = seriesKeys.map((key, index) =>
    key === "Other"
      ? otherColor
      : (categoricalColors[index % categoricalColors.length] ?? otherColor),
  );
  return { points, seriesKeys, colors };
}

function YearShadeToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="mb-3 flex w-fit items-center gap-2">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => {
          onChange(value);
        }}
        className="size-3.5"
      />
      <Label
        htmlFor={id}
        className="text-xs font-normal text-(--text-secondary)"
      >
        Shade by year written
      </Label>
    </div>
  );
}

/** Falls back when serving a dashboard.json written before configurable caps. */
const defaultMaxContributorsInCharts = 10;

/** Icon + label for non-human contributor kinds; humans get no badge. */
const kindBadge: Record<"bot" | "ai", { icon: string; title: string }> = {
  bot: { icon: "🤖", title: "Bot" },
  ai: { icon: "✨", title: "AI agent" },
};

/** The reserved contributor-kind colors (see styles.css). */
const kindColors = {
  human: "var(--kind-human)",
  bot: "var(--kind-bot)",
  ai: "var(--kind-ai)",
} as const;

/**
 * Survival series that indexing folds non-human contributors into (must match
 * `kindGroupLabels` in src/cli/shared/indexing.ts), colored with the reserved
 * kind colors instead of palette slots.
 */
const kindGroupSeriesColors: Record<string, string> = {
  Bots: kindColors.bot,
  "AI agents": kindColors.ai,
};

/**
 * Palette slots a person may take in a chart that also draws the folded Bots /
 * AI agents bands. `--series-3` is skipped because `--kind-bot` aliases it (see
 * styles.css) — otherwise a human and the Bots band render in the very same
 * amber within one stack, which is exactly what the reserved colors exist to
 * prevent. `--series-1` stays in: it *is* `--kind-human`.
 */
const humanCategoricalColors = categoricalColors.filter(
  (color) => color !== "var(--series-3)",
);

/** The commits-per-month series: author kind, with humans split by AI assistance. */
const commitKindSeries = {
  human: "Human",
  humanAi: "Human · AI-assisted",
  ai: "AI agent",
  bot: "Bot",
} as const;

/** Reading order — humans first, bots last, matching a calendar cell top-down. */
const commitKindOrder = ["human", "humanAi", "ai", "bot"] as const;

const commitKindColorOf = (kind: keyof typeof commitKindSeries): string =>
  kind === "humanAi" ? kindColors.human : kindColors[kind];

/**
 * A month's commit counts by kind plus its churn — everything the two monthly
 * charts need, summed from the per-commit rows rather than shipped alongside
 * them.
 */
type MonthlyBucket = Record<keyof typeof commitKindSeries, number> & {
  added: number;
  deleted: number;
  /** Lines added by commits carrying an AI co-author trailer. */
  aiAdded: number;
};

// Bots and AI agents arrive pre-folded into one series per kind (indexing
// groups them), colored with the reserved kind colors; humans take palette
// slots by rank as before.
const survivalBaseColorOf = (label: string, rank: number): string =>
  kindGroupSeriesColors[label] ??
  humanCategoricalColors[rank % humanCategoricalColors.length] ??
  otherColor;

export function App({ data }: { data: DashboardData }) {
  const maxContributorsInCharts =
    data.config?.contributors.maxInCharts ?? defaultMaxContributorsInCharts;
  const humanContributors = data.contributors.filter(
    (contributor) => (contributor.kind ?? "human") === "human",
  );
  const nonHumanContributors = data.contributors.filter(
    (contributor) => contributor.kind === "bot" || contributor.kind === "ai",
  );
  const latestLanguages = data.languages.at(-1);
  const latestDirectives = data.directives.at(-1);
  const latestFileTypes = data.fileTypes.at(-1);
  const dependencies = data.dependencies;
  const latestDependencies = dependencies.at(-1);
  const [shadeContributorsByYear, setShadeContributorsByYear] = useState(false);
  const [shadeLanguagesByYear, setShadeLanguagesByYear] = useState(false);
  const [calendarRange, setCalendarRange] =
    useState<CalendarRange>("last-12-months");
  // Lifted out of CommitCalendar so it survives the remount on range change.
  const [calendarKindFilter, setCalendarKindFilter] =
    useState<CalendarKindFilter>("all");
  const calendarRangeSelectId = useId();

  // Fixed ranges first, then one entry per year of history, newest first.
  const calendarRangeItems: Array<{ value: CalendarRange; label: string }> = [
    { value: "last-12-months", label: "Last 12 months" },
    { value: "this-year", label: "This year" },
    { value: "last-3-years", label: "Last 3 years" },
    { value: "all-years", label: "All years" },
    ...(data.repo.firstCommitDate
      ? Array.from(
          {
            length:
              Number(data.generatedAt.slice(0, 4)) -
              Number(data.repo.firstCommitDate.slice(0, 4)) +
              1,
          },
          (_, index) => Number(data.generatedAt.slice(0, 4)) - index,
        ).map((year) => ({
          value: `year-${year}` as const,
          label: `${year}`,
        }))
      : []),
  ];

  // Repo inception, used to anchor charts whose series start mid-history (e.g.
  // dependencies, tracked only once a lockfile exists) to the full timeline.
  const repoStartMs = data.repo.firstCommitDate
    ? new Date(data.repo.firstCommitDate).getTime()
    : undefined;

  const recentCommits = data.commits.filter(
    (commit) => new Date(commit.date).getTime() >= Date.now() - 90 * 86_400_000,
  );
  const aiShareRecent =
    recentCommits.length === 0
      ? undefined
      : recentCommits.filter((commit) => commit.ai).length /
        Math.max(1, recentCommits.length);

  const languagesChart = shapeStacked(
    data.languages.map((row) => ({
      date: row.date,
      values: row.byLanguage,
    })),
    7,
  );

  // One pass over the per-commit rows feeds both monthly charts. dashboard.json
  // carries no monthly rollup of its own: every field of one is a group-by-month
  // sum over rows the calendar already needs in full, and re-deriving here also
  // means a file written before per-commit kinds still renders — everything
  // lands in the human series there, matching the old two-series chart.
  const monthlyBuckets = new Map<string, MonthlyBucket>();
  for (const commit of data.commits) {
    const month = commit.date.slice(0, 7);
    const bucket = monthlyBuckets.get(month) ?? {
      human: 0,
      humanAi: 0,
      ai: 0,
      bot: 0,
      added: 0,
      deleted: 0,
      aiAdded: 0,
    };
    const kind = commit.kind ?? "human";
    if (kind === "human") {
      bucket[commit.ai ? "humanAi" : "human"] += 1;
    } else {
      bucket[kind] += 1;
    }
    bucket.added += commit.added;
    bucket.deleted += commit.deleted;
    if (commit.ai) {
      bucket.aiAdded += commit.added;
    }
    monthlyBuckets.set(month, bucket);
  }
  const monthlyRows = [...monthlyBuckets.entries()].toSorted(
    ([left], [right]) => left.localeCompare(right),
  );
  // Keep only kinds that ever occur, so a bot-free repo gets no empty series.
  const commitKindKeys = commitKindOrder.filter((kind) =>
    monthlyRows.some(([, bucket]) => bucket[kind] > 0),
  );
  const commitsChart = {
    points: monthlyRows.map(([month, bucket]) => ({
      dateMs: new Date(`${month}-15`).getTime(),
      values: Object.fromEntries(
        commitKindKeys.map((kind) => [commitKindSeries[kind], bucket[kind]]),
      ),
    })),
    // Bars stack bottom-up, so reverse the reading order: humans end up on
    // top of each bar, bots at the baseline — same as a calendar cell.
    seriesKeys: commitKindKeys
      .toReversed()
      .map((kind) => commitKindSeries[kind]),
    colors: commitKindKeys.toReversed().map(commitKindColorOf),
    seriesHatch: { [commitKindSeries.humanAi]: kindColors.ai },
    // The legend and tooltip keep the reading order, humans first.
    legendItems: commitKindKeys.map((kind) => ({
      label: commitKindSeries[kind],
      color: commitKindColorOf(kind),
      ...(kind === "humanAi" ? { hatch: kindColors.ai } : {}),
    })),
  };

  const suppressionRows = decimate(data.directives, 400);
  const suppressionsChart = {
    points: suppressionRows.map((row) => ({
      dateMs: new Date(row.date).getTime(),
      values: {
        "eslint disables":
          row.eslintNextLine + row.eslintLine + row.eslintBlocks,
        "ts directives": row.tsIgnore + row.tsExpectError + row.tsNocheck,
        "todo comments": row.todos,
      },
    })),
    seriesKeys: ["eslint disables", "ts directives", "todo comments"],
    colors: ["var(--series-6)", "var(--series-3)", "var(--series-1)"],
  };

  const dependenciesChart = shapeStacked(
    decimate(dependencies, 400).map((row) => ({
      date: row.date,
      values: row.byPackageManager,
    })),
    5,
    // A repo can switch managers over its life (npm/yarn → pnpm), so rank by
    // peak to keep each one named rather than folding the retired ones away.
    "peak",
  );

  const directDependenciesTotal = latestDependencies
    ? latestDependencies.directProd +
      latestDependencies.directDev +
      latestDependencies.directOptional
    : 0;

  // Direct dependencies declared in package.json, split by kind. Distinct from
  // the resolved-graph chart above: this is what the project asks for, not what
  // the lockfile pulled in. Only shown once a package.json has been seen.
  const directDependenciesChart = {
    points: decimate(dependencies, 400).map((row) => ({
      dateMs: new Date(row.date).getTime(),
      values: {
        dependencies: row.directProd,
        devDependencies: row.directDev,
        optionalDependencies: row.directOptional,
      },
    })),
    seriesKeys: ["dependencies", "devDependencies", "optionalDependencies"],
    colors: ["var(--series-1)", "var(--series-3)", "var(--series-6)"],
  };
  const hasManifestData = dependencies.some(
    (row) =>
      (row.manifestCount ?? 0) > 0 ||
      row.directProd + row.directDev + row.directOptional > 0,
  );
  // package.json counts arrived after direct-dependency tracking; a dashboard.json
  // written before them carries direct counts but no manifestCount, so surface
  // the file count only where it was actually recorded.
  const hasManifestCounts = dependencies.some(
    (row) => row.manifestCount !== undefined,
  );

  // One age scale shared by every survival chart, so a given year reads the
  // same lightness band whether it's split by cohort or by contributor.
  const survivalYearScale = makeYearScale(
    data.survival.flatMap((row) =>
      Object.keys(row.byCohort).map((cohortMonth) => cohortMonth.slice(0, 4)),
    ),
  );

  // Newest year at full color, oldest palest — matching the contributor chart.
  const cohortBaseColor = "var(--series-1)";
  const survivalCohortChart =
    data.survival.length === 0
      ? undefined
      : {
          points: data.survival.map((row) => {
            const values: Record<string, number> = {};
            for (const [cohortMonth, lines] of Object.entries(row.byCohort)) {
              const bucket = survivalYearScale.bucketOf(
                cohortMonth.slice(0, 4),
              );
              values[bucket] = (values[bucket] ?? 0) + lines;
            }
            return { dateMs: new Date(row.date).getTime(), values };
          }),
          seriesKeys: survivalYearScale.buckets,
          colors: survivalYearScale.buckets.map((bucket) =>
            survivalYearScale.colorOf(cohortBaseColor, bucket),
          ),
        };

  const languagesHasYearData = data.survival.some(
    (row) => row.byLanguageYear !== undefined,
  );

  // Blame-based counterpart to the per-commit chart: the same lines over the
  // same files, shaded by the year each was written. Languages the flat chart
  // also shows keep its colors so toggling doesn't recolor the stack; the two
  // top-7 lists can still differ, since survival samples fewer commits, so an
  // extra takes a palette slot past the flat chart's.
  const languagesYearChart: StackedChart | undefined = languagesHasYearData
    ? shapeYearBands(
        data.survival.map((row) => ({
          date: row.date,
          byGroupYear: row.byLanguageYear ?? {},
        })),
        7,
        survivalYearScale,
        (label, rank) => {
          const flatKeys = languagesChart.seriesKeys;
          const matched = flatKeys.indexOf(label);
          const slot = matched === -1 ? flatKeys.length + rank : matched;
          return (
            categoricalColors[slot % categoricalColors.length] ?? otherColor
          );
        },
      )
    : undefined;

  const survivalHasYearData = data.survival.some(
    (row) => row.byContributorYear !== undefined,
  );

  // Flat one-color-per-contributor stack when age shading is off, or when a
  // pre-per-year dashboard.json has no byContributorYear to shade with.
  let survivalAuthorChart: StackedChart | undefined;
  if (data.survival.length > 0) {
    if (!shadeContributorsByYear || !survivalHasYearData) {
      const flat = shapeStacked(
        data.survival.map((row) => ({
          date: row.date,
          values: row.byContributor,
        })),
        maxContributorsInCharts,
      );
      survivalAuthorChart = {
        ...flat,
        colors: flat.seriesKeys.map((key, index) =>
          key === "Other"
            ? otherColor
            : (kindGroupSeriesColors[key] ??
              humanCategoricalColors[index % humanCategoricalColors.length] ??
              otherColor),
        ),
      };
    } else {
      survivalAuthorChart = shapeYearBands(
        data.survival.map((row) => ({
          date: row.date,
          byGroupYear: row.byContributorYear ?? {},
        })),
        maxContributorsInCharts,
        survivalYearScale,
        survivalBaseColorOf,
      );
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">{data.repo.name}</h1>
        <p className="mt-1 text-sm text-(--text-secondary)">
          {formatCount(data.repo.commitCount)} commits ·{" "}
          {data.repo.contributorCount} contributors ·{" "}
          {data.repo.firstCommitDate
            ? `${formatDate(data.repo.firstCommitDate)} — ${formatDate(data.repo.lastCommitDate ?? "")}`
            : "no history"}{" "}
          · generated {formatDate(data.generatedAt)} by repo-dive
        </p>
      </header>

      <div className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Commits" value={formatCount(data.repo.commitCount)} />
        <StatTile
          label="Lines"
          value={
            latestLanguages
              ? formatCount(
                  Object.values(latestLanguages.byLanguage).reduce(
                    (sum, lines) => sum + lines,
                    0,
                  ),
                )
              : "—"
          }
          hint="latest language snapshot"
        />
        <StatTile
          label="Files"
          value={
            latestFileTypes ? formatCount(latestFileTypes.totalFiles) : "—"
          }
          hint={
            latestFileTypes
              ? formatBytes(latestFileTypes.totalBytes)
              : undefined
          }
        />
        <StatTile
          label="Dependencies"
          value={
            latestDependencies ? formatCount(latestDependencies.resolved) : "—"
          }
          hint={
            latestDependencies
              ? `${formatCount(directDependenciesTotal)} direct${
                  hasManifestCounts
                    ? ` · ${formatCount(
                        latestDependencies.manifestCount ?? 0,
                      )} package.json`
                    : ""
                }`
              : undefined
          }
        />
        <StatTile
          label="AI commits"
          value={
            aiShareRecent === undefined ? "—" : formatPercent(aiShareRecent)
          }
          hint="last 90 days, by co-author"
        />
        <StatTile
          label="Suppressions"
          value={
            latestDirectives
              ? formatCount(
                  latestDirectives.eslintNextLine +
                    latestDirectives.eslintLine +
                    latestDirectives.eslintBlocks +
                    latestDirectives.tsIgnore +
                    latestDirectives.tsExpectError +
                    latestDirectives.tsNocheck,
                )
              : "—"
          }
          hint="eslint + ts directives now"
        />
      </div>

      {languagesChart.points.length > 0 && (
        <Section
          title="Lines by language"
          subtitle={
            shadeLanguagesByYear && languagesYearChart
              ? "the same lines, attributed via git blame at sampled commits and shaded by the year each one was written"
              : "lines in source files at each commit, grouped by language (from file extensions); lockfiles, minified bundles and generated data are not counted"
          }
          controls={
            languagesYearChart ? (
              <YearShadeToggle
                checked={shadeLanguagesByYear}
                onChange={setShadeLanguagesByYear}
              />
            ) : undefined
          }
        >
          <TimeSeriesChart
            mode="area"
            {...(shadeLanguagesByYear && languagesYearChart
              ? languagesYearChart
              : languagesChart)}
          />
          <DataTable
            caption="View data"
            header={["date", ...languagesChart.seriesKeys]}
            rows={languagesChart.points.map((point) => [
              formatDate(new Date(point.dateMs).toISOString()),
              ...languagesChart.seriesKeys.map((key) => point.values[key] ?? 0),
            ])}
          />
        </Section>
      )}

      {hasManifestData && (
        <Section
          title="Direct dependencies over time"
          subtitle="dependencies, devDependencies and optionalDependencies declared across all package.json files at each commit"
        >
          <TimeSeriesChart
            mode="area"
            {...directDependenciesChart}
            domainStartMs={repoStartMs}
            zeroLabel="No package.json"
          />
          <DataTable
            caption="View data"
            header={[
              "date",
              ...(hasManifestCounts ? ["package.json files"] : []),
              "dependencies",
              "devDependencies",
              "optionalDependencies",
            ]}
            rows={dependencies.map((row) => [
              formatDate(row.date),
              ...(hasManifestCounts ? [row.manifestCount ?? 0] : []),
              row.directProd,
              row.directDev,
              row.directOptional,
            ])}
          />
        </Section>
      )}

      {dependenciesChart.points.length > 0 && (
        <Section
          title="Dependencies over time"
          subtitle="resolved packages in the lockfile at each commit, split by package manager"
        >
          <TimeSeriesChart
            mode="area"
            {...dependenciesChart}
            domainStartMs={repoStartMs}
            zeroLabel="No lockfile"
          />
          <DataTable
            caption="View data"
            header={["date", "resolved"]}
            rows={dependencies.map((row) => [
              formatDate(row.date),
              row.resolved,
            ])}
          />
        </Section>
      )}

      {data.repo.firstCommitDate !== undefined && data.commits.length > 0 && (
        <Section
          title="Commit calendar"
          subtitle="commits per day; days bucketed by the author's local date"
          controls={
            <div className="mb-3 flex w-fit items-center gap-2">
              <Label
                htmlFor={calendarRangeSelectId}
                className="text-xs font-normal text-(--text-secondary)"
              >
                Range
              </Label>
              <Select
                value={calendarRange}
                onValueChange={(value) => {
                  // null is the "cleared" value; the range select always has one.
                  if (value !== null) {
                    setCalendarRange(value);
                  }
                }}
                items={calendarRangeItems}
              >
                <SelectTrigger
                  id={calendarRangeSelectId}
                  size="sm"
                  // No height override: the sm variant's data-[size=sm]:h-8
                  // out-specifies any bare h-* utility passed here.
                  className="px-2 py-1 text-xs"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {calendarRangeItems.map((item) => (
                    <SelectItem
                      key={item.value}
                      value={item.value}
                      className="text-xs"
                    >
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          }
        >
          <CommitCalendar
            // Remount on range change so a hovered day from the previous range
            // is not reported over the new one (mouseleave never fires when the
            // strips under the cursor are swapped).
            key={calendarRange}
            commits={data.commits}
            generatedAt={data.generatedAt}
            firstCommitDate={data.repo.firstCommitDate}
            weekStartsOn={data.config?.charts?.weekStartsOn ?? "monday"}
            range={calendarRange}
            kindFilter={calendarKindFilter}
            onKindFilterChange={setCalendarKindFilter}
          />
        </Section>
      )}

      <Section
        title="Commits per month"
        subtitle="split by author kind; hatched = human commits with at least one AI co-author trailer"
      >
        <TimeSeriesChart mode="bar" {...commitsChart} />
      </Section>

      <Section
        title="Churn per month"
        subtitle="lines added and deleted; hatched = lines added by AI-assisted commits"
      >
        <DivergingBars
          points={monthlyRows.map(([month, bucket]) => ({
            month,
            positive: bucket.added,
            negative: bucket.deleted,
            positiveSecondary: bucket.aiAdded,
          }))}
          positiveLabel="added"
          negativeLabel="deleted"
          positiveSecondaryLabel="added · AI-assisted"
          positiveSecondaryHatch={kindColors.ai}
        />
      </Section>

      {suppressionsChart.points.length > 0 && (
        <Section
          title="Fighting the linter"
          subtitle="suppression comments in the tree over time (block disables counted as one each)"
        >
          <TimeSeriesChart mode="line" {...suppressionsChart} />
        </Section>
      )}

      {data.topRules.length > 0 && (
        <Section
          title="Most-suppressed eslint rules"
          subtitle="at the latest commit; (all) = blanket disables without a rule list"
        >
          <BarList
            items={data.topRules.map((row) => ({
              id: row.rule,
              label: row.rule,
              value: row.count,
            }))}
            color="var(--series-6)"
          />
        </Section>
      )}

      {survivalCohortChart && (
        <Section
          title="Code survival by cohort"
          subtitle="living lines at sampled commits, grouped by the year each line was written"
        >
          <TimeSeriesChart mode="area" {...survivalCohortChart} />
        </Section>
      )}

      {survivalAuthorChart && (
        <Section
          title="Code survival by contributor"
          subtitle="who wrote the lines that are still alive"
          controls={
            survivalHasYearData ? (
              <YearShadeToggle
                checked={shadeContributorsByYear}
                onChange={setShadeContributorsByYear}
              />
            ) : undefined
          }
        >
          <TimeSeriesChart mode="area" {...survivalAuthorChart} />
        </Section>
      )}

      {data.aiIdentities.length > 0 && (
        <Section
          title="AI co-authors"
          subtitle="commits co-authored per AI identity"
        >
          <BarList
            items={data.aiIdentities.map((row) => ({
              id: row.identity,
              label: row.identity,
              value: row.commits,
            }))}
            color={kindColors.ai}
          />
        </Section>
      )}

      <Section
        title="Contributors"
        subtitle="human contributors by commit count"
      >
        <DataTable
          caption={`All ${data.contributors.length} listed contributors`}
          header={["contributor", "commits", "added", "deleted"]}
          rows={data.contributors.map((contributor) => [
            <>
              {contributor.kind && contributor.kind !== "human" ? (
                <span
                  title={kindBadge[contributor.kind].title}
                  className="mr-1 select-none"
                >
                  <span
                    className="mr-1 inline-block size-2.5 rounded-xs"
                    style={{ background: kindColors[contributor.kind] }}
                  />
                  {kindBadge[contributor.kind].icon}
                </span>
              ) : undefined}
              {contributor.url ? (
                <a
                  href={contributor.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium hover:underline"
                >
                  {contributor.name}
                </a>
              ) : (
                contributor.name
              )}{" "}
              <span className="text-(--text-muted)">
                &lt;{contributor.email}&gt;
              </span>
            </>,
            contributor.commits,
            formatCount(contributor.added),
            formatCount(contributor.deleted),
          ])}
        />
        <BarList
          color={kindColors.human}
          items={humanContributors
            .slice(0, maxContributorsInCharts * 2)
            .map((contributor) => ({
              id: contributor.email,
              label: contributor.name || contributor.email,
              value: contributor.commits,
              href: contributor.url,
            }))}
        />
        {nonHumanContributors.length > 0 && (
          <>
            <h3 className="mt-6 mb-2 text-sm font-medium text-(--text-secondary)">
              Bots &amp; AI agents
            </h3>
            <BarList
              items={nonHumanContributors.map((contributor) => ({
                id: contributor.email,
                label: `${kindBadge[contributor.kind === "ai" ? "ai" : "bot"].icon} ${contributor.name || contributor.email}`,
                value: contributor.commits,
                href: contributor.url,
                color: kindColors[contributor.kind === "ai" ? "ai" : "bot"],
              }))}
            />
          </>
        )}
      </Section>
    </main>
  );
}
