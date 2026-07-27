import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { Data, DateTime, Effect } from "effect";

import type { Collector } from "./collectors.ts";
import { defaultCatalogDirName } from "./config.ts";

/** Catalog folder used before the tool was renamed from repo-insighter in 0.4.0. */
const legacyCatalogDirName = ".repo-insighter";
const catalogFormatVersion = 1;

export type Catalog = {
  readonly repoRoot: string;
  readonly rootPath: string;
};

type CatalogManifest = {
  readonly formatVersion: number;
  readonly vcs: "git";
  readonly createdAt: string;
};

type CollectorSidecar = {
  readonly collector: string;
  /** Human-readable version — kept for inspection; `cacheKey` is the real key. */
  readonly version: string;
  /** Cache fingerprint (version + relevant config) that decides re-collection. */
  readonly cacheKey: string;
  readonly completedAt: string;
  readonly durationMs: number;
};

/** What to tell the user when only the former name's catalog is present. */
export const legacyCatalogHint = (legacyRootPath: string) =>
  `Found a catalog at ${legacyRootPath}, left by repo-insighter (this tool's former name). ` +
  "Rename it to keep everything already collected:\n" +
  `  mv ${legacyCatalogDirName} ${defaultCatalogDirName}\n` +
  "Or delete it to collect from scratch.";

class LegacyCatalogError extends Data.TaggedError("LegacyCatalogError")<{
  readonly legacyRootPath: string;
}> {
  override get message(): string {
    return legacyCatalogHint(this.legacyRootPath);
  }
}

class CatalogFormatError extends Data.TaggedError("CatalogFormatError")<{
  readonly rootPath: string;
  readonly formatVersion: unknown;
}> {
  override get message(): string {
    return (
      `Catalog at ${this.rootPath} has format version ${String(this.formatVersion)}, ` +
      `but this version of repo-dive expects ${catalogFormatVersion}. ` +
      "Delete the folder to re-collect from scratch."
    );
  }
}

const writeJson = (filePath: string, value: unknown) =>
  Effect.tryPromise(() =>
    writeFile(filePath, `${JSON.stringify(value, undefined, 2)}\n`, "utf8"),
  );

const readJsonIfExists = (filePath: string) =>
  Effect.tryPromise(async (): Promise<unknown> => {
    try {
      return JSON.parse(await readFile(filePath, "utf8"));
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return undefined;
      }
      throw error;
    }
  });

const cacheKeyOf = (sidecar: unknown): unknown =>
  typeof sidecar === "object" && sidecar !== null && "cacheKey" in sidecar
    ? sidecar.cacheKey
    : undefined;

const formatVersionOf = (manifest: unknown): unknown =>
  typeof manifest === "object" &&
  manifest !== null &&
  "formatVersion" in manifest
    ? manifest.formatVersion
    : undefined;

/**
 * Path of a catalog left behind by the tool's former name, if one is there.
 * Re-collecting a whole history is expensive, so callers point at it rather
 * than quietly starting over.
 */
export const findLegacyCatalog = (
  repoRoot: string,
): Effect.Effect<string | undefined, Error> => {
  const legacyRootPath = path.join(repoRoot, legacyCatalogDirName);
  return readJsonIfExists(path.join(legacyRootPath, "catalog.json")).pipe(
    Effect.map((manifest) =>
      manifest === undefined ? undefined : legacyRootPath,
    ),
  );
};

/**
 * Opens (creating if needed) the catalog folder of the analyzed repository —
 * `.repo-dive` at its root unless `catalog.dir` says otherwise. The catalog
 * ignores itself via its own .gitignore; other tools' ignore files are the
 * concern of `ignore-files.ts`.
 */
export const openCatalog = ({
  repoRoot,
  catalogPath,
}: {
  readonly repoRoot: string;
  readonly catalogPath: string;
}): Effect.Effect<Catalog, Error> =>
  Effect.gen(function* () {
    const rootPath = catalogPath;
    const manifestPath = path.join(rootPath, "catalog.json");
    const manifest = yield* readJsonIfExists(manifestPath);

    // A relocated catalog has no history under the former name to inherit.
    if (
      manifest === undefined &&
      rootPath === path.resolve(repoRoot, defaultCatalogDirName)
    ) {
      const legacyRootPath = yield* findLegacyCatalog(repoRoot);
      if (legacyRootPath !== undefined) {
        return yield* new LegacyCatalogError({ legacyRootPath });
      }
    }

    yield* Effect.tryPromise(() => mkdir(rootPath, { recursive: true }));

    if (manifest === undefined) {
      // `wx`: a .gitignore already sitting in a user-chosen `catalog.dir` is
      // the user's file, not this scaffold's to overwrite.
      yield* Effect.tryPromise(async () => {
        try {
          await writeFile(path.join(rootPath, ".gitignore"), "*\n", {
            encoding: "utf8",
            flag: "wx",
          });
        } catch (error) {
          if (
            !(error instanceof Error && "code" in error) ||
            error.code !== "EEXIST"
          ) {
            throw error;
          }
        }
      });
      const now = yield* DateTime.now;
      yield* writeJson(manifestPath, {
        formatVersion: catalogFormatVersion,
        vcs: "git",
        createdAt: DateTime.formatIso(now),
      } satisfies CatalogManifest);
    } else {
      const formatVersion = formatVersionOf(manifest);
      if (formatVersion !== catalogFormatVersion) {
        return yield* new CatalogFormatError({ rootPath, formatVersion });
      }
    }

    return { repoRoot, rootPath };
  });

const collectorDir = (catalog: Catalog, sha: string, collectorName: string) =>
  path.join(catalog.rootPath, "commits", sha, collectorName);

/** Reads the cache fingerprint recorded in a collector's sidecar, if any. */
export const readCollectorCacheKey = (
  catalog: Catalog,
  sha: string,
  collectorName: string,
): Effect.Effect<unknown, Error> =>
  readJsonIfExists(
    path.join(collectorDir(catalog, sha, collectorName), "collector.json"),
  ).pipe(Effect.map(cacheKeyOf));

/**
 * A (commit, collector) pair is done when a sidecar recording the current cache
 * fingerprint exists. `cacheKey` folds in the collector version and any config
 * it depends on, so a version bump or a relevant config change re-collects it.
 */
export const isCollected = (
  catalog: Catalog,
  sha: string,
  collector: Collector,
  cacheKey: string,
): Effect.Effect<boolean, Error> =>
  readCollectorCacheKey(catalog, sha, collector.name).pipe(
    Effect.map((stored) => stored === cacheKey),
  );

export const writeCollectorOutput = ({
  catalog,
  sha,
  collector,
  cacheKey,
  output,
  durationMs,
}: {
  readonly catalog: Catalog;
  readonly sha: string;
  readonly collector: Collector;
  readonly cacheKey: string;
  readonly output: unknown;
  readonly durationMs: number;
}): Effect.Effect<void, Error> =>
  Effect.gen(function* () {
    const dir = collectorDir(catalog, sha, collector.name);
    yield* Effect.tryPromise(() => mkdir(dir, { recursive: true }));
    yield* writeJson(path.join(dir, "output.json"), output);
    const now = yield* DateTime.now;
    yield* writeJson(path.join(dir, "collector.json"), {
      collector: collector.name,
      version: collector.version,
      cacheKey,
      completedAt: DateTime.formatIso(now),
      durationMs,
    } satisfies CollectorSidecar);
  });
