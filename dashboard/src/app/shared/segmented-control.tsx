import type { ReactNode } from "react";

import { ToggleGroup, ToggleGroupItem } from "./@ui-primitive/toggle-group.tsx";

/**
 * A single-select control — the pattern every chart's above-the-frame controls
 * share. A thin wrapper over the @ui-primitive ToggleGroup (joined outline
 * look, xs size) that keeps exactly one option pressed and adds per-option
 * disabling with an explanatory tooltip.
 */
export function SegmentedControl<Value extends string>({
  label,
  value,
  onChange,
  options,
}: {
  /** Accessible name for the group — not rendered visibly. */
  label: string;
  value: Value;
  onChange: (value: Value) => void;
  options: Array<{
    value: Value;
    label: ReactNode;
    /** Tooltip; on a disabled option, say why it is unavailable. */
    title?: string | undefined;
    disabled?: boolean | undefined;
  }>;
}) {
  return (
    <ToggleGroup
      aria-label={label}
      variant="outline"
      size="xs"
      className="shrink-0"
      value={[value]}
      onValueChange={(next) => {
        // The group reports single-select state as an array; an empty one is
        // the pressed item being clicked again — ignore it so exactly one
        // option stays selected.
        const nextValue = next.at(-1) as Value | undefined;
        if (nextValue !== undefined) {
          onChange(nextValue);
        }
      }}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          title={option.title}
          disabled={option.disabled}
          // Unpressed options read as quiet labels (muted text, text-only
          // hover) so the pressed one's fill is the sole "selected" signal;
          // disabled options stay hoverable so their explanatory tooltip
          // shows, but keep their resting style (hover is enabled-only).
          className="not-data-pressed:enabled:hover:bg-transparent not-data-pressed:enabled:hover:text-(--text-secondary) not-data-pressed:text-(--text-muted) disabled:pointer-events-auto"
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/**
 * The absolute/percentage switch shared by every stacked chart, driving the
 * chart's `percentMode` prop from section-level state.
 */
export function PercentControl({
  label,
  value,
  onChange,
  disabled,
  disabledTitle,
}: {
  /**
   * Accessible name for the group, e.g. "Commits per month value display".
   * Names the section too, since a report renders several of these and
   * "Value display" alone would not tell them apart.
   */
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  /** Disables the percentage option — e.g. a single series is always 100%. */
  disabled?: boolean | undefined;
  disabledTitle?: string | undefined;
}) {
  return (
    <SegmentedControl
      label={label}
      value={value && !disabled ? "percent" : "absolute"}
      onChange={(next) => {
        onChange(next === "percent");
      }}
      options={[
        { value: "absolute", label: "absolute counts" },
        {
          value: "percent",
          label: "percentage",
          disabled,
          title: disabled ? disabledTitle : "Share of total",
        },
      ]}
    />
  );
}
