import { type ReactNode, useDeferredValue } from "react";

export function Section({
  title,
  subtitle,
  controls,
  footer,
  children,
}: {
  title: string;
  /**
   * Keep the wording constant across whatever the controls select: the
   * subtitle sits between the title and the controls, so a length change on
   * switch would shift the controls away from the cursor.
   */
  subtitle?: string | undefined;
  /** Optional controls, laid out in a wrapping row above the chart card. */
  controls?: ReactNode;
  /**
   * Rendered after the frame — "View data" tables and the like. The frame
   * itself holds only the visual, its legend and an optional caption.
   */
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mb-10">
      <h2 className="text-base font-semibold">{title}</h2>
      {subtitle ? (
        <p className="mt-0.5 text-sm text-(--text-secondary)">{subtitle}</p>
      ) : undefined}
      {controls ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">{controls}</div>
      ) : undefined}
      <div className="mt-3 rounded-lg border border-(--grid-line) bg-(--surface-1) p-4">
        {children}
      </div>
      {footer}
    </section>
  );
}

/**
 * Ghost of a {@link Section} — muted title and subtitle bars over an empty
 * chart-card frame. Rendered where the next section will land while it is
 * still being prepared, so the page visibly promises more content instead of
 * ending at the last mounted section. Sized to a typical chart section
 * (260px chart + card padding) so the reveal mostly fills the frame in rather
 * than pushing the rest of the page down.
 */
export function SectionSkeleton() {
  return (
    <div aria-hidden="true" className="mb-10 motion-safe:animate-pulse">
      <div className="h-5 w-44 rounded-sm bg-muted" />
      <div className="mt-1.5 h-3.5 w-80 max-w-full rounded-sm bg-muted" />
      <div className="mt-3 h-[292px] rounded-lg border border-border bg-background" />
    </div>
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

/**
 * Rendered below its chart, centered like a figure caption: legends change
 * with the controls, and above the marks a height change would shift them
 * mid-read.
 */
export function Legend({ items }: { items: LegendEntry[] }) {
  return (
    <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-(--text-secondary)">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <Swatch color={item.color} hatch={item.hatch} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

export function DataTable(props: {
  caption: string;
  header: string[];
  rows: ReactNode[][];
}) {
  // The body can hold thousands of rows (one per commit) that sit unseen
  // behind a closed <details>. Mount it empty and fill it — like every later
  // change, e.g. a toggle above the chart swapping the columns — in a
  // deferred, interruptible render, so neither first paint nor a click blocks
  // on it. Header and rows travel as one value so the columns never mismatch.
  const { header, rows } = useDeferredValue(
    { header: props.header, rows: props.rows },
    { header: props.header, rows: [] },
  );
  const caption = props.caption;
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
