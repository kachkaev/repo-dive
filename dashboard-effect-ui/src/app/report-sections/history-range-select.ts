import { UiSchema } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { Select } from "@effect/ui-kit";
import { Schema } from "effect";

import { SelectView } from "../shared/@ui-primitive/select.ts";

const HistoryRangeSelectMessage = UiSchema.TaggedEnum({
  RequestedOpenSelect: {},
  RequestedCloseSelect: {},
  PickedSelectChoice: { value: Schema.String },
});

/** What the select asks of its section: show this range instead. */
const HistoryRangeSelectEvents = UiSchema.TaggedEnum({
  Picked: { value: Schema.String },
});

/**
 * A dropdown of history ranges, sized for a section's control row. A
 * component rather than a view function because ui-kit's Select is
 * controlled: someone has to own whether the popup is open, and that is
 * nobody's business but the select's. The range itself stays with the
 * section, which passes it in as `value` and hears `Picked`.
 */
export const HistoryRangeSelect = Html.component({
  name: "HistoryRangeSelect",
  props: Schema.Struct({
    /**
     * Accessible name, e.g. "Calendar range" — the options ("Last 12 months",
     * …) make the purpose plain, so it is not rendered.
     */
    label: Schema.String,
    value: Schema.String,
    items: Schema.Array(
      Schema.Struct({ value: Schema.String, label: Schema.String }),
    ),
  }),
  model: Schema.Struct({ open: Schema.Boolean }),
  message: HistoryRangeSelectMessage,
  events: HistoryRangeSelectEvents,
  restore: false,
}).make({
  init: () => ({ open: false }),
  update: {
    RequestedOpenSelect: ($) => $.evolve({ open: true }),
    RequestedCloseSelect: ($) => $.evolve({ open: false }),
    // A range select always has a value: an empty pick (the cleared state)
    // is ignored.
    PickedSelectChoice: ($, { value }) =>
      value === "" || value === $.props.value
        ? $.model
        : $.emit(HistoryRangeSelectEvents.Picked({ value })),
  },
  view: (h, model) =>
    // A fixed-width slot for the trigger, which keeps hugging its own value:
    // the options differ by ~60px ("2019" against the widest, "Last 12
    // months", which needs 128px at this size), and a trigger claiming a
    // different slice of the row on every change hopped between rows once the
    // row wraps on a narrow viewport.
    Select(h, {
      props: {
        open: model.open,
        value: h.props.value,
        items: h.props.items,
        side: "bottom",
        sideOffset: 4,
        align: "center",
        alignItemWithTrigger: false,
      },
      // Each event the select asks for maps to a fact of this component's own;
      // `Settled` (the popup's transitions ended) needs no answer.
      onEmit: (event) =>
        event._tag === "RequestedOpen"
          ? HistoryRangeSelectMessage.RequestedOpenSelect()
          : event._tag === "RequestedClose"
            ? HistoryRangeSelectMessage.RequestedCloseSelect()
            : event._tag === "Picked" && typeof event.value === "string"
              ? HistoryRangeSelectMessage.PickedSelectChoice({
                  value: event.value,
                })
              : undefined,
      // The slot also holds the popup and its backdrop: a view returns one
      // node, and both live in the top layer, outside the slot's layout.
      view: (select) =>
        h.div.class("w-36").children(
          SelectView(h, select, {
            label: h.props.label,
            items: h.props.items,
          }),
        ),
    }),
});
