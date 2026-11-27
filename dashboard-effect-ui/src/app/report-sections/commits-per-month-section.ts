import { UiSchema } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { Schema } from "effect";

import { type ContributorKind, DashboardDataSchema } from "../../data.ts";
import { ChartPlaceholder } from "../shared/chart-placeholder.ts";
import {
  type KindFilter,
  KindFilterControl,
  KindFilterSchema,
} from "../shared/contributor-kinds.ts";
import { Section, type SectionHeading } from "../shared/primitives.ts";
import { PercentControl } from "../shared/segmented-control.ts";
import {
  type commitKindSeries,
  monthlyRowsOf,
} from "./shared/monthly-buckets.ts";
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

const CommitsPerMonthSectionMessage = UiSchema.TaggedEnum({
  ToggledKindFilter: { kindFilter: KindFilterSchema },
  ToggledPercent: { percent: Schema.Boolean },
});

const CommitsPerMonthSection = Html.component({
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
    const commitKinds = new Set<ContributorKind>(
      data.commits.map((commit) => commit.kind ?? "human"),
    );
    const monthlyRows = monthlyRowsOf(data.commits);
    // Keep only kinds that ever occur, so a bot-free repo gets no empty series.
    const presentCommitKindKeys = commitKindOrder.filter((kind) =>
      monthlyRows.some(([, bucket]) => bucket[kind] > 0),
    );
    const commitKindKeys = presentCommitKindKeys.filter((kind) =>
      commitKindsOfFilter[model.kindFilter].includes(kind),
    );
    const commitsSupportPercent = commitKindKeys.length > 1;
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
          presentKinds: commitKinds,
        }),
        // Shown whenever the unfiltered chart stacks more than one series,
        // and merely disabled while a single-kind view leaves one — a control
        // vanishing from the row on filter change would reflow the remaining
        // ones away from the cursor.
        presentCommitKindKeys.length > 1 &&
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
        // TEMPORARY until time-stack-chart.tsx is ported: a bar-mode
        // TimeSeriesChart of `monthlyRows` over `commitKindKeys`, in percent
        // mode while `model.percent && commitsSupportPercent`.
        ChartPlaceholder(h, {
          reactFile: "time-stack-chart.tsx",
          description: "Stacked bars of commits per month by author kind",
          height: 288,
        }),
      ],
    });
  },
});

export const commitsPerMonthSectionOf = (
  data: typeof DashboardDataSchema.Type,
): ReportSection => ({
  id: "commits-per-month",
  skeleton: commitsPerMonthHeading(
    data.config?.charts?.annotations?.["commits-per-month"],
  ),
  view: (h) => CommitsPerMonthSection(h, { props: { data } }),
});
