import { UiSchema } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { Schema } from "effect";

import { type DashboardData, DashboardDataSchema } from "../../data.ts";
import { ChartPlaceholder } from "../shared/chart-placeholder.ts";
import { formatDate } from "../shared/format.ts";
import {
  DataTable,
  Section,
  type SectionHeading,
} from "../shared/primitives.ts";
import { PercentControl } from "../shared/segmented-control.ts";
import type { ReportSection } from "./shared/report-section.ts";

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
        // TEMPORARY until time-stack-chart.tsx is ported: an area-mode
        // TimeSeriesChart with legend toggles, `decimate(dependencies, 400)`,
        // anchored to the first commit, "No package.json" where it is zero.
        ChartPlaceholder(h, {
          reactFile: "time-stack-chart.tsx",
          description: "Stacked areas of declared dependencies by kind",
          height: 288,
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
