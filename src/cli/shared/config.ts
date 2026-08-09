import { access } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { Effect } from "effect";

import type { ContributorKind, WeekStart } from "../../config.ts";

/** "12345+alice@users.noreply.github.com" → "alice"; other emails unchanged. */
export const prettifyAuthorEmail = (email: string): string => {
  const match = /^(?:\d+\+)?([^@]+)@users\.noreply\.github\.com$/.exec(email);
  return match?.[1] ?? email;
};

/** Config file names, in resolution order. First match wins. */
const configFileNames = [
  "repo-dive.config.ts",
  "repo-dive.config.mts",
  "repo-dive.config.mjs",
  "repo-dive.config.js",
];

export const defaultMaxInCharts = 10;

export const defaultWeekStartsOn: WeekStart = "monday";

/** Catalog folder, relative to the analyzed repository's root, unless configured otherwise. */
export const defaultCatalogDirName = ".repo-dive";

/**
 * Default port for the dashboard server. 2141 spells "DIVE" in Scrabble tile
 * values (D=2, I=1, V=4, E=1) — a nod to the project name. It sits in the
 * registered range and below the OS ephemeral range (Linux 32768+, macOS
 * 49152+), so it won't randomly clash with outbound-connection source ports,
 * and IANA has no service assigned to it.
 */
export const defaultDashboardPort = 2141;

/** Automation bots — commits that don't reflect authored work. */
const botPattern = /\brenovate\b|\bdependabot\b|github-actions|\[bot\]/i;
/**
 * A trailing "bot" word in the display name — `Release bot`, `deploy-bot`.
 * Requires a space or hyphen before it so ordinary names that merely end in
 * those letters, like `Kate Talbot`, stay human.
 */
const botNameSuffixPattern = /[\s-]bot$/i;
/** Known AI coding agents (mirrors the co-author heuristic in indexing.ts). */
const aiPattern =
  /claude|copilot|cursor|chatgpt|openai|gemini|aider|devin|coderabbit|codegen|sweep|windsurf/i;

/** `"Name <email>"` → `"Name"`; identities without an email part are used as-is. */
const identityName = (identity: string): string =>
  identity.replace(/\s*<[^<>]*>\s*$/, "").trim();

/** Classifies a `"Name <email>"` identity when the config leaves `kind` unset. */
export const deriveContributorKind = (identity: string): ContributorKind =>
  botPattern.test(identity) || botNameSuffixPattern.test(identityName(identity))
    ? "bot"
    : aiPattern.test(identity)
      ? "ai"
      : "human";

/**
 * Tidies an auto-derived name for display. The kind badge (🤖 / ✨) already
 * marks bots and AI agents, so the `[bot]` suffix GitHub bakes into author names
 * is redundant double-labeling: `renovate[bot]` reads better as `Renovate`.
 * Strips a trailing `[bot]` and capitalizes the leading letter; leaves names
 * without the suffix (ordinary people, configured display names) untouched.
 */
export const normalizeContributorName = (name: string): string => {
  const stripped = name.replace(/\s*\[bot\]$/i, "");
  if (stripped === name || stripped === "") {
    return name;
  }
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
};

/** A contributor's canonical, display-ready identity after alias resolution. */
type ResolvedContributor = {
  /** Prettified canonical email — shown in the contributors table's email column. */
  readonly canonicalEmail: string;
  /** The label used in charts and as the name: `displayName` if set. */
  readonly label: string;
  /** Explicit display-name override from the config, if any. */
  readonly displayName: string | undefined;
  /** Profile URL from the config, if any. */
  readonly url: string | undefined;
  /** Explicit or auto-derived contributor kind. */
  readonly kind: ContributorKind;
};

export type ResolvedConfig = {
  /**
   * Resolves a commit author's email (and optional name) to its canonical
   * contributor identity: alias groups fold to their first entry, GitHub
   * noreply addresses are prettified, `displayName`/`url` overrides are applied
   * and `kind` is taken from the config or derived from the identity.
   */
  readonly resolveContributor: (
    email: string,
    name?: string,
  ) => ResolvedContributor;
  /** How many contributors per-contributor charts keep before folding into "Other". */
  readonly maxInCharts: number;
  /** Which day calendar-shaped dashboard charts start the week on. */
  readonly weekStartsOn: WeekStart;
  /** Absolute path of the catalog folder for this repository. */
  readonly catalogPath: string;
  /**
   * The catalog's path relative to the repository root, in POSIX form and
   * without a trailing slash — or `undefined` when it sits outside the
   * repository, where no tool walking the repo can stumble into it.
   */
  readonly catalogRelativePath: string | undefined;
  /** Whether to warn about root ignore files that do not cover the catalog. */
  readonly checkIgnoreFiles: boolean;
};

/** Internal per-group metadata keyed by every email (and handle) in the group. */
type AliasEntry = {
  readonly canonicalEmail: string;
  readonly displayName: string | undefined;
  readonly url: string | undefined;
  readonly kind: ContributorKind | undefined;
};

const bareResolveContributor = (
  aliases: ReadonlyMap<string, AliasEntry>,
  email: string,
  name: string | undefined,
): ResolvedContributor => {
  const entry =
    aliases.get(email.toLowerCase()) ??
    aliases.get(prettifyAuthorEmail(email).toLowerCase());
  const canonicalEmail = prettifyAuthorEmail(entry?.canonicalEmail ?? email);
  return {
    canonicalEmail,
    label: entry?.displayName ?? normalizeContributorName(canonicalEmail),
    displayName: entry?.displayName,
    url: entry?.url,
    kind: entry?.kind ?? deriveContributorKind(`${name ?? ""} <${email}>`),
  };
};

const configError = (message: string): Error =>
  new Error(`Invalid repo-dive config: ${message}`);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Reads a property by (variable) key — avoids literal index-signature access. */
const prop = (record: Record<string, unknown>, key: string): unknown =>
  record[key];

const parseOptionalString = (
  value: unknown,
  label: string,
): string | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.trim() === "") {
    throw configError(`${label} must be a non-empty string.`);
  }
  return value.trim();
};

const contributorKinds: readonly ContributorKind[] = ["human", "bot", "ai"];

const parseKind = (
  value: unknown,
  label: string,
): ContributorKind | undefined => {
  if (value === undefined) {
    return undefined;
  }
  for (const kind of contributorKinds) {
    if (value === kind) {
      return kind;
    }
  }
  throw configError(`${label} must be one of "human", "bot" or "ai".`);
};

const parseEmails = (rawEmails: unknown, at: string): string[] => {
  if (!Array.isArray(rawEmails) || rawEmails.length === 0) {
    throw configError(
      `${at} must be a non-empty array of emails, or an object with a non-empty \`emails\` array.`,
    );
  }
  return rawEmails.map((entry, entryIndex) => {
    if (typeof entry !== "string" || entry.trim() === "") {
      throw configError(
        `${at}\`.emails[${entryIndex}]\` must be a non-empty string.`,
      );
    }
    return entry.trim();
  });
};

/** Normalizes one alias group (array shorthand or rich object) to its parts. */
const parseAliasGroup = (
  group: unknown,
  groupIndex: number,
): {
  emails: string[];
  displayName: string | undefined;
  url: string | undefined;
  kind: ContributorKind | undefined;
} => {
  const at = `\`contributors.aliases[${groupIndex}]\``;
  if (Array.isArray(group)) {
    return {
      emails: parseEmails(group, at),
      displayName: undefined,
      url: undefined,
      kind: undefined,
    };
  }
  if (isPlainObject(group)) {
    return {
      emails: parseEmails(prop(group, "emails"), at),
      displayName: parseOptionalString(
        prop(group, "displayName"),
        `${at}\`.displayName\``,
      ),
      url: parseOptionalString(prop(group, "url"), `${at}\`.url\``),
      kind: parseKind(prop(group, "kind"), `${at}\`.kind\``),
    };
  }
  throw configError(
    `${at} must be a non-empty array of emails, or an object with a non-empty \`emails\` array.`,
  );
};

/** Validates the raw `contributors.aliases` and builds the email → group-metadata map. */
const buildAliasMap = (aliases: unknown): Map<string, AliasEntry> => {
  const map = new Map<string, AliasEntry>();
  if (aliases === undefined) {
    return map;
  }
  if (!Array.isArray(aliases)) {
    throw configError("`contributors.aliases` must be an array.");
  }
  for (const [groupIndex, group] of aliases.entries()) {
    const { emails, displayName, url, kind } = parseAliasGroup(
      group,
      groupIndex,
    );
    const [canonicalEmail] = emails;
    if (canonicalEmail === undefined) {
      continue;
    }
    const entry: AliasEntry = { canonicalEmail, displayName, url, kind };
    for (const email of emails) {
      const key = email.toLowerCase();
      const existing = map.get(key);
      if (
        existing !== undefined &&
        existing.canonicalEmail !== canonicalEmail
      ) {
        throw configError(
          `email "${email}" appears in more than one alias group.`,
        );
      }
      map.set(key, entry);
    }
  }
  return map;
};

const parseMaxInCharts = (value: unknown): number => {
  if (value === undefined) {
    return defaultMaxInCharts;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 100
  ) {
    throw configError(
      "`contributors.maxInCharts` must be an integer between 1 and 100.",
    );
  }
  return value;
};

const weekStarts: readonly WeekStart[] = ["monday", "sunday"];

const parseWeekStartsOn = (value: unknown): WeekStart => {
  if (value === undefined) {
    return defaultWeekStartsOn;
  }
  for (const weekStart of weekStarts) {
    if (value === weekStart) {
      return weekStart;
    }
  }
  throw configError('`charts.weekStartsOn` must be "monday" or "sunday".');
};

/**
 * Resolves `catalog.dir` against the repository root. `gc` deletes whole
 * subtrees under the result, so the two placements that would take the
 * repository down with them are rejected outright rather than trusted.
 */
const parseCatalogPath = (value: unknown, repoRoot: string): string => {
  if (
    value !== undefined &&
    (typeof value !== "string" || value.trim() === "")
  ) {
    throw configError("`catalog.dir` must be a non-empty string.");
  }
  const catalogPath = path.resolve(
    repoRoot,
    value === undefined ? defaultCatalogDirName : value.trim(),
  );
  if (catalogPath === path.resolve(repoRoot)) {
    throw configError("`catalog.dir` must not be the repository root itself.");
  }
  const relative = path.relative(repoRoot, catalogPath);
  if (relative === ".git" || relative.startsWith(`.git${path.sep}`)) {
    throw configError("`catalog.dir` must not be inside `.git`.");
  }
  return catalogPath;
};

/**
 * The catalog's location as seen from inside the repository, or `undefined`
 * when it is stored elsewhere — the case where nothing walking the repository
 * can trip over it.
 */
const relativeCatalogPath = (
  repoRoot: string,
  catalogPath: string,
): string | undefined => {
  const relative = path.relative(repoRoot, catalogPath);
  return relative === "" ||
    relative.startsWith("..") ||
    path.isAbsolute(relative)
    ? undefined
    : relative.split(path.sep).join("/");
};

const parseCheckIgnoreFiles = (value: unknown): boolean => {
  if (value === undefined) {
    return true;
  }
  if (typeof value !== "boolean") {
    throw configError("`catalog.checkIgnoreFiles` must be a boolean.");
  }
  return value;
};

/**
 * Validates a raw imported config value and turns it into a
 * {@link ResolvedConfig}. `repoRoot` is needed because the catalog's location
 * is configurable and only meaningful relative to the analyzed repository.
 */
export const resolveConfig = (
  raw: unknown,
  repoRoot: string,
): ResolvedConfig => {
  if (!isPlainObject(raw)) {
    throw configError("the default export must be an object.");
  }
  const contributors = prop(raw, "contributors");
  if (contributors !== undefined && !isPlainObject(contributors)) {
    throw configError("`contributors` must be an object.");
  }
  const aliasMap = buildAliasMap(
    contributors === undefined ? undefined : prop(contributors, "aliases"),
  );
  const maxInCharts = parseMaxInCharts(
    contributors === undefined ? undefined : prop(contributors, "maxInCharts"),
  );
  const charts = prop(raw, "charts");
  if (charts !== undefined && !isPlainObject(charts)) {
    throw configError("`charts` must be an object.");
  }
  const weekStartsOn = parseWeekStartsOn(
    charts === undefined ? undefined : prop(charts, "weekStartsOn"),
  );
  const catalog = prop(raw, "catalog");
  if (catalog !== undefined && !isPlainObject(catalog)) {
    throw configError("`catalog` must be an object.");
  }
  const catalogPath = parseCatalogPath(
    catalog === undefined ? undefined : prop(catalog, "dir"),
    repoRoot,
  );

  return {
    // Wrapped (not a bare reference) to defer the cross-module lookup to call
    // time — `indexing.ts` and this module import each other.
    resolveContributor: (email, name) =>
      bareResolveContributor(aliasMap, email, name),
    maxInCharts,
    weekStartsOn,
    catalogPath,
    catalogRelativePath: relativeCatalogPath(repoRoot, catalogPath),
    checkIgnoreFiles: parseCheckIgnoreFiles(
      catalog === undefined ? undefined : prop(catalog, "checkIgnoreFiles"),
    ),
  };
};

const firstExistingConfigPath = async (
  repoRoot: string,
): Promise<string | undefined> => {
  for (const fileName of configFileNames) {
    const candidate = path.join(repoRoot, fileName);
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  return undefined;
};

/**
 * Loads `repo-dive.config.*` from the analyzed repo root, if present.
 *
 * `.ts` config relies on Node's built-in type stripping (unflagged on Node
 * ≥ 22.18); on older runtimes, use a `.mjs`/`.js` config instead. Returns the
 * zero-config defaults when no file is found.
 */
export const loadConfig = (
  repoRoot: string,
): Effect.Effect<ResolvedConfig, Error> =>
  Effect.gen(function* () {
    const configPath = yield* Effect.tryPromise({
      try: () => firstExistingConfigPath(repoRoot),
      catch: (error) =>
        error instanceof Error ? error : new Error(String(error)),
    });
    if (configPath === undefined) {
      return resolveConfig({}, repoRoot);
    }

    const raw = yield* Effect.tryPromise({
      try: async (): Promise<unknown> => {
        const module: unknown = await import(pathToFileURL(configPath).href);
        return isPlainObject(module) ? prop(module, "default") : undefined;
      },
      catch: (error) =>
        new Error(
          `Failed to load ${path.basename(configPath)}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        ),
    });

    if (raw === undefined) {
      return yield* Effect.fail(
        configError(
          `${path.basename(configPath)} must \`export default defineConfig(...)\`.`,
        ),
      );
    }

    return yield* Effect.try({
      try: () => resolveConfig(raw, repoRoot),
      catch: (error) =>
        error instanceof Error ? error : new Error(String(error)),
    });
  });
