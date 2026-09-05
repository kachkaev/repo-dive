import { InfoIcon, LoaderCircleIcon } from "lucide-react";
import { type ReactNode, useDeferredValue } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "./@ui-primitive/tooltip.tsx";
import { formatDate, formatDayOfWeek } from "./format.ts";
import { Markdown } from "./markdown.tsx";

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
  annotation,
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
  /**
   * Markdown note from the analyzed repo's config, rendered as a callout
   * between the heading and the controls. Shown in `skeleton` mode too — like
   * the title and subtitle it is a plain prop, so landing it early means the
   * real section never shifts the layout.
   */
  annotation?: string | undefined;
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
      {annotation ? (
        <aside className="mt-2 flex max-w-prose gap-2 rounded-md border border-border bg-muted px-3 py-2 text-sm text-(--text-secondary)">
          <InfoIcon
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          />
          <div>
            <Markdown source={annotation} />
          </div>
        </aside>
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
        <div className="mt-3 rounded-md border border-(--grid-line) bg-(--surface-1) p-4">
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
    <div className="rounded-md border border-(--grid-line) bg-(--surface-1) px-4 py-3">
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
 * A legend/tooltip swatch: base color, plus the same hatch the marks use
 * (2px lines at a 6px pitch — 2/3 base fill, 1/3 helper color).
 *
 * `135deg` is the CSS spelling of the charts' `rotate(45)` SVG patterns: CSS
 * angles run clockwise from "to top" and the bands sit perpendicular to that
 * axis, so 135deg — not 45deg — is what leans bottom-left to top-right.
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
          ? `repeating-linear-gradient(135deg, transparent 0 4px, ${hatch} 4px 6px)`
          : undefined,
      }}
    />
  );
}

/**
 * Rendered below its chart, centered like a figure caption: legends change
 * with the controls, and above the marks a height change would shift them
 * mid-read. Laid out as inline boxes rather than a wrapping flexbox so
 * `text-balance` applies — it balances line boxes, which flex rows are not —
 * and a wrapped legend fills its rows evenly instead of stranding the last
 * item (usually "Other") alone on the final row. The margins reproduce the
 * old flex gaps: `mx-2` meets another item's `mx-2` for the 16px column gap,
 * `my-0.5` for the 4px row gap.
 */
export function Legend({
  items,
  marginClassName,
  toggles,
}: {
  items: LegendEntry[];
  /** Replaces the default `mt-2` — e.g. a second legend standing further off. */
  marginClassName?: string | undefined;
  /**
   * Makes every item a button that hides its series from the chart. A hidden
   * item stays in place, crossed out at partial opacity, so the legend never
   * reflows under the cursor. Omitted, the legend is a static caption.
   */
  toggles?: LegendToggles | undefined;
}) {
  const hiddenLabels = toggles?.hiddenLabels;
  return (
    <div
      className={`${marginClassName ?? "mt-2"} text-center text-xs text-balance text-(--text-secondary)`}
    >
      {items.map((item) => {
        const hidden = hiddenLabels?.has(item.label) ?? false;
        const swatch = (
          <Swatch
            color={item.color}
            hatch={item.hatch}
            className={
              hidden
                ? "inline-block size-2.5 rounded-xs opacity-35"
                : "inline-block size-2.5 rounded-xs"
            }
          />
        );
        if (toggles === undefined) {
          return (
            <span
              key={item.label}
              className="mx-2 my-0.5 inline-flex items-center gap-1.5"
            >
              {swatch}
              {item.label}
            </span>
          );
        }
        return (
          <Tooltip key={item.label}>
            <TooltipTrigger
              delay={400}
              render={
                // `select-none`: quick repeated clicks would otherwise select
                // the label as a word. `group` lets the label preview the
                // click on hover (below); besides that and the text shift the
                // ring is the only feedback — no fill, so the row stays a
                // caption.
                <button
                  type="button"
                  aria-pressed={!hidden}
                  className="group mx-2 my-0.5 inline-flex items-center gap-1.5 rounded-xs outline-none select-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  onClick={() => {
                    toggles.onToggle(item.label);
                  }}
                />
              }
            >
              {swatch}
              {/* Hovering a visible label previews the click with a faint
                  strike-through — the line it will get. A hidden label keeps
                  its crossed-out look on hover; the text shift is enough. */}
              <span
                className={
                  hidden
                    ? "line-through opacity-60"
                    : "group-hover:line-through group-hover:decoration-muted-foreground/40"
                }
              >
                {item.label}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {hidden ? "Click to show" : "Click to hide"}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

/**
 * The chart-side half of a {@link Legend} with toggles: which labels are hidden,
 * and what a click on a label does.
 */
export type LegendToggles = {
  hiddenLabels: ReadonlySet<string>;
  /** A click: hides a visible label, shows a hidden one. */
  onToggle: (label: string) => void;
};

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
