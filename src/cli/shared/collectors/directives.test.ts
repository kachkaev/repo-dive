import { expect, test } from "vitest";

import {
  directivesCollector,
  mergeDirectives,
  scanFileForDirectives,
} from "./directives.ts";

test("directives scanning classifies directives and pairs blocks", () => {
  const fileA = [
    "const a = 1;",
    "",
    "// eslint-disable-next-line no-console, unicorn/no-null -- why",
    ...Array.from({ length: 6 }, () => "code();"),
    "/* eslint-disable no-alert */",
    ...Array.from({ length: 9 }, () => "alert();"),
    "/* eslint-enable no-alert */",
    "// @ts-expect-error legacy",
  ].join("\n");
  const fileB = [
    "/* eslint-disable */",
    "code();",
    "code();",
    "code();",
    "const x = 1; // eslint-disable-line no-magic-numbers",
    "code();",
    "code();",
    "// @ts-ignore",
  ].join("\n");
  const fileC = "// @ts-nocheck\ncode();";

  const output = mergeDirectives([
    scanFileForDirectives(fileA),
    scanFileForDirectives(fileB),
    scanFileForDirectives(fileC),
  ]);

  expect(output.eslintNextLine.count).toBe(1);
  expect(output.eslintNextLine.byRule).toStrictEqual({
    "no-console": 1,
    "unicorn/no-null": 1,
  });
  expect(output.eslintLine.count).toBe(1);
  expect(output.eslintLine.byRule).toStrictEqual({ "no-magic-numbers": 1 });
  expect(output.eslintBlocks.count).toBe(2);
  expect(output.eslintBlocks.closedCount).toBe(1);
  expect(output.eslintBlocks.unboundedCount).toBe(1);
  expect(output.eslintBlocks.coveredLines).toBe(9);
  expect(output.eslintBlocks.byRule).toStrictEqual({
    "no-alert": 1,
    "(all)": 1,
  });
  expect(output.tsDirectives).toStrictEqual({
    ignore: 1,
    expectError: 1,
    nocheck: 1,
  });
});

test("directives scanning counts oxlint comments apart from eslint ones", () => {
  const output = scanFileForDirectives(
    [
      "/* eslint-disable no-alert */",
      "/* oxlint-disable typescript/no-explicit-any */",
      "let a: any;",
      "/* oxlint-enable typescript/no-explicit-any */",
      // The rationale naming eslint's directive must not steal the comment
      "// oxlint-disable-next-line no-console -- eslint-disable-next-line kept for editors",
      "console.log(a);",
      "debugger; // oxlint-disable-line no-debugger",
    ].join("\n"),
  );

  expect(output.oxlintNextLine).toStrictEqual({
    count: 1,
    byRule: { "no-console": 1 },
  });
  expect(output.oxlintLine).toStrictEqual({
    count: 1,
    byRule: { "no-debugger": 1 },
  });
  expect(output.oxlintBlocks).toStrictEqual({
    count: 1,
    closedCount: 1,
    unboundedCount: 0,
    coveredLines: 1,
    byRule: { "typescript/no-explicit-any": 1 },
  });
  // oxlint-enable closes oxlint's own block, not the eslint one
  expect(output.eslintBlocks).toStrictEqual({
    count: 1,
    closedCount: 0,
    unboundedCount: 1,
    coveredLines: 0,
    byRule: { "no-alert": 1 },
  });
  expect(output.eslintNextLine.count).toBe(0);
  expect(output.eslintLine.count).toBe(0);

  const merged = mergeDirectives([
    output,
    scanFileForDirectives("// oxlint-disable-next-line no-console"),
  ]);
  expect(merged.oxlintNextLine).toStrictEqual({
    count: 2,
    byRule: { "no-console": 2 },
  });
  expect(merged.oxlintBlocks).toStrictEqual(output.oxlintBlocks);
});

test("directives collector tags lint facts by linter, also for outputs collected before oxlint was counted", () => {
  const facts = directivesCollector.normalize({
    eslintNextLine: { count: 2, byRule: { "no-console": 2 } },
    eslintLine: { count: 0, byRule: {} },
    eslintBlocks: {
      count: 1,
      closedCount: 1,
      unboundedCount: 0,
      coveredLines: 4,
      byRule: { "(all)": 1 },
    },
    tsDirectives: { ignore: 1, expectError: 0, nocheck: 0 },
  });

  expect(facts).toStrictEqual([
    {
      metric: "directives.lint",
      value: 2,
      categories: { linter: "eslint", type: "next-line", rule: "no-console" },
    },
    {
      metric: "directives.lint",
      value: 1,
      categories: { linter: "eslint", type: "block", rule: "(all)" },
    },
    {
      metric: "directives.lintBlockCoveredLines",
      value: 4,
      categories: { linter: "eslint" },
    },
    {
      metric: "directives.lintBlockCoveredLines",
      value: 0,
      categories: { linter: "oxlint" },
    },
    { metric: "directives.ts", value: 1, categories: { type: "ignore" } },
    { metric: "directives.ts", value: 0, categories: { type: "expectError" } },
    { metric: "directives.ts", value: 0, categories: { type: "nocheck" } },
  ]);

  expect(
    directivesCollector
      .normalize(scanFileForDirectives("// oxlint-disable-next-line no-var"))
      .filter((fact) => fact.metric === "directives.lint"),
  ).toStrictEqual([
    {
      metric: "directives.lint",
      value: 1,
      categories: { linter: "oxlint", type: "next-line", rule: "no-var" },
    },
  ]);
});
