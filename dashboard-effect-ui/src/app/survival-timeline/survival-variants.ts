import { Schema } from "effect";

import { cachedBy } from "../shared/cached-by.ts";
import { otherColor, shapeStacked } from "../shared/stacked-series.ts";
import type { SurvivalColorScales } from "../shared/survival-colors.ts";
import type { LegendItem } from "../time-stack-chart.ts";
import {
  makeYearScale,
  shapeYearBands,
  type StackedChart,
  sumValues,
  type YearScale,
} from "./year-bands.ts";

/** Newest year at full color, oldest palest — shared by the "all units" stack. */
const cohortBaseColor = "var(--series-1)";

/**
 * How many languages the split-by-language variants name before folding the
 * rest into "Other". Shared by the flat and the shaded variant so both rank
 * the same number of stacks. (Intended to become a config option, alongside
 * `contributors.maxInCharts`.)
 */
const maxLanguagesInCharts = 7;

export const SplitDimensionSchema = Schema.Literals([
  "all",
  "language",
  "contributor",
  "purpose",
]);
export type SplitDimension = typeof SplitDimensionSchema.Type;

/** Split options in display order, which is also the fallback order. */
const splitDimensions: readonly SplitDimension[] = [
  "language",
  "purpose",
  "contributor",
  "all",
];

/** Lowercase plural of the counted unit — "lines" or "files". */
export const SurvivalUnitSchema = Schema.Literals(["lines", "files"]);
export type SurvivalUnit = typeof SurvivalUnitSchema.Type;

/**
 * One survival cross-tab sample, at either grain (lines or files). The
 * structural twin of dashboard.json's survival rows, declared here so the
 * component works for any series of this shape.
 */
const countsSchema = Schema.Record(Schema.String, Schema.Number);
const countsByYearSchema = Schema.Record(Schema.String, countsSchema);
export const SurvivalTimelineRowSchema = Schema.Struct({
  date: Schema.String,
  byCohort: countsSchema,
  byContributor: countsSchema,
  byContributorYear: Schema.optional(countsByYearSchema),
  byLanguage: countsSchema,
  byLanguageYear: Schema.optional(countsByYearSchema),
  byPurpose: Schema.optional(countsSchema),
  byPurposeYear: Schema.optional(countsByYearSchema),
});
export type SurvivalTimelineRow = typeof SurvivalTimelineRowSchema.Type;

/** A dense per-commit sample: values by language. */
export const FlatRowSchema = Schema.Struct({
  date: Schema.String,
  values: countsSchema,
});
export type FlatRow = typeof FlatRowSchema.Type;

/** A "View data" column: one group, summing its year bands. */
type TableColumn = { label: string; keys: readonly string[] };

/** One variant of the chart, as the chart and the "View data" table draw it. */
export type SurvivalVariant = {
  readonly chart: StackedChart;
  readonly tableColumns: readonly TableColumn[];
};

/**
 * Everything the timeline derives from its rows that no control changes:
 * which variants can be drawn, the shared age scale and domain, and each
 * variant's chart — built on first use and kept, so a control flipped back
 * hands the chart and the table the very arrays they drew before.
 */
export type SurvivalVariants = {
  readonly flatAvailable: Readonly<Record<SplitDimension, boolean>>;
  readonly shadedAvailable: Readonly<Record<SplitDimension, boolean>>;
  readonly canDraw: (candidate: SplitDimension) => boolean;
  /** Calendar years the surviving units were authored in. */
  readonly shadedYearCount: number;
  readonly domainStartMs: number | undefined;
  readonly domainEndMs: number | undefined;
  readonly domainPeak: number;
  /** The year shades, named under a split variant's primary legend. */
  readonly yearLegendItems: readonly LegendItem[];
  readonly variantOf: (
    dimension: SplitDimension,
    shaded: boolean,
  ) => SurvivalVariant;
};

/** The year (`YYYY`) of each cohort month every survival row holds. */
const cohortYearsOf = (survivalRows: readonly SurvivalTimelineRow[]) =>
  survivalRows.flatMap((row) =>
    Object.keys(row.byCohort).map((cohortMonth) => cohortMonth.slice(0, 4)),
  );

const chartOf = (
  dimension: SplitDimension,
  shaded: boolean,
  {
    flatRows,
    survivalRows,
    purposeRows,
    purposeOrder,
    maxContributorsInCharts,
    colorScales,
    unit,
    survivalYearScale,
  }: {
    flatRows: readonly FlatRow[];
    survivalRows: readonly SurvivalTimelineRow[];
    purposeRows: ReadonlyArray<{
      date: string;
      byPurpose: Record<string, number>;
      byPurposeYear: Record<string, Record<string, number>>;
    }>;
    purposeOrder: readonly string[];
    maxContributorsInCharts: number;
    colorScales: SurvivalColorScales;
    unit: SurvivalUnit;
    survivalYearScale: YearScale;
  },
): StackedChart => {
  /**
   * Series label of the single-stack "all units" variant — "All lines" / "All
   * files", so the hover card names the stack the way the split control does.
   */
  const allSeriesLabel = unit === "lines" ? "All lines" : "All files";

  switch (dimension) {
    case "all": {
      return shaded
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
    }
    case "language": {
      if (shaded) {
        // Blame-based counterpart to the per-commit stack: the same units over
        // the same files, shaded by the year each was authored. The shared scale
        // keeps a language's color identical to the flat variant's — and to the
        // other chart's — even where the rankings disagree.
        return shapeYearBands(
          survivalRows.map((row) => ({
            date: row.date,
            byGroupYear: row.byLanguageYear ?? {},
          })),
          maxLanguagesInCharts,
          survivalYearScale,
          colorScales.languageColorOf,
        );
      }
      const flat = shapeStacked([...flatRows], maxLanguagesInCharts);
      return {
        ...flat,
        colors: flat.seriesKeys.map((key, index) =>
          key === "Other"
            ? otherColor
            : colorScales.languageColorOf(key, index),
        ),
      };
    }
    case "purpose": {
      if (shaded) {
        return shapeYearBands(
          purposeRows.map((row) => ({
            date: row.date,
            byGroupYear: row.byPurposeYear,
          })),
          purposeOrder.length,
          survivalYearScale,
          colorScales.purposeColorOf,
          purposeOrder,
        );
      }
      const flat = shapeStacked(
        purposeRows.map((row) => ({ date: row.date, values: row.byPurpose })),
        purposeOrder.length,
        purposeOrder,
      );
      return {
        ...flat,
        colors: flat.seriesKeys.map((key, index) =>
          colorScales.purposeColorOf(key, index),
        ),
      };
    }
    case "contributor": {
      if (shaded) {
        return shapeYearBands(
          survivalRows.map((row) => ({
            date: row.date,
            byGroupYear: row.byContributorYear ?? {},
          })),
          maxContributorsInCharts,
          survivalYearScale,
          colorScales.contributorColorOf,
        );
      }
      const flat = shapeStacked(
        survivalRows.map((row) => ({
          date: row.date,
          values: row.byContributor,
        })),
        maxContributorsInCharts,
      );
      return {
        ...flat,
        colors: flat.seriesKeys.map((key, index) =>
          key === "Other"
            ? otherColor
            : colorScales.contributorColorOf(key, index),
        ),
      };
    }
  }
};

/**
 * The derivations of the React `SurvivalTimeline`'s render that depend only on
 * its props, once per distinct set of them. Keyed by `flatRows`, which every
 * caller builds once per dashboard.json (see `lines-timeline.ts`), so the
 * lines and the files timelines each keep a slot of their own.
 */
export const survivalVariantsOf = cachedBy(
  (
    flatRows: readonly FlatRow[],
    survivalRows: readonly SurvivalTimelineRow[],
    purposeOrder: readonly string[],
    maxContributorsInCharts: number,
    colorScales: SurvivalColorScales,
    unit: SurvivalUnit,
  ): SurvivalVariants => {
    // Age shading is the default only when it has at least two year bands to
    // tell apart: with all surviving units authored in one calendar year, every
    // band is the newest and the shaded variant renders identically to the flat
    // one. Counted from the same cohort years the year scale below buckets.
    const shadedYearCount = new Set(cohortYearsOf(survivalRows)).size;

    const hasFlat = flatRows.length > 0;
    const hasSurvival = survivalRows.length > 0;
    // Samples collected before survival outputs kept paths know no purposes;
    // the split draws what the others can, rather than a cliff down to nothing.
    const purposeRows = survivalRows.flatMap((row) =>
      row.byPurpose === undefined
        ? []
        : [
            {
              date: row.date,
              byPurpose: row.byPurpose,
              byPurposeYear: row.byPurposeYear ?? {},
            },
          ],
    );
    const hasPurposes = purposeRows.length > 0;
    const flatAvailable: Record<SplitDimension, boolean> = {
      all: hasFlat,
      language: hasFlat,
      contributor: hasSurvival,
      purpose: hasPurposes,
    };
    const shadedAvailable: Record<SplitDimension, boolean> = {
      all: hasSurvival,
      language: survivalRows.some((row) => row.byLanguageYear !== undefined),
      contributor: survivalRows.some(
        (row) => row.byContributorYear !== undefined,
      ),
      purpose: hasPurposes,
    };
    const canDraw = (candidate: SplitDimension) =>
      flatAvailable[candidate] || shadedAvailable[candidate];

    // One age scale shared by every shaded variant, so a given year reads the
    // same lightness band whether units are split by language or by
    // contributor.
    const survivalYearScale = makeYearScale(cohortYearsOf(survivalRows));

    // In the split variants the primary legend names the groups, so the year
    // shades would be left unexplained — a second legend row names them, drawn
    // in the same base color as the all-units stack (the concrete hues differ
    // per group, but the light-to-dark direction is what the row conveys). The
    // all-units variant needs none: its only legend already is the years.
    const yearLegendItems = survivalYearScale.buckets.map((bucket) => ({
      label: bucket,
      color: survivalYearScale.colorOf(cohortBaseColor, bucket),
    }));

    // One domain on both axes across every variant, so the toggles change what
    // the stack is made of and nothing else. The variants are drawn from two
    // sources — per-commit flat counts and survival cross-tabs at sampled
    // commits — whose extents differ slightly, and whose totals can differ
    // outright when the two collectors disagree about which files count.
    //
    // The y bound is a row total rather than a stack height because no variant
    // loses units on the way to the chart: the ranked tail folds into "Other",
    // and age shading splits a group into year bands rather than trimming it.
    // So the tallest stack the section can draw is simply the largest row
    // total across both sources. Pinning it also stops each variant from
    // rescaling to fill the frame, which used to hide those disagreements
    // between sources instead of showing them.
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
      // Every survival cross-tab partitions the same living units, so
      // `byCohort` — the one field present in every dashboard.json — gives the
      // row's total for the by-contributor and year-banded variants alike.
      domainPeak = Math.max(domainPeak, sumValues(row.byCohort));
    }

    // Filled on first use: shaping a variant on a large repo takes a while,
    // and most viewers look at two or three of the eight.
    const variants = new Map<string, SurvivalVariant>();
    const variantOf = (
      dimension: SplitDimension,
      shaded: boolean,
    ): SurvivalVariant => {
      const variantKey = `${dimension}:${String(shaded)}`;
      const cached = variants.get(variantKey);
      if (cached !== undefined) {
        return cached;
      }
      const chart = chartOf(dimension, shaded, {
        flatRows,
        survivalRows,
        purposeRows,
        purposeOrder,
        maxContributorsInCharts,
        colorScales,
        unit,
        survivalYearScale,
      });
      // The data table follows the selection, collapsing year bands back into
      // one column per group (language, contributor) — same as the legend and
      // tooltip.
      const tableColumns = chart.tooltipGroups
        ? chart.tooltipGroups.map((group) => ({
            label: group.label,
            keys: group.keys,
          }))
        : chart.seriesKeys.map((key) => ({ label: key, keys: [key] }));
      const variant = { chart, tableColumns };
      variants.set(variantKey, variant);
      return variant;
    };

    return {
      flatAvailable,
      shadedAvailable,
      canDraw,
      shadedYearCount,
      domainStartMs,
      domainEndMs,
      domainPeak,
      yearLegendItems,
      variantOf,
    };
  },
);

/**
 * The split and the shading the controls show: both preferences are
 * remembered across data that cannot express them; only their effective
 * values follow availability. Shading is additionally forced on where it is
 * the only source that can draw the current split.
 */
export const effectiveSelectionOf = (
  variants: SurvivalVariants,
  preferredDimension: SplitDimension,
  shadeByYear: boolean,
): { dimension: SplitDimension; shaded: boolean } => {
  const preferredIsDrawable = variants.canDraw(preferredDimension);
  const dimension = preferredIsDrawable
    ? preferredDimension
    : (splitDimensions.find(variants.canDraw) ?? preferredDimension);
  const wantsShading = shadeByYear || !variants.flatAvailable[dimension];
  const shaded = variants.shadedAvailable[dimension] && wantsShading;
  return { dimension, shaded };
};
