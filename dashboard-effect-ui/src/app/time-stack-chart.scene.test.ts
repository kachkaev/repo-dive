// @vitest-environment happy-dom
// cspell:ignore linepath -- the class visx gives its LinePath
import { HtmlScene } from "@effect/ui/html/testing";
import { Locator } from "@effect/ui/testing";
import { it } from "@effect/vitest";
import { Effect } from "effect";

import { Tooltip, TooltipEvents } from "./shared/@ui-primitive/tooltip.ts";
import { cn } from "./shared/cn.ts";
import { MeasureWidth } from "./shared/measure-width.ts";
import { TrackPointer } from "./shared/track-pointer.ts";
import { type SeriesGroup, TimeSeriesChart } from "./time-stack-chart.ts";

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
            cn(
              "pointer-events-none absolute top-2 z-10 rounded-md border border-(--grid-line) bg-(--surface-2) px-2.5 py-1.5 text-xs shadow-sm will-change-transform",
            ),
          ),
          Locator.attr(
            "class",
            cn("text-(--text-secondary) line-through opacity-60"),
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

it.effect("sums each group's sub-series and divides only between groups", () =>
  Effect.gen(function* () {
    // Two languages, each split into year bands: the card lists the
    // languages, and a crisp line runs only where one meets the next.
    const tooltipGroups: SeriesGroup[] = [
      { label: "TypeScript", color: "blue", keys: ["ts 2025", "ts 2026"] },
      { label: "Markdown", color: "gray", keys: ["md 2025", "md 2026"] },
      { label: "CSS", color: "pink", keys: ["css 2026"] },
    ];
    const seriesKeys = tooltipGroups.flatMap((group) => group.keys);
    const s = yield* HtmlScene.make(TimeSeriesChart, {
      mode: "area",
      points: [0, 10, 20].map((day) => ({
        dateMs: startMs + day * dayMs,
        values: Object.fromEntries(
          seriesKeys.map((key, index) => [key, index + 1]),
        ),
      })),
      seriesKeys,
      colors: seriesKeys.map(() => "red"),
      tooltipGroups,
      separateGroups: true,
      legendItems: tooltipGroups.map(({ label, color }) => ({ label, color })),
    });
    s.expectMount(MeasureWidth())
      .mounted(MeasureWidth, 600)
      .expectMount(TrackPointer())
      .expect(Locator.attr("class", cn("visx-linepath")))
      .toHaveCount(2)
      .mounted(TrackPointer, { x: plotX(10), y: 50 })
      // TypeScript 1 + 2, Markdown 3 + 4, CSS 5, of 15.
      .expect(Locator.text("TypeScript", { exact: true }))
      .toExist()
      .expect(Locator.text("ts 2025"))
      .toBeAbsent()
      .expect(Locator.text("7", { exact: true }))
      .toExist()
      .expect(Locator.text("15", { exact: true }))
      .toExist();
  }),
);

it.effect("marks a single snapshot with a dot per series", () =>
  Effect.gen(function* () {
    const s = yield* HtmlScene.make(TimeSeriesChart, {
      ...props,
      points: [{ dateMs: startMs, values: { a: 1, b: 2 } }],
    });
    s.expectMount(MeasureWidth())
      .expect(Locator.tag("circle"))
      .toBeAbsent()
      .mounted(MeasureWidth, 600)
      .expectMount(TrackPointer())
      .expect(Locator.tag("circle"))
      .toHaveCount(2);
  }),
);

it.effect("sets a second legend apart below the first", () =>
  Effect.gen(function* () {
    const s = yield* HtmlScene.make(TimeSeriesChart, {
      ...props,
      legendToggles: false,
      secondaryLegendItems: [
        { label: "2025", color: "gray" },
        { label: "2026", color: "black" },
      ],
    });
    s.expectMount(MeasureWidth())
      .expect(
        Locator.inside(
          Locator.attr(
            "class",
            cn("mt-3 text-center text-xs text-balance text-(--text-secondary)"),
          ),
          Locator.text("2026", { exact: true }),
        ),
      )
      .toExist()
      .expect(
        Locator.inside(
          Locator.attr(
            "class",
            cn("mt-2 text-center text-xs text-balance text-(--text-secondary)"),
          ),
          Locator.text("b", { exact: true }),
        ),
      )
      .toExist();
  }),
);

it.effect("says so when there are no points at all", () =>
  Effect.gen(function* () {
    const s = yield* HtmlScene.make(TimeSeriesChart, { ...props, points: [] });
    // Nothing to measure or hover: no mounts to acknowledge.
    s.expect(Locator.text("No data collected yet.")).toExist();
  }),
);
