// Copied verbatim from the helpers at the top of the React
// `survival-timeline.tsx`, which keeps them inside the component's module.
import { otherColor } from "../shared/stacked-series.ts";
import type {
  LegendItem,
  SeriesGroup,
  TimePoint,
} from "../time-stack-chart.ts";

/**
 * How many age bands the year-shaded variants distinguish before folding the
 * oldest years together. The actual count is the repo's age in years capped at
 * this, kept constant across every variant so a given year reads the same
 * shade everywhere. Sized with {@link maxYearFade} so that one year of age
 * still fades a band by about 8% (55% over seven steps): fewer shades would
 * fold too much history, more would leave neighboring years hard to tell
 * apart. (Intended to become a config option.)
 */
const maxYearShades = 8;

/**
 * How far the oldest band fades toward the surface at most; newest stays full
 * color. Kept at about half, so even the oldest band keeps enough of its
 * category's color to tell it from the neighboring categories.
 */
const maxYearFade = 55;

/**
 * The most one year of age may fade a band. With only a few years the full
 * {@link maxYearFade} range would put adjacent years far apart (two years
 * would jump straight from full color to 55% faded), so short histories use a
 * narrower range; from four years on the steps fall below this cap and the
 * oldest band reaches the full fade.
 */
const maxYearFadeStep = 25;

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
  const fadeStep = Math.min(maxYearFade / (shadeCount - 1), maxYearFadeStep);
  const fade = Math.round(ageFromNewest * fadeStep);
  return `color-mix(in oklab, ${baseColor} ${100 - fade}%, var(--surface-1))`;
}

export type YearScale = {
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
export function makeYearScale(years: Iterable<string>): YearScale {
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

export type StackedChart = {
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
export function sumValues(byKey: Record<string, number>): number {
  return Object.values(byKey).reduce((total, value) => total + value, 0);
}

/**
 * Shapes a survival cross-tab into year-banded stacks: each group (contributor,
 * language, …) is a contiguous run of sub-series (oldest→newest), colored as
 * lightness bands of the group's base color. Top groups are kept; the rest fold
 * into "Other". The legend and tooltip collapse the bands back to one row each.
 */
export function shapeYearBands(
  rows: ReadonlyArray<{
    date: string;
    byGroupYear: Record<string, Record<string, number>>;
  }>,
  maxSeries: number,
  yearScale: YearScale,
  /** Base color per kept group given its rank in this chart. */
  baseColorOf: (label: string, rank: number) => string,
  /**
   * A fixed vocabulary of groups: they stack in this order, those no row holds
   * are left out, and nothing gets folded (`maxSeries` is then moot).
   */
  fixedOrder?: readonly string[],
): StackedChart {
  const latest = rows.at(-1)?.byGroupYear ?? {};
  const ranked =
    fixedOrder?.filter((name) =>
      rows.some((row) => sumValues(row.byGroupYear[name] ?? {}) > 0),
    ) ??
    Object.entries(latest)
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
