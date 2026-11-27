import type { View } from "@effect/ui";
import type { Html } from "@effect/ui/html";
import { ToggleGroup } from "@effect/ui-kit";

import {
  ToggleGroupItemButton,
  ToggleGroupRoot,
} from "./@ui-primitive/toggle-group.ts";

export type SegmentedControlOption<Value extends string, M> = {
  value: Value;
  label: string | View.Children<M, never>;
  /** Tooltip; on a disabled option, say why it is unavailable. */
  title?: string | undefined;
  disabled?: boolean | undefined;
};

/**
 * A single-select control — the pattern every chart's above-the-frame controls
 * share. A view function over ui-kit's ToggleGroup (joined outline look, xs
 * size) that keeps exactly one option pressed and adds per-option disabling
 * with an explanatory tooltip.
 *
 * The value belongs to the calling component, which passes it in and maps
 * `onChange` to one of its own messages. Several controls in one component
 * each need their own `key`.
 */
export const SegmentedControl = <M, Value extends string>(
  h: Html.H<M>,
  options: {
    readonly key: string;
    /** Accessible name for the group — not rendered visibly. */
    readonly label: string;
    readonly value: Value;
    readonly onChange: (value: Value) => M;
    readonly options: ReadonlyArray<SegmentedControlOption<Value, M>>;
  },
) =>
  ToggleGroup(h, {
    key: options.key,
    props: {
      value: [options.value],
      items: options.options.map((option) => ({
        value: option.value,
        disabled: option.disabled ?? false,
      })),
    },
    // The group reports single-select state as an array; an empty one is the
    // pressed item being clicked again — ignore it so exactly one option
    // stays selected.
    onEmit: ({ value }) => {
      const next = options.options.find(
        (option) => option.value === value.at(-1),
      );
      return next === undefined ? undefined : options.onChange(next.value);
    },
    view: (toggleGroup) =>
      toggleGroup
        .root(
          ToggleGroupRoot(h, { label: options.label, className: "shrink-0" }),
        )
        .children(
          options.options.map((option) =>
            toggleGroup
              .item({
                element: ToggleGroupItemButton(h, {
                  // Unpressed options read as quiet labels (muted text,
                  // text-only hover) so the pressed one's fill is the sole
                  // "selected" signal; disabled options stay hoverable so
                  // their explanatory tooltip shows, but keep their resting
                  // style (hover is enabled-only).
                  className:
                    "not-data-pressed:enabled:hover:bg-transparent not-data-pressed:enabled:hover:text-(--text-secondary) not-data-pressed:text-(--text-muted) disabled:pointer-events-auto",
                }).attr("title", option.title),
                value: option.value,
              })
              // Base UI writes `aria-disabled` on every toggle in a group,
              // "false" included; ui-kit's item part never sets it.
              .attr("aria-disabled", String(option.disabled ?? false))
              .children(option.label),
          ),
        ),
  });

/**
 * The absolute/percentage switch shared by every stacked chart, driving the
 * chart's percent mode from section-level state.
 */
export const PercentControl = <M>(
  h: Html.H<M>,
  options: {
    readonly key: string;
    /**
     * Accessible name for the group, e.g. "Commits per month value display".
     * Names the section too, since a report renders several of these and
     * "Value display" alone would not tell them apart.
     */
    readonly label: string;
    readonly value: boolean;
    readonly onChange: (value: boolean) => M;
    /** Disables the percentage option — e.g. a single series is always 100%. */
    readonly disabled?: boolean | undefined;
    readonly disabledTitle?: string | undefined;
  },
) =>
  SegmentedControl(h, {
    key: options.key,
    label: options.label,
    value: options.value && !options.disabled ? "percent" : "absolute",
    onChange: (next) => options.onChange(next === "percent"),
    options: [
      { value: "absolute", label: "absolute counts" },
      {
        value: "percent",
        label: "percentage",
        disabled: options.disabled,
        title: options.disabled ? options.disabledTitle : "Share of total",
      },
    ],
  });
