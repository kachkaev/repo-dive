// @vitest-environment happy-dom
import { Mount, UiSchema } from "@effect/ui";
import { BrowserHost, Html } from "@effect/ui/html";
import { expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { afterEach, vi } from "vitest";

import { eventually } from "./eventually.ts";
import { MeasureWidth } from "./measure-width.ts";

const ProbeMessage = UiSchema.TaggedEnum({
  ChangedWidth: { width: Schema.Number },
});

const Probe = Html.component({
  name: "Probe",
  model: Schema.Struct({ width: Schema.Number }),
  message: ProbeMessage,
}).make({
  init: () => ({ width: 0 }),
  update: { ChangedWidth: ($, { width }) => $.evolve({ width }) },
  view: (h) =>
    h.div.onMount(
      MeasureWidth().pipe(
        Mount.map((width) => ProbeMessage.ChangedWidth({ width })),
      ),
    ),
});

/** happy-dom lays nothing out, so a stand-in observer reports the sizes. */
class FakeResizeObserver {
  static readonly instances: FakeResizeObserver[] = [];

  readonly #callback: ResizeObserverCallback;

  disconnected = false;

  constructor(callback: ResizeObserverCallback) {
    this.#callback = callback;
    FakeResizeObserver.instances.push(this);
  }

  report(width: number) {
    this.#callback([{ contentRect: { width } } as ResizeObserverEntry], this);
  }

  observe() {
    // Sizes are reported by hand.
  }

  unobserve() {
    // Sizes are reported by hand.
  }

  disconnect() {
    this.disconnected = true;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeResizeObserver.instances.length = 0;
});

it.live("reports the width on every resize and stops with the element", () =>
  Effect.gen(function* () {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    const container = document.createElement("div");
    document.body.append(container);

    yield* Effect.scoped(
      Effect.gen(function* () {
        const root = yield* BrowserHost.mountEffect(Probe, {}, container);
        // The mount starts once the element is in the document.
        yield* eventually(() => {
          expect(FakeResizeObserver.instances).toHaveLength(1);
        });
        const [observer] = FakeResizeObserver.instances;

        observer?.report(320);
        yield* eventually(() => {
          expect(root.model()?.width).toBe(320);
        });

        observer?.report(480);
        yield* eventually(() => {
          expect(root.model()?.width).toBe(480);
        });
      }),
    );
    expect(FakeResizeObserver.instances[0]?.disconnected).toBe(true);
  }),
);
