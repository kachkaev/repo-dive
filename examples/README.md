# Examples

Each subdirectory here defines one public example dashboard, deployed to `https://kachkaev.github.io/repo-dive/examples/<name>/`.
The [examples workflow](../.github/workflows/examples.yaml) rebuilds them weekly (and on any change to this directory): it clones every listed repository, runs `repo-dive` against it and publishes the resulting self-contained report to GitHub Pages.

## Anatomy of an example

- `example.json` — required; declares where the analyzed repository lives:

  ```json
  {
    "repo": "https://github.com/prettier/prettier"
  }
  ```

- `repo-dive.config.ts` — optional; copied to the root of the clone before scanning, exactly as if the analyzed repository shipped it.
  Useful for merging contributor identities, marking bots or tweaking charts — see [docs/specs/07-config.md](../docs/specs/07-config.md).
  It default-exports a plain object rather than `defineConfig(...)`, for the reason [effect's config](effect/repo-dive.config.ts) gives.

The directory name becomes the URL slug, so keep it short and lowercase.

## Contributor aliases

Most large repositories have people who committed under several emails — work and personal addresses, GitHub `noreply` handles, a renamed account.
The examples fold those identities for everyone who would otherwise reach the dashboard's charts: roughly the 25 most active people by commits.
Each group lists only emails confirmed to belong to one person — GitHub links them to the same account, the repository's own `.mailmap` says so, or the name and timeline leave no doubt.

Every group sets a `displayName`, so a stray spelling on a later commit or `Co-authored-by:` trailer cannot rename the person.
Where the emails disagree on a spelling, the name is the one on the person's GitHub profile if it is a full name, and otherwise the fullest name they commit under.

## Adding an example

1.  Create `examples/<name>/example.json` with the repository URL.
1.  Optionally add `examples/<name>/repo-dive.config.ts`.
1.  Open a pull request; once merged, the workflow picks the example up on its next run (or trigger it manually from the Actions tab).

## Trying a repository first

To size up a candidate without cloning anything locally, run the [report workflow](../.github/workflows/report.yaml) from the Actions tab with the repository's clone URL.
It uploads the self-contained report as a non-zipped artifact, so once the run finishes, `index.html` opens right in the browser from the run page.
