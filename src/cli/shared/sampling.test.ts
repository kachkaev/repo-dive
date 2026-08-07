import { Result } from "effect";
import { expect, test } from "vitest";

import {
  parseSamplingPolicy,
  sampleCommits,
  samplingLabel,
} from "./sampling.ts";

function commit(hash: string, committerDate: string, authorDate?: string) {
  return {
    hash,
    authorName: "A",
    authorEmail: "a@example.com",
    authorDate: authorDate ?? committerDate,
    committerDate,
    subject: "s",
  };
}

const commits = [
  commit("e", "2026-03-15T10:00:00Z"),
  commit("d", "2026-03-01T10:00:00Z"),
  commit("c", "2026-02-20T10:00:00Z"),
  commit("b", "2025-12-31T10:00:00Z"),
  commit("a", "2025-12-01T10:00:00Z"),
];

test("sampleCommits keeps everything for all", () => {
  expect(sampleCommits(commits, "all").length).toBe(5);
});

test("sampleCommits keeps the newest commit per month", () => {
  expect(
    sampleCommits(commits, "monthly").map((entry) => entry.hash),
  ).toStrictEqual(["e", "c", "b", "a"]);
});

test("sampleCommits keeps the newest commit per quarter", () => {
  expect(
    sampleCommits(commits, "quarterly").map((entry) => entry.hash),
  ).toStrictEqual(["e", "b", "a"]);
});

test("sampleCommits buckets periods by the committer date", () => {
  // Rebased onto the mainline in March, written in January: it belongs to
  // March's bucket, and January is left to whatever actually landed then.
  const rebased = [
    commit("d", "2026-03-10T10:00:00Z", "2026-01-05T10:00:00Z"),
    commit("c", "2026-03-01T10:00:00Z"),
    commit("b", "2026-01-20T10:00:00Z"),
  ];

  expect(
    sampleCommits(rebased, "monthly").map((entry) => entry.hash),
  ).toStrictEqual(["d", "b"]);
});

test("sampleCommits supports every-nth", () => {
  expect(
    sampleCommits(commits, { everyNth: 2 }).map((entry) => entry.hash),
  ).toStrictEqual(["e", "c", "a"]);
});

test("sampleCommits anchors the oldest commit for every-nth", () => {
  // Indices 0 and 3 are the regular picks; "a" (index 4) rides along anyway.
  expect(
    sampleCommits(commits, { everyNth: 3 }).map((entry) => entry.hash),
  ).toStrictEqual(["e", "b", "a"]);
});

test("sampleCommits anchors the oldest commit without duplicating it", () => {
  // "a" is both the newest commit of its bucket and the oldest commit overall.
  const single = [commit("a", "2025-12-01T10:00:00Z")];
  expect(
    sampleCommits(single, "monthly").map((entry) => entry.hash),
  ).toStrictEqual(["a"]);
  expect(sampleCommits([], "monthly")).toStrictEqual([]);
});

test("samplingLabel spells out every policy shape", () => {
  expect(samplingLabel("all")).toBe("all");
  expect(samplingLabel("quarterly")).toBe("quarterly");
  expect(samplingLabel({ everyNth: 3 })).toBe("every-nth:3");
});

test("parseSamplingPolicy accepts known policies and rejects others", () => {
  expect(parseSamplingPolicy("monthly")).toStrictEqual(
    Result.succeed("monthly"),
  );
  expect(parseSamplingPolicy("every-nth:5")).toStrictEqual(
    Result.succeed({ everyNth: 5 }),
  );
  expect(Result.isFailure(parseSamplingPolicy("fortnightly"))).toBe(true);
  expect(Result.isFailure(parseSamplingPolicy("every-nth:0"))).toBe(true);
});
