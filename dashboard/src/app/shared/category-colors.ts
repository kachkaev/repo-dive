/**
 * Category palettes of the survival splits: fixed colors for languages,
 * ranked ones for contributors, and the pools for unknown file types and
 * custom purposes. The built-in purposes live next to the kind colors in
 * survival-colors.tsx.
 */

/**
 * One fixed color per language, the same in every repository, so that a
 * language reads alike from one report to the next and never depends on how
 * it ranks.
 *
 * The hues come from GitHub's linguist colors, which many readers already
 * know, re-stepped per theme so each one stays visible on the chart surface
 * and clear of its usual neighbors. Departures from linguist:
 *
 * - Siblings are a lighter or darker step of their parent, so a family reads
 *   as one: TSX → TypeScript, JSX → JavaScript, C Header → C,
 *   C++ Header → C++, reStructuredText / AsciiDoc → Markdown.
 * - Markdown, present in nearly every repo, is a dark "ink" (pale chalk in
 *   the dark theme) instead of linguist's little-known navy.
 * - C is a warm graphite rather than linguist's gray, which would read as
 *   "Other".
 * - Pairs that share charts are pulled apart: Python is deepened away from
 *   TypeScript, PHP away from Python, CMake moves off YAML's crimson, TSX off
 *   Go, and Dart, Groovy, Perl and Prisma off the human teal
 *   (`--kind-human`).
 *
 * Must cover every language in src/cli/shared/languages.ts, and the common
 * ones must stay apart pairwise (category-colors.test.ts checks both).
 * Values are `light-dark()` pairs, resolved by the page's `color-scheme`.
 */
const languageColorPairs: Record<string, readonly [string, string]> = {
  JavaScript: ["#cbba2a", "#d8c73c"],
  JSX: ["#a39400", "#968800"],
  TypeScript: ["#3178c6", "#478fde"],
  TSX: ["#82bcfc", "#89a7fa"],
  Python: ["#225b90", "#2e669c"],
  Markdown: ["#28394f", "#b1c6e2"],
  reStructuredText: ["#5d7089", "#8ca0bb"],
  AsciiDoc: ["#5d7089", "#8ca0bb"],
  YAML: ["#cb171e", "#cb171e"],
  Go: ["#00add8", "#01bddd"],
  Rust: ["#d7926a", "#e49f76"],
  Java: ["#b37100", "#b37100"],
  C: ["#6c4932", "#7e5a42"],
  "C Header": ["#4b270e", "#c6889e"],
  "C++": ["#ef4c90", "#ef4c90"],
  "C++ Header": ["#ff90b6", "#8f004b"],
  HTML: ["#fe4916", "#f15a35"],
  CSS: ["#69369c", "#7d4bb3"],
  Sass: ["#b759ac", "#f078b1"],
  LESS: ["#877fc2", "#9c90ea"],
  Shell: ["#69be27", "#75cb39"],
  PowerShell: ["#867bd3", "#9b90ea"],
  Ruby: ["#9f5055", "#b66569"],
  Swift: ["#ff7874", "#ff7874"],
  PHP: ["#043785", "#7c719b"],
  "C#": ["#754ced", "#8a6cff"],
  Kotlin: ["#a97bff", "#a97bff"],
  Vue: ["#1c9f6b", "#31ab77"],
  Svelte: ["#fa347f", "#ff247e"],
  Astro: ["#c56d00", "#ab5f00"],
  Dart: ["#27b492", "#1baf6a"],
  Elixir: ["#9a5acd", "#ad6ce1"],
  Erlang: ["#c1249d", "#b83998"],
  Scala: ["#b6317e", "#b6317e"],
  Haskell: ["#957dd5", "#ad8ed1"],
  R: ["#2d41bf", "#4a68e8"],
  Lua: ["#6f58f0", "#9767ff"],
  "Objective-C": ["#2f47d2", "#3d5be7"],
  GraphQL: ["#a70070", "#d719b1"],
  Perl: ["#5b8fd8", "#6aa0e8"],
  CMake: ["#a2005c", "#bf006e"],
  SQL: ["#7f6c00", "#bba223"],
  Clojure: ["#9b1638", "#f484b4"],
  Julia: ["#a94e99", "#b04b8b"],
  Zig: ["#bc662f", "#b97500"],
  OCaml: ["#866300", "#c99500"],
  Groovy: ["#99a2ce", "#63a19b"],
  Prisma: ["#465d8b", "#6e76a0"],
  "Protocol Buffers": ["#006246", "#007654"],
};

export const languageColors: Readonly<Record<string, string>> =
  Object.fromEntries(
    Object.entries(languageColorPairs).map(([language, [light, dark]]) => [
      language,
      `light-dark(${light}, ${dark})`,
    ]),
  );

/**
 * What the files chart's unknown types (".json", "No extension", …) cycle
 * through: muted greys, a different register than any language.
 */
export const unknownTypeColors = [
  "var(--unknown-type-1)",
  "var(--unknown-type-2)",
  "var(--unknown-type-3)",
];

/**
 * The contributor palette (see styles.css), handed out in rank order. Its own
 * set rather than the generic series slots: slot 1 is the human teal, and the
 * leading slots stay clear of the blues the language split leads with, so
 * switching the split repaints the chart. Past the ten dedicated slots come
 * the only series slots that stay clear of all of them and of the kind colors
 * (a test checks); a `contributors.maxInCharts` beyond that cycles.
 */
export const contributorColors = [
  ...Array.from(
    { length: 10 },
    (_, index) => `var(--contributor-${index + 1})`,
  ),
  "var(--series-2)",
  "var(--series-4)",
];

/**
 * What custom file purposes draw from: the series slots that stay clear of
 * every built-in purpose color and of the kind colors (a test checks).
 */
export const customPurposeColors = [4, 6, 7, 18, 20].map(
  (slot) => `var(--series-${slot})`,
);
