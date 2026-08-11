import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { NodeServices } from "@effect/platform-node";
import { expect, it, test } from "@effect/vitest";
import { Effect } from "effect";

import {
  getBlobCache,
  listBlobCacheNamespaces,
  pruneBlobCacheNamespaces,
} from "../shared/blob-cache.ts";
import { openCatalog, writeCollectorOutput } from "../shared/catalog.ts";
import { builtInCollectors, collectorCacheKey } from "../shared/collectors.ts";
import { loadConfig } from "../shared/config.ts";
import { runGc } from "./gc.ts";

const commitEnvironment = {
  GIT_AUTHOR_DATE: "2026-01-02T03:04:05Z",
  GIT_COMMITTER_DATE: "2026-01-02T03:04:05Z",
  GIT_AUTHOR_NAME: "Test Author",
  GIT_AUTHOR_EMAIL: "author@example.com",
  GIT_COMMITTER_NAME: "Test Author",
  GIT_COMMITTER_EMAIL: "author@example.com",
};

function runGit(cwd: string, ...args: readonly string[]) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...commitEnvironment },
  });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout;
}

function collectorNamed(name: string) {
  const collector = builtInCollectors.find(
    (candidate) => candidate.name === name,
  );
  if (!collector) {
    throw new Error(`No such collector: ${name}`);
  }
  return collector;
}

/**
 * A repository whose history has a side branch merged back into main, so that
 * one commit is reachable from HEAD yet off its first-parent chain.
 */
function createMergeFixtureRepo() {
  const repoPath = mkdtempSync(path.join(os.tmpdir(), "repo-dive-gc-"));
  runGit(repoPath, "init", "-b", "main");

  writeFileSync(path.join(repoPath, "hello.txt"), "hello\n");
  runGit(repoPath, "add", ".");
  runGit(repoPath, "commit", "-m", "Add hello");
  const baseSha = runGit(repoPath, "rev-parse", "HEAD").trim();

  runGit(repoPath, "checkout", "-b", "side");
  writeFileSync(path.join(repoPath, "side.txt"), "side\n");
  runGit(repoPath, "add", ".");
  runGit(repoPath, "commit", "-m", "Add side");
  const sideSha = runGit(repoPath, "rev-parse", "HEAD").trim();

  runGit(repoPath, "checkout", "main");
  runGit(repoPath, "merge", "--no-ff", "-m", "Merge side", "side");
  const mergeSha = runGit(repoPath, "rev-parse", "HEAD").trim();

  return { repoPath, baseSha, sideSha, mergeSha };
}

/** Writes a realistic catalog output, sidecar included, for one (commit, collector). */
const seedOutput = (repoRoot: string, sha: string, collectorName: string) =>
  Effect.gen(function* () {
    const collector = collectorNamed(collectorName);
    const config = yield* loadConfig(repoRoot);
    const catalog = yield* openCatalog({
      repoRoot,
      catalogPath: config.catalogPath,
    });
    yield* writeCollectorOutput({
      catalog,
      sha,
      collector,
      cacheKey: collectorCacheKey(collector, config),
      output: {},
      durationMs: 1,
    });
  });

function outputPath(repoRoot: string, sha: string, collectorName: string) {
  return path.join(
    repoRoot,
    ".repo-dive",
    "commits",
    sha,
    collectorName,
    "output.json",
  );
}

it.effect(
  "gc --off-mainline reclaims snapshots off the first-parent chain only",
  () => {
    const { repoPath, baseSha, sideSha, mergeSha } = createMergeFixtureRepo();

    return Effect.gen(function* () {
      for (const sha of [baseSha, sideSha, mergeSha]) {
        // file-types is a tree collector, commit-meta a log one.
        yield* seedOutput(repoPath, sha, "file-types");
        yield* seedOutput(repoPath, sha, "commit-meta");
      }

      yield* runGc({ repoPath, offMainline: true, dryRun: true, yes: true });
      expect(
        existsSync(outputPath(repoPath, sideSha, "file-types")),
        "--dry-run must leave the catalog alone",
      ).toBe(true);

      yield* runGc({ repoPath, offMainline: true, yes: true });

      expect(
        existsSync(outputPath(repoPath, sideSha, "file-types")),
        "the side branch's tree snapshot is off the mainline",
      ).toBe(false);
      expect(
        existsSync(outputPath(repoPath, sideSha, "commit-meta")),
        "a commit's own metadata is valid wherever the commit sits",
      ).toBe(true);
      for (const sha of [baseSha, mergeSha]) {
        expect(
          existsSync(outputPath(repoPath, sha, "file-types")),
          "mainline snapshots stay",
        ).toBe(true);
      }
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          rmSync(repoPath, { force: true, recursive: true });
        }),
      ),
      Effect.provide(NodeServices.layer),
    );
  },
);

it.effect("gc --unreachable leaves off-mainline snapshots alone", () => {
  const { repoPath, sideSha } = createMergeFixtureRepo();

  return Effect.gen(function* () {
    yield* seedOutput(repoPath, sideSha, "file-types");

    yield* runGc({ repoPath, unreachable: true, yes: true });

    expect(
      existsSync(outputPath(repoPath, sideSha, "file-types")),
      "the side commit is still reachable from HEAD",
    ).toBe(true);
  }).pipe(
    Effect.ensuring(
      Effect.sync(() => {
        rmSync(repoPath, { force: true, recursive: true });
      }),
    ),
    Effect.provide(NodeServices.layer),
  );
});

it.effect(
  "gc --stale drops blob-cache namespaces no collector can look up",
  () => {
    const { repoPath } = createMergeFixtureRepo();

    return Effect.gen(function* () {
      const collector = collectorNamed("directives");
      const config = yield* loadConfig(repoPath);
      const { catalogPath } = config;
      const liveCacheKey = collectorCacheKey(collector, config);
      const cache = getBlobCache(catalogPath);
      const entries = new Map([["0".repeat(40), "[]"]]);

      cache.setMany(collector.name, liveCacheKey, entries);
      // An earlier version of the same collector, and one that no longer exists.
      cache.setMany(collector.name, "000000000000", entries);
      cache.setMany("retired-collector", liveCacheKey, entries);

      expect(listBlobCacheNamespaces(catalogPath)).toHaveLength(3);

      yield* runGc({ repoPath, stale: true, dryRun: true, yes: true });
      expect(
        listBlobCacheNamespaces(catalogPath),
        "--dry-run must leave the cache alone",
      ).toHaveLength(3);

      yield* runGc({ repoPath, stale: true, yes: true });

      expect(listBlobCacheNamespaces(catalogPath)).toEqual([
        { collector: collector.name, cacheKey: liveCacheKey, entryCount: 1 },
      ]);
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          rmSync(repoPath, { force: true, recursive: true });
        }),
      ),
      Effect.provide(NodeServices.layer),
    );
  },
);

test("pruneBlobCacheNamespaces compacts the file it prunes", () => {
  const catalogPath = mkdtempSync(path.join(os.tmpdir(), "repo-dive-cache-"));

  try {
    const cache = getBlobCache(catalogPath);
    const bulk = new Map(
      Array.from({ length: 2000 }, (_, index) => [
        String(index).padStart(40, "0"),
        JSON.stringify({
          rules: Array.from({ length: 10 }, () => "no-shadow"),
        }),
      ]),
    );
    cache.setMany("directives", "deadbeef0000", bulk);
    cache.setMany(
      "directives",
      "cafebabe1111",
      new Map([["a".repeat(40), "[]"]]),
    );

    const bytesReclaimed = pruneBlobCacheNamespaces(catalogPath, [
      { collector: "directives", cacheKey: "deadbeef0000" },
    ]);

    expect(
      bytesReclaimed,
      "VACUUM should hand back the freed pages",
    ).toBeGreaterThan(0);
    expect(listBlobCacheNamespaces(catalogPath)).toEqual([
      { collector: "directives", cacheKey: "cafebabe1111", entryCount: 1 },
    ]);
  } finally {
    rmSync(catalogPath, { force: true, recursive: true });
  }
});
