---
"repo-dive": minor
---

Add a "Number of files" chart under "Lines of code", mirroring its splits: by language, by contributor and all files, with age shading and percentage mode.
The two charts share one color scale, so a language or contributor keeps the same color in both.
The contributor split and age shading come from a new `file-survival` collector that attributes each living file to the commit that created it (renames followed, sampled monthly like `survival`); a file keeps its creator and creation cohort through later edits, until it is deleted.
The flat by-language variant is derived from file counts the `languages` collector already records, so existing catalogs show it after a plain `repo-dive index`; run `repo-dive scan` to collect the survival-based variants.
The new section accepts annotations under the `number-of-files` chart id.
