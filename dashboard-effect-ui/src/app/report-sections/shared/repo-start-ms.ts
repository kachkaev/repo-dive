import type { DashboardData } from "../../../data.ts";

/**
 * Repo inception, used to anchor charts whose series start mid-history (e.g.
 * dependencies, tracked only once a lockfile exists) to the full timeline:
 * the `domainStartMs` of their `TimeSeriesChart`.
 */
export const repoStartMsOf = (data: DashboardData): number | undefined =>
  data.repo.firstCommitDate
    ? new Date(data.repo.firstCommitDate).getTime()
    : undefined;
