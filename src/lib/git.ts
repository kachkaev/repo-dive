import { NodeServices } from "@effect/platform-node";
import { Effect, Stream } from "effect";
import { ChildProcess } from "effect/unstable/process";

export class GitCommandError extends Error {
  readonly args: readonly string[];
  readonly exitCode: number;
  readonly stderr: string;

  constructor(args: readonly string[], exitCode: number, stderr: string) {
    super(
      `git ${args.join(" ")} exited with code ${exitCode}${
        stderr ? `:\n${stderr.trim()}` : ""
      }`,
    );
    this.name = "GitCommandError";
    this.args = args;
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}

const captureStream = <E, R>(stream: Stream.Stream<Uint8Array, E, R>) =>
  stream.pipe(
    Stream.decodeText(),
    Stream.runFold(
      () => "",
      (output, chunk) => output + chunk,
    ),
  );

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error(String(error));

/**
 * Runs a git command and captures its stdout. The repo path is passed via
 * `git -C` instead of a working directory to keep the invocation explicit.
 */
export const runGit = (args: readonly string[]): Effect.Effect<string, Error> =>
  Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* ChildProcess.make("git", [...args], {
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

      if (Number(exitCode) !== 0) {
        return yield* Effect.fail(
          new GitCommandError(args, Number(exitCode), stderr),
        );
      }

      return stdout;
    }),
  ).pipe(Effect.mapError(toError), Effect.provide(NodeServices.layer));
