import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./@ui-primitive/select.tsx";
import type { HistoryRange } from "./history-range.ts";

/** A dropdown of history ranges, sized for a section's control row. */
export function HistoryRangeSelect({
  label,
  value,
  onChange,
  items,
}: {
  /**
   * Accessible name, e.g. "Calendar range" — the options ("Last 12 months",
   * …) make the purpose plain, so it is not rendered.
   */
  label: string;
  value: HistoryRange;
  onChange: (value: HistoryRange) => void;
  items: Array<{ value: HistoryRange; label: string }>;
}) {
  return (
    // A fixed-width slot for the trigger, which keeps hugging its own value:
    // the options differ by ~60px ("2019" against the widest, "Last 12
    // months", which needs 128px at this size), and a trigger claiming a
    // different slice of the row on every change hopped between rows once the
    // row wraps on a narrow viewport.
    <div className="w-36">
      <Select
        value={value}
        onValueChange={(next) => {
          // null is the "cleared" value; a range select always has one.
          if (next !== null) {
            onChange(next);
          }
        }}
        items={items}
      >
        <SelectTrigger size="xs" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value} className="text-xs">
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
