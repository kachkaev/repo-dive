import { Schema } from "effect";
import { describe, expect, test } from "vitest";

import { HistoryRangeSchema } from "./history-range-schema.ts";

describe("HistoryRangeSchema", () => {
  const isHistoryRange = Schema.is(HistoryRangeSchema);

  test.each([
    "last-12-months",
    "this-year",
    "all-years",
    "last-5-years",
    "year-2019",
  ])("accepts %s", (range) => {
    expect(isHistoryRange(range)).toBe(true);
  });

  test.each(["", "last-months", "year-", "years-2019", "all"])(
    "rejects %j",
    (range) => {
      expect(isHistoryRange(range)).toBe(false);
    },
  );
});
