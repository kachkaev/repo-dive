import { Subscription, UiSchema } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { Schema, Stream } from "effect";

import { type DashboardData, DashboardDataSchema } from "../data.ts";
import { FilesTimeline } from "./files-timeline.ts";
import { LinesTimeline, linesTimelineHeading } from "./lines-timeline.ts";
import { churnPerMonthSectionOf } from "./report-sections/churn-per-month-section.ts";
import { commitCalendarSectionOf } from "./report-sections/commit-calendar-section.ts";
import { commitsPerMonthSectionOf } from "./report-sections/commits-per-month-section.ts";
import { contributorsSectionOf } from "./report-sections/contributors-section.ts";
import { dependenciesSectionOf } from "./report-sections/dependencies-section.ts";
import { directDependenciesSectionOf } from "./report-sections/direct-dependencies-section.ts";
import { frameTicks } from "./report-sections/frame-ticks.ts";
import { looseEndsSectionOf } from "./report-sections/loose-ends-section.ts";
import { mostSuppressedLintRulesSectionOf } from "./report-sections/most-suppressed-lint-rules-section.ts";
import type { ReportSection } from "./report-sections/shared/report-section.ts";
import {
  SectionHeadingSkeleton,
  SectionSkeleton,
} from "./shared/primitives.ts";

/**
 * Every report section below the stat tiles, in reading order. A section the
 * repo has nothing for is left out, so it spends no reveal step. Each section
 * lives in its own file and is listed here by one call: porting a chart edits
 * that file, not this list.
 */
const listReportSections = (
  data: DashboardData,
  maxContributorsInCharts: number,
): ReportSection[] => {
  const sections: Array<ReportSection | undefined> = [
    data.languages.length > 0 || data.survival.length > 0
      ? {
          id: "lines-of-code",
          // This chart sits above the scroll cut, so its heading is the first
          // thing a reload shows: the placeholder carries that real heading
          // from the very first paint, where ghost bars would flash into text.
          skeleton: {
            ...linesTimelineHeading,
            annotation: data.config?.charts?.annotations?.["lines-of-code"],
          },
          view: (h, key) => LinesTimeline(h, data).key(key),
        }
      : undefined,
    // The same timeline at the file grain, directly under its line-grain
    // sibling. Gated on data the file chart can actually draw: per-language
    // counts of every file (absent in dashboard.json written before the chart
    // covered every file) or file-survival samples.
    data.fileTypes.some((row) => row.byLanguage !== undefined) ||
    (data.fileSurvival ?? []).length > 0
      ? {
          id: "number-of-files",
          skeleton: undefined,
          view: (h, key) => FilesTimeline(h, data).key(key),
        }
      : undefined,
    commitCalendarSectionOf(data),
    commitsPerMonthSectionOf(data),
    churnPerMonthSectionOf(data),
    directDependenciesSectionOf(data),
    dependenciesSectionOf(data),
    looseEndsSectionOf(data),
    mostSuppressedLintRulesSectionOf(data),
    contributorsSectionOf(data, maxContributorsInCharts),
  ];
  return sections.filter((section) => section !== undefined);
};

const reportSectionsCache = new WeakMap<
  DashboardData,
  Map<number, ReportSection[]>
>();

/**
 * {@link listReportSections}, built once per data: the view and the
 * subscriptions both ask on every reveal step, and the headings scan every
 * commit.
 */
export const reportSectionsOf = (
  data: DashboardData,
  maxContributorsInCharts: number,
): ReportSection[] => {
  const byMax =
    reportSectionsCache.get(data) ?? new Map<number, ReportSection[]>();
  reportSectionsCache.set(data, byMax);
  const cached = byMax.get(maxContributorsInCharts);
  if (cached) {
    return cached;
  }
  const sections = listReportSections(data, maxContributorsInCharts);
  byMax.set(maxContributorsInCharts, sections);
  return sections;
};

export const ReportSectionsMessage = UiSchema.TaggedEnum({
  TickedFrame: {},
});

/**
 * Reveals the report one section per frame. First paint stops at the
 * headline — the header and the stat tiles, with a placeholder where the
 * report will grow — and each animation frame after it mounts one more
 * section, while the tail keeps signalling that more of the report is on the
 * way: as the next section's real heading over a spinner when it is a plain
 * `Section`, and as anonymous ghost bars otherwise.
 *
 * The React dashboard gets there with a deferred render and a recursive
 * component that reveals inside a transition, so a click on a visible section
 * can jump the queue. Effect UI renders synchronously and has no transitions,
 * so the reveal is a counter in the Model, advanced by a Subscription that
 * ticks once per frame (see `frame-ticks.ts`, which keeps ticking in a hidden
 * tab) and runs only while sections are still hidden. A frame is short and
 * each section's render is small, so the page stays interactive between steps
 * all the same.
 */
export const ReportSections = Html.component({
  name: "ReportSections",
  props: Schema.Struct({
    data: DashboardDataSchema,
    maxContributorsInCharts: Schema.Number,
  }),
  model: Schema.Struct({ revealed: Schema.Number }),
  message: ReportSectionsMessage,
}).make({
  init: () => ({ revealed: 0 }),
  update: {
    TickedFrame: ($) => $.evolve({ revealed: (revealed) => revealed + 1 }),
  },
  subscriptions: ({ model, props }) => [
    model.revealed <
      reportSectionsOf(props.data, props.maxContributorsInCharts).length &&
      Subscription.make(
        "frameTicks",
        frameTicks.pipe(Stream.map(() => ReportSectionsMessage.TickedFrame())),
      ),
  ],
  view: (h, model) => {
    const sections = reportSectionsOf(
      h.props.data,
      h.props.maxContributorsInCharts,
    );
    const next = sections[model.revealed];
    // A view returns one node and Effect UI has no fragments, so a plain div
    // holds the sections; their margins collapse through it, so the layout is
    // the React dashboard's. Stateful sections are child components, which
    // Effect UI tells apart by component (and key), not by position, so one
    // keeps its Model as the sections before it come and go.
    return h.div(
      sections
        .slice(0, model.revealed)
        .map((section) => section.view(h, section.id)),
      next === undefined
        ? undefined
        : (next.skeleton
            ? SectionHeadingSkeleton(h, next.skeleton)
            : SectionSkeleton(h)
          ).key(`skeleton-${next.id}`),
    );
  },
});
