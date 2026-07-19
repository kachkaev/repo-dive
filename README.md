# repo-insighter

Derive insights from a git repository's history: per-commit snapshots, an indexed metrics catalog and material for visualizations.

> **Status: early development.** The project is at the specification and scaffolding stage. The architecture is being designed in [docs/specs](docs/specs/README.md) and the CLI currently exposes a single placeholder command. Nothing is published to npm yet.

## Vision

Run one command against any git repository and get an explorable catalog of insights derived from its history:

```sh
npx repo-insighter scan
```

- **Map**: walk the repo's commits (all or sampled) and let pluggable collectors capture raw snapshots per commit — language/LOC breakdowns, author stats, lint diagnostics and more.
- **Reduce**: index those snapshots into a local metrics store shaped like a data cube — numbers at intersections of open-ended categories (author, language, date, lint rule, …).
- **Explore**: query the cube to draw charts, build presentations and ask AI questions about how the codebase evolved.

Everything is local-first, incremental and resumable: results live in a catalog folder inside the repo being analyzed and are refined over multiple runs.

See [docs/specs](docs/specs/README.md) for the architecture being designed and [docs/research/prior-art.md](docs/research/prior-art.md) for a survey of existing tools and why none of them fills this niche.

## Current CLI

```sh
pnpm install
pnpm build
node dist/cli.js scan --repo /path/to/repo   # collect snapshots into .repo-insighter/
node dist/cli.js status --repo /path/to/repo # show catalog coverage
```

`scan` walks the repository's history and runs the built-in collectors against every commit, writing raw snapshots into a `.repo-insighter/` catalog inside the analyzed repo. It is resumable: re-running skips everything already collected. Collectors so far:

- **commit-meta** — author/committer identities, dates, parents, subject
- **churn** — lines added/deleted per commit, broken down by file extension
- **file-types** — file count and bytes per extension at each commit's tree

The `index` step (normalizing snapshots into the SQLite metrics cube) is next; see the specs.

## Development

The project is written in TypeScript with [Effect](https://effect.website) v4 (beta) and its built-in CLI toolkit (`effect/unstable/cli`).

```sh
pnpm install
pnpm test
pnpm lint
pnpm fix
```

## License

[BSD 3-Clause](LICENSE.md)
