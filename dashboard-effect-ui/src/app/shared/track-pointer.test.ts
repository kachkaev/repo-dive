// @vitest-environment happy-dom
import { Mount, UiSchema } from "@effect/ui";
import { BrowserHost, Html } from "@effect/ui/html";
import { expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import { eventually } from "./eventually.ts";
import { TrackPointer } from "./track-pointer.ts";

const ProbeMessage = UiSchema.TaggedEnum({
  MovedPointer: { x: Schema.Number, y: Schema.Number },
  LeftProbe: {},
});

const Probe = Html.component({
  name: "Probe",
  model: Schema.Struct({
    position: Schema.UndefinedOr(
      Schema.Struct({ x: Schema.Number, y: Schema.Number }),
    ),
  }),
  message: ProbeMessage,
}).make({
  init: () => ({ position: undefined }),
  update: {
    MovedPointer: ($, position) =>
      $.evolve({ position: { x: position.x, y: position.y } }),
    LeftProbe: ($) => $.evolve({ position: undefined }),
  },
  view: (h) =>
    h.div
      .attr("id", "probe")
      .onMount(
        TrackPointer().pipe(
          Mount.map((position) =>
            position === undefined
              ? ProbeMessage.LeftProbe()
              : ProbeMessage.MovedPointer(position),
          ),
        ),
      ),
});

it.live("reports the pointer relative to the element, and its leaving", () =>
  Effect.gen(function* () {
    const container = document.createElement("div");
    document.body.append(container);
    const root = yield* BrowserHost.mountEffect(Probe, {}, container);
    const probe = container.querySelector("#probe");
    expect(probe).not.toBeNull();

    // The mount starts listening once the element is in the document, so
    // the move is sent again until it lands. happy-dom lays nothing out, so
    // the element sits at 0,0 and the relative position equals the viewport
    // one.
    yield* eventually(() => {
      probe?.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 42, clientY: 7 }),
      );
      expect(root.model()?.position).toStrictEqual({ x: 42, y: 7 });
    });

    probe?.dispatchEvent(new MouseEvent("mouseleave"));
    yield* eventually(() => {
      expect(root.model()?.position).toBeUndefined();
    });
  }),
);
