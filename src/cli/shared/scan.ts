import {
  Clock,
  Console,
  Data,
  Duration,
  Effect,
  type PlatformError,
  Ref,
} from "effect";
import type { ChildProcessSpawner } from "effect/unstable/process";

import {
  type Catalog,
  isCollected,
  openCatalog,
  writeCollectorOutput,
} from "./catalog.ts";
import {
  type Collector,
  collectorCacheKey,
  describesTreeState,
  resolveCollectors,
} from "./collectors.ts";
import { loadConfig } from "./config.ts";
import { type CommandError, runGit } from "./git.ts";
import { warnAboutIgnoreFiles } from "./ignore-files.ts";
import {
  parseSamplingPolicy,
  sampleCommits,
  samplingLabel,
  type SamplingPolicy,
} from "./sampling.ts";
import { withTemporaryWorktree } from "./worktree.ts";

export type CommitMeta = {
  readonly hash: string;
  readonly authorName: string;
  readonly authorEmail: string;
  /** When the work was written. Kept for the cube; nothing is plotted against it. */
  readonly authorDate: string;
  /**
   * When the commit took its current shape, i.e. when it became part of the
   * history. Rebases and cherry-picks preserve the author date but reset this
   * one, so only the committer date increases along the first-parent chain —
   * which is why it, and it alone, is the timeline every chart is drawn
   * against.
   */
  readonly committerDate: string;
  readonly subject: string;
};

export class NotAGitRepositoryError extends Data.TaggedError(
  "NotAGitRepositoryError",
)<{
  readonly repoPath: string;
}> {
  override get message(): string {
    return `Not a git repository: ${this.repoPath}`;
  }
}

class CollectorRunError extends Data.TaggedError("CollectorRunError")<{
  readonly collectorName: string;
  readonly sha: string;
  readonly cause: Error;
}> {
  override get message(): string {
    return `Collector ${this.collectorName} failed on ${this.sha.slice(0, 10)}: ${this.cause.message}`;
  }
}

const fieldSeparator = "\u001F";

const gitLogFormat = ["%H", "%an", "%ae", "%aI", "%cI", "%s"].join("%x1f");

export const parseGitLog = (stdout: string): CommitMeta[] => {
  const commits: CommitMeta[] = [];

  for (const line of stdout.split("\n")) {
    const [
      hash = "",
      authorName = "",
      authorEmail = "",
      authorDate = "",
      committerDate = "",
      subject = "",
    ] = line.split(fieldSeparator);

    if (!hash) {
      continue;
    }

    commits.push({
      hash,
      authorName,
      authorEmail,
      authorDate,
      committerDate,
      subject,
    });
  }

  return commits;
};

export const resolveRepoRoot = (
  repoPath: string,
): Effect.Effect<
  string,
  NotAGitRepositoryError | PlatformError.PlatformError,
  ChildProcessSpawner.ChildProcessSpawner
> =>
  runGit(["-C", repoPath, "rev-parse", "--show-toplevel"]).pipe(
    Effect.map((stdout) => stdout.trim()),
    Effect.catchTag("GitCommandError", () =>
      Effect.fail(new NotAGitRepositoryError({ repoPath })),
    ),
  );

const succeedIfNoCommitsYet = <R>(
  effect: Effect.Effect<string, CommandError, R>,
): Effect.Effect<string, CommandError, R> =>
  effect.pipe(
    Effect.catchIf(
      (error) =>
        error._tag === "GitCommandError" &&
        error.stderr.includes("does not have any commits yet"),
      () => Effect.succeed(""),
    ),
  );

/** Lists commits reachable from HEAD, newest first. Empty for a repo with no commits. */
export const listCommits = (
  repoRoot: string,
): Effect.Effect<
  CommitMeta[],
  CommandError,
  ChildProcessSpawner.ChildProcessSpawner
> =>
  runGit(["-C", repoRoot, "log", `--format=${gitLogFormat}`]).pipe(
    succeedIfNoCommitsYet,
    Effect.map(parseGitLog),
  );

/**
 * Shas on HEAD's first-parent chain, i.e. the states the repository actually
 * passed through. See {@link describesTreeState} for why snapshot collectors
 * are restricted to them.
 */
export const listFirstParentShas = (
  repoRoot: string,
): Effect.Effect<
  Set<string>,
  CommandError,
  ChildProcessSpawner.ChildProcessSpawner
> =>
  runGit(["-C", repoRoot, "log", "--first-parent", "--format=%H"]).pipe(
    succeedIfNoCommitsYet,
    Effect.map((stdout) => new Set(stdout.split("\n").filter(Boolean))),
  );

export type RepoSummary = {
  readonly commitCount: number;
  readonly authorCount: number;
  /** Committer dates, like every other timeline in the tool. */
  readonly firstCommitDate: string | undefined;
  readonly lastCommitDate: string | undefined;
};

export const summarizeCommits = (
  commits: readonly CommitMeta[],
): RepoSummary => {
  const authorEmails = new Set(commits.map((commit) => commit.authorEmail));
  const dates = commits
    .map((commit) => commit.committerDate)
    .filter(Boolean)
    .toSorted();

  return {
    commitCount: commits.length,
    authorCount: authorEmails.size,
    firstCommitDate: dates.at(0),
    lastCommitDate: dates.at(-1),
  };
};

const runCollector = ({
  catalog,
  sha,
  collector,
  cacheKey,
  worktreePath,
}: {
  readonly catalog: Catalog;
  readonly sha: string;
  readonly collector: Collector;
  readonly cacheKey: string;
  readonly worktreePath?: string | undefined;
}): Effect.Effect<
  void,
  CollectorRunError | Error,
  ChildProcessSpawner.ChildProcessSpawner
> =>
  collector
    .collect({
      repoRoot: catalog.repoRoot,
      catalogPath: catalog.rootPath,
      sha,
      cacheKey,
      worktreePath,
    })
    .pipe(
      Effect.mapError(
        (cause) =>
          new CollectorRunError({ collectorName: collector.name, sha, cause }),
      ),
      Effect.timed,
      Effect.flatMap(([duration, output]) =>
        writeCollectorOutput({
          catalog,
          sha,
          collector,
          cacheKey,
          output,
          durationMs: Math.round(Duration.toMillis(duration)),
        }),
      ),
    );

type CommitOutcome = {
  readonly run: number;
  readonly skipped: number;
  /** Failed runs are recorded here instead of aborting the whole scan. */
  readonly failures: readonly string[];
};

const collectCommit = ({
  catalog,
  sha,
  collectors,
  cacheKeyOf,
  force,
}: {
  readonly catalog: Catalog;
  readonly sha: string;
  readonly collectors: readonly Collector[];
  readonly cacheKeyOf: (collector: Collector) => string;
  readonly force: boolean;
}): Effect.Effect<
  CommitOutcome,
  Error,
  ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function* () {
    const pending: Collector[] = [];
    let skipped = 0;

    for (const collector of collectors) {
      if (
        !force &&
        (yield* isCollected(catalog, sha, collector, cacheKeyOf(collector)))
      ) {
        skipped += 1;
      } else {
        pending.push(collector);
      }
    }

    const direct = pending.filter(
      (collector) => collector.strategy !== "worktree",
    );
    const needingWorktree = pending.filter(
      (collector) => collector.strategy === "worktree",
    );

    let run = 0;
    const failures: string[] = [];
    for (const collector of direct) {
      const failure = yield* runCollector({
        catalog,
        sha,
        collector,
        cacheKey: cacheKeyOf(collector),
      }).pipe(
        Effect.as(undefined),
        Effect.catch((error) => Effect.succeed(error.message)),
      );
      if (failure === undefined) {
        run += 1;
      } else {
        failures.push(failure);
      }
    }

    if (needingWorktree.length > 0) {
      const worktreeFailures = yield* withTemporaryWorktree(
        catalog.repoRoot,
        sha,
        (worktreePath) =>
          Effect.forEach(needingWorktree, (collector) =>
            runCollector({
              catalog,
              sha,
              collector,
              cacheKey: cacheKeyOf(collector),
              worktreePath,
            }).pipe(
              Effect.as(undefined),
              Effect.catch((error) => Effect.succeed(error.message)),
            ),
          ),
      ).pipe(
        Effect.catch((error) =>
          Effect.succeed([
            `Worktree for ${sha.slice(0, 10)}: ${error.message}`,
          ]),
        ),
      );
      for (const failure of worktreeFailures) {
        if (failure === undefined) {
          run += 1;
        } else {
          failures.push(failure);
        }
      }
    }

    return { run, skipped, failures };
  });

export const runScan = ({
  repoPath,
  collectorNames,
  maxCommits,
  sample,
  force = false,
}: {
  readonly repoPath: string;
  readonly collectorNames?: string | undefined;
  readonly maxCommits?: number | undefined;
  readonly sample?: string | undefined;
  readonly force?: boolean | undefined;
}): Effect.Effect<void, Error, ChildProcessSpawner.ChildProcessSpawner> =>
  Effect.gen(function* () {
    const collectors = yield* Effect.fromResult(
      resolveCollectors(collectorNames),
    );

    let sampleOverride: SamplingPolicy | undefined;
    if (sample !== undefined) {
      sampleOverride = yield* Effect.fromResult(parseSamplingPolicy(sample));
    }

    const repoRoot = yield* resolveRepoRoot(repoPath);
    const commits = yield* listCommits(repoRoot);
    const selected =
      maxCommits === undefined ? commits : commits.slice(0, maxCommits);

    // Loaded before the catalog is opened: the config decides where it lives.
    // One fingerprint per collector for the whole run follows from it too — the
    // config is fixed, so it decides re-collection uniformly across commits.
    const config = yield* loadConfig(repoRoot);
    const catalog = yield* openCatalog({
      repoRoot,
      catalogPath: config.catalogPath,
    });
    const summary = summarizeCommits(commits);

    const cacheKeys = new Map(
      collectors.map((collector) => [
        collector.name,
        collectorCacheKey(collector, config),
      ]),
    );
    const cacheKeyOf = (collector: Collector): string =>
      cacheKeys.get(collector.name) ?? collectorCacheKey(collector, config);

    const firstParentShas = yield* listFirstParentShas(repoRoot);

    const plans = collectors.map((collector) => {
      const policy = sampleOverride ?? collector.defaultSampling;
      const candidates = describesTreeState(collector)
        ? selected.filter((commit) => firstParentShas.has(commit.hash))
        : selected;
      return {
        collector,
        policy,
        shas: new Set(
          sampleCommits(candidates, policy).map((commit) => commit.hash),
        ),
      };
    });

    yield* Console.log(
      `Plan: ${plans
        .map(
          (plan) =>
            `${plan.collector.name} → ${plan.shas.size} commits (${samplingLabel(plan.policy)})`,
        )
        .join(", ")}`,
    );

    let totalRun = 0;
    let totalSkipped = 0;
    const failures: string[] = [];

    // Batch phase: collectors that can cover many commits per subprocess do so
    // up front; whatever they produced is excluded from the per-commit phase.
    const batchDone = new Map<string, ReadonlySet<string>>();
    for (const plan of plans) {
      const { collector } = plan;
      if (!collector.collectBatch) {
        continue;
      }
      const pending = new Set<string>();
      for (const sha of plan.shas) {
        if (
          force ||
          !(yield* isCollected(catalog, sha, collector, cacheKeyOf(collector)))
        ) {
          pending.add(sha);
        }
      }
      totalSkipped += plan.shas.size - pending.size;
      if (pending.size === 0) {
        batchDone.set(collector.name, plan.shas);
        continue;
      }

      const [batchDuration, outputs] = yield* collector
        .collectBatch({ repoRoot, shas: pending })
        .pipe(
          Effect.catch((error) => {
            failures.push(`Batch ${collector.name}: ${error.message}`);
            return Effect.succeed(new Map<string, unknown>());
          }),
          Effect.timed,
        );
      const durationMs = Math.max(
        1,
        Math.round(
          Duration.toMillis(batchDuration) / Math.max(1, outputs.size),
        ),
      );

      const written = new Set(
        yield* Effect.forEach(
          [...outputs.entries()],
          ([sha, output]) =>
            writeCollectorOutput({
              catalog,
              sha,
              collector,
              cacheKey: cacheKeyOf(collector),
              output,
              durationMs,
            }).pipe(Effect.as(sha)),
          { concurrency: 16 },
        ),
      );
      totalRun += written.size;

      const done = new Set(plan.shas);
      for (const sha of pending) {
        if (!written.has(sha)) {
          done.delete(sha); // fall back to per-commit collect()
        }
      }
      batchDone.set(collector.name, done);
      if (written.size > 0) {
        yield* Console.log(
          `Batched ${collector.name}: ${written.size} commits in one pass.`,
        );
      }
    }

    const startedAt = yield* Clock.currentTimeMillis;

    const formatEta = (processed: number, now: number): string => {
      const elapsedSeconds = (now - startedAt) / 1000;
      const rate = processed / Math.max(1, elapsedSeconds);
      const remainingSeconds = Math.round(
        (selected.length - processed) / Math.max(0.01, rate),
      );
      const minutes = Math.floor(remainingSeconds / 60);
      const seconds = remainingSeconds % 60;
      return `${Math.round(rate)}/s, ~${minutes > 0 ? `${minutes}m ` : ""}${seconds}s left`;
    };

    const processedRef = yield* Ref.make(0);
    const outcomes = yield* Effect.forEach(
      selected,
      (commit) =>
        collectCommit({
          catalog,
          sha: commit.hash,
          collectors: plans
            .filter(
              (plan) =>
                plan.shas.has(commit.hash) &&
                !batchDone.get(plan.collector.name)?.has(commit.hash),
            )
            .map((plan) => plan.collector),
          cacheKeyOf,
          force,
        }).pipe(
          Effect.tap(() =>
            Effect.gen(function* () {
              const processed = yield* Ref.updateAndGet(
                processedRef,
                (count) => count + 1,
              );
              if (processed % 250 === 0) {
                const now = yield* Clock.currentTimeMillis;
                yield* Console.log(
                  `Scanned ${processed}/${selected.length} commits (${formatEta(processed, now)})…`,
                );
              }
            }),
          ),
        ),
      { concurrency: 4 },
    );

    for (const outcome of outcomes) {
      totalRun += outcome.run;
      totalSkipped += outcome.skipped;
      failures.push(...outcome.failures);
    }

    yield* Console.log(
      [
        `Repository: ${repoRoot}`,
        `Commits: ${summary.commitCount} (${summary.authorCount} authors, ${
          summary.firstCommitDate ?? "n/a"
        } — ${summary.lastCommitDate ?? "n/a"})`,
        `Collector runs: ${totalRun} new, ${totalSkipped} already collected` +
          (failures.length > 0 ? `, ${failures.length} failed` : ""),
        `Catalog: ${catalog.rootPath}`,
      ].join("\n"),
    );

    if (failures.length > 0) {
      yield* Console.error(
        [
          `${failures.length} collector runs failed (re-run scan to retry):`,
          ...failures.slice(0, 10).map((message) => `  ${message}`),
          ...(failures.length > 10
            ? [`  … and ${failures.length - 10} more`]
            : []),
        ].join("\n"),
      );
    }

    yield* warnAboutIgnoreFiles({ repoRoot, config });
  });
