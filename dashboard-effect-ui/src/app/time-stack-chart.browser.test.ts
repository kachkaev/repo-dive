// @vitest-environment happy-dom
import { BrowserHost } from "@effect/ui/html";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { afterEach, vi } from "vitest";

import { eventually } from "./shared/eventually.ts";
import { TimeSeriesChart } from "./time-stack-chart.ts";

/** happy-dom lays nothing out, so a stand-in observer reports a width. */
class FakeResizeObserver {
  readonly #callback: (
    entries: ReadonlyArray<{ contentRect: { width: number } }>,
  ) => void;

  constructor(
    callback: (
      entries: ReadonlyArray<{ contentRect: { width: number } }>,
    ) => void,
  ) {
    this.#callback = callback;
  }

  observe() {
    this.#callback([{ contentRect: { width: 600 } }]);
  }

  disconnect() {
    // Nothing to stop.
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const dayMs = 86_400_000;

it.live("keeps the marks' nodes while the pointer moves", () =>
  Effect.gen(function* () {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    const container = document.createElement("div");
    document.body.append(container);
    yield* BrowserHost.mountEffect(
      TimeSeriesChart,
      {
        mode: "area",
        points: [0, 10, 20].map((day) => ({
          dateMs: day * dayMs,
          values: { a: day + 1, b: 2 },
        })),
        seriesKeys: ["a", "b"],
        colors: ["red", "blue"],
      },
      container,
    );

    const plot = () => container.querySelector(":scope svg[role=img] > g");
    yield* eventually(() => {
      expect(plot()).not.toBeNull();
    });
    const marks = plot()?.firstElementChild;
    const firstArea = marks?.querySelector("path");
    const hoverRect = plot()?.querySelector(":scope > rect");
    expect(firstArea).toBeTruthy();
    const mutations: MutationRecord[] = [];
    const observer = new MutationObserver((records) => {
      mutations.push(...records);
    });
    if (marks) {
      observer.observe(marks, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      });
    }

    // happy-dom puts the rect at 0,0, so clientX is the x over it. Each move
    // lands on another point, so each one renders the chart again; the marks
    // stay the same nodes, untouched.
    for (const [clientX, date] of [
      [10, "1970-01-01"],
      [280, "1970-01-11"],
      [540, "1970-01-21"],
    ] as const) {
      hoverRect?.dispatchEvent(new MouseEvent("mousemove", { clientX }));
      yield* eventually(() => {
        expect(
          container.querySelector(".will-change-transform.rounded-md")
            ?.textContent,
        ).toContain(date);
      });
      expect(plot()?.firstElementChild).toBe(marks);
      expect(marks?.querySelector("path")).toBe(firstArea);
    }
    observer.disconnect();
    expect(mutations).toHaveLength(0);
  }),
);
