import type { Html } from "@effect/ui/html";

import type { DashboardData } from "../data.ts";
import { cachedBy } from "./shared/cached-by.ts";
import {
  filePurposeLabelsOf,
  survivalColorScalesOf,
} from "./shared/survival-colors.ts";
import { SurvivalTimeline } from "./survival-timeline.ts";

/**
 * The section heading, exported so the reveal can paint it before this
 * section has arrived — this chart sits above the scroll cut, so anonymous
 * ghost bars flashing into the real heading would be the first thing a reload
 * shows. The subtitle is constant across every toggle combination (see
 * `SurvivalTimeline`): language splits count source files at each commit,
 * while purpose and contributor splits and age shading are attributed via git
 * blame at sampled commits.
 */
export const linesTimelineHeading = {
  title: "Lines of code",
  subtitle:
    "lines in source files over the whole history; purpose split, contributor split and age shading come from git blame at sampled commits; test data, assets, generated and vendored files are not counted",
};

/**
 * What the timeline takes from the data, once per data, so the same arrays
 * reach its props (and the caches keyed by them) on every render.
 */
const linesTimelineInputsOf = cachedBy((data: DashboardData) => ({
  flatRows: data.languages.map((row) => ({
    date: row.date,
    values: row.byLanguage,
  })),
  survivalRows: data.survival,
  purposeOrder: filePurposeLabelsOf(data),
  colorScales: survivalColorScalesOf(data),
}));

/**
 * The lines-of-code timeline: the line grain of `SurvivalTimeline`, drawn from
 * the dense per-commit language rows and the blame-based survival cross-tabs.
 */
export const LinesTimeline = <M>(
  h: Html.H<M>,
  {
    key,
    data,
    maxContributorsInCharts,
  }: { key: string; data: DashboardData; maxContributorsInCharts: number },
) =>
  SurvivalTimeline(h, {
    key,
    props: {
      title: linesTimelineHeading.title,
      subtitle: linesTimelineHeading.subtitle,
      annotation: data.config?.charts?.annotations?.["lines-of-code"],
      unit: "lines",
      maxContributorsInCharts,
      ...linesTimelineInputsOf(data),
    },
  });
