import { Story } from "@effect/ui/testing";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { CommitCalendar, CommitCalendarMessage } from "./activity-calendar.ts";

const props = {
  commits: [
    { date: "2026-01-05T12:00:00+00:00", kind: "human" as const, ai: false },
  ],
  historyDays: { first: "2026-01-05", last: "2026-02-10" },
  weekStartsOn: "monday" as const,
  range: "this-year" as const,
  kindFilter: "all" as const,
};

it.effect(
  "opens the tooltip on the hovered day and keeps the day once it closes",
  () =>
    Effect.gen(function* () {
      const s = yield* Story.make(CommitCalendar, props);
      expect(s.model).toStrictEqual({
        hoveredIsoDate: undefined,
        tooltipOpen: false,
      });

      s.send(CommitCalendarMessage.HoveredDay({ isoDate: "2026-01-05" }));
      s.send(CommitCalendarMessage.HoveredDay({ isoDate: "2026-01-06" }));
      expect(s.model).toStrictEqual({
        hoveredIsoDate: "2026-01-06",
        tooltipOpen: true,
      });

      // Leaving a strip closes the tooltip but keeps what it describes, as
      // the React calendar does for the card's exit.
      s.send(CommitCalendarMessage.LeftStrip());
      expect(s.model).toStrictEqual({
        hoveredIsoDate: "2026-01-06",
        tooltipOpen: false,
      });

      // Escape and a press elsewhere close it too, through ui-kit's Tooltip.
      s.send(CommitCalendarMessage.HoveredDay({ isoDate: "2026-01-07" }));
      s.send(CommitCalendarMessage.RequestedCloseTooltip());
      expect(s.model.tooltipOpen).toBe(false);
    }),
);
