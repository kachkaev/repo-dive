---
"repo-dive": patch
---

Rebuild the dashboard's controls on shadcn-style Base UI primitives.
The commit-calendar range dropdown, the "Shade by year written" checkboxes and the contributor-kind filter chips now use canonical shadcn components (select, checkbox, label, toggle group) backed by `@base-ui/react`, so they are keyboard-accessible, consistently styled in both themes and ready to be reused by future controls.
The primitives live in `dashboard/src/app/shared/@ui-primitive/` and pick up their colors from the existing palette via shadcn-style semantic tokens, so no visual re-theming is required.
