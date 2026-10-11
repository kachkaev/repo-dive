/**
 * Fails unless every Effect package in the lockfile resolves to one version.
 *
 * `effect` and the `@effect/*` packages are released in lockstep and import
 * each other's newest modules: `@effect/platform-node@4.0.3` crashes on
 * `effect@4.0.2` because it loads a module that only exists from 4.0.3 on.
 * Renovate groups them into one PR, but it still picks each package's version
 * on its own, so the group mixes versions whenever `effect` is published later
 * than its siblings or is still inside `minimumReleaseAge`. This check names
 * the mismatch instead of leaving it to surface as a broken build; Renovate
 * fixes the PR by itself once the lagging package becomes eligible.
 */

import { readFileSync } from "node:fs";

import { parseAllDocuments } from "yaml";

type Lockfile = {
  packages?: Record<string, unknown>;
};

// pnpm writes the lockfile as several YAML documents: one for pnpm itself
// (`packageManagerDependencies`), then one for the project.
const lockfileDocuments = parseAllDocuments(
  readFileSync("pnpm-lock.yaml", "utf8"),
);

const effectPackages: Array<{ name: string; version: string }> = [];
for (const lockfileDocument of lockfileDocuments) {
  const lockfile = lockfileDocument.toJS() as Lockfile;
  for (const key of Object.keys(lockfile.packages ?? {})) {
    const versionSeparatorIndex = key.lastIndexOf("@");
    const name = key.slice(0, versionSeparatorIndex);
    if (name === "effect" || name.startsWith("@effect/")) {
      effectPackages.push({
        name,
        version: key.slice(versionSeparatorIndex + 1),
      });
    }
  }
}

if (effectPackages.every(({ name }) => name !== "effect")) {
  throw new Error("`effect` is missing from pnpm-lock.yaml");
}

const versions = new Set(effectPackages.map(({ version }) => version));
if (versions.size > 1) {
  process.stderr.write(
    [
      "Effect packages must all resolve to the same version:",
      ...effectPackages.map(({ name, version }) => `  ${name}@${version}`),
      "",
      "Pin `effect` and every `@effect/*` package to one version in package.json and in the `overrides` of pnpm-workspace.yaml, then run `pnpm install`.",
      "",
    ].join("\n"),
  );
  process.exitCode = 1;
} else {
  process.stdout.write(
    `All ${effectPackages.length} Effect packages resolve to ${[...versions].join("")}.\n`,
  );
}
