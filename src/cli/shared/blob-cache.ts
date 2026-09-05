import { existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * Content-addressed cache for per-blob collector results. Identical blobs
 * appear in thousands of commits, so content-derived metrics (directives,
 * todo counts, …) are computed once per blob instead of once per commit.
 * Lives under the catalog's cache/ folder and is safe to delete at any time.
 */
export type BlobCache = {
  readonly getMany: (
    collector: string,
    cacheKey: string,
    blobShas: readonly string[],
  ) => Map<string, string>;
  readonly setMany: (
    collector: string,
    cacheKey: string,
    entries: ReadonlyMap<string, string>,
  ) => void;
};

const openCaches = new Map<
  string,
  { readonly db: DatabaseSync; readonly cache: BlobCache }
>();

/** Bump when the table shape changes; a mismatch drops the cache and rebuilds. */
const schemaVersion = 2;

const blobCachePath = (catalogPath: string) =>
  path.join(catalogPath, "cache", "blob-cache.sqlite");

export const getBlobCache = (catalogPath: string): BlobCache => {
  const existing = openCaches.get(catalogPath);
  if (existing) {
    return existing.cache;
  }

  const cacheDir = path.join(catalogPath, "cache");
  mkdirSync(cacheDir, { recursive: true });
  const db = new DatabaseSync(blobCachePath(catalogPath));
  db.exec("PRAGMA journal_mode = WAL");
  // The result column is content-derived and cheap to recompute, so on any
  // schema change we simply drop it rather than migrate.
  const storedSchema = db.prepare("PRAGMA user_version").get();
  if (Number(storedSchema?.["user_version"] ?? 0) !== schemaVersion) {
    db.exec("DROP TABLE IF EXISTS blob_results");
    // eslint-disable-next-line unicorn/no-unsafe-sqlite-interpolation -- PRAGMA statements cannot take bound parameters, and schemaVersion is a module constant, not input
    db.exec(`PRAGMA user_version = ${schemaVersion}`);
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS blob_results (
      collector TEXT NOT NULL,
      cache_key TEXT NOT NULL,
      blob_sha TEXT NOT NULL,
      result TEXT NOT NULL,
      PRIMARY KEY (collector, cache_key, blob_sha)
    )
  `);
  const selectOne = db.prepare(
    "SELECT result FROM blob_results WHERE collector = ? AND cache_key = ? AND blob_sha = ?",
  );
  const insertOne = db.prepare(
    "INSERT OR REPLACE INTO blob_results (collector, cache_key, blob_sha, result) VALUES (?, ?, ?, ?)",
  );

  const cache: BlobCache = {
    getMany: (collector, cacheKey, blobShas) => {
      const results = new Map<string, string>();
      for (const blobSha of blobShas) {
        const row = selectOne.get(collector, cacheKey, blobSha);
        const result =
          row && typeof row["result"] === "string" ? row["result"] : undefined;
        if (result !== undefined) {
          results.set(blobSha, result);
        }
      }
      return results;
    },
    setMany: (collector, cacheKey, entries) => {
      if (entries.size === 0) {
        return;
      }
      db.exec("BEGIN");
      try {
        for (const [blobSha, result] of entries) {
          insertOne.run(collector, cacheKey, blobSha, result);
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
  openCaches.set(catalogPath, { db, cache });
  return cache;
};

/**
 * One namespace of the cache: everything a single collector wrote under a
 * single fingerprint. Lookups are keyed by the pair, so a namespace whose
 * fingerprint no longer matches any registered collector can never be hit
 * again — which is what makes it collectable.
 */
export type BlobCacheNamespace = {
  readonly collector: string;
  readonly cacheKey: string;
  readonly entryCount: number;
};

/** Bytes the cache occupies, counting the write-ahead log SQLite keeps beside it. */
const blobCacheSizeBytes = (catalogPath: string): number => {
  const base = blobCachePath(catalogPath);
  return ["", "-wal", "-shm"]
    .map((suffix) => `${base}${suffix}`)
    .reduce(
      (total, filePath) =>
        total + (existsSync(filePath) ? statSync(filePath).size : 0),
      0,
    );
};

/** Opens the cache file for maintenance, or `undefined` when there is none. */
const openForMaintenance = (catalogPath: string): DatabaseSync | undefined => {
  const filePath = blobCachePath(catalogPath);
  if (!existsSync(filePath)) {
    return undefined;
  }
  // A connection this process opened earlier would hold locks that block
  // VACUUM, and would keep serving rows this call is about to delete.
  const open = openCaches.get(catalogPath);
  if (open) {
    open.db.close();
    openCaches.delete(catalogPath);
  }
  const db = new DatabaseSync(filePath);
  const table = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'blob_results'",
    )
    .get();
  if (!table) {
    db.close();
    return undefined;
  }
  return db;
};

/** What the cache currently holds, one row per (collector, fingerprint) pair. */
export const listBlobCacheNamespaces = (
  catalogPath: string,
): BlobCacheNamespace[] => {
  const db = openForMaintenance(catalogPath);
  if (!db) {
    return [];
  }
  try {
    return db
      .prepare(
        "SELECT collector, cache_key, count(*) AS entry_count FROM blob_results GROUP BY collector, cache_key",
      )
      .all()
      .flatMap((row) => {
        const collector = row["collector"];
        const cacheKey = row["cache_key"];
        return typeof collector === "string" && typeof cacheKey === "string"
          ? [{ collector, cacheKey, entryCount: Number(row["entry_count"]) }]
          : [];
      });
  } finally {
    db.close();
  }
};

/**
 * Deletes the given namespaces and compacts the file, returning how many bytes
 * that gave back. Entries are content-derived, so removing them costs at most
 * a re-scan of the blobs involved — never any recorded data.
 */
export const pruneBlobCacheNamespaces = (
  catalogPath: string,
  namespaces: ReadonlyArray<{
    readonly collector: string;
    readonly cacheKey: string;
  }>,
): number => {
  if (namespaces.length === 0) {
    return 0;
  }
  const sizeBefore = blobCacheSizeBytes(catalogPath);
  const db = openForMaintenance(catalogPath);
  if (!db) {
    return 0;
  }
  try {
    const namespaceDeletion = db.prepare(
      "DELETE FROM blob_results WHERE collector = ? AND cache_key = ?",
    );
    db.exec("BEGIN");
    try {
      for (const { collector, cacheKey } of namespaces) {
        namespaceDeletion.run(collector, cacheKey);
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    // Deleting only frees pages inside the file; VACUUM is what shrinks it.
    db.exec("VACUUM");
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  } finally {
    db.close();
  }
  return Math.max(0, sizeBefore - blobCacheSizeBytes(catalogPath));
};
