import { Data, Effect, type PlatformError, type Scope, Stream } from "effect";
import { ChildProcess, type ChildProcessSpawner } from "effect/process";

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
 * The repo path is passed via `git -C` rather than a working directory to keep
 * the invocation explicit.
 */
const runCommand = Effect.fnUntraced(function* (
  command: string,
  args: readonly string[],
  options?: {
    /** Extra exit codes to treat as success (e.g. 1 for `git grep` with no matches). */
    readonly okExitCodes?: readonly number[];
  },
): Effect.fn.Return<
  string,
  CommandError,
  ChildProcessSpawner.ChildProcessSpawner | Scope.Scope
> {
  const handle = yield* ChildProcess.make(command, [...args], {
    stdin: "ignore",
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
}, Effect.scoped);

export const runGit = Effect.fn("runGit")(function* (
  args: readonly string[],
  options?: { readonly okExitCodes?: readonly number[] },
): Effect.fn.Return<
  string,
  CommandError,
  ChildProcessSpawner.ChildProcessSpawner
> {
  return yield* runCommand("git", args, options);
});

/**
 * Runs a command with `input` written to stdin and stdout captured as raw
 * bytes — needed for `git cat-file --batch`, whose framing is byte-length
 * based and must not pass through text decoding.
 */
export const runCommandBytes = Effect.fn("runCommandBytes")(function* (
  command: string,
  args: readonly string[],
  options: { readonly input: string },
): Effect.fn.Return<
  Uint8Array,
  CommandError,
  ChildProcessSpawner.ChildProcessSpawner | Scope.Scope
> {
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
}, Effect.scoped);
