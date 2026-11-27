import { expect, test } from "vitest";

import type { ContributorRow, DashboardData } from "../../data.ts";
import { contributorsInRange } from "./contributors-in-range.ts";

type CommitRow = DashboardData["commits"][number];

const alice = 0;
const bob = 1;
const claude = 2;
const copilot = 3;
const renovate = 4;

const contributors: ContributorRow[] = [
  { email: "alice@example.com", name: "Alice", kind: "human" },
  { email: "bob@example.com", name: "Bob", kind: "human" },
  { email: "noreply@anthropic.com", name: "Claude", kind: "ai" },
  { email: "copilot@github.com", name: "Copilot", kind: "ai" },
  { email: "renovate[bot]", name: "Renovate", kind: "bot" },
];

const commitBy = (
  contributor: number,
  date: string,
  helpers: number[] = [],
): CommitRow => ({
  sha: `${contributor}@${date}`,
  date: `${date}T12:00:00+02:00`,
  contributor,
  kind: contributors[contributor]?.kind ?? "human",
  ai: helpers.some((helper) => contributors[helper]?.kind === "ai"),
  added: 10,
  deleted: 2,
  ...(helpers.length > 0 && { helpers }),
});

const rowOf = (rows: ContributorRow[], name: string) =>
  rows.find((row) => row.name === name);

test("each end of a cross-kind edge is credited once per commit", () => {
  const rows = contributorsInRange(
    contributors,
    [
      // Two agents on one commit make one AI-assisted commit of Alice's, but
      // each agent helped once.
      commitBy(alice, "2025-03-01", [claude, copilot]),
      commitBy(alice, "2025-03-02", [claude, renovate]),
      commitBy(claude, "2025-03-03", [alice]),
    ],
    undefined,
    10,
  );

  expect(rowOf(rows, "Alice")).toMatchObject({
    commits: 2,
    added: 20,
    deleted: 4,
    assistedBy: { ai: 2, bot: 1 },
    assisted: { ai: 1 },
  });
  expect(rowOf(rows, "Claude")).toMatchObject({
    commits: 1,
    assistedBy: { human: 1 },
    assisted: { human: 2 },
  });
  expect(rowOf(rows, "Copilot")).toMatchObject({
    commits: 0,
    assisted: { human: 1 },
  });
  expect(rowOf(rows, "Renovate")).toMatchObject({
    commits: 0,
    assisted: { human: 1 },
  });
  expect(rowOf(rows, "Bob"), "no part in any commit").toBeUndefined();
});

test("only commits inside the span count, by their author-dated month", () => {
  const rows = contributorsInRange(
    contributors,
    [
      commitBy(alice, "2024-12-31"),
      commitBy(alice, "2025-01-01", [claude]),
      commitBy(bob, "2025-12-31"),
      commitBy(bob, "2026-01-01"),
    ],
    { first: "2025-01", last: "2025-12" },
    10,
  );

  expect(
    rows.map((row) => [row.name, row.commits, row.assisted]),
  ).toStrictEqual([
    ["Alice", 1, {}],
    ["Bob", 1, {}],
    ["Claude", 0, { human: 1 }],
  ]);
});

test("contributors rank by authoring plus helping and cap per kind", () => {
  const rows = contributorsInRange(
    contributors,
    [
      commitBy(bob, "2025-01-01"),
      // Alice ties Bob on involvement; the list order breaks the tie.
      commitBy(claude, "2025-01-02", [alice]),
      commitBy(renovate, "2025-01-03"),
      commitBy(renovate, "2025-01-04"),
      commitBy(renovate, "2025-01-05"),
    ],
    undefined,
    1,
  );

  // One per kind: Renovate leads, then the first of the tied humans, then
  // Claude — Bob is past the human cap.
  expect(rows.map((row) => row.name)).toEqual(["Renovate", "Alice", "Claude"]);
});
