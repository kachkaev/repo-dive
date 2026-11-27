# Effect UI dashboard (experimental)

An experimental port of the React dashboard in [`../dashboard`](../dashboard) to [Effect UI](https://ui.effect.website/article.md), the Effect team's Elm-style UI framework.
It reads the same `dashboard.json` and aims to replicate the React dashboard's UX verbatim: the same layout, classes, interactions, hover cards, tooltips and keyboard behavior.

React stays the default.
The CLI serves or exports this build with `--ui effect` on the bare pipeline, `dashboard` and `report`, and the GitHub Action takes `ui: effect`.

This README is the porting guide for the charts that are still placeholders.
Read it with the React file you are porting open next to it.

## Ground rules

- **The two dashboards know nothing of each other.**
  Nothing here imports from `../dashboard`, and nothing there imports from here, so either folder can be deleted along with a few lines of CLI and config.
  Pure logic the React app has (`data.ts`, `format.ts`, `history-range.ts`, `stacked-series.ts`, …) is **copied** here with its tests, on purpose.
  Copy a helper verbatim when a chart needs it; don't refactor it while porting.
- **Same markup, same classes.**
  `src/styles.css` is a verbatim copy of the React one, and every element carries the classes and `data-*` attributes its React counterpart renders, so the pixels match.
  When the React code computes a class with `cn(...)`, inspect the rendered DOM and paste the merged class string.
  The semantic tokens and interaction conventions in the [editing-dashboard skill](../.agents/skills/editing-dashboard/SKILL.md) apply here as they do there.
- **Replicate first, improve later.**
  When Effect UI cannot reproduce a React behavior exactly, say so in a comment next to the code and add it to [Deviations](#deviations-from-the-react-dashboard).
- `@effect/ui` and `@effect/ui-kit` are not on npm yet: both are installed from pkg.pr.new snapshots pinned to one Effect-TS/ui commit (see `package.json`), tracked in [#393](https://github.com/kachkaev/repo-dive/issues/393).
  Bump both URLs together.
- Read the docs that ship with the installed version, not the web: `node_modules/@effect/ui/AGENTS.md`, the runnable examples in `node_modules/@effect/ui/ai-docs/src/10_ui/`, and the JSDoc of `node_modules/@effect/ui-kit/src/*.ts`.

## Running it

```sh
pnpm build                   # builds dist/dashboard-effect-ui along with everything else
node dist/cli.js --ui effect # scan + index + serve this dashboard for the current repo
node dist/cli.js report --ui effect --out report.html
```

For a dev server with hot reload, copy a `dashboard.json` into `dashboard-effect-ui/public/` (gitignored) and run `pnpm dev:dashboard-effect-ui`.
It listens on port 5198, one below `pnpm dev:dashboard`, so both can run side by side for comparison.

## File layout

The tree mirrors `../dashboard/src` file for file, in kebab-case and following the [fractal tree](../.agents/skills/fractal-tree-file-structure/SKILL.md) rules: `foo.tsx` there is `foo.ts` here, and a folder belongs to the file of the same name.

```text
src/
├── main.ts                         # entry: mounts App with BrowserHost
├── app.ts                          # App: loads dashboard.json, header, stat tiles, ReportSections
├── data.ts                         # dashboard.json types (copied) + the LoadDashboardData query
├── styles.css                      # verbatim copy
└── app/
    ├── report-header.ts            # ported
    ├── report-sections.ts          # the list of sections, revealed one per frame
    ├── report-sections/
    │   ├── <name>-section.ts       # one file per section: heading, controls, chart call
    │   ├── history-range-select.ts # ported (ui-kit Select)
    │   ├── frame-ticks.ts          # the reveal's clock: animation frames, or a task loop while hidden
    │   ├── contributors-in-range.ts (+ test, copied)
    │   └── shared/                 # what several sections share: ReportSection, cachedBy, ranges, kinds, monthly buckets, decimate
    ├── bar-list.ts                 # ported — the reference chart
    ├── lines-timeline.ts           # placeholder around SurvivalTimeline
    ├── files-timeline.ts           # placeholder around SurvivalTimeline
    └── shared/
        ├── @ui-primitive/          # tooltip, select, toggle-group: ui-kit parts with the shadcn classes; shared/top-layer-reset.ts
        ├── primitives.ts           # Section, SectionSkeleton, StatTile, DataTable
        ├── markdown.ts, icons.ts, format.ts, history-range.ts, stacked-series.ts, …
        ├── measure-width.ts        # MeasureWidth mount (the React useMeasuredWidth)
        ├── track-pointer.ts        # TrackPointer mount (the React charts' onMouseMove)
        ├── crosshair-line.ts, bar-path.ts, time-axis.ts, category-colors.ts, survival-colors.ts
        ├── dashboard-data-fixture.ts # a small dashboard.json for tests
        └── chart-placeholder.ts    # TEMPORARY, deleted with the last placeholder
```

A chart port adds its file where the React one lives (`app/time-stack-chart.ts`, `app/activity-calendar.ts`, …), with any helpers it alone needs in a folder of the same name, and replaces one placeholder in its section file.

## How the app is put together

- `main.ts` mounts `App` with `BrowserHost.mount` and provides no Layers.
- `App` declares the `LoadDashboardData` query (in `data.ts`) and renders `AsyncResult.match` over it: nothing while it loads, the error page on failure, the report on success.
  The query reads the inlined `window.__REPO_DIVE_DATA__` of a `repo-dive report` export, or fetches `./dashboard.json`.
  `DashboardDataSchema` declares the shape rather than validating it, as the React app casts it.
- `ReportSections` lists every section in reading order (`reportSectionsOf`, built once per data) and reveals one per frame, showing the next section's heading over a spinner meanwhile, like the React `RevealSequentially`.
  The frames come from `frame-ticks.ts`: animation frames while the page is shown, and a `MessageChannel` task loop while it is hidden, which browsers don't throttle the way they throttle timers, so a report opened in a background tab is complete when shown.
- Each section lives in `report-sections/<name>-section.ts` and exports one `<name>SectionOf(data: DashboardData)` that returns a `ReportSection` (or `undefined` when the repo has nothing for it):
  - `id`: the section's chart annotation id, which also keys its node.
  - `skeleton`: the heading the reveal shows before the section arrives.
  - `view(h, key)`: draws the section — a `Section(h, …).key(key)` view for stateless sections, or the section's own component (`Name(h, { key, props })`) when it has controls.
- A section with controls is a component whose Model holds the controls' values (kind filter, percent mode, range).
  In React that state lives in `ReportSections`; here each section owns it, so a chart port touches only its own section file.

## Porting a chart

### Component or view function

A chart without state (no hover, no toggles), like `bar-list.ts`, is a **view function**: `<M>(h: Html.H<M>, options) => builder`, named in CapitalCase.
Everything else is an **`Html.component`** in its own file:

```ts
const DivergingBarsMessage = UiSchema.TaggedEnum({
  ChangedWidth: { width: Schema.Number },
  MovedPointer: { x: Schema.Number },
  LeftPlot: {},
});

export const DivergingBars = Html.component({
  name: "DivergingBars",
  props: Schema.Struct({ points: Schema.Array(DivergingPoint) /* … */ }),
  model: Schema.Struct({
    width: Schema.Number,
    hoverIndex: Schema.NullOr(Schema.Number),
  }),
  message: DivergingBarsMessage,
}).make({
  init: () => ({ width: 0, hoverIndex: null }),
  update: {
    ChangedWidth: ($, { width }) => $.evolve({ width }),
    MovedPointer: ($, { x }) =>
      $.evolve({ hoverIndex: nearestIndex($.props, $.model.width, x) }),
    LeftPlot: ($) => $.evolve({ hoverIndex: null }),
  },
  view: (h, model) => Chart(h, h.props, model),
});
```

- **Props** are what the section passes in; **Model** is what only the chart knows (its width, the hovered point, hidden legend entries).
  Mirror the React `useState` calls in the Model, and the React props in the props Schema.
- **Messages** are facts in the past tense, named the way `@effect/ui` names them (`MovedPointer`, `ToggledLegendItem`, `ChangedWidth`), never instructions (`SetHover`); see "Naming" in `@effect/ui`'s `AGENTS.md`.
- Derive everything else in `view` from props and Model, as the React component derives it on every render.
  Effect UI has no `useMemo`: wrap expensive, rarely changing subtrees (the marks of a dense series, a "View data" table) in `h.lazy(fn, firstArg, ...args)`, which rebuilds only when an argument changes by `===`.
  Keep hover-dependent drawing (crosshair, hover card) outside those lazy subtrees.
- **Give every `h.lazy` call in one component instance its own first argument.**
  The runtime caches one node per first argument and gives it to the first call that uses that argument in a render; a later call in the same render with the same first argument (the same `listedContributors` for a table and a chart, say) is built afresh on every render.
  When two subtrees are built from the same data, lead one with a constant such as `h.lazy(Bars, "bars", rows, filter)`.
  Make sure each argument keeps its identity across renders: compute derived arrays once per input, never fresh in `view`.
  `cachedBy` in `report-sections/shared/cached-by.ts` caches a function of `data` in a module-level `WeakMap`, as `historyOf`, `monthlyRowsOf` and `commitKindsOf` do.
- Props equality is shallow with a reference check first, so pass the same arrays on every render where possible (from `data`, or from a lazy builder) and keep large derived arrays out of props.
- Data that is the same everywhere, such as `data`, travels as a prop typed with `DashboardDataSchema`.
- The section calls the chart with its props and maps its events, if it has any, to its own messages:
  `DivergingBars(h, { props: { points, … } })`.
  Give a chart a `key` only when its section renders two of them, or to restart it (the calendar is re-keyed on its range, as the React one is remounted).

### Drawing SVG

There is no visx: `@visx/*` are React components.
SVG tags are builders on `h` like HTML ones: `h.svg`, `h.g`, `h.path`, `h.rect`, `h.line`, `h.defs`, `h.pattern`, and `h.svgText` for `<text>`.
Attribute values are strings with their SVG names (`stroke-width`, `viewBox`):

```ts
h.svg
  .attrs({ width: String(width), height: String(height) })
  .children(
    h.g
      .attr("transform", `translate(${margin.left},${margin.top})`)
      .children(
        bars.map((bar) =>
          h.path.key(bar.id).attrs({ d: barPath(bar), fill: bar.color }),
        ),
      ),
  );
```

For scales and shapes, use what visx wraps: `d3-scale` and `d3-shape` (curves, stacks), with their `@types/*`, are already devDependencies at the versions visx pins (with a temporary `knip.config.ts` exception until a chart imports them).
Re-implement visx's axis and grid as plain view functions over the scale's `ticks()`, copying the React chart's tick props (font size, color, anchor) into SVG attributes.
`useId()` (for `<pattern>` and `<clipPath>` ids) becomes `h.id("hatch")`, unique per instance.

### Measuring width

`shared/measure-width.ts` replaces `useMeasuredWidth`: a stream mount that reports the element's content width now and on every resize.

```ts
h.div
  .class("relative")
  .onMount(
    MeasureWidth().pipe(
      Mount.map((width) => ChartMessage.ChangedWidth({ width })),
    ),
  )
  .children(model.width > 0 && Plot(h, h.props, model));
```

An element takes one mount, so measure the container and track the pointer on another element.

### Hover, crosshair and hover cards

Effect UI elements don't hear `mousemove`, so `shared/track-pointer.ts` stands in for the React charts' `onMouseMove` / `onMouseLeave` pair: put it on the transparent hover `<rect>` over the plot area, and it reports the pointer relative to that rect, or `undefined` once it leaves.

```ts
h.rect
  .attrs({
    width: String(innerWidth),
    height: String(innerHeight),
    fill: "transparent",
  })
  .onMount(
    TrackPointer().pipe(
      Mount.map((position) =>
        position === undefined
          ? ChartMessage.LeftPlot()
          : ChartMessage.MovedPointer({ x: position.x }),
      ),
    ),
  );
```

Keep only what the view needs in the Model — the hovered index, not the raw position.
Elements whose own hover is all CSS (`hover:` classes) need nothing at all, as in `bar-list.ts`.

Each pointer move is a message and a render of the chart's view.
That is cheap when the marks are in `h.lazy` and only the crosshair and the hover card change, and when `update` returns the Model unchanged for a move that keeps the same hovered index.
If a chart still lags, coalesce the moves: keep the last position in the mount and report it at most once per animation frame (a `requestAnimationFrame` in `TrackPointer`'s listener, or a variant of it), as browsers deliver `mousemove` far more often than they paint.

The crosshair (`shared/crosshair-line.ts`, ported) and the hover card are plain elements next to the `<svg>`, positioned with inline styles from the Model, exactly as in React; port the chart's hover card as a view function too.
Keep the crosshair's `will-change-transform` overlay: the reason it exists (repainting the marks under it) holds in any framework.

`mouseenter` / `mouseleave` do exist as element events (with the pointer's viewport position), which is enough for per-cell hover such as the calendar's.

### Tooltips

- **A tooltip on one trigger** (a link, a button, a legend item) uses `Tooltip` from `shared/@ui-primitive/tooltip.ts`: a component that owns its open state, takes the trigger's and the card's content as slots, and draws the React dashboard's card and arrow.
  See `report-header.ts`.
- **A tooltip that follows the hovered mark** (the calendar's day cells) is controlled by the chart: keep `open` and the hovered item in the chart's Model, give the hovered element an `id`, and call `@effect/ui-kit`'s `Tooltip` directly with `props: { open, anchor: thatId, … }` and its `RequestedOpen` / `RequestedClose` events mapped to the chart's messages.
  Draw its positioner and popup with `TooltipContent(h, tooltip, content, { arrow: false })` from `tooltip.ts`, the counterpart of the React `TooltipContent` (`activity-calendar.tsx` passes `arrow={false}`); React's `anchor` is the ui-kit Tooltip's own `anchor` prop here.
- `@effect/ui-kit` places popups in the top layer as manual popovers, not in a portal: a popup inherits text styles from where it is written.
  Give every positioner and backdrop `topLayerReset` from `shared/@ui-primitive/shared/top-layer-reset.ts`, which undoes the browser's popover box and the inherited styles a portal on `<body>` would not carry.
- The native `title` attribute stays a native `title`, as in React (`bar-list.ts`, disabled segmented options).

### Controls and other primitives

| React (`../dashboard/src/app/shared`)      | Effect UI (`src/app/shared`)                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `@ui-primitive/tooltip.tsx` (Base UI)      | `@ui-primitive/tooltip.ts` on ui-kit `Tooltip`                                                               |
| `@ui-primitive/select.tsx` (Base UI)       | `@ui-primitive/select.ts` (markup) on ui-kit `Select`; `report-sections/history-range-select.ts` owns `open` |
| `@ui-primitive/toggle-group.tsx` (Base UI) | `@ui-primitive/toggle-group.ts` (markup) on ui-kit `ToggleGroup`                                             |
| `@ui-primitive/scroll-area.tsx` (Base UI)  | not ported: use ui-kit `ScrollArea` with the React classes when the calendar needs it                        |
| `segmented-control.tsx`                    | `segmented-control.ts` (`SegmentedControl`, `PercentControl`)                                                |
| `contributor-kinds.tsx`                    | `contributor-kinds.ts`, in full                                                                              |
| `primitives.tsx`                           | `primitives.ts`, in full; `Legend` items with toggles are `Tooltip` children keyed by label                  |
| `crosshair-line.tsx`                       | `crosshair-line.ts`, taking the x scale as a plain function                                                  |
| `stale-overlay.tsx`                        | not needed: Effect UI renders synchronously, so there is no stale render to dim                              |
| `lucide-react` icons                       | `icons.ts`, the icon paths copied with lucide-react's attributes                                             |
| `use-measure.ts`                           | `measure-width.ts`                                                                                           |

ui-kit components are headless and mostly controlled: the consumer owns `open` and `value` and maps their `Requested*` / `Picked` / `Toggled` events to its own messages.
Draw each part with the classes and `data-slot` attributes the React primitive renders.
A component that owns nothing but an open state the caller never needs (a select's popup, a tooltip) wraps the ui-kit component once, as `HistoryRangeSelect` and `Tooltip` do.
Several headless children in one component need distinct `key`s.

### Testing

Tests sit next to what they test, as `*.test.ts`, and run with the rest of the repo's in `pnpm test` (Vitest, with `it.effect` from `@effect/vitest`).

- **Logic** goes in a `Story` from `@effect/ui/testing`: `Story.make(Component, props)` runs `init`, `s.send(message)` runs `update`, and `s.model`, `s.subscriptions` (by key) and `s.emitted(event)` say what happened.
  Nothing runs: no host, no Subscriptions, no Commands, and no DOM is needed.
  The test fails at the end if an event was emitted that it didn't acknowledge with `s.emitted`, so a story that sends messages and acknowledges nothing proves that none emitted.
  See `history-range-select.test.ts`, `report-sections.test.ts` and `commits-per-month-section.test.ts`.
- **What the view shows** for a message goes in a `Scene`: `commits-per-month-section.scene.test.ts` checks that the kind filter presses the option picked.
  A scene runs only the component under test, so a click on a ui-kit child (a toggle group's button) does nothing there: stand in for the child with `s.childEmit(ToggleGroup, key, event)`, or use an `HtmlPlay` to run the whole tree.
- **What the user sees and does** goes in an `HtmlScene` from `@effect/ui/html/testing` (clicks, typing, locators, `expectMount`), and **mounts and other DOM code** in a real `BrowserHost.mountEffect` under `// @vitest-environment happy-dom` with `it.live` (see `measure-width.test.ts`, `track-pointer.test.ts` and `frame-ticks.test.ts`).
  happy-dom lays nothing out: stub what the browser would measure.
- Build test data with `dashboardDataOf()` from `shared/dashboard-data-fixture.ts`, overriding what the section under test needs.
- Pure helpers get plain `test(...)` from Vitest, as in the React dashboard.

### Replacing a placeholder

1.  Port the chart into its own file under `src/app/`, with its helpers in a folder of the same name, and copy the pure helpers it needs from `../dashboard` verbatim (with their tests).
1.  In the section file, replace the one `ChartPlaceholder(h, …)` call with the chart, using the comment above it as the checklist of what to pass.
    Where the section already derives the chart's data (`commitsChartsOf`, `dependenciesChartOf`), pass that; derive the rest the same way, with `cachedBy`, rather than in `view`.
1.  Leave `knip.config.ts`, this README's checklist and `report-sections.ts` alone, even where the port makes an exception or a line stale: the parallel ports would all edit the same lines.
    The last PR of the series prunes the knip exceptions and ticks the checklist.
1.  Compare with the React dashboard side by side on the same `dashboard.json`, at the same viewport, including hover states and keyboard use.

Adding a new section to the report is the same in reverse: write `report-sections/<name>-section.ts` exporting `<name>SectionOf(data)`, and call it from `reportSectionsOf` in `report-sections.ts`, in the React dashboard's order.

## Port checklist

Ported:

- `main.tsx`, `app.tsx` → `main.ts`, `app.ts` (data loading, loading and error states, stat tiles)
- `data.ts` (types copied; the loader is the `LoadDashboardData` query)
- `app/report-header.tsx`
- `app/report-sections.tsx` (page structure, every section with its title, subtitle and annotation; every section's controls and "View data" table except those of "Lines of code" and "Number of files", which come with `SurvivalTimeline`)
- `app/report-sections/history-range-select.tsx`, `app/report-sections/contributors-in-range.ts`
- `app/bar-list.tsx`
- `app/shared/primitives.tsx`, `markdown.tsx`, `segmented-control.tsx`, `contributor-kinds.tsx`, `crosshair-line.tsx`, `use-measure.ts`
- `app/shared/@ui-primitive/tooltip.tsx`, `select.tsx`, `toggle-group.tsx`
- `app/shared/format.ts`, `history-range.ts`, `stacked-series.ts`, `bar-path.ts`, `time-axis.ts`, `category-colors.ts` (with its test), `survival-colors.tsx` (copied)

Everything shared between charts is in place, most of it ahead of its first user (see the `knip.config.ts` exceptions), so the follow-up PRs a, b and c touch no file outside their own charts and section files — not `knip.config.ts`, and not this checklist, which the series' last PR updates.

Still placeholders, by follow-up PR (a, b and c run in parallel; d follows a):

- [ ] **a:** `app/time-stack-chart.tsx` — the commits per month, direct dependencies, dependencies and loose ends section files
- [ ] **b:** `app/activity-calendar.tsx` (with ui-kit's `ScrollArea` for `@ui-primitive/scroll-area.tsx`) and `app/diverging-bars.tsx` — the commit calendar and churn per month section files
- [ ] **c:** `app/contributor-bars.tsx` — the contributors section file
- [ ] **d:** `app/survival-timeline.tsx` (on a's `time-stack-chart.ts`), then `app/lines-timeline.ts` and `app/files-timeline.ts` (headings ported) — the lines of code and number of files sections, with their controls and "View data" tables

## Deviations from the React dashboard

- **No fragments.**
  A view, and a headless component's view closure, returns one node.
  `ReportSections` wraps the sections in a `<div>` (their margins collapse through it, so the layout is unchanged), and each tooltip wraps its trigger and card in a `<span>`.
- **The reveal runs on its own clock.**
  React reveals a section per commit inside a transition; here a Subscription advances a counter on each animation frame, or on each turn of a `MessageChannel` task loop while the tab is hidden.
- **Synchronous re-renders.**
  React defers heavy re-renders (`useDeferredValue`) and dims the stale chart (`StaleOverlay`); Effect UI has no concurrent rendering, so expensive subtrees are memoized with `h.lazy` instead and nothing is ever stale.
- **Tooltip triggers.**
  ui-kit's trigger part takes only `<button>` and `<a href>`, so the header's link-less dates are buttons styled like the React `<span tabIndex={0}>`.
- **Tooltip positioners are `<div>`s.**
  ui-kit's positioner and popup parts take only `<div>`, so a tooltip written inside a paragraph (the header's) puts a `<div>` inside a `<p>`.
  The page builds its DOM directly rather than parsing HTML, so nothing moves, and the positioner is hidden or in the top layer.
- **Tooltip exit.**
  The card fades and scales in through `@starting-style`, but closes at once: ui-kit's Tooltip hides its popover as soon as `open` turns false and has no `holdExit` for an exit transition.
- **Popover placement.**
  ui-kit writes the tooltip and select positioners next to their triggers in the top layer instead of in a portal on `<body>`; `topLayerReset` undoes what they would inherit there.
- **Select highlight.**
  The highlighted option follows the pointer from option to option, as Base UI's does, but ui-kit highlights an option only as the pointer enters it.
  With the pointer resting on an option, ArrowDown moves the highlight to the next one and leaves it there while the pointer moves within the first; Base UI keeps the highlight on the option under the pointer.
