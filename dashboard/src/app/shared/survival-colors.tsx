import type { DashboardData } from "../../data.ts";
import { kindColors } from "./contributor-kinds.tsx";
import { categoricalColors, otherColor } from "./stacked-series.ts";

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

/**
 * One base color per language and per contributor, shared by every survival
 * timeline on the page. Both charts pass these to {@link SurvivalTimeline},
 * so a series keeps its color across "Lines of code" and "Number of files"
 * (and across each chart's flat and year-shaded variants). The `rank` is the
 * calling chart's own ranking, used only as a fallback for a label the scale
 * has never seen.
 */
export type SurvivalColorScales = {
  languageColorOf: (label: string, rank: number) => string;
  contributorColorOf: (label: string, rank: number) => string;
};

/** Keys of a value record, largest value first — the order charts rank by. */
const rankedKeys = (values: Record<string, number> | undefined): string[] =>
  Object.entries(values ?? {})
    .toSorted(([, left], [, right]) => right - left)
    .map(([key]) => key);

const append = (into: string[], keys: readonly string[]) => {
  for (const key of keys) {
    if (!into.includes(key)) {
      into.push(key);
    }
  }
};

/**
 * Builds the page's shared color scales from the latest snapshot of every
 * source a survival timeline can draw from. Palette slots are handed out in
 * the lines chart's own ranking first, so that chart still reads in palette
 * order; languages and contributors that only the file-grain sources add take
 * the slots after it. The file chart therefore shows shared series in the
 * lines chart's colors — possibly "out of rank order" within its own stack,
 * which is the point: color identifies the series, its position carries the
 * rank.
 */
export function survivalColorScalesOf(
  data: DashboardData,
): SurvivalColorScales {
  const languageOrder: string[] = [];
  const contributorOrder: string[] = [];

  // Lines sources first (flat scan, then blame samples), file sources after —
  // matching the page order of the charts the slots are anchored to.
  append(languageOrder, rankedKeys(data.languages.at(-1)?.byLanguage));
  append(languageOrder, rankedKeys(data.survival.at(-1)?.byLanguage));
  append(languageOrder, rankedKeys(data.languages.at(-1)?.byLanguageFiles));
  append(languageOrder, rankedKeys(data.fileSurvival?.at(-1)?.byLanguage));

  append(contributorOrder, rankedKeys(data.survival.at(-1)?.byContributor));
  append(
    contributorOrder,
    rankedKeys(data.fileSurvival?.at(-1)?.byContributor),
  );

  const languageSlots = new Map(
    languageOrder.map((label, slot) => [label, slot]),
  );
  // The kind groups draw reserved colors, so they must not consume the human
  // palette slots — a person's color cannot depend on whether bots rank above
  // them.
  const humanSlots = new Map(
    contributorOrder
      .filter((label) => !(label in kindGroupSeriesColors))
      .map((label, slot) => [label, slot]),
  );

  return {
    languageColorOf: (label, rank) => {
      const slot = languageSlots.get(label) ?? languageOrder.length + rank;
      return categoricalColors[slot % categoricalColors.length] ?? otherColor;
    },
    contributorColorOf: (label, rank) => {
      const reserved = kindGroupSeriesColors[label];
      if (reserved !== undefined) {
        return reserved;
      }
      const slot = humanSlots.get(label) ?? humanSlots.size + rank;
      return (
        humanCategoricalColors[slot % humanCategoricalColors.length] ??
        otherColor
      );
    },
  };
}
