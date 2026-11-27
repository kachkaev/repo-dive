// @vitest-environment happy-dom
import { Html } from "@effect/ui/html";
import { HtmlLocator, HtmlScene } from "@effect/ui/html/testing";
import { Locator } from "@effect/ui/testing";
import { expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import {
  ContributorBars,
  type ContributorBarsItem,
} from "./contributor-bars.ts";
import { KindFilterSchema } from "./shared/contributor-kinds.ts";

const items: ContributorBarsItem[] = [
  {
    id: "Alice <alice@example.com>",
    label: "Alice",
    href: "https://example.com/alice",
    kind: "human",
    authored: 8,
    // One commit helped by both kinds counts under each: the tail is scaled
    // down to fit the bar.
    assistedBy: { ai: 6, bot: 4 },
    assisted: {},
  },
  {
    id: "Claude <noreply@anthropic.com>",
    label: "Claude",
    kind: "ai",
    authored: 2,
    assistedBy: {},
    assisted: { human: 6 },
  },
  {
    id: "Renovate <renovate[bot]>",
    label: "Renovate",
    kind: "bot",
    authored: 4,
    assistedBy: { human: 1 },
    assisted: {},
  },
];

/** ContributorBars is a view function: this stands in for its section. */
const ContributorBarsHarness = Html.component({
  name: "ContributorBarsHarness",
  props: Schema.Struct({
    kindFilter: KindFilterSchema,
    maxItems: Schema.Number,
  }),
  model: Schema.Struct({}),
  message: Schema.Never,
}).make({
  init: () => ({}),
  update: {},
  view: (h) =>
    ContributorBars(h, {
      items,
      kindFilter: h.props.kindFilter,
      maxItems: h.props.maxItems,
    }),
});

/** A node's inline percentages, by CSS property: `width:25%` is 25. */
const percentsOf = (node: Locator.Node | undefined): Map<string, number> => {
  const percents = new Map<string, number>();
  for (const declaration of (node?.attrs?.["style"] ?? "").split(";")) {
    const [property = "", value = ""] = declaration.split(":", 2);
    if (value.endsWith("%")) {
      percents.set(property, Number(value.slice(0, -1)));
    }
  }
  return percents;
};

/** How much of its track a bar fills, in percent. */
const barWidthOf = (track: Locator.Node): number | undefined =>
  percentsOf(track.children?.[0]).get("width");

/** Each piece drawn over the bar: its inline offsets and width, in percent. */
const piecesOf = (track: Locator.Node) =>
  (track.children?.[0]?.children ?? []).map((piece) => percentsOf(piece));

it.effect("draws two bars per contributor on one shared scale", () =>
  Effect.gen(function* () {
    const s = yield* HtmlScene.make(ContributorBarsHarness, {
      kindFilter: "all",
      maxItems: 10,
    });
    s.expect(HtmlLocator.role("listitem")).toHaveCount(3);
    // Alice's 8 authored commits set the scale; Claude's 6 assisted ones are
    // three quarters of it.
    const authored = s.get(Locator.attr("title", "8 commits authored"));
    expect(barWidthOf(authored)).toBe(100);
    const claudeAssisted = s.get(
      Locator.attr("title", "6 commits co-authored for others"),
    );
    expect(barWidthOf(claudeAssisted)).toBe(75);
    // 6 + 4 assisted-by commits on an 8-commit bar: the two hatched spans
    // scale down together to fill it, ending at the bar's tip.
    const [ai, bot] = piecesOf(authored);
    expect(ai?.get("right")).toBeCloseTo(0);
    expect(ai?.get("width")).toBeCloseTo(60);
    expect(bot?.get("right")).toBeCloseTo(60);
    expect(bot?.get("width")).toBeCloseTo(40);
  }),
);

it.effect("badges non-human contributors and links those with a URL", () =>
  Effect.gen(function* () {
    const s = yield* HtmlScene.make(ContributorBarsHarness, {
      kindFilter: "all",
      maxItems: 10,
    });
    s.expect(HtmlLocator.role("link", { name: "Alice" }))
      .toHaveAttribute("href", "https://example.com/alice")
      .expect(HtmlLocator.role("link", { name: "Claude" }))
      .toBeAbsent()
      .expect(Locator.attr("title", "AI agent"))
      .toHaveText("✨")
      .expect(Locator.attr("title", "Bot"))
      .toHaveText("🤖");
  }),
);

it.effect("shows only the filtered kind, up to the cap", () =>
  Effect.gen(function* () {
    const s = yield* HtmlScene.make(ContributorBarsHarness, {
      kindFilter: "bot",
      maxItems: 10,
    });
    s.expect(HtmlLocator.role("listitem"))
      .toHaveCount(1)
      .expect(Locator.text("Renovate", { exact: true }))
      .toExist()
      // The bot's 4 authored commits set the scale on their own.
      .expect(Locator.attr("title", "4 commits authored"))
      .toExist();
    expect(barWidthOf(s.get(Locator.attr("title", "4 commits authored")))).toBe(
      100,
    );
  }),
);

it.effect("caps the rows at maxItems", () =>
  Effect.gen(function* () {
    const s = yield* HtmlScene.make(ContributorBarsHarness, {
      kindFilter: "all",
      maxItems: 2,
    });
    s.expect(HtmlLocator.role("listitem"))
      .toHaveCount(2)
      .expect(Locator.text("Renovate", { exact: true }))
      .toBeAbsent();
  }),
);

it.effect("says so when no contributor is left to show", () =>
  Effect.gen(function* () {
    const s = yield* HtmlScene.make(ContributorBarsHarness, {
      kindFilter: "human",
      maxItems: 0,
    });
    s.expect(Locator.text("Nothing to show.", { exact: true }))
      .toExist()
      .expect(HtmlLocator.role("list"))
      .toBeAbsent();
  }),
);
