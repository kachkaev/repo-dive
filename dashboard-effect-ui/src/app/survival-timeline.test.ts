import { Story } from "@effect/ui/testing";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

import {
  SurvivalTimeline,
  SurvivalTimelineMessage,
} from "./survival-timeline.ts";
import { survivalTimelinePropsOf } from "./survival-timeline/survival-timeline-fixture.ts";

it.effect("keeps the three controls' values in its Model", () =>
  Effect.gen(function* () {
    const s = yield* Story.make(SurvivalTimeline, survivalTimelinePropsOf());
    // Units written in two calendar years: age shading starts on.
    expect(s.model).toStrictEqual({
      preferredDimension: "language",
      shadeByYear: true,
      percentMode: false,
    });

    s.send(SurvivalTimelineMessage.ToggledSplit({ dimension: "contributor" }));
    s.send(SurvivalTimelineMessage.ToggledAgeShading({ shadeByYear: false }));
    s.send(SurvivalTimelineMessage.ToggledPercent({ percent: true }));
    expect(s.model).toStrictEqual({
      preferredDimension: "contributor",
      shadeByYear: false,
      percentMode: true,
    });
  }),
);

it.effect("starts unshaded when every unit was written in one year", () =>
  Effect.gen(function* () {
    const props = survivalTimelinePropsOf();
    const s = yield* Story.make(SurvivalTimeline, {
      ...props,
      survivalRows: props.survivalRows.map((row) => ({
        ...row,
        byCohort: { "2026-02": 10 },
      })),
    });
    expect(s.model.shadeByYear).toBe(false);
  }),
);
