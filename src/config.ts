/**
 * Public configuration surface for repo-dive.
 *
 * Drop a `repo-dive.config.ts` (or `.mjs`/`.js`) at the root of the
 * repository you analyze and export a `defineConfig(...)` call as the default
 * export. Everything keeps working with zero config; this only refines it.
 *
 * ```ts
 * import { defineConfig } from "repo-dive/config";
 *
 * export default defineConfig({
 *   contributors: {
 *     aliases: [
 *       // Shorthand: emails only, the first is canonical.
 *       ["alice@work.example", "alice@personal.example"],
 *       // Rich form: a display name, a profile link and a kind.
 *       {
 *         displayName: "Bob",
 *         emails: ["bob@work.example", "bob@personal.example"],
 *         url: "https://github.com/bob",
 *       },
 *     ],
 *     maxInCharts: 10,
 *   },
 *   charts: {
 *     weekStartsOn: "monday",
 *   },
 *   catalog: {
 *     dir: ".repo-dive",
 *   },
 * });
 * ```
 */

/**
 * What sort of contributor an identity is. `kind` is optional in the config; a
 * missing value is derived from the commit author's name/email (automation bots
 * and known AI coding agents are recognized) and otherwise defaults to `human`.
 */
export type ContributorKind = "human" | "bot" | "ai";

/**
 * One alias group in its rich form: the email identities of a single
 * contributor plus optional presentation. `emails` entries are matched against
 * each commit author's email — either its raw value or its prettified
 * GitHub-noreply handle (so `"alice"` matches
 * `1234+alice@users.noreply.github.com`). The **first entry is canonical**.
 */
export type ContributorAliasGroup = {
  readonly emails: readonly string[];
  /** Overrides the display name shown in charts and the contributors table. */
  readonly displayName?: string;
  /** Profile URL (e.g. a GitHub page) the contributor's name links to. */
  readonly url?: string;
  /** Overrides the auto-derived {@link ContributorKind}. */
  readonly kind?: ContributorKind;
};

export type ContributorsConfig = {
  /**
   * Alias groups for people who appear under multiple identities (work +
   * personal email, GitHub noreply, name variants). Each group is either a
   * plain array of emails (the first is canonical) or a
   * {@link ContributorAliasGroup} object that additionally sets a
   * `displayName`, `url` and `kind`. They are merged when building the cube and
   * dashboard data.
   */
  readonly aliases?: ReadonlyArray<readonly string[] | ContributorAliasGroup>;
  /**
   * How many contributors the per-contributor charts keep before folding the
   * rest into "Other". Defaults to 10.
   */
  readonly maxInCharts?: number;
};

/** First day of the week in calendar-shaped charts. */
export type WeekStart = "monday" | "sunday";

/**
 * Stable identifiers of the dashboard's chart sections, in page order — the
 * keys {@link ChartsConfig.annotations} accepts.
 */
export const chartIds = [
  "lines-of-code",
  "number-of-files",
  "commit-calendar",
  "commits-per-month",
  "churn-per-month",
  "direct-dependencies",
  "dependencies",
  "loose-ends",
  "most-suppressed-eslint-rules",
  "contributors",
] as const;

export type ChartId = (typeof chartIds)[number];

export type ChartsConfig = {
  /**
   * Which day calendar-shaped dashboard charts (e.g. the commit calendar)
   * start the week on. Defaults to `"monday"`.
   */
  readonly weekStartsOn?: WeekStart;
  /**
   * Per-chart notes rendered in a callout between the chart's heading and the
   * chart itself — for explaining oddities the data alone cannot, like a
   * history migration that makes a timeline sparse. Keyed by {@link ChartId};
   * values are Markdown limited to paragraphs, `-` lists, `**bold**`,
   * `_italic_`, `` `code` `` and `[links](https://…)`.
   */
  readonly annotations?: Partial<Record<ChartId, string>>;
};

export type CatalogConfig = {
  /**
   * Where the catalog of raw snapshots, caches and the metrics cube lives.
   * Relative paths resolve against the repository root; absolute paths are
   * taken as they are. Defaults to `".repo-dive"`.
   */
  readonly dir?: string;
  /**
   * Whether to warn when ignore files at the repository root (`.gitignore`,
   * `.prettierignore`, …) do not cover the catalog, which makes the tools
   * reading them walk it. Defaults to `true`; irrelevant — and skipped — when
   * the catalog sits outside the repository.
   */
  readonly checkIgnoreFiles?: boolean;
};

export type RepoDiveConfig = {
  readonly contributors?: ContributorsConfig;
  readonly charts?: ChartsConfig;
  readonly catalog?: CatalogConfig;
};

/**
 * Identity helper that gives `repo-dive.config.ts` full type-checking and
 * editor IntelliSense. It returns its argument unchanged.
 */
export const defineConfig = (config: RepoDiveConfig): RepoDiveConfig => config;
