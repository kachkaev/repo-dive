import { expect, test } from "vitest";

import {
  calendarOf,
  dayTotalsOf,
  layOutStrip,
  levelOfFor,
  rangeCaptionOf,
  roundPartPx,
  stackPartsOf,
  stripsOf,
  summarize,
} from "./calendar-layout.ts";

const commitOn = (
  date: string,
  kind: "human" | "ai" | "bot" = "human",
  ai = false,
) => ({ date: `${date}T12:00:00+02:00`, kind, ai });

test("dayTotalsOf buckets commits by the author's own date and kind", () => {
  const totals = dayTotalsOf([
    commitOn("2026-01-05"),
    commitOn("2026-01-05", "human", true),
    commitOn("2026-01-05", "bot"),
    commitOn("2026-01-06", "ai"),
    // Written before per-commit kinds: counted as human.
    { date: "2026-01-06T23:30:00-05:00", ai: false },
  ]);
  expect(Object.fromEntries(totals)).toStrictEqual({
    "2026-01-05": { human: 2, humanAi: 1, bot: 1, agent: 0 },
    "2026-01-06": { human: 1, humanAi: 0, bot: 0, agent: 1 },
  });
});

test("stackPartsOf stacks bots at the bottom and folds a thin hatch", () => {
  const day = { human: 6, humanAi: 3, bot: 2, agent: 1 };
  expect(stackPartsOf(day, "all")).toStrictEqual([
    { kind: "bot", hatched: false, value: 2 },
    { kind: "ai", hatched: false, value: 1 },
    { kind: "human", hatched: true, value: 3 },
    { kind: "human", hatched: false, value: 3 },
  ]);
  expect(stackPartsOf(day, "bot")).toStrictEqual([
    { kind: "bot", hatched: false, value: 2 },
  ]);
  // One assisted commit in 20 projects to half a pixel: it folds into the
  // plain human segment.
  expect(
    stackPartsOf({ human: 20, humanAi: 1, bot: 0, agent: 0 }, "human"),
  ).toStrictEqual([{ kind: "human", hatched: false, value: 20 }]);
  expect(
    stackPartsOf({ human: 0, humanAi: 0, bot: 4, agent: 0 }, "ai"),
  ).toStrictEqual([]);
});

test("roundPartPx fills the cell exactly and keeps every present part", () => {
  expect(roundPartPx([1, 1, 1], 10)).toStrictEqual([4, 3, 3]);
  expect(roundPartPx([100, 1], 10)).toStrictEqual([9, 1]);
  expect(roundPartPx([0, 0], 10)).toStrictEqual([0, 0]);
});

test("layOutStrip leaves a gap between months and outlines days without data", () => {
  const layout = layOutStrip(
    ["2026-01", "2026-02"],
    new Map(),
    "2026-01-10",
    "2026-02-20",
    "monday",
  );
  // 2026-01-01 is a Thursday: row 3 of a Monday-first week.
  expect(layout.cells[0]).toStrictEqual({
    isoDate: "2026-01-01",
    column: 0,
    row: 3,
    day: undefined,
  });
  expect(
    layout.cells.find((cell) => cell.isoDate === "2026-01-10")?.day,
  ).toStrictEqual({ human: 0, humanAi: 0, bot: 0, agent: 0 });
  // February 1st is a Sunday (row 6), in week 4 plus two gap columns: its
  // label moves one column right, above the month's first full week.
  expect(
    layout.cells.find((cell) => cell.isoDate === "2026-02-01"),
  ).toMatchObject({ column: 6, row: 6 });
  expect(layout.monthLabels).toStrictEqual([
    { isoMonth: "2026-01", column: 1 },
    { isoMonth: "2026-02", column: 7 },
  ]);
  expect(layout.cells.at(-1)?.day).toBeUndefined();
});

test("levelOfFor grades counts by the quartiles of the whole history", () => {
  const totals = dayTotalsOf(
    [1, 2, 3, 4, 5, 6, 7, 8].flatMap((count, index) =>
      Array.from({ length: count }, () =>
        commitOn(`2026-03-${String(index + 1).padStart(2, "0")}`),
      ),
    ),
  );
  const levelOf = levelOfFor(totals, "all");
  // Daily counts 1 to 8: the quartile thresholds are 2, 4 and 6.
  expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map(levelOf)).toStrictEqual([
    0, 1, 1, 2, 2, 3, 3, 4, 4,
  ]);
  // Nothing by bots: every day is level 0 under the bot filter.
  expect(levelOfFor(totals, "bot")(0)).toBe(0);
});

test("stripsOf lays out the newest strip first", () => {
  const historyDays = { first: "2024-05-01", last: "2026-03-01" };
  const titles = (range: Parameters<typeof stripsOf>[3]) =>
    stripsOf(new Map(), historyDays, "monday", range).map(
      (strip) => strip.title,
    );
  expect(titles("last-12-months")).toStrictEqual(["Apr 2025 — Mar 2026"]);
  expect(titles("this-year")).toStrictEqual(["2026"]);
  expect(titles("all-years")).toStrictEqual(["2026", "2025", "2024"]);
  expect(titles("last-5-years")).toStrictEqual(["2026", "2025", "2024"]);
  expect(titles("year-2025")).toStrictEqual(["2025"]);
});

test("the caption counts what the filter draws", () => {
  const commits = [
    commitOn("2026-01-05"),
    commitOn("2026-01-05", "human", true),
    commitOn("2026-01-06", "bot"),
    commitOn("2026-01-06", "bot"),
    commitOn("2026-01-06", "bot"),
  ];
  const strips = stripsOf(
    dayTotalsOf(commits),
    { first: "2026-01-05", last: "2026-01-31" },
    "monday",
    "this-year",
  );
  expect(rangeCaptionOf(strips, "all")).toStrictEqual({
    rangeSummary: "5 commits in this range — 2 human (1 AI-assisted) · 3 bot",
    busiest: {
      isoDate: "2026-01-06",
      day: { human: 0, humanAi: 0, bot: 3, agent: 0 },
    },
  });
  expect(rangeCaptionOf(strips, "human").rangeSummary).toBe(
    "2 human commits in this range — 1 AI-assisted",
  );
  expect(summarize({ human: 0, humanAi: 0, bot: 1, agent: 0 }, "bot")).toBe(
    "1 bot commit",
  );
});

test("calendarOf returns the same objects for the same inputs", () => {
  const commits = [commitOn("2026-01-05"), commitOn("2026-01-06", "bot")];
  const historyDays = { first: "2026-01-05", last: "2026-01-31" };
  const all = calendarOf(commits, historyDays, "monday", "this-year", "all");
  expect(
    calendarOf(commits, { ...historyDays }, "monday", "this-year", "all"),
  ).toBe(all);
  const bots = calendarOf(commits, historyDays, "monday", "this-year", "bot");
  // A filter changes the levels and the caption, not the strips' layout.
  expect(bots).not.toBe(all);
  expect(bots.strips).toBe(all.strips);
  expect(bots.cellsByIsoDate.get("2026-01-06")?.day?.bot).toBe(1);
});
