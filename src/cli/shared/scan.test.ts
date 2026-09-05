import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { NodeServices } from "@effect/platform-node";
import { expect, it, test } from "@effect/vitest";
import { Effect } from "effect";

import {
  listCommits,
  listLineages,
  listMainlineShas,
  parseGitLog,
  summarizeCommits,
} from "./scan.ts";

const separator = "\u{1F}";

const sampleLog = [
  [
    "aaa111",
    "Alice",
    "alice@example.com",
    "2026-02-03T04:05:06+00:00",
    // Rebased before landing, so it committed a fortnight after it was written
    "2026-02-17T09:00:00+00:00",
    "Add feature",
  ].join(separator),
  [
    "bbb222",
    "Bob",
    "bob@example.com",
    "2026-01-01T00:00:00+00:00",
    "2026-01-01T00:00:00+00:00",
    "Initial commit",
  ].join(separator),
  "",
].join("\n");

test("parseGitLog extracts commit metadata", () => {
  const commits = parseGitLog(sampleLog);

  expect(commits.length).toBe(2);
  expect(commits[0]).toStrictEqual({
    hash: "aaa111",
    authorName: "Alice",
    authorEmail: "alice@example.com",
    authorDate: "2026-02-03T04:05:06+00:00",
    committerDate: "2026-02-17T09:00:00+00:00",
    subject: "Add feature",
  });
});

test("parseGitLog skips blank lines", () => {
  expect(parseGitLog("\n\n")).toStrictEqual([]);
});

test("summarizeCommits spans the outer edges of both clocks", () => {
  const summary = summarizeCommits(parseGitLog(sampleLog));

  expect(summary).toStrictEqual({
    commitCount: 2,
    authorCount: 2,
    firstCommitDate: "2026-01-01T00:00:00+00:00",
    // The newest commit was authored on 2026-02-03 and landed a fortnight
    // later; the range has to reach the later of the two, so the
    // committer-dated timelines fit inside it.
    lastCommitDate: "2026-02-17T09:00:00+00:00",
  });
});

test("summarizeCommits handles an empty history", () => {
  expect(summarizeCommits([])).toStrictEqual({
    commitCount: 0,
    authorCount: 0,
    firstCommitDate: undefined,
    lastCommitDate: undefined,
  });
});

test("summarizeCommits reaches back to the earliest author date", () => {
  // An imported commit: written long before the history it was grafted into,
  // so the author date is the outer edge at the start and the calendar has to
  // reach it.
  const imported = [
    [
      "ccc333",
      "Carol",
      "carol@example.com",
      "2019-05-05T12:00:00+00:00",
      "2026-01-05T12:00:00+00:00",
      "Import",
    ].join(separator),
    "",
  ].join("\n");

  expect(summarizeCommits(parseGitLog(imported))).toMatchObject({
    firstCommitDate: "2019-05-05T12:00:00+00:00",
    lastCommitDate: "2026-01-05T12:00:00+00:00",
  });
});

test("summarizeCommits compares instants, not strings", () => {
  // Lexicographically "2026-01-01T01:00:00+05:00" sorts after
  // "2026-01-01T00:00:00-05:00", but it is the earlier instant by nine hours.
  const skewed = [
    [
      "d4d4d4",
      "Dan",
      "dan@example.com",
      "2026-01-01T01:00:00+05:00",
      "2026-01-01T01:00:00+05:00",
      "East",
    ].join(separator),
    [
      "e5e5e5",
      "Erin",
      "erin@example.com",
      "2026-01-01T00:00:00-05:00",
      "2026-01-01T00:00:00-05:00",
      "West",
    ].join(separator),
    "",
  ].join("\n");

  expect(summarizeCommits(parseGitLog(skewed))).toMatchObject({
    firstCommitDate: "2026-01-01T01:00:00+05:00",
    lastCommitDate: "2026-01-01T00:00:00-05:00",
  });
});

function git(
  cwd: string,
  args: readonly string[],
  options?: { readonly isoDate?: string | undefined },
) {
  const result = spawnSync(
    "git",
    ["-c", "user.email=test@example.com", "-c", "user.name=Test", ...args],
    {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        ...(options?.isoDate && {
          GIT_AUTHOR_DATE: options.isoDate,
          GIT_COMMITTER_DATE: options.isoDate,
        }),
      },
    },
  );
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}

function commitFile(
  repoPath: string,
  name: string,
  message: string,
  isoDate?: string,
) {
  writeFileSync(path.join(repoPath, name), `${message}\n`);
  git(repoPath, ["add", "."]);
  git(repoPath, ["commit", "-m", message], { isoDate });
  return git(repoPath, ["rev-parse", "HEAD"]);
}

/** An orphan branch holding its own unrelated history. */
function orphanBranch(repoPath: string, name: string) {
  git(repoPath, ["checkout", "--orphan", name]);
  git(repoPath, ["rm", "-rf", "."]);
}

it.effect(
  "listMainlineShas keeps the mainline and drops merged-in history",
  () => {
    const repoPath = mkdtempSync(path.join(os.tmpdir(), "repo-dive-fp-"));

    return Effect.gen(function* () {
      git(repoPath, ["init", "-b", "main"]);
      const base = commitFile(
        repoPath,
        "main.txt",
        "Base",
        "2026-01-01T00:00:00Z",
      );

      // A foreign history absorbed by an unrelated-histories merge while the
      // repository already existed — exactly the shape that used to put cliffs
      // into every snapshot timeline.
      orphanBranch(repoPath, "foreign");
      const foreign = commitFile(
        repoPath,
        "foreign.txt",
        "Foreign",
        "2026-02-01T00:00:00Z",
      );

      git(repoPath, ["checkout", "main"]);
      git(repoPath, [
        "merge",
        "--no-ff",
        "--allow-unrelated-histories",
        "foreign",
      ]);
      const merge = git(repoPath, ["rev-parse", "HEAD"]);

      const all = yield* listCommits(repoPath);
      const mainline = yield* listMainlineShas(repoPath);

      expect(all.map((commit) => commit.hash).toSorted()).toStrictEqual(
        [base, foreign, merge].toSorted(),
      );
      expect([...mainline].toSorted()).toStrictEqual([base, merge].toSorted());
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          rmSync(repoPath, { recursive: true, force: true });
        }),
      ),
      Effect.provide(NodeServices.layer),
    );
  },
);

it.effect(
  "listLineages turns every history absorbed by a founding graft into a lineage",
  () => {
    const repoPath = mkdtempSync(path.join(os.tmpdir(), "repo-dive-fp-"));

    return Effect.gen(function* () {
      // The project's previous life: a history that predates the migration.
      git(repoPath, ["init", "-b", "old"]);
      const old1 = commitFile(
        repoPath,
        "old.txt",
        "Old start",
        "2020-01-01T00:00:00Z",
      );
      const old2 = commitFile(
        repoPath,
        "old.txt",
        "Old end",
        "2020-06-01T00:00:00Z",
      );

      // A sibling repository absorbed by the same migration — also older than
      // the new root, but reaching back less far, so not the continuation.
      orphanBranch(repoPath, "plugin");
      const plugin1 = commitFile(
        repoPath,
        "plugin.txt",
        "Plugin start",
        "2022-03-01T00:00:00Z",
      );
      const plugin2 = commitFile(
        repoPath,
        "plugin.txt",
        "Plugin end",
        "2023-01-01T00:00:00Z",
      );

      // The migration: a fresh root followed immediately by merges absorbing
      // the previous histories (effect's monorepo assembly did exactly this).
      orphanBranch(repoPath, "main");
      const skeleton = commitFile(
        repoPath,
        "skeleton.txt",
        "Workspace skeleton",
        "2024-01-01T00:00:00Z",
      );
      git(
        repoPath,
        ["merge", "--no-ff", "--allow-unrelated-histories", "old"],
        { isoDate: "2024-01-01T00:01:00Z" },
      );
      const mergeOld = git(repoPath, ["rev-parse", "HEAD"]);
      git(
        repoPath,
        ["merge", "--no-ff", "--allow-unrelated-histories", "plugin"],
        { isoDate: "2024-01-01T00:02:00Z" },
      );
      const mergePlugin = git(repoPath, ["rev-parse", "HEAD"]);
      const later = commitFile(
        repoPath,
        "later.txt",
        "Later",
        "2024-02-01T00:00:00Z",
      );

      const all = yield* listCommits(repoPath);
      const lineages = yield* listLineages(repoPath);
      const mainline = yield* listMainlineShas(repoPath);

      expect(all.length).toBe(8);
      // Both absorbed histories become lineages — before the migration they
      // were the project's parallel parts, so composed timelines sum them.
      // The assembly commits — the skeleton root and the founding merges —
      // hold half-assembled workspaces, so they belong to no lineage and the
      // composed timeline steps from the absorbed tips straight to the first
      // post-assembly commit.
      expect([...mainline].toSorted()).toStrictEqual(
        [later, old1, old2, plugin1, plugin2].toSorted(),
      );
      for (const sha of [skeleton, mergeOld, mergePlugin]) {
        expect(mainline.has(sha)).toBe(false);
      }

      const laterMs = Date.parse("2024-02-01T00:00:00Z");
      expect(
        lineages
          .map((lineage) => ({
            shas: [...lineage.shas].toSorted(),
            endsAtMs: lineage.endsAtMs,
          }))
          .toSorted((left, right) =>
            (left.shas[0] ?? "") < (right.shas[0] ?? "") ? -1 : 1,
          ),
      ).toStrictEqual(
        [
          // HEAD's own lineage never stops contributing…
          { shas: [later], endsAtMs: Infinity },
          // …while each absorbed one ends the instant the assembly completes,
          // i.e. at the first post-assembly commit.
          { shas: [old1, old2].toSorted(), endsAtMs: laterMs },
          { shas: [plugin1, plugin2].toSorted(), endsAtMs: laterMs },
        ].toSorted((left, right) =>
          (left.shas[0] ?? "") < (right.shas[0] ?? "") ? -1 : 1,
        ),
      );
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          rmSync(repoPath, { recursive: true, force: true });
        }),
      ),
      Effect.provide(NodeServices.layer),
    );
  },
);

it.effect(
  "listMainlineShas does not follow a graft merged after the root's own life began",
  () => {
    const repoPath = mkdtempSync(path.join(os.tmpdir(), "repo-dive-fp-"));

    return Effect.gen(function* () {
      git(repoPath, ["init", "-b", "main"]);
      const base = commitFile(
        repoPath,
        "main.txt",
        "Base",
        "2024-01-01T00:00:00Z",
      );
      const feature = commitFile(
        repoPath,
        "feature.txt",
        "Feature",
        "2024-02-01T00:00:00Z",
      );

      // A vendored library with genuinely old history: its dates predate the
      // root, but the merge sits mid-life (above an ordinary commit), so it is
      // an absorption, not a founding graft.
      orphanBranch(repoPath, "vendor");
      const vendor = commitFile(
        repoPath,
        "vendor.txt",
        "Vendored",
        "2019-01-01T00:00:00Z",
      );

      git(repoPath, ["checkout", "main"]);
      git(
        repoPath,
        ["merge", "--no-ff", "--allow-unrelated-histories", "vendor"],
        { isoDate: "2024-03-01T00:00:00Z" },
      );
      const merge = git(repoPath, ["rev-parse", "HEAD"]);

      const mainline = yield* listMainlineShas(repoPath);

      expect([...mainline].toSorted()).toStrictEqual(
        [base, feature, merge].toSorted(),
      );
      expect(mainline.has(vendor)).toBe(false);
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          rmSync(repoPath, { recursive: true, force: true });
        }),
      ),
      Effect.provide(NodeServices.layer),
    );
  },
);

it.effect("listMainlineShas is empty for a repo without commits", () => {
  const repoPath = mkdtempSync(path.join(os.tmpdir(), "repo-dive-fp-"));

  return Effect.gen(function* () {
    git(repoPath, ["init", "-b", "main"]);
    expect(yield* listMainlineShas(repoPath)).toStrictEqual(new Set());
  }).pipe(
    Effect.ensuring(
      Effect.sync(() => {
        rmSync(repoPath, { recursive: true, force: true });
      }),
    ),
    Effect.provide(NodeServices.layer),
  );
});
