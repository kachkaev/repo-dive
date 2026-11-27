// @vitest-environment happy-dom
import { HtmlLocator, HtmlPlay } from "@effect/ui/html/testing";
import { Locator, TestHost } from "@effect/ui/testing";
import { it } from "@effect/vitest";
import { Effect } from "effect";

import { SurvivalTimeline } from "./survival-timeline.ts";
import { survivalTimelinePropsOf } from "./survival-timeline/survival-timeline-fixture.ts";

const option = (group: string, name: string) =>
  Locator.inside(
    HtmlLocator.role("group", { name: group }),
    HtmlLocator.role("button", { name }),
  );
const split = (name: string) => option("Split lines", name);
const shading = (name: string) => option("Age shading", name);
const percent = (name: string) => option("Lines of code value display", name);

/** A legend item with toggles: a button named by its label. */
const legendItem = (name: string) => HtmlLocator.role("button", { name });

/** A primary-button click with Alt held. */
const altClick = {
  button: 0,
  x: 0,
  y: 0,
  shift: false,
  ctrl: false,
  alt: true,
  meta: false,
  pointerType: "mouse",
};

/** The year shades' row, standing further off than the primary legend. */
const yearLegend = Locator.attr(
  "class",
  "mt-3 text-center text-xs text-balance text-(--text-secondary)",
);

/** A "View data" column header, closed `<details>` or not. */
const tableHeader = (name: string): Locator.Locator => ({
  description: `table header "${name}"`,
  all: (root) =>
    Locator.elements(root).filter(
      (node) =>
        Locator.tag("th").all(node).includes(node) &&
        Locator.textOf(node) === name,
    ),
});

it.effect("switches the split and the shading, legend and table along", () =>
  Effect.gen(function* () {
    const play = yield* HtmlPlay.make(
      SurvivalTimeline,
      survivalTimelinePropsOf(),
    );
    yield* play
      .expect(split("by language"))
      .toHaveAttribute("aria-pressed", "true");
    yield* play
      .expect(shading("shade by year written"))
      .toHaveAttribute("aria-pressed", "true");
    yield* play.expect(legendItem("TypeScript")).toExist();
    yield* play
      .expect(Locator.inside(yearLegend, Locator.text("2025", { exact: true })))
      .toExist();
    yield* play.expect(tableHeader("CSS")).toExist();

    yield* play.click(split("by contributor"));
    yield* play.expect(legendItem("Alice")).toExist();
    yield* play.expect(legendItem("TypeScript")).toBeAbsent();
    yield* play.expect(tableHeader("Bob")).toExist();

    yield* play.click(shading("no shading"));
    yield* play.expect(yearLegend).toBeAbsent();

    // One stack: no legend, no toggles, and no percentage to show.
    yield* play.click(split("all lines"));
    yield* play.expect(legendItem("Alice")).toBeAbsent();
    yield* play.expect(tableHeader("All lines")).toExist();
    yield* play.expect(percent("percentage")).toHaveAttribute("disabled", "");
    yield* play
      .expect(percent("percentage"))
      .toHaveAttribute("title", "A single series is always 100%");

    // Shaded, the all-units stack is its year bands, named by the legend.
    yield* play.click(shading("shade by year written"));
    yield* play.expect(Locator.text("2026", { exact: true })).toExist();
    yield* play
      .expect(percent("percentage"))
      .toHaveAttribute("disabled", false);
  }).pipe(Effect.provide(TestHost.layer())),
);

it.effect("keeps a hidden legend item hidden across the controls", () =>
  Effect.gen(function* () {
    const play = yield* HtmlPlay.make(
      SurvivalTimeline,
      survivalTimelinePropsOf(),
    );
    yield* play.click(legendItem("TypeScript"));
    yield* play
      .expect(legendItem("TypeScript"))
      .toHaveAttribute("aria-pressed", "false");

    yield* play.click(split("by purpose"));
    yield* play
      .expect(legendItem("Production"))
      .toHaveAttribute("aria-pressed", "true");
    yield* play.click(split("by language"));
    yield* play
      .expect(legendItem("TypeScript"))
      .toHaveAttribute("aria-pressed", "false");
    yield* play
      .expect(legendItem("CSS"))
      .toHaveAttribute("aria-pressed", "true");

    // With CSS the only one showing, an alt-click on it shows them all
    // again; a second one isolates it.
    yield* play.fire(legendItem("CSS"), "click", altClick);
    yield* play
      .expect(legendItem("TypeScript"))
      .toHaveAttribute("aria-pressed", "true");
    yield* play.fire(legendItem("CSS"), "click", altClick);
    yield* play
      .expect(legendItem("TypeScript"))
      .toHaveAttribute("aria-pressed", "false");
    yield* play
      .expect(legendItem("CSS"))
      .toHaveAttribute("aria-pressed", "true");
  }).pipe(Effect.provide(TestHost.layer())),
);

it.effect("disables what the data cannot draw, saying why", () =>
  Effect.gen(function* () {
    const play = yield* HtmlPlay.make(
      SurvivalTimeline,
      survivalTimelinePropsOf({ survivalRows: [] }),
    );
    yield* play.expect(split("by contributor")).toHaveAttribute("disabled", "");
    yield* play
      .expect(split("by contributor"))
      .toHaveAttribute("title", "No survival samples collected yet");
    yield* play
      .expect(shading("shade by year written"))
      .toHaveAttribute("title", "No per-year survival data collected yet");
    yield* play
      .expect(shading("no shading"))
      .toHaveAttribute("aria-pressed", "true");
  }).pipe(Effect.provide(TestHost.layer())),
);
