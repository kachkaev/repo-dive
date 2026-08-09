---
"repo-dive": minor
---

Name contributors in the lines-of-code chart instead of listing their email addresses.

The "by contributor" split used to label each band with an address, so a published report spelled one out for every top contributor while the Contributors section right below it showed names.
Both now go by name: a configured `displayName`, else the name git recorded on the person's commits, else the username their address is built around (`alice@example.com` → `alice`), and the address itself only when there is nothing else to show.
The contributors table keeps its email column, so people who spell their name the same way stay distinguishable.
Re-run `repo-dive index` to relabel an existing catalog; no re-scan needed.
