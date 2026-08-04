import { expect, test } from "@effect/vitest";

import { coversPath } from "./coverage.ts";

test("coversPath recognizes the forms people actually write", () => {
  for (const pattern of [
    ".repo-dive",
    ".repo-dive/",
    "/.repo-dive",
    "/.repo-dive/",
    "./.repo-dive",
    "**/.repo-dive",
    ".repo-dive/**",
    ".repo-dive/**/",
    ".repo-dive/*",
    "  .repo-dive/  ",
    "node_modules\n.repo-dive/\ndist",
  ]) {
    expect(coversPath(pattern, ".repo-dive"), pattern).toBe(true);
  }
});

test("coversPath treats a catch-all and an ancestor directory as covering", () => {
  expect(coversPath("*", ".repo-dive")).toBe(true);
  expect(coversPath("**", ".repo-dive")).toBe(true);
  expect(coversPath("**/*", ".repo-dive")).toBe(true);
  expect(coversPath("tmp/", "tmp/dive-cache")).toBe(true);
  expect(coversPath("tmp/*", "tmp")).toBe(true);
});

test("coversPath matches a bare name at any depth, like gitignore", () => {
  expect(coversPath("dive-cache\n", "tmp/dive-cache")).toBe(true);
  expect(coversPath("cache\n", "tmp/dive-cache")).toBe(false);
});

test("coversPath counts an ambiguous wildcard as covered", () => {
  expect(coversPath(".repo-*\n", ".repo-dive")).toBe(true);
  expect(coversPath("tmp/*\n", "tmp/dive-cache")).toBe(true);
  // A wildcard with no literal beginning claims nothing about the catalog.
  expect(coversPath("*.log\n", ".repo-dive")).toBe(false);
});

test("coversPath ignores comments and unrelated patterns", () => {
  expect(coversPath("# .repo-dive\nnode_modules\n", ".repo-dive")).toBe(false);
  expect(coversPath("", ".repo-dive")).toBe(false);
  expect(coversPath(".repo-dive-old\n", ".repo-dive")).toBe(false);
  // An ancestor is covering; a descendant is not.
  expect(coversPath("tmp/dive-cache\n", "tmp")).toBe(false);
});

test("coversPath honors a later re-include", () => {
  expect(coversPath("*\n!.repo-dive\n", ".repo-dive")).toBe(false);
  expect(coversPath("!.repo-dive\n.repo-dive/\n", ".repo-dive")).toBe(true);
});
