import type { View } from "@effect/ui";
import type { Html } from "@effect/ui/html";

import type { SectionHeading } from "../../shared/primitives.ts";

/**
 * One entry of the report: what `ReportSections` lists, in reading order, and
 * reveals one per frame. Each lives in its own file under `report-sections/`,
 * as a function of the data that returns undefined when the repo has nothing
 * for it to show — so a chart port touches its section's file only.
 */
export type ReportSection = {
  /** The section's chart annotation id where it has one, e.g. `commit-calendar`. */
  readonly id: string;
  /**
   * What the reveal tail shows while the section waits for its turn: its
   * real heading over a spinner when it is a plain `Section` (the heading is
   * plain data, known long before the chart), or ghost bars when undefined,
   * as for the timelines, whose heading lives inside their own component in
   * the React dashboard.
   */
  readonly skeleton: SectionHeading | undefined;
  /**
   * Draws the section. Stateful sections return their own component here, so
   * their controls' state survives the parent's renders; stateless ones
   * return a `Section` view directly.
   */
  readonly view: <M>(h: Html.H<M>) => View.Content<M>;
};
