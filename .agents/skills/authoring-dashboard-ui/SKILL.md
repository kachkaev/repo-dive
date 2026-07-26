---
name: authoring-dashboard-ui
description: How to build dashboard UI (dashboard/src) — reuse the @ui-primitive shadcn components on Base UI, style through the semantic tokens in styles.css, and follow the repo's interaction conventions. Use when adding or restyling dashboard controls, popups, or layout, and especially when adding a new shadcn/Base UI primitive.
---

# Authoring dashboard UI

The dashboard's interactive controls are canonical [shadcn](https://ui.shadcn.com) components built on `@base-ui/react`, living in [`dashboard/src/app/shared/@ui-primitive/`](../../../dashboard/src/app/shared/@ui-primitive).
Reuse them (and the layout primitives) before hand-rolling anything; extend the set by porting more shadcn components the same way (see below).
React-compiler rules live in [editing-react](../editing-react/SKILL.md); file placement in [fractal-tree-file-structure](../fractal-tree-file-structure/SKILL.md).

## What already exists

- `@ui-primitive/`: `select` (Select/SelectTrigger/SelectValue/SelectContent/SelectItem), `checkbox`, `label`, `toggle-group` (ToggleGroup/ToggleGroupItem, with `toggleVariants` folded in), `scroll-area` (both scrollbars built in — never use raw `overflow-*-auto` for scrollable dashboard content), and `shared/cn.ts` (`cn`, `PropsWithPlainClassName`).
- [`primitives.tsx`](../../../dashboard/src/app/shared/primitives.tsx): `Section`, `StatTile`, `Swatch`, `Legend`, `DataTable`.
- Charts: `time-stack-chart` (area/bar/line + `#`/`%` toggle), `diverging-bars`, `bar-list`, `activity-calendar`.

## Semantic color tokens

`styles.css` maps shadcn token names onto the dashboard palette in an `@theme inline` block, so shadcn class names work verbatim and both themes come for free (`prefers-color-scheme` flips the underlying palette vars):

| Token classes                                             | Backed by          |
| --------------------------------------------------------- | ------------------ |
| `background` / `popover`                                  | `--surface-1`      |
| `muted` / `accent`                                        | `--surface-2`      |
| `foreground` / `popover-foreground` / `accent-foreground` | `--text-primary`   |
| `muted-foreground`                                        | `--text-muted`     |
| `border` / `input`                                        | `--grid-line`      |
| `primary` / `ring`                                        | `--series-1`       |
| `primary-foreground`                                      | white, both themes |

Prefer these over raw `-(--var)` arbitrary values in new UI code; chart marks keep using the palette vars (`--series-*`, `--kind-*`) directly.
**Pitfall:** Tailwind v4's bare `border` colors with `currentColor`, not gray — always pair it with a color (`border-border`, `border-input`).

## Porting a new shadcn primitive

Fetch the canonical Base UI variant instead of writing from scratch:

```bash
COMPONENT=tooltip # the shadcn component to port
gh api "repos/shadcn-ui/ui/contents/apps/v4/registry/bases/base/ui/$COMPONENT.tsx" --jq '.content' | base64 -d
```

Then adapt — every deviation goes in the file's header comment:

- Drop `"use client"` (Vite SPA, no React Server Components); imports are relative with extensions; icons come from `lucide-react` (replace `IconPlaceholder`).
- The `cn-*` utility classes rely on a shadcn stylesheet this repo does not ship; restyle with the classic new-york Tailwind classes on the semantic tokens above.
- Translate Radix state attributes to Base UI's: `data-[state=checked]` → `data-checked`, plus `data-highlighted`, `data-pressed`, `data-disabled`, `data-[starting-style]`/`data-[ending-style]`.
- No default values inside typed destructured parameters (silent React Compiler bail) — resolve with `??` in the body.
- Wrap prop types in `PropsWithPlainClassName<…>`: Base UI's `className` also accepts a state callback, which `cn` does not.
- Spell optional props `foo?: X | undefined` (`exactOptionalPropertyTypes` is on).
- Export only the parts the dashboard uses (knip fails otherwise) and fold single-use helpers into the consumer file, e.g. `toggleVariants` lives in `toggle-group.tsx` until a standalone `Toggle` is needed.
- Base UI is unstyled and positions nothing: absolutely position popups/scrollbars yourself and size scroll thumbs with `--scroll-area-thumb-width`/`-height` (see `scroll-area.tsx`).

API notes that differ from Radix: `Select` takes `items` (value→label) so `SelectValue` renders labels; `onValueChange` may pass `null` (cleared); `ToggleGroup` deals in string arrays even single-select — ignore the empty array to keep one item always pressed; `Checkbox.onCheckedChange` passes a plain boolean.

## Interaction conventions

- `cursor-pointer` is for links only (pointer = "ctrl+click opens a tab"); buttons, toggles and summaries keep the default cursor.
- Hover states only on elements that respond to a click; a subtle text/underline shift is enough — never add hover feedback to static content (bars, tiles, legends).
- `cn` merges only same-modifier classes, and a variant like `data-[size=sm]:h-8` carries class+attribute specificity that beats any bare utility passed via `className` — override inside the same modifier or not at all.

## Verifying

`pnpm build:dashboard` runs React Compiler (production build only — the dev server does not); if a component misbehaves, check for a silent bail with the logger recipe in [editing-react](../editing-react/SKILL.md).
To eyeball changes, serve a built dashboard against any indexed repo (`node dist/cli.js dashboard --repo <path>`), or copy a `dashboard.json` into `dashboard/public/` and run `pnpm dev:dashboard`.
