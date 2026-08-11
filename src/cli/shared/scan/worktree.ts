import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { type Cause, Effect } from "effect";
import type { ChildProcessSpawner } from "effect/unstable/process";

import { type CommandError, runGit } from "../git.ts";

/**
 * Materializes a commit into a detached temporary worktree, runs `use` and
 * always cleans up. The user's own working tree is never touched: the checkout
 * lives under the OS temp directory and is removed via `git worktree remove`.
 */
export const withTemporaryWorktree = <A, E, R>(
  repoRoot: string,
  sha: string,
  use: (worktreePath: string) => Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  E | CommandError | Cause.UnknownError,
  R | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.scoped(
    Effect.gen(function* () {
      const parentDir = yield* Effect.acquireRelease(
        Effect.tryPromise(() =>
          mkdtemp(path.join(os.tmpdir(), "repo-dive-wt-")),
        ),
        (dir) =>
          Effect.tryPromise(() =>
            rm(dir, { force: true, recursive: true }),
          ).pipe(Effect.ignore),
      );
      const worktreePath = path.join(parentDir, sha.slice(0, 12));

      // core.hooksPath=/dev/null keeps the analyzed repo's own hooks (husky,
      // mise, install-on-checkout, …) from running — the checkout must be inert.
      yield* Effect.acquireRelease(
        runGit([
          "-c",
          "core.hooksPath=/dev/null",
          "-C",
          repoRoot,
          "worktree",
          "add",
          "--detach",
          "--force",
          worktreePath,
          sha,
        ]),
        () =>
          runGit([
            "-C",
            repoRoot,
            "worktree",
            "remove",
            "--force",
            worktreePath,
          ]).pipe(Effect.ignore),
      );

      return yield* use(worktreePath);
    }),
  );
