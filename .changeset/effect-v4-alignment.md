---
"repo-dive": patch
---

Align Effect usage with v4 community best practices.
Errors are now tagged classes with typed error channels, platform services are provided once at the CLI entrypoint, and concurrent scans collect results instead of mutating shared counters.

User-visible fixes that come with the alignment:

- `--help` exits 0 instead of 1.
- Ctrl+C in `gc` prompts is a clean interrupt (exit code 130) instead of an "Aborted." error.
- `--no-open` is now the built-in negation of a standard `--open` boolean flag (both spellings work; the default is unchanged).
- Errors keep printing as one friendly line on stderr.

Existing catalogs are unaffected — no re-scan needed.
