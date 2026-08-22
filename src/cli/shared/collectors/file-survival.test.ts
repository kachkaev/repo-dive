import { expect, test } from "vitest";

import { resolveFileOrigins } from "./file-survival.ts";

const recordSeparator = "";
const fieldSeparator = "";

/** One `git log --name-status --format=%x1E%ae%x1F%at` record, newest first. */
const record = (
  authorEmail: string,
  unixSeconds: number,
  entries: readonly string[],
): string =>
  `${recordSeparator}${authorEmail}${fieldSeparator}${unixSeconds}\n\n${entries.join("\n")}\n`;

test("resolveFileOrigins attributes files to their creating commits", () => {
  const stdout = [
    record("carol@example.com", 1_767_225_600, ["A\tc.ts", "M\ta.ts"]), // 2026-01
    record("alice@example.com", 1_751_328_000, ["A\ta.ts", "A\tb.ts"]), // 2025-07
  ].join("");

  const origins = resolveFileOrigins(stdout, ["a.ts", "b.ts", "c.ts"]);
  // The edit to a.ts in the newer commit does not re-bin it.
  expect(origins.get("a.ts")).toStrictEqual({
    authorEmail: "alice@example.com",
    cohortMonth: "2025-07",
  });
  expect(origins.get("b.ts")).toStrictEqual({
    authorEmail: "alice@example.com",
    cohortMonth: "2025-07",
  });
  expect(origins.get("c.ts")).toStrictEqual({
    authorEmail: "carol@example.com",
    cohortMonth: "2026-01",
  });
});

test("resolveFileOrigins follows a rename chain to the original creation", () => {
  const stdout = [
    record("carol@example.com", 1_767_225_600, ["R100\tmid.ts\tfinal.ts"]),
    record("bob@example.com", 1_759_276_800, ["R095\told.ts\tmid.ts"]), // 2025-10
    record("alice@example.com", 1_751_328_000, ["A\told.ts"]), // 2025-07
  ].join("");

  const origins = resolveFileOrigins(stdout, ["final.ts"]);
  expect(origins.get("final.ts")).toStrictEqual({
    authorEmail: "alice@example.com",
    cohortMonth: "2025-07",
  });
});

test("resolveFileOrigins keeps swap renames within one commit apart", () => {
  // One commit renames a→b and c→a: both re-key against pre-commit names, so
  // present-day `b` traces to the original `a` and present-day `a` to `c`.
  const stdout = [
    record("carol@example.com", 1_767_225_600, [
      "R100\ta.ts\tb.ts",
      "R100\tc.ts\ta.ts",
    ]),
    record("bob@example.com", 1_759_276_800, ["A\tc.ts"]), // 2025-10
    record("alice@example.com", 1_751_328_000, ["A\ta.ts"]), // 2025-07
  ].join("");

  const origins = resolveFileOrigins(stdout, ["a.ts", "b.ts"]);
  expect(origins.get("b.ts")).toStrictEqual({
    authorEmail: "alice@example.com",
    cohortMonth: "2025-07",
  });
  expect(origins.get("a.ts")).toStrictEqual({
    authorEmail: "bob@example.com",
    cohortMonth: "2025-10",
  });
});

test("resolveFileOrigins picks the recreation of a delete-and-recreate pair", () => {
  const stdout = [
    record("carol@example.com", 1_767_225_600, ["A\ta.ts"]), // 2026-01
    record("bob@example.com", 1_759_276_800, ["D\ta.ts"]),
    record("alice@example.com", 1_751_328_000, ["A\ta.ts"]),
  ].join("");

  const origins = resolveFileOrigins(stdout, ["a.ts"]);
  expect(origins.get("a.ts")).toStrictEqual({
    authorEmail: "carol@example.com",
    cohortMonth: "2026-01",
  });
});

test("resolveFileOrigins leaves files without a creation event unresolved", () => {
  const stdout = record("alice@example.com", 1_751_328_000, ["M\ta.ts"]);

  const origins = resolveFileOrigins(stdout, ["a.ts"]);
  expect(origins.has("a.ts")).toBe(false);
});
