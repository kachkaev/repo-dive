---
"repo-dive": patch
---

Keep the commit calendar's range select from hopping between rows on narrow screens.

The select trigger was as wide as the label it happened to be showing, and the range options differ a lot in width ("2019" against "Last 12 months").
On a viewport narrow enough for the control row to wrap, picking a different range resized the trigger by up to 60px, which was enough to move it onto — or off — the second row.
Its width is now pinned, so it no longer depends on the picked value.
