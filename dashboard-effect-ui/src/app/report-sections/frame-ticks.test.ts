// @vitest-environment happy-dom
import { expect, it } from "@effect/vitest";
import { Effect, Stream } from "effect";
import { afterEach, vi } from "vitest";

import { frameFallbackMs, frameTicks } from "./frame-ticks.ts";

const hide = (hidden: boolean) => {
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => hidden,
  });
};

afterEach(() => {
  vi.unstubAllGlobals();
  hide(false);
});

it.live("ticks on animation frames while the page is shown", () =>
  Effect.gen(function* () {
    hide(false);
    const frame = vi.fn((callback: FrameRequestCallback) =>
      setTimeout(() => {
        callback(0);
      }, 0),
    );
    vi.stubGlobal("requestAnimationFrame", frame);

    const ticks = yield* Stream.runCollect(Stream.take(frameTicks, 3));
    expect(ticks).toHaveLength(3);
    expect(frame).toHaveBeenCalledTimes(3);
  }),
);

it.live("keeps ticking without animation frames while the page is hidden", () =>
  Effect.gen(function* () {
    hide(true);
    // A hidden tab gets no frames at all.
    const frame = vi.fn(() => 0);
    vi.stubGlobal("requestAnimationFrame", frame);

    const ticks = yield* Stream.runCollect(Stream.take(frameTicks, 3));
    expect(ticks).toHaveLength(3);
    expect(frame).not.toHaveBeenCalled();
  }),
);

it.live("falls back to tasks once frames stall while the page is shown", () =>
  Effect.gen(function* () {
    hide(false);
    // An embedded webview out of sight: visible, yet no frames ever come.
    const frame = vi.fn(() => 0);
    vi.stubGlobal("requestAnimationFrame", frame);
    const startedAt = performance.now();

    const ticks = yield* Stream.runCollect(Stream.take(frameTicks, 3));
    expect(ticks).toHaveLength(3);
    // One wait for a frame times out; the rest no longer wait for one.
    expect(frame).toHaveBeenCalledTimes(1);
    const elapsedMs = performance.now() - startedAt;
    expect(elapsedMs).toBeGreaterThanOrEqual(frameFallbackMs - 5);
    expect(elapsedMs).toBeLessThan(frameFallbackMs * 3);
  }),
);

it.live("waits for frames afresh in each run", () =>
  Effect.gen(function* () {
    hide(false);
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 0),
    );
    yield* Stream.runDrain(Stream.take(frameTicks, 1));

    const frame = vi.fn((callback: FrameRequestCallback) =>
      setTimeout(() => {
        callback(0);
      }, 0),
    );
    vi.stubGlobal("requestAnimationFrame", frame);
    yield* Stream.runDrain(Stream.take(frameTicks, 2));
    expect(frame).toHaveBeenCalledTimes(2);
  }),
);
