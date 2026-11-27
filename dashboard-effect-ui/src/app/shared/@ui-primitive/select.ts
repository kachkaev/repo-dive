/**
 * The markup of the dashboard's dropdown, drawn from the parts of
 * `@effect/ui-kit`'s headless Select — the counterpart of
 * ../../../../dashboard's shadcn Select on Base UI, with the same classes,
 * data slots and icons, so both dashboards render the same trigger and popup.
 *
 * ui-kit's Select is controlled (the consumer owns `open` and `value`), so
 * this module only draws: the component that calls it keeps `open` in its
 * Model (see `report-sections/history-range-select.ts`).
 *
 * Deviations from the React primitive: only the `xs` trigger size exists
 * (the only one the dashboard draws), the popup always sits below the trigger
 * (`alignItemWithTrigger: false`, as the React primitive defaults to), and
 * the positioner and backdrop take `topLayerResetClass`, since ui-kit places
 * them in the top layer where the view writes them instead of in a portal.
 */
import type { Html } from "@effect/ui/html";
import type { makeSelect } from "@effect/ui-kit";

import { cn } from "../cn.ts";
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "../icons.ts";
import { topLayerResetClass } from "./shared/top-layer-reset-class.ts";

/** The parts of a ui-kit Select made by `makeSelect` for values of type `V`. */
type SelectParts<V extends string> = Parameters<
  NonNullable<Parameters<ReturnType<typeof makeSelect<V>>>[1]["view"]>
>[0];

const scrollArrowClass = cn(
  "absolute z-10 flex w-full cursor-default items-center justify-center bg-popover py-1",
);

export const SelectView = <M, V extends string>(
  h: Html.H<M>,
  select: SelectParts<V>,
  options: {
    /** Accessible name of the trigger, not rendered. */
    readonly label: string;
    readonly items: ReadonlyArray<{ value: V; label: string }>;
  },
) => [
  select
    .trigger(
      h.button
        .attrs({
          "data-slot": "select-trigger",
          "data-size": "xs",
          "aria-label": options.label,
        })
        // Mirrors an unpressed outline toggle item (no shadow, no dark-mode
        // tint, text-only hover — an accent fill would read as a pressed
        // item), so mixed control rows read as one family.
        .class(
          "flex w-fit items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm whitespace-nowrap text-(--text-secondary) transition-[color,box-shadow] outline-none hover:text-(--text-primary) focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-9 data-[size=sm]:h-8 data-[size=xs]:h-7 data-[size=xs]:px-2 data-[size=xs]:text-xs *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
        ),
    )
    .children(
      select.value(
        h.span.attr("data-slot", "select-value").class("select-none"),
      ),
      select.icon(h.span).children(ChevronDownIcon(h)),
    ),
  select.backdrop(h.div.class(topLayerResetClass)),
  select.positioner(h.div.class("isolate z-50", topLayerResetClass)).children(
    select
      .popup(
        h.div
          .attr("data-slot", "select-content")
          // border-border is load-bearing: Tailwind v4's bare `border`
          // defaults to currentColor, which here is the popover foreground.
          .class(
            "relative isolate z-50 max-h-(--available-height) min-w-(--anchor-width) origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-md",
          ),
      )
      .children(
        select
          .scrollUpArrow({
            element: h.div
              .attr("data-slot", "select-scroll-up-button")
              .class(scrollArrowClass, "top-0"),
          })
          ?.children(ChevronUpIcon(h, { class: cn("size-4") })),
        // The listbox inside the popup, where Base UI's `Select.List` draws it,
        // which turns the popup into a presentation. Base UI also gives it
        // its `base-ui-disable-scrollbar` class, which does nothing on an
        // element that doesn't scroll, so it is left out (see the README's
        // deviations).
        select.list(h.div).children(
          options.items.map((item) =>
            select
              .item({
                element: h.div
                  .attr("data-slot", "select-item")
                  .class(
                    "relative flex w-full cursor-default items-center gap-2 py-1.5 pr-8 pl-2 text-xs outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
                  ),
                value: item.value,
              })
              .children(
                select
                  .itemText(h.div.class("shrink-0 whitespace-nowrap"))
                  .children(item.label),
                select
                  .itemIndicator({
                    element: h.span.class(
                      "absolute right-2 flex size-3.5 items-center justify-center",
                    ),
                    value: item.value,
                  })
                  // Drawn only for the selected item; Base UI marks it so.
                  ?.attr("data-selected", "")
                  .children(CheckIcon(h, { class: cn("pointer-events-none") })),
              ),
          ),
        ),
        select
          .scrollDownArrow({
            element: h.div
              .attr("data-slot", "select-scroll-down-button")
              .class(scrollArrowClass, "bottom-0"),
          })
          ?.children(ChevronDownIcon(h, { class: cn("size-4") })),
      ),
  ),
];
