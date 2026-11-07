---
"repo-dive": patch
---

Report what `scan` is still running when it goes quiet.
After 30 seconds without output, it now prints a line such as `Scanned 24677/24678 commits, still running: survival on 1a2b3c4d5e (2m 30s)…` instead of appearing frozen, and it always finishes the counter with a final `Scanned 24678/24678 commits` line.
