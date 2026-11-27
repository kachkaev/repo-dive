import type { KnipConfig } from "knip";

export default {
  entry: ["src/config.ts"],
  // Example configs are copied into the analyzed clone by the examples
  // workflow rather than imported from anywhere in this repo.
  ignore: ["examples/*/repo-dive.config.ts"],
  // TEMPORARY: what the Effect UI dashboard's chart ports draw with in place
  // of visx (at the versions visx already pins), added ahead of them so the
  // parallel ports don't each touch the lockfile. Drop once a chart imports
  // them.
  ignoreDependencies: [
    "@types/d3-scale",
    "@types/d3-shape",
    "d3-scale",
    "d3-shape",
  ],
  ignoreIssues: {
    // TEMPORARY, for the Effect UI dashboard (see its README): shared pieces
    // landed ahead of the chart ports that use them, so that parallel ports
    // don't each add their own. Verbatim copies of the React dashboard's pure
    // helpers stay whole for the same reason. Drop each entry once a chart
    // uses what it covers; the last port removes the rest.
    "dashboard-effect-ui/src/app/shared/@ui-primitive/tooltip.ts": ["exports"],
    "dashboard-effect-ui/src/app/shared/bar-path.ts": ["files"],
    "dashboard-effect-ui/src/app/shared/contributor-kinds.ts": ["exports"],
    "dashboard-effect-ui/src/app/shared/crosshair-line.ts": ["files"],
    "dashboard-effect-ui/src/app/shared/format.ts": ["exports"],
    "dashboard-effect-ui/src/app/shared/measure-width.ts": ["files"],
    "dashboard-effect-ui/src/app/shared/primitives.ts": ["exports", "types"],
    "dashboard-effect-ui/src/app/shared/stacked-series.ts": ["exports"],
    "dashboard-effect-ui/src/app/shared/survival-colors.ts": ["files"],
    "dashboard-effect-ui/src/app/shared/time-axis.ts": ["exports", "types"],
    "dashboard-effect-ui/src/app/shared/track-pointer.ts": ["files"],
  },
} satisfies KnipConfig;
