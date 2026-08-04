import { readFile } from "node:fs/promises";
import path from "node:path";

import { Effect } from "effect";

/**
 * Not every ignore file at the root wants the catalog spelled out in it. Some
 * tools read `.gitignore` besides their own file; some ignore files are no
 * longer read at all; and npm stops consulting `.npmignore` the moment
 * `package.json` says what to pack.
 *
 * A line that changes nothing is not free — the next person to open the file
 * has to work out why it is there. So this module asks the repository a few
 * questions and lets `ignore` leave those files alone.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Anything a flat ESLint config may be called, all of them at the root. */
const flatEslintConfigPattern = /^eslint\.config\.[cm]?[jt]s$/;

/**
 * `package.json` at the repository root, or an empty object when it is missing,
 * unreadable or not JSON — an answer of "the manifest says nothing", which is
 * what every rule below then reads out of it.
 */
const readManifest = (
  repoRoot: string,
): Effect.Effect<Record<string, unknown>> =>
  Effect.tryPromise(async () => {
    const parsed: unknown = JSON.parse(
      await readFile(path.join(repoRoot, "package.json"), "utf8"),
    );
    return isRecord(parsed) ? parsed : {};
  }).pipe(Effect.orElseSucceed(() => ({})));

/** The major version a dependency range asks for: `^3.2.1` and `~3` both say 3. */
const declaredMajor = (
  manifest: Record<string, unknown>,
  packageName: string,
): number | undefined => {
  for (const field of ["devDependencies", "dependencies"]) {
    const dependencies = manifest[field];
    const range = isRecord(dependencies)
      ? dependencies[packageName]
      : undefined;
    if (typeof range === "string") {
      // A range with no digits at all (`latest`, `workspace:*`, `catalog:`)
      // pins nothing, and is treated as "whatever is current".
      const major = /\d+/.exec(range)?.[0];
      return major === undefined ? undefined : Number(major);
    }
  }
  return undefined;
};

/**
 * Whether a script runs prettier with `--ignore-path`, which replaces the files
 * prettier would have read for itself — including `.gitignore`.
 */
const overridesPrettierIgnorePath = (
  manifest: Record<string, unknown>,
): boolean => {
  const scripts = manifest["scripts"];
  return (
    isRecord(scripts) &&
    Object.values(scripts).some(
      (script) =>
        typeof script === "string" &&
        script.includes("prettier") &&
        script.includes("--ignore-path"),
    )
  );
};

/** What the repository says about itself, as far as the rules below care. */
export type RepoSetup = {
  /** A `.gitignore` sits at the repository root. */
  readonly hasGitignore: boolean;
  /** `package.json` lists the paths npm packs, so no ignore file decides it. */
  readonly npmPacksByAllowList: boolean;
  /** ESLint reads a flat config, where `.eslintignore` plays no part. */
  readonly eslintUsesFlatConfig: boolean;
  /** The major version of prettier the repository asks for, when it pins one. */
  readonly prettierMajor: number | undefined;
  /** A script tells prettier which ignore files to read, so it reads no others. */
  readonly prettierIgnorePathOverridden: boolean;
};

/**
 * Reads the setup from the repository root. Best-effort throughout: a missing
 * or unreadable `package.json` simply answers "no" to everything it would have
 * decided, which leaves `ignore` doing the thorough thing.
 */
export const readRepoSetup = ({
  repoRoot,
  rootFileNames,
}: {
  readonly repoRoot: string;
  readonly rootFileNames: readonly string[];
}): Effect.Effect<RepoSetup> =>
  Effect.gen(function* () {
    const manifest = yield* readManifest(repoRoot);

    return {
      hasGitignore: rootFileNames.includes(".gitignore"),
      npmPacksByAllowList: Array.isArray(manifest["files"]),
      eslintUsesFlatConfig:
        rootFileNames.some((name) => flatEslintConfigPattern.test(name)) ||
        (declaredMajor(manifest, "eslint") ?? 0) >= 9,
      prettierMajor: declaredMajor(manifest, "prettier"),
      prettierIgnorePathOverridden: overridesPrettierIgnorePath(manifest),
    };
  });

/**
 * Why the tool reading `name` already skips the catalog without an entry of its
 * own, phrased for the line `ignore` prints. Undefined when the entry is worth
 * adding.
 *
 * Every rule here answers for the repository *after* `ignore` has run, which is
 * why the `.gitignore` ones only ask whether the file exists: the command lists
 * the catalog there whenever it is missing.
 */
export const redundancyReason = ({
  name,
  setup,
}: {
  readonly name: string;
  readonly setup: RepoSetup;
}): string | undefined => {
  switch (name) {
    case ".prettierignore": {
      // Prettier's CLI has read .gitignore alongside .prettierignore since v3,
      // and v2 went out of support long ago — but a repository still pinning
      // it, or naming the ignore files itself, gets the entry.
      return setup.hasGitignore &&
        (setup.prettierMajor ?? 3) >= 3 &&
        !setup.prettierIgnorePathOverridden
        ? "prettier reads .gitignore as well"
        : undefined;
    }
    case ".npmignore": {
      // `files` is an allow list: npm packs what it names and nothing else, so
      // no ignore file gets a say.
      return setup.npmPacksByAllowList
        ? 'package.json "files" decides what npm packs'
        : undefined;
    }
    case ".eslintignore": {
      // Flat config replaced the file with an `ignores` key and stopped reading
      // it, so the file that is still lying around is already inert.
      return setup.eslintUsesFlatConfig
        ? "eslint's flat config never reads .eslintignore"
        : undefined;
    }
    default: {
      return undefined;
    }
  }
};
