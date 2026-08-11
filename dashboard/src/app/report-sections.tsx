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
import { StaleOverlay } from "./shared/stale-overlay.tsx";
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
 * The calendar's multi-year unit, in calendar years (one strip each). Every
 * multi-year range on offer is a multiple of it — "Last 5 years", "Last 10
 * years", … — and the shortest of them is what an old repo's calendar opens
 * on: five strips are still a glance rather than a scroll.
 */
const calendarYearStep = 5;

/**
 * The longest history the calendar still opens in full, in calendar years.
 * A little past {@link calendarYearStep}: trading a glance for the whole story
 * is worth a strip or two of extra scrolling, not more.
 */
const maxDefaultCalendarYears = 7;

/**
 * The multi-year ranges a repo spanning this many calendar years offers: 5,
 * 10, 15, … A range earns its row once a calendar year falls outside it — up
 * to that point it draws strip for strip what the whole history draws, and
 * two options drawing the same thing is one option too many.
 */
const multiYearSpansOf = (years: number): number[] => {
  const spans: number[] = [];
  for (let span = calendarYearStep; years > span; span += calendarYearStep) {
    spans.push(span);
  }
  return spans;
};

/**
 * How much history the repo holds, in the two units the calendar's controls
 * care about: whether it goes back a year at all, and how many calendar years
 * — i.e. strips — it spans.
 */
type CalendarHistory = { underAYear: boolean; years: number };

const calendarHistoryOf = (
  firstCommitDate: string | undefined,
  generatedAt: string,
): CalendarHistory => {
  if (firstCommitDate === undefined) {
    return { underAYear: true, years: 1 };
  }
  // ISO dates compare as strings, so "a year before the report" needs no date
  // math beyond swapping the year in.
  const aYearBefore = `${Number(generatedAt.slice(0, 4)) - 1}${generatedAt.slice(4, 10)}`;
  return {
    underAYear: firstCommitDate.slice(0, 10) > aYearBefore,
    years:
      Number(generatedAt.slice(0, 4)) - Number(firstCommitDate.slice(0, 4)) + 1,
  };
};

/**
 * The range the calendar opens on. The old fixed "last 12 months" default was
 * one thin strip whatever the repo — for anything but a young one it hid most
 * of the history behind a dropdown nobody touches. So: show everything when
 * everything still fits ({@link maxDefaultCalendarYears}), fall back to the
 * newest {@link calendarYearStep} years when it doesn't, and keep the rolling
 * twelve months only for a repo too young to fill even one calendar year,
 * where whole-year strips would be mostly empty.
 */
const defaultCalendarRangeOf = (history: CalendarHistory): CalendarRange => {
  // A repo spanning a single calendar year is a year old at most, so this is
  // the same branch twice over — but it also keeps the default off "all years",
  // which such a repo does not offer (it would duplicate "This year").
  const tooYoungForYearStrips = history.underAYear || history.years <= 1;
  return tooYoungForYearStrips
    ? "last-12-months"
    : history.years <= maxDefaultCalendarYears
      ? "all-years"
      : `last-${calendarYearStep}-years`;
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
  const annotations = data.config?.charts?.annotations;
  const calendarHistory = calendarHistoryOf(
    data.repo.firstCommitDate,
    data.generatedAt,
  );

  const [directDependenciesPercent, setDirectDependenciesPercent] =
    useState(false);
  const [dependenciesPercent, setDependenciesPercent] = useState(false);
  const [commitsPercent, setCommitsPercent] = useState(false);
  const [calendarRange, setCalendarRange] = useState<CalendarRange>(
    defaultCalendarRangeOf(calendarHistory),
  );
  // Lifted out of CommitCalendar so it survives the remount on range change.
  const [calendarKindFilter, setCalendarKindFilter] =
    useState<CalendarKindFilter>("all");
  const [contributorKindFilter, setContributorKindFilter] =
    useState<KindFilter>("all");

  // The range select and kind filter respond to a click instantly; the
  // calendar itself — laid out from scratch on each switch, and remounted on a
  // range change — re-renders from these deferred copies in an interruptible
  // follow-up pass, dimming while it lags (see StaleOverlay). Same deal for
  // the contributor list.
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

  // Fixed ranges first, then one entry per year of history, newest first. A
  // range only earns its row once the repo outlives it (multiYearSpansOf for
  // the multi-year ones), and inside a single calendar year "All …" and that
  // year's own entry would both draw what "This year" draws. The whole-history
  // option names its own span ("All 7 years") rather than saying "All years":
  // how much history the repo holds is the one thing the reader cannot infer
  // from the label, and it decides whether the option is worth a click.
  const calendarRangeItems: Array<{ value: CalendarRange; label: string }> = [
    { value: "last-12-months", label: "Last 12 months" },
    { value: "this-year", label: "This year" },
    ...multiYearSpansOf(calendarHistory.years).map((span) => ({
      value: `last-${span}-years` as const,
      label: `Last ${span} years`,
    })),
    ...(calendarHistory.years > 1
      ? [
          {
            value: "all-years" as const,
            label: `All ${calendarHistory.years} years`,
          },
        ]
      : []),
    ...(calendarHistory.years > 1
      ? Array.from(
          { length: calendarHistory.years },
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
  // The collector emits a row for every scanned commit even when it holds no
  // lockfile, so a repo outside the npm ecosystem (e.g. a Python project)
  // carries thousands of all-zero rows — enough to pass a length check yet
  // draw an empty chart. Like the manifest check above, require a commit that
  // actually resolved something.
  const hasResolvedDependencies = dependencies.some((row) => row.resolved > 0);
  return (
    <RevealSequentially>
      {(data.languages.length > 0 || data.survival.length > 0) && (
        <LinesTimeline
          data={data}
          maxContributorsInCharts={maxContributorsInCharts}
        />
      )}

      {data.repo.firstCommitDate !== undefined && data.commits.length > 0 && (
        <Section
          title="Commit calendar"
          subtitle="commits per day; days bucketed by the committer's local date, i.e. when each commit landed"
          annotation={annotations?.["commit-calendar"]}
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
          <StaleOverlay stale={calendarStale}>
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
          </StaleOverlay>
        </Section>
      )}

      <Section
        title="Commits per month"
        subtitle="months bucketed by the author's date, split by author kind; hatched = human commits with at least one AI co-author trailer"
        annotation={annotations?.["commits-per-month"]}
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
        annotation={annotations?.["churn-per-month"]}
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

      {hasManifestData && (
        <Section
          title="Direct dependencies over time"
          subtitle="dependencies, devDependencies and optionalDependencies declared across all package.json files at each commit"
          annotation={annotations?.["direct-dependencies"]}
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

      {hasResolvedDependencies && (
        <Section
          title="Dependencies over time"
          subtitle="resolved packages in the lockfile at each commit, split by package manager"
          annotation={annotations?.dependencies}
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

      {suppressionsChart.points.length > 0 && (
        <Section
          title="Loose ends"
          subtitle="eslint disables, TypeScript directives and TODO-style comments in the tree at each commit; block disables count as one each"
          annotation={annotations?.["loose-ends"]}
        >
          <TimeSeriesChart mode="line" {...suppressionsChart} />
        </Section>
      )}

      {data.topRules.length > 0 && (
        <Section
          title="Most-suppressed eslint rules"
          subtitle="at the latest commit; (all) = blanket disables without a rule list"
          annotation={annotations?.["most-suppressed-eslint-rules"]}
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
        annotation={annotations?.contributors}
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
        <StaleOverlay stale={contributorsStale}>
          <ContributorBars items={filteredContributorItems} />
        </StaleOverlay>
      </Section>
    </RevealSequentially>
  );
}
