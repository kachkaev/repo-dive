import { UiSchema } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { Schema } from "effect";

import {
  type ContributorKind,
  type DashboardData,
  DashboardDataSchema,
} from "../../data.ts";
import {
  ContributorBars,
  type ContributorBarsItem,
} from "../contributor-bars.ts";
import { cachedBy } from "../shared/cached-by.ts";
import {
  kindBadge,
  kindColors,
  type KindFilter,
  KindFilterControl,
  KindFilterSchema,
} from "../shared/contributor-kinds.ts";
import { formatCount } from "../shared/format.ts";
import { type HistoryRange, monthSpanOf } from "../shared/history-range.ts";
import {
  DataTable,
  Section,
  type SectionHeading,
} from "../shared/primitives.ts";
import {
  contributorsInRange,
  type ListedContributor,
} from "./contributors-in-range.ts";
import { HistoryRangeSelect } from "./history-range-select.ts";
import { historyOf, HistoryRangeSchema } from "./shared/history-ranges.ts";
import type { ReportSection } from "./shared/report-section.ts";

/**
 * Commit rows name their author and cross-kind helpers, so the contributor
 * list can be tallied over any range. A dashboard.json written before they did
 * ships the list pre-tallied over the whole history (and pre-capped per kind)
 * instead, and every row comes from one run, so the first one tells.
 */
const contributorsTalliedIn = (data: DashboardData): boolean =>
  data.commits[0]?.contributor !== undefined;

/**
 * Every range draws the same thing as the whole history while the repo spans
 * a single calendar year — the one case the range list leaves out "All …
 * years", the range the chart opens on.
 */
const contributorsRangeOfferedIn = (data: DashboardData): boolean =>
  contributorsTalliedIn(data) && historyOf(data).calendarHistory.years > 1;

/**
 * Kinds on the whole contributor list rather than in the range on show, so
 * narrowing the range never takes a kind's button out from under the cursor.
 */
const contributorKindsOf = cachedBy(
  (data: DashboardData): ReadonlySet<ContributorKind> =>
    new Set(
      data.contributors.map((contributor) => contributor.kind ?? "human"),
    ),
);

const contributorsHeading = (data: DashboardData): SectionHeading => ({
  title: "Contributors",
  subtitle: `${contributorsRangeOfferedIn(data) ? "commits in range by the author's date" : "whole history"}; per contributor: commits authored above, commits co-authored for others below — hatching marks cross-kind collaboration`,
  annotation: data.config?.charts?.annotations?.contributors,
});

const tallyContributors = (
  data: DashboardData,
  range: HistoryRange,
  maxContributorsInCharts: number,
): ListedContributor[] => {
  if (!contributorsTalliedIn(data)) {
    return data.contributors.map((contributor) => ({
      ...contributor,
      commits: contributor.commits ?? 0,
      added: contributor.added ?? 0,
      deleted: contributor.deleted ?? 0,
      assistedBy: contributor.assistedBy ?? {},
      assisted: contributor.assisted ?? {},
    }));
  }
  return contributorsInRange(
    data.contributors,
    data.commits,
    monthSpanOf(range, historyOf(data).historyDays.last),
    maxContributorsInCharts * 2,
  );
};

const listedContributorsCache = new WeakMap<
  DashboardData,
  Map<string, ListedContributor[]>
>();

/**
 * The contributors list over a range, tallied from every commit once per data,
 * range and cap. The same array comes back for the same three, so the table
 * and the chart can be built in `h.lazy` from it, and the table skips every
 * render that changes neither — a kind filter click, say.
 */
const listedContributorsOf = (
  data: DashboardData,
  range: HistoryRange,
  maxContributorsInCharts: number,
): ListedContributor[] => {
  const byRange =
    listedContributorsCache.get(data) ?? new Map<string, ListedContributor[]>();
  listedContributorsCache.set(data, byRange);
  const key = `${range}|${maxContributorsInCharts}`;
  const cached = byRange.get(key);
  if (cached) {
    return cached;
  }
  const tallied = tallyContributors(data, range, maxContributorsInCharts);
  byRange.set(key, tallied);
  return tallied;
};

/**
 * The table under the chart, built through `h.lazy` with the list as the
 * first argument.
 */
const ContributorsTable = <M>(
  h: Html.H<M>,
  listedContributors: readonly ListedContributor[],
) =>
  DataTable(h, {
    caption: `All ${listedContributors.length} listed contributors`,
    header: ["contributor", "commits", "added", "deleted"],
    rows: listedContributors.map((contributor) => [
      [
        contributor.kind && contributor.kind !== "human"
          ? h.span
              .attr("title", kindBadge[contributor.kind].title)
              .class("mr-1 select-none")
              .children(
                h.span
                  .class("mr-1 inline-block size-2.5 rounded-xs")
                  .style({ background: kindColors[contributor.kind] }),
                kindBadge[contributor.kind].icon,
              )
          : undefined,
        contributor.url
          ? h.a
              .attrs({
                href: contributor.url,
                target: "_blank",
                rel: "noreferrer",
              })
              .class("font-medium hover:underline")
              .children(contributor.name)
          : contributor.name,
        " ",
        h.span.class("text-(--text-muted)").children(`<${contributor.email}>`),
      ],
      contributor.commits,
      formatCount(contributor.added),
      formatCount(contributor.deleted),
    ]),
  });

/**
 * The chart's rows for a contributors list, built once per list, so the
 * chart's `h.lazy` call sees the same array until the range changes.
 */
const contributorBarsItemsOf = cachedBy(
  (listedContributors: readonly ListedContributor[]): ContributorBarsItem[] =>
    listedContributors.map((contributor) => ({
      // Email alone isn't unique: bots and AI agents are identified by name too
      // (several Claude releases share noreply@anthropic.com), matching how
      // indexing buckets them.
      id: `${contributor.name} <${contributor.email}>`,
      label: contributor.name || contributor.email,
      href: contributor.url,
      kind: contributor.kind ?? "human",
      authored: contributor.commits,
      assistedBy: contributor.assistedBy,
      assisted: contributor.assisted,
    })),
);

/**
 * The chart, built through `h.lazy` with `"bars"` as the first argument: the
 * table's call leads with `listedContributors`, and lazy calls in one instance
 * are told apart by their first argument.
 */
const ContributorsChart = <M>(
  h: Html.H<M>,
  _lazyKey: "bars",
  listedContributors: readonly ListedContributor[],
  kindFilter: KindFilter,
  maxItems: number,
) =>
  ContributorBars(h, {
    items: contributorBarsItemsOf(listedContributors),
    kindFilter,
    maxItems,
  });

export const ContributorsSectionMessage = UiSchema.TaggedEnum({
  ToggledKindFilter: { kindFilter: KindFilterSchema },
  PickedRange: { range: HistoryRangeSchema },
});

/**
 * Who built the repo, narrowed by kind and range. The list is re-tallied from
 * every commit on a range change; the React dashboard defers that render and
 * dims the stale chart meanwhile, while Effect UI re-renders synchronously, so
 * the tally is memoized per range (see `listedContributorsOf`).
 */
export const ContributorsSection = Html.component({
  name: "ContributorsSection",
  props: Schema.Struct({
    data: DashboardDataSchema,
    maxContributorsInCharts: Schema.Number,
  }),
  model: Schema.Struct({
    range: HistoryRangeSchema,
    kindFilter: KindFilterSchema,
  }),
  message: ContributorsSectionMessage,
}).make({
  // The chart opens on the whole history, as it read before it could be
  // narrowed: who built the repo is its first question.
  init: () => ({ range: "all-years" as const, kindFilter: "all" as const }),
  update: {
    ToggledKindFilter: ($, { kindFilter }) => $.evolve({ kindFilter }),
    PickedRange: ($, { range }) => $.evolve({ range }),
  },
  view: (h, model) => {
    const { data, maxContributorsInCharts } = h.props;
    const listedContributors = listedContributorsOf(
      data,
      model.range,
      maxContributorsInCharts,
    );
    return Section(h, {
      ...contributorsHeading(data),
      controls: [
        KindFilterControl(h, {
          key: "kind-filter",
          label: "Filter contributors by kind",
          value: model.kindFilter,
          onChange: (kindFilter) =>
            ContributorsSectionMessage.ToggledKindFilter({ kindFilter }),
          presentKinds: contributorKindsOf(data),
        }),
        contributorsRangeOfferedIn(data) &&
          HistoryRangeSelect(h, {
            props: {
              label: "Contributors range",
              value: model.range,
              items: historyOf(data).rangeItems,
            },
            onEmit: {
              Picked: ({ value }) =>
                ContributorsSectionMessage.PickedRange({ range: value }),
            },
          }),
      ],
      footer: [h.lazy(ContributorsTable, listedContributors)],
      children: [
        h.lazy(
          ContributorsChart,
          "bars",
          listedContributors,
          model.kindFilter,
          maxContributorsInCharts * 2,
        ),
      ],
    });
  },
});

export const contributorsSectionOf = (
  data: DashboardData,
  maxContributorsInCharts: number,
): ReportSection => ({
  id: "contributors",
  skeleton: contributorsHeading(data),
  view: (h, key) =>
    ContributorsSection(h, {
      key,
      props: { data, maxContributorsInCharts },
    }),
});
