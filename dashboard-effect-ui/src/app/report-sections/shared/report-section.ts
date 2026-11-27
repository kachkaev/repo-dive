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
  /**
   * Unique among the sections, and the key of the section's node: the
   * section's chart annotation id, e.g. `commit-calendar`.
   */
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
   * Draws the section, keyed with `key` (the `id`): `.key(key)` on a view's
   * root element, or `key` on a component call. Stateful sections return
   * their own component, so their controls' state survives the parent's
   * renders; stateless ones return a `Section` view directly.
   */
  readonly view: <M>(h: Html.H<M>, key: string) => View.Content<M>;
};
