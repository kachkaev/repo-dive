import type { ContributorKind } from "../data.ts";
import {
  kindBadge,
  kindColors,
  kindLabels,
  kindOrder,
} from "./shared/contributor-kinds.tsx";
import { formatCount } from "./shared/format.ts";

export type ContributorBarsItem = {
  /** Stable, unique React key; labels aren't guaranteed unique. */
  id: string;
  label: string;
  href?: string | undefined;
  kind: ContributorKind;
  /** Commits this contributor authored — the length of the first bar. */
  authored: number;
  /**
   * Own commits carrying at least one co-author of that other kind. Counted
   * once per commit per kind, so these can sum above the number of distinct
   * assisted commits when one commit was helped by two kinds at once.
   */
  assistedBy: Partial<Record<ContributorKind, number>>;
  /**
   * Commits by an author of that other kind that this contributor co-authored.
   * Each commit has exactly one author, so these sum to the second bar.
   */
  assisted: Partial<Record<ContributorKind, number>>;
};

/**
 * The same 45° hatch the charts and legend swatches use (2px lines at a 6px
 * pitch). Throughout the dashboard it reads as "another kind was involved".
 */
const hatchOf = (color: string): string =>
  `repeating-linear-gradient(45deg, transparent 0 4px, ${color} 4px 6px)`;

/**
 * Shared by the header and every row so the number columns line up. The bar
 * track takes the slack; the four fixed columns are the total plus one per kind.
 */
const gridTemplate = "1fr 3rem 2.75rem 2.75rem 2.75rem";

const sumCounts = (counts: Partial<Record<ContributorKind, number>>): number =>
  Object.values(counts).reduce((total, count) => total + count, 0);

const totalOf = (spans: ReadonlyArray<{ value: number }>): number =>
  spans.reduce((total, span) => total + span.value, 0);

/**
 * One bar: a base split into colored segments, overlaid with a hatch.
 *
 * `segments` are drawn left to right in `kindOrder`. `hatchSpans` says how much
 * of the bar's *right-hand end* is hatched, again per kind — the tail that
 * marks cross-kind involvement.
 */
function Bar({
  total,
  max,
  baseColor,
  segments,
  hatchColorOf,
  hatchSpans,
  title,
}: {
  total: number;
  max: number;
  /** Used when `segments` is empty — a single-color bar. */
  baseColor: string;
  segments: Array<{ kind: ContributorKind; value: number }>;
  /** Hatch color for a tail segment of that kind. */
  hatchColorOf: (kind: ContributorKind) => string;
  hatchSpans: Array<{ kind: ContributorKind; value: number }>;
  title: string;
}) {
  const width = total === 0 ? 0 : Math.max(0.5, (total / max) * 100);
  const denominator = Math.max(total, 1);
  // A commit helped by two kinds at once counts under both, so the spans can
  // sum above the bar. Scale them down together in that case: the exact
  // per-kind numbers live in the columns, and the tail stays inside the bar.
  const hatchTotal = totalOf(hatchSpans);
  const hatchScale =
    hatchTotal > total && hatchTotal > 0 ? total / hatchTotal : 1;

  // Offsets are derived per piece rather than accumulated into a variable the
  // map callbacks close over — that pattern silently bails React Compiler.
  const basePieces = segments.map((segment, index) => ({
    ...segment,
    offsetPercent: (totalOf(segments.slice(0, index)) / denominator) * 100,
    widthPercent: (segment.value / denominator) * 100,
  }));
  const hatchPieces = hatchSpans.map((span, index) => ({
    ...span,
    offsetPercent:
      ((totalOf(hatchSpans.slice(0, index)) * hatchScale) / denominator) * 100,
    widthPercent: ((span.value * hatchScale) / denominator) * 100,
  }));

  return (
    <span
      className="relative h-4 w-full rounded-xs bg-(--surface-2)"
      title={title}
    >
      <span
        className="absolute inset-y-0 left-0 overflow-hidden rounded-xs opacity-90 group-hover:opacity-100"
        style={{ width: `${width}%`, background: baseColor }}
      >
        {basePieces.map((piece) => (
          <span
            key={piece.kind}
            className="absolute inset-y-0"
            style={{
              left: `${piece.offsetPercent}%`,
              width: `${piece.widthPercent}%`,
              background: kindColors[piece.kind],
            }}
          />
        ))}
        {hatchPieces.map((piece) => (
          <span
            key={piece.kind}
            className="absolute inset-y-0"
            style={{
              // Anchored to the right so the hatched tail always ends at the
              // bar's tip, whichever kinds are present.
              right: `${piece.offsetPercent}%`,
              width: `${piece.widthPercent}%`,
              backgroundImage: hatchOf(hatchColorOf(piece.kind)),
            }}
          />
        ))}
      </span>
    </span>
  );
}

/** A number cell, blank when the pairing can't happen or never did. */
function CountCell({ value }: { value: number | undefined }) {
  return (
    <span className="text-right text-xs tabular-nums text-(--text-secondary)">
      {value === undefined || value === 0 ? (
        <span className="text-(--text-muted)">·</span>
      ) : (
        formatCount(value)
      )}
    </span>
  );
}

/**
 * Every contributor as a pair of bars: what they authored (hatched where other
 * kinds helped) and what they helped others with (colored by whom they helped).
 * The two are inverses of each other, so a human and the agent that assists
 * them are measured on one shared scale.
 */
export function ContributorBars({ items }: { items: ContributorBarsItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-(--text-muted)">Nothing to show.</p>;
  }

  const max = Math.max(
    ...items.map((item) => Math.max(item.authored, sumCounts(item.assisted))),
    1,
  );

  return (
    <div className="space-y-4">
      <div
        className="grid items-end gap-x-3 pl-1 text-[0.65rem] text-(--text-muted)"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        <span>authored above, assisted below</span>
        <span className="text-right">total</span>
        {kindOrder.map((kind) => (
          <span
            key={kind}
            className="flex items-center justify-end gap-1"
            title={`Cross-kind collaboration with ${kindLabels[kind].toLowerCase()}`}
          >
            <span
              aria-hidden
              className="inline-block size-2 rounded-xs"
              style={{ background: kindColors[kind] }}
            />
            <span className="sr-only">{kindLabels[kind]}</span>
          </span>
        ))}
      </div>

      <ul className="space-y-4">
        {items.map((item) => {
          const assistedTotal = sumCounts(item.assisted);
          const others = kindOrder.filter((kind) => kind !== item.kind);
          const badge =
            item.kind === "human" ? undefined : kindBadge[item.kind];

          return (
            <li key={item.id} className="group space-y-1">
              <div className="flex items-center gap-1.5 text-sm">
                {badge ? (
                  <span title={badge.title} className="select-none">
                    {badge.icon}
                  </span>
                ) : (
                  <span
                    aria-hidden
                    className="inline-block size-2.5 rounded-xs"
                    style={{ background: kindColors[item.kind] }}
                  />
                )}
                {item.href ? (
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate font-medium hover:underline"
                  >
                    {item.label}
                  </a>
                ) : (
                  <span className="truncate font-medium">{item.label}</span>
                )}
              </div>

              <div
                className="grid items-center gap-x-3 gap-y-1"
                style={{ gridTemplateColumns: gridTemplate }}
              >
                <Bar
                  total={item.authored}
                  max={max}
                  baseColor={kindColors[item.kind]}
                  segments={[]}
                  hatchColorOf={(kind) => kindColors[kind]}
                  hatchSpans={others.flatMap((kind) => {
                    const value = item.assistedBy[kind] ?? 0;
                    return value === 0 ? [] : [{ kind, value }];
                  })}
                  title={`${formatCount(item.authored)} commits authored`}
                />
                <span className="text-right text-xs font-medium tabular-nums">
                  {formatCount(item.authored)}
                </span>
                {kindOrder.map((kind) => (
                  <CountCell
                    key={kind}
                    value={
                      kind === item.kind ? undefined : item.assistedBy[kind]
                    }
                  />
                ))}

                <Bar
                  total={assistedTotal}
                  max={max}
                  baseColor={kindColors[item.kind]}
                  segments={others.flatMap((kind) => {
                    const value = item.assisted[kind] ?? 0;
                    return value === 0 ? [] : [{ kind, value }];
                  })}
                  // The whole assisted bar is hatched in this contributor's own
                  // color: the exact inverse of the bar above, where their base
                  // color carries someone else's hatch.
                  hatchColorOf={() => kindColors[item.kind]}
                  hatchSpans={
                    assistedTotal === 0
                      ? []
                      : [{ kind: item.kind, value: assistedTotal }]
                  }
                  title={`${formatCount(assistedTotal)} commits co-authored for others`}
                />
                <span className="text-right text-xs font-medium tabular-nums">
                  {assistedTotal === 0 ? (
                    <span className="text-(--text-muted)">·</span>
                  ) : (
                    formatCount(assistedTotal)
                  )}
                </span>
                {kindOrder.map((kind) => (
                  <CountCell
                    key={kind}
                    value={kind === item.kind ? undefined : item.assisted[kind]}
                  />
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
