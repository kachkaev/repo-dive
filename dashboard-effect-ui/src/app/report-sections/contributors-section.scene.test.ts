// @vitest-environment happy-dom
import { HtmlLocator, HtmlScene } from "@effect/ui/html/testing";
import { Locator } from "@effect/ui/testing";
import { ToggleGroup, ToggleGroupEvents } from "@effect/ui-kit";
import { it } from "@effect/vitest";
import { Effect } from "effect";

import { dashboardDataOf } from "../shared/dashboard-data-fixture.ts";
import { ContributorsSection } from "./contributors-section.ts";
import {
  HistoryRangeSelect,
  HistoryRangeSelectEvents,
} from "./history-range-select.ts";

const chartRows = Locator.inside(
  HtmlLocator.role("list"),
  HtmlLocator.role("listitem"),
);
const chartRow = (name: string) =>
  Locator.inside(chartRows, Locator.text(name, { exact: true }));

it.effect("draws a pair of bars per contributor, next to the table", () =>
  Effect.gen(function* () {
    const s = yield* HtmlScene.make(ContributorsSection, {
      data: dashboardDataOf(),
      maxContributorsInCharts: 10,
    });
    s.expect(chartRows)
      .toHaveCount(3)
      .expect(chartRow("Alice"))
      .toExist()
      // Alice authored two of the fixture's four commits.
      .expect(Locator.attr("title", "2 commits authored"))
      .toExist()
      .expect(Locator.text("All 3 listed contributors"))
      .toExist();
  }),
);

it.effect("narrows the bars, not the table, to the kind picked", () =>
  Effect.gen(function* () {
    const s = yield* HtmlScene.make(ContributorsSection, {
      data: dashboardDataOf(),
      maxContributorsInCharts: 10,
    });
    // A scene runs this component's update, not ui-kit's ToggleGroup's, so
    // it stands in for the click with the event the group would emit.
    s.childEmit(
      ToggleGroup,
      "kind-filter",
      ToggleGroupEvents.Toggled({ value: ["bot"] }),
    )
      .expect(chartRows)
      .toHaveCount(1)
      .expect(chartRow("Renovate"))
      .toExist()
      .expect(Locator.text("All 3 listed contributors"))
      .toExist();
  }),
);

it.effect("re-tallies the bars over the range picked", () =>
  Effect.gen(function* () {
    const s = yield* HtmlScene.make(ContributorsSection, {
      data: dashboardDataOf(),
      maxContributorsInCharts: 10,
    });
    // Only Alice committed in 2025.
    s.childEmit(
      HistoryRangeSelect,
      HistoryRangeSelectEvents.Picked({ value: "year-2025" }),
    )
      .expect(chartRows)
      .toHaveCount(1)
      .expect(chartRow("Alice"))
      .toExist()
      .expect(Locator.text("All 1 listed contributors"))
      .toExist();
  }),
);
