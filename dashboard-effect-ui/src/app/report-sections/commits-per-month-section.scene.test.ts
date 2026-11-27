// @vitest-environment happy-dom
import { HtmlLocator, HtmlScene } from "@effect/ui/html/testing";
import { Locator } from "@effect/ui/testing";
import { ToggleGroup, ToggleGroupEvents } from "@effect/ui-kit";
import { it } from "@effect/vitest";
import { Effect } from "effect";

import { dashboardDataOf } from "../shared/dashboard-data-fixture.ts";
import { CommitsPerMonthSection } from "./commits-per-month-section.ts";

it.effect("presses the kind filter option the user picks", () =>
  Effect.gen(function* () {
    const kindFilter = HtmlLocator.role("group", {
      name: "Filter commits by author kind",
    });
    const option = (name: string) =>
      Locator.inside(kindFilter, HtmlLocator.role("button", { name }));
    const s = yield* HtmlScene.make(CommitsPerMonthSection, {
      data: dashboardDataOf(),
    });
    s.expect(option("all")).toHaveAttribute("aria-pressed", "true");
    // A scene runs this component's update, not ui-kit's ToggleGroup's, so
    // it stands in for the click with the event the group would emit.
    s.childEmit(
      ToggleGroup,
      "kind-filter",
      ToggleGroupEvents.Toggled({ value: ["bot"] }),
    )
      .expect(option("bots"))
      .toHaveAttribute("aria-pressed", "true")
      .expect(option("all"))
      .toHaveAttribute("aria-pressed", "false");
  }),
);

it.effect("marks the percentage option disabled while one series is left", () =>
  Effect.gen(function* () {
    const percentage = Locator.inside(
      HtmlLocator.role("group", { name: "Commits per month value display" }),
      HtmlLocator.role("button", { name: "percentage" }),
    );
    const s = yield* HtmlScene.make(CommitsPerMonthSection, {
      data: dashboardDataOf(),
    });
    // Base UI writes aria-disabled on every toggle in a group, "false" too.
    s.expect(percentage).toHaveAttribute("aria-disabled", "false");
    s.childEmit(
      ToggleGroup,
      "kind-filter",
      ToggleGroupEvents.Toggled({ value: ["bot"] }),
    )
      .expect(percentage)
      .toHaveAttribute("aria-disabled", "true");
  }),
);
