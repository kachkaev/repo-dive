import type { ContributorKind, DashboardData } from "../../../data.ts";
import { cachedBy } from "../../shared/cached-by.ts";

/**
 * Kinds that ever committed, once per data — what the calendar's, the commits
 * chart's and the churn chart's kind filters offer. The contributor list can
 * differ: it lists co-authors too, and dashboard.json written before
 * per-commit contributor refs caps it per kind.
 */
export const commitKindsOf = cachedBy(
  (data: DashboardData): ReadonlySet<ContributorKind> =>
    new Set(data.commits.map((commit) => commit.kind ?? "human")),
);
