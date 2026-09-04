# GitHub Action

The repository doubles as a [composite GitHub Action](../action.yml), so any project can produce and refresh its `repo-dive` report right in CI instead of on somebody's laptop.
The action wraps the published CLI with the operational know-how from this repository's own [examples workflow](../.github/workflows/examples.yaml): catalog caching, resumable scans that bank progress before the job runs out of time, and a report artifact viewable straight from the run page.

## Quick start

Commit a workflow like this to the repository you want to analyze, e.g. as `.github/workflows/repo-dive.yaml`:

```yaml
name: repo-dive

on:
  schedule:
    - cron: "27 5 * * 1" # weekly, Monday morning
  workflow_dispatch:

permissions:
  contents: read # enough for the checkout; private repositories need it too

# One analysis at a time, so parallel runs don't redo each other's work
concurrency:
  group: repo-dive
  cancel-in-progress: false

jobs:
  report:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0 # the whole history is the whole point

      - uses: kachkaev/repo-dive@main
```

Every run then:

1.  restores the `.repo-dive` catalog from the Actions cache,
1.  scans the commits that are new since the previous run,
1.  saves the catalog back to the cache,
1.  indexes the snapshots into the metrics cube and exports the report,
1.  uploads the report as a non-zipped artifact, so it opens right in the browser from the run page.

The `workflow_dispatch` trigger lets you run the first analysis (and any ad-hoc refresh) from the Actions tab without waiting for the schedule.

## Inputs

| Input                  | Default                 | Description                                                                                                |
| ---------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| `version`              | `latest`                | The `repo-dive` npm package version to run — an exact version, a range or a dist-tag.                      |
| `repo`                 | `.`                     | Path to the repository to analyze, relative to the workspace.                                              |
| `report-path`          | `repo-dive-report.html` | Where to write the report; the file name doubles as the artifact name.                                     |
| `scan-timeout-minutes` | `300`                   | Interrupt `scan` gracefully after this many minutes, so that the catalog cache is still saved (see below). |
| `cache`                | `true`                  | Cache the catalog across runs with `actions/cache`.                                                        |
| `cache-key-prefix`     | `repo-dive-catalog`     | Prefix of the catalog cache key; override it when one workflow analyzes several repositories.              |
| `upload-artifact`      | `true`                  | Upload the report as a non-zipped workflow artifact.                                                       |

One output, `report-path`, echoes where the report was written, for follow-up steps such as a GitHub Pages deploy.

## Long histories

Hosted runners scan heavy histories at roughly one commit per second, so the first run on a repository with hundreds of thousands of commits will not finish in one go.
That is fine: `scan` is resumable, and the action is built around that.

The scan is interrupted gracefully after `scan-timeout-minutes` (300 by default) and the catalog — including everything collected so far — is saved to the cache before the run fails.
The next run restores it and continues where the previous one stopped, so a few (possibly manual) runs catch a large repository up, after which the scheduled increments take minutes.

Keep `scan-timeout-minutes` below the job's own `timeout-minutes` (360 on hosted runners by default): a job-level timeout kills the whole job, including the cache save, and no progress is banked.

## Publishing to GitHub Pages

To serve the report at a stable URL instead of digging it out of workflow runs, deploy it to GitHub Pages:

```yaml
name: repo-dive

on:
  schedule:
    - cron: "27 5 * * 1" # weekly, Monday morning
  workflow_dispatch:

permissions: {}

concurrency:
  group: repo-dive
  cancel-in-progress: false

jobs:
  report:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0

      - uses: kachkaev/repo-dive@main
        id: repo-dive
        with:
          upload-artifact: false

      - name: Assemble the site
        run: |
          mkdir -p _site
          mv "${{ steps.repo-dive.outputs.report-path }}" _site/index.html

      - uses: actions/configure-pages@v6
        with:
          enablement: true

      - uses: actions/upload-pages-artifact@v5
        with:
          path: _site/

      - id: deployment
        uses: actions/deploy-pages@v5
```

Mind that GitHub Pages sites are public even for private repositories on the Free plan — the default artifact upload keeps the report as private as the repository itself.

## Analyzing a different repository

The action analyzes whatever clone the `repo` input points at, so a workflow can also report on repositories other than its own — that is exactly how this repository builds its [public examples](../examples/README.md):

```yaml
jobs:
  report:
    runs-on: ubuntu-latest
    steps:
      - name: Clone the analyzed repository
        # Full history of the default branch — the whole point of the tool
        run: git clone --single-branch https://github.com/prettier/prettier analyzed

      - uses: kachkaev/repo-dive@main
        with:
          repo: analyzed
          cache-key-prefix: repo-dive-catalog-prettier
```

No `actions/checkout` is needed in this shape, and a distinct `cache-key-prefix` per analyzed repository keeps the catalogs from overwriting each other.

## Configuration

A [`repo-dive.config.ts`](specs/07-config.md) at the root of the analyzed repository is picked up automatically, exactly as in local runs.
Its `import { defineConfig } from "repo-dive/config"` works even though a bare clone has no `node_modules`: the import falls back to the repo-dive installation the action runs.
One caveat: the built-in cache assumes the default catalog location, so if the config moves the catalog via `catalog.dir`, set `cache: false` and cache the relocated directory with `actions/cache` yourself.

## Versioning

Two knobs pin what actually runs:

- The action ref (`kachkaev/repo-dive@…`) pins the workflow glue — `@main` tracks the latest, release tags such as `@v0.10.0` and commit SHAs pin it.
- The `version` input pins the CLI doing the analysis — the default `latest` picks up new collectors and charts as they ship, an exact version makes runs reproducible.

The catalog is versioned independently of both: bumping the CLI never discards collected snapshots, and a collector version bump invalidates only that collector's outputs.
