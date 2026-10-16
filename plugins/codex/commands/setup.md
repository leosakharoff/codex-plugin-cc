---
description: Check whether the local Codex CLI is ready, toggle the stop-time review gate, or set the workspace default effort and model
argument-hint: '[--enable-review-gate|--disable-review-gate] [--default-effort <low|medium|high|policy>] [--default-model <model|codex>]'
allowed-tools: Bash(node:*), Bash(npm:*), AskUserQuestion
---

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs" setup --json $ARGUMENTS
```

If the result says Codex is unavailable and npm is available:
- Use `AskUserQuestion` exactly once to ask whether Claude should install Codex now.
- Put the install option first and suffix it with `(Recommended)`.
- Use these two options:
  - `Install Codex (Recommended)`
  - `Skip for now`
- If the user chooses install, run:

```bash
npm install -g @openai/codex
```

- Then rerun:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs" setup --json $ARGUMENTS
```

If Codex is already installed or npm is unavailable:
- Do not ask about installation.

Output rules:
- Present the final setup output to the user.
- If installation was skipped, present the original setup output.
- If Codex is installed but not authenticated, preserve the guidance to run `!codex login`.

Workspace defaults:
- `--default-effort <effort>` sets the effort the companion uses for task, adversarial review, and stop gate when a call passes none. `--default-effort policy` goes back to the built-in policy (task medium, adversarial review medium, stop gate low).
- `--default-model <model>` pins the model for every companion run in this workspace. `--default-model codex` clears it so Codex's own config decides again.
- Report the current default model and effort lines from the setup output to the user.
