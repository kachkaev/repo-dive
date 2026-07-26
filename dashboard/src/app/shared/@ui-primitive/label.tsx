/**
 * shadcn Label (https://ui.shadcn.com/docs/components/base/label) — a plain
 * styled <label>; the Base UI variant uses no primitive either.
 */
import type { ComponentProps } from "react";

import { cn } from "./shared/cn.ts";

export function Label({ className, ...props }: ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
