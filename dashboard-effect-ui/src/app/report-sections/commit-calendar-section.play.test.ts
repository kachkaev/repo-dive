// @vitest-environment happy-dom
import { HtmlLocator, HtmlPlay } from "@effect/ui/html/testing";
import { Locator, TestHost } from "@effect/ui/testing";
import { it } from "@effect/vitest";
import { Effect } from "effect";

import { dashboardDataOf } from "../shared/dashboard-data-fixture.ts";
import { CommitCalendarSection } from "./commit-calendar-section.ts";

/** A day's hover target, whose id ends with its date. */
const dayTarget = (isoDate: string): Locator.Locator => ({
  description: `hover target of ${isoDate}`,
  all: (root) =>
    Locator.elements(root).filter(
      (node) =>
        node.attrs?.["fill"] === "transparent" &&
        node.attrs["id"]?.endsWith(isoDate) === true,
    ),
});

const tooltip = Locator.attr("data-slot", "tooltip-content");

it.effect("forgets the hovered day when the range changes", () =>
  Effect.gen(function* () {
    const play = yield* HtmlPlay.make(CommitCalendarSection, {
      data: dashboardDataOf(),
    });
    yield* play.fire(dayTarget("2025-11-02"), "mouseenter", { x: 0, y: 0 });
    yield* play.expect(tooltip).toHaveText(/^2025-11-02/);

    // The strips under the pointer are swapped without a mouseleave, as in
    // a browser: only re-keying the calendar on its range drops the day.
    yield* play.click(HtmlLocator.role("combobox", { name: "Calendar range" }));
    yield* play.click(HtmlLocator.role("option", { name: "2025" }));
    yield* play
      .expect(HtmlLocator.role("img", { name: "Commit calendar, 2025" }))
      .toExist();
    yield* play.expect(tooltip).toBeAbsent();
  }).pipe(Effect.provide(TestHost.layer())),
);
