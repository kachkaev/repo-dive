import type { Html } from "@effect/ui/html";
import { Schema } from "effect";

import type { ContributorKind } from "../../data.ts";
import { SegmentedControl } from "./segmented-control.ts";

/** The reserved contributor-kind colors (see styles.css). */
export const kindColors: Record<ContributorKind, string> = {
  human: "var(--kind-human)",
  bot: "var(--kind-bot)",
  ai: "var(--kind-ai)",
};

/**
 * Reading order used everywhere kinds are listed — humans first, bots last,
 * matching a calendar cell top-down.
 */
export const kindOrder: readonly ContributorKind[] = ["human", "ai", "bot"];

/** Icon + label for non-human contributor kinds; humans get no badge. */
export const kindBadge: Record<
  Exclude<ContributorKind, "human">,
  { icon: string; title: string }
> = {
  ai: { icon: "✨", title: "AI agent" },
  bot: { icon: "🤖", title: "Bot" },
};

export const kindLabels: Record<ContributorKind, string> = {
  human: "Humans",
  bot: "Bots",
  ai: "AI agents",
};

/** Qualifies a count once a single kind is filtered: "4 bot commits". */
export const kindNouns: Record<ContributorKind, string> = {
  human: "human",
  bot: "bot",
  ai: "AI-agent",
};

/**
 * Which contributor kind a view is narrowed to; "all" shows every kind. A
 * Schema, so a section can keep it in its Model.
 */
export const KindFilterSchema = Schema.Literals(["all", "human", "ai", "bot"]);

export type KindFilter = typeof KindFilterSchema.Type;

/** Mirrors a calendar cell's stacking order, top-down. */
const allKindsGradient = `linear-gradient(to bottom, ${kindColors.human} 0 34%, ${kindColors.ai} 34% 67%, ${kindColors.bot} 67% 100%)`;

/** Control-option casing: lowercase like every other segmented control, except the AI initialism. */
const filterLabels: Record<KindFilter, string> = {
  all: "all",
  human: "humans",
  ai: "AI agents",
  bot: "bots",
};

/**
 * The `all | humans | ai agents | bots` filter — a SegmentedControl with a
 * color swatch per option, so it looks like every other chart control. Renders
 * nothing when the repo only ever had one kind of contributor — there is
 * nothing to filter then.
 */
export const KindFilterControl = <M>(
  h: Html.H<M>,
  options: {
    readonly key: string;
    /** Accessible name for the group, e.g. "Filter calendar by contributor kind". */
    readonly label: string;
    readonly value: KindFilter;
    readonly onChange: (value: KindFilter) => M;
    readonly presentKinds: ReadonlySet<ContributorKind>;
  },
) => {
  if (options.presentKinds.size <= 1) {
    return;
  }

  const filters: KindFilter[] = [
    "all",
    ...kindOrder.filter((kind) => options.presentKinds.has(kind)),
  ];

  return SegmentedControl(h, {
    key: options.key,
    label: options.label,
    value: options.value,
    onChange: options.onChange,
    options: filters.map((filter) => ({
      value: filter,
      label: [
        h.span.class("inline-block size-2.5 rounded-xs").style({
          background: filter === "all" ? allKindsGradient : kindColors[filter],
        }),
        filterLabels[filter],
      ],
    })),
  });
};
