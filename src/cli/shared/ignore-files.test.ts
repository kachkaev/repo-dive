import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { expect, it, test } from "@effect/vitest";
import { Effect } from "effect";

import {
  appendIgnoreEntry,
  checkIgnoreFiles,
  coversPath,
  findIgnoreFileNames,
} from "./ignore-files.ts";

function makeRepoRoot() {
  return mkdtempSync(path.join(os.tmpdir(), "repo-dive-ignore-"));
}

const cleanup = (repoRoot: string) =>
  Effect.sync(() => {
    rmSync(repoRoot, { force: true, recursive: true });
  });

test("coversPath recognizes the forms people actually write", () => {
  for (const pattern of [
    ".repo-dive",
    ".repo-dive/",
    "/.repo-dive",
    "/.repo-dive/",
    "./.repo-dive",
    "**/.repo-dive",
    ".repo-dive/**",
    "  .repo-dive/  ",
    "node_modules\n.repo-dive/\ndist",
  ]) {
    expect(coversPath(pattern, ".repo-dive"), pattern).toBe(true);
  }
});

test("coversPath treats a catch-all and an ancestor directory as covering", () => {
  expect(coversPath("*", ".repo-dive")).toBe(true);
  expect(coversPath("**", ".repo-dive")).toBe(true);
  expect(coversPath("tmp/", "tmp/dive-cache")).toBe(true);
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

it.effect(
  "findIgnoreFileNames picks up dotfiles ending in ignore, sorted",
  () => {
    const repoRoot = makeRepoRoot();

    return Effect.gen(function* () {
      for (const name of [
        ".prettierignore",
        ".gitignore",
        ".dockerignore",
        "ignore",
        "ignore.txt",
        "package.json",
      ]) {
        writeFileSync(path.join(repoRoot, name), "", "utf8");
      }
      // A directory whose name fits the pattern is not an ignore file.
      mkdirSync(path.join(repoRoot, ".npmignore"));

      expect(yield* findIgnoreFileNames(repoRoot)).toEqual([
        ".dockerignore",
        ".gitignore",
        ".prettierignore",
      ]);
    }).pipe(Effect.ensuring(cleanup(repoRoot)));
  },
);

it.effect("checkIgnoreFiles reports each root ignore file", () => {
  const repoRoot = makeRepoRoot();

  return Effect.gen(function* () {
    writeFileSync(path.join(repoRoot, ".gitignore"), "node_modules\n", "utf8");
    writeFileSync(
      path.join(repoRoot, ".prettierignore"),
      "/.repo-dive/\n",
      "utf8",
    );

    expect(
      yield* checkIgnoreFiles({ repoRoot, catalogRelativePath: ".repo-dive" }),
    ).toEqual([
      { name: ".gitignore", covered: false },
      { name: ".prettierignore", covered: true },
    ]);
  }).pipe(Effect.ensuring(cleanup(repoRoot)));
});

it.effect(
  "appendIgnoreEntry separates the entry from what is already there",
  () => {
    const repoRoot = makeRepoRoot();

    return Effect.gen(function* () {
      const cases = [
        { name: ".eslintignore", before: "node_modules\n" },
        // No trailing newline: the entry must not land on the last line.
        { name: ".npmignore", before: "node_modules" },
        { name: ".markdownlintignore", before: "" },
        { name: ".dockerignore", before: "node_modules\n\n" },
      ];
      for (const { name, before } of cases) {
        writeFileSync(path.join(repoRoot, name), before, "utf8");
        yield* appendIgnoreEntry({
          filePath: path.join(repoRoot, name),
          catalogRelativePath: ".repo-dive",
        });
        const after = readFileSync(path.join(repoRoot, name), "utf8");
        expect(after.endsWith("# repo-dive catalog\n.repo-dive/\n"), name).toBe(
          true,
        );
        expect(after.startsWith(before), name).toBe(true);
        expect(coversPath(after, ".repo-dive"), name).toBe(true);
        expect(after).not.toContain("\n\n\n");
      }
    }).pipe(Effect.ensuring(cleanup(repoRoot)));
  },
);
