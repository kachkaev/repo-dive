import { Mount } from "@effect/ui";
import { Effect, Queue, Stream } from "effect";

/**
 * Reports an element's content width, now and on every resize, so a chart can
 * lay itself out responsively — the counterpart of the React dashboard's
 * `useMeasuredWidth` hook. A stream mount: put it on the chart's container,
 * keep the width in the chart's Model and draw nothing (or a skeleton) until
 * the first report arrives, as the React charts do while their width is 0.
 *
 * @example
 * h.div
 *   .class("relative")
 *   .onMount(
 *     MeasureWidth().pipe(
 *       Mount.map((width) => ChartMessage.ChangedWidth({ width })),
 *     ),
 *   )
 *   .children(model.width > 0 && Plot(h, model))
 */
export const MeasureWidth = Mount.makeStream(
  "MeasureWidth",
  {},
  (node: HTMLElement) =>
    Stream.callback<number>((queue) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (entry) {
              Queue.offerUnsafe(queue, entry.contentRect.width);
            }
          });
          observer.observe(node);
          return observer;
        }),
        (observer) =>
          Effect.sync(() => {
            observer.disconnect();
          }),
      ),
    ),
);
