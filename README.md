# repo-dive

_Dive into a git repo's history: per-commit snapshots, an indexed metrics catalog and an interactive dashboard_ <!-- markdownlint-disable-line MD036 -- a tagline, not a heading -->

[![npm version](https://img.shields.io/npm/v/repo-dive?logo=npm&color=3c7ef6&labelColor=333)](https://www.npmjs.com/package/repo-dive)
[![npm downloads](https://img.shields.io/npm/dm/repo-dive?logo=npm&color=3c7ef6&labelColor=333)](https://www.npmjs.com/package/repo-dive)
[![License](https://img.shields.io/badge/license-BSD--3--Clause-3c7ef6?logo=opensourceinitiative&logoColor=white&labelColor=333)](LICENSE.md)
[![Effect](https://img.shields.io/badge/Effect-v4-3c7ef6?logo=effect&logoColor=white&labelColor=333)](https://effect.website)
[![MCP](https://img.shields.io/badge/MCP-ready-3c7ef6?logo=modelcontextprotocol&logoColor=white&labelColor=333)](#ai-agents-mcp)

## What it does

Point `repo-dive` at any git repository and get an explorable catalog of insights derived from its history:

```sh
cd /path/to/your/repo
npx repo-dive
```

One command runs the whole pipeline — scan, index, dashboard — and opens the results in your browser.

- **Map**: walk the repo's commits (all or sampled) and let pluggable collectors capture raw snapshots per commit — language/LOC breakdowns, author stats, lint diagnostics and more.
- **Reduce**: index those snapshots into a local metrics store shaped like a data cube — numbers at intersections of open-ended categories (author, language, date, lint rule, …).
- **Explore**: query the cube to draw charts, export shareable reports and ask AI questions about how the codebase evolved.

Everything is local-first, incremental and resumable: results live in a catalog folder inside the repo being analyzed and are refined over multiple runs.

See [docs/specs](docs/specs/README.md) for the architecture and [docs/research/prior-art.md](docs/research/prior-art.md) for a survey of existing tools and why none of them fills this niche.

## Examples

Live dashboards for a few popular repositories, produced by running the tool on their full history:

- [curl](https://kachkaev.github.io/repo-dive/examples/curl/) (C, since 1999)
- [ollama](https://kachkaev.github.io/repo-dive/examples/ollama/) (Go, since 2023)
- [prettier](https://kachkaev.github.io/repo-dive/examples/prettier/) (JavaScript, since 2016)
- [react](https://kachkaev.github.io/repo-dive/examples/react/) (JavaScript, since 2013)
- [transformers](https://kachkaev.github.io/repo-dive/examples/transformers/) (Python, since 2018)
- [vite](https://kachkaev.github.io/repo-dive/examples/vite/) (TypeScript, since 2020)

Each one is a single self-contained HTML file exported with `repo-dive report` and redeployed weekly by [a scheduled workflow](.github/workflows/examples.yaml) — see [examples](examples/README.md) for how they are defined.

## Usage

Run from inside the repository you want to analyze (or pass `--repo /path/to/repo`).
Node 22.13 or newer is required.

```sh
npx repo-dive            # the whole pipeline: scan + index + dashboard
npx repo-dive scan       # collect snapshots into .repo-dive/
npx repo-dive index      # roll up into the metrics cube + dashboard data
npx repo-dive dashboard  # serve the interactive dashboard
npx repo-dive status     # show catalog coverage
npx repo-dive collectors # list available collectors
npx repo-dive report     # export one shareable self-contained HTML file
npx repo-dive mcp        # serve the cube to AI agents (Model Context Protocol)
npx repo-dive gc         # clean up the catalog interactively
npx repo-dive ignore     # keep other tools out of the catalog
npx repo-dive query "SELECT metric, sum(value) FROM facts GROUP BY metric"
```

`scan` walks the repository's history and runs collectors against every commit (or a sample, per collector), writing raw snapshots into a `.repo-dive/` catalog inside the analyzed repo.
It is resumable: re-running skips everything already collected, and bumping a collector's version invalidates only that collector's outputs.
Checkout-based collectors use temporary detached worktrees — the analyzed repo's working tree is never touched.
Collectors so far:

- **commit-meta** — identities, dates, parents, subject and trailers (incl. AI co-authors)
- **churn** — lines added/deleted per commit, by file extension
- **file-types** — file count and bytes per extension at each commit's tree
- **directives** — eslint-disable comments by rule (block disables tracked as gray areas) and `@ts-ignore`/`@ts-expect-error`/`@ts-nocheck`
- **dependencies** — resolved package totals from lockfiles, per package manager (pnpm, npm and yarn classic and berry), plus direct/dev/optional dependencies and manifest counts read straight from `package.json` files; version-aware, monorepo-aware and extensible to more managers
- **todo-comments** — TODO/FIXME/HACK/XXX counts
- **languages** — lines and file count per language across a commit's source files (lockfiles, minified bundles and generated data excluded)
- **survival** — `git blame` line survival by extension, author and age cohort (sampled monthly)

The catalog hides itself from git, but other tools that walk the repository (prettier, markdownlint, cspell, docker builds) each read one ignore file at its root.
`scan` warns when the catalog is missing from those; `repo-dive ignore` adds it to every one that needs it, writing the entry in the shape the file is already written in and skipping the files whose tool learns about the catalog elsewhere.

`index` normalizes raw snapshots into `.repo-dive/index/metrics.sqlite` — a facts-by-categories cube, rebuildable at any time — plus `dashboard.json`.
`dashboard` then serves a local React app with interactive charts: languages over time, a GitHub-style commit calendar, monthly commits with AI-assisted share, churn, lint-suppression trends, dependency counts over time, code survival by cohort and author, and more.

## Configuration

Everything works with zero config.
To refine it, drop a `repo-dive.config.ts` at the root of the repository you analyze (`.mjs`/`.js` also work):

```ts
import { defineConfig } from "repo-dive/config";

export default defineConfig({
  contributors: {
    aliases: [
      // Shorthand: emails only, the first is canonical.
      ["alice@work.example", "alice@personal.example"],
      // Rich form: a display name, a profile link and an explicit kind.
      {
        displayName: "Bob",
        emails: ["bob@work.example", "12345+bob@users.noreply.github.com"],
        url: "https://github.com/bob",
      },
    ],
    // How many contributors charts keep before folding the rest into "Other" (default 10).
    maxInCharts: 10,
  },
  charts: {
    // First day of the week in calendar-shaped charts (default "monday").
    weekStartsOn: "monday",
  },
  catalog: {
    // Where snapshots, caches and the cube live (default ".repo-dive").
    dir: ".repo-dive",
  },
});
```

`charts.weekStartsOn` sets the first day of the week in calendar-shaped charts such as the commit calendar (`"monday"` by default, `"sunday"` also supported).
`contributors.aliases` merges the multiple identities one person commits under (work + personal email, GitHub noreply, name variants) so attribution, the contributors table and code-survival-by-contributor count them once.
A group can also carry a `displayName`, a profile `url` and a `kind` — `human`/`bot`/`ai`, otherwise auto-derived, with the dashboard badging bots and AI agents and listing them apart from humans.
`catalog.dir` moves the catalog; point it outside the repository (e.g. `"../repo-dive-catalogs/my-repo"`) to leave the analyzed working tree untouched altogether, ignore files included.
Apart from `catalog`, which every command needs, the config is read by `index`.
See [docs/specs/07-config.md](docs/specs/07-config.md) for details.

## AI agents (MCP)

`repo-dive mcp` serves the metrics cube over the Model Context Protocol on stdio, so an agent can explore a repository's history by asking SQL questions.
Two tools:

- **`schema`** — tables, available metrics with row counts, sample category keys per metric and the commit range; worth calling before writing queries.
- **`query`** — one read-only statement (`SELECT`/`WITH`/`EXPLAIN`) against the cube, returning `{ columns, rows, truncated }` (up to 200 rows).

Run `scan` and `index` first: the server exits immediately if there is no cube at `.repo-dive/index/metrics.sqlite`.
The database is opened read-only, so nothing an agent asks can change the catalog.

For [Claude Code](https://code.claude.com/docs/en/mcp), run this inside the repository you want to ask questions about:

```sh
claude mcp add repo-dive -- npx -y repo-dive mcp
```

Or commit a project-scoped `.mcp.json` at the repository root, so everyone on the team gets the same server:

```json
{
  "mcpServers": {
    "repo-dive": {
      "command": "npx",
      "args": ["-y", "repo-dive", "mcp"]
    }
  }
}
```

Then ask things like "which languages grew fastest last year?" or "how has the share of AI-assisted commits changed?".

The same stdio server works with any MCP client — point yours at `npx repo-dive mcp`, adding `--repo /path/to/repo` if the client does not start it inside the repository being analyzed.

## Development

The project is written in TypeScript with [Effect](https://effect.website) v4 (beta) and its built-in CLI toolkit (`effect/unstable/cli`).

```sh
pnpm install
pnpm test
pnpm lint
pnpm fix
```

To see how heavy the published package would be:

```sh
pnpm build && pnpm report-package-size
```

It prints the tarball and unpacked sizes with a per-file breakdown, comparing them against the previous measurement.
CI runs the same report on every push and adds it to the job summary, comparing against the latest `main`.

## Acknowledgements

Thanks to [@WillJack20](https://github.com/WillJack20) for suggesting the name **repo-dive**.
The project was published as [repo-insighter](https://www.npmjs.com/package/repo-insighter) before 0.4.0.

## License

[BSD 3-Clause](LICENSE.md)
