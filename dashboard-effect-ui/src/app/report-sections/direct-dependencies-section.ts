import { UiSchema } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { Schema } from "effect";

import { type DashboardData, DashboardDataSchema } from "../../data.ts";
import { formatDate } from "../shared/format.ts";
import {
  DataTable,
  Section,
  type SectionHeading,
} from "../shared/primitives.ts";
import { PercentControl } from "../shared/segmented-control.ts";
import { TimeSeriesChart } from "../time-stack-chart.ts";
import { cachedBy } from "./shared/cached-by.ts";
import { decimate } from "./shared/decimate.ts";
import { repoStartMsOf } from "./shared/repo-start-ms.ts";
import type { ReportSection } from "./shared/report-section.ts";

/**
 * The declared dependencies per kind, in the shape `TimeSeriesChart` takes,
 * once per data.
 */
const directDependenciesChartOf = cachedBy((data: DashboardData) => ({
  points: decimate(data.dependencies, 400).map((row) => ({
    dateMs: new Date(row.date).getTime(),
    values: {
      dependencies: row.directProd,
      devDependencies: row.directDev,
      optionalDependencies: row.directOptional,
    },
  })),
  seriesKeys: ["dependencies", "devDependencies", "optionalDependencies"],
  colors: ["var(--series-1)", "var(--series-3)", "var(--series-6)"],
}));

const directDependenciesHeading = (
  annotation: string | undefined,
): SectionHeading => ({
  title: "Direct dependencies over time",
  subtitle:
    "dependencies, devDependencies and optionalDependencies declared across all package.json files at each commit",
  annotation,
});

/**
 * The "View data" table. Built through `h.lazy` with the rows' source array
 * as the first argument, so the section's own re-renders reuse its nodes.
 */
const DirectDependenciesTable = <M>(
  h: Html.H<M>,
  dependencies: DashboardData["dependencies"],
  hasManifestCounts: boolean,
) =>
  DataTable(h, {
    caption: "View data",
    header: [
      "date",
      ...(hasManifestCounts ? ["package.json files"] : []),
      "dependencies",
      "devDependencies",
      "optionalDependencies",
    ],
    rows: dependencies.map((row) => [
      formatDate(row.date),
      ...(hasManifestCounts ? [row.manifestCount ?? 0] : []),
      row.directProd,
      row.directDev,
      row.directOptional,
    ]),
  });

const DirectDependenciesSectionMessage = UiSchema.TaggedEnum({
  ToggledPercent: { percent: Schema.Boolean },
});

/**
 * Direct dependencies declared in package.json, split by kind. Distinct from
 * the resolved-graph chart below it: this is what the project asks for, not
 * what the lockfile pulled in.
 */
const DirectDependenciesSection = Html.component({
  name: "DirectDependenciesSection",
  props: Schema.Struct({ data: DashboardDataSchema }),
  model: Schema.Struct({ percent: Schema.Boolean }),
  message: DirectDependenciesSectionMessage,
}).make({
  init: () => ({ percent: false }),
  update: {
    ToggledPercent: ($, { percent }) => $.evolve({ percent }),
  },
  view: (h, model) => {
    const { dependencies } = h.props.data;
    // package.json counts arrived after direct-dependency tracking; a
    // dashboard.json written before them carries direct counts but no
    // manifestCount, so surface the file count only where it was actually
    // recorded.
    const hasManifestCounts = dependencies.some(
      (row) => row.manifestCount !== undefined,
    );
    return Section(h, {
      ...directDependenciesHeading(
        h.props.data.config?.charts?.annotations?.["direct-dependencies"],
      ),
      controls: [
        PercentControl(h, {
          key: "percent",
          label: "Direct dependencies value display",
          value: model.percent,
          onChange: (percent) =>
            DirectDependenciesSectionMessage.ToggledPercent({ percent }),
        }),
      ],
      footer: [
        h.lazy(DirectDependenciesTable, dependencies, hasManifestCounts),
      ],
      children: [
        TimeSeriesChart(h, {
          props: {
            mode: "area",
            percentMode: model.percent,
            ...directDependenciesChartOf(h.props.data),
            legendToggles: true,
            domainStartMs: repoStartMsOf(h.props.data),
            zeroLabel: "No package.json",
          },
        }),
      ],
    });
  },
});

export const directDependenciesSectionOf = (
  data: DashboardData,
): ReportSection | undefined =>
  // Only shown once a package.json has been seen.
  data.dependencies.some(
    (row) =>
      (row.manifestCount ?? 0) > 0 ||
      row.directProd + row.directDev + row.directOptional > 0,
  )
    ? {
        id: "direct-dependencies",
        skeleton: directDependenciesHeading(
          data.config?.charts?.annotations?.["direct-dependencies"],
        ),
        view: (h, key) =>
          DirectDependenciesSection(h, { key, props: { data } }),
      }
    : undefined;
