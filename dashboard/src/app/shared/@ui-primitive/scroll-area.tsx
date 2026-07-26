/**
 * shadcn ScrollArea on Base UI
 * (https://ui.shadcn.com/docs/components/base/scroll-area), styled through the
 * semantic tokens in styles.css. Deviations from the canonical file: both
 * scrollbar orientations render from the Root — Base UI unmounts a scrollbar
 * whose axis does not overflow, so consumers never wire one up themselves
 * (the canonical file instead has consumers pass a horizontal ScrollBar as a
 * viewport child, which relies on Radix positioning that Base UI lacks) — and
 * the thumb is sized with Base UI's --scroll-area-thumb-* vars since shadcn's
 * cn-* stylesheet is not part of this repo.
 */
import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area";

import { cn } from "./shared/cn.ts";

function ScrollBar({
  className,
  orientation,
  ...props
}: ScrollAreaPrimitive.Scrollbar.Props) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation ?? "vertical"}
      className={cn(
        "flex touch-none p-px transition-colors select-none",
        (orientation ?? "vertical") === "vertical"
          ? "absolute top-0 right-0 bottom-0 w-2.5 border-l border-l-transparent"
          : "absolute right-0 bottom-0 left-0 h-2.5 flex-col border-t border-t-transparent",
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        data-slot="scroll-area-thumb"
        className={cn(
          "rounded-full bg-border",
          (orientation ?? "vertical") === "vertical"
            ? "h-(--scroll-area-thumb-height) w-full"
            : "h-full w-(--scroll-area-thumb-width)",
        )}
      />
    </ScrollAreaPrimitive.Scrollbar>
  );
}

export function ScrollArea({
  className,
  children,
  ...props
}: ScrollAreaPrimitive.Root.Props) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn("relative", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className="size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1"
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar orientation="vertical" />
      <ScrollBar orientation="horizontal" />
      <ScrollAreaPrimitive.Corner data-slot="scroll-area-corner" />
    </ScrollAreaPrimitive.Root>
  );
}
