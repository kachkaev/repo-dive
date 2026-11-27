import { UiSchema } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { Schema } from "effect";

import {
  type ContributorKind,
  type DashboardData,
  DashboardDataSchema,
} from "../../data.ts";
import { ChartPlaceholder } from "../shared/chart-placeholder.ts";
import {
  kindBadge,
  kindColors,
  KindFilterControl,
  KindFilterSchema,
} from "../shared/contributor-kinds.ts";
import { formatCount } from "../shared/format.ts";
import {
  historyDaySpanOf,
  type HistoryRange,
  monthSpanOf,
} from "../shared/history-range.ts";
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
import {
  calendarHistoryOf,
  HistoryRangeSchema,
  rangeItemsOf,
} from "./shared/history-ranges.ts";
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
  contributorsTalliedIn(data) &&
  calendarHistoryOf(
    historyDaySpanOf(data.commits, data.repo.firstCommitDate, data.generatedAt),
  ).years > 1;

const contributorsHeading = (data: DashboardData): SectionHeading => ({
  title: "Contributors",
  subtitle: `${contributorsRangeOfferedIn(data) ? "commits in range by the author's date" : "whole history"}; per contributor: commits authored above, commits co-authored for others below — hatching marks cross-kind collaboration`,
  annotation: data.config?.charts?.annotations?.contributors,
});

const listedContributorsOf = (
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
  const historyDays = historyDaySpanOf(
    data.commits,
    data.repo.firstCommitDate,
    data.generatedAt,
  );
  return contributorsInRange(
    data.contributors,
    data.commits,
    monthSpanOf(range, historyDays.last),
    maxContributorsInCharts * 2,
  );
};

/**
 * The table under the chart, tallied from every commit. Built through
 * `h.lazy` on the data and the range, so a kind filter click reuses it, and
 * only a new range tallies again.
 */
const ContributorsTable = <M>(
  h: Html.H<M>,
  data: DashboardData,
  range: HistoryRange,
  maxContributorsInCharts: number,
) => {
  const listedContributors = listedContributorsOf(
    data,
    range,
    maxContributorsInCharts,
  );
  return DataTable(h, {
    caption: `All ${listedContributors.length} listed contributors`,
    header: ["contributor", "commits", "added", "deleted"],
    rows: listedContributors.map((contributor) => [
      h.span(
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
      ),
      contributor.commits,
      formatCount(contributor.added),
      formatCount(contributor.deleted),
    ]),
  });
};

const ContributorsSectionMessage = UiSchema.TaggedEnum({
  ToggledKindFilter: { kindFilter: KindFilterSchema },
  PickedRange: { range: HistoryRangeSchema },
});

/**
 * Who built the repo, narrowed by kind and range. The list is re-tallied from
 * every commit on a range change; the React dashboard defers that render and
 * dims the stale chart meanwhile, while Effect UI re-renders synchronously, so
 * the tally runs inside `h.lazy` and only when the range changes.
 */
const ContributorsSection = Html.component({
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
    const historyDays = historyDaySpanOf(
      data.commits,
      data.repo.firstCommitDate,
      data.generatedAt,
    );
    // Over the whole list rather than the range on show, so narrowing the
    // range never takes a kind's button out from under the cursor.
    const contributorKinds = new Set<ContributorKind>(
      data.contributors.map((contributor) => contributor.kind ?? "human"),
    );
    const isHistoryRange = Schema.is(HistoryRangeSchema);
    return Section(h, {
      ...contributorsHeading(data),
      controls: [
        KindFilterControl(h, {
          key: "kind-filter",
          label: "Filter contributors by kind",
          value: model.kindFilter,
          onChange: (kindFilter) =>
            ContributorsSectionMessage.ToggledKindFilter({ kindFilter }),
          presentKinds: contributorKinds,
        }),
        contributorsRangeOfferedIn(data) &&
          HistoryRangeSelect(h, {
            props: {
              label: "Contributors range",
              value: model.range,
              items: rangeItemsOf(calendarHistoryOf(historyDays), historyDays),
            },
            onEmit: {
              Picked: ({ value }) =>
                isHistoryRange(value)
                  ? ContributorsSectionMessage.PickedRange({ range: value })
                  : undefined,
            },
          }),
      ],
      footer: [
        h.lazy(ContributorsTable, data, model.range, maxContributorsInCharts),
      ],
      children: [
        // TEMPORARY until contributor-bars.tsx is ported: ContributorBars over
        // `listedContributorsOf(data, model.range, maxContributorsInCharts)`,
        // narrowed to `model.kindFilter`, at most `maxContributorsInCharts * 2`
        // rows — built inside `h.lazy` too, so a kind filter click skips the tally.
        ChartPlaceholder(h, {
          reactFile: "contributor-bars.tsx",
          description: "Commits authored and co-authored per contributor",
          height: 288,
        }),
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
  view: (h) =>
    ContributorsSection(h, { props: { data, maxContributorsInCharts } }),
});
