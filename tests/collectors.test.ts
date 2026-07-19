import assert from "node:assert/strict";
import test from "node:test";

import { parseNumstat } from "../src/lib/collectors/churn.ts";
import { parseCommitMeta } from "../src/lib/collectors/commit-meta.ts";
import { parseLsTree } from "../src/lib/collectors/file-types.ts";
import { extensionOf } from "../src/lib/collectors/types.ts";

const separator = "\u001F";

void test("extensionOf maps paths to extension categories", () => {
  assert.equal(extensionOf("src/lib/scan.ts"), ".ts");
  assert.equal(extensionOf("README.MD"), ".md");
  assert.equal(extensionOf("Makefile"), "(none)");
  assert.equal(extensionOf(".gitignore"), "(none)");
  assert.equal(extensionOf("a/b.c/d"), "(none)");
});

void test("parseCommitMeta extracts full commit metadata", () => {
  const meta = parseCommitMeta(
    [
      "aaa111",
      "Alice",
      "alice@example.com",
      "2026-02-03T04:05:06+00:00",
      "Bob",
      "bob@example.com",
      "2026-02-03T05:06:07+00:00",
      "parent1 parent2",
      "Merge things",
    ].join(separator),
  );

  assert.deepEqual(meta, {
    sha: "aaa111",
    authorName: "Alice",
    authorEmail: "alice@example.com",
    authoredAt: "2026-02-03T04:05:06+00:00",
    committerName: "Bob",
    committerEmail: "bob@example.com",
    committedAt: "2026-02-03T05:06:07+00:00",
    parents: ["parent1", "parent2"],
    subject: "Merge things",
  });
});

void test("parseNumstat aggregates churn by extension", () => {
  const churn = parseNumstat(
    [
      "10\t2\tsrc/a.ts",
      "5\t0\tsrc/b.ts",
      "1\t1\tREADME.md",
      "-\t-\tlogo.png",
      "",
    ].join("\n"),
  );

  assert.equal(churn.filesChanged, 4);
  assert.equal(churn.added, 16);
  assert.equal(churn.deleted, 3);
  assert.equal(churn.binaryFiles, 1);
  assert.deepEqual(churn.byExtension[".ts"], {
    files: 2,
    added: 15,
    deleted: 2,
  });
  assert.deepEqual(churn.byExtension[".png"], {
    files: 1,
    added: 0,
    deleted: 0,
  });
});

void test("parseLsTree aggregates blob sizes by extension", () => {
  const fileTypes = parseLsTree(
    [
      "100644 blob 1111111111111111111111111111111111111111     120\tsrc/a.ts",
      "100644 blob 2222222222222222222222222222222222222222      30\tREADME.md",
      "120000 blob 3333333333333333333333333333333333333333       -\tlink",
      "160000 commit 4444444444444444444444444444444444444444       -\tsubmodule",
      "",
    ].join("\n"),
  );

  assert.equal(fileTypes.totalFiles, 3);
  assert.equal(fileTypes.totalBytes, 150);
  assert.deepEqual(fileTypes.byExtension[".ts"], { files: 1, bytes: 120 });
  assert.deepEqual(fileTypes.byExtension["(none)"], { files: 1, bytes: 0 });
});
