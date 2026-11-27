import { Flag } from "effect/cli";

/**
 * The builds of the dashboard there are to serve or export. Both read the
 * same dashboard.json: `react` is the dashboard itself, `effect` an
 * experimental port to Effect UI that lives in dashboard-effect-ui/ and is
 * built next to it.
 */
const dashboardUiOptions = ["react", "effect"] as const;

export type DashboardUi = (typeof dashboardUiOptions)[number];

/**
 * The `--ui` flag, shared by every command that serves or exports the
 * dashboard. The help lists the choices itself, so the description doesn't.
 */
export const dashboardUiFlag = Flag.Literals("ui", dashboardUiOptions).pipe(
  Flag.withDefault("react"),
  Flag.withDescription(
    "Which dashboard to use; effect is an experimental port to Effect UI (default: react)",
  ),
);
