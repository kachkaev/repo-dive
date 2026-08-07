---
"repo-dive": minor
---

Add a GitHub Action for generating reports in CI

The repository now doubles as a composite GitHub Action, so any project can produce and refresh its report right inside GitHub Actions instead of on somebody's laptop:

```yaml
- uses: actions/checkout@v7
  with:
    fetch-depth: 0
- uses: kachkaev/repo-dive@main
```

The action installs the published CLI, restores the catalog from the Actions cache, runs scan → index → report and uploads the self-contained HTML report as an artifact viewable straight from the run page.
Scans that hit the configurable time limit still bank their progress to the cache, so re-runs resume where the previous run stopped — long histories catch up over a few runs, after which scheduled increments take minutes.
See [docs/github-action.md](https://github.com/kachkaev/repo-dive/blob/main/docs/github-action.md) for all inputs, publishing the report to GitHub Pages and analyzing repositories other than the workflow's own.
