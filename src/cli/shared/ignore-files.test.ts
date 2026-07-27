import {
  chmodSync,
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

import type { ResolvedConfig } from "./config.ts";
import {
  appendIgnoreEntry,
  checkIgnoreFiles,
  coversPath,
  findIgnoreFileNames,
  warnAboutIgnoreFiles,
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
    ".repo-dive/**/",
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

it.effect(
  "warnAboutIgnoreFiles stays quiet when an ignore file cannot be read",
  () => {
    const repoRoot = makeRepoRoot();

    return Effect.gen(function* () {
      writeFileSync(path.join(repoRoot, ".gitignore"), "node_modules\n");
      chmodSync(path.join(repoRoot, ".gitignore"), 0o000);

      const config: ResolvedConfig = {
        maxInCharts: 10,
        weekStartsOn: "monday",
        catalogPath: path.join(repoRoot, ".repo-dive"),
        catalogRelativePath: ".repo-dive",
        checkIgnoreFiles: true,
        resolveContributor: (email) => ({
          canonicalEmail: email,
          label: email,
          displayName: undefined,
          url: undefined,
          kind: "human",
        }),
      };

      // The command's work is already done by the time the warning runs, so a
      // failed check must mean "no warning", never a failed command.
      yield* warnAboutIgnoreFiles({ repoRoot, config });
    }).pipe(Effect.ensuring(cleanup(repoRoot)));
  },
);
