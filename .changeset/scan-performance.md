---
"repo-insighter": patch
---

Large-repo scan performance: log-strategy collectors (commit-meta, churn) batch the whole history into one `git log` pass, and content-scanning collectors (directives, todo-comments) cache results per blob (`git cat-file --batch` + SQLite blob cache + in-process memo) so only never-seen file contents are scanned. Survival sampling defaults to quarterly, and `engines.node` honestly reflects the `node:sqlite` floor (≥ 22.13).
