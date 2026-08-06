import type { ReactNode } from "react";

export function Section({
  title,
  subtitle,
  controls,
  children,
}: {
  title: string;
  subtitle?: string | undefined;
  /**
   * Optional controls, laid out in a wrapping row right under the title —
   * above the subtitle, whose length can change with the selection; the other
   * way around, every switch would shift the controls away from the cursor.
   */
  controls?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mb-10">
      <h2 className="text-base font-semibold">{title}</h2>
      {controls ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">{controls}</div>
      ) : undefined}
      {subtitle ? (
        <p
          className={`${controls ? "mt-1.5" : "mt-0.5"} text-sm text-(--text-secondary)`}
        >
          {subtitle}
        </p>
      ) : undefined}
      <div className="mt-3 rounded-lg border border-(--grid-line) bg-(--surface-1) p-4">
        {children}
      </div>
    </section>
  );
}

export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string | undefined;
}) {
  return (
    <div className="rounded-lg border border-(--grid-line) bg-(--surface-1) px-4 py-3">
      <div className="text-xs font-medium tracking-wide text-(--text-muted) uppercase">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint ? (
        <div className="mt-0.5 text-xs text-(--text-secondary)">{hint}</div>
      ) : undefined}
    </div>
  );
}

export type LegendEntry = {
  label: string;
  color: string;
  /** Overlays diagonal hatching in this color — "assisted by" in the kind legend. */
  hatch?: string | undefined;
};

/**
 * A legend/tooltip swatch: base color, plus the same 45° hatch the marks use
 * (2px lines at a 6px pitch — 2/3 base fill, 1/3 helper color).
 */
export function Swatch({
  color,
  hatch,
  className,
}: {
  color: string;
  hatch?: string | undefined;
  className?: string;
}) {
  return (
    <span
      className={className ?? "inline-block size-2.5 rounded-xs"}
      style={{
        backgroundColor: color,
        backgroundImage: hatch
          ? `repeating-linear-gradient(45deg, transparent 0 4px, ${hatch} 4px 6px)`
          : undefined,
      }}
    />
  );
}

export function Legend({ items }: { items: LegendEntry[] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-(--text-secondary)">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <Swatch color={item.color} hatch={item.hatch} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

export function DataTable({
  caption,
  header,
  rows,
}: {
  caption: string;
  header: string[];
  rows: ReactNode[][];
}) {
  return (
    <details className="mt-3 text-xs text-(--text-secondary)">
      <summary className="select-none hover:text-(--text-primary)">
        {caption}
      </summary>
      <div className="mt-2 max-h-64 overflow-auto">
        <table className="w-full text-left tabular-nums">
          <thead>
            <tr>
              {header.map((cell) => (
                <th key={cell} className="pr-4 pb-1 font-medium">
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-t border-(--grid-line)">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="py-0.5 pr-4">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
