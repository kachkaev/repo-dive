---
name: editing-effect-code
description: 'Effect v4 (beta) conventions for this repo''s CLI code: tagged errors with typed channels, layers provided only at the entrypoint, Result for fallible sync parsers, no shared mutation under concurrency, Clock/DateTime for time, it.effect tests. Use when writing or reviewing any code that imports from "effect".'
license: MIT
metadata:
  author: kachkaev
  version: "1.0.0"
---

# Editing Effect code

This repo pins `effect@4.0.0-rc.x` — a v4 **release candidate**, while most online docs and LLM training data describe v3.
When unsure whether an API exists or what it is called, check the installed package (`node_modules/effect/dist/*.d.ts`) or a clone of [Effect-TS/effect](https://github.com/Effect-TS/effect) at the pinned version — not memory.
Notable v4 renames: `Effect.catch` (was `catchAll`), `Result` (replaces `Either`), `Schema.TaggedErrorClass` (was `Schema.TaggedError`), `Effect.callback` (was `Effect.async`).

## Errors

Define errors as `Data.TaggedError` classes with fields, computing the human message in a getter.
Use `Schema.TaggedErrorClass` instead when the error crosses a serialization boundary (e.g. MCP tool `failure` schemas — see [`query.ts`](../../../src/cli/shared/query.ts)):

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

// Errors are yieldable: this fails the effect with GitCommandError.
const program = Effect.gen(function* () {
  return yield* new GitCommandError({ args, exitCode, stderr });
});
```

- **Keep typed unions in the error channel.**
  Never collapse to `Error` via `mapError(toError)`-style helpers; a union like `GitCommandError | PlatformError.PlatformError` still extends `Error`, so wider annotations downstream keep compiling.
- **Match on `_tag`, not `instanceof`**: `Effect.catchTag("GitCommandError", ...)`, or `Effect.catchIf((e) => e._tag === "..." && ..., ...)` for conditional recovery (non-matches re-fail with the original cause preserved).
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

- Acquire/release with `Effect.acquireRelease` inside `Effect.scoped` (releases run in reverse order, even on interrupt) — see [`with-temporary-worktree.ts`](../../../src/cli/shared/scan/with-temporary-worktree.ts).
- `Effect.scoped` wraps `ChildProcess.make` handles; drain stdout/stderr/exitCode concurrently with `Effect.all({...}, { concurrency: "unbounded" })` to avoid pipe deadlock.
- Decode a byte stream to one string with `stream.pipe(Stream.decodeText(), Stream.mkString)`.
- `Console.log`/`Console.error` are correct for user-facing CLI output (upstream's own CLI does the same); `Effect.log*` is for leveled diagnostics.

## Flags

The v4 parser negates boolean flags automatically (`--no-x`).
Since rc.110, an omitted boolean flag is a parse error ("Missing required flag") rather than `false`, so every `Flag.boolean` needs `Flag.withDefault(false)` — or `Flag.withDefault(true)` for a default-true flag, which now works (`--no-x` still parses to `false`):

```ts
force: Flag.boolean("force").pipe(Flag.withDefault(false), ...),
open: Flag.boolean("open").pipe(Flag.withDefault(true), ...),
```

Never name a flag `no-something`.

## Tests

- Effectful tests use `@effect/vitest`: `it.effect("...", () => Effect.gen(function* () {...}))`, cleanup via `Effect.ensuring(Effect.sync(() => ...))`, expected failures via `Effect.flip`, platform services via `Effect.provide(NodeServices.layer)`.
- Pure-function tests stay plain vitest (`test(...)`) — don't wrap what has no effects.

## Deliberate exceptions (don't "fix" these)

- The `Collector` plugin contract keeps `Error` in its error channel: collectors produce heterogeneous failures, and tagged errors still flow through it.
- Lenient hand-rolled JSON guards in collectors' `normalize` and the lockfile parsers are intentional (hot path, "skip on mismatch" semantics) — don't rewrite them with Schema.
