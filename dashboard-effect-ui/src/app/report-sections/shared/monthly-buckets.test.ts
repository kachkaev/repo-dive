import { expect, test } from "vitest";

import { commitOf } from "../../shared/dashboard-data-fixture.ts";
import { monthlyRowsOf } from "./monthly-buckets.ts";

test("monthlyRowsOf sums commits and churn per author month, in month order", () => {
  const rows = monthlyRowsOf([
    commitOf("2026-02-03", "bot"),
    commitOf("2026-01-10", "human", true),
    commitOf("2026-01-20", "human"),
    commitOf("2026-01-21", "ai"),
  ]);

  expect(rows.map(([month]) => month)).toStrictEqual(["2026-01", "2026-02"]);
  const [, january] = rows[0] ?? [];
  expect(january).toMatchObject({ human: 1, humanAi: 1, ai: 1, bot: 0 });
  // Churn is kept per author kind; the AI-assisted share of a human's lines
  // is the hatched part of the churn bars.
  expect(january?.churn).toStrictEqual({
    human: { added: 20, deleted: 4, aiAdded: 10 },
    ai: { added: 10, deleted: 2, aiAdded: 0 },
    bot: { added: 0, deleted: 0, aiAdded: 0 },
  });
});

test("a commit without a kind counts as a human's", () => {
  const [[, bucket] = []] = monthlyRowsOf([
    {
      sha: "abc",
      date: "2026-01-10T12:00:00+00:00",
      ai: false,
      added: 1,
      deleted: 0,
    },
  ]);
  expect(bucket).toMatchObject({ human: 1, humanAi: 0 });
});
