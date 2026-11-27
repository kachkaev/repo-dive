import { Component, Head } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { Cause, Schema } from "effect";
import { AsyncResult } from "effect/reactivity";

import { ReportHeader } from "./app/report-header.ts";
import { ReportSections } from "./app/report-sections.ts";
import {
  formatBytes,
  formatCount,
  formatPercent,
} from "./app/shared/format.ts";
import { StatTile } from "./app/shared/primitives.ts";
import { type DashboardData, LoadDashboardData } from "./data.ts";

/** Falls back when serving a dashboard.json written before configurable caps. */
const defaultMaxContributorsInCharts = 8;

const StatTiles = <M>(h: Html.H<M>, data: DashboardData) => {
  const latestLanguages = data.languages.at(-1);
  const latestFileTypes = data.fileTypes.at(-1);
  const latestDependencies = data.dependencies.at(-1);

  const directDependenciesTotal = latestDependencies
    ? latestDependencies.directProd +
      latestDependencies.directDev +
      latestDependencies.directOptional
    : 0;
  // package.json counts arrived after direct-dependency tracking; a dashboard.json
  // written before them carries direct counts but no manifestCount, so surface
  // the file count only where it was actually recorded.
  const hasManifestCounts = data.dependencies.some(
    (row) => row.manifestCount !== undefined,
  );

  // "Recent" is anchored to when the catalog was written, not to wall-clock
  // now: the same dashboard.json always renders the same share, and a report
  // opened more than 90 days later still shows its own final window instead of
  // an empty one.
  const recentWindowStartMs =
    new Date(data.generatedAt).getTime() - 90 * 86_400_000;
  const recentCommits = data.commits.filter(
    (commit) => new Date(commit.date).getTime() >= recentWindowStartMs,
  );
  const aiShareRecent =
    recentCommits.length === 0
      ? undefined
      : recentCommits.filter((commit) => commit.ai).length /
        Math.max(1, recentCommits.length);

  return h.div
    .class("mb-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5")
    .children(
      StatTile(h, {
        label: "Commits",
        value: formatCount(data.repo.commitCount),
        hint: `by ${data.repo.contributorCount} ${
          data.repo.contributorCount === 1 ? "contributor" : "contributors"
        }`,
      }),
      StatTile(h, {
        label: "Lines",
        value: latestLanguages
          ? formatCount(
              Object.values(latestLanguages.byLanguage).reduce(
                (sum, lines) => sum + lines,
                0,
              ),
            )
          : "—",
        hint: "latest language snapshot",
      }),
      StatTile(h, {
        label: "Files",
        value: latestFileTypes ? formatCount(latestFileTypes.totalFiles) : "—",
        hint: latestFileTypes
          ? formatBytes(latestFileTypes.totalBytes)
          : undefined,
      }),
      StatTile(h, {
        label: "Dependencies",
        value: latestDependencies
          ? formatCount(latestDependencies.resolved)
          : "—",
        hint: latestDependencies
          ? `${formatCount(directDependenciesTotal)} direct${
              hasManifestCounts
                ? ` · ${formatCount(latestDependencies.manifestCount ?? 0)} package.json`
                : ""
            }`
          : undefined,
      }),
      StatTile(h, {
        label: "AI commits",
        value: aiShareRecent === undefined ? "—" : formatPercent(aiShareRecent),
        hint: "last 90 days, by co-author",
      }),
    );
};

/** The one line a failed load shows: the error's own message. */
const failureMessageOf = (cause: Cause.Cause<unknown>): string => {
  const error = Cause.squash(cause);
  return error instanceof Error ? error.message : String(error);
};

/**
 * The root: loads dashboard.json and shows the report, or why it could not.
 * The React dashboard awaits the data before it mounts anything
 * (../../dashboard/src/main.tsx); here the root mounts at once and reads the
 * load as a query result, which renders nothing until it settles — the same
 * empty page while the file arrives.
 */
const AppNoDeps = Html.component({
  name: "App",
  model: Schema.Struct({}),
  message: Schema.Never,
  queries: { data: { query: LoadDashboardData, args: () => ({}) } },
}).make({
  init: () => ({}),
  update: ($) => $.model,
  head: ({ queries }) => [
    Head.title(
      AsyncResult.isSuccess(queries.data)
        ? `${queries.data.value.repo.name} · repo-dive`
        : "repo-dive",
    ),
  ],
  view: (h) =>
    AsyncResult.match(h.queries.data, {
      onInitial: () => h.text(""),
      onFailure: (failure) =>
        h.main
          .class("mx-auto max-w-xl px-6 py-16 text-center")
          .children(
            h.h1
              .class("text-lg font-semibold")
              .children("Could not load dashboard data"),
            h.p
              .class("mt-2 text-sm text-(--text-secondary)")
              .children(failureMessageOf(failure.cause)),
          ),
      onSuccess: ({ value: data }) =>
        h.main.class("mx-auto max-w-5xl px-6 py-8").children(
          ReportHeader(h, data.repo, data.generatedAt),
          StatTiles(h, data),
          ReportSections(h, {
            props: {
              data,
              maxContributorsInCharts:
                data.config?.contributors.maxInCharts ??
                defaultMaxContributorsInCharts,
            },
          }),
        ),
    }),
});

export const App = AppNoDeps.pipe(Component.provide(LoadDashboardData.layer));
