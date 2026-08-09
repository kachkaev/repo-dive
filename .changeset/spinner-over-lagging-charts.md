---
"repo-dive": patch
---

Show a spinner over a chart that has been dimmed for more than half a second.
Switching a chart's toggles dims the outgoing chart until the new one is ready, and on a large repository that wait could read as a freeze rather than as loading.
Quick switches look exactly as before: the spinner only fades in once the wait passes half a second.
