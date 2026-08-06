---
name: editing-react
description: Conventions for editing the dashboard's React code (dashboard/src). The Vite build runs React Compiler, so components must NOT add manual useMemo, useCallback, or React.memo. Use when editing or reviewing dashboard components, hooks, or the visx charts.
---

# Editing React code (the dashboard)

The dashboard (`dashboard/src`) is the only React in this repo.
Its Vite build runs **React Compiler** — wired in [`dashboard/vite.config.ts`](../../../dashboard/vite.config.ts) via `reactCompilerPreset()` — so the compiler auto-memoizes every component and hook at build time.

## Don't add manual memoization

**Do not write `useMemo`, `useCallback`, or `React.memo`.**
The compiler already memoizes derived values, callbacks, and JSX elements on their reactive inputs — manual memoization is redundant noise, and hand-written dependency arrays drift out of sync and can fight the compiler.

Write derived values as plain expressions or statements in the component body:

```tsx
// ✅ compiler memoizes this on `points` / `seriesKeys`
const rows = points.map((point) => shapeRow(point, seriesKeys));

// ❌ don't — the compiler already does exactly this
const rows = useMemo(() => points.map(...), [points, seriesKeys]);
```

For a value that needs a guard, use a ternary (a component body can't hold a bare early `return` mid-way), or lift the branch into the JSX:

```tsx
const chart = data.length === 0 ? undefined : buildChart(data);
```

`useState`, `useEffect`, `useRef`, and the custom hooks in [`dashboard/src/app/shared`](../../../dashboard/src/app/shared) are still used normally — only the _memoization_ hooks are unnecessary.

## Why this matters for the charts

The charts ([`time-stack-chart.tsx`](../../../dashboard/src/app/time-stack-chart.tsx), [`diverging-bars.tsx`](../../../dashboard/src/app/diverging-bars.tsx)) track hover state that updates on every `mousemove`.
Each update re-renders the component, and the compiler makes that re-render cheap by memoizing the derived data and scales on their inputs.
Adding a `useMemo` back doesn't help — the compiler already does it.
But memoizing the _data_ is not enough to stop the expensive area/bar shapes from reconciling on every hover; that needed a structural split (see the last section).
Both are load-bearing.

## Keep components compilable

The compiler only optimizes code that follows the Rules of React.
Keep render pure: no mutating props or state during render, no reading/writing refs during render, call hooks unconditionally at the top level.
If a specific component ever genuinely must opt out, add the `"use no memo"` directive as its first statement — but that should be rare and comes with a comment explaining why.

## Patterns that silently bail the compiler

`panicThreshold` defaults to `"none"`, so when the compiler can't handle a component it **skips it silently** — the build still passes, but that component gets no memoization at all (and with its `useMemo`s already removed, it ends up _slower_ than before).
React Compiler 1.0 bails on these; avoid them:

- **A default value inside a typed destructured parameter** — `function C({ color = "red" }: { color?: string })`. Destructure without the default and resolve it in the body: `const c = color ?? "red";`.
- **Logical-assignment operators** `??=`, `||=`, `&&=` — use a plain assignment: `obj[k] = obj[k] ?? {}` instead of `obj[k] ??= {}`.
- **A logical expression (`??`, `&&`, `||`) inside a ternary's test** — hoist it into a named `const` first.

The compiler runs in the **production build** (`vite build`, what the `repo-dive dashboard` CLI serves), **not** the Vite dev server.
To check what actually compiled, temporarily pass a logger and rebuild:

```ts
babel({
  presets: [
    reactCompilerPreset({
      logger: {
        logEvent(file, e) {
          console.log(e.kind, e.fnName);
        },
      },
    }),
  ],
});
```

Every component should log `CompileSuccess`; a `CompileError` marks a bail.

## `CompileSuccess` is not enough: fused memo scopes

A component can compile cleanly and still recompute everything on every hover, because the compiler **fuses** values into one memo scope whose deps include the frequently-changing state.
This made `TimeSeriesChart` re-render all its marks on every mouse move (~30 ms/frame) while logging `CompileSuccess` — three separate causes, all real:

- **Calling a method on an opaque object with hover-scoped code nearby** — `bisectDate.center(rows, hoverMs)`, `xScale(crosshairMs)`.
  The compiler cannot see into d3, so the call "may mutate" `rows`/`xScale`, extending their mutable ranges into hover-reactive code; overlapping ranges merge scopes, so `rows` lands in a scope keyed on `hoverMs`.
  Fix: inline the logic as plain reads (hand-rolled binary search instead of d3's bisector), or move the call into a child component (`CrosshairLine`, `HoverTooltip`) where it runs on a frozen prop.
- **A mid-body early return** — `if (rows.length === 0) return <p>…</p>;` after derivation forces one merged scope (`react.early_return_sentinel`) around everything it spans.
  Guard at the top of the component, right after the hooks, before any derived values.
- **Unknown array methods** — `rows.at(-1)` counts as a potential mutation of `rows`; use `rows[rows.length - 1]` (with a `unicorn/prefer-at` disable) where the array must stay out of hotter scopes.

To diagnose, build with `minify: false`, find the component in `dist/dashboard/assets/index-*.js`, and read the `if ($[n] !== …)` guard above the value: if `hoverMs` (or similar hot state) is in that dep list, the scope is fused.
Verify fixes empirically — a temporary `useEffect` render counter on the marks component plus dispatched `mousemove` events shows whether the element is actually reused.

## Isolating a subtree that must not re-render on hover/interaction

Memoizing a component's _data_ does not stop its expensive DOM from re-rendering when the component re-renders for unrelated state.
The compiler skips re-rendering a child **element** only when that element's props don't depend on the changing state.
So when an expensive subtree (the stacked areas/bars) lives in the same parent as something that changes constantly (the hover crosshair), the whole parent — shapes included — rebuilds on every mouse move.

The fix is structural: pull the static marks into their own component whose props are all hover-independent.
The compiler then memoizes that element, and moving the cursor (which only touches the crosshair/tooltip) reuses it so React skips the shapes.
This is exactly what [`ChartMarks`](../../../dashboard/src/app/time-stack-chart.tsx) does — keep hover state (`hoverMs`, crosshair, tooltip) out of its props.
