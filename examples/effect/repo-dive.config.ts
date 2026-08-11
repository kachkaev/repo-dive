// A plain default-exported object rather than `defineConfig` from
// "repo-dive/config": the examples workflow copies this file into a bare clone
// of the analyzed repository, where repo-dive is not an installed dependency.

/**
 * The effect monorepo was assembled on 2023-12-27 from a fresh "workspace
 * skeleton" commit that merged in eight repositories, and the project's core
 * code spent 2021–2023 in repositories whose histories were discarded before
 * that assembly — so several charts need a word about what the pre-2024
 * timeline can and cannot contain.
 */
const monorepoAssembly =
  "The monorepo was [assembled in December 2023](https://github.com/Effect-TS/effect) from eight repositories; values before that cover only the history those repositories carried with them.";

export default {
  charts: {
    annotations: {
      "lines-of-code": `${monorepoAssembly} The sparse middle years are genuine: during 2021–2023 the project's core code lived in \`@effect/io\` and \`@effect/data\`, whose histories were discarded before the assembly — that code returned only with the Effect 2.0 rewrite landing in late 2023.`,
      "commit-calendar":
        "Commits from every repository absorbed by the December 2023 monorepo assembly are counted wherever they sit in the graph — which is why the calendar stays busy through years the tree timelines below can barely see.",
      "direct-dependencies": `${monorepoAssembly} The core packages' repositories were not carried over, so the pre-2024 counts cover a sliver of the project.`,
      dependencies: `${monorepoAssembly} Lockfiles of the repositories that were not carried over — including the core packages' — are invisible here.`,
      "loose-ends": `${monorepoAssembly} Near-zero readings during 2021–2023 are genuine for the carried-over history; the wider project's loose ends lived in repositories that were not.`,
    },
  },
};
