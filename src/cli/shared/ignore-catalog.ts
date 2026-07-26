import path from "node:path";

import { Console, Effect } from "effect";
import type { ChildProcessSpawner } from "effect/unstable/process";

import { loadConfig } from "./config.ts";
import {
  appendIgnoreEntry,
  checkIgnoreFiles,
  ignoreEntryFor,
} from "./ignore-files.ts";
import { resolveRepoRoot } from "./scan.ts";

/**
 * Lists the catalog in every ignore file at the repository root that does not
 * cover it yet, so the tools reading them stop walking the cache.
 */
export const runIgnoreCatalog = ({
  repoPath,
  dryRun,
}: {
  readonly repoPath: string;
  readonly dryRun: boolean;
}): Effect.Effect<void, Error, ChildProcessSpawner.ChildProcessSpawner> =>
  Effect.gen(function* () {
    const repoRoot = yield* resolveRepoRoot(repoPath);
    const config = yield* loadConfig(repoRoot);
    const { catalogRelativePath } = config;

    if (catalogRelativePath === undefined) {
      yield* Console.log(
        `Catalog is at ${config.catalogPath}, outside ${repoRoot} — ` +
          "nothing walking the repository can reach it, so no ignore file needs changing.",
      );
      return;
    }

    const statuses = yield* checkIgnoreFiles({ repoRoot, catalogRelativePath });
    if (statuses.length === 0) {
      yield* Console.log(
        `No ignore files at ${repoRoot} — nothing to update. ` +
          "(Only existing files are amended; none are created.)",
      );
      return;
    }

    const entry = ignoreEntryFor(catalogRelativePath);
    const missing = statuses.filter((status) => !status.covered);
    const covered = statuses.filter((status) => status.covered);

    if (!dryRun) {
      yield* Effect.forEach(
        missing,
        (status) =>
          appendIgnoreEntry({
            filePath: path.join(repoRoot, status.name),
            catalogRelativePath,
          }),
        { discard: true },
      );
    }

    yield* Console.log(
      [
        ...(missing.length === 0
          ? [`Every ignore file already covers ${entry}.`]
          : [
              `${dryRun ? "Would add" : "Added"} ${entry} to:`,
              ...missing.map((status) => `  ${status.name}`),
            ]),
        ...(covered.length === 0
          ? []
          : [
              `Already covered: ${covered.map((status) => status.name).join(", ")}`,
            ]),
      ].join("\n"),
    );
  });
