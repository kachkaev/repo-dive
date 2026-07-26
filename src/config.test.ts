import { expect, test } from "vitest";

import { defineConfig } from "./config.ts";

test("defineConfig returns its argument unchanged", () => {
  const config = { contributors: { maxInCharts: 7 } };
  expect(defineConfig(config)).toBe(config);
});
