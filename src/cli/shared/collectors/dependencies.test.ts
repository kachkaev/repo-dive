import { expect, test } from "vitest";

import { dependenciesCollector } from "./dependencies.ts";

test("dependencies collector normalizes lockfiles and manifests into facts", () => {
  const facts = dependenciesCollector.normalize({
    lockfiles: [
      {
        path: "pnpm-lock.yaml",
        packageManager: "pnpm",
        lockfileVersion: "9.0",
        resolvedCount: 741,
      },
    ],
    manifests: [
      {
        path: "package.json",
        direct: { prod: 4, dev: 36, optional: 0 },
      },
    ],
  });

  expect(facts).toStrictEqual([
    {
      metric: "dependencies.resolved",
      value: 741,
      categories: { packageManager: "pnpm", lockfile: "pnpm-lock.yaml" },
    },
    {
      metric: "dependencies.manifest",
      value: 1,
      categories: { manifest: "package.json" },
    },
    {
      metric: "dependencies.direct",
      value: 4,
      categories: { manifest: "package.json", kind: "prod" },
    },
    {
      metric: "dependencies.direct",
      value: 36,
      categories: { manifest: "package.json", kind: "dev" },
    },
    {
      metric: "dependencies.direct",
      value: 0,
      categories: { manifest: "package.json", kind: "optional" },
    },
  ]);
});

test("dependencies collector marks a scanned tree with no lockfile or manifest", () => {
  const facts = dependenciesCollector.normalize({
    lockfiles: [],
    manifests: [],
  });

  // A single presence marker (and no resolved/direct facts) so indexing can
  // distinguish "scanned, zero dependencies" from a commit that was never
  // scanned — see the dependencies filter in indexing.
  expect(facts).toStrictEqual([{ metric: "dependencies.scanned", value: 1 }]);
});
