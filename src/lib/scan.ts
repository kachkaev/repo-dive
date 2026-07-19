import { Console, Effect } from "effect";

import {
  type Catalog,
  isCollected,
  openCatalog,
  writeCollectorOutput,
} from "./catalog.ts";
import { resolveCollectors } from "./collectors/roster.ts";
import type { Collector } from "./collectors/types.ts";
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

export const resolveRepoRoot = (
  repoPath: string,
): Effect.Effect<string, Error> =>
  runGit(["-C", repoPath, "rev-parse", "--show-toplevel"]).pipe(
    Effect.map((stdout) => stdout.trim()),
    Effect.mapError(
      (error) =>
        new Error(
          error instanceof GitCommandError
            ? `Not a git repository: ${repoPath}`
            : `Unable to run git: ${error.message}`,
        ),
    ),
  );

/** Lists commits reachable from HEAD, newest first. Empty for a repo with no commits. */
export const listCommits = (
  repoRoot: string,
): Effect.Effect<CommitMeta[], Error> =>
  runGit(["-C", repoRoot, "log", `--format=${gitLogFormat}`]).pipe(
    Effect.catch((error) =>
      error instanceof GitCommandError &&
      error.stderr.includes("does not have any commits yet")
        ? Effect.succeed("")
        : Effect.fail(error),
    ),
    Effect.map(parseGitLog),
  );

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

const collectCommit = ({
  catalog,
  sha,
  collectors,
}: {
  readonly catalog: Catalog;
  readonly sha: string;
  readonly collectors: readonly Collector[];
}): Effect.Effect<{ run: number; skipped: number }, Error> =>
  Effect.gen(function* () {
    let run = 0;
    let skipped = 0;

    for (const collector of collectors) {
      if (yield* isCollected(catalog, sha, collector)) {
        skipped += 1;
        continue;
      }

      const startedAt = Date.now();
      const output = yield* collector
        .collect({ repoRoot: catalog.repoRoot, sha })
        .pipe(
          Effect.mapError(
            (error) =>
              new Error(
                `Collector ${collector.name} failed on ${sha.slice(0, 10)}: ${error.message}`,
              ),
          ),
        );
      yield* writeCollectorOutput({
        catalog,
        sha,
        collector,
        output,
        durationMs: Date.now() - startedAt,
      });
      run += 1;
    }

    return { run, skipped };
  });

export const runScan = ({
  repoPath,
  collectorNames,
  maxCommits,
}: {
  readonly repoPath: string;
  readonly collectorNames?: string | undefined;
  readonly maxCommits?: number | undefined;
}): Effect.Effect<void, Error> =>
  Effect.gen(function* () {
    const collectors = resolveCollectors(collectorNames);
    if (collectors instanceof Error) {
      return yield* Effect.fail(collectors);
    }

    const repoRoot = yield* resolveRepoRoot(repoPath);
    const commits = yield* listCommits(repoRoot);
    const selected =
      maxCommits === undefined ? commits : commits.slice(0, maxCommits);

    const catalog = yield* openCatalog(repoRoot);
    const summary = summarizeCommits(commits);

    let totalRun = 0;
    let totalSkipped = 0;
    let processed = 0;

    yield* Effect.forEach(
      selected,
      (commit) =>
        collectCommit({ catalog, sha: commit.hash, collectors }).pipe(
          Effect.tap(({ run, skipped }) =>
            Effect.gen(function* () {
              totalRun += run;
              totalSkipped += skipped;
              processed += 1;
              if (processed % 250 === 0) {
                yield* Console.log(
                  `Scanned ${processed}/${selected.length} commits…`,
                );
              }
            }),
          ),
        ),
      { concurrency: 4, discard: true },
    );

    yield* Console.log(
      [
        `Repository: ${repoRoot}`,
        `Commits: ${summary.commitCount} (${summary.authorCount} authors, ${
          summary.firstCommitDate ?? "n/a"
        } — ${summary.lastCommitDate ?? "n/a"})`,
        `Scanned: ${selected.length} commits with ${collectors
          .map((collector) => collector.name)
          .join(", ")}`,
        `Collector runs: ${totalRun} new, ${totalSkipped} already collected`,
        `Catalog: ${catalog.rootPath}`,
      ].join("\n"),
    );
  });
