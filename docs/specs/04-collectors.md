# Collectors

_Draft.
Collectors are the pluggable "tools" of the map phase: each one knows how to extract one kind of raw snapshot from a commit._

## Interface sketch

```ts
type Collector = {
  readonly name: string; // "languages", "eslint", …
  readonly description: string; // one line, shown by `repo-dive collectors`
  readonly version: string; // bump to invalidate previous outputs
  /** Config slice that shapes collected output; folded into the cache fingerprint */
  readonly cacheConfig?: (config: ResolvedConfig) => unknown;
  readonly strategy: "log" | "tree" | "worktree";
  /** Which commits to run on unless `scan --sample` overrides it */
  readonly defaultSampling: SamplingPolicy;
  /** Produce raw output for one commit; persisted verbatim into the catalog */
  readonly collect: (context: CollectContext) => Effect.Effect<unknown, Error>;
  /** Optional bulk path: many commits in O(1) subprocesses (see below) */
  readonly collectBatch?: (context: {
    readonly repoRoot: string;
    readonly shas: ReadonlySet<string>;
  }) => Effect.Effect<ReadonlyMap<string, unknown>, Error>;
  /** Turn one raw output into facts for the cube (pure, re-runnable) */
  readonly normalize: (raw: unknown) => readonly Fact[];
};

type CollectContext = {
  readonly repoRoot: string;
  readonly sha: string;
  /** This collector's cache fingerprint; pass it to content caches */
  readonly cacheKey: string;
  /** Present only for `worktree` collectors: a detached checkout of the commit */
  readonly worktreePath?: string | undefined;
};

type Fact = {
  readonly metric: string; // "languages.lines", "churn.added", …
  readonly value: number;
  readonly categories?: Readonly<Record<string, string>>;
  // e.g. { language: "TypeScript" } or { rule: "no-unused-vars", severity: "error" }
};
```

Raw output is typed `unknown` on purpose: it is written to the catalog as JSON and read back from there, so `normalize` re-parses rather than trusting an in-memory shape.

The `collect`/`normalize` split mirrors the catalog's raw-before-derived principle: `collect` is expensive and runs once per (commit, cache fingerprint); `normalize` is cheap, pure and re-runnable whenever indexing logic improves.
Because `normalize` re-runs on every `index`, config that only affects normalization must **not** feed `cacheConfig` — only config that changes the collected output belongs in the fingerprint.

## Collection strategies

Ordered by cost; the strategy tells the runner what context a collector needs:

1.  **`log`** — derived from commit metadata / `git log --numstat` only.
    Near-free, runs on every commit.
    (Examples: commit metadata, churn, author stats.)
1.  **`tree`** — reads the commit's tree and file contents from the object database (`git ls-tree`, `git cat-file`) without touching the filesystem.
    Cheap, and cacheable per blob when the result depends on content alone (see [content caching](#content-caching)).
    (Examples: file size distributions, suppression-comment counts, line survival.)
1.  **`worktree`** — needs a real checkout: the runner materializes the commit via `git worktree add` in a temporary directory and hands the collector a path.
    Expensive; sampled by default.
    (Examples: ESLint, type-checking, building, test counting — anything that needs `node_modules` or real files.)

## Sampling

Every-commit collection is the semantic default, but expensive collectors need a budget.
Each collector declares a `defaultSampling`; `scan --sample POLICY` overrides it for every collector in the run.
Policies:

- `all` — every commit (the default for the cheap `log` and `tree` collectors)
- `weekly` / `monthly` / `quarterly` — the newest commit of each period, so HEAD is always sampled (`survival` defaults to `monthly`)
- `every-nth:<n>` — a count-based budget, taken over the newest-first commit list
- Tags/releases as natural sample points (future)

Period buckets are computed from the committer date in UTC (ISO weeks for `weekly`) — sampling picks the snapshots that state-over-time charts are drawn from, so it shares their clock (see [author date vs committer date](#author-date-vs-committer-date)).
A policy therefore asks for one snapshot per week or month of the repository's own history, and a rebased commit belongs to the period it landed in rather than the one it was written in.

Which commits a collector was actually run on stays visible in the cube (facts carry the collector that produced them), so charts can interpolate honestly rather than pretending to be continuous.

`tree` and `worktree` collectors sample the **mainline only**: HEAD's first-parent chain, extended backwards across **founding grafts**.
Their output describes the state of the tree, and only mainline commits are states the repository actually passed through: a commit on a merged side branch — or one that arrived with a foreign history absorbed mid-life by an unrelated-histories merge — carries a tree that was never HEAD, so sampling it puts a cliff into the timeline.
`log` collectors see every commit, since a commit's own authorship and diff are facts wherever it sits in the graph.

A repository migration (monorepo assembly, host move, history rewrite) cuts the plain first-parent chain short: effect's monorepo starts at a fresh "workspace skeleton" root from December 2023 whose next commits merge in the histories of the eight repositories it absorbed, so first-parent-only snapshots would begin four years after the project did.
The migration leaves a recognizable signature — a root followed by an unbroken run of merges absorbing histories that end before the root begins — and the mainline follows it: when such a **founding graft** exists, the absorbed history reaching back furthest continues the chain (recursively, in case that history was itself founded by a migration).
Both conditions are load-bearing: a foreign history vendored later in the repository's life sits above an ordinary commit rather than in the founding window, and a sibling repository absorbed while mainline development continued overlaps the timeline instead of preceding it — neither continues the chain, however old its commits are.

## Author date vs committer date

Git gives every commit two timestamps, and under a rebase or squash-merge workflow they are genuinely different facts: the **author** date is when the work was written, the **committer** date is when it became part of the history.
On ollama's mainline the two differ for 24% of commits, by a median of 13 hours and a maximum of 113 days.

Which one a series uses is decided by the **shape of the series**, not by its subject matter.
Asking "is this chart about people or about the repository?" sounds like the right question and isn't — a commit is honestly both.
Ask instead what the x axis _is_:

1.  **A sampled state variable** — "at time _T_ the tree held _V_ lines". The x coordinate is the instant the measurement was valid.
    Use the **committer date**.
    This is not a preference: the author date does not increase along the first-parent chain (ollama's steps backwards 364 times), so a chart drawn against it doubles back on itself and every stacked area zigzags.
    The committer date is monotonic there by construction, because rebasing rewrites it.
    Covers: lines by language, file types, suppression directives, dependencies, code-survival totals, and the period buckets [sampling](#sampling) picks snapshots for.
1.  **A histogram of objects binned by one of their own date attributes** — "how many commits fell in this day", "how many living lines were written in this year". The x coordinate is a property of the things being counted, so bin order is irrelevant and monotonicity buys nothing.
    Use **the attribute the chart claims to show**, which for anything counting work is the **author date**.
    Covers: the commit calendar, commits per month, churn per month, the "AI commits in the last 90 days" stat, and code-survival cohorts.

The second rule is load-bearing rather than cosmetic, because two charts on the same page have to agree.
Survival cohorts come from `git blame`, which reports `author-time` — a line written in June and merged in July belongs to the June cohort, and the label says so ("the year each line was written").
If churn were binned by the committer date, that same line would be counted as added in July, and "lines added in month M" would stop matching "lines in cohort M".
Only the author date keeps them the same lines.

Two consequences worth knowing:

- **Only the author date is at risk from bad data.** Nothing validates it — settable via `GIT_AUTHOR_DATE`, taken from the author's machine clock, preserved through imports and grafts — so an imported or clock-skewed history corrupts the histograms.
  It can never corrupt the timelines, which is a real argument for the committer date that the shape rule overrides rather than answers.
- **The dashboard's axis range spans both.** `repo.firstCommitDate` / `lastCommitDate` are the outer edges of the two clocks — earliest authored, latest landed — so the author-dated calendar and the committer-dated timelines both fit inside them.

Both dates are recorded in the [cube](05-metrics-cube.md) as `commits.authored_at` and `commits.committed_at`, so queries can pick either, and lead-time metrics — how long work sits before it lands — stay possible later.
Attribution is a separate axis and always keys off the author: see [config](07-config.md).

Attribution is unaffected and still keys off the **author**: see [config](07-config.md).

## Incrementality

The unit of work is **(commit, collector, cache fingerprint)** — the fingerprint being a short hash of the collector version and the config it depends on.
Before running, the scanner diffs the plan against `collector.json` sidecars already in the catalog and only schedules the gap.
Interrupting a scan loses at most the in-flight commits; re-running continues where it stopped.
Effect's structured concurrency handles parallelism (several collectors per commit, several commits in flight) with clean cancellation.

## Batch collection

`collect` is defined per commit, which for a `log` collector means one `git show` subprocess per commit — on a 30k-commit repository, the difference between minutes and hours.
A collector that can answer for many commits in a single pass therefore also implements the optional **`collectBatch`**: it receives the repo root and the set of shas still to do, and returns a map from sha to raw output.

`scan` runs a batch phase before the per-commit walk.
For each collector with a `collectBatch`, it works out which of its planned shas lack a current sidecar, hands that set over, and writes every returned output through the same catalog path a per-commit run would use — same `output.json`, same `collector.json` fingerprint.
Shas the batch covered are then removed from the per-commit walk.

The contract a collector must honor:

- **Same output shape as `collect`.** The two paths write into one catalog and `normalize` cannot tell them apart, so a value produced in batch must be indistinguishable from the per-commit one. In practice both call the same parser.
- **Partial results are allowed.** Any sha missing from the returned map falls back to `collect`, so a batch pass may cover what is convenient (e.g. only commits `git log` reaches) and skip the rest. Returning an empty map is legal and simply degrades to the per-commit path.
- **Only requested shas.** Every entry of the returned map is written to the catalog, including one for a sha nobody asked about, so a batch pass must filter its stream against `shas` rather than dumping the whole history.
- **Whole-pass failure is not fatal.** A failing `collectBatch` is recorded as one failure and the scan continues per commit.
- **No worktree, no cache key.** The batch context carries neither, so this is a fit for `log` collectors reading history in bulk, not for collectors that need a checkout or a content cache.

Implemented by `commit-meta` and `churn`: both replace one `git show` per commit with a single `git log` pass (`--format` with a record separator, plus `--numstat` for churn), parsing the stream into per-commit records.

## Content caching

Tree collectors face the mirror-image problem: successive commits share almost their whole tree, so scanning every file of every commit re-reads bytes that have not changed.
Collectors whose per-file result depends on **content alone** therefore compute per blob and cache by blob sha, in `.repo-dive/cache/blob-cache.sqlite` — see [catalog](03-catalog.md#blob-cache) for the store itself.

A collector opts in by calling one of the shared helpers instead of walking the tree itself, passing the `cacheKey` from its collect context so cached results share the collector's invalidation:

- `scanTreeWithBlobCache` — every source-like file in the tree (extension allowlist, `node_modules`/`dist`/lockfiles excluded), for a `(content) => result` scan. Used by `directives` and `todo-comments`.
- `scanTreeFilesWithBlobCache` — files selected by path predicate, for a `(content, filePath) => result` scan. Used by `dependencies` to parse lockfiles and `package.json` manifests.

Both return one result per file path in the tree; merging those into the commit's raw output stays the collector's job.
The scan function must be pure and its result JSON-serializable — it is the value that gets cached, and it is reused for identical content under a different path.

## Built-in roster

Implemented, in `src/cli/shared/collectors/` (strategy, then default sampling where it is not `all`):

1.  **commit-meta** (`log`) — author/committer identities, dates, parents, subject and trailers incl. co-authors; the base everything else joins against. Batched.
1.  **churn** (`log`) — lines added/deleted per commit vs first parent, by file extension. Batched.
1.  **file-types** (`tree`) — file count and bytes per extension at the commit's tree, straight from `git ls-tree -l`.
1.  **directives** (`tree`) — ESLint suppression comments by rule (block disables counted as gray areas) and `@ts-ignore`/`@ts-expect-error`/`@ts-nocheck` counts. Blob-cached.
1.  **dependencies** (`tree`) — total resolved packages from package-manager lockfiles, per package manager (pnpm, npm, yarn; parser registry keyed by lockfile name generalizes to bun/cargo/…), plus direct/dev/optional dependencies and manifest counts read from `package.json` files (the authoritative source for what a project declares, so accurate even where a lockfile omits it).
    Blob-cached.
    Emits `dependencies.resolved`, `dependencies.direct` and `dependencies.manifest`.
1.  **todo-comments** (`tree`) — TODO/FIXME/HACK/XXX counts in source files. Blob-cached.
1.  **languages** (`tree`) — lines and file count per language, counted in-process over the source files of the commit's tree and labelled from the shared extension → language map.
    Blob-cached.
    It scans exactly the file set `survival` blames, so the dashboard's "Lines by language" chart shows the same totals with age shading on and off; an earlier version shelled out to `tokei`, which counted lockfiles and generated data the blame view could never account for.
1.  **survival** (`tree`, `monthly`) — living lines by extension, author and authoring-month cohort, via `git blame --line-porcelain` per file. The expensive one.

Planned next:

1.  **authors** (`log`) — commits/churn per author over time (mailmap-aware)
1.  **eslint** (`worktree`, sampled) — diagnostics by rule and severity — the proof that arbitrary external tools fit

## Third-party plugins (later)

Two candidate mechanisms, not mutually exclusive:

- **npm packages** (`repo-dive-collector-*`) default-exporting a `Collector`, loaded via dynamic import — idiomatic, TypeScript-friendly, but code execution requires trust.
- **Command protocol**: a config file maps a collector name to a shell command that receives a checkout path / commit sha and prints JSON — zero-code extensibility for anything (`tokei --output json` works as-is).

The built-in roster deliberately uses the same `Collector` interface a plugin would, so the seam is proven before it is public.
