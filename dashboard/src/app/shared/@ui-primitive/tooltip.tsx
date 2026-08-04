/**
 * shadcn Tooltip on Base UI (https://ui.shadcn.com/docs/components/base/tooltip),
 * with the styling of the classic new-york style expressed through the semantic
 * tokens in styles.css. Deviations from the canonical file: defaults are
 * resolved in function bodies rather than destructured parameters (typed
 * destructured defaults silently bail React Compiler), the `cn-tooltip-*`
 * classes (which need a stylesheet this repo does not ship) are replaced by
 * plain utilities, and there is no `TooltipProvider` — the dashboard's tooltips
 * are scattered rather than grouped, so each trigger carries its own `delay`.
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
  children,
  ...props
}: PropsWithPlainClassName<TooltipPrimitive.Popup.Props> &
  Pick<
    TooltipPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        side={side ?? "top"}
        sideOffset={sideOffset ?? 6}
        align={align ?? "center"}
        alignOffset={alignOffset ?? 0}
        className="isolate z-50"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "w-fit max-w-xs origin-(--transform-origin) rounded-md bg-foreground px-2 py-1 text-xs text-balance text-background shadow-md transition-[opacity,transform] duration-100 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
            className,
          )}
          {...props}
        >
          {children}
          {/*
            Base UI only pins the arrow along the popup's edge (a `left` or
            `top` inline style); nudging it out of the popup, and turning it to
            face away, is the styling layer's job.
          */}
          <TooltipPrimitive.Arrow className="data-[side=bottom]:-top-[5px] data-[side=bottom]:rotate-180 data-[side=left]:-right-[7.5px] data-[side=left]:-rotate-90 data-[side=right]:-left-[7.5px] data-[side=right]:rotate-90 data-[side=top]:-bottom-[5px]">
            <svg width="10" height="5" viewBox="0 0 10 5" aria-hidden>
              <path d="M0 0 L5 5 L10 0 Z" className="fill-foreground" />
            </svg>
          </TooltipPrimitive.Arrow>
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}
