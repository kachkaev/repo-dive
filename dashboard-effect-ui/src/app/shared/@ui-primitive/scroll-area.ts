/**
 * The dashboard's scroll area, drawn from the parts of `@effect/ui-kit`'s
 * headless ScrollArea — the counterpart of ../../../../dashboard's shadcn
 * ScrollArea on Base UI, with the same classes and `data-slot` attributes,
 * and both scrollbars drawn from the root: ui-kit, like Base UI, leaves out
 * a scrollbar whose axis does not overflow, so a consumer never wires one up.
 *
 * Deviations from the React primitive:
 *
 * - ui-kit observes a content element inside the viewport to notice its
 *   content resizing, where Base UI's viewport holds the children directly.
 *   The consumer's own outermost element is that content
 *   (`contentClassName`), so the tree stays the same and that element gains
 *   ui-kit's `role="presentation"`, its data attributes and an inline
 *   `min-width: fit-content`.
 * - The native scrollbars are hidden by ui-kit's inline
 *   `scrollbar-width: none` rather than Base UI's injected
 *   `base-ui-disable-scrollbar` class.
 */
import type { View } from "@effect/ui";
import type { Html } from "@effect/ui/html";
import { ScrollArea as ScrollAreaPrimitive } from "@effect/ui-kit";

type ScrollAreaParts = Parameters<
  NonNullable<Parameters<typeof ScrollAreaPrimitive>[1]["view"]>
>[0];

const ScrollBar = <M>(
  h: Html.H<M>,
  scrollArea: ScrollAreaParts,
  orientation: "vertical" | "horizontal",
) =>
  scrollArea.scrollbar({
    orientation,
    element: h.div
      .attr("data-slot", "scroll-area-scrollbar")
      .class(
        "flex touch-none p-px transition-colors select-none",
        orientation === "vertical"
          ? "absolute top-0 right-0 bottom-0 w-2.5 border-l border-l-transparent"
          : "absolute right-0 bottom-0 left-0 h-2.5 flex-col border-t border-t-transparent",
      ),
    thumb: h.div
      .attr("data-slot", "scroll-area-thumb")
      .class(
        orientation === "vertical"
          ? "rounded-full bg-border h-(--scroll-area-thumb-height) w-full"
          : "rounded-full bg-border h-full w-(--scroll-area-thumb-width)",
      ),
  });

/**
 * A scroll area around `children`, which are laid out inside the content
 * element drawn with `contentClassName`.
 */
export const ScrollArea = <M, C extends View.Children<M>>(
  h: Html.H<M>,
  options: {
    readonly contentClassName: string;
    readonly children: C;
  },
) =>
  ScrollAreaPrimitive(h, {
    props: {},
    view: (scrollArea) =>
      scrollArea
        .root(h.div.attr("data-slot", "scroll-area").class("relative"))
        .children(
          scrollArea
            .viewport(
              h.div
                .attr("data-slot", "scroll-area-viewport")
                .class(
                  "size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1",
                ),
            )
            .children(
              scrollArea
                .content(h.div.class(options.contentClassName))
                .children(options.children),
            ),
          ScrollBar(h, scrollArea, "vertical"),
          ScrollBar(h, scrollArea, "horizontal"),
          scrollArea.corner(h.div.attr("data-slot", "scroll-area-corner")),
        ),
  });
