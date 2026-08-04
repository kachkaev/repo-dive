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

repo-dive attributes every metric to each commit's git **author** (not the committer) — _who_ is always the author, even though _when_ is always the committer date (see [collectors](04-collectors.md#one-clock-the-committer-date)).
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
Merging applies to commit-count and churn attribution, the contributors table, cross-kind co-authorship and code-survival-by-contributor.
An email may appear in at most one group.

Emails are matched against each commit author's email — and against the email in every `Co-authored-by:` trailer — in either its raw form or its prettified GitHub-noreply handle, so listing `alice` matches `12345+alice@users.noreply.github.com`, i.e. you can use the handle shown in the report.

- `displayName` overrides the name shown in the per-contributor charts and the contributors table (the email column still shows the prettified canonical email).
- `url` makes that name a link (e.g. to a GitHub profile).
- `kind` is one of `"human"`, `"bot"` or `"ai"` (see below).

### Contributor kinds

Every contributor has a **kind**: `human` (the default), `bot` (automation like renovate, dependabot, github-actions) or `ai` (AI coding agents like Copilot, Claude, Cursor, …).
When a group omits `kind` — or for contributors with no alias group at all — the kind is derived from the name and email; anything unrecognized is a human.
Co-authors are classified the same way as authors, so an agent that only ever appears in trailers still gets its own row.

Identity resolution differs by kind.
Humans are identified by their canonical email, so every spelling of one person folds together.
Bots and AI agents are identified by name **and** email, because they share vendor `noreply` addresses — `Claude Fable 5` and `Claude Opus 4.8` both commit as `<noreply@anthropic.com>` and are worth telling apart.
To merge such variants into one row, give them an alias group with a `displayName`.

The dashboard badges bots (🤖) and AI agents (✨) with an icon and colors every kind with its reserved color.

### `contributors.maxInCharts`

How many contributors the per-contributor charts keep before folding the remainder into an "Other" band.
Defaults to `10`, must be an integer between 1 and 100.
The stacked survival-by-contributor area keeps up to `maxInCharts` series; the contributors bar list keeps twice that, per kind — so a repo with hundreds of humans can't crowd out its handful of agents and bots.
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

So `scan`, `index` and `status` check every root ignore file — anything matching `.*ignore` — and warn on stderr about the ones that still need the catalog, pointing at [`repo-dive ignore`](02-cli.md), which writes the entry.
Set `checkIgnoreFiles` to `false` to silence the warning.
The check is skipped entirely when the catalog sits outside the repository, where nothing walking the repo can reach it.

Coverage is decided by reading the patterns, not by running each tool: the forms people write (`.repo-dive`, `/.repo-dive/`, `**/.repo-dive`, a bare name matching a path component at any depth, an ancestor directory, a catch-all `*`, a later `!` re-include) are recognized, and anything ambiguous — a wildcard pattern like `.repo-*` whose literal beginning points at the catalog — counts as covered.
A warning that nags about an entry already sitting in the file is worse than one that never appears.
Only the repository root is searched; ignore files deeper in the tree govern their own subtree.

#### Files that need no entry

Some tools are told about the catalog without a line of their own, and a line that changes nothing costs the next reader of the file a moment working out why it is there.
Those files are reported as not needed and left untouched, both by the warning and by `repo-dive ignore`:

- **`.prettierignore`**, when the repository has a root `.gitignore` — prettier's CLI has read both since v3, and `ignore` lists the catalog in `.gitignore` anyway. A `package.json` pinning prettier 2 or older opts back in, as does a script running prettier with `--ignore-path`, which replaces the files prettier would have read for itself.
- **`.npmignore`**, when `package.json` has a `files` array — that array is an allow list, so it alone decides what `npm pack` includes.
- **`.eslintignore`**, when eslint reads a flat config (an `eslint.config.*` at the root, or a declared eslint 9+) — flat config replaced the file with an `ignores` key and stopped reading it.

Everything these rules look at is best-effort: an unreadable or absent `package.json` simply means no rule fires, and the file gets its entry.

#### How the entry is written

An ignore file is something a person wrote and will read again, so `ignore` follows the hand the file is written in rather than always appending a stanza of its own.
The path is spelled the way the file spells paths — anchored (`/.repo-dive/`) where most of its paths are anchored, with a trailing slash where it marks directories that way — and `\r\n` files stay on `\r\n`.
Where the line goes depends on the file:

- one flat list in alphabetical order — slotted in at its letter, keeping the order;
- a file kept in blank-line-separated **commented** sections — one more section, headed by a `# repo-dive catalog` comment in the file's own comment style;
- anything else — appended as a bare line at the end.
