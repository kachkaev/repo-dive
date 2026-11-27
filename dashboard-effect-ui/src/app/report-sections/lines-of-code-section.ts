import type { DashboardData } from "../../data.ts";
import { LinesTimeline, linesTimelineHeading } from "../lines-timeline.ts";
import type { ReportSection } from "./shared/report-section.ts";

export const linesOfCodeSectionOf = (
  data: DashboardData,
  maxContributorsInCharts: number,
): ReportSection | undefined =>
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
        view: (h, key) =>
          LinesTimeline(h, { data, maxContributorsInCharts }).key(key),
      }
    : undefined;
