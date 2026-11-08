---
"repo-dive": minor
---

Give the language, purpose and contributor splits their own colors, so switching the split no longer leaves the top band the same blue.
Languages now wear fixed colors based on GitHub's language colors (TypeScript blue, JavaScript yellow, Go cyan…), the same in every report.
Purposes have their own fixed set (Production wine, Tests green, Docs lavender…), and humans are now teal on every chart, with the top contributor in the human color.
`contributors.maxInCharts` now defaults to `8` instead of `10`.
The year shading fades the oldest years less, and folds years older than seven into a single band.
