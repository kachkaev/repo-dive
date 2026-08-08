import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
  startTransition,
  useDeferredValue,
  useEffect,
  useState,
} from "react";

import type { ContributorKind, DashboardData } from "../data.ts";
import {
  type CalendarKindFilter,
  type CalendarRange,
  CommitCalendar,
} from "./activity-calendar.tsx";
import { BarList } from "./bar-list.tsx";
import {
  ContributorBars,
  type ContributorBarsItem,
} from "./contributor-bars.tsx";
import { DivergingBars } from "./diverging-bars.tsx";
import { LinesTimeline } from "./lines-timeline.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./shared/@ui-primitive/select.tsx";
import {
  kindBadge,
  kindColors,
  type KindFilter,
  KindFilterControl,
} from "./shared/contributor-kinds.tsx";
import { formatCount, formatDate } from "./shared/format.ts";
import { DataTable, Section, SectionSkeleton } from "./shared/primitives.tsx";
import { PercentControl } from "./shared/segmented-control.tsx";
import { shapeStacked } from "./shared/stacked-series.ts";
import { TimeSeriesChart } from "./time-stack-chart.tsx";

/** Keeps every nth row so dense per-commit series stay light to render. */
function decimate<T>(rows: readonly T[], maxPoints: number): T[] {
  if (rows.length <= maxPoints) {
    return [...rows];
  }
  const step = rows.length / maxPoints;
  const result: T[] = [];
  for (let index = 0; index < maxPoints; index += 1) {
    const row = rows[Math.floor(index * step)];
    if (row) {
      result.push(row);
    }
  }
  const last = rows.at(-1);
  if (last && result.at(-1) !== last) {
    result.push(last);
  }
  return result;
}

/** The commits-per-month series: author kind, with humans split by AI assistance. */
const commitKindSeries = {
  human: "Human",
  humanAi: "Human · AI-assisted",
  ai: "AI agent",
  bot: "Bot",
} as const;

/** Reading order — humans first, bots last, matching a calendar cell top-down. */
const commitKindOrder = ["human", "humanAi", "ai", "bot"] as const;

const commitKindColorOf = (kind: keyof typeof commitKindSeries): string =>
  kind === "humanAi" ? kindColors.human : kindColors[kind];

/**
 * A month's commit counts by kind plus its churn — everything the two monthly
 * charts need, summed from the per-commit rows rather than shipped alongside
 * them.
 */
type MonthlyBucket = Record<keyof typeof commitKindSeries, number> & {
  added: number;
  deleted: number;
  /** Lines added by commits carrying an AI co-author trailer. */
  aiAdded: number;
};

/**
 * Reveals its children one per paint: the first child renders right away,
 * everything after it hides behind a skeleton placeholder until the effect
 * below replaces it with the next level of the recursion — which repeats the
 * same move for the rest. Each section thus lands in its own commit with a
 * browser paint in between (an effect only fires after its own level has
 * painted), and because the swap happens inside a transition the passes stay
 * interruptible — a click on an already-visible section jumps the queue. The
 * placeholder at the tail keeps signalling that more of the report is on the
 * way — as the next section's real heading over a pulsing card when that
 * section is a plain {@link Section} element (its title and subtitle are
 * props, available long before the chart body), and as anonymous
 * {@link SectionSkeleton} ghost bars otherwise.
 *
 * Chained `useDeferredValue(value, initialValue)` cannot do this: the levels
 * below the first all mount inside the deferred lane's render, so their own
 * deferred updates join that same lane and the whole recursion unrolls into
 * one big commit — measured at ~2s without a paint between sections.
 */
function RevealSequentially({ children }: { children: ReactNode }) {
  // Conditional sections arrive as booleans/nulls; toArray drops those, so a
  // repo without, say, dependency data spends no reveal step on it.
  const items = Children.toArray(children);
  const [restRevealed, setRestRevealed] = useState(false);
  useEffect(() => {
    startTransition(() => {
      setRestRevealed(true);
    });
  }, []);
  const [first, ...rest] = items;
  const next = rest[0];
  const nextIsSection = isValidElement(next) && next.type === Section;
  return (
    <>
      {first}
      {rest.length > 0 &&
        (restRevealed ? (
          <RevealSequentially>{rest}</RevealSequentially>
        ) : nextIsSection ? (
          cloneElement(next as ReactElement<{ skeleton?: boolean }>, {
            skeleton: true,
          })
        ) : (
          <SectionSkeleton />
        ))}
    </>
  );
}

/**
 * Every report section below the stat tiles, revealed one at a time. The whole
 * component (its derivations included) only mounts in the deferred render
 * {@link ../app.tsx App} schedules right after first paint, so none of it
 * delays the header and the tiles; from there {@link RevealSequentially}
 * mounts one section per pass, charts first in reading order.
 */
export function ReportSections({
  data,
  maxContributorsInCharts,
}: {
  data: DashboardData;
  maxContributorsInCharts: number;
}) {
  const dependencies = data.dependencies;
  const [directDependenciesPercent, setDirectDependenciesPercent] =
    useState(false);
  const [dependenciesPercent, setDependenciesPercent] = useState(false);
  const [commitsPercent, setCommitsPercent] = useState(false);
  const [calendarRange, setCalendarRange] =
    useState<CalendarRange>("last-12-months");
  // Lifted out of CommitCalendar so it survives the remount on range change.
  const [calendarKindFilter, setCalendarKindFilter] =
    useState<CalendarKindFilter>("all");
  const [contributorKindFilter, setContributorKindFilter] =
    useState<KindFilter>("all");

  // The range select and kind filter respond to a click instantly; the
  // calendar itself — laid out from scratch on each switch, and remounted on a
  // range change — re-renders from these deferred copies in an interruptible
  // follow-up pass, dimming while it lags. Same deal for the contributor list.
  const deferredCalendarRange = useDeferredValue(calendarRange);
  const deferredCalendarKindFilter = useDeferredValue(calendarKindFilter);
  const calendarStale =
    deferredCalendarRange !== calendarRange ||
    deferredCalendarKindFilter !== calendarKindFilter;
  const deferredContributorKindFilter = useDeferredValue(contributorKindFilter);
  const contributorsStale =
    deferredContributorKindFilter !== contributorKindFilter;

  // The contributor list spans the whole history: it is already sampled by
  // contributor (capped per kind at index time), so sampling it by time too
  // would only blur what the bars are for.
  const contributorItems: ContributorBarsItem[] = data.contributors.map(
    (contributor) => ({
      // Email alone isn't unique: bots and AI agents are identified by name too
      // (several Claude releases share noreply@anthropic.com), matching how
      // indexing buckets them.
      id: `${contributor.name} <${contributor.email}>`,
      label: contributor.name || contributor.email,
      href: contributor.url,
      kind: contributor.kind ?? "human",
      authored: contributor.commits,
      assistedBy: contributor.assistedBy ?? {},
      assisted: contributor.assisted ?? {},
    }),
  );
  const contributorKinds = new Set<ContributorKind>(
    contributorItems.map((item) => item.kind),
  );
  // Kinds that ever committed — drives the calendar's filter; the contributor
  // list can differ (it is capped per kind at index time).
  const commitKinds = new Set<ContributorKind>(
    data.commits.map((commit) => commit.kind ?? "human"),
  );
  const filteredContributorItems = contributorItems
    .filter(
      (item) =>
        deferredContributorKindFilter === "all" ||
        item.kind === deferredContributorKindFilter,
    )
    .slice(0, maxContributorsInCharts * 2);

  // Fixed ranges first, then one entry per year of history, newest first.
  const calendarRangeItems: Array<{ value: CalendarRange; label: string }> = [
    { value: "last-12-months", label: "Last 12 months" },
    { value: "this-year", label: "This year" },
    { value: "last-3-years", label: "Last 3 years" },
    { value: "all-years", label: "All years" },
    ...(data.repo.firstCommitDate
      ? Array.from(
          {
            length:
              Number(data.generatedAt.slice(0, 4)) -
              Number(data.repo.firstCommitDate.slice(0, 4)) +
              1,
          },
          (_, index) => Number(data.generatedAt.slice(0, 4)) - index,
        ).map((year) => ({
          value: `year-${year}` as const,
          label: `${year}`,
        }))
      : []),
  ];

  // Repo inception, used to anchor charts whose series start mid-history (e.g.
  // dependencies, tracked only once a lockfile exists) to the full timeline.
  const repoStartMs = data.repo.firstCommitDate
    ? new Date(data.repo.firstCommitDate).getTime()
    : undefined;

  // One pass over the per-commit rows feeds both monthly charts. dashboard.json
  // carries no monthly rollup of its own: every field of one is a group-by-month
  // sum over rows the calendar already needs in full, and re-deriving here also
  // means a file written before per-commit kinds still renders — everything
  // lands in the human series there, matching the old two-series chart.
  const monthlyBuckets = new Map<string, MonthlyBucket>();
  for (const commit of data.commits) {
    const month = commit.date.slice(0, 7);
    const bucket = monthlyBuckets.get(month) ?? {
      human: 0,
      humanAi: 0,
      ai: 0,
      bot: 0,
      added: 0,
      deleted: 0,
      aiAdded: 0,
    };
    const kind = commit.kind ?? "human";
    if (kind === "human") {
      bucket[commit.ai ? "humanAi" : "human"] += 1;
    } else {
      bucket[kind] += 1;
    }
    bucket.added += commit.added;
    bucket.deleted += commit.deleted;
    if (commit.ai) {
      bucket.aiAdded += commit.added;
    }
    monthlyBuckets.set(month, bucket);
  }
  const monthlyRows = [...monthlyBuckets.entries()].toSorted(
    ([left], [right]) => left.localeCompare(right),
  );
  // Keep only kinds that ever occur, so a bot-free repo gets no empty series.
  const commitKindKeys = commitKindOrder.filter((kind) =>
    monthlyRows.some(([, bucket]) => bucket[kind] > 0),
  );
  const commitsChart = {
    points: monthlyRows.map(([month, bucket]) => ({
      dateMs: new Date(`${month}-15`).getTime(),
      values: Object.fromEntries(
        commitKindKeys.map((kind) => [commitKindSeries[kind], bucket[kind]]),
      ),
    })),
    // Bars stack bottom-up, so reverse the reading order: humans end up on
    // top of each bar, bots at the baseline — same as a calendar cell.
    seriesKeys: commitKindKeys
      .toReversed()
      .map((kind) => commitKindSeries[kind]),
    colors: commitKindKeys.toReversed().map(commitKindColorOf),
    seriesHatch: { [commitKindSeries.humanAi]: kindColors.ai },
    // The legend and tooltip keep the reading order, humans first.
    legendItems: commitKindKeys.map((kind) => ({
      label: commitKindSeries[kind],
      color: commitKindColorOf(kind),
      ...(kind === "humanAi" ? { hatch: kindColors.ai } : {}),
    })),
  };

  const suppressionRows = decimate(data.directives, 400);
  const suppressionsChart = {
    points: suppressionRows.map((row) => ({
      dateMs: new Date(row.date).getTime(),
      values: {
        "eslint disables":
          row.eslintNextLine + row.eslintLine + row.eslintBlocks,
        "ts directives": row.tsIgnore + row.tsExpectError + row.tsNocheck,
        "todo comments": row.todos,
      },
    })),
    seriesKeys: ["eslint disables", "ts directives", "todo comments"],
    colors: ["var(--series-6)", "var(--series-3)", "var(--series-1)"],
  };

  const dependenciesChart = shapeStacked(
    decimate(dependencies, 400).map((row) => ({
      date: row.date,
      values: row.byPackageManager,
    })),
    5,
    // A repo can switch managers over its life (npm/yarn → pnpm), so rank by
    // peak to keep each one named rather than folding the retired ones away.
    "peak",
  );

  // Direct dependencies declared in package.json, split by kind. Distinct from
  // the resolved-graph chart above: this is what the project asks for, not what
  // the lockfile pulled in. Only shown once a package.json has been seen.
  const directDependenciesChart = {
    points: decimate(dependencies, 400).map((row) => ({
      dateMs: new Date(row.date).getTime(),
      values: {
        dependencies: row.directProd,
        devDependencies: row.directDev,
        optionalDependencies: row.directOptional,
      },
    })),
    seriesKeys: ["dependencies", "devDependencies", "optionalDependencies"],
    colors: ["var(--series-1)", "var(--series-3)", "var(--series-6)"],
  };
  const hasManifestData = dependencies.some(
    (row) =>
      (row.manifestCount ?? 0) > 0 ||
      row.directProd + row.directDev + row.directOptional > 0,
  );
  // package.json counts arrived after direct-dependency tracking; a dashboard.json
  // written before them carries direct counts but no manifestCount, so surface
  // the file count only where it was actually recorded.
  const hasManifestCounts = dependencies.some(
    (row) => row.manifestCount !== undefined,
  );
  return (
    <RevealSequentially>
      {(data.languages.length > 0 || data.survival.length > 0) && (
        <LinesTimeline
          data={data}
          maxContributorsInCharts={maxContributorsInCharts}
        />
      )}

      {hasManifestData && (
        <Section
          title="Direct dependencies over time"
          subtitle="dependencies, devDependencies and optionalDependencies declared across all package.json files at each commit"
          controls={
            <PercentControl
              label="Direct dependencies value display"
              value={directDependenciesPercent}
              onChange={setDirectDependenciesPercent}
            />
          }
          footer={
            <DataTable
              caption="View data"
              header={[
                "date",
                ...(hasManifestCounts ? ["package.json files"] : []),
                "dependencies",
                "devDependencies",
                "optionalDependencies",
              ]}
              rows={dependencies.map((row) => [
                formatDate(row.date),
                ...(hasManifestCounts ? [row.manifestCount ?? 0] : []),
                row.directProd,
                row.directDev,
                row.directOptional,
              ])}
            />
          }
        >
          <TimeSeriesChart
            mode="area"
            percentMode={directDependenciesPercent}
            {...directDependenciesChart}
            domainStartMs={repoStartMs}
            zeroLabel="No package.json"
          />
        </Section>
      )}

      {dependenciesChart.points.length > 0 && (
        <Section
          title="Dependencies over time"
          subtitle="resolved packages in the lockfile at each commit, split by package manager"
          controls={
            dependenciesChart.seriesKeys.length > 1 ? (
              <PercentControl
                label="Dependencies value display"
                value={dependenciesPercent}
                onChange={setDependenciesPercent}
              />
            ) : undefined
          }
          footer={
            <DataTable
              caption="View data"
              header={["date", "resolved"]}
              rows={dependencies.map((row) => [
                formatDate(row.date),
                row.resolved,
              ])}
            />
          }
        >
          <TimeSeriesChart
            mode="area"
            percentMode={dependenciesPercent}
            {...dependenciesChart}
            domainStartMs={repoStartMs}
            zeroLabel="No lockfile"
          />
        </Section>
      )}

      {data.repo.firstCommitDate !== undefined && data.commits.length > 0 && (
        <Section
          title="Commit calendar"
          subtitle="commits per day; days bucketed by the committer's local date, i.e. when each commit landed"
          controls={
            <>
              <KindFilterControl
                label="Filter calendar by contributor kind"
                value={calendarKindFilter}
                onChange={setCalendarKindFilter}
                presentKinds={commitKinds}
              />
              {/* A fixed-width slot for the trigger, which keeps hugging its
                  own value: the options differ by ~60px ("2019" against the
                  widest, "Last 12 months", which needs 128px at this size), and
                  a trigger claiming a different slice of the row on every change
                  hopped between rows once the row wraps on a narrow viewport. */}
              <div className="w-36">
                <Select
                  value={calendarRange}
                  onValueChange={(value) => {
                    // null is the "cleared" value; the range select always has one.
                    if (value !== null) {
                      setCalendarRange(value);
                    }
                  }}
                  items={calendarRangeItems}
                >
                  {/* The options ("Last 12 months", …) make the purpose plain,
                      so the label is a11y-only. */}
                  <SelectTrigger size="xs" aria-label="Calendar range">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {calendarRangeItems.map((item) => (
                      <SelectItem
                        key={item.value}
                        value={item.value}
                        className="text-xs"
                      >
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          }
        >
          <div
            className="transition-opacity"
            style={{ opacity: calendarStale ? 0.6 : 1 }}
          >
            <CommitCalendar
              // Remount on range change so a hovered day from the previous range
              // is not reported over the new one (mouseleave never fires when the
              // strips under the cursor are swapped).
              key={deferredCalendarRange}
              commits={data.commits}
              generatedAt={data.generatedAt}
              firstCommitDate={data.repo.firstCommitDate}
              weekStartsOn={data.config?.charts?.weekStartsOn ?? "monday"}
              range={deferredCalendarRange}
              kindFilter={deferredCalendarKindFilter}
            />
          </div>
        </Section>
      )}

      <Section
        title="Commits per month"
        subtitle="months bucketed by the author's date, split by author kind; hatched = human commits with at least one AI co-author trailer"
        controls={
          commitsChart.seriesKeys.length > 1 ? (
            <PercentControl
              label="Commits per month value display"
              value={commitsPercent}
              onChange={setCommitsPercent}
            />
          ) : undefined
        }
      >
        <TimeSeriesChart
          mode="bar"
          pointUnit="month"
          percentMode={commitsPercent}
          {...commitsChart}
        />
      </Section>

      <Section
        title="Churn per month"
        subtitle="lines added and deleted, months bucketed by the author's date so they line up with the survival cohorts; hatched = lines added by AI-assisted commits"
      >
        <DivergingBars
          points={monthlyRows.map(([month, bucket]) => ({
            month,
            positive: bucket.added,
            negative: bucket.deleted,
            positiveSecondary: bucket.aiAdded,
          }))}
          positiveLabel="added"
          negativeLabel="deleted"
          positiveSecondaryLabel="added · AI-assisted"
          positiveSecondaryHatch={kindColors.ai}
        />
      </Section>

      {suppressionsChart.points.length > 0 && (
        <Section
          title="Fighting the linter"
          subtitle="suppression comments in the tree over time (block disables counted as one each)"
        >
          <TimeSeriesChart mode="line" {...suppressionsChart} />
        </Section>
      )}

      {data.topRules.length > 0 && (
        <Section
          title="Most-suppressed eslint rules"
          subtitle="at the latest commit; (all) = blanket disables without a rule list"
        >
          <BarList
            items={data.topRules.map((row) => ({
              id: row.rule,
              label: row.rule,
              value: row.count,
            }))}
            color="var(--series-6)"
          />
        </Section>
      )}

      <Section
        title="Contributors"
        subtitle="whole history; per contributor: commits authored above, commits co-authored for others below — hatching marks cross-kind collaboration"
        controls={
          <KindFilterControl
            label="Filter contributors by kind"
            value={contributorKindFilter}
            onChange={setContributorKindFilter}
            presentKinds={contributorKinds}
          />
        }
        footer={
          <DataTable
            caption={`All ${data.contributors.length} listed contributors`}
            header={["contributor", "commits", "added", "deleted"]}
            rows={data.contributors.map((contributor) => [
              <>
                {contributor.kind && contributor.kind !== "human" ? (
                  <span
                    title={kindBadge[contributor.kind].title}
                    className="mr-1 select-none"
                  >
                    <span
                      className="mr-1 inline-block size-2.5 rounded-xs"
                      style={{ background: kindColors[contributor.kind] }}
                    />
                    {kindBadge[contributor.kind].icon}
                  </span>
                ) : undefined}
                {contributor.url ? (
                  <a
                    href={contributor.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium hover:underline"
                  >
                    {contributor.name}
                  </a>
                ) : (
                  contributor.name
                )}{" "}
                <span className="text-(--text-muted)">
                  &lt;{contributor.email}&gt;
                </span>
              </>,
              contributor.commits,
              formatCount(contributor.added),
              formatCount(contributor.deleted),
            ])}
          />
        }
      >
        <div
          className="transition-opacity"
          style={{ opacity: contributorsStale ? 0.6 : 1 }}
        >
          <ContributorBars items={filteredContributorItems} />
        </div>
      </Section>
    </RevealSequentially>
  );
}
