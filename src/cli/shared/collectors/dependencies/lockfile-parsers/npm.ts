import { Predicate } from "effect";

import type { LockfileParser, LockfileSummary } from "./shared/types.ts";

const versionString = (value: unknown): string =>
  typeof value === "number" || typeof value === "string" ? String(value) : "";

/** Recursively counts every resolved node in a legacy v1 `dependencies` tree. */
const countTree = (dependencies: unknown): number => {
  if (!Predicate.isObject(dependencies)) {
    return 0;
  }
  let total = 0;
  for (const entry of Object.values(dependencies)) {
    total += 1;
    if (Predicate.isObject(entry)) {
      total += countTree(entry["dependencies"]);
    }
  }
  return total;
};

/**
 * Parses an npm `package-lock.json` (also `npm-shrinkwrap.json`-shaped). Two
 * layouts exist: lockfileVersion 2/3 carry a flat `packages` map keyed by
 * install path — `""` and workspace folders are importers, `node_modules/…`
 * entries are the resolved graph (symlinked workspaces excluded). The legacy
 * v1 layout has only a nested `dependencies` tree. Either way we count only the
 * resolved graph; direct dependencies are read from `package.json` manifests.
 */
export const parseNpmLockfile = (
  content: string,
): LockfileSummary | undefined => {
  let root: unknown;
  try {
    root = JSON.parse(content);
  } catch {
    return undefined;
  }
  if (!Predicate.isObject(root)) {
    return undefined;
  }
  const lockfileVersion = versionString(root["lockfileVersion"]);

  // v2/v3: the flat `packages` map — `node_modules/…` entries are the resolved
  // graph; `""` and workspace folders are importers (not counted here).
  if (Predicate.isObject(root["packages"])) {
    let resolvedCount = 0;
    for (const [path, value] of Object.entries(root["packages"])) {
      const entry = Predicate.isObject(value) ? value : {};
      // An installed package — unless it's a symlink to a local workspace.
      if (path.includes("node_modules/") && entry["link"] !== true) {
        resolvedCount += 1;
      }
    }
    return {
      packageManager: "npm",
      lockfileVersion: lockfileVersion || "3",
      resolvedCount,
    };
  }

  // v1: only the nested `dependencies` tree.
  if (Predicate.isObject(root["dependencies"])) {
    return {
      packageManager: "npm",
      lockfileVersion: lockfileVersion || "1",
      resolvedCount: countTree(root["dependencies"]),
    };
  }

  return undefined;
};

export const npmParser: LockfileParser = {
  fileName: "package-lock.json",
  parse: parseNpmLockfile,
};
