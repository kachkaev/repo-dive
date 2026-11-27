import type { DashboardData } from "../../data.ts";
import { FilesTimeline } from "../files-timeline.ts";
import type { ReportSection } from "./shared/report-section.ts";

/**
 * The same timeline at the file grain, directly under its line-grain sibling.
 * Gated on data the file chart can actually draw: per-language counts of every
 * file (absent in dashboard.json written before the chart covered every file)
 * or file-survival samples.
 */
export const numberOfFilesSectionOf = (
  data: DashboardData,
  maxContributorsInCharts: number,
): ReportSection | undefined =>
  data.fileTypes.some((row) => row.byLanguage !== undefined) ||
  (data.fileSurvival ?? []).length > 0
    ? {
        id: "number-of-files",
        skeleton: undefined,
        view: (h, key) =>
          FilesTimeline(h, { key, data, maxContributorsInCharts }),
      }
    : undefined;
