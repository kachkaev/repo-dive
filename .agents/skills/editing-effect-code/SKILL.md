---
name: editing-effect-code
description: 'Effect v4 conventions for this repo''s CLI code: start from the version-matched agent guide Effect ships in node_modules/effect/AGENTS.md, then apply this repo''s rules and deliberate departures from it — Data.TaggedError for in-process errors, layers provided only at the entrypoint, Result for fallible sync parsers, no shared mutation under concurrency, Clock/DateTime for time, exit-code-aware child processes, CLI flag quirks. Use when writing or reviewing any code that imports from "effect".'
license: MIT
metadata:
  author: kachkaev
  version: "1.0.0"
---

# Editing Effect code

## Start from Effect's own guide

Effect ships agent documentation inside its npm package, matching the installed version exactly.
Read it before writing Effect code — most online docs and LLM training data describe v3 or the v4 betas, whose names kept changing until the stable release:

- [`node_modules/effect/AGENTS.md`](../../../node_modules/effect/AGENTS.md) is the official guide: `Effect.gen` and `Effect.fn`, `Schema`, services and layers, errors, resources, streams, testing, child processes, CLI and AI modules.
  Read the sections relevant to the task.
  `@effect/platform-node` and `@effect/vitest` ship identical copies, so one read covers all three packages.
- `node_modules/effect/ai-docs/src/` holds the runnable examples that `AGENTS.md` links to with `./ai-docs/...` paths.
  The closest to this repo are `60_child-process`, `70_cli`, `71_ai/20_tools.ts` (`Tool` and `Toolkit`, which the MCP server builds on) and `09_testing`.
- `node_modules/effect/src/` is the source with JSDoc — check an API there instead of recalling it.

`node_modules` is gitignored, so default searches skip it: pass these paths explicitly.
For what the package does not ship (`MIGRATION.md`, `packages/effect/SCHEMA.md`, tests), use a clone of [Effect-TS/effect](https://github.com/Effect-TS/effect) checked out at the installed version's tag, e.g. `effect@4.0.0` — `AGENTS.md` links `SCHEMA.md` on `main`, which may be ahead.
Effect's [LLM guide](https://effect.website/blog/the-one-weird-git-trick-that-makes-coding-agents-more-effect-ive) vendors that repository with `git subtree`; this repo doesn't, because the installed package is pinned to our version while a subtree tracks `main`.

Follow `AGENTS.md` unless this skill says otherwise.
Much of the existing code predates it — notably 30-odd `(…) => Effect.gen(…)` wrappers and local `isRecord` helpers.
Write new and rewritten code the guide's way (`Effect.fn` / `Effect.fnUntraced`, `Predicate.isObject`), and leave untouched code to dedicated migration PRs rather than churning it in unrelated changes.

## Where this repo departs from `AGENTS.md`

These are deliberate — don't "fix" them:

- **In-process errors use `Data.TaggedError`**, not the guide's `Schema.TaggedError`.
  They are never encoded, so a schema for every field would buy nothing.
  Errors that do cross a serialization boundary use `Schema.TaggedError` — e.g. MCP tool `failure` schemas in [`query.ts`](../../../src/cli/shared/query.ts).
- **No `Context.Service` of our own yet.**
  Shared logic is plain functions that declare platform services in `R` (see below); add a service when a dependency needs a swappable implementation, not to wrap every module.
- **The `Collector` plugin contract keeps `Error` in its error channel**: collectors produce heterogeneous failures, and tagged errors still flow through it.
- **Lenient hand-rolled JSON guards** in collectors' `normalize` and the lockfile parsers are intentional (hot path, "skip on mismatch" semantics) — don't rewrite them with Schema, though building them from `Predicate` helpers is fine.

## Errors

Compute the human message in a getter:

```ts
class GitCommandError extends Data.TaggedError("GitCommandError")<{
  readonly args: readonly string[];
  readonly exitCode: number;
  readonly stderr: string;
}> {
  override get message(): string {
    return `${this.args.join(" ")} exited with code ${this.exitCode}`;
  }
}
```

- **Keep typed unions in the error channel.**
  Never collapse to `Error` via `mapError(toError)`-style helpers; a union like `GitCommandError | PlatformError.PlatformError` still extends `Error`, so wider annotations downstream keep compiling.
- **Match on `_tag`, not `instanceof`** — `Effect.catchIf((e) => e._tag === "..." && ..., ...)` for conditional recovery (non-matches re-fail with the original cause preserved).
- **Wrap, don't stringify.**
  When wrapping a child error, carry it in a `cause` field and compute the display string in `get message()` — never bake `error.message` into a new error's string.
- `Effect.try` / `Effect.tryPromise`: use the single-argument form (failures become tagged `Cause.UnknownError`) when the failure has no domain meaning; use `{ try, catch: (cause) => new SomeTaggedError({ cause }) }` when it does.
  No `toError` helpers.
- A missing binary spawns as `PlatformError` with `reason._tag === "NotFound"` — match that, not `message.includes("ENOENT")`.
- Only `export` an error class if another module actually references it (knip enforces this).

## Services and layers

`Effect.provide(NodeServices.layer)` happens **exactly once**, in [`cli.ts`](../../../src/cli.ts).
Everything else declares its requirements in `R` and lets them flow:

```ts
export const runGit = (
  args: readonly string[],
): Effect.Effect<
  string,
  CommandError,
  ChildProcessSpawner.ChildProcessSpawner
> => ...
```

Never `Effect.provide(...)` inside a shared helper — it builds fresh services per call and hides the dependency.
Tests provide the layer at the edge instead: `.pipe(Effect.provide(NodeServices.layer))`.

## CLI entrypoint

`Command.run(...) → Effect.provide(NodeServices.layer) → NodeRuntime.runMain` — no catch-all.
The framework owns `--help` (exit 0) and Ctrl+C in prompts (`Terminal.QuitError` → clean interrupt, exit code 130); let `QuitError` propagate out of `Prompt.run`.
For friendly one-line domain errors on stderr, [`cli.ts`](../../../src/cli.ts) catches non-`CliError` failures, prints `error.message`, and re-fails with a marker error carrying `[Runtime.errorReported] = false` so `runMain` keeps the exit code without double-logging.
Reuse that mechanism; don't add new catches or touch `process.exitCode`.

## Flags

The v4 parser negates boolean flags automatically (`--no-x`).
An omitted boolean flag is a parse error ("Missing required flag") rather than `false`, so every `Flag.Boolean` needs `Flag.withDefault(false)` — or `Flag.withDefault(true)` for a default-true flag (`--no-x` still parses to `false`):

```ts
force: Flag.Boolean("force").pipe(Flag.withDefault(false), ...),
open: Flag.Boolean("open").pipe(Flag.withDefault(true), ...),
```

Never name a flag `no-something`.

## Fallible sync functions

Return `Result`, not `X | Error` unions checked with `instanceof`:

```ts
const parse = (input: string): Result.Result<Policy, InvalidPolicyError> =>
  ok ? Result.succeed(policy) : Result.fail(new InvalidPolicyError({ input }));

// In an Effect: const policy = yield* Effect.fromResult(parse(input));
```

## Concurrency and state

Never mutate captured variables from inside `Effect.map`/`Effect.tap` callbacks running under `Effect.forEach(..., { concurrency: n })`.

- **Collect results instead**: `Effect.forEach` without `discard` returns results **in input order** even under concurrency — no push-into-array, no re-sorting.
- Cross-fiber counters (e.g. progress logging) use `Ref`: `const n = yield* Ref.updateAndGet(ref, (c) => c + 1)`.
- Local `let`/`push` inside a single sequential `Effect.gen` body is fine — the rule is about state shared across fibers.

## Time

No `Date.now()` or `new Date()` inside effects:

- Measure durations with `Effect.timed` → `[Duration, A]`, then `Duration.toMillis`.
- Read the clock with `yield* Clock.currentTimeMillis`.
- Timestamps: `const now = yield* DateTime.now;` then `DateTime.formatIso(now)`.

## Resources and processes

- Acquire/release with `Effect.acquireRelease` inside `Effect.scoped` — see [`with-temporary-worktree.ts`](../../../src/cli/shared/scan/with-temporary-worktree.ts).
- Run git and other commands through `runGit` / `runCommandBytes` in [`git.ts`](../../../src/cli/shared/git.ts), which fail with `GitCommandError` on unexpected exit codes.
  The `ChildProcessSpawner` helpers in Effect's example (`spawner.string`, `spawner.lines`) never fail on a non-zero exit, so they would silently swallow a failed `git` call.
- When spawning by hand, wrap the `ChildProcess.make` handle in `Effect.scoped` and drain stdout/stderr/exitCode concurrently with `Effect.all({...}, { concurrency: "unbounded" })` to avoid pipe deadlock; decode a byte stream with `stream.pipe(Stream.decodeText(), Stream.mkString)`.
- `Console.log`/`Console.error` are correct for user-facing CLI output (upstream's own CLI does the same); `Effect.log*` is for leveled diagnostics.

## Tests

- Effectful tests use `it.effect` from `@effect/vitest` (see `ai-docs/src/09_testing`), with platform services via `Effect.provide(NodeServices.layer)`, cleanup via `Effect.ensuring(Effect.sync(() => ...))` and expected failures via `Effect.flip`.
- Pure-function tests stay plain vitest (`test(...)`) — don't wrap what has no effects.
