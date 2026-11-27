// @vitest-environment happy-dom
import { HtmlScene } from "@effect/ui/html/testing";
import { Locator } from "@effect/ui/testing";
import { it } from "@effect/vitest";
import { Effect } from "effect";

import { Tooltip, TooltipEvents } from "./shared/@ui-primitive/tooltip.ts";
import { MeasureWidth } from "./shared/measure-width.ts";
import { TrackPointer } from "./shared/track-pointer.ts";
import { TimeSeriesChart } from "./time-stack-chart.ts";

const dayMs = 86_400_000;
const startMs = Date.UTC(2026, 0, 1);

const props = {
  mode: "area" as const,
  points: [0, 10, 20].map((day) => ({
    dateMs: startMs + day * dayMs,
    values: { a: day + 1, b: 2 },
  })),
  seriesKeys: ["a", "b"],
  colors: ["var(--series-1)", "var(--series-2)"],
  legendToggles: true,
  zeroLabel: "Nothing here",
};

/** The pointer's x over the hover rect of a 600px-wide chart (see the story). */
const plotX = (day: number) => 4 + (day / 20) * 544;

it.effect("draws the hover card for the point under the pointer", () =>
  Effect.gen(function* () {
    const s = yield* HtmlScene.make(TimeSeriesChart, props);
    // Nothing to hover until the chart knows its width.
    s.expectMount(MeasureWidth())
      .expect(Locator.tag("rect"))
      .toBeAbsent()
      .mounted(MeasureWidth, 600)
      .expectMount(TrackPointer())
      .expect(Locator.text("Total"))
      .toBeAbsent()
      .mounted(TrackPointer, { x: plotX(9), y: 50 })
      // Snapped to day 10 (2026-01-11): a = 11, b = 2.
      .expect(Locator.text("2026-01-11"))
      .toExist()
      .expect(Locator.text("13", { exact: true }))
      .toExist()
      .expect(Locator.text("Shown"))
      .toBeAbsent()
      .mounted(TrackPointer, undefined)
      .expect(Locator.text("Total"))
      .toBeAbsent();
  }),
);

it.effect("crosses a hidden series out and sums what is still shown", () =>
  Effect.gen(function* () {
    const s = yield* HtmlScene.make(TimeSeriesChart, props);
    s.expectMount(MeasureWidth())
      .mounted(MeasureWidth, 600)
      .expectMount(TrackPointer())
      .mounted(TrackPointer, { x: plotX(20), y: 50 })
      // A scene runs this component's update, not the legend item's Tooltip,
      // so it stands in for the click with the event the item would emit.
      .childEmit(Tooltip, "a", TooltipEvents.Clicked({ alt: false }))
      .expect(Locator.text("Shown"))
      .toExist()
      .expect(
        Locator.inside(
          Locator.attr(
            "class",
            "pointer-events-none absolute top-2 z-10 rounded-md border border-(--grid-line) bg-(--surface-2) px-2.5 py-1.5 text-xs shadow-sm will-change-transform",
          ),
          Locator.attr(
            "class",
            "text-(--text-secondary) line-through opacity-60",
          ),
        ),
      )
      .toHaveText("a")
      .childEmit(Tooltip, "a", TooltipEvents.Clicked({ alt: false }))
      .expect(Locator.text("Shown"))
      .toBeAbsent();
  }),
);

it.effect("reads a gap as no data, and an empty point by its zero label", () =>
  Effect.gen(function* () {
    const s = yield* HtmlScene.make(TimeSeriesChart, {
      ...props,
      points: [
        { dateMs: startMs, values: { a: 0, b: 0 } },
        { dateMs: startMs + 20 * dayMs, values: { a: 1, b: 1 } },
      ],
      domainStartMs: startMs - 20 * dayMs,
    });
    // The axis now starts 20 days before the first point: the left half of
    // the plot is a gap, and its first point came back empty.
    s.expectMount(MeasureWidth())
      .mounted(MeasureWidth, 600)
      .expectMount(TrackPointer())
      .mounted(TrackPointer, { x: plotX(5) / 2, y: 50 })
      .expect(Locator.text("No data"))
      .toExist()
      .mounted(TrackPointer, { x: 4 + 272, y: 50 })
      .expect(Locator.text("Nothing here"))
      .toExist();
  }),
);
