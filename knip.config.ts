import type { KnipConfig } from "knip";

export default {
  entry: ["src/config.ts"],
  // Example configs are copied into the analyzed clone by the examples
  // workflow rather than imported from anywhere in this repo.
  ignore: ["examples/*/repo-dive.config.ts"],
  ignoreIssues: {
    // TEMPORARY, until the survival timelines' port (#398) lands.
    "dashboard-effect-ui/src/app/shared/stacked-series.ts": ["exports"],
    "dashboard-effect-ui/src/app/shared/survival-colors.ts": ["files"],
  },
} satisfies KnipConfig;
