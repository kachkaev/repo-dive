# Examples

Each subdirectory here defines one public example dashboard, deployed to `https://kachkaev.github.io/repo-dive/examples/<name>/`.
The [examples workflow](../.github/workflows/examples.yaml) rebuilds them weekly (and on any change to this directory): it clones every listed repository, runs `repo-dive` against it and publishes the resulting self-contained report to GitHub Pages.

## Anatomy of an example

- `example.json` — required; declares where the analyzed repository lives:

  ```json
  {
    "repo": "https://github.com/expressjs/express"
  }
  ```

- `repo-dive.config.ts` — optional; copied to the root of the clone before scanning, exactly as if the analyzed repository shipped it.
  Useful for merging contributor identities, marking bots or tweaking charts — see [docs/specs/07-config.md](../docs/specs/07-config.md).

The directory name becomes the URL slug, so keep it short and lowercase.

## Adding an example

1.  Create `examples/<name>/example.json` with the repository URL.
1.  Optionally add `examples/<name>/repo-dive.config.ts`.
1.  Open a pull request; once merged, the workflow picks the example up on its next run (or trigger it manually from the Actions tab).
