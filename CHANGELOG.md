# repo-dive

## 0.12.0

### Minor Changes

- [#145](https://github.com/kachkaev/repo-dive/pull/145) [`f5279cf`](https://github.com/kachkaev/repo-dive/commit/f5279cf876f45ea1e37a7ab9e894ddf926acfe4a) - Name contributors in the lines-of-code chart instead of listing their email addresses.

  The "by contributor" split used to label each band with an address, so a published report spelled one out for every top contributor while the Contributors section right below it showed names.
  Both now go by name: a configured `displayName`, else the name git recorded on the person's commits, else the username their address is built around (`alice@example.com` → `alice`), and the address itself only when there is nothing else to show.
  The contributors table keeps its email column, so people who spell their name the same way stay distinguishable.
  Re-run `repo-dive index` to relabel an existing catalog; no re-scan needed.

### Patch Changes

- [#143](https://github.com/kachkaev/repo-dive/pull/143) [`2f9060a`](https://github.com/kachkaev/repo-dive/commit/2f9060a90fe0739dac113eb49bec5758cbd72d26) - Count contributors whose name ends in `bot` as bots.

  The kind is derived from the name when the config leaves it unset, and previously only recognized the usual suspects — renovate, dependabot, github-actions and anything with a `[bot]` suffix.
  A trailing `bot` word now counts too, so `Release bot` and `deploy-bot` land in the bot row while names that merely end in those letters, like `Kate Talbot`, stay human.
  Re-run `repo-dive index` on an existing catalog to reclassify past commits — no re-scan needed.

- [#138](https://github.com/kachkaev/repo-dive/pull/138) [`bdb81c1`](https://github.com/kachkaev/repo-dive/commit/bdb81c1303906c0573b35407b9255992abaea88a) - Match the corner radius of dashboard cards to the toggles and selects above them.

  Section cards and the stat tiles below the page title were rounded one step more than every control in the report, which read as two competing radii on the same screen.
  They now use the same 6px corners as the toggle groups, selects and tooltips.

- [#144](https://github.com/kachkaev/repo-dive/pull/144) [`185852c`](https://github.com/kachkaev/repo-dive/commit/185852c22693a03232961ca7c0732323938f9cf2) - Show a spinner over a chart that has been dimmed for more than half a second.
  Switching a chart's toggles dims the outgoing chart until the new one is ready, and on a large repository that wait could read as a freeze rather than as loading.
  Quick switches look exactly as before: the spinner only fades in once the wait passes half a second.

## 0.11.1

### Patch Changes

- [#136](https://github.com/kachkaev/repo-dive/pull/136) [`945baed`](https://github.com/kachkaev/repo-dive/commit/945baed017248996ee876817cef37d5e2c49c384) - Reveal dashboard sections one per paint behind a loading placeholder.
  First paint stops at the header and the stat tiles; each section then mounts in its own interruptible pass behind a placeholder — the next section's heading over a small spinner.
  The page also reserves its scrollbar from the start, so always-visible scrollbars no longer shift the layout mid-load.

- [#135](https://github.com/kachkaev/repo-dive/pull/135) [`916f2ff`](https://github.com/kachkaev/repo-dive/commit/916f2ff6c373bad0c8cc144830cd78a8b4c1d0fc) - Spell out the day of the week, and name it in every chart tooltip that shows a date.
  Dates now read "2025-10-02 · Thursday"; two-letter abbreviations stay in the commit calendar's row gutter, where they have to fit 10px cells.
  The commits-per-month tooltip names the month instead of the mid-month timestamp it had been reporting as a date.

## 0.11.0

### Minor Changes

- [#125](https://github.com/kachkaev/repo-dive/pull/125) [`c5ede81`](https://github.com/kachkaev/repo-dive/commit/c5ede81a0e104c991955257126942a6798973848) - Add a GitHub Action for generating reports in CI.

  The repository now doubles as a composite GitHub Action, so any project can produce and refresh its report inside GitHub Actions instead of on somebody's laptop:

  ```yaml
  - uses: actions/checkout@v7
    with:
      fetch-depth: 0
  - uses: kachkaev/repo-dive@main
  ```

  It runs scan → index → report and uploads the self-contained HTML report as an artifact viewable from the run page.
  Scans that hit the configurable time limit bank their progress to the Actions cache, so re-runs resume where the previous one stopped.
  See [docs/github-action.md](https://github.com/kachkaev/repo-dive/blob/main/docs/github-action.md) for all inputs, publishing to GitHub Pages and analyzing repositories other than the workflow's own.

### Patch Changes

- [#129](https://github.com/kachkaev/repo-dive/pull/129) [`5b0b667`](https://github.com/kachkaev/repo-dive/commit/5b0b667e3c9770dbf0a43e5cc3a79db1f90d6103) - Align the dashboard header's hover states and unify tooltip styling with the charts.
  The repo breadcrumb takes its hover color as a whole so it reads as one link, dates without a link lose their link-like dotted underline in favor of a `help` cursor, and the design-system tooltip adopts the muted bordered card the chart tooltips already use.

- [#128](https://github.com/kachkaev/repo-dive/pull/128) [`150edb3`](https://github.com/kachkaev/repo-dive/commit/150edb3e35a8ffee41eb1567b522e388e28c6be2) - Keep the dashboard responsive while charts re-render, and stagger the initial load.
  Chart controls now apply instantly: the expensive SVG re-render happens in an interruptible deferred pass, with the outgoing chart dimming slightly until the new one is ready.
  First paint stops at the header, the stat tiles and the first chart, so the report appears sooner and stays interactive while the sections below the fold fill in.

- [#126](https://github.com/kachkaev/repo-dive/pull/126) [`cddd986`](https://github.com/kachkaev/repo-dive/commit/cddd9868293d3301bfbdba299bfa4307ca60c260) - Hold the "Lines of code" value axis still across the chart's toggles.
  The axis used to scale to whichever variant was on screen, so switching the split or the age shading could rescale the areas under the cursor.
  Both axes now share one domain computed from the union of the two data sources, so where per-commit counts and `git blame` disagree the areas differ visibly instead of each stretching to fill the frame.

- [#124](https://github.com/kachkaev/repo-dive/pull/124) [`96d01cd`](https://github.com/kachkaev/repo-dive/commit/96d01cd0280ecb8c08be83aa10ff626ee1d1a486) - Keep the commit calendar's range select from hopping between rows on narrow screens.
  The select was as wide as the label it happened to be showing, so picking "Last 12 months" over "2019" resized it by up to 60px — enough to move it onto the second row.
  It now sits in a fixed-width slot, while the control itself still hugs its own label.

## 0.10.0

### Minor Changes

- [#119](https://github.com/kachkaev/repo-dive/pull/119) [`72566b4`](https://github.com/kachkaev/repo-dive/commit/72566b41e0e35bab7583a04721f63db2265ae78c) - Unify the lines-of-code timelines into one "Lines of code" chart with toggles.
  "Lines by language", "Code survival by cohort" and "Code survival by contributor" become a single chart, placed before all others, switched by three segmented controls: all lines | by language | by contributor, no shading | shade by year written, and absolute counts | percentage.
  Every chart section now shares one layout — title, subtitle, controls, then a frame holding only the visual with its legend centered below, and data tables after the frame — so the calendar's and contributors' own filters moved out of their frames into the same flat segmented style.
  Options whose data is missing from an older `dashboard.json` are disabled with an explanatory tooltip; existing catalogs render without a re-scan.

### Patch Changes

- [#121](https://github.com/kachkaev/repo-dive/pull/121) [`6d06aee`](https://github.com/kachkaev/repo-dive/commit/6d06aeea247dca06196bdb71a4a458ab66797ebb) - Anchor the dashboard's AI-commit share to when the catalog was generated instead of to wall-clock now.
  The tile covers the last 90 days, but the window was measured back from the moment the page happened to be opened, so any `dashboard.json` older than 90 days matched no commits at all and rendered an em dash.
  The window now runs back from `generatedAt`, which every other date in the report is already anchored to.

- [#120](https://github.com/kachkaev/repo-dive/pull/120) [`cd99310`](https://github.com/kachkaev/repo-dive/commit/cd993106d1f5671890c3df6013e62c83e7754a2b) - Include the repository's first commit in every sampling policy.
  Period policies keep the newest commit per period, so sampled collectors like `survival` started their timelines at the first period boundary instead of the repository's birth; both endpoints — HEAD and the first commit — are now always sampled.
  Existing catalogs heal on the next `repo-dive scan` (no `--force` needed); run `repo-dive index` afterwards.

## 0.9.0

### Minor Changes

- [#106](https://github.com/kachkaev/repo-dive/pull/106) [`0b97bf9`](https://github.com/kachkaev/repo-dive/commit/0b97bf91f74ad449168da64f764a7ee8a28b6d73) - Sharpen the commit calendar's edges, labels and readouts.
  Days outside the report's coverage are drawn as outlines instead of being left blank, so "we have no data" reads differently from "no commits", and a month whose 1st does not land on the first day of the week has its label shifted one column right.
  Two-letter day names ("Mo", "Tu") buy back enough width that the widest possible year no longer scrolls horizontally.
  A day's detail moved out of the caption and into a tooltip styled like the other charts' hover cards, so the calendar no longer changes height as the pointer travels across it; the caption now gives the range's total and the busiest day a line each.

- [#103](https://github.com/kachkaev/repo-dive/pull/103) [`9fe9206`](https://github.com/kachkaev/repo-dive/commit/9fe920617ed26b4b19f5a443c46865298dc50f13) - Rework the report header around the repository's own identity.
  The heading is now a breadcrumb of the `origin` remote — `kachkaev / repo-dive` under the GitHub or GitLab mark — linking to the repository itself; a checkout with no remote keeps its directory name, unlinked, which also fixes the published examples being titled "analyzed".
  The line below reads `Analyzed by repo-dive at <date> · coverage: <first> — <last>`, where each date carries a tooltip with its full timestamp and, on GitHub and GitLab, links to the commit it comes from.
  The stat tiles lose "Suppressions" — the directives chart covers it in more depth — and "Commits" now spells out how many contributors produced them.
  `dashboard.json` gains `repo.remoteUrl`, `repo.firstCommitSha` and `repo.lastCommitSha`: run `index` to rebuild it (older files still render, minus the new links).

### Patch Changes

- [#88](https://github.com/kachkaev/repo-dive/pull/88) [`aefe65b`](https://github.com/kachkaev/repo-dive/commit/aefe65b87385c926385051f0b062ba52aedb4b87) - Build the dashboard with a relative base (`./`), so the bundle works from any directory of any static host — not only a domain root.
  This matters when copying `dist/dashboard` together with a `dashboard.json` onto static hosting such as GitHub Pages, where the absolute `/assets/…` URLs used to 404.

- [#107](https://github.com/kachkaev/repo-dive/pull/107) [`e9a8f86`](https://github.com/kachkaev/repo-dive/commit/e9a8f86d7db99b83377ea61cb0eb86d9d10040b8) - Make `repo-dive ignore` write in each file's own style, and leave alone the files no tool needs it in.
  The command used to end every ignore file with the same three lines; it now slots the entry in at its letter in an alphabetically ordered list, appends a bare line to a plain one, adds a comment only where the file keeps its patterns in commented groups, and spells the path the way the file spells paths (anchored, trailing slash, `\r\n` line endings).

  Some files get nothing at all now, because the tool reading them already skips the catalog: `.prettierignore` when the repository has a root `.gitignore`, `.npmignore` when `package.json` has a `files` array, and `.eslintignore` when eslint reads a flat config.
  The warning from `scan`, `index` and `status` goes by the same rules, and entries written by earlier versions are still recognized — nothing is rewritten, and re-running adds nothing.

- [#102](https://github.com/kachkaev/repo-dive/pull/102) [`ae17729`](https://github.com/kachkaev/repo-dive/commit/ae177298112af2a50ee7844fa11836b1ad493bb2) - Plot measurements of the tree against the committer date so rebased history stops zigzagging.
  Every chart used to place each commit at its **author** date, which under a rebase or squash-merge workflow can sit months before the commit landed — on ollama's mainline it steps backwards 364 times, which is what produced the dense vertical stripes across the stacked areas.
  Measurements of the tree (lines by language, file types, suppressions, dependencies, code-survival totals) are now positioned by the **committer** date, the only one of the two that runs forwards along the history; counts of work (the commit calendar, commits and churn per month, the AI-commit stat) keep binning by the **author** date, which is also the clock `git blame` reports for survival cohorts.
  Attribution is unchanged, and the cube's `commits` table gains a `committed_at` column next to `authored_at` so queries can pick either.
  Existing catalogs heal on the next `repo-dive index` — no re-scan needed.

## 0.8.0

### Minor Changes

- [#84](https://github.com/kachkaev/repo-dive/pull/84) [`f1f99df`](https://github.com/kachkaev/repo-dive/commit/f1f99dffa79ac62247fdfea392d3eec427633d46) - Merge the "AI co-authors" and "Contributors" dashboard sections into one, so humans, AI agents and bots are measured the same way.
  The section gains an `All | Humans | AI agents | Bots` filter and gives every contributor a pair of bars: commits they authored, hatched at the tail where another kind co-authored them, and — the inverse — commits of other kinds they co-authored, colored by whom they helped.
  Co-authors now resolve through the same identity pipeline as authors, so `contributors.aliases` applies to `Co-authored-by:` trailers and an agent that only ever co-authors gets its own row.
  Bots and AI agents are keyed by name as well as email, since they share vendor `noreply` addresses — give them an alias group with a `displayName` to merge the variants.
  `dashboard.json` drops `aiIdentities` and records `assistedBy` / `assisted` per contributor: run `index` to rebuild it.

## 0.7.0

### Minor Changes

- [#75](https://github.com/kachkaev/repo-dive/pull/75) [`8392a07`](https://github.com/kachkaev/repo-dive/commit/8392a075a89414d83e89f25df3812b00004e33f2) - Warn when ignore files miss the catalog, and make its location configurable.
  The catalog hides itself from git with a nested `.gitignore`, but prettier, markdownlint, cspell, eslint, `docker build` and `npm pack` each read a single ignore file at the repository root, so its thousands of files quietly became their input.
  `scan`, `index` and `status` now warn about root `.*ignore` files that do not cover the catalog, and the new `repo-dive ignore` command appends the entry to each of them (`--dry-run` to preview; no files are created).
  A new `catalog` config section moves the catalog anywhere via `catalog.dir` — pointing it outside the repository skips the check altogether — and `catalog.checkIgnoreFiles: false` silences the warning.

- [#77](https://github.com/kachkaev/repo-dive/pull/77) [`691f385`](https://github.com/kachkaev/repo-dive/commit/691f385a22d520dfca81f018a102d426ee9c6d73) - Count lines by language in-process instead of shelling out to `tokei`, so both halves of the "Lines by language" chart describe the same code.
  Unshaded, the chart came from `tokei`, which counts lockfiles, minified bundles and generated data; shaded by year, it came from `git blame`, which covers only scannable source — so a repo whose largest `.json` is a lockfile lost a whole language band the moment the toggle was ticked.
  The `languages` collector now counts lines itself over exactly the file set `survival` blames, sampling every commit rather than monthly, so toggling shading changes nothing but the shading and `tokei` no longer has to be installed.
  The collector version is bumped, so run `scan` again to recount; `gc --stale` clears the superseded snapshots.

- [#76](https://github.com/kachkaev/repo-dive/pull/76) [`3b6b208`](https://github.com/kachkaev/repo-dive/commit/3b6b208263c600c08afe13fcb3f74997e77196f8) - Sample the `survival` collector monthly instead of quarterly, so code-survival charts plot a point per month like the rest of the dashboard.
  Scans cost roughly 3× more blame snapshots as a result — pass `scan --sample quarterly` for the old cadence on large repositories.
  Existing quarterly snapshots are reused; re-run `scan` to fill in the months between them, then `index`.

### Patch Changes

- [#74](https://github.com/kachkaev/repo-dive/pull/74) [`ff7894b`](https://github.com/kachkaev/repo-dive/commit/ff7894bc65804dc1ca5dd74306863e6c5e108977) - Rebuild the dashboard's controls on shadcn-style Base UI primitives.
  The commit-calendar range dropdown, the "Shade by year written" checkboxes and the contributor-kind filter chips now use canonical shadcn components backed by `@base-ui/react`, so they are keyboard-accessible and consistently styled in both themes.
  The commit calendar scrolls inside a shadcn scroll area with a slim themed scrollbar instead of the chunky native one, most visible on Windows.
  Interaction cues are tidied up along the way: the pointer cursor is reserved for links, and non-interactive elements no longer light up on hover.

- [#79](https://github.com/kachkaev/repo-dive/pull/79) [`b4239be`](https://github.com/kachkaev/repo-dive/commit/b4239be4e6f4388d05e3d0bace2d7b9e474a30cb) - Fix the commit-calendar cell stacks bailing out of React Compiler, restoring their build-time memoization.
  The stacked rectangles are now assembled with a plain loop instead of reassigning a captured offset inside a `.map()` callback, which the compiler rejects — the calendar renders identically.

- [#73](https://github.com/kachkaev/repo-dive/pull/73) [`8d7ee24`](https://github.com/kachkaev/repo-dive/commit/8d7ee24b76d697e1b0fd7680011316b587f3dbb1) - Align Effect usage with v4 community best practices.
  Errors are now tagged classes with typed error channels, platform services are provided once at the CLI entrypoint, and concurrent scans collect results instead of mutating shared counters.
  User-visible fixes come with it: `--help` exits 0 instead of 1, Ctrl+C in `gc` prompts is a clean interrupt (exit code 130) rather than an "Aborted." error, and `--no-open` is now the built-in negation of a standard `--open` boolean flag.

## 0.6.0

### Minor Changes

- [#64](https://github.com/kachkaev/repo-dive/pull/64) [`bb126b7`](https://github.com/kachkaev/repo-dive/commit/bb126b753697b0e4d20cf7162e633b43faace708) - Add a GitHub-style commit calendar to the dashboard.
  The new **"Commit calendar"** section shows commits per day as a heatmap, with horizontal gaps between months; a range dropdown switches between the last 12 months, this year, the last 3 years, all years and any individual year, rendering one strip per year, newest first.
  Cell intensity uses quartiles of nonzero daily counts across the whole history, so switching ranges never recolors a day, and hovering a cell reveals its date, commit count and AI-assisted share.
  A new `charts.weekStartsOn` config option (`"monday"` by default, `"sunday"` also supported) sets the first day of the week for calendar-shaped charts.

- [#69](https://github.com/kachkaev/repo-dive/pull/69) [`a349473`](https://github.com/kachkaev/repo-dive/commit/a349473f7a531d5414804802e004e9afcbf9b0b4) - Add a universal contributor-kind legend across the dashboard: reserved colors for humans (blue), bots (amber) and AI agents (plum), with diagonal hatching marking AI-assisted work.
  The commit calendar stacks each day's cell by author kind and gains kind filter chips, commits per month splits into Human / Human · AI-assisted / AI agent / Bot, the churn chart hatches AI-assisted added lines, and survival by contributor folds bots and AI agents into one band per kind.
  `dashboard.json` now records each commit's author kind and drops its `monthly` rollup: run `index` to rebuild it.

## 0.5.0

### Minor Changes

- [#59](https://github.com/kachkaev/repo-dive/pull/59) [`566bd64`](https://github.com/kachkaev/repo-dive/commit/566bd6402728d2607dc4e91d713fb2681e465a3d) - Count direct dependencies from `package.json` manifests and chart them over time.
  The dependencies collector now reads every `package.json` in a commit's tree and counts the `dependencies`, `devDependencies` and `optionalDependencies` it declares, which is accurate for every package manager — including yarn and npm v1, whose lockfiles do not record which packages are direct and so previously reported zero.
  The dashboard gains a **"Direct dependencies over time"** chart stacked by kind, and the dependencies tile now shows the number of `package.json` files.
  The collector version is bumped, so run `scan` again to read manifests across the existing history.

### Patch Changes

- [#53](https://github.com/kachkaev/repo-dive/pull/53) [`b05cfaa`](https://github.com/kachkaev/repo-dive/commit/b05cfaae621d9e76e6a2e712697acf08f267adca) - Fix duplicate-key warnings in the contributor bar lists.
  `BarList` keyed each row by its label — a contributor's display name, which two distinct people can share — so React logged its "two children with the same key" error; items now carry a required `id` used as the key.

- [#57](https://github.com/kachkaev/repo-dive/pull/57) [`b5cd6c3`](https://github.com/kachkaev/repo-dive/commit/b5cd6c349a46e0e00a2cbe374ba66fdef712607f) - Enable React Compiler in the dashboard so chart hover no longer re-renders the stacked areas and bars.
  Moving the cursor across a time-series or diverging-bar chart now updates only the crosshair and tooltip; the shapes underneath stay put instead of being reconciled on every mouse move.

- [#62](https://github.com/kachkaev/repo-dive/pull/62) [`e115add`](https://github.com/kachkaev/repo-dive/commit/e115addfb0fb0c2eb2ddbf88878b6cb8d22872f5) - Change the dashboard's default port from `4936` to `2141`.
  `2141` spells "DIVE" in Scrabble tile values (D=2, I=1, V=4, E=1), a nod to the project name, whereas `4936` was arbitrary.
  It stays in the registered range and below the OS ephemeral range, and IANA has no service assigned to it; pass `--port` to override it, exactly as before.

- [#54](https://github.com/kachkaev/repo-dive/pull/54) [`fa4cc9e`](https://github.com/kachkaev/repo-dive/commit/fa4cc9e69ec5a40127291ffb6c95c01447beedb9) - Read npm and yarn lockfiles in the dependencies collector, not just pnpm.
  `package-lock.json` (versions 1, 2 and 3) and `yarn.lock` (Classic and Berry) now produce the same manager-agnostic summary as pnpm, so a repository that used npm or yarn before switching shows its earlier history instead of a flat pre-pnpm stretch — though npm v1 and yarn lockfiles do not record which packages are direct, so their direct counts read zero.
  The chart ranks package managers by their peak usage rather than their latest value, so a manager retired mid-history stays its own named series across the whole timeline instead of folding into "Other".
  The collector version is bumped, so run `scan` again to pick up the newly readable lockfiles.

- [#60](https://github.com/kachkaev/repo-dive/pull/60) [`621c5bb`](https://github.com/kachkaev/repo-dive/commit/621c5bbb08923f299ca708a0d03c4253747e4558) - Actually stop the dashboard's stacked areas and bars from re-rendering while the cursor moves over a chart.
  Enabling React Compiler alone did not deliver this: it silently bailed on three components — including the main time-series chart — leaving them with no memoization after their `useMemo`s had been removed.
  Those patterns are rewritten, and the static marks (grid, areas, bars, lines, dots) moved into their own component whose props exclude hover state, so hovering now updates only the crosshair and tooltip.
  No visible change.

## 0.4.3

### Patch Changes

- [#42](https://github.com/kachkaev/repo-dive/pull/42) [`72d8d7b`](https://github.com/kachkaev/repo-dive/commit/72d8d7b6418e6fcfe1630416e46bdf36a05f7b3d) - Keep bar-chart bars inside the plot area.
  Bars are centred on their data point, so with the first and last points pinned to the chart edges the outermost bars spilled halfway past the left and right sides.
  Bar charts now inset the time scale by half a bucket slot — affecting commits per month and churn per month — while areas and lines, which want their points on the edges, keep the full width.

- [#41](https://github.com/kachkaev/repo-dive/pull/41) [`16d232b`](https://github.com/kachkaev/repo-dive/commit/16d232b178a61f6fe71ec8dd6518b7a6bc3fe1ea) - Show the dependencies chart against the repo's full timeline, and tell "no dependencies" apart from "not scanned".
  The chart used to begin at the first commit that carried a lockfile, often long after the repository started; its axis now starts at the first commit and the area steps up where the first lockfile appears.
  The hover crosshair tracks the cursor across the whole axis rather than snapping to the nearest data point, so the empty early stretch is inspectable: an unscanned instant reads "No data", a scanned commit with no lockfile reads "No lockfile".
  The collector records a `dependencies.scanned` marker to make that distinction real, so run `scan` again to backfill the pre-lockfile commits.

- [#38](https://github.com/kachkaev/repo-dive/pull/38) [`57f238a`](https://github.com/kachkaev/repo-dive/commit/57f238a235145415b221c20d89eb47b57689e270) - Bring "Shade by year written" to the lines-by-language chart, mirroring the toggle the code-survival-by-contributor chart already had.
  Because tokei snapshots carry no per-line age, shading switches the chart to blame-based data: languages are approximated from file extensions, only scannable source files are counted, and the subtitle changes to say so.
  Languages shared with the tokei view keep its colors, so toggling never recolors the stack, and it composes with percent mode — the normalized view shows old cohorts thinning inside each language's share.
  Existing catalogs pick it up on the next `repo-dive index`, no re-scan needed.

- [#43](https://github.com/kachkaev/repo-dive/pull/43) [`b85be0f`](https://github.com/kachkaev/repo-dive/commit/b85be0fca7c67c0fd25d0746e7d2f84094665cd1) - Drop the redundant `[bot]` suffix from auto-derived contributor names.
  Bots and AI agents already carry a kind badge (🤖 / ✨), so `🤖 renovate[bot]` labelled the same thing twice; names are now tidied when derived, giving `🤖 Renovate` and `🤖 Dependabot`.
  An explicit `displayName` in your config is still used verbatim, and existing catalogs heal on the next `repo-dive index`.

- [#37](https://github.com/kachkaev/repo-dive/pull/37) [`cfc01d3`](https://github.com/kachkaev/repo-dive/commit/cfc01d3239cd95ea917f4f1409d668c595c7619b) - Add a percent mode to stacked time-series charts.
  Every stacked chart with more than one series gains a `#`/`%` toggle next to its legend; percent mode renormalizes each date to its total, so shifts in share stay readable even while absolute volume grows.
  Tooltips on these charts now show the absolute value and the share side by side for every series, with the active mode's column emphasized.

## 0.4.2

### Patch Changes

- [#33](https://github.com/kachkaev/repo-dive/pull/33) [`733e681`](https://github.com/kachkaev/repo-dive/commit/733e68112a7a9151fbbc3164edec5947d639fc13) - Teach `gc` to reclaim the two kinds of dead weight it could not reach before:

  - **`gc --stale` now prunes the blob cache** (`.repo-dive/cache/blob-cache.sqlite`) as well as the catalog.
    Cached results are namespaced by `(collector, fingerprint)`, so entries under a fingerprint no registered collector still computes are unreachable by construction and can go without ever costing a re-scan of live data.
  - **`gc --off-mainline` removes snapshots that the cube already ignores** — tree snapshots stored under side-branch commits by pre-0.4.1 versions, roughly 27k of them on a repo like react.
    `--unreachable` could not clear them, since those commits are still reachable from HEAD; `log` outputs are left alone at every commit.

## 0.4.1

### Patch Changes

- [#24](https://github.com/kachkaev/repo-dive/pull/24) [`a196adf`](https://github.com/kachkaev/repo-dive/commit/a196adf81ed4fac06cb443589a79a605f360cf76) - Take tree snapshots only on HEAD's first-parent chain, removing the cliffs that appeared in every "state over time" chart.
  Sampling used to pick whichever commit was newest in a full `git log` walk, often one living on a side branch or arriving with a foreign history absorbed by an unrelated-histories merge — on react, monthly sampling kept landing on commits whose entire tree is the `compiler/` directory, dropping the lines-by-language and code-survival charts by 90%.
  Collectors whose output describes the tree at a commit (languages, survival, file-types, directives, dependencies, todo-comments) are now sampled from the first-parent chain only; `log` collectors still see every commit, since a commit's own authorship and diff are facts wherever it sits in the graph.
  Existing catalogs heal without a re-scan — `index` leaves off-mainline snapshots out of the cube and reports how many it skipped — then run `scan` again to fill the periods whose sample had been landing off the mainline.

- [#26](https://github.com/kachkaev/repo-dive/pull/26) [`a72fc66`](https://github.com/kachkaev/repo-dive/commit/a72fc66f254c7f829f7948a9917b941ec1130262) - Report `status` progress against each collector's sampling target rather than the repository's full commit count.
  A monthly collector that had captured everything it will ever capture used to read `languages: 1/45 commits collected`; it now reads `languages: 1/1 commits collected (monthly sample of 45)`, so a complete collector looks complete and the policy behind the smaller target is visible.

## 0.4.0

### Minor Changes

- **Renamed from `repo-insighter` to `repo-dive`.** The old name was a working title — "insighter" is not a word, and it was awkward to say and easy to misspell.
  Install `repo-dive` instead; `repo-insighter` is deprecated on npm and receives no further releases.

  Everything user-facing follows the new name:

  - **Package and command** — `npx repo-dive`, and the config entry point is now `repo-dive/config`.
  - **Catalog folder** — `.repo-insighter/` → `.repo-dive/`, not migrated automatically: running against a repo that still has the old folder fails with a message telling you to `mv .repo-insighter .repo-dive`, so a full re-scan is never triggered by accident.
  - **Config file** — `repo-insighter.config.ts` → `repo-dive.config.ts` (`.mts`/`.mjs`/`.js` likewise); the old filename is no longer read.
  - **Exported type** — `RepoInsighterConfig` → `RepoDiveConfig`, with `defineConfig` unchanged.

  No behavior changed beyond the rename, and version numbering continues from 0.3.0 rather than restarting.

## 0.3.0

### Minor Changes

- [#7](https://github.com/kachkaev/repo-dive/pull/7) [`8d88562`](https://github.com/kachkaev/repo-dive/commit/8d88562b3b9717828378c6dd3dc8996695704280) - Add a `dependencies` collector that counts a repository's packages from its package-manager lockfiles.
  It tracks the total resolved packages a lockfile pins, attributed to its package manager, at every commit, plus direct and dev dependencies counted per workspace importer — so a monorepo's duplicates add up and distinct versions of the same package count separately.
  Only `pnpm-lock.yaml` (v9) is parsed for now, behind a per-package-manager registry that npm, yarn and bun can slot into later.
  The dashboard gains a **Dependencies** stat tile and a **Dependencies over time** chart.

- [#21](https://github.com/kachkaev/repo-dive/pull/21) [`d74a129`](https://github.com/kachkaev/repo-dive/commit/d74a129880f18bfa0a529439afd6f6e0a4d31e82) - Break the code-survival charts down by the year each surviving line was authored.
  **Survival by contributor** gains a **"Shade by year written"** checkbox that splits every contributor's area into per-year age bands — lightness shades of their base color, the newest year at full color — while the legend and tooltip stay one row per contributor; **survival by cohort** flips its ramp to match.
  Both charts share a single repo-wide set of age shades, capped at 10 years, with years beyond the window folding into one `≤YYYY` band.
  `dashboard.json` survival rows gain a `byContributorYear` field, rebuilt from cached facts on the next `index`; older dashboards fall back to the flat contributor chart.

### Patch Changes

- [#20](https://github.com/kachkaev/repo-dive/pull/20) [`b93c771`](https://github.com/kachkaev/repo-dive/commit/b93c7716175d156fdce4756566f7dea72c9b4d38) - Key each collector's cached output by a **fingerprint** instead of its bare version.
  The fingerprint hashes the collector's `version` together with the slice of config it declares a dependency on via the new optional `Collector.cacheConfig`, so a collector re-collects whenever either changes — and only that collector re-collects.
  Config that solely affects `normalize` (contributor aliases, chart caps) is deliberately excluded, since `index` re-normalizes on every run.
  Upgrading resets the catalog's blob cache and sidecar keys, so the next `scan` re-collects everything once (cheap, resumable).

- [#11](https://github.com/kachkaev/repo-dive/pull/11) [`27d2342`](https://github.com/kachkaev/repo-dive/commit/27d23428903cc0d0c8d628100ea7f20b4a875770) - Fix the `todo-comments` collector reporting 0 TODO/FIXME/HACK/XXX comments in existing catalogs.
  An early build recorded zeros for every commit, and because the per-blob cache is version-keyed those stale zeros survived every re-scan; bumping the collector version invalidates them, so the next `scan` re-collects correctly (no `--force` needed).

## 0.2.0

### Minor Changes

- [`2ad06f6`](https://github.com/kachkaev/repo-dive/commit/2ad06f64e76e00026631a6395197d5d937e73be9) - Add an optional `repo-insighter.config.ts` at the root of the analyzed repository (knip-style; `.mjs`/`.js` also accepted).
  Everything keeps working with zero config.

  - **Contributor aliases** — `contributors.aliases` declares groups of email identities that belong to one person; the first entry of each group is canonical, and a group can also set a `displayName`, a `url` and a `kind`.
    `index` merges them before building the cube, so commit and churn attribution, the contributors table and code survival by contributor all count each person once.
  - **Contributor kinds** — each contributor is a `human` (default), `bot` or `ai` agent, set per alias group or auto-derived from the commit author's name and email.
    The dashboard badges non-humans with an icon and lists bots and AI agents separately from human contributors.
  - **Configurable chart cap** — `contributors.maxInCharts` (default 10) sets how many contributors the per-contributor charts keep before folding the rest into "Other".

  Import `defineConfig` from the new `repo-insighter/config` entry point for type-checking and editor IntelliSense.

## 0.1.1

### Patch Changes

- [`0ec82a1`](https://github.com/kachkaev/repo-dive/commit/0ec82a18ac89fc4d9adc50dca160f52cd61c062c) - Declare the true Node floor: `node:sqlite` (used by index/query/mcp) requires Node ≥ 22.13, and `engines` now says so instead of promising 22.0.
- [`0ec82a1`](https://github.com/kachkaev/repo-dive/commit/0ec82a18ac89fc4d9adc50dca160f52cd61c062c) - Speed up scans of large repositories: log-strategy collectors (commit-meta, churn) batch the whole history into one `git log` pass, and content-scanning collectors (directives, todo-comments) cache results per blob, so only never-seen file contents are scanned. Survival sampling defaults to quarterly.

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
