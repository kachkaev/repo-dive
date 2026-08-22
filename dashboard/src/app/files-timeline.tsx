import type { DashboardData } from "../data.ts";
import { survivalColorScalesOf } from "./shared/survival-colors.tsx";
import { SurvivalTimeline } from "./survival-timeline.tsx";

/**
 * The file-count timeline: the file grain of {@link SurvivalTimeline}, sitting
 * right under the lines-of-code chart it mirrors. The flat variants come from
 * the same per-commit scan that counts lines; the contributor split and age
 * shading come from the `file-survival` collector, which attributes each
 * living file to the commit that created it — so a file keeps its creator and
 * creation year through every later edit, until it is deleted.
 */
export function FilesTimeline({
  data,
  maxContributorsInCharts,
}: {
  data: DashboardData;
  maxContributorsInCharts: number;
}) {
  return (
    <SurvivalTimeline
      title="Number of files"
      subtitle="source files in the tree over the whole history; contributor split and age shading come from each file's creating commit, sampled like survival — a file keeps its creator and creation year until deleted, later edits don't re-bin it; lockfiles, minified bundles and generated data are not counted"
      annotation={data.config?.charts?.annotations?.["number-of-files"]}
      unit="files"
      flatRows={data.languages.flatMap((row) =>
        row.byLanguageFiles
          ? [{ date: row.date, values: row.byLanguageFiles }]
          : [],
      )}
      survivalRows={data.fileSurvival ?? []}
      maxContributorsInCharts={maxContributorsInCharts}
      colorScales={survivalColorScalesOf(data)}
    />
  );
}
