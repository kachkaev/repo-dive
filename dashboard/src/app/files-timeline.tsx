import type { DashboardData } from "../data.ts";
import {
  filePurposeLabelsOf,
  survivalColorScalesOf,
} from "./shared/survival-colors.tsx";
import { SurvivalTimeline } from "./survival-timeline.tsx";

/**
 * The file-count timeline: the file grain of {@link SurvivalTimeline}, sitting
 * right under the lines-of-code chart it mirrors. It counts every file git
 * tracks, where that chart only counts source files: the flat variants come from
 * the per-commit tree listing, the contributor and purpose splits and age shading
 * from the `file-survival` collector, which attributes each living file to the
 * commit that created it — so a file keeps its creator and creation year through
 * every later edit, until it is deleted.
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
      subtitle="every file git tracks over the whole history; contributor split, purpose split and age shading come from each file's creating commit, sampled like survival — a file keeps its creator and creation year until deleted, later edits don't re-bin it"
      annotation={data.config?.charts?.annotations?.["number-of-files"]}
      unit="files"
      flatRows={data.fileTypes.flatMap((row) =>
        row.byLanguage ? [{ date: row.date, values: row.byLanguage }] : [],
      )}
      survivalRows={data.fileSurvival ?? []}
      purposeOrder={filePurposeLabelsOf(data)}
      maxContributorsInCharts={maxContributorsInCharts}
      colorScales={survivalColorScalesOf(data)}
    />
  );
}
