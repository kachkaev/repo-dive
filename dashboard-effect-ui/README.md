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
    │   ├── contributors-in-range.ts (+ test, copied)
    │   └── shared/                 # what several sections share: ReportSection, ranges, monthly buckets, decimate
    ├── bar-list.ts                 # ported — the reference chart
    ├── lines-timeline.ts           # placeholder around SurvivalTimeline
    ├── files-timeline.ts           # placeholder around SurvivalTimeline
    └── shared/
        ├── @ui-primitive/          # tooltip, select, toggle-group: ui-kit parts with the shadcn classes
        ├── primitives.ts           # Section, SectionSkeleton, StatTile, DataTable
        ├── markdown.ts, icons.ts, format.ts, history-range.ts, stacked-series.ts, …
        ├── measure-width.ts        # MeasureWidth mount (the React useMeasuredWidth)
        ├── track-pointer.ts        # TrackPointer mount (the React charts' onMouseMove)
        └── chart-placeholder.ts    # TEMPORARY, deleted with the last placeholder
```

A chart port adds its file where the React one lives (`app/time-stack-chart.ts`, `app/activity-calendar.ts`, …), with any helpers it alone needs in a folder of the same name, and replaces one placeholder in its section file.

## How the app is put together

- `main.ts` mounts `App` with `BrowserHost.mount` and provides no Layers.
- `App` declares the `LoadDashboardData` query (in `data.ts`) and renders `AsyncResult.match` over it: nothing while it loads, the error page on failure, the report on success.
  The query reads the inlined `window.__REPO_DIVE_DATA__` of a `repo-dive report` export, or fetches `./dashboard.json`.
  `DashboardDataSchema` declares the shape rather than validating it, as the React app casts it.
- `ReportSections` lists every section in reading order (`reportSectionsOf`) and reveals one per animation frame, showing the next section's heading over a spinner meanwhile, like the React `RevealSequentially`.
- Each section lives in `report-sections/<name>-section.ts` and exports one `<name>SectionOf(data)` that returns a `ReportSection` (or `undefined` when the repo has nothing for it):
  - `skeleton`: the heading the reveal shows before the section arrives.
  - `view`: draws the section — a `Section(h, …)` view for stateless sections, or the section's own component when it has controls.
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

For scales and shapes, use what visx wraps — `d3-scale`, `d3-shape` (curves, stacks) — added as devDependencies by the first chart port that needs them; it is already in the lockfile through visx, at the same versions.
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

The crosshair (`shared/crosshair-line.tsx`) and the hover card are plain elements next to the `<svg>`, positioned with inline styles from the Model, exactly as in React; port them as view functions.
Keep the crosshair's `will-change-transform` overlay: the reason it exists (repainting the marks under it) holds in any framework.

`mouseenter` / `mouseleave` do exist as element events (with the pointer's viewport position), which is enough for per-cell hover such as the calendar's.

### Tooltips

- **A tooltip on one trigger** (a link, a button, a legend item) uses `Tooltip` from `shared/@ui-primitive/tooltip.ts`: a component that owns its open state, takes the trigger's and the card's content as slots, and draws the React dashboard's card and arrow.
  See `report-header.ts`.
- **A tooltip that follows the hovered mark** (the calendar's day cells) is controlled by the chart: keep `open` and the hovered item in the chart's Model, give the hovered element an `id`, and call `@effect/ui-kit`'s `Tooltip` directly with `props: { open, anchor: thatId, … }` and its `RequestedOpen` / `RequestedClose` events mapped to the chart's messages.
  Draw its positioner and popup with the same markup as `TooltipContent` in `tooltip.ts`; export that function when the first chart needs it.
- `@effect/ui-kit` places popups in the top layer as manual popovers, not in a portal: a popup inherits text styles from where it is written, so reset any that the React portal would not carry (see `TooltipContent`).
- The native `title` attribute stays a native `title`, as in React (`bar-list.ts`, disabled segmented options).

### Controls and other primitives

| React (`../dashboard/src/app/shared`)         | Effect UI (`src/app/shared`)                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `@ui-primitive/tooltip.tsx` (Base UI)         | `@ui-primitive/tooltip.ts` on ui-kit `Tooltip`                                                               |
| `@ui-primitive/select.tsx` (Base UI)          | `@ui-primitive/select.ts` (markup) on ui-kit `Select`; `report-sections/history-range-select.ts` owns `open` |
| `@ui-primitive/toggle-group.tsx` (Base UI)    | `@ui-primitive/toggle-group.ts` (markup) on ui-kit `ToggleGroup`                                             |
| `@ui-primitive/scroll-area.tsx` (Base UI)     | not ported: use ui-kit `ScrollArea` with the React classes when the calendar needs it                        |
| `segmented-control.tsx`                       | `segmented-control.ts` (`SegmentedControl`, `PercentControl`)                                                |
| `contributor-kinds.tsx` (`KindFilterControl`) | `contributor-kinds.ts`                                                                                       |
| `primitives.tsx` (`Section`, `DataTable`, …)  | `primitives.ts`; `Legend`, `Swatch` and `DateStamp` are not ported yet                                       |
| `stale-overlay.tsx`                           | not needed: Effect UI renders synchronously, so there is no stale render to dim                              |
| `lucide-react` icons                          | `icons.ts`, the icon paths copied with lucide-react's attributes                                             |
| `use-measure.ts`                              | `measure-width.ts`                                                                                           |

ui-kit components are headless and mostly controlled: the consumer owns `open` and `value` and maps their `Requested*` / `Picked` / `Toggled` events to its own messages.
Draw each part with the classes and `data-slot` attributes the React primitive renders.
A component that owns nothing but an open state the caller never needs (a select's popup, a tooltip) wraps the ui-kit component once, as `HistoryRangeSelect` and `Tooltip` do.
Several headless children in one component need distinct `key`s.

### Replacing a placeholder

1.  Port the chart into its own file under `src/app/`, with its helpers in a folder of the same name, and copy the pure helpers it needs from `../dashboard` verbatim (with their tests).
1.  In the section file, replace the one `ChartPlaceholder(h, …)` call with the chart, using the comment above it as the checklist of what to pass.
1.  Delete the chart's line from [the checklist](#port-checklist) below, and drop the `knip.config.ts` exceptions that the port makes unnecessary.
1.  Compare with the React dashboard side by side on the same `dashboard.json`, at the same viewport, including hover states and keyboard use.

Adding a new section to the report is the same in reverse: write `report-sections/<name>-section.ts` exporting `<name>SectionOf(data)`, and call it from `reportSectionsOf` in `report-sections.ts`, in the React dashboard's order.

## Port checklist

Ported:

- `main.tsx`, `app.tsx` → `main.ts`, `app.ts` (data loading, loading and error states, stat tiles)
- `data.ts` (types copied; the loader is the `LoadDashboardData` query)
- `app/report-header.tsx`
- `app/report-sections.tsx` (page structure, every section with its title, subtitle, annotation, controls and "View data" table)
- `app/report-sections/history-range-select.tsx`, `app/report-sections/contributors-in-range.ts`
- `app/bar-list.tsx`
- `app/shared/primitives.tsx` (`Section`, `SectionSkeleton`, `StatTile`, `DataTable`), `markdown.tsx`, `segmented-control.tsx`, `use-measure.ts`
- `app/shared/contributor-kinds.tsx` (`KindFilterControl`, `kindColors`, `kindBadge`)
- `app/shared/@ui-primitive/tooltip.tsx`, `select.tsx`, `toggle-group.tsx`
- `app/shared/format.ts`, `history-range.ts`, `stacked-series.ts` (copied)

Still placeholders, in the order of the follow-up PRs:

- [ ] `app/time-stack-chart.tsx` — commits per month, direct dependencies, dependencies, loose ends (with `shared/crosshair-line.tsx`, `shared/time-axis.ts`, `shared/bar-path.ts`, `Legend` and `Swatch` from `primitives.tsx`, `DateStamp`)
- [ ] `app/lines-timeline.tsx`, `app/files-timeline.tsx` — headings ported, the chart is `SurvivalTimeline`
- [ ] `app/activity-calendar.tsx` — commit calendar (with `@ui-primitive/scroll-area.tsx`)
- [ ] `app/diverging-bars.tsx` — churn per month
- [ ] `app/survival-timeline.tsx` — lines of code, number of files (with `shared/survival-colors.tsx`, `shared/category-colors.ts`)
- [ ] `app/contributor-bars.tsx` — contributors (with the rest of `shared/contributor-kinds.tsx`)

## Deviations from the React dashboard

- **No fragments.**
  A view, and a headless component's view closure, returns one node.
  `ReportSections` wraps the sections in a `<div>` (their margins collapse through it, so the layout is unchanged), and each tooltip wraps its trigger and card in a `<span>`.
- **The reveal runs on animation frames.**
  React reveals a section per commit inside a transition; here a Subscription advances a counter on each animation frame, so a tab opened in the background reveals the rest when it is shown.
- **Synchronous re-renders.**
  React defers heavy re-renders (`useDeferredValue`) and dims the stale chart (`StaleOverlay`); Effect UI has no concurrent rendering, so expensive subtrees are memoized with `h.lazy` instead and nothing is ever stale.
- **Tooltip triggers.**
  ui-kit's trigger part takes only `<button>` and `<a href>`, so the header's link-less dates are buttons styled like the React `<span tabIndex={0}>`.
- **Tooltip exit.**
  The card fades and scales in through `@starting-style`, but closes at once: ui-kit's Tooltip hides its popover as soon as `open` turns false and has no `holdExit` for an exit transition.
- **Popover placement.**
  ui-kit writes the tooltip and select positioners next to their triggers in the top layer instead of in a portal on `<body>`; the popups reset inherited text styles to match.
