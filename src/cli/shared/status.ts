import { access } from "node:fs/promises";
import path from "node:path";

import { Console, Effect } from "effect";
import type { ChildProcessSpawner } from "effect/unstable/process";

import {
  findLegacyCatalog,
  isCollected,
  legacyCatalogHint,
} from "./catalog.ts";
import {
  builtInCollectors,
  collectorCacheKey,
  describesTreeState,
} from "./collectors.ts";
import { loadConfig } from "./config.ts";
import { warnAboutIgnoreFiles } from "./ignore-files.ts";
import { sampleCommits, samplingLabel } from "./sampling.ts";
import { listCommits, listFirstParentShas, resolveRepoRoot } from "./scan.ts";

const exists = (filePath: string) =>
  Effect.promise(() =>
    access(filePath).then(
      () => true,
      () => false,
    ),
  );

export const runStatus = ({
  repoPath,
}: {
  readonly repoPath: string;
}): Effect.Effect<void, Error, ChildProcessSpawner.ChildProcessSpawner> =>
  Effect.gen(function* () {
    const repoRoot = yield* resolveRepoRoot(repoPath);
    const commits = yield* listCommits(repoRoot);
    const firstParentShas = yield* listFirstParentShas(repoRoot);
    const config = yield* loadConfig(repoRoot);
    const catalogPath = config.catalogPath;

    if (!(yield* exists(path.join(catalogPath, "catalog.json")))) {
      const legacyRootPath = yield* findLegacyCatalog(repoRoot);
      yield* Console.log(
        [
          `Repository: ${repoRoot}`,
          `Commits: ${commits.length}`,
          legacyRootPath === undefined
            ? `No catalog found at ${catalogPath} — run \`repo-dive scan\` first.`
            : legacyCatalogHint(legacyRootPath),
        ].join("\n"),
      );
      return;
    }

    const catalog = { repoRoot, rootPath: catalogPath };
    const lines = [
      `Repository: ${repoRoot}`,
      `Commits: ${commits.length}`,
      `Catalog: ${catalogPath}`,
    ];

    for (const collector of builtInCollectors) {
      // Count against what the collector is actually meant to cover: a monthly
      // collector on a busy repo is complete at a handful of commits, and
      // reporting it as `1/45` reads as barely started. Snapshot collectors
      // are only ever scanned on the first-parent chain, so counting them
      // against off-mainline commits too would keep them short of their target
      // however often `scan` is run.
      const target = sampleCommits(
        describesTreeState(collector)
          ? commits.filter((commit) => firstParentShas.has(commit.hash))
          : commits,
        collector.defaultSampling,
      );
      const cacheKey = collectorCacheKey(collector, config);
      const collectedFlags = yield* Effect.forEach(
        target,
        (commit) => isCollected(catalog, commit.hash, collector, cacheKey),
        { concurrency: 16 },
      );
      const collected = collectedFlags.filter(Boolean).length;
      lines.push(
        collector.defaultSampling === "all"
          ? `  ${collector.name}: ${collected}/${target.length} commits collected`
          : `  ${collector.name}: ${collected}/${target.length} commits collected` +
              ` (${samplingLabel(collector.defaultSampling)} sample of ${commits.length})`,
      );
    }

    yield* Console.log(lines.join("\n"));
    yield* warnAboutIgnoreFiles({ repoRoot, config });
  });
