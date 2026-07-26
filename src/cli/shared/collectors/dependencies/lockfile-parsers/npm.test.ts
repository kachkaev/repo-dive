import { expect, test } from "vitest";

import { parseNpmLockfile } from "./npm.ts";

test("parseNpmLockfile reads a v3 packages map, excluding workspace links", () => {
  // The workspace's node_modules entry is a symlink and must not be counted as
  // a resolved package; importer entries (root + workspace) are not resolved.
  const summary = parseNpmLockfile(
    JSON.stringify({
      name: "root",
      lockfileVersion: 3,
      requires: true,
      packages: {
        "": {
          name: "root",
          dependencies: { lodash: "^4" },
          devDependencies: { typescript: "^5" },
        },
        "packages/app": { name: "app", dependencies: { react: "^19" } },
        "node_modules/app": { resolved: "packages/app", link: true },
        "node_modules/lodash": { version: "4.17.21" },
        "node_modules/typescript": { version: "5.9.0" },
        "node_modules/react": { version: "19.2.0" },
      },
    }),
  );

  expect(summary).toStrictEqual({
    packageManager: "npm",
    lockfileVersion: "3",
    resolvedCount: 3,
  });
});

test("parseNpmLockfile counts the nested tree of a legacy v1 lockfile", () => {
  // v1 records the resolved graph as a nested tree.
  const summary = parseNpmLockfile(
    JSON.stringify({
      name: "old",
      version: "1.0.0",
      lockfileVersion: 1,
      dependencies: {
        lodash: { version: "4.17.21" },
        chalk: {
          version: "2.4.2",
          dependencies: { "ansi-styles": { version: "3.2.1" } },
        },
      },
    }),
  );

  expect(summary).toStrictEqual({
    packageManager: "npm",
    lockfileVersion: "1",
    resolvedCount: 3,
  });
});

test("parseNpmLockfile returns undefined for non-lockfile JSON", () => {
  expect(parseNpmLockfile("not json {")).toBeUndefined();
  expect(parseNpmLockfile(JSON.stringify({ name: "x" }))).toBeUndefined();
});
