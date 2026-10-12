---
"repo-dive": minor
---

Count `oxlint-disable` comments alongside `eslint-disable` ones.
`oxlint-disable`, `oxlint-disable-next-line`, `oxlint-disable-line` and `oxlint-enable` are now tallied alongside their `eslint-` counterparts, and the dashboard's "Loose ends" chart gains an "oxlint disables" line wherever a repo has any.
The `directives.eslint` metric is now `directives.lint` with a `linter` category (`eslint` or `oxlint`), and `directives.eslintBlockCoveredLines` is now `directives.lintBlockCoveredLines`; update any `query` that names them.
The next `scan` re-collects directives across the whole history to pick up oxlint comments.
