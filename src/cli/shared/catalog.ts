import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { Data, DateTime, Effect, Predicate } from "effect";

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

/**
 * Which source files an output covers: `pathsKey` hashes their paths, `rulesKey`
 * names the file purpose rules that were last found to pick exactly those.
 */
export type SourceFilesStamp = {
  readonly rulesKey: string;
  readonly pathsKey: string;
};

type CollectorSidecar = {
  readonly collector: string;
  /** Human-readable version — kept for inspection; `cacheKey` is the real key. */
  readonly version: string;
  /** Cache fingerprint (version + relevant config) that decides re-collection. */
  readonly cacheKey: string;
  /** Present for collectors that scan source files. */
  readonly sourceFiles?: SourceFilesStamp;
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

/**
 * Writes beside the target, then renames over it. A scan cut short (Ctrl+C, a
 * CI step timeout) or a copy of the catalog taken mid-scan (a CI cache save)
 * then sees either the previous file or the complete new one, never a
 * truncated one. A temporary file a cut-short write leaves behind is reused by
 * the next write of the same file.
 */
const writeText = (filePath: string, text: string) =>
  Effect.tryPromise(async () => {
    const temporaryPath = `${filePath}.tmp`;
    await writeFile(temporaryPath, text, "utf8");
    await rename(temporaryPath, filePath);
  });

const writeJson = (filePath: string, value: unknown) =>
  writeText(filePath, `${JSON.stringify(value, undefined, 2)}\n`);

const readTextIfExists = async (
  filePath: string,
): Promise<string | undefined> => {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
};

const readJsonIfExists = (filePath: string) =>
  Effect.tryPromise(async (): Promise<unknown> => {
    const raw = await readTextIfExists(filePath);
    return raw === undefined ? undefined : JSON.parse(raw);
  });

/**
 * Like {@link readJsonIfExists}, but a file that does not parse reads as
 * missing too. Catalogs written before writes became atomic can hold
 * truncated files, and failing on one would fail every scan from then on.
 */
const readJsonIfIntact = (filePath: string) =>
  Effect.tryPromise(async (): Promise<unknown> => {
    const raw = await readTextIfExists(filePath);
    try {
      return raw === undefined ? undefined : JSON.parse(raw);
    } catch {
      return undefined;
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
export const openCatalog = Effect.fn("openCatalog")(function* ({
  repoRoot,
  catalogPath,
}: {
  readonly repoRoot: string;
  readonly catalogPath: string;
}): Effect.fn.Return<Catalog, Error> {
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

/**
 * Reads the cache fingerprint recorded in a collector's sidecar, if any. A
 * truncated sidecar has none, so the commit is collected afresh.
 */
export const readCollectorCacheKey = (
  catalog: Catalog,
  sha: string,
  collectorName: string,
): Effect.Effect<unknown, Error> =>
  readJsonIfIntact(
    path.join(collectorDir(catalog, sha, collectorName), "collector.json"),
  ).pipe(Effect.map(cacheKeyOf));

const sidecarPath = (catalog: Catalog, sha: string, collectorName: string) =>
  path.join(collectorDir(catalog, sha, collectorName), "collector.json");

const sourceFilesStampOf = (sidecar: unknown): unknown =>
  Predicate.isObject(sidecar) ? sidecar["sourceFiles"] : undefined;

/**
 * A (commit, collector) pair is done when a sidecar recording the current cache
 * fingerprint exists. `cacheKey` folds in the collector version and any config
 * it depends on, so a version bump or a relevant config change re-collects it.
 * A collector that scans source files must also have been run, or confirmed, for
 * the current file purpose rules; `scan` can confirm one with
 * {@link readSourceFilesPathsKey}, while a read-only caller takes it as pending.
 */
export const isCollected = (
  catalog: Catalog,
  sha: string,
  collector: Collector,
  cacheKey: string,
  sourceRulesKey: string,
): Effect.Effect<boolean, Error> =>
  readJsonIfIntact(sidecarPath(catalog, sha, collector.name)).pipe(
    Effect.map((sidecar) => {
      if (cacheKeyOf(sidecar) !== cacheKey) {
        return false;
      }
      if (!collector.scansSourceFiles) {
        return true;
      }
      const stamp = sourceFilesStampOf(sidecar);
      return Predicate.isObject(stamp) && stamp["rulesKey"] === sourceRulesKey;
    }),
  );

/**
 * The hash of the source files an output of the current fingerprint covers, if
 * there is such an output.
 */
export const readSourceFilesPathsKey = (
  catalog: Catalog,
  sha: string,
  collector: Collector,
  cacheKey: string,
): Effect.Effect<unknown, Error> =>
  readJsonIfIntact(sidecarPath(catalog, sha, collector.name)).pipe(
    Effect.map((sidecar) => {
      const stamp = sourceFilesStampOf(sidecar);
      return cacheKeyOf(sidecar) === cacheKey && Predicate.isObject(stamp)
        ? stamp["pathsKey"]
        : undefined;
    }),
  );

/**
 * Records that new rules pick the very source files an output already covers, so
 * the next scan need not list the commit's tree to find that out again.
 */
export const confirmSourceRules = (
  catalog: Catalog,
  sha: string,
  collector: Collector,
  sourceFiles: SourceFilesStamp,
): Effect.Effect<void, Error> => {
  const filePath = sidecarPath(catalog, sha, collector.name);
  return readJsonIfIntact(filePath).pipe(
    Effect.flatMap((sidecar) =>
      writeJson(filePath, {
        ...(Predicate.isObject(sidecar) && sidecar),
        sourceFiles,
      }),
    ),
  );
};

export const writeCollectorOutput = Effect.fn("writeCollectorOutput")(
  function* ({
    catalog,
    sha,
    collector,
    cacheKey,
    sourceFiles,
    output,
    durationMs,
  }: {
    readonly catalog: Catalog;
    readonly sha: string;
    readonly collector: Collector;
    readonly cacheKey: string;
    readonly sourceFiles?: SourceFilesStamp | undefined;
    readonly output: unknown;
    readonly durationMs: number;
  }): Effect.fn.Return<void, Error> {
    const dir = collectorDir(catalog, sha, collector.name);
    yield* Effect.tryPromise(() => mkdir(dir, { recursive: true }));
    // Unindented: indenting would inflate path-keyed survival rows several times.
    yield* writeText(path.join(dir, "output.json"), JSON.stringify(output));
    const now = yield* DateTime.now;
    yield* writeJson(path.join(dir, "collector.json"), {
      collector: collector.name,
      version: collector.version,
      cacheKey,
      ...(sourceFiles !== undefined && { sourceFiles }),
      completedAt: DateTime.formatIso(now),
      durationMs,
    } satisfies CollectorSidecar);
  },
);
