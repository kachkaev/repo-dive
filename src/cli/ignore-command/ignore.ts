import path from "node:path";

import { Console, Effect } from "effect";
import type { ChildProcessSpawner } from "effect/unstable/process";

import { loadConfig } from "../shared/config.ts";
import {
  addIgnoreEntry,
  checkIgnoreFiles,
  ignoreEntryFor,
} from "../shared/ignore-files.ts";
import { resolveRepoRoot } from "../shared/scan.ts";

/**
 * Lists the catalog in every ignore file at the repository root that needs it,
 * so the tools reading them stop walking the cache.
 */
export const runIgnore = ({
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
    const missing = statuses.filter((status) => status.outcome === "missing");

    if (!dryRun) {
      yield* Effect.forEach(
        missing,
        (status) =>
          addIgnoreEntry({
            filePath: path.join(repoRoot, status.name),
            catalogRelativePath,
          }),
        { discard: true },
      );
    }

    const listed = statuses.filter((status) => status.outcome === "listed");
    yield* Console.log(
      [
        ...(missing.length === 0
          ? [`No ignore file needs ${entry}.`]
          : missing.map(
              (status) =>
                // The line each file gets follows how that file is written, so
                // it is worth showing rather than summarizing.
                `${dryRun ? "Would add" : "Added"} ${status.entry} to ${status.name}`,
            )),
        ...(listed.length === 0
          ? []
          : [
              `Already listed: ${listed.map((status) => status.name).join(", ")}`,
            ]),
        ...statuses
          .filter((status) => status.outcome === "redundant")
          .map((status) => `Not needed: ${status.name} (${status.reason})`),
      ].join("\n"),
    );
  });
