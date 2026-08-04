import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { Console, Effect } from "effect";

import type { ResolvedConfig } from "./config.ts";
import { coversPath } from "./ignore-files/coverage.ts";
import { readRepoSetup, redundancyReason } from "./ignore-files/redundancy.ts";
import { withIgnoreEntry } from "./ignore-files/style.ts";

/**
 * The catalog hides itself from git with a nested `.gitignore` holding `*`, but
 * that trick is git's alone: prettier, markdownlint, cspell, eslint, `docker
 * build` and `npm pack` each read one ignore file at the root of the repository
 * and know nothing about nested ones. Left unlisted there, the catalog's
 * thousands of small files quietly become their input.
 *
 * This module finds those files and decides what each of them needs: nothing,
 * because it already covers the catalog or because the tool reading it learns
 * about the catalog elsewhere — or one line, written the way the rest of the
 * file is written.
 */

/** Dotfiles whose name ends in "ignore" — `.gitignore`, `.prettierignore`, … */
const ignoreFileNamePattern = /^\..+ignore$/;

/** Names of the files (not directories) sitting at the repository root, sorted. */
const readRootFileNames = (
  repoRoot: string,
): Effect.Effect<readonly string[], Error> =>
  Effect.tryPromise(async () => {
    const entries = await readdir(repoRoot, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .toSorted();
  });

export type IgnoreFileStatus = { readonly name: string } & (
  | { readonly outcome: "listed" }
  /** Nothing to add: the tool reading this file already learns to skip the catalog. */
  | { readonly outcome: "redundant"; readonly reason: string }
  /** Wants `entry` — the line to add, spelled the way this file spells patterns. */
  | { readonly outcome: "missing"; readonly entry: string }
);

/**
 * What every ignore file at the repository root needs. Only the root is
 * searched: ignore files further down govern their own subtree, and the tools
 * that matter read the root one anyway.
 */
export const checkIgnoreFiles = ({
  repoRoot,
  catalogRelativePath,
}: {
  readonly repoRoot: string;
  readonly catalogRelativePath: string;
}): Effect.Effect<readonly IgnoreFileStatus[], Error> =>
  Effect.gen(function* () {
    const rootFileNames = yield* readRootFileNames(repoRoot);
    const names = rootFileNames.filter((name) =>
      ignoreFileNamePattern.test(name),
    );
    if (names.length === 0) {
      return [];
    }

    const setup = yield* readRepoSetup({ repoRoot, rootFileNames });
    return yield* Effect.forEach(names, (name) =>
      Effect.tryPromise(async (): Promise<IgnoreFileStatus> => {
        const contents = await readFile(path.join(repoRoot, name), "utf8");
        if (coversPath(contents, catalogRelativePath)) {
          return { name, outcome: "listed" };
        }
        const reason = redundancyReason({ name, setup });
        if (reason !== undefined) {
          return { name, outcome: "redundant", reason };
        }
        const { entry } = withIgnoreEntry({ contents, catalogRelativePath });
        return { name, outcome: "missing", entry };
      }),
    );
  });

/** How the catalog is referred to in messages, whatever a given file spells. */
export const ignoreEntryFor = (catalogRelativePath: string): string =>
  `${catalogRelativePath}/`;

/**
 * Lists the catalog in an existing ignore file, in the shape the file is
 * already written in. Never creates a file: an ignore file the repository does
 * not have is one no tool reads.
 */
export const addIgnoreEntry = ({
  filePath,
  catalogRelativePath,
}: {
  readonly filePath: string;
  readonly catalogRelativePath: string;
}): Effect.Effect<void, Error> =>
  Effect.tryPromise(async () => {
    const { contents } = withIgnoreEntry({
      contents: await readFile(filePath, "utf8"),
      catalogRelativePath,
    });
    await writeFile(filePath, contents, "utf8");
  });

/**
 * Names of the root ignore files that will send their tool into the catalog.
 * Empty whenever the question does not apply: the catalog lives outside the
 * repository, the check is switched off, or nothing is left to add.
 */
const missingIgnoreFiles = ({
  repoRoot,
  config,
}: {
  readonly repoRoot: string;
  readonly config: ResolvedConfig;
}): Effect.Effect<readonly string[], Error> =>
  Effect.gen(function* () {
    const { catalogRelativePath } = config;
    if (catalogRelativePath === undefined || !config.checkIgnoreFiles) {
      return [];
    }
    const statuses = yield* checkIgnoreFiles({ repoRoot, catalogRelativePath });
    return statuses
      .filter((status) => status.outcome === "missing")
      .map((status) => status.name);
  });

/**
 * Warns, once a command has done its work, about ignore files that will send
 * their tool into the catalog. Goes to stderr so piped stdout stays clean.
 * Best-effort: an unreadable ignore file must not fail the command whose work
 * is already done, so any error here means no warning, nothing more.
 */
export const warnAboutIgnoreFiles = ({
  repoRoot,
  config,
}: {
  readonly repoRoot: string;
  readonly config: ResolvedConfig;
}): Effect.Effect<void> =>
  Effect.gen(function* () {
    const { catalogRelativePath } = config;
    if (catalogRelativePath === undefined) {
      return;
    }
    const missing = yield* missingIgnoreFiles({ repoRoot, config });
    if (missing.length === 0) {
      return;
    }
    const one = missing.length === 1;
    yield* Console.error(
      [
        `\nWarning: ${missing.join(", ")} ${one ? "does" : "do"} not cover ${ignoreEntryFor(catalogRelativePath)}.`,
        `  The tools reading ${one ? "it" : "them"} will walk the catalog instead of skipping it.`,
        "  Add the entry: npx repo-dive ignore",
      ].join("\n"),
    );
  }).pipe(Effect.ignore);
