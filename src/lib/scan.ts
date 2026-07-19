import { Console, Effect } from "effect";

import { GitCommandError, runGit } from "./git.ts";

export type CommitMeta = {
  readonly hash: string;
  readonly authorName: string;
  readonly authorEmail: string;
  readonly authorDate: string;
  readonly subject: string;
};

const fieldSeparator = "\u001F";

const gitLogFormat = ["%H", "%an", "%ae", "%aI", "%s"].join("%x1f");

export const parseGitLog = (stdout: string): CommitMeta[] => {
  const commits: CommitMeta[] = [];

  for (const line of stdout.split("\n")) {
    const [
      hash = "",
      authorName = "",
      authorEmail = "",
      authorDate = "",
      subject = "",
    ] = line.split(fieldSeparator);

    if (!hash) {
      continue;
    }

    commits.push({ hash, authorName, authorEmail, authorDate, subject });
  }

  return commits;
};

export type RepoSummary = {
  readonly commitCount: number;
  readonly authorCount: number;
  readonly firstCommitDate: string | undefined;
  readonly lastCommitDate: string | undefined;
};

export const summarizeCommits = (
  commits: readonly CommitMeta[],
): RepoSummary => {
  const authorEmails = new Set(commits.map((commit) => commit.authorEmail));
  const dates = commits
    .map((commit) => commit.authorDate)
    .filter(Boolean)
    .toSorted();

  return {
    commitCount: commits.length,
    authorCount: authorEmails.size,
    firstCommitDate: dates.at(0),
    lastCommitDate: dates.at(-1),
  };
};

const formatScanReport = (repoPath: string, summary: RepoSummary): string =>
  [
    `Repository: ${repoPath}`,
    `Commits: ${summary.commitCount}`,
    `Authors: ${summary.authorCount}`,
    `First commit: ${summary.firstCommitDate ?? "n/a"}`,
    `Latest commit: ${summary.lastCommitDate ?? "n/a"}`,
  ].join("\n");

export const runScan = ({
  repoPath,
}: {
  readonly repoPath: string;
}): Effect.Effect<void, Error> =>
  Effect.gen(function* () {
    const topLevel = yield* runGit([
      "-C",
      repoPath,
      "rev-parse",
      "--show-toplevel",
    ]).pipe(
      Effect.mapError(
        (error) =>
          new Error(
            error instanceof GitCommandError
              ? `Not a git repository: ${repoPath}`
              : `Unable to run git: ${error.message}`,
          ),
      ),
    );

    const logOutput = yield* runGit([
      "-C",
      repoPath,
      "log",
      `--format=${gitLogFormat}`,
    ]).pipe(
      Effect.catch((error) =>
        error instanceof GitCommandError &&
        error.stderr.includes("does not have any commits yet")
          ? Effect.succeed("")
          : Effect.fail(error),
      ),
    );

    const summary = summarizeCommits(parseGitLog(logOutput));

    yield* Console.log(formatScanReport(topLevel.trim(), summary));
  });
