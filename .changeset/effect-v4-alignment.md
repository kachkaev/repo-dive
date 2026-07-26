---
"repo-dive": patch
---

Align Effect usage with Effect v4 community conventions: tagged errors (`Data.TaggedError` / `Schema.TaggedErrorClass`) instead of plain `Error` subclasses and `instanceof` sniffing, platform services provided once at the CLI entrypoint instead of deep inside helpers, `Result` for fallible sync parsers, collected `Effect.forEach` results instead of counters mutated across concurrent fibers, `Effect.timed`/`Clock`/`DateTime` for timing, and MCP tool failures reported through declared `failure` schemas. Behavior fixes that come with this: `--help` now exits 0, Ctrl-C in prompts exits 130 (clean interrupt), errors print to stderr as before, and `--open`/`--no-open` is now a standard negatable boolean flag.
