import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { Console, Effect } from "effect";

import type { ResolvedConfig } from "./config.ts";

/**
 * The catalog hides itself from git with a nested `.gitignore` holding `*`, but
 * that trick is git's alone: prettier, markdownlint, cspell, eslint, `docker
 * build` and `npm pack` each read one ignore file at the root of the repository
 * and know nothing about nested ones. Left unlisted there, the catalog's
 * thousands of small files quietly become their input.
 *
 * This module finds those files, decides whether they already cover the
 * catalog, and appends the entry when asked to.
 */

/** Dotfiles whose name ends in "ignore" — `.gitignore`, `.prettierignore`, … */
const ignoreFileNamePattern = /^\..+ignore$/;

/** Marks the line the `ignore` command appends. */
const ignoreEntryComment = "# repo-dive catalog";

/**
 * Ignore files sitting at the repository root, sorted by name. Only the root is
 * searched: ignore files further down govern their own subtree, and the tools
 * that matter read the root one anyway.
 */
export const findIgnoreFileNames = (
  repoRoot: string,
): Effect.Effect<readonly string[], Error> =>
  Effect.tryPromise(async () => {
    const entries = await readdir(repoRoot, { withFileTypes: true });
    return entries
      .filter(
        (entry) => entry.isFile() && ignoreFileNamePattern.test(entry.name),
      )
      .map((entry) => entry.name)
      .toSorted();
  });

/** Strips the decoration that does not change which path a pattern points at. */
const normalizePattern = (pattern: string): string =>
  pattern
    .trim()
    .replace(/^\.?\//, "")
    .replace(/\/\*\*$/, "")
    .replace(/\/$/, "");

/**
 * Whether an ignore file's `contents` plainly cover `relativePath` (a
 * repository-root-relative POSIX path with no trailing slash).
 *
 * This is not a gitignore engine — it recognizes the handful of forms people
 * actually write, and leans towards answering "covered". A missed warning costs
 * a user nothing; one that nags about an entry already sitting in the file
 * would turn the whole check into something to switch off.
 */
export const coversPath = (contents: string, relativePath: string): boolean => {
  const segments = relativePath.split("/");
  const selfOrAncestors = new Set(
    segments.map((_, index) => segments.slice(0, index + 1).join("/")),
  );

  // Later lines win: a re-including `!` after a broad `*` genuinely un-ignores.
  let covered = false;
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }
    const negated = trimmed.startsWith("!");
    const pattern = normalizePattern(negated ? trimmed.slice(1) : trimmed);
    if (
      pattern === "*" ||
      pattern === "**" ||
      selfOrAncestors.has(pattern) ||
      selfOrAncestors.has(pattern.replace(/^\*\*\//, ""))
    ) {
      covered = !negated;
    }
  }

  return covered;
};

export type IgnoreFileStatus = {
  readonly name: string;
  readonly covered: boolean;
};

/** Checks every root ignore file against the catalog's location. */
export const checkIgnoreFiles = ({
  repoRoot,
  catalogRelativePath,
}: {
  readonly repoRoot: string;
  readonly catalogRelativePath: string;
}): Effect.Effect<readonly IgnoreFileStatus[], Error> =>
  Effect.gen(function* () {
    const names = yield* findIgnoreFileNames(repoRoot);
    return yield* Effect.forEach(names, (name) =>
      Effect.tryPromise(async (): Promise<IgnoreFileStatus> => ({
        name,
        covered: coversPath(
          await readFile(path.join(repoRoot, name), "utf8"),
          catalogRelativePath,
        ),
      })),
    );
  });

/** The line to add to an ignore file — a directory pattern, so tools skip the whole tree. */
export const ignoreEntryFor = (catalogRelativePath: string): string =>
  `${catalogRelativePath}/`;

/**
 * Appends the catalog entry to an existing ignore file, separated by a blank
 * line and introduced by a comment saying where it came from. Never creates a
 * file: an ignore file the repository does not have is one no tool reads.
 */
export const appendIgnoreEntry = ({
  filePath,
  catalogRelativePath,
}: {
  readonly filePath: string;
  readonly catalogRelativePath: string;
}): Effect.Effect<void, Error> =>
  Effect.tryPromise(async () => {
    const contents = await readFile(filePath, "utf8");
    const separator =
      contents === "" || contents.endsWith("\n\n")
        ? ""
        : contents.endsWith("\n")
          ? "\n"
          : "\n\n";
    await writeFile(
      filePath,
      `${contents}${separator}${ignoreEntryComment}\n${ignoreEntryFor(catalogRelativePath)}\n`,
      "utf8",
    );
  });

/**
 * Names of the root ignore files that do not cover the catalog. Empty whenever
 * the question does not apply: the catalog lives outside the repository, the
 * check is switched off, or every file already lists it.
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
      .filter((status) => !status.covered)
      .map((status) => status.name);
  });

/**
 * Warns, once a command has done its work, about ignore files that will send
 * their tool into the catalog. Goes to stderr so piped stdout stays clean.
 */
export const warnAboutIgnoreFiles = ({
  repoRoot,
  config,
}: {
  readonly repoRoot: string;
  readonly config: ResolvedConfig;
}): Effect.Effect<void, Error> =>
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
  });
