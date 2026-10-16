---
description: Delegate investigation, an explicit fix request, or follow-up rescue work to the Codex rescue subagent
argument-hint: "[--background|--wait] [--resume|--fresh|--ephemeral] [--model <model|spark>] [--effort <none|minimal|low|medium|high|xhigh>] [what Codex should investigate, solve, or continue]"
allowed-tools: Bash(node:*), AskUserQuestion, Agent
---

Invoke the `codex:codex-rescue` subagent via the `Agent` tool (`subagent_type: "codex:codex-rescue"`), forwarding the raw user request as the prompt.
`codex:codex-rescue` is a subagent, not a skill — do not call `Skill(codex:codex-rescue)` (no such skill) or `Skill(codex:rescue)` (that re-enters this command and hangs the session). The command runs inline so the `Agent` tool stays in scope; forked general-purpose subagents do not expose it.
The final user-visible response must be Codex's output verbatim.

Raw user request:
$ARGUMENTS

Execution mode (decide yourself, do not ask):

- If the request includes `--background`, run the `codex:codex-rescue` subagent in the background.
- If the request includes `--wait`, run the `codex:codex-rescue` subagent in the foreground.
- If neither flag is present, decide from the request: default to foreground for a bounded ask (one bug, one file, one question). Run in the background when the task is open-ended, touches several files or subsystems, asks for an investigation with an unknown cause, or will plainly take more than a couple of minutes.
- `--background` and `--wait` are execution flags for Claude Code. Do not forward them to `task`, and do not treat them as part of the natural-language task text.
- `--model` and `--effort` are runtime-selection flags. Preserve them for the forwarded `task` call, but do not treat them as part of the natural-language task text.
- Do not ask whether to continue or start a new thread. By default every rescue runs as a new turn in this Claude session's Codex thread, so Codex already remembers earlier turns.
- `--resume` forces a continuation of the latest finished rescue thread in this session (legacy behaviour).
- `--fresh` throws the session thread away and starts a new one for the rest of the session. Only add it yourself when the user says to start over.
- `--ephemeral` runs this one request in a throwaway thread and leaves the session thread untouched. Add it yourself only when the session thread is busy with a background job and the user wants a side task now.

Cost policy (the user pays for Codex credits, so every run must be deliberate):
- Say one short line before launching, for example: `Sending to Codex: rescue, effort medium, foreground.` Then let the output's `Codex run:` header show the model and tokens actually used.
- Never pass `--model` unless the user names a model in this request. The workspace or Codex config decides the model.
- Effort: the companion applies a policy when you pass nothing (task and adversarial review medium, stop gate low). Pass `--effort low` for lookups, one-file fixes, quick checks, and short follow-ups. Pass `--effort high` only for a root-cause hunt across several subsystems or when a medium run just failed on the same question. Never pass `xhigh` unless the user asks for it in this request.
- Do not run the same request twice in a row. If Codex failed, read why before retrying.

Operating rules:

- The subagent is a thin forwarder only. It should use one `Bash` call to invoke `node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs" task ...` and return that command's stdout as-is.
- Return the Codex companion stdout verbatim to the user.
- Do not paraphrase, summarize, rewrite, or add commentary before or after it.
- Do not ask the subagent to inspect files, monitor progress, poll `/codex:status`, fetch `/codex:result`, call `/codex:cancel`, summarize output, or do follow-up work of its own.
- Choose `--effort` by the cost policy above and pass it through. Leave the model unset unless the user explicitly asks for one. If they ask for `spark`, map it to `gpt-5.3-codex-spark`.
- Leave `--resume`, `--fresh`, and `--ephemeral` in the forwarded request. The subagent handles that routing when it builds the `task` command.
- If the companion reports that the session thread is busy, tell the user to wait for `/codex:status` or rerun with `--ephemeral`.
- If the helper reports that Codex is missing or unauthenticated, stop and tell the user to run `/codex:setup`.
- If the user did not supply a request, ask what Codex should investigate or fix.
