# Changelog

## 1.1.0-ws.2 (fork)

- Every run prints `Codex run: <model>, effort <effort>, <tokens>` plus the session total.
- Session usage ledger (runs, tokens, by effort/model/kind) shown by `/codex:session`.
- Effort policy when no effort is passed: task medium, adversarial review medium, stop gate low.
- `/codex:setup --default-effort` and `--default-model` workspace overrides.
- `adversarial-review` accepts `--effort`.
- Commands decide wait vs background and effort themselves; no more AskUserQuestion for it.

## 1.1.0-ws.1 (fork)

- One persistent Codex thread per Claude Code session. `task`, `review`, and `adversarial-review` run as turns in it by default.
- New `/codex:session` command to show or reset the session thread.
- New `--fresh` (new session thread) and `--ephemeral` (throwaway thread) flags on rescue and both reviews.
- `/codex:rescue` no longer asks "continue or new thread".
- Session primer on the first prompt-based turn of a session thread.
- Busy guard: a running job on the session thread blocks a second session-thread run.

## 1.0.0

- Initial version of the Codex plugin for Claude Code
