import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { buildEnv, installFakeCodex } from "./fake-codex-fixture.mjs";
import { initGitRepo, makeTempDir, run } from "./helpers.mjs";
import { getSessionThread, resolveStateDir } from "../plugins/codex/scripts/lib/state.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN_ROOT = path.join(ROOT, "plugins", "codex");
const SCRIPT = path.join(PLUGIN_ROOT, "scripts", "codex-companion.mjs");
const SESSION_HOOK = path.join(PLUGIN_ROOT, "scripts", "session-lifecycle-hook.mjs");

function setupRepo() {
  const repo = makeTempDir();
  const binDir = makeTempDir();
  installFakeCodex(binDir);
  initGitRepo(repo);
  fs.writeFileSync(path.join(repo, "README.md"), "hello\n");
  run("git", ["add", "README.md"], { cwd: repo });
  run("git", ["commit", "-m", "init"], { cwd: repo });
  return { repo, binDir, statePath: path.join(binDir, "fake-codex-state.json") };
}

function sessionEnv(binDir, sessionId) {
  return {
    ...buildEnv(binDir),
    CODEX_COMPANION_SESSION_ID: sessionId
  };
}

function readFakeState(statePath) {
  return JSON.parse(fs.readFileSync(statePath, "utf8"));
}

test("two tasks in one Claude session share one Codex thread and only the first carries the primer", () => {
  const { repo, binDir, statePath } = setupRepo();
  const env = sessionEnv(binDir, "sess-a");

  const first = run("node", [SCRIPT, "task", "first task"], { cwd: repo, env });
  assert.equal(first.status, 0, first.stderr);
  const afterFirst = readFakeState(statePath);
  assert.equal(afterFirst.lastTurnStart.threadId, "thr_1");
  assert.match(afterFirst.lastTurnStart.prompt, /^<session_thread>/);
  assert.match(afterFirst.lastTurnStart.prompt, /first task$/);
  const named = afterFirst.threads.find((thread) => thread.id === "thr_1");
  assert.match(named.name, /^Codex Companion Session /);
  assert.equal(named.ephemeral, false);

  const second = run("node", [SCRIPT, "task", "second task"], { cwd: repo, env });
  assert.equal(second.status, 0, second.stderr);
  const afterSecond = readFakeState(statePath);
  assert.equal(afterSecond.lastTurnStart.threadId, "thr_1");
  assert.equal(afterSecond.lastTurnStart.prompt, "second task");
  assert.equal(afterSecond.threads.length, 1);

  const record = getSessionThread(repo, "sess-a");
  assert.equal(record.threadId, "thr_1");
  assert.equal(record.turns, 2);
  assert.equal(record.primed, true);
  assert.equal(record.lastKind, "task");
});

test("different Claude sessions get different Codex threads", () => {
  const { repo, binDir, statePath } = setupRepo();

  const a = run("node", [SCRIPT, "task", "task a"], { cwd: repo, env: sessionEnv(binDir, "sess-a") });
  assert.equal(a.status, 0, a.stderr);
  const b = run("node", [SCRIPT, "task", "task b"], { cwd: repo, env: sessionEnv(binDir, "sess-b") });
  assert.equal(b.status, 0, b.stderr);

  assert.equal(readFakeState(statePath).lastTurnStart.threadId, "thr_2");
  assert.equal(getSessionThread(repo, "sess-a").threadId, "thr_1");
  assert.equal(getSessionThread(repo, "sess-b").threadId, "thr_2");
});

test("adversarial review joins the session thread and primes it when it is the first turn", () => {
  const { repo, binDir, statePath } = setupRepo();
  const env = sessionEnv(binDir, "sess-a");
  fs.writeFileSync(path.join(repo, "README.md"), "changed\n");

  const review = run("node", [SCRIPT, "adversarial-review", "--json"], { cwd: repo, env });
  assert.equal(review.status, 0, review.stderr);
  const afterReview = readFakeState(statePath);
  assert.equal(afterReview.lastTurnStart.threadId, "thr_1");
  assert.match(afterReview.lastTurnStart.prompt, /^<session_thread>/);
  assert.equal(getSessionThread(repo, "sess-a").primed, true);
  assert.equal(getSessionThread(repo, "sess-a").lastKind, "adversarial-review");

  const task = run("node", [SCRIPT, "task", "fix the top finding"], { cwd: repo, env });
  assert.equal(task.status, 0, task.stderr);
  const afterTask = readFakeState(statePath);
  assert.equal(afterTask.lastTurnStart.threadId, "thr_1");
  assert.equal(afterTask.lastTurnStart.prompt, "fix the top finding");
  assert.equal(getSessionThread(repo, "sess-a").turns, 2);
});

test("native review resumes the session thread once a task created it", () => {
  const { repo, binDir, statePath } = setupRepo();
  const env = sessionEnv(binDir, "sess-a");

  const task = run("node", [SCRIPT, "task", "first task"], { cwd: repo, env });
  assert.equal(task.status, 0, task.stderr);

  fs.writeFileSync(path.join(repo, "README.md"), "changed\n");
  const review = run("node", [SCRIPT, "review", "--json"], { cwd: repo, env });
  assert.equal(review.status, 0, review.stderr);
  const payload = JSON.parse(review.stdout);
  assert.equal(payload.sourceThreadId, "thr_1");
  assert.equal(readFakeState(statePath).threads.length, 1);
  assert.equal(getSessionThread(repo, "sess-a").turns, 2);
  assert.equal(getSessionThread(repo, "sess-a").lastKind, "review");
});

test("native review as the first turn creates the session thread without marking it primed", () => {
  const { repo, binDir, statePath } = setupRepo();
  const env = sessionEnv(binDir, "sess-a");
  fs.writeFileSync(path.join(repo, "README.md"), "changed\n");

  const review = run("node", [SCRIPT, "review", "--json"], { cwd: repo, env });
  assert.equal(review.status, 0, review.stderr);
  const record = getSessionThread(repo, "sess-a");
  assert.equal(record.threadId, "thr_1");
  assert.equal(record.primed, false);
  const named = readFakeState(statePath).threads.find((thread) => thread.id === "thr_1");
  assert.equal(named.ephemeral, false);

  const task = run("node", [SCRIPT, "task", "now fix it"], { cwd: repo, env });
  assert.equal(task.status, 0, task.stderr);
  const afterTask = readFakeState(statePath);
  assert.equal(afterTask.lastTurnStart.threadId, "thr_1");
  assert.match(afterTask.lastTurnStart.prompt, /^<session_thread>[\s\S]*now fix it$/);
  assert.equal(getSessionThread(repo, "sess-a").primed, true);
});

test("--fresh replaces the session thread and --ephemeral leaves it untouched", () => {
  const { repo, binDir, statePath } = setupRepo();
  const env = sessionEnv(binDir, "sess-a");

  const first = run("node", [SCRIPT, "task", "first task"], { cwd: repo, env });
  assert.equal(first.status, 0, first.stderr);

  const ephemeral = run("node", [SCRIPT, "task", "--ephemeral", "one-off"], { cwd: repo, env });
  assert.equal(ephemeral.status, 0, ephemeral.stderr);
  const afterEphemeral = readFakeState(statePath);
  assert.equal(afterEphemeral.lastTurnStart.threadId, "thr_2");
  assert.equal(afterEphemeral.lastTurnStart.prompt, "one-off");
  assert.equal(getSessionThread(repo, "sess-a").threadId, "thr_1");

  const fresh = run("node", [SCRIPT, "task", "--fresh", "start over"], { cwd: repo, env });
  assert.equal(fresh.status, 0, fresh.stderr);
  const afterFresh = readFakeState(statePath);
  assert.equal(afterFresh.lastTurnStart.threadId, "thr_3");
  assert.match(afterFresh.lastTurnStart.prompt, /^<session_thread>[\s\S]*start over$/);
  const record = getSessionThread(repo, "sess-a");
  assert.equal(record.threadId, "thr_3");
  assert.equal(record.turns, 1);
});

test("without a Claude session id every run keeps the old per-call thread behaviour", () => {
  const { repo, binDir, statePath } = setupRepo();
  const env = buildEnv(binDir);
  delete env.CODEX_COMPANION_SESSION_ID;

  const first = run("node", [SCRIPT, "task", "first task"], { cwd: repo, env });
  assert.equal(first.status, 0, first.stderr);
  const second = run("node", [SCRIPT, "task", "second task"], { cwd: repo, env });
  assert.equal(second.status, 0, second.stderr);

  const state = readFakeState(statePath);
  assert.equal(state.lastTurnStart.threadId, "thr_2");
  assert.equal(state.lastTurnStart.prompt, "second task");
});

test("session command reports and resets the mapping", () => {
  const { repo, binDir } = setupRepo();
  const env = sessionEnv(binDir, "sess-a");

  const before = run("node", [SCRIPT, "session"], { cwd: repo, env });
  assert.equal(before.status, 0, before.stderr);
  assert.match(before.stdout, /No Codex session thread yet/);

  const task = run("node", [SCRIPT, "task", "first task"], { cwd: repo, env });
  assert.equal(task.status, 0, task.stderr);

  const after = run("node", [SCRIPT, "session", "--json"], { cwd: repo, env });
  assert.equal(after.status, 0, after.stderr);
  const payload = JSON.parse(after.stdout);
  assert.equal(payload.sessionId, "sess-a");
  assert.equal(payload.thread.threadId, "thr_1");

  const rendered = run("node", [SCRIPT, "session"], { cwd: repo, env });
  assert.match(rendered.stdout, /codex resume thr_1/);

  const reset = run("node", [SCRIPT, "session", "--reset"], { cwd: repo, env });
  assert.equal(reset.status, 0, reset.stderr);
  assert.match(reset.stdout, /Mapping cleared/);
  assert.equal(getSessionThread(repo, "sess-a"), null);

  const outside = run("node", [SCRIPT, "session"], { cwd: repo, env: buildEnv(binDir) });
  assert.match(outside.stdout, /Not running inside a Claude Code session/);
});

test("a running job on the session thread blocks a second session-thread run", () => {
  const { repo, binDir } = setupRepo();
  const env = sessionEnv(binDir, "sess-a");

  const first = run("node", [SCRIPT, "task", "first task"], { cwd: repo, env });
  assert.equal(first.status, 0, first.stderr);

  const stateDir = resolveStateDir(repo);
  const stateFile = path.join(stateDir, "state.json");
  const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  state.jobs.unshift({
    id: "task-busy",
    status: "running",
    title: "Codex Task",
    jobClass: "task",
    sessionId: "sess-a",
    threadId: "thr_1",
    updatedAt: new Date().toISOString()
  });
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));

  const blocked = run("node", [SCRIPT, "task", "second task"], { cwd: repo, env });
  assert.equal(blocked.status, 1);
  assert.match(blocked.stderr, /session thread is busy with task-busy/);

  const escape = run("node", [SCRIPT, "task", "--ephemeral", "side task"], { cwd: repo, env });
  assert.equal(escape.status, 0, escape.stderr);
});

test("session end hook clears the session thread mapping", () => {
  const { repo, binDir } = setupRepo();
  const env = sessionEnv(binDir, "sess-a");

  const task = run("node", [SCRIPT, "task", "first task"], { cwd: repo, env });
  assert.equal(task.status, 0, task.stderr);
  assert.equal(getSessionThread(repo, "sess-a").threadId, "thr_1");

  const end = run("node", [SESSION_HOOK, "SessionEnd"], {
    cwd: repo,
    env,
    input: JSON.stringify({ hook_event_name: "SessionEnd", session_id: "sess-a", cwd: repo })
  });
  assert.equal(end.status, 0, end.stderr);
  assert.equal(getSessionThread(repo, "sess-a"), null);
});
