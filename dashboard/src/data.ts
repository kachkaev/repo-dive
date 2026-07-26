type CommitRow = {
  sha: string;
  date: string;
  author: string;
  /**
   * The author's contributor kind. Missing in dashboard.json written before
   * per-commit kinds landed — treat as "human".
   */
  kind?: ContributorKind;
  /** At least one AI co-author trailer on the commit. */
  ai: boolean;
  added: number;
  deleted: number;
};

type LanguagesRow = {
  sha: string;
  date: string;
  byLanguage: Record<string, number>;
};

type FileTypesRow = {
  sha: string;
  date: string;
  totalFiles: number;
  totalBytes: number;
};

type DirectivesRow = {
  sha: string;
  date: string;
  eslintNextLine: number;
  eslintLine: number;
  eslintBlocks: number;
  blockCoveredLines: number;
  tsIgnore: number;
  tsExpectError: number;
  tsNocheck: number;
  todos: number;
};

type DependenciesRow = {
  sha: string;
  date: string;
  /** Total resolved packages across all lockfiles in the tree. */
  resolved: number;
  /**
   * Number of package.json manifests in the tree (workspaces + root).
   * Optional: absent in dashboard.json written before manifests were counted.
   */
  manifestCount?: number;
  /** Direct dependencies declared across all package.json manifests. */
  directProd: number;
  directDev: number;
  directOptional: number;
  /** Resolved packages split by package manager (pnpm, …). */
  byPackageManager: Record<string, number>;
};

type SurvivalRow = {
  sha: string;
  date: string;
  byCohort: Record<string, number>;
  byContributor: Record<string, number>;
  /**
   * Living lines per contributor, split by the year each line was authored.
   * Optional: absent in dashboard.json written before per-year survival landed.
   */
  byContributorYear?: Record<string, Record<string, number>>;
  byLanguage: Record<string, number>;
  /**
   * Living lines per language, split by the year each line was authored.
   * Optional: absent in dashboard.json written before per-year survival by
   * language landed.
   */
  byLanguageYear?: Record<string, Record<string, number>>;
};

export type ContributorKind = "human" | "bot" | "ai";

/**
 * Cross-kind collaboration counts, keyed by the *other* party's kind. Only
 * kinds with a non-zero count are present; a contributor's own kind never is
 * (same-kind co-authorship isn't tracked).
 */
type CrossKindCounts = Partial<Record<ContributorKind, number>>;

type ContributorRow = {
  email: string;
  name: string;
  /** Optional profile URL from the config's contributor aliases. */
  url?: string;
  /** Missing in dashboard.json written before contributor kinds landed. */
  kind?: ContributorKind;
  commits: number;
  added: number;
  deleted: number;
  /**
   * Own commits carrying at least one co-author of that other kind — the
   * hatched tail of the "authored" bar. Counted once per commit per kind, so
   * the per-kind counts can sum above the number of assisted commits when one
   * commit was helped by two kinds at once.
   *
   * Absent in dashboard.json written before cross-kind collaboration landed.
   */
  assistedBy?: CrossKindCounts;
  /**
   * Commits by an author of that other kind that this contributor co-authored
   * — the "assisted" bar. Each commit has one author, so these sum exactly to
   * the bar's total.
   *
   * Absent in dashboard.json written before cross-kind collaboration landed.
   */
  assisted?: CrossKindCounts;
};

export type DashboardData = {
  generatedAt: string;
  /** Optional: absent in dashboard.json written before configurable caps landed. */
  config?: {
    contributors: {
      /** How many contributors per-contributor charts keep before folding into "Other". */
      maxInCharts: number;
    };
    /** Optional: absent in dashboard.json written before chart config landed. */
    charts?: {
      /** Which day calendar-shaped charts start the week on. */
      weekStartsOn: "monday" | "sunday";
    };
  };
  repo: {
    name: string;
    commitCount: number;
    contributorCount: number;
    firstCommitDate?: string;
    lastCommitDate?: string;
  };
  commits: CommitRow[];
  languages: LanguagesRow[];
  fileTypes: FileTypesRow[];
  directives: DirectivesRow[];
  dependencies: DependenciesRow[];
  topRules: Array<{ rule: string; count: number }>;
  survival: SurvivalRow[];
  contributors: ContributorRow[];
};

/** Inlined by `repo-dive report` so the export works from a single file. */
const inlinedData = (globalThis as { __REPO_DIVE_DATA__?: DashboardData })
  .__REPO_DIVE_DATA__;

export async function loadDashboardData(): Promise<DashboardData> {
  if (inlinedData) {
    return inlinedData;
  }
  const response = await fetch("./dashboard.json");
  if (!response.ok) {
    throw new Error(
      `Could not load dashboard.json (${response.status}). Run \`repo-dive index\` first.`,
    );
  }
  return (await response.json()) as DashboardData;
}
