import { Predicate } from "effect";

/**
 * Direct dependency counts read straight from a `package.json` manifest — the
 * single source of truth for what a project *declares* (as opposed to the
 * resolved graph a lockfile records). Counted as declared, so a monorepo's
 * per-package duplicates add up: React in two packages is two prod entries.
 */
export type ManifestSummary = {
  readonly direct: {
    readonly prod: number;
    readonly dev: number;
    readonly optional: number;
  };
};

const countKeys = (value: unknown): number =>
  Predicate.isObject(value) ? Object.keys(value).length : 0;

/**
 * Reads the `dependencies`, `devDependencies` and `optionalDependencies` blocks
 * of a `package.json`. Returns undefined for content that is not a JSON object
 * (so the file is skipped); a manifest that declares nothing yields zeros,
 * which still counts as a manifest downstream.
 */
export const parsePackageManifest = (
  content: string,
): ManifestSummary | undefined => {
  let root: unknown;
  try {
    root = JSON.parse(content);
  } catch {
    return undefined;
  }
  if (!Predicate.isObject(root)) {
    return undefined;
  }
  return {
    direct: {
      prod: countKeys(root["dependencies"]),
      dev: countKeys(root["devDependencies"]),
      optional: countKeys(root["optionalDependencies"]),
    },
  };
};
