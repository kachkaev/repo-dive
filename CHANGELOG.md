# repo-dive

## 0.10.0

### Minor Changes

- [#119](https://github.com/kachkaev/repo-dive/pull/119) [`72566b4`](https://github.com/kachkaev/repo-dive/commit/72566b41e0e35bab7583a04721f63db2265ae78c) - Unify the lines-of-code timelines into one "Lines of code" chart with toggles.
  The former "Lines by language", "Code survival by cohort" and "Code survival by contributor" charts become a single chart — placed before all others — switched by three segmented controls: all lines | by language | by contributor, no shading | shade by year written, and absolute counts | percentage; the legend and "View data" table follow the selection, and options whose data is missing from an older dashboard.json are disabled with an explanatory tooltip.
  Every chart section now shares one layout: title, constant-wording subtitle, controls, then a frame holding only the visual with its legend centered below like a figure caption, with data tables after the frame — so the #/% toggles and the kind filters of the calendar and contributors moved out of their frames into one flat segmented style, and the calendar's range select matches it (no visible label, no value nudge when opened).
  The unified chart keeps a single x-axis across every variant, so no toggle shifts the marks, the controls or the axis.
  Hovering a stacked chart no longer re-renders the whole SVG (~30 ms → ~8 ms per frame): the crosshair and tooltip are separate components and d3-array is dropped, keeping the marks memoized by React Compiler.
  Existing catalogs render without a re-scan; per-year shading lights up only where the catalog already carries per-year survival data.
  A catalog scanned with only some collectors (say `repo-dive scan --collectors survival`) picks a split it can actually draw instead of opening on an empty chart.

### Patch Changes

- [#121](https://github.com/kachkaev/repo-dive/pull/121) [`6d06aee`](https://github.com/kachkaev/repo-dive/commit/6d06aeea247dca06196bdb71a4a458ab66797ebb) - Anchor the dashboard's AI-commit share to when the catalog was generated instead of to wall-clock now.
  The tile covers the last 90 days, but the window was measured back from the moment the page happened to be opened, so any dashboard.json older than 90 days matched no commits at all and the tile rendered an em dash instead of a percentage.
  The window now runs back from `generatedAt`, which is what every other date in the report is already anchored to, so the same catalog renders the same share however long after the scan it is opened.
  Existing catalogs heal on reload — no re-index needed.

- [#120](https://github.com/kachkaev/repo-dive/pull/120) [`cd99310`](https://github.com/kachkaev/repo-dive/commit/cd993106d1f5671890c3df6013e62c83e7754a2b) - Include the repository's first commit in every sampling policy.
  Period policies (weekly, monthly, quarterly) keep the newest commit per period, so the very first commit was only sampled when it happened to be the newest in its bucket — sampled collectors like survival started their timelines at the first period boundary instead of the repository's birth.
  Every policy now anchors both endpoints: HEAD and the first commit are always included.
  Existing catalogs heal on the next regular `repo-dive scan` (it picks up the newly sampled first commit as a single new collector run — no `--force` needed); run `repo-dive index` afterwards to refresh the dashboard data.

## 0.9.0

### Minor Changes

- [#106](https://github.com/kachkaev/repo-dive/pull/106) [`0b97bf9`](https://github.com/kachkaev/repo-dive/commit/0b97bf91f74ad449168da64f764a7ee8a28b6d73) - Sharpen the commit calendar's edges, labels and readouts.

  Days outside the report's coverage — before the first commit, or after the report was generated — are drawn as outlines instead of being left blank, so "we have no data" reads differently from "no commits".
  A month whose 1st does not land on the first day of the week now has its label shifted one column to the right, rather than hanging over the gap that precedes the month.
  Day-of-week labels are down to two letters ("Mo", "Tu"), which also buys back enough width for the widest possible year to fit: the calendar no longer scrolls horizontally on a wide screen.
  What width a strip does not need is now spent evenly on both sides instead of pooling to its right.

  A day's detail moved out of the caption below the calendar and into a tooltip styled like the other charts' hover cards, so the calendar no longer changes height as the pointer travels across it.
  The tooltip names the weekday alongside the date, and days outside the coverage get one too, saying which edge of the report they fall off.

  The caption itself now gives the range's total and the busiest day a line each, names the busiest day's weekday, and drops the nested parentheses the two used to share.

- [#103](https://github.com/kachkaev/repo-dive/pull/103) [`9fe9206`](https://github.com/kachkaev/repo-dive/commit/9fe920617ed26b4b19f5a443c46865298dc50f13) - Rework the report header around the repository's own identity.

  The heading is now a breadcrumb of the `origin` remote — `kachkaev / repo-dive` under the GitHub or GitLab mark, or the host followed by the path on any other forge — linking to the repository itself; a repo with no (or a purely local) remote keeps its checkout name, unlinked.
  That also fixes the name shown for a clone whose directory says nothing about it: the published examples used to be titled "analyzed".

  The line below reads `Analyzed by repo-dive at <date> · coverage: <first> — <last>`.
  Each date carries a tooltip with its full timestamp, the two coverage dates name the commit each one comes from, and on GitHub and GitLab they link straight to that commit.
  `dashboard.json` gains `repo.remoteUrl`, `repo.firstCommitSha` and `repo.lastCommitSha`, and `repo.name` now prefers the remote's name — run `index` to rebuild it (older files still render, minus the new links).

  The stat tiles lose "Suppressions" — the directives chart covers it in more depth — and "Commits" now spells out how many contributors produced them, which is where the header's own commit and contributor counts went.

### Patch Changes

- [#88](https://github.com/kachkaev/repo-dive/pull/88) [`aefe65b`](https://github.com/kachkaev/repo-dive/commit/aefe65b87385c926385051f0b062ba52aedb4b87) - Build the dashboard with a relative base (`./`), so the bundle works from any directory of any static host — not only a domain root.
  `repo-dive dashboard` and `repo-dive report` behave exactly as before; the change matters when copying `dist/dashboard` together with a `dashboard.json` onto static hosting (e.g. GitHub Pages), where the absolute `/assets/…` URLs used to 404.

- [#107](https://github.com/kachkaev/repo-dive/pull/107) [`e9a8f86`](https://github.com/kachkaev/repo-dive/commit/e9a8f86d7db99b83377ea61cb0eb86d9d10040b8) - Make `repo-dive ignore` write in each file's own style, and leave alone the files no tool needs it in.

  The command used to end every ignore file with the same three lines — a blank line, a `# repo-dive catalog` comment and the entry — which is a lot of ceremony for one pattern in a file that is otherwise a plain list.
  Now it reads how the file is written and follows it: the entry is slotted in at its letter in an alphabetically ordered list, appended as a bare line to a plain one, and given a comment of its own only in a file that already keeps its patterns in commented groups — with a blank line before it only where the file sets its own groups off that way.
  The path itself is spelled the way the file spells paths — anchored (`/.repo-dive/`) where its paths are anchored, with a trailing slash where it marks directories that way — and a file written with `\r\n` gets a `\r\n` line.

  Some ignore files also get nothing at all now, because the tool reading them already learns to skip the catalog:

  - `.prettierignore`, when the repository has a root `.gitignore` — prettier reads both since v3, and the catalog is listed in `.gitignore` anyway (pinning prettier 2 or running it with `--ignore-path` opts back in);
  - `.npmignore`, when `package.json` has a `files` array, which alone decides what `npm pack` includes;
  - `.eslintignore`, when eslint reads a flat config, which never looks at that file.

  Both `repo-dive ignore` and the warning from `scan`, `index` and `status` go by these rules, so a repository where the entry is already taken care of stays quiet.
  The command now reports what each file got, or why it needed nothing.
  Entries written by earlier versions are still recognized — nothing is rewritten, and re-running adds nothing.

- [#102](https://github.com/kachkaev/repo-dive/pull/102) [`ae17729`](https://github.com/kachkaev/repo-dive/commit/ae177298112af2a50ee7844fa11836b1ad493bb2) - Plot measurements of the tree against the committer date so rebased history stops zigzagging.

  Every chart placed each commit at its **author** date.
  Under a rebase or squash-merge workflow that is when the work was written, not when it landed, so it can sit months earlier and does not increase along the first-parent chain: on ollama's mainline it steps backwards 364 times, by up to four months.
  Each of those commits dragged the current line counts back into a stretch the chart had already drawn, which is what produced the dense vertical stripes across the stacked areas.

  Which date a series uses now follows the shape of the series:

  - **Measurements of the tree at points in time** — lines by language, file types, suppressions, dependencies, code-survival totals, and the snapshots `weekly` / `monthly` / `quarterly` sampling picks — are positioned by the **committer** date, the instant the repository actually looked like that.
    It is the only one of the two that runs forwards along the history, so it is the only one a time axis can use.
  - **Counts of work** — the commit calendar, commits and churn per month, the AI-commit stat — keep binning by the **author** date.
    Bucketing by day or month makes them immune to the zigzag, and the author date is the clock `git blame` reports for code-survival cohorts, so "lines added in month M" and "lines belonging to cohort M" stay the same lines.

  Attribution is unchanged — who a commit belongs to is still its git author.
  The cube's `commits` table gains a `committed_at` column next to `authored_at` so queries can pick either, and the MCP `schema` tool explains which to reach for.

  Existing catalogs heal on the next `repo-dive index` — no re-scan needed, since the dates come from git rather than from collected output.

## 0.8.0

### Minor Changes

- [#84](https://github.com/kachkaev/repo-dive/pull/84) [`f1f99df`](https://github.com/kachkaev/repo-dive/commit/f1f99dffa79ac62247fdfea392d3eec427633d46) - Merge the "AI co-authors" and "Contributors" dashboard sections into one, so humans, AI agents and bots are measured the same way.
  The section gains an `All | Humans | AI agents | Bots` filter and gives every contributor a pair of bars spanning the whole history: commits they authored, hatched at the tail where another kind co-authored them, and — the inverse — commits of other kinds they co-authored, colored by whom they helped.
  Only cross-kind collaboration is drawn; three columns of numbers give the exact per-kind counts.

  Co-authors now resolve through the same identity pipeline as authors, so `contributors.aliases` (including `displayName`, `url` and `kind`) applies to `Co-authored-by:` trailers, and an agent that only ever co-authors gets its own row.
  Humans are keyed by canonical email as before; bots and AI agents are keyed by name and email too, since they share vendor `noreply` addresses — give them an alias group with a `displayName` to merge the variants.
  `dashboard.json` drops `aiIdentities` and records `assistedBy` / `assisted` per contributor; the contributor cap now applies per kind. Run `index` to rebuild it.

## 0.7.0

### Minor Changes

- [#75](https://github.com/kachkaev/repo-dive/pull/75) [`8392a07`](https://github.com/kachkaev/repo-dive/commit/8392a075a89414d83e89f25df3812b00004e33f2) - Warn when ignore files miss the catalog, and make its location configurable. The catalog hides itself from git with a nested `.gitignore`, but prettier, markdownlint, cspell, eslint, `docker build` and `npm pack` each read a single ignore file at the repository root, so its thousands of files quietly became their input. `scan`, `index` and `status` now check every root `.*ignore` file and warn about the ones that do not cover the catalog; the new `repo-dive ignore` command appends the entry to each of them (`--dry-run` to preview; existing files are amended, none created). New `catalog` config section: `catalog.dir` moves the catalog anywhere — pointing it outside the repository leaves the analyzed working tree untouched and skips the ignore-file check altogether — and `catalog.checkIgnoreFiles: false` silences the warning.

- [#77](https://github.com/kachkaev/repo-dive/pull/77) [`691f385`](https://github.com/kachkaev/repo-dive/commit/691f385a22d520dfca81f018a102d426ee9c6d73) - Count lines by language in-process instead of shelling out to `tokei`, so both halves of the "Lines by language" chart describe the same code.

  With "shade by year written" off, the chart came from `tokei`, which counts every file it recognizes — lockfiles, minified bundles, generated data. With the toggle on, it came from `git blame`, which only covers scannable source files. A repo whose largest `.json` or `.yaml` file is a lockfile therefore showed a huge language band that vanished the moment the toggle was ticked, and the totals disagreed in both directions.

  The `languages` collector now counts lines itself, over exactly the file set `survival` blames, using the blob cache the `directives` and `todo-comments` collectors already share. Toggling shading now keeps every stack and every total identical — only the shading changes. Along the way:

  - **No external dependency.** `tokei` no longer needs to be installed, and the collector no longer needs a worktree checkout: it reads blobs from the object database like the collectors around it.
  - **Denser and faster.** It samples every commit instead of monthly, so the chart has a point per commit rather than a step per month.
  - **One language map.** The extension → language mapping used to live in the dashboard for the shaded view and inside `tokei` for the flat one; it is now a single map in the CLI that both views are labelled from.

  Lockfiles, minified bundles, `node_modules`/`dist`/`vendor` and generated files are excluded, as they always were for blame-based views — the chart is about code someone wrote. The collector version is bumped, so run `scan` again to recount; `gc --stale` clears the superseded snapshots.

- [#76](https://github.com/kachkaev/repo-dive/pull/76) [`3b6b208`](https://github.com/kachkaev/repo-dive/commit/3b6b208263c600c08afe13fcb3f74997e77196f8) - Sample the `survival` collector monthly instead of quarterly, so code-survival charts (by cohort, by contributor, by language) plot a point per month like the rest of the dashboard rather than four per year. Scans cost roughly 3× more blame snapshots as a result; pass `scan --sample quarterly` to get the old cadence back on large repositories. Existing quarterly snapshots stay in the catalog and are reused — re-run `scan` to fill in the months between them, then `index`.

### Patch Changes

- [#74](https://github.com/kachkaev/repo-dive/pull/74) [`ff7894b`](https://github.com/kachkaev/repo-dive/commit/ff7894bc65804dc1ca5dd74306863e6c5e108977) - Rebuild the dashboard's controls on shadcn-style Base UI primitives.
  The commit-calendar range dropdown, the "Shade by year written" checkboxes and the contributor-kind filter chips now use canonical shadcn components (select, checkbox, label, toggle group) backed by `@base-ui/react`, so they are keyboard-accessible, consistently styled in both themes and ready to be reused by future controls.
  The commit calendar scrolls inside a shadcn scroll area with a slim themed scrollbar instead of the chunky native one (most visible on Windows).
  The primitives live in `dashboard/src/app/shared/@ui-primitive/` and pick up their colors from the existing palette via shadcn-style semantic tokens, so no visual re-theming is required.
  Interaction cues are tidied up along the way: the pointer cursor is reserved for links, and non-interactive elements (like the contributor bars) no longer light up on hover.

- [#79](https://github.com/kachkaev/repo-dive/pull/79) [`b4239be`](https://github.com/kachkaev/repo-dive/commit/b4239be4e6f4388d05e3d0bace2d7b9e474a30cb) - Fix the commit-calendar cell stacks bailing out of React Compiler, restoring their build-time memoization.
  The stacked rectangles are now assembled with a plain loop instead of reassigning a captured offset inside a `.map()` callback, which the compiler rejects — the calendar renders identically but its cells no longer re-render without memoization.

- [#73](https://github.com/kachkaev/repo-dive/pull/73) [`8d7ee24`](https://github.com/kachkaev/repo-dive/commit/8d7ee24b76d697e1b0fd7680011316b587f3dbb1) - Align Effect usage with v4 community best practices.
  Errors are now tagged classes with typed error channels, platform services are provided once at the CLI entrypoint, and concurrent scans collect results instead of mutating shared counters.

  User-visible fixes that come with the alignment:

  - `--help` exits 0 instead of 1.
  - Ctrl+C in `gc` prompts is a clean interrupt (exit code 130) instead of an "Aborted." error.
  - `--no-open` is now the built-in negation of a standard `--open` boolean flag (both spellings work; the default is unchanged).
  - Errors keep printing as one friendly line on stderr.

  Existing catalogs are unaffected — no re-scan needed.

## 0.6.0

### Minor Changes

- [#64](https://github.com/kachkaev/repo-dive/pull/64) [`bb126b7`](https://github.com/kachkaev/repo-dive/commit/bb126b753697b0e4d20cf7162e633b43faace708) - Add a GitHub-style commit calendar to the dashboard.

  The new **"Commit calendar"** section shows commits per day as a heatmap, with horizontal gaps between months so month boundaries stay readable.
  A range dropdown switches between the last 12 months (whole months, the current partial month shown in full), this year, the last 3 years, all years and any individual year; multi-year ranges render one strip per year, newest first.
  Days are bucketed by the author's local date, cell intensity uses quartiles of nonzero daily counts across the whole history (so switching ranges never recolors a day), and hovering a cell reveals its date, commit count and AI-assisted share.
  On narrow screens the calendar keeps its cell size and scrolls horizontally.

  A new `charts.weekStartsOn` config option (`"monday"` by default, `"sunday"` also supported) sets the first day of the week for calendar-shaped charts.

- [#69](https://github.com/kachkaev/repo-dive/pull/69) [`a349473`](https://github.com/kachkaev/repo-dive/commit/a349473f7a531d5414804802e004e9afcbf9b0b4) - Add a universal contributor-kind legend across the dashboard: reserved colors for humans (blue), bots (amber) and AI agents (plum), with diagonal hatching marking AI-assisted work. The commit calendar now stacks each day's cell by author kind (volume as opacity) and gains kind filter chips; commits per month splits into Human / Human · AI-assisted / AI agent / Bot; the churn chart hatches AI-assisted added lines; contributor lists and the AI co-authors chart use the kind colors; and the survival-by-contributor chart folds bots and AI agents into one band per kind. `dashboard.json` now records each commit's author kind, and drops its `monthly` rollup: both monthly charts sum the per-commit rows the calendar already loads. Run `index` to rebuild it.

## 0.5.0

### Minor Changes

- [#59](https://github.com/kachkaev/repo-dive/pull/59) [`566bd64`](https://github.com/kachkaev/repo-dive/commit/566bd6402728d2607dc4e91d713fb2681e465a3d) - Count direct dependencies from `package.json` manifests and chart them over time.

  The dependencies collector now reads every `package.json` in a commit's tree (workspaces and root, `node_modules` excluded) and counts the `dependencies`, `devDependencies` and `optionalDependencies` it declares, plus how many manifests the tree carries.
  `package.json` is the single source of truth for what a project _declares_, so these direct counts are accurate for every package manager — including yarn and npm v1, whose lockfiles do not record which resolved packages are direct and so previously reported zero — and even for a repository that declares dependencies before any lockfile exists.

  The dashboard gains a **"Direct dependencies over time"** chart, stacked by kind (`dependencies` / `devDependencies` / `optionalDependencies`), next to the existing resolved-packages chart, and the header's dependencies tile now shows the number of `package.json` files.
  Lockfiles keep their one job: counting the total resolved graph, split by package manager.
  New metrics `dependencies.direct` (now sourced from manifests, categorized by manifest and kind) and `dependencies.manifest` (one per `package.json`) land in the cube.

  The collector version is bumped, so run `scan` again to read manifests across the existing history.

### Patch Changes

- [#53](https://github.com/kachkaev/repo-dive/pull/53) [`b05cfaa`](https://github.com/kachkaev/repo-dive/commit/b05cfaae621d9e76e6a2e712697acf08f267adca) - Fix duplicate-key warnings in the contributor bar lists. `BarList` keyed each row by its label, which is a contributor's display name — not unique, since two distinct people can share a name — so React logged its "two children with the same key" console error. `BarList` items now carry a required `id` used as the key: the contributor lists pass their canonical email (the indexer guarantees one row per email), and the top-rule and AI-identity lists pass their already-unique rule/identity string.

- [#57](https://github.com/kachkaev/repo-dive/pull/57) [`b5cd6c3`](https://github.com/kachkaev/repo-dive/commit/b5cd6c349a46e0e00a2cbe374ba66fdef712607f) - Enable React Compiler in the dashboard so chart hover no longer re-renders the stacked areas and bars.

  The dashboard's Vite build now runs React Compiler (via `@vitejs/plugin-react`'s `reactCompilerPreset`), which auto-memoizes components.
  Moving the cursor across a time-series or diverging-bar chart now updates only the crosshair and tooltip; the area, bar and line shapes underneath stay put instead of being reconciled on every mouse move.
  Manual `useMemo` calls in the charts and dashboard were removed since the compiler covers them.
  Existing dashboards render identically — nothing to re-scan.

- [#62](https://github.com/kachkaev/repo-dive/pull/62) [`e115add`](https://github.com/kachkaev/repo-dive/commit/e115addfb0fb0c2eb2ddbf88878b6cb8d22872f5) - Change the dashboard's default port from `4936` to `2141`.
  `2141` spells "DIVE" in Scrabble tile values (D=2, I=1, V=4, E=1), a nod to the project name, whereas `4936` was arbitrary.
  It stays in the registered range and below the OS ephemeral range (Linux 32768+, macOS 49152+), so it won't randomly clash with outbound-connection source ports, and IANA has no service assigned to it.
  The default now lives in a single shared constant instead of being duplicated across the root and `dashboard` commands.
  Pass `--port` to override it, exactly as before.

- [#54](https://github.com/kachkaev/repo-dive/pull/54) [`fa4cc9e`](https://github.com/kachkaev/repo-dive/commit/fa4cc9e69ec5a40127291ffb6c95c01447beedb9) - Read npm and yarn lockfiles in the dependencies collector, not just pnpm.

  The collector now understands `package-lock.json` (npm lockfile versions 1, 2 and 3) and `yarn.lock` (both Yarn Classic v1 and Yarn Berry), alongside the existing pnpm support. Each produces the same manager-agnostic summary — resolved packages, importers and direct dependencies — so a repository that used npm or yarn before switching package managers now shows its earlier history on the "Dependencies over time" chart instead of a flat pre-pnpm stretch. npm v1 and yarn lockfiles do not record which resolved packages are direct, so their direct counts read zero.

  The chart ranks package managers by their peak usage rather than their latest value, so a manager retired mid-history (yarn or npm before a pnpm migration) stays its own named series across the whole timeline instead of folding into "Other" once it disappears from the current snapshot.

  Parsers now live in `src/lib/collectors/lockfile-parsers/`, one module per manager behind a small registry. Adding a future manager (cargo, bun, composer, …) is a new parser module and one line in the registry; the collector, cube and dashboard stay unchanged. The collector version is bumped, so run `scan` again to pick up the newly readable lockfiles.

- [#60](https://github.com/kachkaev/repo-dive/pull/60) [`621c5bb`](https://github.com/kachkaev/repo-dive/commit/621c5bbb08923f299ca708a0d03c4253747e4558) - Actually stop the dashboard's stacked areas and bars from re-rendering while the cursor moves over a chart.

  Enabling React Compiler alone did not deliver this: the compiler silently bailed (its `panicThreshold` defaults to `"none"`) on the three components that use a default value in a typed destructured parameter or the `??=` operator — including the main time-series chart — leaving them with no memoization after their `useMemo`s had been removed.
  Those patterns are rewritten so every dashboard component now compiles.

  Even compiled, the shapes still reconciled on every mouse move because they shared a parent with the hover crosshair.
  The static marks (grid, areas, bars, lines, dots) are now their own `ChartMarks` component whose props exclude hover state, so the compiler memoizes it and hovering only updates the crosshair and tooltip.
  No visible change.

## 0.4.3

### Patch Changes

- [#42](https://github.com/kachkaev/repo-dive/pull/42) [`72d8d7b`](https://github.com/kachkaev/repo-dive/commit/72d8d7b6418e6fcfe1630416e46bdf36a05f7b3d) - Keep bar-chart bars inside the plot area. Bars are centred on their data point, so with the first and last points pinned to the chart edges the outermost bars spilled halfway past the left and right sides. Bar charts now inset the time scale by half a bucket slot, so every bar sits fully within the plot while areas and lines — which want their points on the edges — keep the full width. The commits-per-month and churn-per-month charts are the ones affected.

  The inset lives on the shared x scale, so any marks overlaid on a bar chart later (e.g. a trend line) line up with the bars automatically.

- [#41](https://github.com/kachkaev/repo-dive/pull/41) [`16d232b`](https://github.com/kachkaev/repo-dive/commit/16d232b178a61f6fe71ec8dd6518b7a6bc3fe1ea) - Show the dependencies chart against the repo's full timeline, and tell "no dependencies" apart from "not scanned".

  The "Dependencies over time" chart used to begin at the first commit that carried a lockfile — often long after the repository started — because a commit only produced a dependency fact once a parseable lockfile existed in its tree. The chart now shares the repo's full timeline like every other time-series chart: its axis starts at the first commit and the area begins where the first lockfile appears, an honest step up rather than a chart that looks like the project itself began mid-history.

  The hover crosshair now tracks the cursor across the whole axis instead of snapping to the nearest data point, so the empty early stretch is inspectable too. A genuinely unscanned instant reads "No data"; a commit that was scanned and simply had no lockfile reads "No lockfile". To make that distinction real rather than assumed, the dependencies collector now records a `dependencies.scanned` marker for a scanned tree that holds no lockfile, so indexing can keep those commits as explicit zeros. The collector version is bumped, so run `scan` again to backfill the pre-lockfile commits.

- [#38](https://github.com/kachkaev/repo-dive/pull/38) [`57f238a`](https://github.com/kachkaev/repo-dive/commit/57f238a235145415b221c20d89eb47b57689e270) - Bring "Shade by year written" to the lines-by-language chart, mirroring the toggle the code-survival-by-contributor chart already had. The survival collector's raw snapshots always recorded each living line's extension and authoring cohort, so `index` now cross-tabulates them into a per-extension-per-year breakdown — existing catalogs pick it up on the next `repo-dive index`, no re-scan needed.

  Because tokei snapshots carry no per-line age, shading switches the chart to the blame-based data: languages are approximated from file extensions (mapped to tokei's names), only scannable source files are counted, and the chart's subtitle changes to say so. Languages shared with the tokei view keep its colors, so toggling never recolors the stack. Composes with percent mode — the normalized, year-shaded view shows old cohorts thinning inside each language's share.

- [#43](https://github.com/kachkaev/repo-dive/pull/43) [`b85be0f`](https://github.com/kachkaev/repo-dive/commit/b85be0fca7c67c0fd25d0746e7d2f84094665cd1) - Drop the redundant `[bot]` suffix from auto-derived contributor names. Bots and AI agents already carry a kind badge (🤖 / ✨) in the dashboard, so a name like `🤖 renovate[bot]` labelled the same thing twice. Names are now tidied when derived: the trailing `[bot]` is stripped and the leading letter capitalized, so Renovate shows as `🤖 Renovate` and Dependabot as `🤖 Dependabot`.

  Only auto-derived names change — an explicit `displayName` in your config is still used verbatim. Existing catalogs heal on the next `repo-dive index` (no re-scan needed).

- [#37](https://github.com/kachkaev/repo-dive/pull/37) [`cfc01d3`](https://github.com/kachkaev/repo-dive/commit/cfc01d3239cd95ea917f4f1409d668c595c7619b) - Add a percent mode to stacked time-series charts. Every stacked dashboard chart with more than one series — lines by language, dependencies over time, commits per month, both code-survival views — gains a `#`/`%` toggle next to its legend. Percent mode renormalizes each date to its total, turning the chart into a composition view where shifts in share stay readable even while absolute volume grows.

  Tooltips on these charts now show the absolute value and the share side by side for every series, with the active mode's column emphasized. Line charts are unchanged — their series are not parts of a whole.

## 0.4.2

### Patch Changes

- [#33](https://github.com/kachkaev/repo-dive/pull/33) [`733e681`](https://github.com/kachkaev/repo-dive/commit/733e68112a7a9151fbbc3164edec5947d639fc13) - Teach `gc` to reclaim the two kinds of dead weight it could not reach before: the per-blob cache, and tree snapshots taken off HEAD's first-parent chain.

  - **`gc --stale` now prunes the blob cache** (`.repo-dive/cache/blob-cache.sqlite`) as well as the catalog. Cached per-blob results are namespaced by `(collector, fingerprint)`, and that pair is exactly what a lookup keys on — so once a collector's version or the config it depends on changes, every entry under the old fingerprint is unreachable by construction and can go. Entries under a fingerprint some registered collector still computes are always kept, so this never costs a re-scan of live data. The file is `VACUUM`ed afterwards, and `gc` reports how much it shrank by.
  - **`gc --off-mainline` removes snapshots that the cube already ignores.** Since 0.4.1, `tree` and `worktree` collectors only ever run on HEAD's first-parent chain, but catalogs written by earlier versions are full of snapshots stored under commits that sit on side branches or arrived through an unrelated-histories merge. `--unreachable` could not clear them — those commits are still perfectly reachable from HEAD — so on a repo like react roughly 27k outputs had no way out. The new flag drops them, and only them: `log` outputs (commit metadata, churn) are left alone at every commit, because a commit's own authorship and diff are facts wherever it sits in the graph.

  Both are separate, explicit flags rather than a widening of `--unreachable`, whose established meaning is "the commit itself is gone". Running `gc` with no flags still lists everything it found and asks, and `--dry-run` reports the full plan without touching anything.

## 0.4.1

### Patch Changes

- [#24](https://github.com/kachkaev/repo-dive/pull/24) [`a196adf`](https://github.com/kachkaev/repo-dive/commit/a196adf81ed4fac06cb443589a79a605f360cf76) - Take tree snapshots only on HEAD's first-parent chain, removing the cliffs that appeared in every "state over time" chart.

  `scan` enumerates commits with a full `git log`, which walks every parent. Sampling a period then picked whichever commit was newest in that walk — often one that lives on a side branch, or one that arrived with a foreign history absorbed by an unrelated-histories merge. Such a commit's tree was never the repository's state, so charting it produced a sheer drop and recovery. React is a good example: its `compiler/` directory came from a separate repository, and monthly sampling kept landing on commits whose entire tree is that one directory — the lines-by-language and code-survival charts dropped by 90% at those points.

  Collectors whose output describes the tree at a commit (`tree` and `worktree` strategies — languages, survival, file-types, directives, dependencies, todo-comments) are now sampled from the first-parent chain only. `log` collectors (commit metadata, churn) are unaffected and still see every commit, since a commit's own authorship and diff are facts wherever it sits in the graph.

  Existing catalogs heal without a re-scan: `index` leaves off-mainline snapshots out of the cube and reports how many it skipped. Run `scan` again afterwards to fill the periods whose sample had been landing off the mainline.

  `status` counts those collectors against the mainline too, so a snapshot collector that has captured everything `scan` will ever give it reads as complete rather than stalling a few commits short.

- [#26](https://github.com/kachkaev/repo-dive/pull/26) [`a72fc66`](https://github.com/kachkaev/repo-dive/commit/a72fc66f254c7f829f7948a9917b941ec1130262) - Report `status` progress against each collector's sampling target rather than the repository's full commit count. Sampled collectors previously looked barely started once a repo grew — a monthly collector that had captured everything it will ever capture still read as `languages: 1/45 commits collected`. It now reads `languages: 1/1 commits collected (monthly sample of 45)`, so a complete collector looks complete and the policy behind the smaller target is visible.

## 0.4.0

### Minor Changes

- **Renamed from `repo-insighter` to `repo-dive`.** The old name was a working title — "insighter" is not a word, and it was awkward to say and easy to misspell. Install `repo-dive` instead; `repo-insighter` is deprecated on npm and receives no further releases.

  Everything user-facing follows the new name:

  - **Package and command** — `npx repo-dive`, and the config entry point is now `repo-dive/config`.
  - **Catalog folder** — `.repo-insighter/` → `.repo-dive/`. Existing catalogs are **not** migrated automatically, but they are not silently ignored either: running against a repo that still has the old folder fails with a message telling you to `mv .repo-insighter .repo-dive`, so a full re-scan is never triggered by accident.
  - **Config file** — `repo-insighter.config.ts` → `repo-dive.config.ts` (`.mts`/`.mjs`/`.js` likewise). The old filename is no longer read; rename it by hand.
  - **Exported type** — `RepoInsighterConfig` → `RepoDiveConfig`. `defineConfig` is unchanged, so configs that only import it need no edit beyond the package name.

  No behavior changed beyond the rename. Version numbering continues from 0.3.0 rather than restarting.

## 0.3.0

### Minor Changes

- [#7](https://github.com/kachkaev/repo-dive/pull/7) [`8d88562`](https://github.com/kachkaev/repo-dive/commit/8d88562b3b9717828378c6dd3dc8996695704280) - Add a `dependencies` collector that counts a repository's packages from its package-manager lockfiles.

  - **Total resolved packages** — the full set of `name@version` a lockfile resolves (attributed to its package manager), tracked at every commit so you can see the dependency graph grow over the repo's history.
  - **Direct and dev dependencies** — counted per workspace importer and summed, so a monorepo's duplicates add up and distinct versions of the same package count separately (React 19 in one package + React 18 in another = two direct dependencies).
  - **pnpm first, built to generalize** — parsing goes through a per-package-manager registry keyed by lockfile name; only `pnpm-lock.yaml` (v9) is implemented for now, with npm/yarn/bun slotting in later behind the same `packageManager` category. pnpm's multi-document lockfiles are handled, skipping the package-manager-management document so pnpm's own binaries don't masquerade as project dependencies.

  The dashboard gains a **Dependencies** stat tile and a **Dependencies over time** chart (resolved packages split by package manager, with a direct/dev/optional breakdown table).

- [#21](https://github.com/kachkaev/repo-dive/pull/21) [`d74a129`](https://github.com/kachkaev/repo-dive/commit/d74a129880f18bfa0a529439afd6f6e0a4d31e82) - Break the code-survival charts down by the year each surviving line was authored.

  - **Survival by contributor** starts as one flat color per contributor; a **"Shade by year written"** checkbox splits every contributor's area into per-year age bands. Each band is a lightness shade of the contributor's base color — the newest year at full color, older years fading toward the surface — so you can see, within one person's contribution, how much is fresh versus long-lived. The legend and hover tooltip stay one row per contributor either way.
  - **Survival by cohort** flips its ramp for consistency: the newest year is now the fullest color and the oldest the palest (previously reversed).
  - Both charts share a single, repo-wide set of age shades so a given year reads the same everywhere. The number of shades is the repo's age in years, capped at 10 (intended to become a config option); years beyond the window fold into a single `≤YYYY` band.

  `dashboard.json` survival rows gain a `byContributorYear` field (living lines per contributor, split by authoring year); it is rebuilt from cached facts on the next `index`, and older dashboards without it fall back to the flat contributor chart.

### Patch Changes

- [#20](https://github.com/kachkaev/repo-dive/pull/20) [`b93c771`](https://github.com/kachkaev/repo-dive/commit/b93c7716175d156fdce4756566f7dea72c9b4d38) - Key each collector's cached output by a **fingerprint** instead of its bare version. The fingerprint is a short hash (sha256, 12 hex) of the collector's `version` and the slice of config it declares a dependency on via the new optional `Collector.cacheConfig`. It is written into the `collector.json` sidecar and used as the per-blob cache namespace, so a collector re-collects whenever its version is bumped **or** the config it depends on changes — and only that collector re-collects. Config that solely affects `normalize` (contributor aliases, chart caps) is deliberately excluded, since `index` re-normalizes on every run.

  This is a generic mechanism: collectors with no config dependency (all of them today) behave exactly as before — their fingerprint tracks the version alone. It closes the gap where the version-only key could not notice config changes, which was fine when config did not exist yet.

  Upgrading resets the catalog's blob cache and sidecar keys, so the next `scan` re-collects everything once (cheap, resumable). No user-facing config changes.

- [#11](https://github.com/kachkaev/repo-dive/pull/11) [`27d2342`](https://github.com/kachkaev/repo-dive/commit/27d23428903cc0d0c8d628100ea7f20b4a875770) - Fix the `todo-comments` collector reporting 0 TODO/FIXME/HACK/XXX comments in existing catalogs. An early build of the collector recorded zeros for every commit, and because the scan is resumable and its per-blob cache is version-keyed, those stale zeros survived every subsequent re-scan. Bumping the collector version invalidates the old outputs so the next `scan` re-collects them correctly (no `--force` needed). The marker matching itself was already correct — it counts markers wherever they appear on a line, including ones tucked after a `--` suppression rationale and inside JSX/block comments; regression tests now cover those shapes.

## 0.2.0

### Minor Changes

- [`2ad06f6`](https://github.com/kachkaev/repo-dive/commit/2ad06f64e76e00026631a6395197d5d937e73be9) - Add an optional `repo-insighter.config.ts` at the root of the analyzed repository (knip-style; `.mjs`/`.js` also accepted). Everything keeps working with zero config.

  - **Contributor aliases** — `contributors.aliases` declares groups of email identities that belong to one person (work + personal email, GitHub noreply, name variants); the first entry of each group is canonical. A group can be a plain array of emails or a rich object that also sets a `displayName` (shown in charts and the contributors table), a `url` (the name links to it, e.g. a GitHub profile) and a `kind`. Emails match either the raw commit email or its prettified noreply handle, so you can list the handle you see in the report. The `index` step merges them before building the cube's dashboard data, so commit/churn attribution, the contributors table, and code-survival-by-contributor all count each person once.
  - **Contributor kinds** — each contributor is a `human` (default), `bot`, or `ai` agent. `kind` can be set explicitly per alias group or is auto-derived from the commit author's name/email (automation bots and known AI coding agents are recognized). The dashboard badges non-humans with an icon and lists bots & AI agents separately from human contributors.
  - **Configurable chart cap** — `contributors.maxInCharts` (default 10) sets how many contributors the per-contributor charts keep before folding the rest into "Other"; the contributors bar list keeps twice that. The categorical palette was widened to 20 slots so larger stacks stay legible.

  The dashboard now speaks of **contributors** (the people concept) rather than "authors"; the raw git-author fields in the cube are unchanged.

  Import `defineConfig` from the new `repo-insighter/config` entry point for type-checking and editor IntelliSense.

## 0.1.1

### Patch Changes

- [`0ec82a1`](https://github.com/kachkaev/repo-dive/commit/0ec82a18ac89fc4d9adc50dca160f52cd61c062c) - Declare the true Node floor: `node:sqlite` (used by index/query/mcp) requires Node ≥ 22.13, and `engines` now says so instead of promising 22.0.
- [`0ec82a1`](https://github.com/kachkaev/repo-dive/commit/0ec82a18ac89fc4d9adc50dca160f52cd61c062c) - Large-repo scan performance: log-strategy collectors (commit-meta, churn) batch the whole history into one `git log` pass, and content-scanning collectors (directives, todo-comments) cache results per blob (`git cat-file --batch` + SQLite blob cache + in-process memo) so only never-seen file contents are scanned. Survival sampling defaults to quarterly, and `engines.node` honestly reflects the `node:sqlite` floor (≥ 22.13).

## 0.1.0

### Minor Changes

- [`17ad1f1`](https://github.com/kachkaev/repo-dive/commit/17ad1f1922f87c0b2c0a7182179656b1a67ad925) - Ask the repository questions: new `query` command runs read-only SQL against the metrics cube, and `repo-insighter mcp` serves the cube over the Model Context Protocol (stdio) with `schema` and `query` tools for AI agents.

## 0.0.3

### Patch Changes

- [`4181c5b`](https://github.com/kachkaev/repo-dive/commit/4181c5b5ce35e2500b864248121a1505d27a1483) - New `report` command: exports the dashboard as one self-contained HTML file (charts, data and styles inlined) that opens anywhere without installing anything.

## 0.0.2

### Patch Changes

- [`69bfbe4`](https://github.com/kachkaev/repo-dive/commit/69bfbe4d765b710c0e7ddd7d9c94172533f17f46) - Bare `npx repo-insighter` now runs the whole pipeline — scan, index and dashboard (with browser auto-open) — and scan progress includes a rate/ETA estimate.

## 0.0.1

### Patch Changes

- `index` command (SQLite metrics cube + dashboard data) and `dashboard` command serving an interactive React/visx dashboard: languages over time, monthly commits with AI co-author share, churn, lint-suppression trends, top suppressed rules, code survival by cohort and author.

- Four new collectors (languages via tokei, eslint/ts directives, todo-comments, line survival via blame), commit trailers in commit-meta, per-collector sampling policies, and lifecycle commands: `collectors` and interactive `gc`.

- AI co-author detection excludes automation bots (renovate, dependabot, github-actions); GitHub noreply author emails are shortened to usernames in dashboard data.

- README reflects the implemented pipeline and npx-based usage from inside the analyzed repository.

- Initial end-to-end release test: catalog scaffolding, first collectors (`commit-meta`, `churn`, `file-types`) and the `scan`/`status` commands.
