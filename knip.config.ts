import type { KnipConfig } from "knip";

export default {
  entry: ["src/config.ts"],
  // Example configs are copied into the analyzed clone by the examples
  // workflow rather than imported from anywhere in this repo.
  ignore: ["examples/*/repo-dive.config.ts"],
  ignoreIssues: {
    // Verbatim copies of the React dashboard's pure helpers: the Effect UI
    // port keeps them whole so the remaining chart ports can use the rest of
    // their exports (see dashboard-effect-ui/README.md). Drop these entries
    // once every chart is ported.
    "dashboard-effect-ui/src/app/shared/format.ts": ["exports"],
    "dashboard-effect-ui/src/app/shared/stacked-series.ts": ["exports"],
    // Mounts the chart ports share, landed ahead of them so that parallel
    // ports don't each add their own. Drop once a chart uses them.
    "dashboard-effect-ui/src/app/shared/measure-width.ts": ["files"],
    "dashboard-effect-ui/src/app/shared/track-pointer.ts": ["files"],
  },
} satisfies KnipConfig;
