import { Effect, Stream } from "effect";

/**
 * Waits for the next chance to paint. While the page is shown that is the
 * next animation frame. While it is hidden there are no frames, and Chrome
 * throttles timers in a hidden tab to about one a second (one a minute after
 * five minutes), so a `MessageChannel` round trip takes over: it is a task of
 * its own, never throttled, which lets the browser run whatever else is
 * queued in between. A page hidden while it waits for a frame stops waiting
 * at once.
 */
const nextFrame = Effect.callback<undefined>((resume) => {
  // The returned finalizer only runs when the wait is interrupted, so each
  // way of ending it also releases what it holds before resuming.
  if (document.hidden) {
    const channel = new MessageChannel();
    channel.port1.addEventListener("message", () => {
      channel.port1.close();
      resume(Effect.undefined);
    });
    channel.port1.start();
    channel.port2.postMessage(undefined);
    return Effect.sync(() => {
      channel.port1.close();
    });
  }
  const controller = new AbortController();
  const frame = requestAnimationFrame(() => {
    controller.abort();
    resume(Effect.undefined);
  });
  document.addEventListener(
    "visibilitychange",
    () => {
      cancelAnimationFrame(frame);
      controller.abort();
      resume(Effect.undefined);
    },
    { signal: controller.signal },
  );
  return Effect.sync(() => {
    cancelAnimationFrame(frame);
    controller.abort();
  });
});

/**
 * One tick per {@link nextFrame}, pulled one at a time: the next wait only
 * starts once the component has taken the last tick, so the ticks never run
 * ahead of the renders they drive.
 */
export const frameTicks: Stream.Stream<undefined> =
  Stream.fromEffectRepeat(nextFrame);
