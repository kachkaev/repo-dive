/**
 * The markup of the dashboard's joined toggle buttons, drawn from the parts of
 * `@effect/ui-kit`'s headless ToggleGroup — the counterpart of
 * ../../../../dashboard's shadcn ToggleGroup on Base UI. Only the variant
 * the dashboard draws exists: `outline` at size `xs`, whose classes are the
 * ones shadcn's `toggleVariants` and the React wrapper merge into, verbatim,
 * with the same `data-slot`/`data-variant`/`data-size` attributes those
 * classes select on. Items join into one bordered pill, rounded only at the
 * group's ends.
 *
 * ui-kit's ToggleGroup is controlled and reports the value asked for in
 * `Toggled`, always as an array (as Base UI's does), so the caller maps that
 * event to its own message.
 */
import type { Html } from "@effect/ui/html";

const variantAttrs = { "data-variant": "outline", "data-size": "xs" } as const;

export const ToggleGroupRoot = <M>(
  h: Html.H<M>,
  options: { readonly label: string; readonly class?: string | undefined },
) =>
  h.div
    .attrs({
      "data-slot": "toggle-group",
      ...variantAttrs,
      "aria-label": options.label,
    })
    .class(
      "flex w-fit items-center gap-2 data-[variant=outline]:gap-0 data-[variant=outline]:rounded-md",
      options.class,
    );

/**
 * One item's button. Hover styles are enabled-only: a disabled item may stay
 * hoverable for its explanatory tooltip and must not light up then.
 */
export const ToggleGroupItemButton = <M>(
  h: Html.H<M>,
  options: { readonly class?: string | undefined },
) =>
  h.button
    .attrs({ "data-slot": "toggle-group-item", ...variantAttrs })
    .class(
      "inline-flex h-7 shrink-0 items-center justify-center gap-2 rounded-md border border-input bg-transparent px-2 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] outline-none focus:z-10 focus-visible:z-10 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 enabled:hover:bg-accent enabled:hover:text-accent-foreground disabled:opacity-50 data-pressed:bg-accent data-pressed:text-accent-foreground data-[variant=outline]:rounded-none data-[variant=outline]:border-l-0 data-[variant=outline]:first:rounded-l-md data-[variant=outline]:first:border-l data-[variant=outline]:last:rounded-r-md [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
      options.class,
    );
