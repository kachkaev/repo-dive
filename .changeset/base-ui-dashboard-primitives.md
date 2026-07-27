---
"repo-dive": patch
---

Rebuild the dashboard's controls on shadcn-style Base UI primitives.
The commit-calendar range dropdown, the "Shade by year written" checkboxes and the contributor-kind filter chips now use canonical shadcn components (select, checkbox, label, toggle group) backed by `@base-ui/react`, so they are keyboard-accessible, consistently styled in both themes and ready to be reused by future controls.
The commit calendar scrolls inside a shadcn scroll area with a slim themed scrollbar instead of the chunky native one (most visible on Windows).
The primitives live in `dashboard/src/app/shared/@ui-primitive/` and pick up their colors from the existing palette via shadcn-style semantic tokens, so no visual re-theming is required.
Interaction cues are tidied up along the way: the pointer cursor is reserved for links, and non-interactive elements (like the contributor bars) no longer light up on hover.
