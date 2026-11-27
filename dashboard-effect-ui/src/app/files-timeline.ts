import type { Html } from "@effect/ui/html";

import type { DashboardData } from "../data.ts";
import { ChartPlaceholder } from "./shared/chart-placeholder.ts";
import { Section } from "./shared/primitives.ts";

/**
 * The file-count timeline: the file grain of `SurvivalTimeline`, sitting right
 * under the lines-of-code chart it mirrors. It counts every file git tracks,
 * where that chart only counts source files: the flat variants come from the
 * per-commit tree listing, the purpose and contributor splits and age shading
 * from the `file-survival` collector, which attributes each living file to the
 * commit that created it — so a file keeps its creator and creation year
 * through every later edit, until it is deleted.
 *
 * TEMPORARY: `SurvivalTimeline` (with its controls and "View data" table) is
 * not ported yet, so this draws the section around a placeholder.
 */
export const FilesTimeline = <M>(h: Html.H<M>, data: DashboardData) =>
  Section(h, {
    title: "Number of files",
    subtitle:
      "every file git tracks over the whole history; purpose split, contributor split and age shading come from each file's creating commit, sampled like survival — a file keeps its creator and creation year until deleted, later edits don't re-bin it",
    annotation: data.config?.charts?.annotations?.["number-of-files"],
    children: [
      ChartPlaceholder(h, {
        reactFile: "survival-timeline.tsx",
        description: "Stacked file counts over time, split four ways",
        height: 288,
      }),
    ],
  });
