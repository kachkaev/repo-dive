/**
 * A compact single-select segmented control — joined buttons in one rounded
 * border, the pattern every chart's above-the-frame controls share. Extracted
 * from the #/% toggle that used to live inside the time-series chart frame;
 * plain buttons with `aria-pressed` rather than the @ui-primitive ToggleGroup,
 * whose shadcn sizing/hover styling is built for standalone toolbar toggles,
 * not a joined text-xs group.
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
    <div
      role="group"
      aria-label={label}
      className="flex w-fit shrink-0 overflow-hidden rounded-md border border-(--grid-line) text-xs"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.title}
          disabled={option.disabled}
          aria-pressed={value === option.value}
          onClick={() => {
            onChange(option.value);
          }}
          className={`px-2 py-0.5 disabled:opacity-40 ${
            value === option.value
              ? "bg-(--surface-2) font-medium"
              : "text-(--text-muted) enabled:hover:text-(--text-secondary)"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
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
