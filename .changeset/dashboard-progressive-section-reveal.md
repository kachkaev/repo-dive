---
"repo-dive": patch
---

Reveal dashboard sections one per paint behind a loading placeholder.
First paint stops at the header and the stat tiles; each section then mounts in its own interruptible pass while a placeholder — the next section's heading over a small spinner — marks what is still on the way.
The page also reserves its scrollbar from the start, so always-visible scrollbars no longer shift the layout mid-load.
