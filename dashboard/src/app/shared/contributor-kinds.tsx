import type { ContributorKind } from "../../data.ts";

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
    return undefined;
  }

  const options: KindFilter[] = [
    "all",
    ...kindOrder.filter((kind) => presentKinds.has(kind)),
  ];

  return (
    <div
      role="group"
      aria-label={label}
      className="mb-3 flex flex-wrap gap-1.5"
    >
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => {
            onChange(option);
          }}
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${
            value === option
              ? "border-(--text-muted) bg-(--surface-2) text-(--text-primary)"
              : "cursor-pointer border-(--grid-line) text-(--text-secondary) hover:text-(--text-primary)"
          }`}
        >
          <span
            className="inline-block size-2.5 rounded-xs"
            style={{
              background:
                option === "all" ? allKindsGradient : kindColors[option],
            }}
          />
          {option === "all" ? "All" : kindLabels[option]}
        </button>
      ))}
    </div>
  );
}
