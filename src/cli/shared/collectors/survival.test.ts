import { expect, test } from "vitest";

import { parseBlamePorcelain } from "./survival.ts";

test("parseBlamePorcelain attributes lines to authors and cohorts", () => {
  const stdout = [
    "abc123 1 1 2",
    "author Alice",
    "author-mail <alice@example.com>",
    "author-time 1767225600", // 2026-01-01
    "filename a.ts",
    "\tconst a = 1;",
    "abc123 2 2",
    "author Alice",
    "author-mail <alice@example.com>",
    "author-time 1767225600",
    "filename a.ts",
    "\tconst b = 2;",
    "def456 3 3 1",
    "author Bob",
    "author-mail <bob@example.com>",
    "author-time 1751328000", // 2025-07-01
    "filename a.ts",
    "\tconst c = 3;",
    "",
  ].join("\n");

  const attributions = parseBlamePorcelain(stdout);
  expect(attributions.length).toBe(3);
  expect(attributions[0]).toStrictEqual({
    authorEmail: "alice@example.com",
    cohortMonth: "2026-01",
  });
  expect(attributions[2]).toStrictEqual({
    authorEmail: "bob@example.com",
    cohortMonth: "2025-07",
  });
});
