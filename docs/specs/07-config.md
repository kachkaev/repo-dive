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
  filePurposes: {
    // What files are for, ahead of the built-in rules.
    rules: [{ paths: ["utils/**"], purpose: "tooling" }],
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

repo-dive attributes every metric to each commit's git **author** (not the committer) — _who_ is always the author, independently of which of the commit's two dates a given chart is drawn against (see [collectors](04-collectors.md#author-date-vs-committer-date)).
"Contributor" is the people-level concept this config describes: one person (or bot, or AI agent) who may commit under several author identities.

## Loading

`catalog` is read by every command — it decides where the catalog is.
`filePurposes` is read by `scan` as well as `index`, because it decides [which files are source](#which-files-are-source).
The rest is read by the **`index`** step alone (the map phase stays raw — the catalog is never rewritten).
`.ts` config relies on Node's built-in type stripping, unflagged since Node 22.18 / 23.6; on older runtimes use a `.mjs`/`.js` config.
The config's `repo-dive/config` import resolves like any other from the analyzed repository, and falls back to the installation running the CLI when the repository cannot resolve it itself — so a bare clone without `node_modules` loads a `defineConfig` config just as well.
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

### `.mailmap`

Commit authors are read through the repository's [`.mailmap`](https://git-scm.com/docs/gitmailmap), the way `git shortlog` and `git blame` read them, so identities a project already maps need no alias group.
So are `Co-authored-by:` trailers and the authors of surviving lines and files: `repo-dive index` maps what the catalog holds through the current `.mailmap`, so a new entry needs no re-scan.
Line survival collected earlier still holds the addresses `git blame` mapped back then, though, so an entry removed or changed since takes `repo-dive scan --collectors survival --force` to undo there.
Survival records an author's email alone, so an entry that also names the old identity reaches line survival only through `git blame` at scan time, and file survival not at all.
Alias groups match the mapped emails.

### Identities that fold on their own

A few links between a person's identities are certain enough to need no alias group.
Two human identities are one contributor when:

- they are GitHub noreply addresses of **one account** — `12345+alice@users.noreply.github.com` and `12345+alice-old@users.noreply.github.com`, from after and before a rename;
- one committed under a **single word that is the other's noreply handle** — `alice <alice@example.com>` and `Alice Example <alice@users.noreply.github.com>`, since handles are unique on GitHub.

A shared name is not such a link, however full: one repository can hold two people called `Jason Miller`.
Each folded contributor takes the address they committed under most as their canonical email.

Folding is transitive and reaches alias groups too: an email no group lists joins the group it is linked to, so a group need not list the addresses that fold on their own.
Two alias groups are never merged with each other, and an email linked to more than one is left out of both.
Bots and AI agents are never folded this way.

### How a contributor is named

Charts name people rather than their addresses: a group's `displayName` if it has one, otherwise the name git recorded on their commits — the newest spelling, with a bot's `[bot]` suffix dropped, since the badge already says as much.
Where no name was ever recorded — `git blame` can credit surviving lines to an author whose own commits were never sampled — the label falls back to the username the canonical address is built around (`alice@example.com` → `alice`), and to the address itself only when there is no username to take (a bare `Co-authored-by: Some Name`).

Two people who spell their name identically therefore share one band in the survival chart, the way bots and AI agents share theirs.
Give them an alias group with a `displayName` to tell them apart on purpose; the contributors table lists everyone separately with their own canonical email either way.

### Contributor kinds

Every contributor has a **kind**: `human` (the default), `bot` (automation like renovate, dependabot, github-actions) or `ai` (AI coding agents like Copilot, Claude, Cursor, …).
When a group omits `kind` — or for contributors with no alias group at all — the kind is derived from the name and email; anything unrecognized is a human.
A name whose last word is `bot`, separated by a space or a hyphen, also counts as a bot — `Release bot` and `deploy-bot` do, `Kate Talbot` does not.
Agent products are recognized by the name they sign with, as whole words only, so `Sam Devine` is not Devin and `Kai Haider` is not aider; Claude and Devin are ordinary given names, so those two additionally need the agent/model word agents append (`Claude Opus 4.5`, `Devin AI`).
On the email side only agent-specific mailboxes count (`noreply@anthropic.com`, `codex@openai.com`) — a bare vendor domain marks an employee, not an agent, so `alice@openai.com` stays human.
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

### `charts.annotations`

Per-chart notes for oddities the data alone cannot explain — a history migration that makes a timeline sparse, a vendored dump that spikes a series, a rename that splits a contributor.
An object keyed by the chart section's stable id, with a Markdown string per chart:

```ts
charts: {
  annotations: {
    "lines-of-code":
      "Before the December 2023 monorepo assembly this timeline follows the original `effect` repository — see [the migration](https://github.com/Effect-TS/effect).",
  },
},
```

Known ids, in page order: `lines-of-code`, `number-of-files`, `commit-calendar`, `commits-per-month`, `churn-per-month`, `direct-dependencies`, `dependencies`, `loose-ends`, `most-suppressed-eslint-rules`, `contributors` — an unknown id fails `index` with the list, so a typo cannot silently drop a note.
The dashboard renders each note in a callout between the chart's heading and the chart itself.
Markdown is deliberately limited to what a note needs — paragraphs, `-` lists, `**bold**`, `_italic_`, `` `code` `` and `[links](https://…)` — and is rendered as React elements, never injected as HTML.
Like the rest of `charts`, annotations flow into `dashboard.json` (`config.charts.annotations`, omitted when empty) at `index` time.

## `filePurposes`

Every file git tracks has one **purpose**, told from its path: what the file is for.
"Lines of code" and "Number of files" split by it, the way they split by language and by contributor.

| Purpose (`purpose` value)                         | Source? | Holds                                                                                  |
| ------------------------------------------------- | ------- | -------------------------------------------------------------------------------------- |
| Production (`"production"`)                       | yes     | Code no other rule claims                                                              |
| Tests (`"tests"`)                                 | yes     | Test code, wherever a project keeps it                                                 |
| Docs (`"docs"`)                                   | yes     | Documentation folders, websites, changelogs and any other Markdown                     |
| Examples (`"examples"`)                           | yes     | Examples, demos, playgrounds and stories                                               |
| Tooling (`"tooling"`)                             | yes     | CI, scripts, build setup and tool config                                               |
| AI instructions (`"ai-instructions"`)             | yes     | Skills, rules and agent guides: `.claude/`, `.agents/`, `AGENTS.md`, `SKILL.md`, …     |
| Test data (`"test-data"`)                         | no      | What test folders hold besides code: snapshots, fixtures, test cases                   |
| Assets (`"assets"`)                               | no      | Images, fonts, media and archives                                                      |
| Generated & vendored (`"generated-and-vendored"`) | no      | Lockfiles, `vendor/`, `node_modules/`, `dist/`, `build/`, `*.min.*`, `Generated.ts`, … |
| Other (`"other"`)                                 | no      | Everything else: `package.json`, `LICENSE`, stray YAML, logs                           |

### Which files are source

A purpose is wholly source or wholly not, never a mix, and that is the whole definition of a source file: **"Lines of code" counts exactly the files of source purposes.**
"Number of files" counts every file git tracks, so hiding the non-source purposes in its legend leaves the very files whose lines are counted.
The language split, the contributor split and the content-level collectors (`directives`, `todo-comments`) cover the same source files.

A source file over 2 MiB, or a binary one, counts as a file on "Number of files" but holds no lines.

### Built-in rules

Three steps, in this order:

1.  What nobody wrote by hand goes to Generated & vendored, whatever the path says.
1.  A file without a source extension (see [`languages.ts`](../../src/cli/shared/languages.ts)) goes to Test data if its path says tests, to Assets if it is media, and otherwise to Other.
1.  A source file goes by the first of these its path matches: AI instructions, CI (`.github/`, `.circleci/`, …), Tests, Examples, Docs, other Tooling.
    What is left is Production, except for YAML, which goes to Other.

So `.github/workflows/test.yml` is Tooling, `scripts/__tests__/a.js` is Tests, `docs/examples/a.c` is Examples and `tests/__snapshots__/a.snap` is Test data.

### `filePurposes.rules`

Rules run before the built-in ones, from the top, and the first match wins:

```ts
filePurposes: {
  rules: [
    { paths: ["utils/**"], purpose: "tooling" },
    // Only the code of the playgrounds is test code.
    { paths: ["playground/**/*.{js,ts,vue,css,html}"], purpose: "tests" },
    { paths: ["playground/**"], purpose: "test-data" },
    // A purpose of your own: `source` says whether its lines count.
    {
      paths: ["**/*.proto"],
      purpose: { type: "custom", name: "Schemas", source: true },
    },
  ],
},
```

`paths` are [picomatch](https://github.com/micromatch/picomatch) globs against the whole path from the repository root, dotfiles included: `*.md` covers the root only, `**/*.md` every folder.
A glob cannot be negated, since the list means any of them; put a rule for the exception ahead of this one.

A rule sends **every** file it matches to its purpose, whatever the extension.
That is how a file type repo-dive does not know becomes source, and it is also why `playground/**` alone would count the lines of every JSON file in there; the example above takes two rules for that reason.

Built-in purposes keep their source flag and their color in every repository, so charts compare across repositories.
A custom purpose must name its `source` and cannot take a built-in purpose's name, and all rules using one `name` must agree on `source`, or a band could mix the two; anything else fails `index` and `scan` with a friendly message.
Bands stack with source purposes first (Production at the bottom, custom ones after the built-in ones), then the others, with Other on top.

### `filePurposes.skipBuiltInRules`

`true` leaves classification to `rules` alone.
Anything they do not match goes to Other and so counts no lines, code included; end the list with `{ paths: ["**"], purpose: "production" }` to change that.
Defaults to `false`.

### Editing the rules

What a rule edit takes depends on whether it changes which files are source:

- Moving files between purposes on the same side of that line — Production to Tooling, say — only takes `repo-dive index`.
  Raw survival outputs hold file paths, so `index` applies the rules afresh.
  `scan` confirms each commit by listing its tree once, then remembers.
- Moving files across it takes `repo-dive scan` as well, because lines that were never counted or blamed have to be.
  `scan` re-collects only the commits whose source files actually changed, for `languages`, `directives`, `todo-comments` and `survival`, including `survival` samples an earlier scan took that sampling has since moved past.
  Until it has, totals are out of step: the blame-based variants leave out lines of files that are no longer source and hold none yet for files that have become source, while the per-commit language counts and the Lines tile still say what the old rules picked.

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

- **`.prettierignore`**, when the repository has a root `.gitignore` — prettier's CLI has read both since v3, and `ignore` lists the catalog in `.gitignore` anyway.
  A `package.json` pinning prettier 2 or older opts back in, as does a script running prettier with `--ignore-path`, which replaces the files prettier would have read for itself.
- **`.npmignore`**, when `package.json` has a `files` array — that array is an allow list, so it alone decides what `npm pack` includes.
- **`.eslintignore`**, when eslint reads a flat config (an `eslint.config.*` at the root, or a declared eslint 9+) — flat config replaced the file with an `ignores` key and stopped reading it.

Everything these rules look at is best-effort: an unreadable or absent `package.json` simply means no rule fires, and the file gets its entry.

#### How the entry is written

An ignore file is something a person wrote and will read again, so `ignore` follows the hand the file is written in rather than always appending a stanza of its own.
The path is spelled the way the file spells paths — anchored (`/.repo-dive/`) where most of its paths are anchored, with a trailing slash where it marks directories that way — and a file written with `\r\n` gets a `\r\n` line (counted, so one stray `\r\n` in a `\n` file is not mistaken for a habit).
Where the line goes depends on the file:

- one flat list in alphabetical order — slotted in at its letter, keeping the order;
- a file that keeps its patterns in **commented** groups — one more group, headed by a `# repo-dive catalog` comment in the file's own comment style, and set off with a blank line only where the file sets its own groups off that way;
- anything else — appended as a bare line at the end.

A group is anything a comment heads: blank-line-separated sections, and equally a run of headings with no blank lines between them.
The comment style is read off a comment that says something, so a banner framed in rows of `#` still gets a `## repo-dive catalog` heading where its headings start with `##`.
Comments sitting above every pattern head the whole file rather than a group, and leave it a flat list.
