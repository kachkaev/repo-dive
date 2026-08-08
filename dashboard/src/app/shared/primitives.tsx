import { LoaderCircleIcon } from "lucide-react";
import { type ReactNode, useDeferredValue } from "react";

import { formatDate, formatDayOfWeek } from "./format.ts";

/** The longest weekday name — what the slot below is sized against. */
const widestDayName = "Wednesday";

/**
 * A date and the weekday it fell on, as a hover card stamps it. A card is only
 * as wide as its widest line, so on charts with short value rows the weekday
 * sets that width — and the card would grow and shrink under the cursor as the
 * name changed length. The name therefore sits in a slot as wide as
 * {@link widestDayName}: an invisible copy holds the width open and the real
 * name overlays it in the same grid cell, which keeps the slot correct in any
 * font rather than at one hand-measured pixel width.
 */
export function DateStamp({ isoDate }: { isoDate: string }) {
  return (
    // `tabular-nums` does for the date what the slot does for the weekday: with
    // both fixed, the whole stamp is one width for every day of the calendar.
    <span className="tabular-nums">
      {formatDate(isoDate)} ·{" "}
      <span className="inline-grid">
        <span aria-hidden className="invisible col-start-1 row-start-1">
          {widestDayName}
        </span>
        <span className="col-start-1 row-start-1">
          {formatDayOfWeek(isoDate)}
        </span>
      </span>
    </span>
  );
}

export function Section({
  title,
  subtitle,
  controls,
  footer,
  skeleton,
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
  /**
   * Render only the heading over a small spinner, skipping the controls, the
   * children and the footer. The reveal tail shows the next section this way
   * — its title and subtitle are plain props, unaffected by the chart body
   * they wait for, so they can land early and never reflow. The spinner row
   * copies the controls row's spacing and height (mt-2, h-7 — the xs control
   * size), so when the real section arrives the controls replace it without
   * any shift and the chart card only extends below.
   */
  skeleton?: boolean | undefined;
  children: ReactNode;
}) {
  const controlsRow = skeleton ? undefined : controls;
  return (
    <section className="mb-10">
      <h2 className="text-base font-semibold">{title}</h2>
      {subtitle ? (
        <p className="mt-0.5 text-sm text-(--text-secondary)">{subtitle}</p>
      ) : undefined}
      {controlsRow ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {controlsRow}
        </div>
      ) : undefined}
      {skeleton ? (
        <div aria-hidden="true" className="mt-2 flex h-7 items-center">
          <LoaderCircleIcon className="size-4 text-muted-foreground motion-safe:animate-spin" />
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-(--grid-line) bg-(--surface-1) p-4">
          {children}
        </div>
      )}
      {skeleton ? undefined : footer}
    </section>
  );
}

/**
 * Ghost of a {@link Section} — muted title and subtitle bars over the same
 * spinner row {@link Section}'s `skeleton` mode uses. Rendered where the
 * report will start while nothing about its first section is known yet (the
 * reveal tail knows the next section and shows its real heading instead), so
 * the page visibly promises more content. The ghost bars are kept narrower
 * than any real title ("Contributors" is the shortest) so the text that
 * replaces them only ever extends — pixels appearing reads as loading, pixels
 * vanishing as a flash.
 */
export function SectionSkeleton() {
  return (
    <div aria-hidden="true" className="mb-10">
      <div className="h-5 w-20 rounded-sm bg-muted motion-safe:animate-pulse" />
      <div className="mt-1.5 h-3.5 w-80 max-w-full rounded-sm bg-muted motion-safe:animate-pulse" />
      <div className="mt-2 flex h-7 items-center">
        <LoaderCircleIcon className="size-4 text-muted-foreground motion-safe:animate-spin" />
      </div>
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
        <div className="mt-0.5 text-xs tabular-nums text-(--text-secondary)">
          {hint}
        </div>
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
