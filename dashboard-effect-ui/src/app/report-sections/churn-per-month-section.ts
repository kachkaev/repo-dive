import { UiSchema } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { Schema } from "effect";

import { type DashboardData, DashboardDataSchema } from "../../data.ts";
import { DivergingBars, type DivergingPoint } from "../diverging-bars.ts";
import {
  kindColors,
  type KindFilter,
  KindFilterControl,
  KindFilterSchema,
  kindOrder,
} from "../shared/contributor-kinds.ts";
import { Section, type SectionHeading } from "../shared/primitives.ts";
import { cachedBy } from "./shared/cached-by.ts";
import { commitKindsOf } from "./shared/commit-kinds.ts";
import { monthlyRowsOf } from "./shared/monthly-buckets.ts";
import type { ReportSection } from "./shared/report-section.ts";

const churnPerMonthHeading = (
  annotation: string | undefined,
): SectionHeading => ({
  title: "Churn per month",
  subtitle:
    "lines added and deleted, months bucketed by the author's date so they line up with the survival cohorts; hatched = lines added by AI-assisted commits",
  annotation,
});

/**
 * The chart's points for each kind filter, built once per data so the same
 * arrays come back on every render. Churn keeps every month and drops the
 * filtered-out kinds' lines, so the bars rescale to whatever the selected
 * kind actually moved.
 */
const churnPointsOf = cachedBy(
  (data: DashboardData): Record<KindFilter, DivergingPoint[]> => {
    const monthlyRows = monthlyRowsOf(data.commits);
    const pointsOf = (kindFilter: KindFilter): DivergingPoint[] => {
      const churnKinds = kindFilter === "all" ? kindOrder : [kindFilter];
      return monthlyRows.map(([month, bucket]) => {
        const totals = { added: 0, deleted: 0, aiAdded: 0 };
        for (const kind of churnKinds) {
          const kindChurn = bucket.churn[kind];
          totals.added += kindChurn.added;
          totals.deleted += kindChurn.deleted;
          totals.aiAdded += kindChurn.aiAdded;
        }
        return {
          month,
          positive: totals.added,
          negative: totals.deleted,
          positiveSecondary: totals.aiAdded,
        };
      });
    };
    return {
      all: pointsOf("all"),
      human: pointsOf("human"),
      ai: pointsOf("ai"),
      bot: pointsOf("bot"),
    };
  },
);

const ChurnPerMonthSectionMessage = UiSchema.TaggedEnum({
  ToggledKindFilter: { kindFilter: KindFilterSchema },
});

/**
 * Churn filters by kind independently of the commits chart: reading "who
 * commits" and reading "who moves lines" are separate questions, and both
 * sections carry their own control anyway.
 */
const ChurnPerMonthSection = Html.component({
  name: "ChurnPerMonthSection",
  props: Schema.Struct({ data: DashboardDataSchema }),
  model: Schema.Struct({ kindFilter: KindFilterSchema }),
  message: ChurnPerMonthSectionMessage,
}).make({
  init: () => ({ kindFilter: "all" as const }),
  update: {
    ToggledKindFilter: ($, { kindFilter }) => $.evolve({ kindFilter }),
  },
  view: (h, model) => {
    const { data } = h.props;
    return Section(h, {
      ...churnPerMonthHeading(
        data.config?.charts?.annotations?.["churn-per-month"],
      ),
      controls: [
        KindFilterControl(h, {
          key: "kind-filter",
          label: "Filter churn by author kind",
          value: model.kindFilter,
          onChange: (kindFilter) =>
            ChurnPerMonthSectionMessage.ToggledKindFilter({ kindFilter }),
          presentKinds: commitKindsOf(data),
        }),
      ],
      children: [
        DivergingBars(h, {
          props: {
            points: churnPointsOf(data)[model.kindFilter],
            positiveLabel: "added",
            negativeLabel: "deleted",
            positiveSecondaryLabel: "added · AI-assisted",
            positiveSecondaryHatch: kindColors.ai,
          },
        }),
      ],
    });
  },
});

export const churnPerMonthSectionOf = (data: DashboardData): ReportSection => ({
  id: "churn-per-month",
  skeleton: churnPerMonthHeading(
    data.config?.charts?.annotations?.["churn-per-month"],
  ),
  view: (h, key) => ChurnPerMonthSection(h, { key, props: { data } }),
});
