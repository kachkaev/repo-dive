import type { KnipConfig } from "knip";

export default {
  entry: ["src/config.ts"],
  // Example configs are copied into the analyzed clone by the examples
  // workflow rather than imported from anywhere in this repo.
  ignore: ["examples/*/repo-dive.config.ts"],
} satisfies KnipConfig;
