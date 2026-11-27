import { Mount } from "@effect/ui";
import { Effect, Queue, Stream } from "effect";

/**
 * Where the pointer is over the tracked element, in px from its top left
 * corner, or `undefined` once it has left.
 */
export type PointerPosition = { x: number; y: number } | undefined;

/**
 * Follows the pointer over an element — the hover target of a chart, such as
 * the transparent `<rect>` over its plot area. Effect UI elements hear no
 * `mousemove`, so this stream mount stands in for the React charts'
 * `onMouseMove` / `onMouseLeave` pair: it reports each move relative to the
 * element's own box (what they compute from `getBoundingClientRect`) and
 * `undefined` on leave. Map it to the chart's own messages and keep only what
 * the view needs, such as the index of the nearest point, in the Model.
 *
 * @example
 * h.rect
 *   .attrs({ width: String(innerWidth), height: String(innerHeight), fill: "transparent" })
 *   .onMount(
 *     TrackPointer().pipe(
 *       Mount.map((position) =>
 *         position === undefined
 *           ? ChartMessage.LeftPlot()
 *           : ChartMessage.MovedPointer({ x: position.x }),
 *       ),
 *     ),
 *   )
 */
export const TrackPointer = Mount.makeStream(
  "TrackPointer",
  {},
  (node: Element) =>
    Stream.callback<PointerPosition>((queue) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const controller = new AbortController();
          node.addEventListener(
            "mousemove",
            (event) => {
              if (!(event instanceof MouseEvent)) {
                return;
              }
              const bounds = node.getBoundingClientRect();
              Queue.offerUnsafe(queue, {
                x: event.clientX - bounds.left,
                y: event.clientY - bounds.top,
              });
            },
            { signal: controller.signal },
          );
          node.addEventListener(
            "mouseleave",
            () => {
              Queue.offerUnsafe(queue, undefined);
            },
            { signal: controller.signal },
          );
          return controller;
        }),
        (controller) =>
          Effect.sync(() => {
            controller.abort();
          }),
      ),
    ),
);
