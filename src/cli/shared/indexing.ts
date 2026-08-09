import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { Console, Data, Effect } from "effect";
import type { ChildProcessSpawner } from "effect/unstable/process";

import type { ContributorKind } from "../../config.ts";
import {
  builtInCollectors,
  describesTreeState,
  type Fact,
} from "./collectors.ts";
import {
  loadConfig,
  normalizeContributorName,
  type ResolvedConfig,
} from "./config.ts";
import { warnAboutIgnoreFiles } from "./ignore-files.ts";
import { languageOfExtension } from "./languages.ts";
import { readRemoteUrl } from "./remote.ts";
import { listCommits, listFirstParentShas, resolveRepoRoot } from "./scan.ts";

class NoCollectedCommitsError extends Data.TaggedError(
  "NoCollectedCommitsError",
)<{
  readonly commitsPath: string;
}> {
  override get message(): string {
    return `No collected commits found in ${this.commitsPath} — run \`repo-dive scan\` first.`;
  }
}

/**
 * Series labels non-human contributors fold into in survival data. The
 * dashboard matches these literal strings to color the bands with the
 * reserved kind colors, so change them in both places or not at all.
 */
const kindGroupLabels = { bot: "Bots", ai: "AI agents" } as const;

/**
 * Splits a `Co-authored-by:` trailer into its parts:
 * `"Claude Fable 5 <noreply@anthropic.com>"` → name + email.
 *
 * Keeping the email (rather than the display name alone) is what lets a
 * co-author resolve through the very same `resolveContributor` an author goes
 * through — so alias groups, `displayName`/`url` overrides and kind derivation
 * apply identically whether a person wrote a commit or helped with one.
 */
export const parseIdentity = (
  identity: string,
): { name: string; email: string } => {
  const open = identity.indexOf("<");
  const close = identity.lastIndexOf(">");
  if (open === -1 || close < open) {
    return { name: identity.trim(), email: "" };
  }
  return {
    name: identity.slice(0, open).trim(),
    email: identity.slice(open + 1, close).trim(),
  };
};

/**
 * Which of a commit's two dates a series uses comes down to the series' shape,
 * not its subject matter — see docs/specs/04-collectors.md.
 *
 * A **state sample** ("at time T the tree held V lines") is positioned by the
 * instant the measurement was valid, so it takes {@link CommitFacts.committedAt}.
 * A **histogram** ("how many commits fell in this day") bins objects by one of
 * their own date attributes, so it takes the attribute it claims to show —
 * {@link CommitFacts.authoredAt} for everything that counts work.
 */
type CommitFacts = {
  readonly sha: string;
  /**
   * When the work was written — what every histogram over commits bins by, and
   * the same clock `git blame` hands the survival collector for its cohorts, so
   * "lines added in month M" and "lines belonging to cohort M" stay the same
   * lines.
   */
  readonly authoredAt: string;
  /**
   * When the commit became part of the history — the x coordinate of every
   * state sample, because that is when the repository looked like that.
   *
   * The author date can't serve there. Under a rebase or squash-merge workflow
   * it says when the work was written, which can be months before it landed,
   * and it does not increase along the first-parent chain — ollama's mainline
   * steps backwards by up to four months that way. Plotting a tree snapshot at
   * its author date drags today's line counts back into the middle of a stretch
   * the chart has already drawn, and every stacked area zigzags.
   */
  readonly committedAt: string;
  readonly authorEmail: string;
  readonly authorName: string;
  /** collector name → facts from that collector's output */
  readonly factsByCollector: ReadonlyMap<string, readonly Fact[]>;
};

const sumMetric = (
  commit: CommitFacts,
  metric: string,
  filter?: (categories: Readonly<Record<string, string>>) => boolean,
): number => {
  let total = 0;
  for (const facts of commit.factsByCollector.values()) {
    for (const fact of facts) {
      if (
        fact.metric === metric &&
        (filter === undefined || filter(fact.categories ?? {}))
      ) {
        total += fact.value;
      }
    }
  }
  return total;
};

const groupMetric = (
  commit: CommitFacts,
  metric: string,
  categoryKey: string,
): Record<string, number> => {
  const grouped: Record<string, number> = {};
  for (const facts of commit.factsByCollector.values()) {
    for (const fact of facts) {
      if (fact.metric === metric) {
        const key = fact.categories?.[categoryKey] ?? "(unknown)";
        grouped[key] = (grouped[key] ?? 0) + fact.value;
      }
    }
  }
  return grouped;
};

const hasMetric = (commit: CommitFacts, metric: string): boolean =>
  [...commit.factsByCollector.values()].some((facts) =>
    facts.some((fact) => fact.metric === metric),
  );

/** Re-keys a numeric record, summing values whose new keys collide. */
const sumByKey = (
  record: Record<string, number>,
  keyOf: (key: string) => string,
): Record<string, number> => {
  const merged: Record<string, number> = {};
  for (const [key, value] of Object.entries(record)) {
    const newKey = keyOf(key);
    merged[newKey] = (merged[newKey] ?? 0) + value;
  }
  return merged;
};

/**
 * The instants the dashboard's time axes have to span.
 *
 * Both dates go in, because the two kinds of series are positioned by
 * different ones: the calendar has to reach back to the earliest day anyone
 * authored on, the timelines have to reach forward to the newest commit that
 * landed, and either clock can be the outer one at either end. Parsed rather
 * than compared as strings — ISO timestamps carry their own UTC offsets, so
 * lexicographic order is not chronological order.
 */
const spanOf = (
  commits: readonly CommitFacts[],
): { first: string | undefined; last: string | undefined } => {
  let first: string | undefined;
  let last: string | undefined;
  for (const commit of commits) {
    for (const date of [commit.authoredAt, commit.committedAt]) {
      if (!date) {
        continue;
      }
      if (first === undefined || Date.parse(date) < Date.parse(first)) {
        first = date;
      }
      if (last === undefined || Date.parse(date) > Date.parse(last)) {
        last = date;
      }
    }
  }
  return { first, last };
};

const buildDashboardData = (
  repoRoot: string,
  commits: readonly CommitFacts[], // oldest first
  config: ResolvedConfig,
  /** Browsable URL of `origin`, when the repo has one (see `remote.ts`). */
  remoteUrl: string | undefined,
) => {
  /** The raw `"Name <email>"` trailers on a commit, in the order git listed them. */
  const coAuthorsOf = (commit: CommitFacts): string[] =>
    [...commit.factsByCollector.values()]
      .flat()
      .filter((fact) => fact.metric === "commits.coAuthor")
      .map((fact) => fact.categories?.["coAuthor"] ?? "");

  /**
   * A co-author resolved the same way an author is. An identity with no email
   * (a bare `Co-authored-by: Some Name`) keys off its name instead, so those
   * don't all collapse into one empty-email bucket.
   */
  const resolveCoAuthor = (identity: string) => {
    const { name, email } = parseIdentity(identity);
    return {
      name,
      resolved: config.resolveContributor(email || name, name),
    };
  };

  const span = spanOf(commits);

  // A histogram over commits, so it bins by the author date: the calendar,
  // the monthly bars and the churn bars all count work, and churn in
  // particular has to line up with the survival cohorts below, which `git
  // blame` reports on that same clock.
  const commitRows = commits.map((commit) => ({
    sha: commit.sha.slice(0, 10),
    date: commit.authoredAt,
    author: commit.authorEmail,
    kind: config.resolveContributor(commit.authorEmail, commit.authorName).kind,
    ai: coAuthorsOf(commit).some(
      (identity) => resolveCoAuthor(identity).resolved.kind === "ai",
    ),
    added: sumMetric(commit, "churn.added"),
    deleted: sumMetric(commit, "churn.deleted"),
  }));

  // No monthly rollup is written: every field of one (commits, AI-assisted
  // commits, added, deleted) is a group-by-month sum over `commitRows`, which
  // the dashboard already loads in full for the commit calendar. Shipping both
  // meant two aggregations to keep in step for no data the second one added.

  const languages = commits
    .filter((commit) => hasMetric(commit, "languages.lines"))
    .map((commit) => ({
      sha: commit.sha.slice(0, 10),
      date: commit.committedAt,
      byLanguage: groupMetric(commit, "languages.lines", "language"),
    }));

  const fileTypes = commits
    .filter((commit) => hasMetric(commit, "files.count"))
    .map((commit) => ({
      sha: commit.sha.slice(0, 10),
      date: commit.committedAt,
      totalFiles: sumMetric(commit, "files.count"),
      totalBytes: sumMetric(commit, "files.bytes"),
    }));

  const directives = commits
    .filter((commit) => hasMetric(commit, "directives.ts"))
    .map((commit) => {
      const byType = groupMetric(commit, "directives.eslint", "type");
      const ts = groupMetric(commit, "directives.ts", "type");
      return {
        sha: commit.sha.slice(0, 10),
        date: commit.committedAt,
        eslintNextLine: byType["next-line"] ?? 0,
        eslintLine: byType["line"] ?? 0,
        eslintBlocks: byType["block"] ?? 0,
        blockCoveredLines: sumMetric(
          commit,
          "directives.eslintBlockCoveredLines",
        ),
        tsIgnore: ts["ignore"] ?? 0,
        tsExpectError: ts["expectError"] ?? 0,
        tsNocheck: ts["nocheck"] ?? 0,
        todos: sumMetric(commit, "todos.count"),
      };
    });

  const dependencies = commits
    .filter(
      (commit) =>
        // A commit the collector scanned but found neither a lockfile nor a
        // package.json in carries only `dependencies.scanned`; it still belongs
        // on the chart as a zero, so "collected, no dependencies" stays distinct
        // from an unscanned gap. A repo can also declare dependencies in a
        // package.json before any lockfile exists, so manifests count too.
        hasMetric(commit, "dependencies.resolved") ||
        hasMetric(commit, "dependencies.manifest") ||
        hasMetric(commit, "dependencies.scanned"),
    )
    .map((commit) => {
      const byKind = groupMetric(commit, "dependencies.direct", "kind");
      return {
        sha: commit.sha.slice(0, 10),
        date: commit.committedAt,
        resolved: sumMetric(commit, "dependencies.resolved"),
        manifestCount: sumMetric(commit, "dependencies.manifest"),
        directProd: byKind["prod"] ?? 0,
        directDev: byKind["dev"] ?? 0,
        directOptional: byKind["optional"] ?? 0,
        byPackageManager: groupMetric(
          commit,
          "dependencies.resolved",
          "packageManager",
        ),
      };
    });

  const latestWithDirectives = commits.findLast((commit) =>
    hasMetric(commit, "directives.eslint"),
  );
  const topRules = latestWithDirectives
    ? Object.entries(
        groupMetric(latestWithDirectives, "directives.eslint", "rule"),
      )
        .toSorted(([, left], [, right]) => right - left)
        .slice(0, 20)
        .map(([rule, count]) => ({ rule, count }))
    : [];

  // Non-human contributors fold into one series per kind in the survival
  // charts: individual bots/agents rarely matter there, and grouping them
  // server-side lets the dashboard color the bands with the reserved kind
  // colors without needing a label → kind mapping of its own (the contributors
  // list is truncated, so it cannot serve as one).
  //
  // Survival facts carry only the author's email, so both halves of a band's
  // label have to come back from the commits. Kind derivation reads the name —
  // "Claude <noreply@anthropic.com>" is an AI agent by its name alone — and the
  // bands humans get are named after the person rather than their address, so a
  // published report doesn't spell out an address for every top contributor.
  // Feeding the names the commits already carry makes a band fold, and read,
  // exactly the way the contributors list treats the same person.

  /**
   * The name as spelled on this commit (author line or trailer): a configured
   * displayName wins, otherwise the observed spelling, tidied so a bot's
   * `[bot]` suffix doesn't double up with its kind badge. Falls back to the
   * resolved label (the canonical email's username) for an identity git never
   * spelled a name for.
   */
  const nameOf = (
    resolved: ReturnType<typeof config.resolveContributor>,
    observedName: string,
  ): string =>
    resolved.displayName ??
    (observedName ? normalizeContributorName(observedName) : resolved.label);

  /** Raw email → the name git spelled beside it, for kind derivation. */
  const nameByEmail = new Map<string, string>();
  /**
   * Canonical email → the name that identity's chart bands carry. Keyed by the
   * canonical email so every alias of one person names the same band, and
   * written in commit order (oldest first) so the newest spelling wins — the
   * rule the contributors list below follows too.
   */
  const nameByCanonicalEmail = new Map<string, string>();
  for (const commit of commits) {
    if (!commit.authorName) {
      continue;
    }
    nameByEmail.set(commit.authorEmail.toLowerCase(), commit.authorName);
    const resolved = config.resolveContributor(
      commit.authorEmail,
      commit.authorName,
    );
    nameByCanonicalEmail.set(
      resolved.canonicalEmail.toLowerCase(),
      nameOf(resolved, commit.authorName),
    );
  }

  const survivalLabelOf = (email: string): string => {
    const resolved = config.resolveContributor(
      email,
      nameByEmail.get(email.toLowerCase()),
    );
    if (resolved.kind !== "human") {
      return kindGroupLabels[resolved.kind];
    }
    // Two people who spell their name identically share a band, the way the
    // kind groups above do — a name is what the chart shows, so it is also what
    // it can tell apart. `contributors.aliases` is the lever for splitting or
    // merging them on purpose, and the contributors table still lists each of
    // them with their own email. The label covers the person git blame credits
    // lines to whose own commits were never sampled: no name was ever observed.
    return (
      nameByCanonicalEmail.get(resolved.canonicalEmail.toLowerCase()) ??
      resolved.label
    );
  };

  const survival = commits
    .filter((commit) => hasMetric(commit, "survival.lines"))
    .map((commit) => {
      // Living lines cross-tabulated by contributor (and by extension) and the
      // year each line was authored — the dashboard splits each contributor's
      // or language's area into year bands.
      const byContributorYear: Record<string, Record<string, number>> = {};
      const byLanguageYear: Record<string, Record<string, number>> = {};
      for (const facts of commit.factsByCollector.values()) {
        for (const fact of facts) {
          if (fact.metric !== "survival.lines") {
            continue;
          }
          const label = survivalLabelOf(fact.categories?.["author"] ?? "");
          const year = (fact.categories?.["cohort"] ?? "").slice(0, 4) || "?";
          const byYear = (byContributorYear[label] ??= {});
          byYear[year] = (byYear[year] ?? 0) + fact.value;
          // Survival facts stay keyed by extension — the raw truth — and are
          // relabelled here with the same map the languages collector uses, so
          // both halves of "Lines by language" name their stacks identically.
          const language = languageOfExtension(
            fact.categories?.["extension"] ?? "",
          );
          const languageYears = (byLanguageYear[language] ??= {});
          languageYears[year] = (languageYears[year] ?? 0) + fact.value;
        }
      }
      return {
        sha: commit.sha.slice(0, 10),
        date: commit.committedAt,
        byCohort: groupMetric(commit, "survival.lines", "cohort"),
        byContributor: sumByKey(
          groupMetric(commit, "survival.lines", "author"),
          survivalLabelOf,
        ),
        byContributorYear,
        byLanguage: sumByKey(
          groupMetric(commit, "survival.lines", "extension"),
          languageOfExtension,
        ),
        byLanguageYear,
      };
    });

  // One bucket per person, whether they authored commits, only ever helped
  // with someone else's, or both — humans, bots and AI agents all measured the
  // same way. `assistedBy` / `assisted` are the two halves of the same
  // cross-kind edge, recorded from each end.
  type ContributorBucket = {
    email: string;
    name: string;
    url: string | undefined;
    kind: ContributorKind;
    commits: number;
    added: number;
    deleted: number;
    /** Own commits carrying at least one co-author of that (other) kind. */
    assistedBy: Partial<Record<ContributorKind, number>>;
    /** Commits by an author of that (other) kind that this person co-authored. */
    assisted: Partial<Record<ContributorKind, number>>;
  };
  const contributorMap = new Map<string, ContributorBucket>();

  /**
   * Fetches or creates a contributor's bucket.
   *
   * Humans key off their canonical email alone, so an alias group folds every
   * spelling of one person together. Bots and AI agents key off their name too:
   * they share vendor noreply addresses — "Claude Fable 5" and "Claude Opus
   * 4.8" are both `<noreply@anthropic.com>` — and for them the name carries the
   * identity worth telling apart. Giving such a group a `displayName` in the
   * config merges them back into one.
   */
  const bucketFor = (
    resolved: ReturnType<typeof config.resolveContributor>,
    observedName: string,
  ): ContributorBucket => {
    const name = nameOf(resolved, observedName);
    const email = resolved.canonicalEmail.toLowerCase();
    const key =
      resolved.kind === "human" ? email : `${name.toLowerCase()}\u001F${email}`;
    const bucket = contributorMap.get(key) ?? {
      email: resolved.canonicalEmail,
      name,
      url: resolved.url,
      kind: resolved.kind,
      commits: 0,
      added: 0,
      deleted: 0,
      assistedBy: {},
      assisted: {},
    };
    // Humans keep the latest spelling; a non-human's is pinned by its key.
    bucket.name = name;
    contributorMap.set(key, bucket);
    return bucket;
  };

  for (const [index, commit] of commits.entries()) {
    const row = commitRows[index];
    if (!row) {
      continue;
    }
    // Resolve first so aliases of one person land in a single bucket.
    const author = config.resolveContributor(
      commit.authorEmail,
      commit.authorName,
    );
    const authorBucket = bucketFor(author, commit.authorName);
    authorBucket.commits += 1;
    authorBucket.added += row.added;
    authorBucket.deleted += row.deleted;

    // Only cross-kind help is recorded: a human thanking a human (or one agent
    // crediting another) is ordinary collaboration, and what these bars show is
    // the traffic *between* kinds. Crediting yourself is same-kind by
    // definition, so that one check covers it too. The set dedupes a trailer
    // repeated within one commit — help given twice is still one commit helped.
    const helpers = new Set<ContributorBucket>();
    for (const identity of coAuthorsOf(commit)) {
      const { name, resolved } = resolveCoAuthor(identity);
      if (resolved.kind !== author.kind) {
        helpers.add(bucketFor(resolved, name));
      }
    }

    const helperKinds = new Set<ContributorKind>();
    for (const helper of helpers) {
      helper.assisted[author.kind] = (helper.assisted[author.kind] ?? 0) + 1;
      helperKinds.add(helper.kind);
    }
    // Counted once per helper *kind*, so one commit credited to two agents is
    // one AI-assisted commit rather than two.
    for (const kind of helperKinds) {
      authorBucket.assistedBy[kind] = (authorBucket.assistedBy[kind] ?? 0) + 1;
    }
  }

  const sumCounts = (
    counts: Partial<Record<ContributorKind, number>>,
  ): number => Object.values(counts).reduce((total, count) => total + count, 0);
  /** Ranking weight: authoring and helping both count as taking part. */
  const involvementOf = (bucket: ContributorBucket): number =>
    bucket.commits + sumCounts(bucket.assisted);
  /** Emitted as absent rather than `{}` so the JSON stays lean. */
  const countsOrUndefined = (
    counts: Partial<Record<ContributorKind, number>>,
  ) => (Object.keys(counts).length === 0 ? undefined : counts);

  // Capped per kind rather than overall, at exactly what the dashboard's bar
  // list shows: a repo with hundreds of humans would otherwise crowd out the
  // handful of agents and bots the kind filter exists to reveal.
  const perKindCap = config.maxInCharts * 2;
  const keptPerKind: Record<ContributorKind, number> = {
    human: 0,
    bot: 0,
    ai: 0,
  };
  const contributors = [...contributorMap.values()]
    .toSorted((left, right) => involvementOf(right) - involvementOf(left))
    .filter((bucket) => {
      if (keptPerKind[bucket.kind] >= perKindCap) {
        return false;
      }
      keptPerKind[bucket.kind] += 1;
      return true;
    })
    .map((bucket) => ({
      ...bucket,
      assistedBy: countsOrUndefined(bucket.assistedBy),
      assisted: countsOrUndefined(bucket.assisted),
    }));

  return {
    generatedAt: new Date().toISOString(),
    config: {
      contributors: { maxInCharts: config.maxInCharts },
      charts: { weekStartsOn: config.weekStartsOn },
    },
    repo: {
      // The remote is the name people know the repo by; the checkout directory
      // is whatever the machine happened to clone into ("analyzed" on CI).
      name: remoteUrl?.split("/").at(-1) ?? path.basename(repoRoot),
      remoteUrl,
      commitCount: commits.length,
      contributorCount: contributorMap.size,
      firstCommitDate: span.first,
      firstCommitSha: commits.at(0)?.sha.slice(0, 10),
      lastCommitDate: span.last,
      lastCommitSha: commits.at(-1)?.sha.slice(0, 10),
    },
    commits: commitRows,
    languages,
    fileTypes,
    directives,
    dependencies,
    topRules,
    survival,
    contributors,
  };
};

const writeSqlite = (
  dbPath: string,
  commits: readonly CommitFacts[],
): number => {
  const db = new DatabaseSync(dbPath);
  try {
    db.exec("PRAGMA journal_mode = WAL");
    db.exec(`
      CREATE TABLE commits (
        sha TEXT PRIMARY KEY,
        authored_at TEXT NOT NULL,
        committed_at TEXT NOT NULL,
        author_email TEXT NOT NULL,
        author_name TEXT NOT NULL
      );
      CREATE TABLE facts (
        id INTEGER PRIMARY KEY,
        commit_sha TEXT NOT NULL REFERENCES commits (sha),
        collector TEXT NOT NULL,
        metric TEXT NOT NULL,
        value REAL NOT NULL,
        categories TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX facts_by_metric ON facts (metric, commit_sha);
      CREATE INDEX facts_by_collector ON facts (collector);
    `);

    const insertCommit = db.prepare(
      "INSERT INTO commits (sha, authored_at, committed_at, author_email, author_name) VALUES (?, ?, ?, ?, ?)",
    );
    const insertFact = db.prepare(
      "INSERT INTO facts (commit_sha, collector, metric, value, categories) VALUES (?, ?, ?, ?, ?)",
    );

    let factCount = 0;
    db.exec("BEGIN");
    for (const commit of commits) {
      insertCommit.run(
        commit.sha,
        commit.authoredAt,
        commit.committedAt,
        commit.authorEmail,
        commit.authorName,
      );
      for (const [collector, facts] of commit.factsByCollector) {
        for (const fact of facts) {
          insertFact.run(
            commit.sha,
            collector,
            fact.metric,
            fact.value,
            JSON.stringify(fact.categories ?? {}),
          );
          factCount += 1;
        }
      }
    }
    db.exec("COMMIT");
    return factCount;
  } finally {
    db.close();
  }
};

export const runIndex = ({
  repoPath,
}: {
  readonly repoPath: string;
}): Effect.Effect<void, Error, ChildProcessSpawner.ChildProcessSpawner> =>
  Effect.gen(function* () {
    const repoRoot = yield* resolveRepoRoot(repoPath);
    const config = yield* loadConfig(repoRoot);
    const catalogPath = config.catalogPath;
    const commitsPath = path.join(catalogPath, "commits");
    const registry = new Map(
      builtInCollectors.map((collector) => [collector.name, collector]),
    );

    const gitCommits = yield* listCommits(repoRoot);
    const firstParentShas = yield* listFirstParentShas(repoRoot);
    const remoteUrl = yield* readRemoteUrl(repoRoot);
    const catalogShas = new Set(
      yield* Effect.tryPromise(async () => {
        try {
          return await readdir(commitsPath);
        } catch {
          return [];
        }
      }),
    );

    // Oldest first so every derived series is naturally chronological, ordered
    // by the very committer date snapshots are plotted against: `git log` order
    // almost always agrees, but a skewed clock can put it out of step, and a
    // timeline whose x coordinate moves backwards draws as a zigzag rather than
    // a curve. Reversed before sorting, so commits sharing a committer date (a
    // rebased batch lands with one) keep git's parent-before-child order.
    const orderedCommits = gitCommits
      .toReversed()
      .filter((commit) => catalogShas.has(commit.hash))
      .toSorted(
        (left, right) =>
          Date.parse(left.committerDate) - Date.parse(right.committerDate),
      );

    if (orderedCommits.length === 0) {
      return yield* new NoCollectedCommitsError({ commitsPath });
    }

    // Concurrent reads still land in input (chronological) order — forEach
    // preserves element order in the collected results.
    const readOutcomes = yield* Effect.forEach(
      orderedCommits,
      (commit) =>
        Effect.tryPromise(async () => {
          const commitDir = path.join(commitsPath, commit.hash);
          const onMainline = firstParentShas.has(commit.hash);
          const factsByCollector = new Map<string, readonly Fact[]>();
          let unknownCollectorDirs = 0;
          let offMainlineSnapshots = 0;
          for (const collectorName of await readdir(commitDir)) {
            const collector = registry.get(collectorName);
            if (!collector) {
              unknownCollectorDirs += 1;
              continue;
            }
            // Snapshots taken off the mainline (by an older version of this
            // tool, or before a rebase moved the commit aside) would show up
            // as cliffs in every timeline. Leave them in the catalog but out
            // of the cube.
            if (!onMainline && describesTreeState(collector)) {
              offMainlineSnapshots += 1;
              continue;
            }
            const raw: unknown = JSON.parse(
              await readFile(
                path.join(commitDir, collectorName, "output.json"),
                "utf8",
              ),
            );
            factsByCollector.set(collectorName, collector.normalize(raw));
          }
          const facts: CommitFacts = {
            sha: commit.hash,
            authoredAt: commit.authorDate,
            committedAt: commit.committerDate,
            authorEmail: commit.authorEmail,
            authorName: commit.authorName,
            factsByCollector,
          };
          return { facts, unknownCollectorDirs, offMainlineSnapshots };
        }),
      { concurrency: 16 },
    );

    const commitFacts = readOutcomes.map((outcome) => outcome.facts);
    const unknownCollectorDirs = readOutcomes.reduce(
      (total, outcome) => total + outcome.unknownCollectorDirs,
      0,
    );
    const offMainlineSnapshots = readOutcomes.reduce(
      (total, outcome) => total + outcome.offMainlineSnapshots,
      0,
    );

    const indexDir = path.join(catalogPath, "index");
    yield* Effect.tryPromise(() => mkdir(indexDir, { recursive: true }));

    const dbPath = path.join(indexDir, "metrics.sqlite");
    yield* Effect.tryPromise(() => rm(dbPath, { force: true }));
    const factCount = yield* Effect.try(() => writeSqlite(dbPath, commitFacts));

    const dashboardData = buildDashboardData(
      repoRoot,
      commitFacts,
      config,
      remoteUrl,
    );
    const dashboardPath = path.join(indexDir, "dashboard.json");
    yield* Effect.tryPromise(() =>
      writeFile(dashboardPath, JSON.stringify(dashboardData), "utf8"),
    );

    yield* Console.log(
      [
        `Indexed ${commitFacts.length} commits into ${factCount} facts.`,
        `Cube: ${dbPath}`,
        `Dashboard data: ${dashboardPath}`,
        ...(unknownCollectorDirs > 0
          ? [
              `Skipped ${unknownCollectorDirs} outputs from unknown collectors (see \`gc --stale\`).`,
            ]
          : []),
        ...(offMainlineSnapshots > 0
          ? [
              `Skipped ${offMainlineSnapshots} tree snapshots taken off HEAD's first-parent chain.`,
            ]
          : []),
      ].join("\n"),
    );

    yield* warnAboutIgnoreFiles({ repoRoot, config });
  });
