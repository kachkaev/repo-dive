// @vitest-environment happy-dom
import { HtmlScene } from "@effect/ui/html/testing";
import { Locator } from "@effect/ui/testing";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { CommitCalendar } from "./activity-calendar.ts";

const props = {
  commits: [
    { date: "2026-01-05T12:00:00+00:00", kind: "human" as const, ai: true },
    { date: "2026-01-05T15:00:00+00:00", kind: "bot" as const, ai: false },
    { date: "2026-01-06T09:00:00+00:00", kind: "bot" as const, ai: false },
  ],
  historyDays: { first: "2026-01-05", last: "2026-02-10" },
  weekStartsOn: "monday" as const,
  range: "this-year" as const,
  kindFilter: "all" as const,
};

const tooltip = Locator.attr("data-slot", "tooltip-content");
const caption = Locator.attr("class", "tabular-nums");

/** The hover target of one day: the transparent cell drawn over its stack. */
const dayTarget = (
  s: { all: (locator: Locator.Locator) => readonly Locator.Node[] },
  isoDate: string,
) => {
  const id = s
    .all(Locator.attr("fill", "transparent"))
    .map((node) => node.attrs?.["id"])
    .find((candidate) => candidate?.endsWith(isoDate));
  expect(id).toBeDefined();
  return Locator.attr("id", id ?? "");
};

it.effect("describes the hovered day in a tooltip", () =>
  Effect.gen(function* () {
    const s = yield* HtmlScene.make(CommitCalendar, props);
    s.expect(tooltip)
      .toBeAbsent()
      .fire(dayTarget(s, "2026-01-05"), "mouseenter", { x: 0, y: 0 })
      .expect(tooltip)
      .toHaveText(
        "2026-01-05 · WednesdayMonday2 commits — 1 human (1 AI-assisted) · 1 bot",
      )
      .fire(dayTarget(s, "2026-02-20"), "mouseenter", { x: 0, y: 0 })
      .expect(tooltip)
      .toHaveText("2026-02-20 · WednesdayFridayAfter this report was generated")
      .fire(dayTarget(s, "2026-01-01"), "mouseenter", { x: 0, y: 0 })
      .expect(tooltip)
      .toHaveText("2026-01-01 · WednesdayThursdayBefore the first commit")
      .expect(tooltip)
      .toHaveAttribute("data-open", "")
      // Leaving the strip closes the card, which keeps its day meanwhile.
      .fire(Locator.attr("aria-label", "Commit calendar, 2026"), "mouseleave", {
        x: 0,
        y: 0,
      })
      .expect(tooltip)
      .toHaveAttribute("data-closed", "")
      .expect(tooltip)
      .toHaveText("2026-01-01 · WednesdayThursdayBefore the first commit");
  }),
);

it.effect("counts only the filtered kind in its caption", () =>
  Effect.gen(function* () {
    const all = yield* HtmlScene.make(CommitCalendar, props);
    all
      .expect(caption)
      .toHaveText(
        "3 commits in this range — 1 human (1 AI-assisted) · 2 botBusiest day 2026-01-05 · Monday: 2 commits — 1 human (1 AI-assisted) · 1 bot",
      );
    const bots = yield* HtmlScene.make(CommitCalendar, {
      ...props,
      kindFilter: "bot",
    });
    bots
      .expect(caption)
      .toHaveText(
        "2 bot commits in this rangeBusiest day 2026-01-05 · Monday: 1 bot commit",
      );
  }),
);
