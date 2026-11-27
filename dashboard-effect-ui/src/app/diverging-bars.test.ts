import { Story } from "@effect/ui/testing";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { DivergingBars, DivergingBarsMessage } from "./diverging-bars.ts";

const props = {
  points: [
    { month: "2026-01", positive: 120, negative: 40, positiveSecondary: 30 },
    { month: "2026-02", positive: 80, negative: 10, positiveSecondary: 0 },
    { month: "2026-03", positive: 200, negative: 90, positiveSecondary: 50 },
  ],
  positiveLabel: "added",
  negativeLabel: "deleted",
  positiveSecondaryLabel: "added · AI-assisted",
  positiveSecondaryHatch: "var(--kind-ai)",
};

it.effect("hovers the bar nearest to the pointer", () =>
  Effect.gen(function* () {
    const s = yield* Story.make(DivergingBars, props);
    expect(s.model).toStrictEqual({ width: 0, hoverIndex: undefined });

    // 64px of margins leave 600px of plot, inset by half of a 200px month
    // slot on each side: the bars stand 100, about 310 and 500px in (January
    // is longer than February).
    s.send(DivergingBarsMessage.ChangedWidth({ width: 664 }));
    s.send(DivergingBarsMessage.MovedPointer({ x: 290 }));
    expect(s.model.hoverIndex).toBe(1);
    s.send(DivergingBarsMessage.MovedPointer({ x: 480 }));
    expect(s.model.hoverIndex).toBe(2);
    s.send(DivergingBarsMessage.MovedPointer({ x: 0 }));
    expect(s.model.hoverIndex).toBe(0);

    s.send(DivergingBarsMessage.LeftPlot());
    expect(s.model).toStrictEqual({ width: 664, hoverIndex: undefined });
  }),
);

it.effect("keeps its Model while the pointer stays on one bar", () =>
  Effect.gen(function* () {
    const s = yield* Story.make(DivergingBars, props);
    s.send(DivergingBarsMessage.ChangedWidth({ width: 664 }));
    s.send(DivergingBarsMessage.MovedPointer({ x: 90 }));
    const hovered = s.model;
    s.send(DivergingBarsMessage.MovedPointer({ x: 110 }));
    // The same object: the view has nothing new to draw.
    expect(s.model).toBe(hovered);
  }),
);
