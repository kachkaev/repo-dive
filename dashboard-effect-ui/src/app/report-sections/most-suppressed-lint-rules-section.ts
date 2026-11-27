import type { DashboardData } from "../../data.ts";
import { BarList } from "../bar-list.ts";
import { Section, type SectionHeading } from "../shared/primitives.ts";
import type { ReportSection } from "./shared/report-section.ts";

export const mostSuppressedLintRulesSectionOf = (
  data: DashboardData,
): ReportSection | undefined => {
  if (data.topRules.length === 0) {
    return undefined;
  }
  const heading: SectionHeading = {
    title: "Most-suppressed lint rules",
    subtitle:
      "at the latest commit; (all) = blanket disables without a rule list",
    // The id predates oxlint counting and stays, so configs annotating it keep working
    annotation:
      data.config?.charts?.annotations?.["most-suppressed-eslint-rules"],
  };
  return {
    id: "most-suppressed-eslint-rules",
    skeleton: heading,
    view: (h, key) =>
      Section(h, {
        ...heading,
        children: [
          BarList(h, {
            items: data.topRules.map((row) => ({
              id: row.rule,
              label: row.rule,
              value: row.count,
            })),
            color: "var(--series-6)",
          }),
        ],
      }).key(key),
  };
};
