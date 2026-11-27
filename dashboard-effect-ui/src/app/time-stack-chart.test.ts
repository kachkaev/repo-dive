import { Story } from "@effect/ui/testing";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { TimeSeriesChart, TimeSeriesChartMessage } from "./time-stack-chart.ts";

const dayMs = 86_400_000;
const startMs = Date.UTC(2026, 0, 1);

/** Three daily points, 10 days apart, over a 600px-wide chart. */
const props = {
  mode: "area" as const,
  points: [0, 10, 20].map((day) => ({
    dateMs: startMs + day * dayMs,
    values: { a: day + 1, b: 2 },
  })),
  seriesKeys: ["a", "b"],
  colors: ["var(--series-1)", "var(--series-2)"],
  legendToggles: true,
};

// The plot is 600 − 44 − 12 = 544px wide and its hover rect overhangs it by
// 4px on each side, so the pointer's x over the rect is 4px ahead of the
// plot's.
const plotX = (day: number) => 4 + (day / 20) * 544;

it.effect("snaps the hover to the nearest point and leaves on mouse out", () =>
  Effect.gen(function* () {
    const s = yield* Story.make(TimeSeriesChart, props);
    s.send(TimeSeriesChartMessage.ChangedWidth({ width: 600 }));
    expect(s.model.width).toBe(600);

    s.send(TimeSeriesChartMessage.MovedPointer({ x: plotX(9) }));
    expect(s.model.hoverMs).toBeCloseTo(startMs + 9 * dayMs, -3);

    // Still nearest to day 10: the Model, and so the view, stays as it was.
    const modelNearDayTen = s.model;
    s.send(TimeSeriesChartMessage.MovedPointer({ x: plotX(11) }));
    expect(s.model).toBe(modelNearDayTen);

    s.send(TimeSeriesChartMessage.MovedPointer({ x: plotX(16) }));
    expect(s.model.hoverMs).toBeCloseTo(startMs + 16 * dayMs, -3);

    s.send(TimeSeriesChartMessage.LeftPlot());
    expect(s.model.hoverMs).toBeUndefined();
  }),
);

it.effect("clamps the overhang to the plot's edges", () =>
  Effect.gen(function* () {
    const s = yield* Story.make(TimeSeriesChart, props);
    s.send(TimeSeriesChartMessage.ChangedWidth({ width: 600 }));
    s.send(TimeSeriesChartMessage.MovedPointer({ x: 1 }));
    expect(s.model.hoverMs).toBe(startMs);
    s.send(TimeSeriesChartMessage.LeftPlot());
    s.send(TimeSeriesChartMessage.MovedPointer({ x: 544 + 7 }));
    expect(s.model.hoverMs).toBe(startMs + 20 * dayMs);
  }),
);

it.effect("hides series from the legend, and isolates one with alt", () =>
  Effect.gen(function* () {
    const s = yield* Story.make(TimeSeriesChart, {
      ...props,
      seriesKeys: ["a", "b", "c"],
      colors: ["red", "green", "blue"],
    });
    s.send(TimeSeriesChartMessage.ToggledLegendItem({ label: "b" }));
    expect(s.model.hiddenLabels).toStrictEqual(["b"]);
    s.send(TimeSeriesChartMessage.ToggledLegendItem({ label: "b" }));
    expect(s.model.hiddenLabels).toStrictEqual([]);

    s.send(TimeSeriesChartMessage.AltToggledLegendItem({ label: "a" }));
    expect(s.model.hiddenLabels).toStrictEqual(["b", "c"]);
    // Nothing else is showing, so a second alt-click brings everything back.
    s.send(TimeSeriesChartMessage.AltToggledLegendItem({ label: "a" }));
    expect(s.model.hiddenLabels).toStrictEqual([]);
  }),
);
