import { Schema } from "effect";

import type { HistoryRange } from "./history-range.ts";

/**
 * A {@link HistoryRange} as a Schema, so the charts and sections that narrow
 * their view to a range can take it in their props or keep it in their Model,
 * and the range select can carry it in its props and events.
 */
export const HistoryRangeSchema: Schema.Codec<HistoryRange> = Schema.Union([
  Schema.Literals(["last-12-months", "this-year", "all-years"]),
  Schema.TemplateLiteral(["last-", Schema.Number, "-years"]),
  Schema.TemplateLiteral(["year-", Schema.Number]),
]);
