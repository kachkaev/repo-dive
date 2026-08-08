/**
 * shadcn Tooltip on Base UI (https://ui.shadcn.com/docs/components/base/tooltip),
 * restyled from the inverted new-york look into the muted card the charts'
 * hover tooltips use (surface-2 on a grid-line border), so every floating
 * readout in the dashboard shares one appearance. Expressed through the
 * semantic tokens in styles.css. Deviations from the canonical file: defaults are
 * resolved in function bodies rather than destructured parameters (typed
 * destructured defaults silently bail React Compiler), the `cn-tooltip-*`
 * classes (which need a stylesheet this repo does not ship) are replaced by
 * plain utilities, there is no `TooltipProvider` — the dashboard's tooltips
 * are scattered rather than grouped, so each trigger carries its own `delay` —
 * the positioner's `anchor` is forwarded, so a controlled tooltip can follow
 * something other than a trigger (a hovered SVG cell, say), and `arrow` can
 * drop the arrow, for a tooltip that tracks a moving anchor and would rather
 * not point at anything.
 */
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";

import { cn, type PropsWithPlainClassName } from "./shared/cn.ts";

export const Tooltip = TooltipPrimitive.Root;

export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({
  className,
  side,
  sideOffset,
  align,
  alignOffset,
  anchor,
  arrow,
  children,
  ...props
}: PropsWithPlainClassName<TooltipPrimitive.Popup.Props> &
  Pick<
    TooltipPrimitive.Positioner.Props,
    "align" | "alignOffset" | "anchor" | "side" | "sideOffset"
  > & { arrow?: boolean | undefined }) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        side={side ?? "top"}
        sideOffset={sideOffset ?? 6}
        align={align ?? "center"}
        alignOffset={alignOffset ?? 0}
        anchor={anchor}
        className="isolate z-50"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "w-fit max-w-xs origin-(--transform-origin) rounded-md border border-border bg-muted px-2.5 py-1.5 text-xs text-balance text-foreground shadow-sm transition-[opacity,transform] duration-100 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
            className,
          )}
          {...props}
        >
          {children}
          {/*
            Base UI only pins the arrow along the popup's edge (a `left` or
            `top` inline style); nudging it out of the popup, and turning it to
            face away, is the styling layer's job. The arrow overlaps the popup
            by 1px (offsets are one short of its 5px height) so its fill covers
            the popup's border where they meet, and only the sloped edges carry
            a stroke — the border appears to run around the arrow.
          */}
          {arrow !== false && (
            <TooltipPrimitive.Arrow className="data-[side=bottom]:-top-[4px] data-[side=bottom]:rotate-180 data-[side=left]:-right-[6.5px] data-[side=left]:-rotate-90 data-[side=right]:-left-[6.5px] data-[side=right]:rotate-90 data-[side=top]:-bottom-[4px]">
              <svg
                width="10"
                height="5"
                viewBox="0 0 10 5"
                aria-hidden
                className="overflow-visible"
              >
                <path d="M0 0 L5 5 L10 0 Z" className="fill-muted" />
                <path
                  d="M0 0 L5 5 L10 0"
                  fill="none"
                  strokeWidth="1"
                  className="stroke-border"
                />
              </svg>
            </TooltipPrimitive.Arrow>
          )}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}
