import { ToggleGroup, ToggleGroupItem } from "./@ui-primitive/toggle-group.tsx";

/**
 * A single-select control — the pattern every chart's above-the-frame controls
 * share. A thin wrapper over the @ui-primitive ToggleGroup (smallest size)
 * that keeps exactly one option pressed and adds per-option disabling with an
 * explanatory tooltip.
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
    label: string;
    /** Tooltip; on a disabled option, say why it is unavailable. */
    title?: string | undefined;
    disabled?: boolean | undefined;
  }>;
}) {
  return (
    <ToggleGroup
      aria-label={label}
      size="sm"
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
  value,
  onChange,
  disabled,
  disabledTitle,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  /** Disables the percentage option — e.g. a single series is always 100%. */
  disabled?: boolean | undefined;
  disabledTitle?: string | undefined;
}) {
  return (
    <SegmentedControl
      label="Value display"
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
