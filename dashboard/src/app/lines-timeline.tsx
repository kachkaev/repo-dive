import type { DashboardData } from "../data.ts";
import { survivalColorScalesOf } from "./shared/survival-colors.tsx";
import { SurvivalTimeline } from "./survival-timeline.tsx";

/**
 * The section heading, exported so {@link ../app.tsx App} can paint it in its
 * placeholder before this component has mounted — this chart sits above the
 * scroll cut, so anonymous ghost bars flashing into the real heading would be
 * the first thing a reload shows. The subtitle is constant across every
 * toggle combination (see {@link SurvivalTimeline}): language splits count
 * source files at each commit, while contributor splits and age shading are
 * attributed via git blame at sampled commits.
 */
export const linesTimelineHeading = {
  title: "Lines of code",
  subtitle:
    "lines in source files over the whole history; contributor split and age shading come from git blame at sampled commits; lockfiles, minified bundles and generated data are not counted",
};

/**
 * The lines-of-code timeline: the line grain of {@link SurvivalTimeline},
 * drawn from the dense per-commit language rows and the blame-based survival
 * cross-tabs.
 */
export function LinesTimeline({
  data,
  maxContributorsInCharts,
}: {
  data: DashboardData;
  maxContributorsInCharts: number;
}) {
  return (
    <SurvivalTimeline
      title={linesTimelineHeading.title}
      subtitle={linesTimelineHeading.subtitle}
      annotation={data.config?.charts?.annotations?.["lines-of-code"]}
      unit="lines"
      flatRows={data.languages.map((row) => ({
        date: row.date,
        values: row.byLanguage,
      }))}
      survivalRows={data.survival}
      maxContributorsInCharts={maxContributorsInCharts}
      colorScales={survivalColorScalesOf(data)}
    />
  );
}
