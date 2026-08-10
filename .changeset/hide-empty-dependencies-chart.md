---
"repo-dive": patch
---

Hide the "Dependencies over time" chart when no commit ever resolved a lockfile.
A repo outside the npm ecosystem (e.g. a Python project) carries a dependency row for every scanned commit, all zeros — the report now drops the empty chart instead of drawing a blank axis, matching how the direct-dependencies chart already behaves.
