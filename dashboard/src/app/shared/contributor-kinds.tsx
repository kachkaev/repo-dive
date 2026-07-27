import type { ContributorKind } from "../../data.ts";
import { ToggleGroup, ToggleGroupItem } from "./@ui-primitive/toggle-group.tsx";

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

/** Which contributor kind a view is narrowed to; "all" shows every kind. */
export type KindFilter = "all" | ContributorKind;

/** Mirrors a calendar cell's stacking order, top-down. */
const allKindsGradient = `linear-gradient(to bottom, ${kindColors.human} 0 34%, ${kindColors.ai} 34% 67%, ${kindColors.bot} 67% 100%)`;

/**
 * The `all | humans | ai agents | bots` chip row. Renders nothing when the repo
 * only ever had one kind of contributor — there is nothing to filter then.
 */
export function KindFilterChips({
  label,
  value,
  onChange,
  presentKinds,
}: {
  /** Accessible name for the group, e.g. "Filter calendar by contributor kind". */
  label: string;
  value: KindFilter;
  onChange: (value: KindFilter) => void;
  presentKinds: ReadonlySet<ContributorKind>;
}) {
  if (presentKinds.size <= 1) {
    return;
  }

  const options: KindFilter[] = [
    "all",
    ...kindOrder.filter((kind) => presentKinds.has(kind)),
  ];

  return (
    <ToggleGroup
      value={[value]}
      onValueChange={(groupValue) => {
        // Single-select semantics on an array-valued group: re-clicking the
        // pressed chip yields [] — keep the current filter (one is always
        // active) rather than allowing an empty selection.
        const next = groupValue.at(-1);
        if (typeof next === "string") {
          onChange(next as KindFilter);
        }
      }}
      aria-label={label}
      variant="outline"
      size="sm"
      className="mb-3 flex-wrap gap-1.5"
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option}
          value={option}
          className="h-auto gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-normal text-(--text-secondary) shadow-none hover:bg-transparent hover:text-(--text-primary) data-pressed:border-(--text-muted) data-pressed:text-(--text-primary)"
        >
          <span
            className="inline-block size-2.5 rounded-xs"
            style={{
              background:
                option === "all" ? allKindsGradient : kindColors[option],
            }}
          />
          {option === "all" ? "All" : kindLabels[option]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
