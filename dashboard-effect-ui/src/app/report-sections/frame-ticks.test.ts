// @vitest-environment happy-dom
import { expect, it } from "@effect/vitest";
import { Effect, Fiber, Stream } from "effect";
import { afterEach, vi } from "vitest";

import { frameFallbackMs, frameTicks } from "./frame-ticks.ts";

const hide = (hidden: boolean) => {
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => hidden,
  });
};

/**
 * Stands in for the browser's animation frames: each request gets an id, and
 * a frame fires on its own (a task later) only while `autoFire` is on;
 * otherwise the test fires it, late, or never.
 */
const fakeFrames = (options: { autoFire: boolean }) => {
  const pending = new Map<number, FrameRequestCallback>();
  let nextId = 1;
  const frames = {
    autoFire: options.autoFire,
    fire: (id: number) => {
      const callback = pending.get(id);
      pending.delete(id);
      callback?.(performance.now());
    },
    request: vi.fn((callback: FrameRequestCallback) => {
      const id = nextId++;
      pending.set(id, callback);
      if (frames.autoFire) {
        setTimeout(() => {
          frames.fire(id);
        }, 0);
      }
      return id;
    }),
    cancel: vi.fn((id: number) => {
      pending.delete(id);
    }),
  };
  vi.stubGlobal("requestAnimationFrame", frames.request);
  vi.stubGlobal("cancelAnimationFrame", frames.cancel);
  return frames;
};

const spyOnTimers = () => ({
  set: vi.spyOn(globalThis, "setTimeout"),
  clear: vi.spyOn(globalThis, "clearTimeout"),
});

/** The ids of the fallback timers set so far. */
const fallbackTimerIds = (
  timers: ReturnType<typeof spyOnTimers>,
): unknown[] => {
  const ids: unknown[] = [];
  for (const [index, call] of timers.set.mock.calls.entries()) {
    if (call[1] !== frameFallbackMs) {
      continue;
    }

    const id: unknown = timers.set.mock.results[index]?.value;
    ids.push(id);
  }
  return ids;
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  hide(false);
});

it.live("ticks on animation frames while the page is shown", () =>
  Effect.gen(function* () {
    hide(false);
    const frames = fakeFrames({ autoFire: true });
    const timers = spyOnTimers();

    const ticks = yield* Stream.runCollect(Stream.take(frameTicks, 3));
    expect(ticks).toHaveLength(3);
    expect(frames.request).toHaveBeenCalledTimes(3);
    // Each frame won its race, so each fallback timer was cleared, and no
    // frame was left to cancel.
    const timerIds = fallbackTimerIds(timers);
    expect(timerIds).toHaveLength(3);
    for (const id of timerIds) {
      expect(timers.clear).toHaveBeenCalledWith(id);
    }
    expect(frames.cancel).not.toHaveBeenCalled();
  }),
);

it.live("keeps ticking without animation frames while the page is hidden", () =>
  Effect.gen(function* () {
    hide(true);
    // A hidden tab gets no frames at all.
    const frames = fakeFrames({ autoFire: false });

    const ticks = yield* Stream.runCollect(Stream.take(frameTicks, 3));
    expect(ticks).toHaveLength(3);
    expect(frames.request).not.toHaveBeenCalled();
  }),
);

it.live("falls back to tasks while a frame is overdue on a shown page", () =>
  Effect.gen(function* () {
    hide(false);
    // An embedded webview out of sight: visible, yet no frames ever come.
    const frames = fakeFrames({ autoFire: false });
    const startedAt = performance.now();

    const ticks = yield* Stream.runCollect(Stream.take(frameTicks, 3));
    expect(ticks).toHaveLength(3);
    // One wait for a frame times out; the rest no longer wait for one.
    expect(frames.request).toHaveBeenCalledTimes(1);
    const elapsedMs = performance.now() - startedAt;
    expect(elapsedMs).toBeGreaterThanOrEqual(frameFallbackMs - 5);
    expect(elapsedMs).toBeLessThan(frameFallbackMs * 20);
    // The overdue frame stayed requested while the ticks ran on tasks, and
    // is released once the stream ends.
    expect(frames.cancel).toHaveBeenCalledTimes(1);
    expect(frames.cancel).toHaveBeenCalledWith(1);
  }),
);

it.live("goes back to frames once the overdue frame arrives", () =>
  Effect.gen(function* () {
    hide(false);
    // A long task delays one frame past the fallback; frames are fine after.
    const frames = fakeFrames({ autoFire: false });
    let taken = 0;

    const ticks = yield* Stream.runCollect(
      frameTicks.pipe(
        Stream.tap(() =>
          Effect.sync(() => {
            taken += 1;
            if (taken === 1) {
              frames.autoFire = true;
              frames.fire(1);
            }
          }),
        ),
        Stream.take(4),
      ),
    );
    expect(ticks).toHaveLength(4);
    // The late frame, then one frame per tick again.
    expect(frames.request).toHaveBeenCalledTimes(4);
    expect(frames.cancel).not.toHaveBeenCalled();
  }),
);

it.live("stops waiting for a frame once the page is hidden", () =>
  Effect.gen(function* () {
    hide(false);
    const frames = fakeFrames({ autoFire: false });
    const timers = spyOnTimers();
    const startedAt = performance.now();

    const fiber = yield* Effect.forkChild(
      Stream.runCollect(Stream.take(frameTicks, 2)),
    );
    yield* Effect.sleep("10 millis");
    hide(true);
    document.dispatchEvent(new Event("visibilitychange"));
    const ticks = yield* Fiber.join(fiber);

    expect(ticks).toHaveLength(2);
    expect(performance.now() - startedAt).toBeLessThan(frameFallbackMs);
    // The first tick gave up on its frame and timer; the second, hidden, went
    // through a task without requesting one.
    expect(frames.request).toHaveBeenCalledTimes(1);
    expect(frames.cancel).toHaveBeenCalledWith(1);
    const timerIds = fallbackTimerIds(timers);
    expect(timerIds).toHaveLength(1);
    expect(timers.clear).toHaveBeenCalledWith(timerIds[0]);
  }),
);

it.live("waits for frames afresh in each run", () =>
  Effect.gen(function* () {
    hide(false);
    fakeFrames({ autoFire: false });
    yield* Stream.runDrain(Stream.take(frameTicks, 1));

    const frames = fakeFrames({ autoFire: true });
    yield* Stream.runDrain(Stream.take(frameTicks, 2));
    expect(frames.request).toHaveBeenCalledTimes(2);
  }),
);
