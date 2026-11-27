/**
 * The dashboard's hover card for a single trigger, on `@effect/ui-kit`'s
 * headless Tooltip — the counterpart of ../../../../dashboard's shadcn
 * Tooltip on Base UI, with the same muted card (surface-2 on a grid-line
 * border) and arrow, so every floating readout shares one appearance.
 *
 * ui-kit's Tooltip is controlled: the consumer owns `open` and stores what
 * its `RequestedOpen` / `RequestedClose` events ask for. Base UI's is
 * uncontrolled by default, which is how the React dashboard uses it, so this
 * component holds `open` in its own Model and takes the trigger's and the
 * card's content as slots. A chart whose tooltip follows the hovered mark
 * keeps `open` (and what it describes) in its own Model instead and calls
 * ui-kit's Tooltip directly, with `anchor` — see the README.
 *
 * Deviations from the React primitive:
 *
 * - A `<span>` wraps the trigger and the card: a view returns one node.
 * - The positioner and popup are `<div>`s, the only element ui-kit's parts
 *   take, so a tooltip inside a `<p>` (the header's) nests a `<div>` there.
 *   The DOM is built directly, never parsed, so nothing moves.
 * - The trigger is a link with an `href`, or else a `<button>`: ui-kit's
 *   trigger part accepts only those two. The React dashboard draws an inert
 *   trigger as a focusable `<span>`; the button is reset to look the same.
 * - The card is written next to its trigger instead of portaled to the
 *   body, so its positioner takes `topLayerReset` against the styles it
 *   would otherwise inherit from the trigger's surroundings.
 * - The card fades and scales in through `@starting-style` but closes at
 *   once: ui-kit hides the positioner (a manual popover) as soon as `open`
 *   turns false, so there is no exit transition to run.
 */
import { UiSchema, type View } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { Tooltip as TooltipPrimitive } from "@effect/ui-kit";
import { Schema } from "effect";

import { topLayerReset } from "./shared/top-layer-reset.ts";

/** The parts of a ui-kit Tooltip that {@link TooltipContent} draws. */
type TooltipParts = Parameters<
  NonNullable<Parameters<typeof TooltipPrimitive>[1]["view"]>
>[0];

/**
 * The card and its arrow, for any ui-kit Tooltip — the one below, or a
 * chart's controlled tooltip. Base UI only pins the arrow along the popup's
 * edge and ui-kit does the same (an inline `left` or `top`); nudging it out
 * of the popup, and turning it to face away, is the styling layer's job. The
 * arrow overlaps the popup by 1px so its fill covers the popup's border where
 * they meet, and only the sloped edges carry a stroke — the border appears to
 * run around the arrow.
 *
 * `arrow: false` drops the arrow, for a tooltip that tracks a moving anchor
 * and would rather not point at anything, as the React `TooltipContent`'s
 * prop does. React's `anchor` prop has no counterpart here: with ui-kit it
 * is a prop of the Tooltip itself (`anchor`: the id of the element to place
 * the card against), not of its content.
 */
export const TooltipContent = <M>(
  h: Html.H<M>,
  tooltip: TooltipParts,
  content: View.Input<M>,
  options?: {
    readonly arrow?: boolean | undefined;
    /**
     * Appended to the popup's classes as they are, where the React
     * `className` prop is merged with `cn` (tailwind-merge): pass classes
     * that don't compete with the popup's own.
     */
    readonly className?: string | undefined;
  },
) =>
  tooltip
    .positioner(
      // A manual popover in the top layer, written where the view writes it:
      // see `topLayerReset`. The popup carries the look.
      h.div.class(`isolate z-50 ${topLayerReset}`),
    )
    .children(
      tooltip
        .popup(
          h.div
            .attr("data-slot", "tooltip-content")
            .class(
              "w-fit max-w-xs origin-(--transform-origin) rounded-md border border-border bg-muted px-2.5 py-1.5 text-xs text-balance text-foreground shadow-sm transition-[opacity,transform] duration-100 starting:scale-95 starting:opacity-0",
              options?.className,
            ),
        )
        .children(
          content,
          options?.arrow !== false &&
            tooltip
              .arrow(
                h.div.class(
                  "data-[side=bottom]:-top-[4px] data-[side=bottom]:rotate-180 data-[side=left]:-right-[6.5px] data-[side=left]:-rotate-90 data-[side=right]:-left-[6.5px] data-[side=right]:rotate-90 data-[side=top]:-bottom-[4px]",
                ),
              )
              .children(
                h.svg
                  .attrs({
                    width: "10",
                    height: "5",
                    viewBox: "0 0 10 5",
                    "aria-hidden": "true",
                  })
                  .class("overflow-visible")
                  .children(
                    h.path.attr("d", "M0 0 L5 5 L10 0 Z").class("fill-muted"),
                    h.path
                      .attrs({
                        d: "M0 0 L5 5 L10 0",
                        fill: "none",
                        "stroke-width": "1",
                      })
                      .class("stroke-border"),
                  ),
              ),
        ),
    );

export const TooltipMessage = UiSchema.TaggedEnum({
  RequestedOpenTooltip: {},
  RequestedCloseTooltip: {},
  ClickedTrigger: { alt: Schema.Boolean },
});

/**
 * A click on a button trigger, with whether Alt (⌥) was held — what a legend
 * item toggles its series with. Link triggers just follow their link.
 */
export const TooltipEvents = UiSchema.TaggedEnum({
  Clicked: { alt: Schema.Boolean },
});

export const Tooltip = Html.component({
  name: "Tooltip",
  props: Schema.Struct({
    /** Milliseconds the pointer rests on the trigger before the card opens. */
    delay: Schema.Number,
    /** Makes the trigger a link that opens in a new tab. */
    href: Schema.optional(Schema.String),
    /** Makes a button trigger a toggle button, `aria-pressed` this. */
    pressed: Schema.optional(Schema.Boolean),
    triggerClass: Schema.String,
  }),
  model: Schema.Struct({ open: Schema.Boolean }),
  message: TooltipMessage,
  events: TooltipEvents,
  slots: ["trigger", "content"],
  // What only the pointer knew; after a reload the card starts closed.
  restore: false,
}).make({
  init: () => ({ open: false }),
  update: {
    RequestedOpenTooltip: ($) => $.evolve({ open: true }),
    RequestedCloseTooltip: ($) => $.evolve({ open: false }),
    ClickedTrigger: ($, { alt }) => $.emit(TooltipEvents.Clicked({ alt })),
  },
  view: (h, model) =>
    TooltipPrimitive(h, {
      props: {
        open: model.open,
        delay: h.props.delay,
        side: "top",
        sideOffset: 6,
        align: "center",
      },
      onEmit: {
        RequestedOpen: () => TooltipMessage.RequestedOpenTooltip(),
        RequestedClose: () => TooltipMessage.RequestedCloseTooltip(),
      },
      // A view returns one node and Effect UI has no fragments, so a span
      // holds the trigger and the positioner. The positioner is a popover —
      // hidden, or in the top layer — so the span lays out as the trigger
      // alone would.
      view: (tooltip) =>
        h.span(
          tooltip
            .trigger(
              h.props.href === undefined
                ? h.button
                    .attrs({
                      type: "button",
                      "aria-pressed":
                        h.props.pressed === undefined
                          ? undefined
                          : String(h.props.pressed),
                    })
                    .class(h.props.triggerClass)
                    .on("click", ({ alt }) =>
                      TooltipMessage.ClickedTrigger({ alt }),
                    )
                : h.a
                    .attrs({
                      href: h.props.href,
                      target: "_blank",
                      rel: "noreferrer",
                    })
                    .class(h.props.triggerClass),
            )
            .children(h.slots.trigger),
          TooltipContent(h, tooltip, h.slots.content),
        ),
    }),
});
