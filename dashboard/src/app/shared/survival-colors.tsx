import type { DashboardData } from "../../data.ts";
import { kindColors } from "./contributor-kinds.tsx";
import { languageColors, unknownTypeColors } from "./language-colors.ts";
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
 * The contributor palette (see styles.css), handed out in rank order. Its own
 * set rather than the generic series slots: slot 1 is the human teal, and the
 * leading slots stay clear of the blues the language split leads with and the
 * greens of the purpose split, so switching the split repaints the chart.
 */
const contributorColors = Array.from(
  { length: 10 },
  (_, index) => `var(--contributor-${index + 1})`,
);

/**
 * Built-in file purposes keep one color in every repository, so that charts read
 * alike from one report to the next. AI instructions wear the color AI agents
 * have among contributors. Must match the labels in
 * src/cli/shared/file-purposes.ts.
 */
const builtInPurposeColors: Record<string, string> = {
  Production: "var(--purpose-production)",
  Tests: "var(--purpose-tests)",
  Docs: "var(--purpose-docs)",
  Examples: "var(--purpose-examples)",
  Tooling: "var(--purpose-tooling)",
  "AI instructions": kindColors.ai,
  "Test data": "var(--purpose-test-data)",
  Assets: "var(--purpose-assets)",
  "Generated & vendored": "var(--purpose-generated)",
  Other: otherColor,
};

/**
 * What custom file purposes draw from: the generic series slots, minus the
 * amber that reads as Bots and the purples that read as AI agents.
 */
const customPurposeColors = categoricalColors.filter(
  (color) =>
    !["var(--series-3)", "var(--series-11)", "var(--series-16)"].includes(
      color,
    ),
);

/**
 * One base color per language, contributor and file purpose, shared by every
 * survival timeline on the page. Languages and purposes are fixed tables;
 * contributors take the contributor palette in rank order. Both charts pass these to {@link SurvivalTimeline},
 * so a series keeps its color across "Lines of code" and "Number of files"
 * (and across each chart's flat and year-shaded variants). The `rank` is the
 * calling chart's own ranking, used only as a fallback for a label the scale
 * has never seen.
 */
export type SurvivalColorScales = {
  languageColorOf: (label: string, rank: number) => string;
  contributorColorOf: (label: string, rank: number) => string;
  purposeColorOf: (label: string, rank: number) => string;
};

/** File purposes in stack order, as the data's config lists them. */
export const filePurposeLabelsOf = (data: DashboardData): string[] =>
  (data.config?.filePurposes ?? []).map((purpose) => purpose.label);

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
 * source a survival timeline can draw from. Languages wear their fixed color
 * (see language-colors.ts); only the files chart's unknown types and the
 * contributors take slots. Slots are handed out in the lines chart's own
 * ranking first, so that chart still reads in palette order; unknown types and
 * contributors that only the file-grain sources add take the slots after it. The file chart therefore shows shared series in the
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
  append(languageOrder, rankedKeys(data.fileTypes.at(-1)?.byLanguage));
  append(languageOrder, rankedKeys(data.fileSurvival?.at(-1)?.byLanguage));

  append(contributorOrder, rankedKeys(data.survival.at(-1)?.byContributor));
  append(
    contributorOrder,
    rankedKeys(data.fileSurvival?.at(-1)?.byContributor),
  );

  const unknownTypeSlots = new Map(
    languageOrder
      .filter((label) => !Object.hasOwn(languageColors, label))
      .map((label, slot) => [label, slot]),
  );
  // The kind groups draw reserved colors, so they must not consume the human
  // palette slots — a person's color cannot depend on whether bots rank above
  // them.
  const humanSlots = new Map(
    contributorOrder
      .filter((label) => !Object.hasOwn(kindGroupSeriesColors, label))
      .map((label, slot) => [label, slot]),
  );
  const customPurposes = (data.config?.filePurposes ?? [])
    .map((purpose) => purpose.label)
    .filter((label) => !Object.hasOwn(builtInPurposeColors, label));

  return {
    languageColorOf: (label, rank) => {
      const fixed = languageColors[label];
      if (fixed !== undefined) {
        return fixed;
      }
      const slot = unknownTypeSlots.get(label) ?? unknownTypeSlots.size + rank;
      return unknownTypeColors[slot % unknownTypeColors.length] ?? otherColor;
    },
    contributorColorOf: (label, rank) => {
      const reserved = kindGroupSeriesColors[label];
      if (reserved !== undefined) {
        return reserved;
      }
      const slot = humanSlots.get(label) ?? humanSlots.size + rank;
      return contributorColors[slot % contributorColors.length] ?? otherColor;
    },
    purposeColorOf: (label, rank) => {
      const slot = customPurposes.indexOf(label);
      return (
        builtInPurposeColors[label] ??
        customPurposeColors[
          (slot === -1 ? customPurposes.length + rank : slot) %
            customPurposeColors.length
        ] ??
        otherColor
      );
    },
  };
}
