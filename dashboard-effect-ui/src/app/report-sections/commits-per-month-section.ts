import { UiSchema } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { Schema } from "effect";

import { type DashboardData, DashboardDataSchema } from "../../data.ts";
import { cachedBy } from "../shared/cached-by.ts";
import {
  kindColors,
  type KindFilter,
  KindFilterControl,
  KindFilterSchema,
} from "../shared/contributor-kinds.ts";
import { Section, type SectionHeading } from "../shared/primitives.ts";
import { PercentControl } from "../shared/segmented-control.ts";
import { monthBucketMs } from "../shared/time-axis.ts";
import {
  type LegendItem,
  type TimePoint,
  TimeSeriesChart,
} from "../time-stack-chart.ts";
import { commitKindsOf } from "./shared/commit-kinds.ts";
import { commitKindSeries, monthlyRowsOf } from "./shared/monthly-buckets.ts";
import type { ReportSection } from "./shared/report-section.ts";

const commitsPerMonthHeading = (
  annotation: string | undefined,
): SectionHeading => ({
  title: "Commits per month",
  subtitle:
    "months bucketed by the author's date, split by author kind; hatched = human commits with at least one AI co-author trailer",
  annotation,
});

/** Reading order — humans first, bots last, matching a calendar cell top-down. */
const commitKindOrder = ["human", "humanAi", "ai", "bot"] as const;

/**
 * Which commit series a kind filter keeps. Humans stay split by AI assistance
 * — narrowing to humans is about whose commits are counted, not about hiding
 * the assisted share of them.
 */
const commitKindsOfFilter: Record<
  KindFilter,
  ReadonlyArray<keyof typeof commitKindSeries>
> = {
  all: commitKindOrder,
  human: ["human", "humanAi"],
  ai: ["ai"],
  bot: ["bot"],
};

const commitKindColorOf = (kind: keyof typeof commitKindSeries): string =>
  kind === "humanAi" ? kindColors.human : kindColors[kind];

/** Kinds that ever occur, so a bot-free repo gets no empty series. */
const presentCommitKindKeysOf = cachedBy((data: DashboardData) => {
  const monthlyRows = monthlyRowsOf(data.commits);
  return commitKindOrder.filter((kind) =>
    monthlyRows.some(([, bucket]) => bucket[kind] > 0),
  );
});

/**
 * What the chart draws for one kind filter: the series of every month, in
 * the shape `TimeSeriesChart` takes. Built once per data and filter, so the
 * same arrays come back on every render and can go to `h.lazy` and props as
 * they are.
 */
type CommitsChart = {
  points: TimePoint[];
  seriesKeys: string[];
  colors: string[];
  seriesHatch: Record<string, string>;
  legendItems: LegendItem[];
};

const commitsChartsOf = cachedBy(
  (data: DashboardData): Record<KindFilter, CommitsChart> => {
    const monthlyRows = monthlyRowsOf(data.commits);
    const chartOf = (kindFilter: KindFilter): CommitsChart => {
      const commitKindKeys = presentCommitKindKeysOf(data).filter((kind) =>
        commitKindsOfFilter[kindFilter].includes(kind),
      );
      return {
        points: monthlyRows.map(([month, bucket]) => ({
          dateMs: monthBucketMs(month),
          values: Object.fromEntries(
            commitKindKeys.map((kind) => [
              commitKindSeries[kind],
              bucket[kind],
            ]),
          ),
        })),
        // Bars stack bottom-up, so reverse the reading order: humans end up
        // on top of each bar, bots at the baseline — same as a calendar cell.
        seriesKeys: commitKindKeys
          .toReversed()
          .map((kind) => commitKindSeries[kind]),
        colors: commitKindKeys.toReversed().map(commitKindColorOf),
        seriesHatch: { [commitKindSeries.humanAi]: kindColors.ai },
        // The legend and tooltip keep the reading order, humans first.
        legendItems: commitKindKeys.map((kind) => ({
          label: commitKindSeries[kind],
          color: commitKindColorOf(kind),
          ...(kind === "humanAi" && { hatch: kindColors.ai }),
        })),
      };
    };
    return {
      all: chartOf("all"),
      human: chartOf("human"),
      ai: chartOf("ai"),
      bot: chartOf("bot"),
    };
  },
);

export const CommitsPerMonthSectionMessage = UiSchema.TaggedEnum({
  ToggledKindFilter: { kindFilter: KindFilterSchema },
  ToggledPercent: { percent: Schema.Boolean },
});

export const CommitsPerMonthSection = Html.component({
  name: "CommitsPerMonthSection",
  props: Schema.Struct({ data: DashboardDataSchema }),
  model: Schema.Struct({
    kindFilter: KindFilterSchema,
    percent: Schema.Boolean,
  }),
  message: CommitsPerMonthSectionMessage,
}).make({
  init: () => ({ kindFilter: "all" as const, percent: false }),
  update: {
    ToggledKindFilter: ($, { kindFilter }) => $.evolve({ kindFilter }),
    ToggledPercent: ($, { percent }) => $.evolve({ percent }),
  },
  view: (h, model) => {
    const { data } = h.props;
    const commitsChart = commitsChartsOf(data)[model.kindFilter];
    const commitsSupportPercent = commitsChart.seriesKeys.length > 1;
    return Section(h, {
      ...commitsPerMonthHeading(
        data.config?.charts?.annotations?.["commits-per-month"],
      ),
      controls: [
        KindFilterControl(h, {
          key: "kind-filter",
          label: "Filter commits by author kind",
          value: model.kindFilter,
          onChange: (kindFilter) =>
            CommitsPerMonthSectionMessage.ToggledKindFilter({ kindFilter }),
          presentKinds: commitKindsOf(data),
        }),
        // Shown whenever the unfiltered chart stacks more than one series,
        // and merely disabled while a single-kind view leaves one — a control
        // vanishing from the row on filter change would reflow the remaining
        // ones away from the cursor.
        presentCommitKindKeysOf(data).length > 1 &&
          PercentControl(h, {
            key: "percent",
            label: "Commits per month value display",
            value: model.percent,
            onChange: (percent) =>
              CommitsPerMonthSectionMessage.ToggledPercent({ percent }),
            disabled: !commitsSupportPercent,
            disabledTitle: "A single series is always 100%",
          }),
      ],
      children: [
        TimeSeriesChart(h, {
          props: {
            mode: "bar",
            pointUnit: "month",
            // The remembered preference is ignored, not applied invisibly,
            // while the filter leaves one series — the control reads
            // "absolute counts" there, and the bars must agree with it.
            percentMode: model.percent && commitsSupportPercent,
            ...commitsChart,
          },
        }),
      ],
    });
  },
});

export const commitsPerMonthSectionOf = (
  data: DashboardData,
): ReportSection => ({
  id: "commits-per-month",
  skeleton: commitsPerMonthHeading(
    data.config?.charts?.annotations?.["commits-per-month"],
  ),
  view: (h, key) => CommitsPerMonthSection(h, { key, props: { data } }),
});
