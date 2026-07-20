/**
 * Public configuration surface for repo-insighter.
 *
 * Drop a `repo-insighter.config.ts` (or `.mjs`/`.js`) at the root of the
 * repository you analyze and export a `defineConfig(...)` call as the default
 * export. Everything keeps working with zero config; this only refines it.
 *
 * ```ts
 * import { defineConfig } from "repo-insighter/config";
 *
 * export default defineConfig({
 *   authors: {
 *     aliases: [
 *       // Shorthand: emails only, the first is canonical.
 *       ["alice@work.example", "alice@personal.example"],
 *       // Rich form: a display name and a profile link.
 *       {
 *         emails: ["bob@work.example", "bob@personal.example"],
 *         displayName: "Bob",
 *         url: "https://github.com/bob",
 *       },
 *     ],
 *     maxInCharts: 10,
 *   },
 * });
 * ```
 */

/**
 * One alias group in its rich form: the email identities of a single person
 * plus optional presentation. `emails` entries are matched against each commit
 * author's email — either its raw value or its prettified GitHub-noreply handle
 * (so `"alice"` matches `1234+alice@users.noreply.github.com`). The **first
 * entry is canonical**.
 */
export type AuthorAliasGroup = {
  readonly emails: readonly string[];
  /** Overrides the display name shown in charts and the authors table. */
  readonly displayName?: string;
  /** Profile URL (e.g. a GitHub page) the author's name links to. */
  readonly url?: string;
};

export type AuthorsConfig = {
  /**
   * Alias groups for people who appear under multiple identities (work +
   * personal email, GitHub noreply, name variants). Each group is either a
   * plain array of emails (the first is canonical) or an {@link AuthorAliasGroup}
   * object that additionally sets a `displayName` and `url`. They are merged
   * when building the cube and dashboard data.
   */
  readonly aliases?: ReadonlyArray<readonly string[] | AuthorAliasGroup>;
  /**
   * How many authors the per-author charts keep before folding the rest into
   * "Other". Defaults to 10.
   */
  readonly maxInCharts?: number;
};

export type RepoInsighterConfig = {
  readonly authors?: AuthorsConfig;
};

/**
 * Identity helper that gives `repo-insighter.config.ts` full type-checking and
 * editor IntelliSense. It returns its argument unchanged.
 */
export const defineConfig = (
  config: RepoInsighterConfig,
): RepoInsighterConfig => config;
