// @vitest-environment happy-dom
import { expect, it } from "@effect/vitest";
import { Effect, Stream } from "effect";
import { afterEach, vi } from "vitest";

import { frameTicks } from "./frame-ticks.ts";

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
