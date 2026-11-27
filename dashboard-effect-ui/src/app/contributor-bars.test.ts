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
import {
  ContributorKindSchema,
  KindFilterSchema,
} from "./shared/contributor-kinds.ts";

const CrossKindCountsSchema = Schema.Struct({
  human: Schema.optionalKey(Schema.Number),
  ai: Schema.optionalKey(Schema.Number),
  bot: Schema.optionalKey(Schema.Number),
});

const ContributorBarsItemSchema = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  href: Schema.optional(Schema.String),
  kind: ContributorKindSchema,
  authored: Schema.Number,
  assistedBy: CrossKindCountsSchema,
  assisted: CrossKindCountsSchema,
});

const alice: ContributorBarsItem = {
  id: "Alice <alice@example.com>",
  label: "Alice",
  href: "https://example.com/alice",
  kind: "human",
  authored: 8,
  // One commit helped by both kinds counts under each: the tail is scaled
  // down to fit the bar.
  assistedBy: { ai: 6, bot: 4 },
  assisted: {},
};

const claude: ContributorBarsItem = {
  id: "Claude <noreply@anthropic.com>",
  label: "Claude",
  kind: "ai",
  authored: 2,
  assistedBy: {},
  assisted: { human: 6 },
};

const renovate: ContributorBarsItem = {
  id: "Renovate <renovate[bot]>",
  label: "Renovate",
  kind: "bot",
  authored: 4,
  assistedBy: { human: 1 },
  assisted: {},
};

const items = [alice, claude, renovate];

/** ContributorBars is a view function: this stands in for its section. */
const ContributorBarsHarness = Html.component({
  name: "ContributorBarsHarness",
  props: Schema.Struct({
    items: Schema.Array(ContributorBarsItemSchema),
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
      items: h.props.items,
      kindFilter: h.props.kindFilter,
      maxItems: h.props.maxItems,
    }),
});

/** A node's inline style, parsed by the DOM as a browser would parse it. */
const styleOf = (node: Locator.Node | undefined): CSSStyleDeclaration => {
  const element = document.createElement("span");
  element.setAttribute("style", node?.attrs?.["style"] ?? "");
  return element.style;
};

/** A node's inline percentages, by CSS property: `width: 25%` is 25. */
const percentsOf = (node: Locator.Node | undefined): Map<string, number> => {
  const style = styleOf(node);
  const percents = new Map<string, number>();
  for (const property of ["left", "right", "width"]) {
    const value = style.getPropertyValue(property);
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

/**
 * The text of each cell in a contributor's two lines, commits authored and
 * commits co-authored for others: the bar (no text), the total, then the
 * human, AI-agent and bot columns.
 */
const cellsOf = (row: Locator.Node): string[][] => {
  const cells = (row.children?.[1]?.children ?? []).map((cell) =>
    Locator.textOf(cell),
  );
  return [cells.slice(0, 5), cells.slice(5)];
};

/** The row of the contributor labeled `label`, after any kind badge. */
const rowOf = (
  s: { readonly all: (locator: Locator.Locator) => readonly Locator.Node[] },
  label: string,
): Locator.Node => {
  const row = s
    .all(HtmlLocator.role("listitem"))
    .find((item) => Locator.textOf(item.children?.[0] ?? {}).endsWith(label));
  if (!row) {
    throw new Error(`No row for ${label}`);
  }
  return row;
};

it.effect("draws two bars per contributor on one shared scale", () =>
  Effect.gen(function* () {
    const s = yield* HtmlScene.make(ContributorBarsHarness, {
      items,
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

it.effect(
  "colors the assisted bar by whom it helped, hatched in its own color",
  () =>
    Effect.gen(function* () {
      const s = yield* HtmlScene.make(ContributorBarsHarness, {
        items,
        kindFilter: "all",
        maxItems: 10,
      });
      // Claude helped humans with all 6 of its assisted commits: one human
      // segment across the whole bar, under a hatch of Claude's own kind.
      const assisted = s.get(
        Locator.attr("title", "6 commits co-authored for others"),
      );
      const [segment, hatch] = assisted.children?.[0]?.children ?? [];
      expect(percentsOf(segment)).toStrictEqual(
        new Map([
          ["left", 0],
          ["width", 100],
        ]),
      );
      expect(styleOf(segment).getPropertyValue("background")).toContain(
        "var(--kind-human)",
      );
      expect(percentsOf(hatch)).toStrictEqual(
        new Map([
          ["right", 0],
          ["width", 100],
        ]),
      );
      expect(styleOf(hatch).getPropertyValue("background-image")).toContain(
        "var(--kind-ai)",
      );
    }),
);

it.effect("leaves a dot where a pairing can't happen or never did", () =>
  Effect.gen(function* () {
    const s = yield* HtmlScene.make(ContributorBarsHarness, {
      items,
      kindFilter: "all",
      maxItems: 10,
    });
    // A contributor's own kind always shows a dot, as do zero counts and an
    // empty assisted total.
    expect(cellsOf(rowOf(s, "Alice"))).toStrictEqual([
      ["", "8", "·", "6", "4"],
      ["", "·", "·", "·", "·"],
    ]);
    expect(cellsOf(rowOf(s, "Claude"))).toStrictEqual([
      ["", "2", "·", "·", "·"],
      ["", "6", "6", "·", "·"],
    ]);
    expect(cellsOf(rowOf(s, "Renovate"))).toStrictEqual([
      ["", "4", "1", "·", "·"],
      ["", "·", "·", "·", "·"],
    ]);
  }),
);

it.effect("badges non-human contributors and links those with a URL", () =>
  Effect.gen(function* () {
    const s = yield* HtmlScene.make(ContributorBarsHarness, {
      items,
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
      items,
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
      items,
      kindFilter: "all",
      maxItems: 2,
    });
    s.expect(HtmlLocator.role("listitem"))
      .toHaveCount(2)
      .expect(Locator.text("Renovate", { exact: true }))
      .toBeAbsent();
  }),
);

it.effect("says so when no contributor is of the kind picked", () =>
  Effect.gen(function* () {
    const s = yield* HtmlScene.make(ContributorBarsHarness, {
      items: [alice, renovate],
      kindFilter: "ai",
      maxItems: 10,
    });
    s.expect(Locator.text("Nothing to show.", { exact: true }))
      .toExist()
      .expect(HtmlLocator.role("list"))
      .toBeAbsent();
  }),
);

it.effect("says so when the cap leaves no row", () =>
  Effect.gen(function* () {
    const s = yield* HtmlScene.make(ContributorBarsHarness, {
      items,
      kindFilter: "all",
      maxItems: 0,
    });
    s.expect(Locator.text("Nothing to show.", { exact: true })).toExist();
  }),
);
