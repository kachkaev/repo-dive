---
name: pr-authoring
description: Conventions for authoring PRs in this repo — changesets (including attribution overrides for backfills), bump levels, summary style, PR titles. Use when creating a PR, writing or reviewing a changeset, or fixing changelog attribution.
---

# PR authoring

## Every user-facing change needs a changeset

If a PR changes what users see or run — the CLI, collectors, indexing, the dashboard, config, the report — it must include a changeset in the same PR; internal-only changes (tests, CI, lint setup, docs) don't get one.

Create `.changeset/<kebab-slug>.md` (pick a descriptive slug, not the generator's random name):

```md
---
"repo-dive": patch
---

Imperative first sentence matching the PR title.
Then at most one short paragraph of what changed and, if it matters, what users must do.
```

A changeset is a CHANGELOG entry, not a design document — budget the whole body at roughly five sentences.

- Say what changed, in the reader's terms; reasoning belongs in the PR body and the code comments.
- One example beats a list of every site touched — "now stamps `2025-10-02 · Thursday`" says more than naming four charts.
- Mention existing catalogs only when the answer isn't "nothing to do": a re-scan is needed, an option changed name, output moved.
- Bullets are for genuinely separate user-facing changes in one PR, not for decomposing a single one.

Changesets are Markdown, so they follow [editing-markdown](../editing-markdown/SKILL.md) — one sentence per line, no hard-wrapping.

Bump levels while the package is 0.x: `minor` for user-facing features (a new command, chart, collector, metric, config option) and breaking changes (renames, catalog/config format changes users must act on); `patch` for fixes and internal changes.

## Backfilling a missed changeset

A changeset landing in a _different_ PR than the change it describes would be attributed to the wrong PR/commit.
`@changesets/changelog-github` supports overrides — these lines at the top of the body are parsed out and never rendered:

```md
---
"repo-dive": patch
---

pr: #37
commit: cfc01d3239cd95ea917f4f1409d668c595c7619b

Actual summary starts here…
```

Use the merged PR's number and the full SHA of its squash-merge commit on `main`.
(`author: @login` is also supported but unused here — `disableThanks` is on.)

## PR conventions

- Open PRs as **drafts**.
- Title: one imperative sentence in the style of `main`'s history ("Add year shading to the lines-by-language chart"), no trailing period.
- Body: short — what and why, plus anything the diff can't say (verification done, known trade-offs). No boilerplate sections.
- Versioning and CHANGELOG generation are automated (`changesets:version` + release CI); never edit `CHANGELOG.md` or `package.json` version by hand.
