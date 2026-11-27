// @vitest-environment happy-dom
import { HtmlLocator, HtmlPlay } from "@effect/ui/html/testing";
import { Locator, TestHost } from "@effect/ui/testing";
import { it } from "@effect/vitest";
import { Effect } from "effect";

import { cn } from "./shared/cn.ts";
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
  cn("mt-3 text-center text-xs text-balance text-(--text-secondary)"),
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

it.effect("labels the file grain and forces shading without flat rows", () =>
  Effect.gen(function* () {
    const play = yield* HtmlPlay.make(SurvivalTimeline, {
      ...survivalTimelinePropsOf({ flatRows: [] }),
      title: "Number of files",
      unit: "files" as const,
    });
    yield* play
      .expect(option("Split files", "by language"))
      .toHaveAttribute("aria-pressed", "true");
    yield* play
      .expect(option("Age shading", "shade by year created"))
      .toHaveAttribute("aria-pressed", "true");
    yield* play
      .expect(option("Age shading", "no shading"))
      .toHaveAttribute("disabled", "");
    yield* play
      .expect(option("Age shading", "no shading"))
      .toHaveAttribute(
        "title",
        "This split only exists in the survival samples, which are always dated",
      );

    // All files, drawn shaded from the samples: its only legend names the
    // years, so no second row repeats them.
    yield* play.click(option("Split files", "all files"));
    yield* play
      .expect(option("Age shading", "shade by year created"))
      .toHaveAttribute("aria-pressed", "true");
    yield* play.expect(yearLegend).toBeAbsent();
    yield* play.expect(Locator.text("2025", { exact: true })).toExist();
    yield* play
      .expect(option("Number of files value display", "percentage"))
      .toHaveAttribute("disabled", false);
  }).pipe(Effect.provide(TestHost.layer())),
);

it.effect("draws no purpose split from samples that predate purposes", () =>
  Effect.gen(function* () {
    const props = survivalTimelinePropsOf();
    const play = yield* HtmlPlay.make(SurvivalTimeline, {
      ...props,
      survivalRows: props.survivalRows.map(
        ({ byPurpose: _byPurpose, byPurposeYear: _byPurposeYear, ...row }) =>
          row,
      ),
    });
    yield* play.expect(split("by purpose")).toHaveAttribute("disabled", "");
    yield* play
      .expect(split("by purpose"))
      .toHaveAttribute("title", "No per-purpose data collected yet");
    yield* play.click(split("by contributor"));
    yield* play.expect(legendItem("Alice")).toExist();
  }).pipe(Effect.provide(TestHost.layer())),
);
