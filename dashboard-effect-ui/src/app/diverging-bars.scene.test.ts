// @vitest-environment happy-dom
import { HtmlScene } from "@effect/ui/html/testing";
import { Locator } from "@effect/ui/testing";
import { it } from "@effect/vitest";
import { Effect } from "effect";

import { DivergingBars } from "./diverging-bars.ts";
import { MeasureWidth } from "./shared/measure-width.ts";
import { TrackPointer } from "./shared/track-pointer.ts";

const props = {
  points: [
    {
      month: "2026-01",
      positive: 900,
      negative: 40,
      positiveSecondary: 300,
    },
    { month: "2026-02", positive: 800, negative: 0, positiveSecondary: 0 },
  ],
  positiveLabel: "added",
  negativeLabel: "deleted",
  positiveSecondaryLabel: "added · AI-assisted",
  positiveSecondaryHatch: "var(--kind-ai)",
};

const card = Locator.attr(
  "class",
  "pointer-events-none absolute top-2 z-10 rounded-md border border-(--grid-line) bg-(--surface-2) px-2.5 py-1.5 text-xs shadow-sm will-change-transform",
);
const crosshair = Locator.attr("stroke-dasharray", "3,3");

it.effect("shows the hovered month's card and crosshair", () =>
  Effect.gen(function* () {
    const s = yield* HtmlScene.make(DivergingBars, props);
    s.expectMount(TrackPointer())
      .mounted(MeasureWidth, 664)
      .expect(card)
      .toBeAbsent()
      // The first bar stands 150px into the plot.
      .mounted(TrackPointer, { x: 140, y: 50 })
      .expect(crosshair)
      .toExist()
      .expect(card)
      .toHaveText("Jan 2026added+900added · AI-assisted+300deleted−40")
      // The card lists every row, zeros unsigned, as the month changes.
      .mounted(TrackPointer, { x: 460, y: 50 })
      .expect(card)
      .toHaveText("Feb 2026added+800added · AI-assisted0deleted0")
      .mounted(TrackPointer, undefined)
      .expect(card)
      .toBeAbsent()
      .expect(crosshair)
      .toBeAbsent();
  }),
);

it.effect(
  "leaves the hatched band out of the legend when nothing is assisted",
  () =>
    Effect.gen(function* () {
      const s = yield* HtmlScene.make(DivergingBars, {
        ...props,
        points: props.points.map((point) => ({
          ...point,
          positiveSecondary: 0,
        })),
      });
      s.expectMount(TrackPointer())
        .expectMount(MeasureWidth())
        .expect(Locator.text("added · AI-assisted"))
        .toBeAbsent()
        .expect(Locator.text("deleted"))
        .toExist();
    }),
);

it.effect("says so when there is nothing to chart", () =>
  Effect.gen(function* () {
    const s = yield* HtmlScene.make(DivergingBars, { ...props, points: [] });
    s.expect(Locator.text("No data collected yet.")).toExist();
  }),
);
