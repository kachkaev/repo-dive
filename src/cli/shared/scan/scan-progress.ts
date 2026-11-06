import { Clock, Console, Duration, Effect, Ref } from "effect";

/** How long a scan may stay silent before it says what it is waiting for. */
export const heartbeatIntervalMs = 30_000;

/** A duration that is being watched grow, so seconds stay: `2m 30s`, not `~2m`. */
export const formatElapsed = (milliseconds: number): string => {
  const seconds = Math.floor(milliseconds / 1000);
  return seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};

export type ScanProgress = {
  /** Prints a line, which also counts as the scan having said something. */
  readonly log: (line: string) => Effect.Effect<void>;
  /** Names an effect in the heartbeat lines for as long as it runs. */
  readonly track: <A, E, R>(
    label: string,
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>;
};

/**
 * Keeps a long scan from looking frozen. Most of a resumed scan is reading
 * outputs that already exist, so the counter races ahead and then stops short of
 * the end while one expensive collector (blaming a whole tree, say) takes minutes
 * more. When nothing was printed for a while, this says what is still running.
 *
 * `describeProgress` starts each such line and is read when the line is printed.
 */
export const withScanProgress = <A, E, R>(
  describeProgress: Effect.Effect<string>,
  body: (progress: ScanProgress) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.scoped(
    Effect.gen(function* () {
      const lastLineAt = yield* Ref.make(yield* Clock.currentTimeMillis);
      // In insertion order, so what has been running the longest comes first.
      const running = yield* Ref.make<ReadonlyMap<string, number>>(new Map());

      const log = (line: string): Effect.Effect<void> =>
        Effect.gen(function* () {
          yield* Console.log(line);
          yield* Ref.set(lastLineAt, yield* Clock.currentTimeMillis);
        });

      const track: ScanProgress["track"] = (label, effect) =>
        Effect.acquireUseRelease(
          Effect.gen(function* () {
            const startedAt = yield* Clock.currentTimeMillis;
            yield* Ref.update(running, (current) =>
              new Map(current).set(label, startedAt),
            );
          }),
          () => effect,
          () =>
            Ref.update(running, (current) => {
              const next = new Map(current);
              next.delete(label);
              return next;
            }),
        );

      const beat = Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        const silentForMs = now - (yield* Ref.get(lastLineAt));
        if (silentForMs < heartbeatIntervalMs) {
          yield* Effect.sleep(
            Duration.millis(heartbeatIntervalMs - silentForMs),
          );
          return;
        }
        const runs = (yield* Ref.get(running))
          .entries()
          .map(
            ([label, startedAt]) =>
              `${label} (${formatElapsed(now - startedAt)})`,
          )
          .toArray();
        yield* log(
          `${yield* describeProgress}, ${
            runs.length > 0
              ? `still running: ${runs.join(", ")}`
              : "still working"
          }…`,
        );
      });
      yield* Effect.forkScoped(Effect.forever(beat));

      return yield* body({ log, track });
    }),
  );
