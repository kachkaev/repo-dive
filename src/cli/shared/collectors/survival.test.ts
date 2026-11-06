import { expect, test } from "vitest";

import {
  parseBlamePorcelain,
  summarizeBlames,
  survivalCollector,
} from "./survival.ts";

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

const blameOf = (lines: number) =>
  Array.from(
    { length: lines },
    () => "author-mail <alice@example.com>\nauthor-time 1767322800\n\tcontent",
  ).join("\n");

const classifyFile = (filePath: string) =>
  filePath.endsWith(".snap")
    ? { label: "Test data", source: false }
    : filePath.endsWith(".test.ts")
      ? { label: "Tests", source: true }
      : { label: "Production", source: true };

test("summarizeBlames keeps paths, for index to classify", () => {
  const output = summarizeBlames([
    { filePath: "src/a.ts", stdout: blameOf(3) },
    { filePath: "src/a.test.ts", stdout: blameOf(2) },
    { filePath: "binary.ts", stdout: `${blameOf(1)}\0` },
  ]);
  expect(output.paths).toStrictEqual(["src/a.ts", "src/a.test.ts"]);
  expect(output.authors).toStrictEqual(["alice@example.com"]);
  expect(output.totalLines).toBe(5);
  expect(output.fileCount).toBe(3);

  expect(survivalCollector.normalize(output, { classifyFile })).toStrictEqual([
    {
      metric: "survival.lines",
      value: 3,
      categories: {
        extension: ".ts",
        author: "alice@example.com",
        cohort: "2026-01",
        purpose: "Production",
      },
    },
    {
      metric: "survival.lines",
      value: 2,
      categories: {
        extension: ".ts",
        author: "alice@example.com",
        cohort: "2026-01",
        purpose: "Tests",
      },
    },
  ]);
});

test("normalize drops lines of files the rules no longer call source", () => {
  const output = summarizeBlames([{ filePath: "a.snap", stdout: blameOf(4) }]);
  expect(survivalCollector.normalize(output, { classifyFile })).toStrictEqual(
    [],
  );
});

test("normalize still reads outputs from before paths were kept", () => {
  expect(
    survivalCollector.normalize(
      {
        rows: [
          {
            extension: ".ts",
            authorEmail: "alice@example.com",
            cohortMonth: "2025-01",
            lines: 7,
          },
        ],
      },
      { classifyFile },
    ),
  ).toStrictEqual([
    {
      metric: "survival.lines",
      value: 7,
      categories: {
        extension: ".ts",
        author: "alice@example.com",
        cohort: "2025-01",
      },
    },
  ]);
});
