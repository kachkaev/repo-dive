import { UiSchema } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { Schema } from "effect";

import { type ContributorKind, DashboardDataSchema } from "../../data.ts";
import { ChartPlaceholder } from "../shared/chart-placeholder.ts";
import {
  KindFilterControl,
  KindFilterSchema,
} from "../shared/contributor-kinds.ts";
import { historyDaySpanOf } from "../shared/history-range.ts";
import { Section, type SectionHeading } from "../shared/primitives.ts";
import { HistoryRangeSelect } from "./history-range-select.ts";
import {
  calendarHistoryOf,
  defaultCalendarRangeOf,
  HistoryRangeSchema,
  rangeItemsOf,
} from "./shared/history-ranges.ts";
import type { ReportSection } from "./shared/report-section.ts";

const commitCalendarHeading = (
  annotation: string | undefined,
): SectionHeading => ({
  title: "Commit calendar",
  subtitle:
    "commits per day; days bucketed by the author's local date, i.e. when each commit was written",
  annotation,
});

const CommitCalendarSectionMessage = UiSchema.TaggedEnum({
  ToggledKindFilter: { kindFilter: KindFilterSchema },
  PickedRange: { range: HistoryRangeSchema },
});

/**
 * The commit calendar with its kind filter and range select. The section owns
 * both choices: in the React dashboard they live in `ReportSections`, lifted
 * out of the calendar so they survive its remount on a range change; here the
 * section is that owner, and the calendar below it can be re-keyed on the
 * range without losing them.
 */
const CommitCalendarSection = Html.component({
  name: "CommitCalendarSection",
  props: Schema.Struct({ data: DashboardDataSchema }),
  model: Schema.Struct({
    range: HistoryRangeSchema,
    kindFilter: KindFilterSchema,
  }),
  message: CommitCalendarSectionMessage,
}).make({
  init: ($) => {
    // The calendar draws the history as its authors' own days, so its ranges
    // come from these bounds rather than from the report's UTC date.
    const { data } = $.props;
    const historyDays = historyDaySpanOf(
      data.commits,
      data.repo.firstCommitDate,
      data.generatedAt,
    );
    return {
      range: defaultCalendarRangeOf(calendarHistoryOf(historyDays)),
      kindFilter: "all" as const,
    };
  },
  update: {
    ToggledKindFilter: ($, { kindFilter }) => $.evolve({ kindFilter }),
    PickedRange: ($, { range }) => $.evolve({ range }),
  },
  view: (h, model) => {
    const { data } = h.props;
    const historyDays = historyDaySpanOf(
      data.commits,
      data.repo.firstCommitDate,
      data.generatedAt,
    );
    // Kinds that ever committed — the contributor list can differ (it lists
    // co-authors too, and dashboard.json written before per-commit
    // contributor refs caps it per kind).
    const commitKinds = new Set<ContributorKind>(
      data.commits.map((commit) => commit.kind ?? "human"),
    );
    const isHistoryRange = Schema.is(HistoryRangeSchema);
    return Section(h, {
      ...commitCalendarHeading(
        data.config?.charts?.annotations?.["commit-calendar"],
      ),
      controls: [
        KindFilterControl(h, {
          key: "kind-filter",
          label: "Filter calendar by contributor kind",
          value: model.kindFilter,
          onChange: (kindFilter) =>
            CommitCalendarSectionMessage.ToggledKindFilter({ kindFilter }),
          presentKinds: commitKinds,
        }),
        HistoryRangeSelect(h, {
          props: {
            label: "Calendar range",
            value: model.range,
            items: rangeItemsOf(calendarHistoryOf(historyDays), historyDays),
          },
          onEmit: {
            Picked: ({ value }) =>
              isHistoryRange(value)
                ? CommitCalendarSectionMessage.PickedRange({ range: value })
                : undefined,
          },
        }),
      ],
      children: [
        // TEMPORARY until activity-calendar.tsx is ported. Key the calendar on
        // `model.range` so a hovered day from the previous range is not
        // reported over the new one.
        ChartPlaceholder(h, {
          reactFile: "activity-calendar.tsx",
          description: "Commits per day as calendar strips",
          height: 196,
        }),
      ],
    });
  },
});

export const commitCalendarSectionOf = (
  data: typeof DashboardDataSchema.Type,
): ReportSection | undefined =>
  data.repo.firstCommitDate !== undefined && data.commits.length > 0
    ? {
        id: "commit-calendar",
        skeleton: commitCalendarHeading(
          data.config?.charts?.annotations?.["commit-calendar"],
        ),
        view: (h) => CommitCalendarSection(h, { props: { data } }),
      }
    : undefined;
