import { expect, test } from "vitest";

import {
  countLines,
  languagesCollector,
  summarizeLineCounts,
} from "./languages.ts";

test("countLines counts a trailing-newline-less last line, but not an empty file", () => {
  expect(countLines("")).toBe(0);
  expect(countLines("\n")).toBe(1);
  expect(countLines("a\nb\n")).toBe(2);
  expect(countLines("a\nb")).toBe(2);
  expect(countLines("\n".repeat(3))).toBe(3);
});

test("summarizeLineCounts groups per extension and totals", () => {
  const output = summarizeLineCounts([
    { filePath: "src/a.ts", result: 100 },
    { filePath: "src/b.ts", result: 25 },
    { filePath: "README.md", result: 110 },
    // Blobs the tree scanner skipped (too large to read) carry no count.
    { filePath: "src/huge.ts", result: undefined },
  ]);

  expect(output.byExtension[".ts"]).toStrictEqual({ files: 3, lines: 125 });
  expect(output.byExtension[".md"]).toStrictEqual({ files: 1, lines: 110 });
  expect(output.totalLines).toBe(235);
  expect(output.totalFiles).toBe(4);
});

test("normalize folds extensions of one language into a single series", () => {
  const facts = languagesCollector.normalize({
    byExtension: {
      ".ts": { files: 2, lines: 100 },
      ".mts": { files: 1, lines: 20 },
      ".toml": { files: 1, lines: 5 },
    },
    totalLines: 125,
    totalFiles: 4,
  });

  const linesOf = (language: string) =>
    facts.find(
      (fact) =>
        fact.metric === "languages.lines" &&
        fact.categories?.["language"] === language,
    );

  expect(linesOf("TypeScript")).toStrictEqual({
    metric: "languages.lines",
    value: 120,
    categories: { language: "TypeScript" },
  });
  // Extensions with no mapping keep their own name rather than disappearing.
  expect(linesOf(".toml")?.value).toBe(5);
  expect(
    facts.find(
      (fact) =>
        fact.metric === "languages.files" &&
        fact.categories?.["language"] === "TypeScript",
    )?.value,
  ).toBe(3);
});
