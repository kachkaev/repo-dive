---
"repo-dive": patch
---

Keep the commit calendar's range select from hopping between rows on narrow screens.

The select was as wide as the label it happened to be showing, and the range options differ a lot in width ("2019" against "Last 12 months").
On a viewport narrow enough for the control row to wrap, picking a different range resized it by up to 60px, which was enough to move it onto — or off — the second row.
It now sits in a fixed-width slot, so the space it takes up in the row no longer depends on the picked value, while the control itself still hugs its own label.
