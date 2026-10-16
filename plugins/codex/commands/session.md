---
description: Show or reset the Codex thread that belongs to this Claude Code session
argument-hint: '[--reset]'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs" session "$ARGUMENTS"`

Present the command output to the user as-is. Do not add commentary.

If the output says no session thread exists yet, mention that the next `/codex:rescue`, `/codex:review`, or `/codex:adversarial-review` creates it.
