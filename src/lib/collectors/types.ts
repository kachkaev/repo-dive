import type { Effect } from "effect";

type CollectContext = {
  readonly repoRoot: string;
  readonly sha: string;
};

/**
 * A collector extracts one kind of raw snapshot from a commit (the map phase).
 * Its output is persisted verbatim into the catalog; normalization into the
 * metrics cube is a separate concern arriving with the `index` command.
 */
export type Collector = {
  readonly name: string;
  /** Bump to invalidate previously collected outputs of this collector. */
  readonly version: string;
  /**
   * What the collector needs: `log` — commit metadata/diffs only; `tree` —
   * object-database reads; `worktree` — a real checkout (none exist yet).
   */
  readonly strategy: "log" | "tree" | "worktree";
  readonly collect: (context: CollectContext) => Effect.Effect<unknown, Error>;
};

/** File extension used as a category key, e.g. ".ts"; files without one map to "(none)". */
export const extensionOf = (filePath: string): string => {
  const basename = filePath.split("/").at(-1) ?? "";
  const dotIndex = basename.lastIndexOf(".");
  return dotIndex > 0 ? basename.slice(dotIndex).toLowerCase() : "(none)";
};
