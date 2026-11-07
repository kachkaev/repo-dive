import { expect, it, test } from "@effect/vitest";
import { Effect, Fiber } from "effect";
import { TestClock, TestConsole } from "effect/testing";

import {
  formatElapsed,
  heartbeatIntervalMs,
  type ScanProgress,
  withScanProgress,
} from "./scan-progress.ts";

test("formatElapsed keeps the seconds of a duration being watched", () => {
  expect(formatElapsed(0)).toBe("0s");
  expect(formatElapsed(59_999)).toBe("59s");
  expect(formatElapsed(60_000)).toBe("1m 0s");
  expect(formatElapsed(150_000)).toBe("2m 30s");
  expect(formatElapsed(3_600_000)).toBe("60m 0s");
});

/** Gives woken fibers the moment they need to print, on the real clock. */
const settle = TestClock.withLive(Effect.sleep(1));

const advance = (milliseconds: number) =>
  TestClock.adjust(milliseconds).pipe(Effect.andThen(settle));

const startScan = <E>(
  body: (progress: ScanProgress) => Effect.Effect<void, E>,
) =>
  withScanProgress(Effect.succeed("Scanned 1/2 commits"), body).pipe(
    Effect.forkChild,
    Effect.tap(settle),
  );

it.effect("names what is running, longest first, once output stops", () =>
  Effect.gen(function* () {
    const scan = yield* startScan(({ track }) =>
      Effect.all(
        [
          track("survival on abc", Effect.never),
          Effect.sleep(10_000).pipe(
            Effect.andThen(track("languages on def", Effect.never)),
          ),
        ],
        { concurrency: "unbounded", discard: true },
      ),
    );

    yield* advance(heartbeatIntervalMs - 1);
    expect(yield* TestConsole.logLines).toEqual([]);

    yield* advance(1);
    yield* advance(heartbeatIntervalMs);
    expect(yield* TestConsole.logLines).toEqual([
      "Scanned 1/2 commits, still running: survival on abc (30s), languages on def (20s)…",
      "Scanned 1/2 commits, still running: survival on abc (1m 0s), languages on def (50s)…",
    ]);

    yield* Fiber.interrupt(scan);
  }).pipe(Effect.provide(TestConsole.layer)),
);

it.effect("says it is still working when nothing is tracked", () =>
  Effect.gen(function* () {
    const scan = yield* startScan(() => Effect.never);

    yield* advance(heartbeatIntervalMs);
    expect(yield* TestConsole.logLines).toEqual([
      "Scanned 1/2 commits, still working…",
    ]);

    yield* Fiber.interrupt(scan);
  }).pipe(Effect.provide(TestConsole.layer)),
);

it.effect("stays quiet while regular lines keep coming", () =>
  Effect.gen(function* () {
    const scan = yield* startScan(({ log }) =>
      Effect.gen(function* () {
        yield* Effect.sleep(heartbeatIntervalMs - 1);
        yield* log("Scanned 250/500 commits");
        yield* Effect.sleep(heartbeatIntervalMs - 1);
        yield* log("Scanned 500/500 commits");
        yield* Effect.never;
      }),
    );

    yield* advance(heartbeatIntervalMs - 1);
    yield* advance(heartbeatIntervalMs - 1);
    expect(yield* TestConsole.logLines).toEqual([
      "Scanned 250/500 commits",
      "Scanned 500/500 commits",
    ]);

    // The silence is counted from the latest line, not from the start.
    yield* advance(heartbeatIntervalMs);
    expect(yield* TestConsole.logLines).toEqual([
      "Scanned 250/500 commits",
      "Scanned 500/500 commits",
      "Scanned 1/2 commits, still working…",
    ]);

    yield* Fiber.interrupt(scan);
  }).pipe(Effect.provide(TestConsole.layer)),
);

it.effect("forgets a run once it ends, even when it fails", () =>
  Effect.gen(function* () {
    const scan = yield* startScan(({ track }) =>
      track("survival on abc", Effect.fail("blame failed")).pipe(
        Effect.ignore,
        Effect.andThen(Effect.never),
      ),
    );

    yield* advance(heartbeatIntervalMs);
    expect(yield* TestConsole.logLines).toEqual([
      "Scanned 1/2 commits, still working…",
    ]);

    yield* Fiber.interrupt(scan);
  }).pipe(Effect.provide(TestConsole.layer)),
);

it.effect("stops the heartbeat once the body is done", () =>
  Effect.gen(function* () {
    const scan = yield* startScan(() => Effect.void);
    yield* Fiber.join(scan);

    yield* advance(heartbeatIntervalMs * 3);
    expect(yield* TestConsole.logLines).toEqual([]);
  }).pipe(Effect.provide(TestConsole.layer)),
);

it.effect("passes the body's failure through and stops the heartbeat", () =>
  Effect.gen(function* () {
    const scan = yield* startScan(() => Effect.fail("scan failed"));
    const error = yield* Fiber.join(scan).pipe(Effect.flip);
    expect(error).toBe("scan failed");

    yield* advance(heartbeatIntervalMs * 3);
    expect(yield* TestConsole.logLines).toEqual([]);
  }).pipe(Effect.provide(TestConsole.layer)),
);
