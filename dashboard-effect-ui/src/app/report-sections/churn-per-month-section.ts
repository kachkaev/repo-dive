import { UiSchema } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { Schema } from "effect";

import { type DashboardData, DashboardDataSchema } from "../../data.ts";
import { ChartPlaceholder } from "../shared/chart-placeholder.ts";
import {
  KindFilterControl,
  KindFilterSchema,
} from "../shared/contributor-kinds.ts";
import { Section, type SectionHeading } from "../shared/primitives.ts";
import { commitKindsOf } from "./shared/commit-kinds.ts";
import type { ReportSection } from "./shared/report-section.ts";

const churnPerMonthHeading = (
  annotation: string | undefined,
): SectionHeading => ({
  title: "Churn per month",
  subtitle:
    "lines added and deleted, months bucketed by the author's date so they line up with the survival cohorts; hatched = lines added by AI-assisted commits",
  annotation,
});

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
        // TEMPORARY until diverging-bars.tsx is ported: DivergingBars over
        // the churn of `monthlyRowsOf(data.commits)` (./shared/monthly-buckets.ts),
        // summed over the kinds `model.kindFilter` keeps.
        ChartPlaceholder(h, {
          reactFile: "diverging-bars.tsx",
          description: "Lines added above and deleted below, per month",
          height: 268,
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
