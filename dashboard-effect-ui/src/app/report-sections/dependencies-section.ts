import { UiSchema } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { Schema } from "effect";

import { type DashboardData, DashboardDataSchema } from "../../data.ts";
import { cachedBy } from "../shared/cached-by.ts";
import { formatDate } from "../shared/format.ts";
import {
  DataTable,
  Section,
  type SectionHeading,
} from "../shared/primitives.ts";
import { PercentControl } from "../shared/segmented-control.ts";
import { shapeStacked } from "../shared/stacked-series.ts";
import { TimeSeriesChart } from "../time-stack-chart.ts";
import { decimate } from "./shared/decimate.ts";
import { repoStartMsOf } from "./shared/repo-start-ms.ts";
import type { ReportSection } from "./shared/report-section.ts";

const dependenciesHeading = (
  annotation: string | undefined,
): SectionHeading => ({
  title: "Dependencies over time",
  subtitle:
    "resolved packages in the lockfile at each commit, split by package manager",
  annotation,
});

/** The "View data" table, built through `h.lazy` like every section's. */
const DependenciesTable = <M>(
  h: Html.H<M>,
  dependencies: DashboardData["dependencies"],
) =>
  DataTable(h, {
    caption: "View data",
    header: ["date", "resolved"],
    rows: dependencies.map((row) => [formatDate(row.date), row.resolved]),
  });

/**
 * The resolved packages per package manager, in the shape `TimeSeriesChart`
 * takes, once per data.
 */
const dependenciesChartOf = cachedBy((data: DashboardData) =>
  shapeStacked(
    decimate(data.dependencies, 400).map((row) => ({
      date: row.date,
      values: row.byPackageManager,
    })),
    5,
    // A repo can switch managers over its life (npm/yarn → pnpm), so rank by
    // peak to keep each one named rather than folding the retired ones away.
    "peak",
  ),
);

const DependenciesSectionMessage = UiSchema.TaggedEnum({
  ToggledPercent: { percent: Schema.Boolean },
});

const DependenciesSection = Html.component({
  name: "DependenciesSection",
  props: Schema.Struct({ data: DashboardDataSchema }),
  model: Schema.Struct({ percent: Schema.Boolean }),
  message: DependenciesSectionMessage,
}).make({
  init: () => ({ percent: false }),
  update: {
    ToggledPercent: ($, { percent }) => $.evolve({ percent }),
  },
  view: (h, model) => {
    const { dependencies } = h.props.data;
    const dependenciesChart = dependenciesChartOf(h.props.data);
    return Section(h, {
      ...dependenciesHeading(
        h.props.data.config?.charts?.annotations?.dependencies,
      ),
      controls:
        dependenciesChart.seriesKeys.length > 1
          ? [
              PercentControl(h, {
                key: "percent",
                label: "Dependencies value display",
                value: model.percent,
                onChange: (percent) =>
                  DependenciesSectionMessage.ToggledPercent({ percent }),
              }),
            ]
          : undefined,
      footer: [h.lazy(DependenciesTable, dependencies)],
      children: [
        TimeSeriesChart(h, {
          props: {
            mode: "area",
            percentMode: model.percent,
            ...dependenciesChart,
            legendToggles: true,
            domainStartMs: repoStartMsOf(h.props.data),
            zeroLabel: "No lockfile",
          },
        }),
      ],
    });
  },
});

export const dependenciesSectionOf = (
  data: DashboardData,
): ReportSection | undefined =>
  // The collector emits a row for every scanned commit even when it holds no
  // lockfile, so a repo outside the npm ecosystem (e.g. a Python project)
  // carries thousands of all-zero rows — enough to pass a length check yet
  // draw an empty chart. Require a commit that actually resolved something.
  data.dependencies.some((row) => row.resolved > 0)
    ? {
        id: "dependencies",
        skeleton: dependenciesHeading(
          data.config?.charts?.annotations?.dependencies,
        ),
        view: (h, key) => DependenciesSection(h, { key, props: { data } }),
      }
    : undefined;
