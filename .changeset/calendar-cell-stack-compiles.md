---
"repo-dive": patch
---

Fix the commit-calendar cell stacks bailing out of React Compiler, restoring their build-time memoization.
The stacked rects are now assembled with a plain loop instead of reassigning a captured offset inside a `.map()` callback, which the compiler rejects — the calendar renders identically but its cells no longer re-render unmemoized.
