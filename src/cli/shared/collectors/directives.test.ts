import { expect, test } from "vitest";

import { mergeDirectives, scanFileForDirectives } from "./directives.ts";

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
