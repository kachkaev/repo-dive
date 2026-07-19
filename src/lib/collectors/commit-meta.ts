import { Effect } from "effect";

import { runGit } from "../git.ts";
import type { Collector } from "./types.ts";

const fieldSeparator = "\u001F";

const format = [
  "%H",
  "%an",
  "%ae",
  "%aI",
  "%cn",
  "%ce",
  "%cI",
  "%P",
  "%s",
].join("%x1f");

export type CommitMetaOutput = {
  readonly sha: string;
  readonly authorName: string;
  readonly authorEmail: string;
  readonly authoredAt: string;
  readonly committerName: string;
  readonly committerEmail: string;
  readonly committedAt: string;
  readonly parents: readonly string[];
  readonly subject: string;
};

export const parseCommitMeta = (stdout: string): CommitMetaOutput => {
  const [
    sha = "",
    authorName = "",
    authorEmail = "",
    authoredAt = "",
    committerName = "",
    committerEmail = "",
    committedAt = "",
    parentsRaw = "",
    subject = "",
  ] = stdout.trim().split(fieldSeparator);

  return {
    sha,
    authorName,
    authorEmail,
    authoredAt,
    committerName,
    committerEmail,
    committedAt,
    parents: parentsRaw.split(" ").filter(Boolean),
    subject,
  };
};

export const commitMetaCollector: Collector = {
  name: "commit-meta",
  version: "1",
  strategy: "log",
  collect: ({ repoRoot, sha }) =>
    runGit(["-C", repoRoot, "show", "-s", `--format=${format}`, sha]).pipe(
      Effect.map(parseCommitMeta),
    ),
};
