import { Data, Effect, type PlatformError, Stream } from "effect";
import {
  ChildProcess,
  type ChildProcessSpawner,
} from "effect/unstable/process";

class GitCommandError extends Data.TaggedError("GitCommandError")<{
  readonly args: readonly string[];
  readonly exitCode: number;
  readonly stderr: string;
}> {
  override get message(): string {
    return `${this.args.join(" ")} exited with code ${this.exitCode}${
      this.stderr ? `:\n${this.stderr.trim()}` : ""
    }`;
  }
}

export type CommandError = GitCommandError | PlatformError.PlatformError;

const captureStream = <E, R>(stream: Stream.Stream<Uint8Array, E, R>) =>
  stream.pipe(Stream.decodeText(), Stream.mkString);

/**
 * Runs a command and captures its stdout, failing on unexpected exit codes.
 * For git, the repo path is passed via `git -C` instead of a working directory
 * to keep the invocation explicit.
 */
export const runCommand = (
  command: string,
  args: readonly string[],
  options?: {
    /** Extra exit codes to treat as success (e.g. 1 for `git grep` with no matches). */
    readonly okExitCodes?: readonly number[];
    readonly cwd?: string;
  },
): Effect.Effect<
  string,
  CommandError,
  ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* ChildProcess.make(command, [...args], {
        stdin: "ignore",
        ...(options?.cwd === undefined ? {} : { cwd: options.cwd }),
      });

      const { stdout, stderr, exitCode } = yield* Effect.all(
        {
          stdout: captureStream(handle.stdout),
          stderr: captureStream(handle.stderr),
          exitCode: handle.exitCode,
        },
        { concurrency: "unbounded" },
      );

      if (exitCode !== 0 && !options?.okExitCodes?.includes(exitCode)) {
        return yield* new GitCommandError({
          args: [command, ...args],
          exitCode,
          stderr,
        });
      }

      return stdout;
    }),
  );

export const runGit = (
  args: readonly string[],
  options?: { readonly okExitCodes?: readonly number[] },
): Effect.Effect<
  string,
  CommandError,
  ChildProcessSpawner.ChildProcessSpawner
> => runCommand("git", args, options);

/**
 * Runs a command with `input` written to stdin and stdout captured as raw
 * bytes — needed for `git cat-file --batch`, whose framing is byte-length
 * based and must not pass through text decoding.
 */
export const runCommandBytes = (
  command: string,
  args: readonly string[],
  options: { readonly input: string },
): Effect.Effect<
  Uint8Array,
  CommandError,
  ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* ChildProcess.make(command, [...args], {
        stdin: Stream.make(new TextEncoder().encode(options.input)),
      });

      const chunks: Uint8Array[] = [];
      const { stderr, exitCode } = yield* Effect.all(
        {
          collect: Stream.runForEach(handle.stdout, (chunk) =>
            Effect.sync(() => {
              chunks.push(chunk);
            }),
          ),
          stderr: captureStream(handle.stderr),
          exitCode: handle.exitCode,
        },
        { concurrency: "unbounded" },
      );

      if (exitCode !== 0) {
        return yield* new GitCommandError({
          args: [command, ...args],
          exitCode,
          stderr,
        });
      }

      const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const result = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }
      return result;
    }),
  );
