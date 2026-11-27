import type { Html } from "@effect/ui/html";

import type { DashboardData } from "../data.ts";
import { cachedBy } from "./shared/cached-by.ts";
import {
  filePurposeLabelsOf,
  survivalColorScalesOf,
} from "./shared/survival-colors.ts";
import { SurvivalTimeline } from "./survival-timeline.ts";

/**
 * What the timeline takes from the data, once per data, so the same arrays
 * reach its props (and the caches keyed by them) on every render.
 */
const filesTimelineInputsOf = cachedBy((data: DashboardData) => ({
  flatRows: data.fileTypes.flatMap((row) =>
    row.byLanguage ? [{ date: row.date, values: row.byLanguage }] : [],
  ),
  survivalRows: data.fileSurvival ?? [],
  purposeOrder: filePurposeLabelsOf(data),
  colorScales: survivalColorScalesOf(data),
}));

/**
 * The file-count timeline: the file grain of `SurvivalTimeline`, sitting right
 * under the lines-of-code chart it mirrors. It counts every file git tracks,
 * where that chart only counts source files: the flat variants come from the
 * per-commit tree listing, the purpose and contributor splits and age shading
 * from the `file-survival` collector, which attributes each living file to the
 * commit that created it — so a file keeps its creator and creation year
 * through every later edit, until it is deleted.
 */
export const FilesTimeline = <M>(
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
      title: "Number of files",
      subtitle:
        "every file git tracks over the whole history; purpose split, contributor split and age shading come from each file's creating commit, sampled like survival — a file keeps its creator and creation year until deleted, later edits don't re-bin it",
      annotation: data.config?.charts?.annotations?.["number-of-files"],
      unit: "files",
      maxContributorsInCharts,
      ...filesTimelineInputsOf(data),
    },
  });
