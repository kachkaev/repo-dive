// @vitest-environment happy-dom
import { HtmlScene } from "@effect/ui/html/testing";
import type { Locator } from "@effect/ui/testing";
import { ToggleGroup, ToggleGroupEvents } from "@effect/ui-kit";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { DivergingBars } from "../diverging-bars.ts";
import { commitOf, dashboardDataOf } from "../shared/dashboard-data-fixture.ts";
import { ChurnPerMonthSection } from "./churn-per-month-section.ts";

/**
 * The points the section passes to its chart. A scene draws a child
 * component as a leaf node holding its props, so the test reads them there.
 */
const chartPointsIn = (root: Locator.Node): unknown => {
  type ChildNode = Locator.Node & {
    readonly _tag?: string;
    readonly component?: unknown;
  };
  const found: ChildNode[] = [];
  const visit = (node: ChildNode) => {
    if (node._tag === "Child" && node.component === DivergingBars) {
      found.push(node);
    }
    for (const child of node.children ?? []) {
      visit(child);
    }
  };
  visit(root);
  expect(found).toHaveLength(1);
  return found[0]?.props?.["points"];
};

const data = dashboardDataOf({
  commits: [
    { ...commitOf("2026-01-10", "human", true), added: 30, deleted: 3 },
    { ...commitOf("2026-01-11", "bot"), added: 100, deleted: 50 },
    { ...commitOf("2026-01-12", "ai"), added: 7, deleted: 1 },
    { ...commitOf("2026-02-03", "human"), added: 5, deleted: 5 },
  ],
});

const pickKind = (kindFilter: "all" | "human" | "ai" | "bot") =>
  ToggleGroupEvents.Toggled({ value: [kindFilter] });

it.effect("charts only the churn of the kind picked, month by month", () =>
  Effect.gen(function* () {
    const s = yield* HtmlScene.make(ChurnPerMonthSection, { data });
    const all = chartPointsIn(s.root);
    expect(all).toStrictEqual([
      { month: "2026-01", positive: 137, negative: 54, positiveSecondary: 30 },
      { month: "2026-02", positive: 5, negative: 5, positiveSecondary: 0 },
    ]);

    // A scene runs this component's update, not ui-kit's ToggleGroup's, so
    // it stands in for the click with the event the group would emit.
    s.childEmit(ToggleGroup, "kind-filter", pickKind("bot"));
    const bots = chartPointsIn(s.root);
    // Every month stays, so the bars keep their slots and only rescale.
    expect(bots).toStrictEqual([
      { month: "2026-01", positive: 100, negative: 50, positiveSecondary: 0 },
      { month: "2026-02", positive: 0, negative: 0, positiveSecondary: 0 },
    ]);

    // Each filter's points are built once per data: the chart gets the same
    // array back, so its memoized marks and props comparison hold.
    s.childEmit(ToggleGroup, "kind-filter", pickKind("all"));
    expect(chartPointsIn(s.root)).toBe(all);
    s.childEmit(ToggleGroup, "kind-filter", pickKind("bot"));
    expect(chartPointsIn(s.root)).toBe(bots);
  }),
);
