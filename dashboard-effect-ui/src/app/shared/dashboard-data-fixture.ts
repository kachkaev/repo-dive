import type { DashboardData } from "../../data.ts";

type CommitRow = DashboardData["commits"][number];

/** A commit of `kind` authored at noon on `date` (`YYYY-MM-DD`). */
export const commitOf = (
  date: string,
  kind: CommitRow["kind"] = "human",
  ai = false,
): CommitRow => ({
  sha: `${kind}@${date}`,
  date: `${date}T12:00:00+00:00`,
  contributor: kind === "human" ? 0 : kind === "ai" ? 1 : 2,
  kind,
  ai,
  added: 10,
  deleted: 2,
});

/**
 * A small dashboard.json for tests: a few commits by each contributor kind
 * over two calendar years, and nothing else unless `overrides` add it. Only
 * the commit calendar, commits per month, churn per month and contributors
 * sections have something to show for it.
 */
export const dashboardDataOf = (
  overrides: Partial<DashboardData> = {},
): DashboardData => ({
  generatedAt: "2026-03-01T00:00:00Z",
  repo: {
    name: "fixture",
    commitCount: 4,
    contributorCount: 3,
    firstCommitDate: "2025-11-02T12:00:00+00:00",
    lastCommitDate: "2026-02-03T12:00:00+00:00",
  },
  commits: [
    commitOf("2025-11-02"),
    commitOf("2025-12-24", "human", true),
    commitOf("2026-01-10", "ai"),
    commitOf("2026-02-03", "bot"),
  ],
  languages: [],
  fileTypes: [],
  directives: [],
  dependencies: [],
  topRules: [],
  survival: [],
  contributors: [
    { email: "alice@example.com", name: "Alice", kind: "human" },
    { email: "noreply@anthropic.com", name: "Claude", kind: "ai" },
    { email: "renovate[bot]", name: "Renovate", kind: "bot" },
  ],
  ...overrides,
});
