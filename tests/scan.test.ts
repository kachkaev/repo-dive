import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { Effect } from "effect";
import { expect, test } from "vitest";

import {
  listCommits,
  listFirstParentShas,
  parseGitLog,
  summarizeCommits,
} from "../src/lib/scan.ts";

const separator = "\u001F";

const sampleLog = [
  [
    "aaa111",
    "Alice",
    "alice@example.com",
    "2026-02-03T04:05:06+00:00",
    "Add feature",
  ].join(separator),
  [
    "bbb222",
    "Bob",
    "bob@example.com",
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
    subject: "Add feature",
  });
});

test("parseGitLog skips blank lines", () => {
  expect(parseGitLog("\n\n")).toStrictEqual([]);
});

test("summarizeCommits aggregates counts and date range", () => {
  const summary = summarizeCommits(parseGitLog(sampleLog));

  expect(summary).toStrictEqual({
    commitCount: 2,
    authorCount: 2,
    firstCommitDate: "2026-01-01T00:00:00+00:00",
    lastCommitDate: "2026-02-03T04:05:06+00:00",
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

function git(cwd: string, ...args: readonly string[]) {
  const result = spawnSync(
    "git",
    ["-c", "user.email=test@example.com", "-c", "user.name=Test", ...args],
    { cwd, encoding: "utf8" },
  );
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}

function commitFile(repoPath: string, name: string, message: string) {
  writeFileSync(path.join(repoPath, name), `${message}\n`);
  git(repoPath, "add", ".");
  git(repoPath, "commit", "-m", message);
  return git(repoPath, "rev-parse", "HEAD");
}

test("listFirstParentShas keeps the mainline and drops merged-in history", async () => {
  const repoPath = mkdtempSync(path.join(os.tmpdir(), "repo-dive-fp-"));

  try {
    git(repoPath, "init", "-b", "main");
    const base = commitFile(repoPath, "main.txt", "Base");

    // A foreign history absorbed by an unrelated-histories merge — exactly the
    // shape that used to put cliffs into every snapshot timeline.
    git(repoPath, "checkout", "--orphan", "foreign");
    git(repoPath, "rm", "-rf", ".");
    const foreign = commitFile(repoPath, "foreign.txt", "Foreign");

    git(repoPath, "checkout", "main");
    git(repoPath, "merge", "--no-ff", "--allow-unrelated-histories", "foreign");
    const merge = git(repoPath, "rev-parse", "HEAD");

    const all = await Effect.runPromise(listCommits(repoPath));
    const firstParent = await Effect.runPromise(listFirstParentShas(repoPath));

    expect(all.map((commit) => commit.hash).toSorted()).toStrictEqual(
      [base, foreign, merge].toSorted(),
    );
    expect([...firstParent].toSorted()).toStrictEqual([base, merge].toSorted());
  } finally {
    rmSync(repoPath, { recursive: true, force: true });
  }
});

test("listFirstParentShas is empty for a repo without commits", async () => {
  const repoPath = mkdtempSync(path.join(os.tmpdir(), "repo-dive-fp-"));

  try {
    git(repoPath, "init", "-b", "main");
    expect(
      await Effect.runPromise(listFirstParentShas(repoPath)),
    ).toStrictEqual(new Set());
  } finally {
    rmSync(repoPath, { recursive: true, force: true });
  }
});
