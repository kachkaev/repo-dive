# Configuration file

_Implemented._

repo-dive runs with **zero configuration**.
To refine its behavior, drop a `repo-dive.config.ts` at the root of the **analyzed** repository (knip-style — the config lives with the repo it describes, not with repo-dive).
`.mjs` and `.js` are also accepted; the first match in that order wins.

```ts
import { defineConfig } from "repo-dive/config";

export default defineConfig({
  contributors: {
    aliases: [
      // Shorthand: emails only, the first entry is canonical.
      ["alice@work.example", "alice@personal.example"],
      // Rich form: a display name, a profile link and an explicit kind.
      {
        displayName: "Bob",
        emails: ["bob@work.example", "12345+bob@users.noreply.github.com"],
        kind: "human",
        url: "https://github.com/bob",
      },
    ],
    // How many contributors charts keep before folding the rest into "Other".
    maxInCharts: 10,
  },
  charts: {
    // First day of the week in calendar-shaped charts.
    weekStartsOn: "monday",
  },
  catalog: {
    // Where snapshots, caches and the cube are kept.
    dir: ".repo-dive",
    // Warn when the repo's ignore files don't cover the catalog.
    checkIgnoreFiles: true,
  },
});
```

`defineConfig` is an identity helper exported from the `repo-dive/config` entry point; it exists purely for type-checking and editor IntelliSense.
A plain default-exported object works too.

repo-dive derives its metrics from each commit's git **author** (not the committer).
"Contributor" is the people-level concept this config describes: one person (or bot, or AI agent) who may commit under several author identities.

## Loading

`catalog` is read by every command — it decides where the catalog is.
The rest is read by the **`index`** step (the map phase stays raw — the catalog is never rewritten).
`.ts` config relies on Node's built-in type stripping, unflagged since Node 22.18 / 23.6; on older runtimes use a `.mjs`/`.js` config.
Malformed config fails `index` with a friendly message rather than silently degrading.

## `contributors`

### `contributors.aliases`

People show up under multiple identities — work and personal email, GitHub `noreply` addresses, name variants.
A group is either a plain array of emails or an object `{ emails, displayName?, url?, kind? }`; the **first email is canonical** and the rest fold into it before the cube's dashboard data is built.
Merging applies to commit-count and churn attribution, the contributors table, and code-survival-by-contributor.
An email may appear in at most one group.

Emails are matched against each commit author's email in either its raw form or its prettified GitHub-noreply handle — so listing `alice` matches `12345+alice@users.noreply.github.com`, i.e. you can use the handle shown in the report.

- `displayName` overrides the name shown in the per-contributor charts and the contributors table (the email column still shows the prettified canonical email).
- `url` makes that name a link (e.g. to a GitHub profile).
- `kind` is one of `"human"`, `"bot"` or `"ai"` (see below).

(Unifying AI assistant name variants through aliases is out of scope for now.)

### Contributor kinds

Every contributor has a **kind**: `human` (the default), `bot` (automation like renovate, dependabot, github-actions) or `ai` (AI coding agents like Copilot, Claude, Cursor, …).
When a group omits `kind` — or for contributors with no alias group at all — the kind is derived from the commit author's name and email; anything unrecognized is a human.
The dashboard badges bots (🤖) and AI agents (✨) with an icon and lists them separately from human contributors.

### `contributors.maxInCharts`

How many contributors the per-contributor charts keep before folding the remainder into an "Other" band.
Defaults to `10`, must be an integer between 1 and 100.
The stacked survival-by-contributor area keeps up to `maxInCharts` series; the contributors bar list keeps twice that.
The categorical palette provides 20 distinct colors and cycles beyond that.

## `charts`

### `charts.weekStartsOn`

Which day calendar-shaped dashboard charts (currently the commit calendar) start the week on.
One of `"monday"` (the default) or `"sunday"`.
The value is not specific to any single chart — future calendar-shaped charts are expected to honor it too.
It flows into `dashboard.json` under `config.charts.weekStartsOn`, so the dashboard renders without re-reading the config file.

## `catalog`

### `catalog.dir`

Where the catalog of raw snapshots, content caches and the metrics cube lives.
Defaults to `.repo-dive`; relative paths resolve against the repository root, absolute ones are taken as they are.
Two placements are refused outright, because `gc` deletes whole subtrees under this path: the repository root itself, and anything inside `.git`.

Pointing it outside the repository (`"../repo-dive-catalogs/my-repo"`, `"/var/cache/repo-dive/my-repo"`) keeps the analyzed working tree completely untouched, and makes the ignore-file question below moot.
Moving an existing catalog is a `mv` — nothing inside it records its own location.

### `catalog.checkIgnoreFiles`

The catalog hides itself from git by writing a nested `.gitignore` holding `*`.
That trick is git's alone: prettier, markdownlint, cspell, eslint, `docker build` and `npm pack` each read a single ignore file at the **root** of the repository and know nothing about nested ones.
Unless the catalog is listed there too, its thousands of small files quietly become their input.

So `scan`, `index` and `status` check every root ignore file — anything matching `.*ignore` — and warn on stderr about the ones that do not cover the catalog, pointing at [`repo-dive ignore-catalog`](02-cli.md), which appends the entry.
Set `checkIgnoreFiles` to `false` to silence the warning.
The check is skipped entirely when the catalog sits outside the repository, where nothing walking the repo can reach it.

Coverage is decided by reading the patterns, not by running each tool: the forms people write (`.repo-dive`, `/.repo-dive/`, `**/.repo-dive`, an ancestor directory, a catch-all `*`, a later `!` re-include) are recognized, and anything ambiguous counts as covered.
A warning that nags about an entry already sitting in the file is worse than one that never appears.
Only the repository root is searched; ignore files deeper in the tree govern their own subtree.
