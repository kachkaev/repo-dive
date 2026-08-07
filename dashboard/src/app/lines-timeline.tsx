import { useDeferredValue, useState } from "react";

import type { DashboardData } from "../data.ts";
import { kindColors } from "./shared/contributor-kinds.tsx";
import { formatDate } from "./shared/format.ts";
import { DataTable, Section } from "./shared/primitives.tsx";
import {
  PercentControl,
  SegmentedControl,
} from "./shared/segmented-control.tsx";
import {
  categoricalColors,
  otherColor,
  shapeStacked,
} from "./shared/stacked-series.ts";
import {
  type LegendItem,
  type SeriesGroup,
  type TimePoint,
  TimeSeriesChart,
} from "./time-stack-chart.tsx";

/**
 * How many age bands the year-shaded variants distinguish before folding the
 * oldest years together. The actual count is the repo's age in years capped at
 * this, kept constant across every variant so a given year reads the same
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
 * The number of shades stays constant across variants so colors stay
 * comparable; years older than the window fold into a single `≤YYYY` bucket.
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
  legendItems?: LegendItem[];
  tooltipGroups?: SeriesGroup[];
  separateGroups?: boolean;
};

/**
 * Separates a group (contributor, language) from its year in a stack key — the
 * invisible ASCII unit separator, so no real group name can collide with a
 * group+year key.
 */
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
  const legendItems: LegendItem[] = [];
  const tooltipGroups: SeriesGroup[] = [];
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

// Bots and AI agents arrive pre-folded into one series per kind (indexing
// groups them), colored with the reserved kind colors; humans take palette
// slots by rank as before.
const contributorBaseColorOf = (label: string, rank: number): string =>
  kindGroupSeriesColors[label] ??
  humanCategoricalColors[rank % humanCategoricalColors.length] ??
  otherColor;

/** Newest year at full color, oldest palest — shared by the "all lines" stack. */
const cohortBaseColor = "var(--series-1)";

/**
 * How many languages the split-by-language variants name before folding the
 * rest into "Other". Shared by the flat and the shaded variant so both rank
 * the same number of stacks. (Intended to become a config option, alongside
 * `contributors.maxInCharts`.)
 */
const maxLanguagesInCharts = 7;

type LinesDimension = "all" | "language" | "contributor";

/** Split options in display order, which is also the fallback order. */
const linesDimensions: readonly LinesDimension[] = [
  "all",
  "language",
  "contributor",
];

/**
 * The unified lines-of-code timeline: one chart covering what used to be
 * "Lines by language", "Code survival by cohort" and "Code survival by
 * contributor", switched by three segmented controls (split dimension, age
 * shading, absolute/percentage). Controls sit above the frame; the legend,
 * chart and data table adapt to the selection.
 */
export function LinesTimeline({
  data,
  maxContributorsInCharts,
}: {
  data: DashboardData;
  maxContributorsInCharts: number;
}) {
  const [preferredDimension, setDimension] =
    useState<LinesDimension>("language");
  const [shadeByYear, setShadeByYear] = useState(false);
  const [percentMode, setPercentMode] = useState(false);

  // Every variant is drawn either from the dense per-commit rows ("flat") or
  // from the sampled blame cross-tabs ("shaded"), and a catalog can carry one
  // without the other: `repo-dive scan --collectors survival` writes no
  // language rows, and a dashboard.json written before a per-year field landed
  // simply lacks it. Tracking the two sources separately lets the toggles, the
  // effective selection and the fallbacks all follow what is actually there.
  const hasLanguages = data.languages.length > 0;
  const hasSurvival = data.survival.length > 0;
  const flatAvailable: Record<LinesDimension, boolean> = {
    all: hasLanguages,
    language: hasLanguages,
    contributor: hasSurvival,
  };
  const shadedAvailable: Record<LinesDimension, boolean> = {
    all: hasSurvival,
    language: data.survival.some((row) => row.byLanguageYear !== undefined),
    contributor: data.survival.some(
      (row) => row.byContributorYear !== undefined,
    ),
  };
  const canDraw = (candidate: LinesDimension) =>
    flatAvailable[candidate] || shadedAvailable[candidate];

  // Both selections are remembered across data that cannot express them; only
  // their effective values follow availability. Shading is additionally forced
  // on where it is the only source that can draw the current split.
  const preferredIsDrawable = canDraw(preferredDimension);
  const dimension = preferredIsDrawable
    ? preferredDimension
    : (linesDimensions.find(canDraw) ?? preferredDimension);
  const wantsShading = shadeByYear || !flatAvailable[dimension];
  const shaded = shadedAvailable[dimension] && wantsShading;

  // The controls above the frame track a click instantly (they read the values
  // above); the chart and the data table re-shape from these deferred copies
  // in a follow-up render that React keeps interruptible, so switching the
  // split on a large repo no longer freezes the toggles mid-press.
  const deferredDimension = useDeferredValue(dimension);
  const deferredShaded = useDeferredValue(shaded);
  const deferredPercentMode = useDeferredValue(percentMode);

  // One age scale shared by every shaded variant, so a given year reads the
  // same lightness band whether lines are split by language or by contributor.
  const survivalYearScale = makeYearScale(
    data.survival.flatMap((row) =>
      Object.keys(row.byCohort).map((cohortMonth) => cohortMonth.slice(0, 4)),
    ),
  );

  let chart: StackedChart;
  if (deferredDimension === "all") {
    chart = deferredShaded
      ? {
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
        }
      : {
          points: data.languages.map((row) => ({
            dateMs: new Date(row.date).getTime(),
            values: {
              Lines: Object.values(row.byLanguage).reduce(
                (sum, lines) => sum + lines,
                0,
              ),
            },
          })),
          seriesKeys: ["Lines"],
          colors: [cohortBaseColor],
          // A one-entry legend explains nothing — hide it.
          legendItems: [],
        };
  } else if (deferredDimension === "language") {
    if (deferredShaded) {
      // Blame-based counterpart to the per-commit stack: the same lines over
      // the same files, shaded by the year each was written. Languages the flat
      // variant also shows keep its colors so toggling doesn't recolor the
      // stack; the two top-7 lists can still differ, since survival samples
      // fewer commits, so an extra takes a palette slot past the flat chart's.
      const flatKeys = shapeStacked(
        data.languages.map((row) => ({
          date: row.date,
          values: row.byLanguage,
        })),
        maxLanguagesInCharts,
      ).seriesKeys;
      chart = shapeYearBands(
        data.survival.map((row) => ({
          date: row.date,
          byGroupYear: row.byLanguageYear ?? {},
        })),
        maxLanguagesInCharts,
        survivalYearScale,
        (label, rank) => {
          const matched = flatKeys.indexOf(label);
          const slot = matched === -1 ? flatKeys.length + rank : matched;
          return (
            categoricalColors[slot % categoricalColors.length] ?? otherColor
          );
        },
      );
    } else {
      chart = shapeStacked(
        data.languages.map((row) => ({
          date: row.date,
          values: row.byLanguage,
        })),
        maxLanguagesInCharts,
      );
    }
  } else {
    if (deferredShaded) {
      chart = shapeYearBands(
        data.survival.map((row) => ({
          date: row.date,
          byGroupYear: row.byContributorYear ?? {},
        })),
        maxContributorsInCharts,
        survivalYearScale,
        contributorBaseColorOf,
      );
    } else {
      const flat = shapeStacked(
        data.survival.map((row) => ({
          date: row.date,
          values: row.byContributor,
        })),
        maxContributorsInCharts,
      );
      chart = {
        ...flat,
        colors: flat.seriesKeys.map((key, index) =>
          key === "Other" ? otherColor : contributorBaseColorOf(key, index),
        ),
      };
    }
  }

  const supportsPercent = chart.seriesKeys.length > 1;

  // One x-domain across every variant: language rows cover each commit while
  // survival rows are sampled, so their extents differ slightly — without the
  // shared union, toggling the dimension would nudge the axis.
  let domainStartMs: number | undefined;
  let domainEndMs: number | undefined;
  for (const row of [...data.languages, ...data.survival]) {
    const dateMs = new Date(row.date).getTime();
    domainStartMs =
      domainStartMs === undefined ? dateMs : Math.min(domainStartMs, dateMs);
    domainEndMs =
      domainEndMs === undefined ? dateMs : Math.max(domainEndMs, dateMs);
  }

  // The data table follows the selection, collapsing year bands back into one
  // column per group (language, contributor) — same as the legend and tooltip.
  const tableColumns = chart.tooltipGroups
    ? chart.tooltipGroups.map((group) => ({
        label: group.label,
        keys: group.keys,
      }))
    : chart.seriesKeys.map((key) => ({ label: key, keys: [key] }));

  return (
    <Section
      title="Lines of code"
      // Constant across every toggle combination (see Section): language
      // splits count source files at each commit, while contributor splits
      // and age shading are attributed via git blame at sampled commits.
      subtitle="lines in source files over the whole history; contributor split and age shading come from git blame at sampled commits; lockfiles, minified bundles and generated data are not counted"
      controls={
        <>
          <SegmentedControl
            label="Split lines"
            value={dimension}
            onChange={setDimension}
            options={[
              {
                value: "all",
                label: "all lines",
                disabled: !canDraw("all"),
                title: canDraw("all") ? undefined : "No lines collected yet",
              },
              {
                value: "language",
                label: "by language",
                disabled: !canDraw("language"),
                title: canDraw("language")
                  ? undefined
                  : "No per-language data collected yet",
              },
              {
                value: "contributor",
                label: "by contributor",
                disabled: !canDraw("contributor"),
                title: canDraw("contributor")
                  ? undefined
                  : "No survival samples collected yet",
              },
            ]}
          />
          <SegmentedControl
            label="Age shading"
            value={shaded ? "shade" : "none"}
            onChange={(next) => {
              setShadeByYear(next === "shade");
            }}
            options={[
              {
                value: "none",
                label: "no shading",
                disabled: !flatAvailable[dimension],
                title: flatAvailable[dimension]
                  ? undefined
                  : "This split only exists in the blame samples, which are always dated",
              },
              {
                value: "shade",
                label: "shade by year written",
                disabled: !shadedAvailable[dimension],
                title: shadedAvailable[dimension]
                  ? undefined
                  : "No per-year survival data collected yet",
              },
            ]}
          />
          <PercentControl
            label="Lines of code value display"
            value={percentMode}
            onChange={setPercentMode}
            disabled={!supportsPercent}
            disabledTitle="A single series is always 100%"
          />
        </>
      }
      footer={
        <DataTable
          caption="View data"
          header={["date", ...tableColumns.map((column) => column.label)]}
          rows={chart.points.map((point) => [
            formatDate(new Date(point.dateMs).toISOString()),
            ...tableColumns.map((column) =>
              column.keys.reduce(
                (sum, key) => sum + (point.values[key] ?? 0),
                0,
              ),
            ),
          ])}
        />
      }
    >
      <TimeSeriesChart
        mode="area"
        percentMode={deferredPercentMode}
        domainStartMs={domainStartMs}
        domainEndMs={domainEndMs}
        {...chart}
      />
    </Section>
  );
}
