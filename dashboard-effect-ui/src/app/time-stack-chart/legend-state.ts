import { memoBy } from "./memo-by.ts";
import type { LegendItem, SeriesGroup } from "./schemas.ts";

const noLegendItems: readonly LegendItem[] = [];
const noHatch: Readonly<Record<string, string>> = {};
const noHiddenLabels: ReadonlySet<string> = new Set();

const perSeriesLegendItemsOf = memoBy(
  (
    seriesKeys: readonly string[],
    colors: readonly string[],
    seriesHatch: Readonly<Record<string, string>>,
  ): readonly LegendItem[] =>
    seriesKeys.map((key, index) => ({
      label: key,
      color: colors[index] ?? "var(--series-1)",
      hatch: seriesHatch[key],
    })),
);

/**
 * The legend's items: the override when given (an empty one hides the legend
 * — a one-entry legend for a chart like the all-lines total explains
 * nothing), else one per series.
 */
export const resolvedLegendItemsOf = (options: {
  readonly seriesKeys: readonly string[];
  readonly colors: readonly string[];
  readonly seriesHatch?: Readonly<Record<string, string>> | undefined;
  readonly legendItems?: readonly LegendItem[] | undefined;
}): readonly LegendItem[] =>
  options.legendItems ??
  (options.seriesKeys.length === 0
    ? noLegendItems
    : perSeriesLegendItemsOf(
        options.seriesKeys,
        options.colors,
        options.seriesHatch ?? noHatch,
      ));

/**
 * The labels hidden on this chart: only those its legend names count — the
 * Model may remember labels from another variant (its contributors, say),
 * which wait, unseen, for that variant to come back. Nothing is hidden when
 * the legend has no toggles.
 */
export const hiddenLabelSetOf = memoBy(
  (
    hiddenLabels: readonly string[],
    legendItems: readonly LegendItem[],
    canToggle: boolean,
  ): ReadonlySet<string> => {
    if (!canToggle || hiddenLabels.length === 0) {
      return noHiddenLabels;
    }
    const legendLabels = new Set(legendItems.map((item) => item.label));
    return new Set(hiddenLabels.filter((label) => legendLabels.has(label)));
  },
);

/**
 * The subset of `seriesKeys` actually drawn, in the same order. A series the
 * viewer hid via the legend is left out of the stack entirely, so the ones
 * above it settle down onto the ones below; the scales are untouched. A
 * legend label stands for one series key of the same name, unless the tooltip
 * groups say it collapses several (a contributor's year bands).
 */
export const drawnKeysOf = memoBy(
  (
    seriesKeys: readonly string[],
    hiddenLabels: ReadonlySet<string>,
    tooltipGroups: readonly SeriesGroup[] | undefined,
  ): readonly string[] => {
    if (hiddenLabels.size === 0) {
      return seriesKeys;
    }
    const hiddenKeys = new Set(
      [...hiddenLabels].flatMap(
        (label) =>
          tooltipGroups?.find((group) => group.label === label)?.keys ?? [
            label,
          ],
      ),
    );
    return seriesKeys.filter((key) => !hiddenKeys.has(key));
  },
);

/** A click on a legend item: hides a visible label, shows a hidden one. */
export const toggledLabels = (
  hiddenLabels: readonly string[],
  label: string,
): readonly string[] =>
  hiddenLabels.includes(label)
    ? hiddenLabels.filter((hidden) => hidden !== label)
    : [...hiddenLabels, label];

/**
 * An alt/option click: isolates the label while anything else is showing;
 * once nothing else is (it is alone, or the chart is empty), brings
 * everything back.
 */
export const soloedLabels = (
  hiddenLabels: readonly string[],
  label: string,
  legendItems: readonly LegendItem[],
): readonly string[] => {
  const othersVisible = legendItems.some(
    (item) => item.label !== label && !hiddenLabels.includes(item.label),
  );
  return othersVisible
    ? legendItems
        .filter((item) => item.label !== label)
        .map((item) => item.label)
    : [];
};

/**
 * The topmost sub-series of every group but the last — where a crisp divider
 * is drawn between adjacent primary categories.
 */
export const groupBoundaryKeysOf = memoBy(
  (tooltipGroups: readonly SeriesGroup[]): ReadonlySet<string> => {
    const keys = new Set<string>();
    for (const group of tooltipGroups.slice(0, -1)) {
      const top = group.keys.at(-1);
      if (top !== undefined) {
        keys.add(top);
      }
    }
    return keys;
  },
);

/** One `<pattern>` per distinct hatch color; series map to them by color. */
export const hatchColorsOf = memoBy(
  (seriesHatch: Readonly<Record<string, string>>): readonly string[] => [
    ...new Set(Object.values(seriesHatch)),
  ],
);
