import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { catalogDirName, openCatalog } from "./catalog.ts";

const legacyCatalogDirName = ".repo-insighter";

function makeRepoRoot() {
  return mkdtempSync(path.join(os.tmpdir(), "repo-dive-catalog-"));
}

function writeCatalogManifest(repoRoot: string, dirName: string) {
  const dir = path.join(repoRoot, dirName);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, "catalog.json"),
    `${JSON.stringify({ formatVersion: 1, vcs: "git", createdAt: new Date().toISOString() })}\n`,
    "utf8",
  );
  return dir;
}

const cleanup = (repoRoot: string) =>
  Effect.sync(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

it.effect("openCatalog scaffolds a self-ignoring catalog", () => {
  const repoRoot = makeRepoRoot();

  return Effect.gen(function* () {
    const catalog = yield* openCatalog(repoRoot);

    expect(catalog.rootPath).toBe(path.join(repoRoot, catalogDirName));
    expect(existsSync(path.join(catalog.rootPath, "catalog.json"))).toBe(true);
    expect(existsSync(path.join(catalog.rootPath, ".gitignore"))).toBe(true);
  }).pipe(Effect.ensuring(cleanup(repoRoot)));
});

it.effect("openCatalog points at a catalog left by the former name", () => {
  const repoRoot = makeRepoRoot();

  return Effect.gen(function* () {
    writeCatalogManifest(repoRoot, legacyCatalogDirName);

    const error = yield* Effect.flip(openCatalog(repoRoot));
    expect(error.message).toMatch(/left by repo-insighter/);
    // Bailing out must not leave a half-made catalog that hides the old one.
    expect(existsSync(path.join(repoRoot, catalogDirName))).toBe(false);
  }).pipe(Effect.ensuring(cleanup(repoRoot)));
});

it.effect(
  "openCatalog ignores the former name once the catalog is renamed",
  () => {
    const repoRoot = makeRepoRoot();

    return Effect.gen(function* () {
      writeCatalogManifest(repoRoot, legacyCatalogDirName);
      writeCatalogManifest(repoRoot, catalogDirName);

      const catalog = yield* openCatalog(repoRoot);
      expect(catalog.rootPath).toBe(path.join(repoRoot, catalogDirName));
    }).pipe(Effect.ensuring(cleanup(repoRoot)));
  },
);
