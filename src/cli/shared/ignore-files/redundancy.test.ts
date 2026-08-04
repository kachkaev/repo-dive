import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { expect, it, test } from "@effect/vitest";
import { Effect } from "effect";

import {
  readRepoSetup,
  redundancyReason,
  type RepoSetup,
} from "./redundancy.ts";

const setupIn = (
  manifest: unknown,
  rootFileNames: readonly string[] = [".gitignore", "package.json"],
) =>
  Effect.gen(function* () {
    const repoRoot = mkdtempSync(path.join(os.tmpdir(), "repo-dive-setup-"));
    try {
      if (manifest !== undefined) {
        writeFileSync(
          path.join(repoRoot, "package.json"),
          typeof manifest === "string" ? manifest : JSON.stringify(manifest),
          "utf8",
        );
      }
      return yield* readRepoSetup({ repoRoot, rootFileNames });
    } finally {
      rmSync(repoRoot, { force: true, recursive: true });
    }
  });

const baseSetup: RepoSetup = {
  hasGitignore: true,
  npmPacksByAllowList: false,
  eslintUsesFlatConfig: false,
  prettierMajor: undefined,
  prettierIgnorePathOverridden: false,
};

it.effect("readRepoSetup reads what the rules ask about", () =>
  Effect.gen(function* () {
    expect(
      yield* setupIn({
        files: ["dist/"],
        devDependencies: { eslint: "^9.39.5", prettier: "3.9.6" },
      }),
    ).toEqual({
      hasGitignore: true,
      npmPacksByAllowList: true,
      eslintUsesFlatConfig: true,
      prettierMajor: 3,
      prettierIgnorePathOverridden: false,
    });

    expect(
      yield* setupIn({
        dependencies: { prettier: "~2.8.8", eslint: "8.57.0" },
        scripts: { format: "prettier --ignore-path .prettierignore --write ." },
      }),
    ).toEqual({
      hasGitignore: true,
      npmPacksByAllowList: false,
      eslintUsesFlatConfig: false,
      prettierMajor: 2,
      prettierIgnorePathOverridden: true,
    });
  }),
);

it.effect("readRepoSetup takes a flat eslint config as the answer", () =>
  Effect.gen(function* () {
    // The config file settles it whatever package.json says — eslint 8 opts in
    // to flat config too, and monorepo roots often declare no eslint at all.
    const setup = yield* setupIn(undefined, [
      ".eslintignore",
      "eslint.config.mjs",
    ]);
    expect(setup.eslintUsesFlatConfig).toBe(true);
    expect(setup.hasGitignore).toBe(false);
  }),
);

it.effect("readRepoSetup answers no to everything it cannot read", () =>
  Effect.gen(function* () {
    for (const manifest of [undefined, "{ not json", "[]"]) {
      expect(yield* setupIn(manifest)).toEqual(baseSetup);
    }
    // A range with no version in it pins nothing.
    expect(
      (yield* setupIn({ devDependencies: { prettier: "catalog:" } }))
        .prettierMajor,
    ).toBeUndefined();
  }),
);

test("redundancyReason leaves .prettierignore to .gitignore", () => {
  expect(redundancyReason({ name: ".prettierignore", setup: baseSetup })).toBe(
    "prettier reads .gitignore as well",
  );
  // Nothing to defer to, or a prettier too old to defer to it.
  expect(
    redundancyReason({
      name: ".prettierignore",
      setup: { ...baseSetup, hasGitignore: false },
    }),
  ).toBeUndefined();
  expect(
    redundancyReason({
      name: ".prettierignore",
      setup: { ...baseSetup, prettierMajor: 2 },
    }),
  ).toBeUndefined();
  // A repository that names prettier's ignore files itself is not deferring to
  // .gitignore, whatever prettier would have done on its own.
  expect(
    redundancyReason({
      name: ".prettierignore",
      setup: { ...baseSetup, prettierIgnorePathOverridden: true },
    }),
  ).toBeUndefined();
});

test("redundancyReason lets package.json speak for npm and eslint", () => {
  expect(
    redundancyReason({
      name: ".npmignore",
      setup: { ...baseSetup, npmPacksByAllowList: true },
    }),
  ).toMatch(/"files"/);
  expect(redundancyReason({ name: ".npmignore", setup: baseSetup })).toBe(
    undefined,
  );

  expect(
    redundancyReason({
      name: ".eslintignore",
      setup: { ...baseSetup, eslintUsesFlatConfig: true },
    }),
  ).toMatch(/flat config/);
  expect(redundancyReason({ name: ".eslintignore", setup: baseSetup })).toBe(
    undefined,
  );
});

test("redundancyReason knows nothing about ignore files it has no rule for", () => {
  for (const name of [".gitignore", ".dockerignore", ".markdownlintignore"]) {
    expect(redundancyReason({ name, setup: baseSetup }), name).toBeUndefined();
  }
});
