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
import { withTemporaryWorktree } from "./scan/worktree.ts";

export type CommitMeta = {
  readonly hash: string;
  readonly authorName: string;
  readonly authorEmail: string;
  /** When the work was written — what charts that count work bin by. */
  readonly authorDate: string;
  /**
   * When the commit took its current shape, i.e. when it became part of the
   * history. Rebases and cherry-picks preserve the author date but reset this
   * one, so only the committer date increases along the first-parent chain —
   * which is why anything measuring the state of the tree over time is
   * positioned by it. See docs/specs/04-collectors.md for the boundary.
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

type ChainEntry = {
  readonly hash: string;
  readonly parentHashes: readonly string[];
  readonly committerDate: string;
};

const chainLogFormat = ["%H", "%P", "%cI"].join("%x1f");

/**
 * The first-parent chain of `tip` (HEAD when omitted), newest first. HEAD is
 * left implicit rather than passed: an explicit rev makes git fail an empty
 * repository with "unknown revision" instead of the "does not have any commits
 * yet" that {@link succeedIfNoCommitsYet} recovers from.
 */
const listFirstParentChain = (
  repoRoot: string,
  tip?: string,
): Effect.Effect<
  ChainEntry[],
  CommandError,
  ChildProcessSpawner.ChildProcessSpawner
> =>
  runGit([
    "-C",
    repoRoot,
    "log",
    "--first-parent",
    `--format=${chainLogFormat}`,
    ...(tip === undefined ? [] : [tip]),
  ]).pipe(
    succeedIfNoCommitsYet,
    Effect.map((stdout) =>
      stdout
        .split("\n")
        .filter(Boolean)
        .map((line): ChainEntry => {
          const [hash = "", parents = "", committerDate = ""] =
            line.split(fieldSeparator);
          return {
            hash,
            parentHashes: parents.split(" ").filter(Boolean),
            committerDate,
          };
        }),
    ),
  );

/** No common ancestor means the two commits come from unrelated histories. */
const haveUnrelatedHistories = (
  repoRoot: string,
  left: string,
  right: string,
): Effect.Effect<
  boolean,
  CommandError,
  ChildProcessSpawner.ChildProcessSpawner
> =>
  // Exit code 1 is `merge-base`'s "no common ancestor", not a failure
  runGit(["-C", repoRoot, "merge-base", left, right], {
    okExitCodes: [1],
  }).pipe(Effect.map((stdout) => stdout.trim() === ""));

type FoundingGraft = {
  /** The absorbed histories' first-parent chains, empty when none qualified. */
  readonly absorbed: ChainEntry[][];
  /**
   * The assembly itself: the fresh root plus the founding merge run above it.
   * These commits hold half-assembled workspaces nobody ever ran (effect's
   * skeleton is a near-empty tree that the next eight merges fill in one repo
   * at a time), so when the graft is recognized the caller drops them from the
   * lineage and the composed timeline steps from the absorbed tips straight to
   * the first post-assembly commit.
   */
  readonly assemblyShas: readonly string[];
};

/**
 * The first-parent chains that continue `chain` backwards in time across a
 * founding graft, or no chains when there is none.
 *
 * A repository migration (monorepo assembly, host move, history rewrite)
 * leaves a recognizable signature: a fresh root commit followed immediately by
 * merges that absorb the project's previous histories. Both conditions below
 * are required, so ordinary absorptions stay excluded:
 *
 * - the merge sits in the founding window — the unbroken run of merges
 *   directly above the root, before the first ordinary commit. A foreign
 *   history vendored later in the repository's life does not qualify.
 * - the absorbed history ends before the root begins, so it occupies the
 *   stretch of timeline where the current chain has nothing to say. A side
 *   history that overlaps the chain (e.g. a plugin repository absorbed while
 *   mainline development continued) does not qualify.
 *
 * Every qualifying absorbed history is returned (effect's monorepo assembly
 * merged eight): before the migration they were the project's parallel parts,
 * so composed timelines sum all of them until the assembly replaces them.
 */
const findFoundingGraft = (
  repoRoot: string,
  chain: readonly ChainEntry[],
  alreadyClaimed: ReadonlySet<string>,
): Effect.Effect<
  FoundingGraft,
  CommandError,
  ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function* () {
    const root = chain.at(-1);
    if (root === undefined) {
      return { absorbed: [], assemblyShas: [] };
    }
    const rootDate = Date.parse(root.committerDate);

    const candidateTips: string[] = [];
    const assemblyShas: string[] = [root.hash];
    for (let index = chain.length - 2; index >= 0; index -= 1) {
      const entry = chain[index];
      if (entry === undefined || entry.parentHashes.length < 2) {
        break;
      }
      candidateTips.push(...entry.parentHashes.slice(1));
      assemblyShas.push(entry.hash);
    }

    const absorbed: ChainEntry[][] = [];
    for (const tip of candidateTips) {
      if (alreadyClaimed.has(tip)) {
        continue;
      }
      if (!(yield* haveUnrelatedHistories(repoRoot, root.hash, tip))) {
        continue;
      }
      const candidate = yield* listFirstParentChain(repoRoot, tip);
      const tipDate = Date.parse(candidate.at(0)?.committerDate ?? "");
      const candidateRootDate = Date.parse(
        candidate.at(-1)?.committerDate ?? "",
      );
      if (
        Number.isNaN(tipDate) ||
        Number.isNaN(candidateRootDate) ||
        tipDate >= rootDate
      ) {
        continue;
      }
      absorbed.push(candidate);
    }
    return { absorbed, assemblyShas };
  });

/**
 * One stretch of the project's history whose tree states are worth
 * snapshotting: a first-parent chain (minus any assembly run at its old end)
 * together with the instant its contribution to composed timelines ends.
 */
export type Lineage = {
  /** Snapshot-worthy shas: the lineage's first-parent chain minus assembly. */
  readonly shas: ReadonlySet<string>;
  /**
   * When the lineage stops contributing to composed timelines, as epoch
   * milliseconds: the committer date of the first post-assembly commit of the
   * graft that absorbed it — from that instant the absorbing lineage's trees
   * contain this one's content. `Infinity` for the lineage holding HEAD.
   */
  readonly endsAtMs: number;
};

/**
 * The lineages whose tree states describe the project over time — the states
 * the repository (or, before a migration, its absorbed predecessors) actually
 * passed through. The first lineage is HEAD's own first-parent chain; each
 * founding graft on any lineage (see {@link findFoundingGraft}) contributes
 * the absorbed histories as further lineages, recursively, each ending where
 * the assembly that absorbed it completes. Ordinary side branches and
 * histories grafted mid-life stay excluded — their trees were never the
 * repository's state. See {@link describesTreeState} for what consumes this.
 */
export const listLineages = (
  repoRoot: string,
): Effect.Effect<
  Lineage[],
  CommandError,
  ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function* () {
    const lineages: Lineage[] = [];
    /** Every sha assigned to a lineage (or queued): overlap and cycle guard. */
    const claimed = new Set<string>();
    const initial = yield* listFirstParentChain(repoRoot);
    const queue: Array<{ chain: ChainEntry[]; endsAtMs: number }> =
      initial.length > 0
        ? [{ chain: initial, endsAtMs: Number.POSITIVE_INFINITY }]
        : [];

    while (queue.length > 0) {
      const pending = queue.shift();
      if (pending === undefined) {
        break;
      }
      const { chain, endsAtMs } = pending;
      for (const entry of chain) {
        claimed.add(entry.hash);
      }

      const graft = yield* findFoundingGraft(repoRoot, chain, claimed);
      const shas = new Set(chain.map((entry) => entry.hash));
      let absorbedEndsAtMs = endsAtMs;
      if (
        graft.absorbed.length > 0 &&
        // A degenerate chain that is nothing but assembly (HEAD is still a
        // founding merge) keeps its commits: better a mid-assembly snapshot
        // than none of the current era at all.
        graft.assemblyShas.length < chain.length
      ) {
        for (const sha of graft.assemblyShas) {
          shas.delete(sha);
        }
        const firstPostAssembly = chain.at(-1 - graft.assemblyShas.length);
        if (firstPostAssembly !== undefined) {
          absorbedEndsAtMs = Date.parse(firstPostAssembly.committerDate);
        }
      }

      lineages.push({ shas, endsAtMs });
      for (const absorbedChain of graft.absorbed) {
        queue.push({ chain: absorbedChain, endsAtMs: absorbedEndsAtMs });
      }
    }
    return lineages;
  });

/**
 * Every sha on any lineage — what `scan` samples tree snapshots from, `gc`
 * refuses to reclaim and `index` admits into the cube.
 */
export const listMainlineShas = (
  repoRoot: string,
): Effect.Effect<
  Set<string>,
  CommandError,
  ChildProcessSpawner.ChildProcessSpawner
> =>
  listLineages(repoRoot).pipe(
    Effect.map((lineages) => {
      const shas = new Set<string>();
      for (const lineage of lineages) {
        for (const sha of lineage.shas) {
          shas.add(sha);
        }
      }
      return shas;
    }),
  );

/**
 * The commits a tree-state collector should cover: `policy` applied to each
 * lineage separately, so a monthly policy keeps one snapshot per month of
 * *each* parallel pre-migration history rather than one per month overall.
 * Shared by `scan` (planning) and `status` (progress targets), which must
 * count the same way.
 */
export const sampleTreeCommits = (
  lineages: readonly Lineage[],
  commits: readonly CommitMeta[],
  policy: SamplingPolicy,
): Set<string> => {
  const shas = new Set<string>();
  for (const lineage of lineages) {
    const candidates = commits.filter((commit) =>
      lineage.shas.has(commit.hash),
    );
    for (const commit of sampleCommits(candidates, policy)) {
      shas.add(commit.hash);
    }
  }
  return shas;
};

export type RepoSummary = {
  readonly commitCount: number;
  readonly authorCount: number;
  /**
   * The outer edges of both clocks — the earliest anything was authored and
   * the latest anything landed — so the range covers every commit however it
   * is dated.
   */
  readonly firstCommitDate: string | undefined;
  readonly lastCommitDate: string | undefined;
};

export const summarizeCommits = (
  commits: readonly CommitMeta[],
): RepoSummary => {
  const authorEmails = new Set(commits.map((commit) => commit.authorEmail));
  // Parsed rather than compared as strings: ISO timestamps carry their own UTC
  // offsets, so lexicographic order is not chronological order.
  const dates = commits
    .flatMap((commit) => [commit.authorDate, commit.committerDate])
    .filter((date) => !Number.isNaN(Date.parse(date)))
    .toSorted((left, right) => Date.parse(left) - Date.parse(right));

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

    const lineages = yield* listLineages(repoRoot);

    const plans = collectors.map((collector) => {
      const policy = sampleOverride ?? collector.defaultSampling;
      return {
        collector,
        policy,
        shas: describesTreeState(collector)
          ? sampleTreeCommits(lineages, selected, policy)
          : new Set(
              sampleCommits(selected, policy).map((commit) => commit.hash),
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
