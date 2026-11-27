import type { Html } from "@effect/ui/html";

import { formatCount } from "./shared/format.ts";

export type BarListItem = {
  /** Stable, unique element key; labels aren't guaranteed unique. */
  id: string;
  label: string;
  value: number;
  href?: string | undefined;
  /** Per-item bar color (e.g. a contributor-kind color); wins over `color`. */
  color?: string | undefined;
};

/**
 * Horizontal labeled bars for ranked categories (top rules, AI identities).
 *
 * A view function rather than a component: like its React counterpart it
 * holds no state. Hovering is all CSS — a linked label shifts its color and
 * gains an underline (`hover:` classes) — and the full label of a truncated
 * one shows in the browser's own tooltip, through `title`. Charts that track
 * the pointer themselves are components; see the README.
 */
export const BarList = <M>(
  h: Html.H<M>,
  options: {
    readonly items: readonly BarListItem[];
    readonly color?: string | undefined;
  },
) => {
  const { items } = options;
  if (items.length === 0) {
    return h.p
      .class("text-sm text-(--text-muted)")
      .children("Nothing to show.");
  }

  const barColor = options.color ?? "var(--series-1)";
  const max = Math.max(...items.map((item) => item.value), 1);

  return h.ul.class("space-y-1.5").children(
    items.map((item) =>
      h.li
        .key(item.id)
        .class("flex items-center gap-3 text-sm")
        .children(
          h.span
            .class(
              "w-56 truncate text-right font-mono text-xs text-(--text-secondary)",
            )
            .attr("title", item.label)
            .children(
              item.href
                ? h.a
                    .attrs({
                      href: item.href,
                      target: "_blank",
                      rel: "noreferrer",
                    })
                    .class("hover:text-(--text-primary) hover:underline")
                    .children(item.label)
                : item.label,
            ),
          h.span
            .class("relative h-4 flex-1 rounded-xs bg-(--surface-2)")
            .children(
              h.span
                .class("absolute inset-y-0 left-0 rounded-xs opacity-90")
                .style({
                  width: `${Math.max(0.5, (item.value / max) * 100)}%`,
                  background: item.color ?? barColor,
                }),
            ),
          h.span
            .class("w-12 text-right text-xs font-medium tabular-nums")
            .children(formatCount(item.value)),
        ),
    ),
  );
};
