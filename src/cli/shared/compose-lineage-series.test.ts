import { expect, test } from "@effect/vitest";

import { composeLineageSeries } from "./compose-lineage-series.ts";

type Row = {
  sha: string;
  date: string;
  lines: number;
  byLanguage: Record<string, number>;
};

const snapshot = (
  lineage: number,
  lineageEndsAtMs: number,
  sha: string,
  date: string,
  lines: number,
  byLanguage: Record<string, number>,
) => ({ row: { sha, date, lines, byLanguage }, lineage, lineageEndsAtMs });

test("composeLineageSeries returns a single lineage's rows unchanged", () => {
  const rows = composeLineageSeries<Row>([
    snapshot(0, Number.POSITIVE_INFINITY, "a1", "2024-01-01T00:00:00Z", 10, {
      TypeScript: 10,
    }),
    snapshot(0, Number.POSITIVE_INFINITY, "a2", "2024-02-01T00:00:00Z", 25, {
      TypeScript: 20,
      Markdown: 5,
    }),
  ]);

  expect(rows).toStrictEqual([
    {
      sha: "a1",
      date: "2024-01-01T00:00:00Z",
      lines: 10,
      byLanguage: { TypeScript: 10 },
    },
    {
      sha: "a2",
      date: "2024-02-01T00:00:00Z",
      lines: 25,
      byLanguage: { TypeScript: 20, Markdown: 5 },
    },
  ]);
});

test("composeLineageSeries sums parallel lineages, carrying the latest forward", () => {
  const assemblyMs = Date.parse("2024-01-01T00:00:00Z");
  const rows = composeLineageSeries<Row>([
    // Two pre-migration repositories evolving in parallel…
    snapshot(1, assemblyMs, "old1", "2020-01-01T00:00:00Z", 100, {
      TypeScript: 100,
    }),
    snapshot(2, assemblyMs, "plug1", "2021-01-01T00:00:00Z", 30, {
      TypeScript: 30,
    }),
    snapshot(1, assemblyMs, "old2", "2022-01-01T00:00:00Z", 150, {
      TypeScript: 140,
      Markdown: 10,
    }),
    // …then the monorepo's first post-assembly snapshot holding both.
    snapshot(
      0,
      Number.POSITIVE_INFINITY,
      "mono1",
      "2024-01-01T00:00:00Z",
      185,
      {
        TypeScript: 172,
        Markdown: 13,
      },
    ),
  ]);

  expect(rows.map((row) => ({ sha: row.sha, lines: row.lines }))).toStrictEqual(
    [
      { sha: "old1", lines: 100 },
      // The plugin snapshot adds to the carried-forward old repo.
      { sha: "plug1", lines: 130 },
      { sha: "old2", lines: 180 },
      // Both absorbed lineages end exactly when the assembly completes, so
      // the monorepo row stands alone instead of double-counting them.
      { sha: "mono1", lines: 185 },
    ],
  );
  expect(rows[2]?.byLanguage).toStrictEqual({ TypeScript: 170, Markdown: 10 });
  expect(rows[3]?.byLanguage).toStrictEqual({ TypeScript: 172, Markdown: 13 });
});

test("composeLineageSeries keeps an unabsorbed lineage contributing forever", () => {
  const rows = composeLineageSeries<Row>([
    snapshot(
      1,
      Date.parse("2024-06-01T00:00:00Z"),
      "a",
      "2024-01-01T00:00:00Z",
      5,
      {},
    ),
    snapshot(0, Number.POSITIVE_INFINITY, "b", "2024-03-01T00:00:00Z", 7, {}),
    // Lineage 1 is still alive here (ends June), so it adds; at the next
    // snapshot it has expired.
    snapshot(0, Number.POSITIVE_INFINITY, "c", "2024-07-01T00:00:00Z", 9, {}),
  ]);

  expect(rows.map((row) => row.lines)).toStrictEqual([5, 12, 9]);
});
