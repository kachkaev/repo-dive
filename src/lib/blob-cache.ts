import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { catalogDirName } from "./catalog.ts";

/**
 * Content-addressed cache for per-blob collector results. Identical blobs
 * appear in thousands of commits, so content-derived metrics (directives,
 * todo counts, …) are computed once per blob instead of once per commit.
 * Lives under the catalog's cache/ folder and is safe to delete at any time.
 */
export type BlobCache = {
  readonly getMany: (
    collector: string,
    version: string,
    blobShas: readonly string[],
  ) => Map<string, string>;
  readonly setMany: (
    collector: string,
    version: string,
    entries: ReadonlyMap<string, string>,
  ) => void;
};

const openCaches = new Map<string, BlobCache>();

export const getBlobCache = (repoRoot: string): BlobCache => {
  const existing = openCaches.get(repoRoot);
  if (existing) {
    return existing;
  }

  const cacheDir = path.join(repoRoot, catalogDirName, "cache");
  mkdirSync(cacheDir, { recursive: true });
  const db = new DatabaseSync(path.join(cacheDir, "blob-cache.sqlite"));
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS blob_results (
      collector TEXT NOT NULL,
      version TEXT NOT NULL,
      blob_sha TEXT NOT NULL,
      result TEXT NOT NULL,
      PRIMARY KEY (collector, version, blob_sha)
    )
  `);
  const selectOne = db.prepare(
    "SELECT result FROM blob_results WHERE collector = ? AND version = ? AND blob_sha = ?",
  );
  const insertOne = db.prepare(
    "INSERT OR REPLACE INTO blob_results (collector, version, blob_sha, result) VALUES (?, ?, ?, ?)",
  );

  const cache: BlobCache = {
    getMany: (collector, version, blobShas) => {
      const results = new Map<string, string>();
      for (const blobSha of blobShas) {
        const row = selectOne.get(collector, version, blobSha);
        const result =
          row && typeof row["result"] === "string" ? row["result"] : undefined;
        if (result !== undefined) {
          results.set(blobSha, result);
        }
      }
      return results;
    },
    setMany: (collector, version, entries) => {
      if (entries.size === 0) {
        return;
      }
      db.exec("BEGIN");
      try {
        for (const [blobSha, result] of entries) {
          insertOne.run(collector, version, blobSha, result);
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
  openCaches.set(repoRoot, cache);
  return cache;
};
