import { expect, test } from "vitest";

import { parsePnpmLockfile } from "./pnpm.ts";

test("parsePnpmLockfile counts resolved packages, version-aware", () => {
  // A monorepo: React 19 in one package, React 18 in another → two resolved
  // versions of react, counted separately.
  const summary = parsePnpmLockfile(
    [
      "lockfileVersion: '9.0'",
      "",
      "importers:",
      "",
      "  .:",
      "    dependencies:",
      "      react:",
      "        specifier: ^19",
      "        version: 19.2.0",
      "    devDependencies:",
      "      typescript:",
      "        specifier: '5'",
      "        version: 5.9.0",
      "",
      "  packages/legacy:",
      "    dependencies:",
      "      react:",
      "        specifier: ^18",
      "        version: 18.3.1",
      "    optionalDependencies:",
      "      fsevents:",
      "        specifier: ^2",
      "        version: 2.3.3",
      "",
      "packages:",
      "",
      "  react@19.2.0: {}",
      "  react@18.3.1: {}",
      "  typescript@5.9.0: {}",
      "  fsevents@2.3.3: {}",
    ].join("\n"),
  );

  expect(summary).toStrictEqual({
    packageManager: "pnpm",
    lockfileVersion: "9.0",
    resolvedCount: 4,
  });
});

test("parsePnpmLockfile skips pnpm's package-manager document", () => {
  // First document manages pnpm itself; only the second is a real lockfile.
  const summary = parsePnpmLockfile(
    [
      "lockfileVersion: '9.0'",
      "",
      "importers:",
      "",
      "  .:",
      "    configDependencies: {}",
      "    packageManagerDependencies:",
      "      pnpm:",
      "        specifier: 11.15.0",
      "        version: 11.15.0",
      "",
      "packages:",
      "",
      "  pnpm@11.15.0: {}",
      "",
      "---",
      "lockfileVersion: '9.0'",
      "",
      "importers:",
      "",
      "  .:",
      "    dependencies:",
      "      lodash:",
      "        specifier: ^4",
      "        version: 4.17.21",
      "",
      "packages:",
      "",
      "  lodash@4.17.21: {}",
    ].join("\n"),
  );

  expect(summary).toStrictEqual({
    packageManager: "pnpm",
    lockfileVersion: "9.0",
    resolvedCount: 1,
  });
});

test("parsePnpmLockfile returns undefined for non-lockfile content", () => {
  expect(parsePnpmLockfile("just a string")).toBeUndefined();
});
