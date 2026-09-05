import { expect, test } from "vitest";

import { parseCommitMeta, parseTrailers } from "./commit-meta.ts";

const separator = "\u{1F}";

test("parseCommitMeta extracts full commit metadata", () => {
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
      "Co-authored-by: Claude <noreply@anthropic.com>",
    ].join(separator),
  );

  expect(meta).toStrictEqual({
    sha: "aaa111",
    authorName: "Alice",
    authorEmail: "alice@example.com",
    authoredAt: "2026-02-03T04:05:06+00:00",
    committerName: "Bob",
    committerEmail: "bob@example.com",
    committedAt: "2026-02-03T05:06:07+00:00",
    parents: ["parent1", "parent2"],
    subject: "Merge things",
    trailers: [
      { key: "Co-authored-by", value: "Claude <noreply@anthropic.com>" },
    ],
    coAuthors: ["Claude <noreply@anthropic.com>"],
  });
});

test("parseTrailers extracts key-value trailers", () => {
  expect(
    parseTrailers(
      "Co-Authored-By: Claude <noreply@anthropic.com>\nReviewed-by: Alice\n",
    ),
  ).toStrictEqual([
    { key: "Co-Authored-By", value: "Claude <noreply@anthropic.com>" },
    { key: "Reviewed-by", value: "Alice" },
  ]);
  expect(parseTrailers("")).toStrictEqual([]);
});
