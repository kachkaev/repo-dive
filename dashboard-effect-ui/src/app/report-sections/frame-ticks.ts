import { Effect, Stream } from "effect";

/**
 * How long a shown page waits for an animation frame before it stops counting
 * on them. A browser that paints sends one every 16 ms or so; an embedded
 * webview that is out of sight, or a window covered by others, can stop
 * sending any while the page still reports itself visible.
 */
export const frameFallbackMs = 100;

/**
 * Resumes on a `MessageChannel` round trip: a task of its own, never throttled
 * the way timers are in a hidden tab (about one a second, one a minute after
 * five minutes), which lets the browser run whatever else is queued in
 * between.
 */
const nextTask = Effect.callback<undefined>((resume) => {
  // The returned finalizer only runs when the wait is interrupted, so each
  // way of ending it also releases what it holds before resuming.
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
});

/**
 * Resumes on the next animation frame with `true`, or with `false` once
 * {@link frameFallbackMs} pass without one. A page hidden while it waits stops
 * waiting at once, with `true`: it has not shown that its frames stall, it
 * just has none to give while hidden.
 */
const nextFrameOrTimeout = Effect.callback<boolean>((resume) => {
  // Whichever way the wait ends (or is interrupted), aborting releases all
  // three: the frame, the timer and the listener.
  const controller = new AbortController();
  const { signal } = controller;
  const finish = (gotFrame: boolean) => {
    controller.abort();
    resume(Effect.succeed(gotFrame));
  };
  const frame = requestAnimationFrame(() => {
    finish(true);
  });
  signal.addEventListener("abort", () => {
    cancelAnimationFrame(frame);
  });
  const timeout = setTimeout(() => {
    finish(false);
  }, frameFallbackMs);
  signal.addEventListener("abort", () => {
    clearTimeout(timeout);
  });
  document.addEventListener(
    "visibilitychange",
    () => {
      finish(true);
    },
    { signal },
  );
  return Effect.sync(() => {
    controller.abort();
  });
});

/**
 * One tick per chance to paint, pulled one at a time: the next wait only
 * starts once the component has taken the last tick, so the ticks never run
 * ahead of the renders they drive.
 *
 * While the page is shown, a tick is the next animation frame. While it is
 * hidden there are no frames, so a {@link nextTask} takes over. A shown page
 * whose frames stall (see {@link frameFallbackMs}) ticks on tasks too, for
 * the rest of the stream: what it drives finishes rather than waiting for a
 * frame that may never come.
 */
export const frameTicks: Stream.Stream<undefined> = Stream.suspend(() => {
  // Read and written by one wait at a time: the stream pulls sequentially.
  let framesStalled = false;
  return Stream.fromEffectRepeat(
    Effect.suspend(() =>
      framesStalled || document.hidden
        ? nextTask
        : nextFrameOrTimeout.pipe(
            Effect.flatMap((gotFrame) => {
              framesStalled = !gotFrame;
              return Effect.undefined;
            }),
          ),
    ),
  );
});
