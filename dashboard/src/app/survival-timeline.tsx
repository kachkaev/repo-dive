import { useDeferredValue, useState } from "react";

import { formatDate } from "./shared/format.ts";
import { DataTable, Section } from "./shared/primitives.tsx";
import {
  PercentControl,
  SegmentedControl,
} from "./shared/segmented-control.tsx";
import { otherColor, shapeStacked } from "./shared/stacked-series.ts";
import type { SurvivalColorScales } from "./shared/survival-colors.tsx";
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
const yearBandSeparator = "";

/**
 * Sum of a value record — a group's living units across its year bands, a
 * row's across its groups. Every variant stacks one of these, so it is also
 * what the shared y-domain is measured in.
 */
function sumValues(byKey: Record<string, number>): number {
  return Object.values(byKey).reduce((total, value) => total + value, 0);
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
  /** Base color per kept group given its rank in this chart. */
  baseColorOf: (label: string, rank: number) => string,
): StackedChart {
  const latest = rows.at(-1)?.byGroupYear ?? {};
  const ranked = Object.entries(latest)
    .toSorted(([, left], [, right]) => sumValues(right) - sumValues(left))
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
      for (const [year, value] of Object.entries(byYear)) {
        const key = `${group}${yearBandSeparator}${yearScale.bucketOf(year)}`;
        values[key] = (values[key] ?? 0) + value;
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

/** Newest year at full color, oldest palest — shared by the "all units" stack. */
const cohortBaseColor = "var(--series-1)";

/**
 * How many languages the split-by-language variants name before folding the
 * rest into "Other". Shared by the flat and the shaded variant so both rank
 * the same number of stacks. (Intended to become a config option, alongside
 * `contributors.maxInCharts`.)
 */
const maxLanguagesInCharts = 7;

type SplitDimension = "all" | "language" | "contributor";

/** Split options in display order, which is also the fallback order. */
const splitDimensions: readonly SplitDimension[] = [
  "language",
  "contributor",
  "all",
];

/**
 * One survival cross-tab sample, at either grain (lines or files). The
 * structural twin of dashboard.json's survival rows, declared here so the
 * component works for any series of this shape.
 */
export type SurvivalTimelineRow = {
  date: string;
  byCohort: Record<string, number>;
  byContributor: Record<string, number>;
  byContributorYear?: Record<string, Record<string, number>> | undefined;
  byLanguage: Record<string, number>;
  byLanguageYear?: Record<string, Record<string, number>> | undefined;
};

/**
 * A unified living-code timeline at one grain — lines of code or file counts —
 * switched by three segmented controls (split dimension, age shading,
 * absolute/percentage). Controls sit above the frame; the legend, chart and
 * data table adapt to the selection.
 *
 * Every variant is drawn from one of two sources: dense per-commit flat rows
 * (`flatRows` — language values at every collected commit) or sampled survival
 * cross-tabs (`survivalRows` — creator/cohort attribution at sampled commits),
 * and a catalog can carry one without the other. Tracking the two sources
 * separately lets the toggles, the effective selection and the fallbacks all
 * follow what is actually there.
 */
export function SurvivalTimeline({
  title,
  subtitle,
  annotation,
  unit,
  flatRows,
  survivalRows,
  maxContributorsInCharts,
  colorScales,
}: {
  title: string;
  subtitle: string;
  annotation?: string | undefined;
  /** Lowercase plural of the counted unit — "lines" or "files"; labels the controls. */
  unit: "lines" | "files";
  /** Dense per-commit values by language, for the flat (unshaded) variants. */
  flatRows: ReadonlyArray<{ date: string; values: Record<string, number> }>;
  survivalRows: readonly SurvivalTimelineRow[];
  maxContributorsInCharts: number;
  /**
   * The page-wide color scales (see {@link survivalColorScalesOf}), so a
   * language or contributor keeps one color across every chart and variant.
   */
  colorScales: SurvivalColorScales;
}) {
  const [preferredDimension, setDimension] =
    useState<SplitDimension>("language");
  // Age shading is the default only when it has at least two year bands to
  // tell apart: with all surviving units authored in one calendar year, every
  // band is the newest and the shaded variant renders identically to the flat
  // one. Counted from the same cohort years the year scale below buckets.
  const shadedYearCount = new Set(
    survivalRows.flatMap((row) =>
      Object.keys(row.byCohort).map((cohortMonth) => cohortMonth.slice(0, 4)),
    ),
  ).size;
  const [shadeByYear, setShadeByYear] = useState(shadedYearCount >= 2);
  const [percentMode, setPercentMode] = useState(false);

  const hasFlat = flatRows.length > 0;
  const hasSurvival = survivalRows.length > 0;
  const flatAvailable: Record<SplitDimension, boolean> = {
    all: hasFlat,
    language: hasFlat,
    contributor: hasSurvival,
  };
  const shadedAvailable: Record<SplitDimension, boolean> = {
    all: hasSurvival,
    language: survivalRows.some((row) => row.byLanguageYear !== undefined),
    contributor: survivalRows.some(
      (row) => row.byContributorYear !== undefined,
    ),
  };
  const canDraw = (candidate: SplitDimension) =>
    flatAvailable[candidate] || shadedAvailable[candidate];

  // Both selections are remembered across data that cannot express them; only
  // their effective values follow availability. Shading is additionally forced
  // on where it is the only source that can draw the current split.
  const preferredIsDrawable = canDraw(preferredDimension);
  const dimension = preferredIsDrawable
    ? preferredDimension
    : (splitDimensions.find(canDraw) ?? preferredDimension);
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
  // same lightness band whether units are split by language or by contributor.
  const survivalYearScale = makeYearScale(
    survivalRows.flatMap((row) =>
      Object.keys(row.byCohort).map((cohortMonth) => cohortMonth.slice(0, 4)),
    ),
  );

  /** Series label of the single-stack "all units" variant: "Lines" / "Files". */
  const allSeriesLabel = unit === "lines" ? "Lines" : "Files";

  let chart: StackedChart;
  if (deferredDimension === "all") {
    chart = deferredShaded
      ? {
          points: survivalRows.map((row) => {
            const values: Record<string, number> = {};
            for (const [cohortMonth, value] of Object.entries(row.byCohort)) {
              const bucket = survivalYearScale.bucketOf(
                cohortMonth.slice(0, 4),
              );
              values[bucket] = (values[bucket] ?? 0) + value;
            }
            return { dateMs: new Date(row.date).getTime(), values };
          }),
          seriesKeys: survivalYearScale.buckets,
          colors: survivalYearScale.buckets.map((bucket) =>
            survivalYearScale.colorOf(cohortBaseColor, bucket),
          ),
        }
      : {
          points: flatRows.map((row) => ({
            dateMs: new Date(row.date).getTime(),
            values: { [allSeriesLabel]: sumValues(row.values) },
          })),
          seriesKeys: [allSeriesLabel],
          colors: [cohortBaseColor],
          // A one-entry legend explains nothing — hide it.
          legendItems: [],
        };
  } else if (deferredDimension === "language") {
    if (deferredShaded) {
      // Blame-based counterpart to the per-commit stack: the same units over
      // the same files, shaded by the year each was authored. The shared scale
      // keeps a language's color identical to the flat variant's — and to the
      // other chart's — even where the rankings disagree.
      chart = shapeYearBands(
        survivalRows.map((row) => ({
          date: row.date,
          byGroupYear: row.byLanguageYear ?? {},
        })),
        maxLanguagesInCharts,
        survivalYearScale,
        colorScales.languageColorOf,
      );
    } else {
      const flat = shapeStacked([...flatRows], maxLanguagesInCharts);
      chart = {
        ...flat,
        colors: flat.seriesKeys.map((key, index) =>
          key === "Other"
            ? otherColor
            : colorScales.languageColorOf(key, index),
        ),
      };
    }
  } else {
    if (deferredShaded) {
      chart = shapeYearBands(
        survivalRows.map((row) => ({
          date: row.date,
          byGroupYear: row.byContributorYear ?? {},
        })),
        maxContributorsInCharts,
        survivalYearScale,
        colorScales.contributorColorOf,
      );
    } else {
      const flat = shapeStacked(
        survivalRows.map((row) => ({
          date: row.date,
          values: row.byContributor,
        })),
        maxContributorsInCharts,
      );
      chart = {
        ...flat,
        colors: flat.seriesKeys.map((key, index) =>
          key === "Other"
            ? otherColor
            : colorScales.contributorColorOf(key, index),
        ),
      };
    }
  }

  const supportsPercent = chart.seriesKeys.length > 1;

  // In the split variants the primary legend names the groups, so the year
  // shades would be left unexplained — a second legend row names them, drawn
  // in the same base color as the all-units stack (the concrete hues differ
  // per group, but the light-to-dark direction is what the row conveys). The
  // all-units variant needs none: its only legend already is the years.
  const yearLegendItems =
    deferredShaded && deferredDimension !== "all"
      ? survivalYearScale.buckets.map((bucket) => ({
          label: bucket,
          color: survivalYearScale.colorOf(cohortBaseColor, bucket),
        }))
      : undefined;

  // One domain on both axes across every variant, so the toggles change what
  // the stack is made of and nothing else. The variants are drawn from two
  // sources — per-commit flat counts and survival cross-tabs at sampled
  // commits — whose extents differ slightly, and whose totals can differ
  // outright when the two collectors disagree about which files count.
  //
  // The y bound is a row total rather than a stack height because no variant
  // loses units on the way to the chart: the ranked tail folds into "Other",
  // and age shading splits a group into year bands rather than trimming it. So
  // the tallest stack the section can draw is simply the largest row total
  // across both sources. Pinning it also stops each variant from rescaling to
  // fill the frame, which used to hide those disagreements between sources
  // instead of showing them.
  let domainStartMs: number | undefined;
  let domainEndMs: number | undefined;
  let domainPeak = 0;
  for (const date of [
    ...flatRows.map((row) => row.date),
    ...survivalRows.map((row) => row.date),
  ]) {
    const dateMs = new Date(date).getTime();
    domainStartMs =
      domainStartMs === undefined ? dateMs : Math.min(domainStartMs, dateMs);
    domainEndMs =
      domainEndMs === undefined ? dateMs : Math.max(domainEndMs, dateMs);
  }
  for (const row of flatRows) {
    domainPeak = Math.max(domainPeak, sumValues(row.values));
  }
  for (const row of survivalRows) {
    // Every survival cross-tab partitions the same living units, so `byCohort`
    // — the one field present in every dashboard.json — gives the row's total
    // for the by-contributor and year-banded variants alike.
    domainPeak = Math.max(domainPeak, sumValues(row.byCohort));
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
      title={title}
      subtitle={subtitle}
      annotation={annotation}
      controls={
        <>
          <SegmentedControl
            label={`Split ${unit}`}
            value={dimension}
            onChange={setDimension}
            options={[
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
              {
                value: "all",
                label: `all ${unit}`,
                disabled: !canDraw("all"),
                title: canDraw("all") ? undefined : `No ${unit} collected yet`,
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
                value: "shade",
                label:
                  unit === "lines"
                    ? "shade by year written"
                    : "shade by year created",
                disabled: !shadedAvailable[dimension],
                title: shadedAvailable[dimension]
                  ? undefined
                  : "No per-year survival data collected yet",
              },
              {
                value: "none",
                label: "no shading",
                disabled: !flatAvailable[dimension],
                title: flatAvailable[dimension]
                  ? undefined
                  : "This split only exists in the survival samples, which are always dated",
              },
            ]}
          />
          <PercentControl
            label={`${title} value display`}
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
        domainPeak={domainPeak}
        secondaryLegendItems={yearLegendItems}
        {...chart}
      />
    </Section>
  );
}
