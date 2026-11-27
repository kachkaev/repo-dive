import { Story } from "@effect/ui/testing";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

import {
  HistoryRangeSelect,
  HistoryRangeSelectEvents,
  HistoryRangeSelectMessage,
} from "./history-range-select.ts";

const props = {
  label: "Calendar range",
  value: "last-12-months",
  items: [
    { value: "last-12-months", label: "Last 12 months" },
    { value: "this-year", label: "This year" },
    { value: "year-2025", label: "2025" },
  ],
} as const;

it.effect("opens and closes as its popup asks", () =>
  Effect.gen(function* () {
    const s = yield* Story.make(HistoryRangeSelect, props);
    s.send(HistoryRangeSelectMessage.RequestedOpenSelect());
    expect(s.model.open).toBe(true);
    s.send(HistoryRangeSelectMessage.RequestedCloseSelect());
    expect(s.model.open).toBe(false);
  }),
);

it.effect("asks its section for a picked range", () =>
  Effect.gen(function* () {
    const s = yield* Story.make(HistoryRangeSelect, props);
    s.send(
      HistoryRangeSelectMessage.PickedSelectChoice({ value: "year-2025" }),
    );
    s.emitted(HistoryRangeSelectEvents.Picked({ value: "year-2025" }));
  }),
);

it.effect("asks for nothing when the pick is the range on show", () =>
  Effect.gen(function* () {
    // The story's end check fails on any event that isn't acknowledged with
    // `emitted`, so this step proves that none was emitted.
    const s = yield* Story.make(HistoryRangeSelect, props);
    s.send(
      HistoryRangeSelectMessage.PickedSelectChoice({ value: "last-12-months" }),
    );
  }),
);
