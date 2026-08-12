---
"repo-dive": patch
---

Stop classifying humans as AI agents when their name or employer merely contains an agent word.
Agent products are now recognized by the whole-word name they sign with (`Patrick Devine` is no longer Devin, `Ali Haider` is not aider), Claude and Devin additionally need the agent/model word agents append (`Claude Opus 4.5`, `Devin AI`), and on the email side only agent-specific mailboxes count — `alice@openai.com` marks an employee, not an agent.
Existing catalogs pick the corrected kinds up on their next `index` run — kinds are derived at index time, so no re-scan is needed.
