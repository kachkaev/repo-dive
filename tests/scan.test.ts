import assert from "node:assert/strict";
import test from "node:test";

import { parseGitLog, summarizeCommits } from "../src/lib/scan.ts";

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

void test("parseGitLog extracts commit metadata", () => {
  const commits = parseGitLog(sampleLog);

  assert.equal(commits.length, 2);
  assert.deepEqual(commits[0], {
    hash: "aaa111",
    authorName: "Alice",
    authorEmail: "alice@example.com",
    authorDate: "2026-02-03T04:05:06+00:00",
    subject: "Add feature",
  });
});

void test("parseGitLog skips blank lines", () => {
  assert.deepEqual(parseGitLog("\n\n"), []);
});

void test("summarizeCommits aggregates counts and date range", () => {
  const summary = summarizeCommits(parseGitLog(sampleLog));

  assert.deepEqual(summary, {
    commitCount: 2,
    authorCount: 2,
    firstCommitDate: "2026-01-01T00:00:00+00:00",
    lastCommitDate: "2026-02-03T04:05:06+00:00",
  });
});

void test("summarizeCommits handles an empty history", () => {
  assert.deepEqual(summarizeCommits([]), {
    commitCount: 0,
    authorCount: 0,
    firstCommitDate: undefined,
    lastCommitDate: undefined,
  });
});
