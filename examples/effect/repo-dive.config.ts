// A plain default-exported object rather than `defineConfig` from
// "repo-dive/config": the examples workflow copies this file into a bare clone
// of the analyzed repository, where repo-dive is not an installed dependency.

/**
 * The effect monorepo was assembled on 2023-12-27 from a fresh "workspace
 * skeleton" commit that merged in eight repositories. Tree timelines follow
 * the absorbed history reaching back furthest — the original `effect`
 * repository — so several charts need a word about what that chain does and
 * does not contain.
 */
const monorepoAssembly =
  "The monorepo was assembled in December 2023 from eight repositories; before that, this timeline follows the original [`effect` repository](https://github.com/Effect-TS/effect), whose history reaches back to August 2020.";

export default {
  charts: {
    annotations: {
      "lines-of-code": `${monorepoAssembly} The sparse middle years are genuine: during 2021–2023 the core code lived in \`@effect/io\` and \`@effect/data\`, whose histories were not carried over, and it returned only with the Effect 2.0 rewrite landing in late 2023.`,
      "commit-calendar":
        "Commits from every repository absorbed by the December 2023 monorepo assembly are counted wherever they sit in the graph — which is why the calendar stays busy through years the tree timelines below can barely see.",
      "direct-dependencies": `${monorepoAssembly} That repository spent 2021–2023 as a near-empty meta-package, so the pre-2024 counts cover only a sliver of the project.`,
      dependencies:
        "Resolved-package history begins with the monorepo's `pnpm-lock.yaml` in December 2023 — the followed pre-monorepo history carried no lockfile.",
      "loose-ends":
        "Near-zero readings before late 2023 reflect the followed pre-monorepo `effect` repository, which held almost no source code during 2021–2023; the wider project's loose ends lived in repositories whose histories were not carried over.",
    },
  },
};
