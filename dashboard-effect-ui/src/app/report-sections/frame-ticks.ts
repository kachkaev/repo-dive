import { Effect, Stream } from "effect";

/**
 * How long a shown page waits for an animation frame before it ticks on a
 * task instead. A browser that paints sends one every 16 ms or so; an embedded
 * webview that is out of sight, or a window covered by others, can stop
 * sending any while the page still reports itself visible. A frame that is
 * merely late (a long task, a slow paint) trips it too, but only until that
 * frame arrives.
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
 * What one run of {@link frameTicks} knows about its frames: the animation
 * frame it still waits for after a wait for it timed out, if any. While there
 * is one, frames count as stalled; it clears itself when it arrives.
 */
type FrameState = { probe: number | undefined };

/**
 * Resumes on the next animation frame, or once {@link frameFallbackMs} pass
 * without one. When the timer wins, the frame stays requested as the run's
 * probe, so its arrival tells the run that frames are back. A page hidden
 * while it waits stops waiting at once: it has not shown that its frames
 * stall, it just has none to give while hidden.
 */
const nextFrameOrTimeout = (state: FrameState) =>
  Effect.callback<undefined>((resume) => {
    // Aborting releases the timer and the listener, whichever way the wait
    // ends; the frame is released by the ways that do not keep it as a probe.
    const controller = new AbortController();
    const { signal } = controller;
    let waiting = true;
    const finish = () => {
      waiting = false;
      controller.abort();
      resume(Effect.undefined);
    };
    const frame = requestAnimationFrame(() => {
      if (waiting) {
        finish();
      } else if (state.probe === frame) {
        state.probe = undefined;
      }
    });
    const timeout = setTimeout(() => {
      state.probe = frame;
      finish();
    }, frameFallbackMs);
    signal.addEventListener("abort", () => {
      clearTimeout(timeout);
    });
    document.addEventListener(
      "visibilitychange",
      () => {
        cancelAnimationFrame(frame);
        finish();
      },
      { signal },
    );
    return Effect.sync(() => {
      cancelAnimationFrame(frame);
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
 * whose frame does not come within {@link frameFallbackMs} ticks on tasks too,
 * until that frame arrives: what the ticks drive finishes even if it never
 * does, and goes back to painting between ticks once frames come again.
 */
export const frameTicks: Stream.Stream<undefined> = Stream.suspend(() => {
  // One run's state, on the main thread: written by one wait at a time (the
  // stream pulls sequentially) and by its probe's frame callback.
  const state: FrameState = { probe: undefined };
  return Stream.fromEffectRepeat(
    Effect.suspend(() =>
      state.probe !== undefined || document.hidden
        ? nextTask
        : nextFrameOrTimeout(state),
    ),
  ).pipe(
    Stream.ensuring(
      Effect.sync(() => {
        if (state.probe !== undefined) {
          cancelAnimationFrame(state.probe);
        }
      }),
    ),
  );
});
