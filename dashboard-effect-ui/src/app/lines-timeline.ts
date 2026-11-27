import type { Html } from "@effect/ui/html";

import type { DashboardData } from "../data.ts";
import { ChartPlaceholder } from "./shared/chart-placeholder.ts";
import { Section } from "./shared/primitives.ts";

/**
 * The section heading, exported so the reveal can paint it before this
 * section has arrived — this chart sits above the scroll cut, so anonymous
 * ghost bars flashing into the real heading would be the first thing a reload
 * shows. The subtitle is constant across every toggle combination: language
 * splits count source files at each commit, while purpose and contributor
 * splits and age shading are attributed via git blame at sampled commits.
 */
export const linesTimelineHeading = {
  title: "Lines of code",
  subtitle:
    "lines in source files over the whole history; purpose split, contributor split and age shading come from git blame at sampled commits; test data, assets, generated and vendored files are not counted",
};

/**
 * The lines-of-code timeline: the line grain of `SurvivalTimeline`, drawn from
 * the dense per-commit language rows and the blame-based survival cross-tabs.
 *
 * TEMPORARY: `SurvivalTimeline` (with its controls and "View data" table) is
 * not ported yet, so this draws the section around a placeholder.
 */
export const LinesTimeline = <M>(h: Html.H<M>, data: DashboardData) =>
  Section(h, {
    ...linesTimelineHeading,
    annotation: data.config?.charts?.annotations?.["lines-of-code"],
    children: [
      ChartPlaceholder(h, {
        reactFile: "survival-timeline.tsx",
        description: "Stacked lines of code over time, split four ways",
        height: 288,
      }),
    ],
  });
