import { useDeferredValue } from "react";

import { BelowFoldSections } from "./app/below-fold-sections.tsx";
import { LinesTimeline } from "./app/lines-timeline.tsx";
import { ReportHeader } from "./app/report-header.tsx";
import {
  formatBytes,
  formatCount,
  formatPercent,
} from "./app/shared/format.ts";
import { StatTile } from "./app/shared/primitives.tsx";
import type { DashboardData } from "./data.ts";

/** Falls back when serving a dashboard.json written before configurable caps. */
const defaultMaxContributorsInCharts = 10;

export function App({ data }: { data: DashboardData }) {
  const maxContributorsInCharts =
    data.config?.contributors.maxInCharts ?? defaultMaxContributorsInCharts;
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

  // First paint stops at the fold — the header, the stat tiles and the first
  // chart. `initialValue` makes React mount everything below in a deferred
  // render scheduled right after: the page appears as soon as the top is
  // ready, and the remaining sections (five more charts and their thousands of
  // hidden table rows) fill in behind it without blocking interaction.
  const belowFoldMounted = useDeferredValue(true, false);

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <ReportHeader repo={data.repo} generatedAt={data.generatedAt} />

      <div className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile
          label="Commits"
          value={formatCount(data.repo.commitCount)}
          hint={`by ${data.repo.contributorCount} ${
            data.repo.contributorCount === 1 ? "contributor" : "contributors"
          }`}
        />
        <StatTile
          label="Lines"
          value={
            latestLanguages
              ? formatCount(
                  Object.values(latestLanguages.byLanguage).reduce(
                    (sum, lines) => sum + lines,
                    0,
                  ),
                )
              : "—"
          }
          hint="latest language snapshot"
        />
        <StatTile
          label="Files"
          value={
            latestFileTypes ? formatCount(latestFileTypes.totalFiles) : "—"
          }
          hint={
            latestFileTypes
              ? formatBytes(latestFileTypes.totalBytes)
              : undefined
          }
        />
        <StatTile
          label="Dependencies"
          value={
            latestDependencies ? formatCount(latestDependencies.resolved) : "—"
          }
          hint={
            latestDependencies
              ? `${formatCount(directDependenciesTotal)} direct${
                  hasManifestCounts
                    ? ` · ${formatCount(
                        latestDependencies.manifestCount ?? 0,
                      )} package.json`
                    : ""
                }`
              : undefined
          }
        />
        <StatTile
          label="AI commits"
          value={
            aiShareRecent === undefined ? "—" : formatPercent(aiShareRecent)
          }
          hint="last 90 days, by co-author"
        />
      </div>

      {(data.languages.length > 0 || data.survival.length > 0) && (
        <LinesTimeline
          data={data}
          maxContributorsInCharts={maxContributorsInCharts}
        />
      )}

      {belowFoldMounted && (
        <BelowFoldSections
          data={data}
          maxContributorsInCharts={maxContributorsInCharts}
        />
      )}
    </main>
  );
}
