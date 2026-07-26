/**
 * shadcn ToggleGroup on Base UI
 * (https://ui.shadcn.com/docs/components/base/toggle-group), styled through the
 * semantic tokens in styles.css. `toggleVariants` (canonically in toggle.tsx)
 * is folded in here because nothing uses a standalone Toggle yet; extract it
 * when one appears. Base UI marks a pressed item with `data-pressed`, and the
 * group's `value`/`onValueChange` deal in arrays even in single-select mode.
 * Deviations from the canonical file: no spacing/orientation machinery (the
 * dashboard only needs a horizontal gap group), and variant defaults resolve in
 * function bodies (typed destructured defaults silently bail React Compiler).
 */
import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group";
import { cva, type VariantProps } from "class-variance-authority";
import { createContext, useContext } from "react";

import { cn, type PropsWithPlainClassName } from "./shared/cn.ts";

const toggleVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-[color,box-shadow] outline-none hover:bg-muted hover:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-pressed:bg-accent data-pressed:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline:
          "border border-input bg-transparent shadow-xs hover:bg-accent hover:text-accent-foreground",
      },
      size: {
        default: "h-9 min-w-9 px-2",
        sm: "h-8 min-w-8 px-1.5",
        lg: "h-10 min-w-10 px-2.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

const ToggleGroupContext = createContext<VariantProps<typeof toggleVariants>>(
  {},
);

export function ToggleGroup({
  className,
  variant,
  size,
  children,
  ...props
}: PropsWithPlainClassName<ToggleGroupPrimitive.Props> &
  VariantProps<typeof toggleVariants>) {
  return (
    <ToggleGroupPrimitive
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      className={cn("flex w-fit items-center gap-2", className)}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ variant, size }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive>
  );
}

export function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  ...props
}: PropsWithPlainClassName<TogglePrimitive.Props> &
  VariantProps<typeof toggleVariants>) {
  const context = useContext(ToggleGroupContext);
  return (
    <TogglePrimitive
      data-slot="toggle-group-item"
      data-variant={context.variant ?? variant}
      data-size={context.size ?? size}
      className={cn(
        toggleVariants({
          variant: context.variant ?? variant,
          size: context.size ?? size,
        }),
        "shrink-0 focus:z-10 focus-visible:z-10",
        className,
      )}
      {...props}
    >
      {children}
    </TogglePrimitive>
  );
}
