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

import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

import type { ResolvedConfig } from "./config.ts";
import {
  addIgnoreEntry,
  checkIgnoreFiles,
  warnAboutIgnoreFiles,
} from "./ignore-files.ts";
import { coversPath } from "./ignore-files/coverage.ts";

function makeRepoRoot() {
  return mkdtempSync(path.join(os.tmpdir(), "repo-dive-ignore-"));
}

const cleanup = (repoRoot: string) =>
  Effect.sync(() => {
    rmSync(repoRoot, { force: true, recursive: true });
  });

const check = (repoRoot: string) =>
  checkIgnoreFiles({ repoRoot, catalogRelativePath: ".repo-dive" });

it.effect("checkIgnoreFiles picks up dotfiles ending in ignore, sorted", () => {
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

    expect((yield* check(repoRoot)).map((status) => status.name)).toEqual([
      ".dockerignore",
      ".gitignore",
      ".prettierignore",
    ]);
  }).pipe(Effect.ensuring(cleanup(repoRoot)));
});

it.effect("checkIgnoreFiles says what each root ignore file needs", () => {
  const repoRoot = makeRepoRoot();

  return Effect.gen(function* () {
    writeFileSync(path.join(repoRoot, ".gitignore"), "node_modules\n", "utf8");
    writeFileSync(
      path.join(repoRoot, ".dockerignore"),
      "/.repo-dive/\n",
      "utf8",
    );

    expect(yield* check(repoRoot)).toEqual([
      { name: ".dockerignore", outcome: "listed" },
      { name: ".gitignore", outcome: "missing", entry: ".repo-dive" },
    ]);
  }).pipe(Effect.ensuring(cleanup(repoRoot)));
});

it.effect(
  "checkIgnoreFiles leaves out what another file already settles",
  () => {
    const repoRoot = makeRepoRoot();

    return Effect.gen(function* () {
      writeFileSync(
        path.join(repoRoot, ".gitignore"),
        "node_modules\n",
        "utf8",
      );
      writeFileSync(path.join(repoRoot, ".prettierignore"), "dist\n", "utf8");
      writeFileSync(path.join(repoRoot, ".npmignore"), "dist\n", "utf8");
      writeFileSync(
        path.join(repoRoot, "package.json"),
        JSON.stringify({ files: ["dist/"] }),
        "utf8",
      );

      // .gitignore is where the catalog goes; prettier reads that file too, and
      // npm packs by the `files` allow list whatever .npmignore says.
      expect(yield* check(repoRoot)).toEqual([
        { name: ".gitignore", outcome: "missing", entry: ".repo-dive" },
        {
          name: ".npmignore",
          outcome: "redundant",
          reason: 'package.json "files" decides what npm packs',
        },
        {
          name: ".prettierignore",
          outcome: "redundant",
          reason: "prettier reads .gitignore as well",
        },
      ]);
    }).pipe(Effect.ensuring(cleanup(repoRoot)));
  },
);

it.effect("addIgnoreEntry writes a line the file then covers", () => {
  const repoRoot = makeRepoRoot();

  return Effect.gen(function* () {
    const cases = [
      {
        name: ".eslintignore",
        before: "node_modules\n",
        after: "node_modules\n.repo-dive\n",
      },
      // No trailing newline: the entry must not land on the last line.
      {
        name: ".npmignore",
        before: "node_modules",
        after: "node_modules\n.repo-dive\n",
      },
      { name: ".markdownlintignore", before: "", after: ".repo-dive/\n" },
      {
        name: ".dockerignore",
        before: "## Deps\n/node_modules/\n\n## Build\n/dist/\n",
        after:
          "## Deps\n/node_modules/\n\n## Build\n/dist/\n\n## repo-dive catalog\n/.repo-dive/\n",
      },
    ];
    for (const { name, before, after } of cases) {
      writeFileSync(path.join(repoRoot, name), before, "utf8");
      yield* addIgnoreEntry({
        filePath: path.join(repoRoot, name),
        catalogRelativePath: ".repo-dive",
      });
      const written = readFileSync(path.join(repoRoot, name), "utf8");
      expect(written, name).toBe(after);
      expect(coversPath(written, ".repo-dive"), name).toBe(true);
    }
  }).pipe(Effect.ensuring(cleanup(repoRoot)));
});

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
