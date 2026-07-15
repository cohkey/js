const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeTask, sortTasks, resolveProject, addProject, applyTaskDetails, closeDialog } = require("./task-core.js");

const makeTask = (overrides) => normalizeTask({
  id: overrides.id,
  title: overrides.id,
  project: "未分類",
  status: "todo",
  priority: "normal",
  createdAt: overrides.createdAt || 1,
  ...overrides,
});

test("以前のリスト項目をプロジェクトへ移行する", () => {
  const migrated = normalizeTask({ id: "legacy", title: "旧タスク", list: "買い物", completed: false });
  assert.equal(migrated.project, "買い物");
  assert.equal(migrated.status, "todo");
});

test("プロジェクト画面から追加したタスクには表示中のプロジェクトを優先する", () => {
  assert.equal(resolveProject("買い物", "未分類"), "買い物");
  assert.equal(resolveProject(null, "仕事"), "仕事");
  assert.equal(resolveProject(null, ""), "未分類");
});

test("期限を第1条件、優先度を第2条件として並べ替える", () => {
  const tasks = [
    makeTask({ id: "tomorrow-high", due: "2026-07-17", priority: "high" }),
    makeTask({ id: "today-low", due: "2026-07-16", priority: "low" }),
    makeTask({ id: "today-high", due: "2026-07-16", priority: "high" }),
    makeTask({ id: "undated-high", due: null, priority: "high" }),
  ];
  assert.deepEqual(sortTasks(tasks, "due", "priority").map((task) => task.id), ["today-high", "today-low", "tomorrow-high", "undated-high"]);
});

test("優先度を第1条件、期限を第2条件として並べ替える", () => {
  const tasks = [
    makeTask({ id: "low-today", due: "2026-07-16", priority: "low" }),
    makeTask({ id: "high-tomorrow", due: "2026-07-17", priority: "high" }),
    makeTask({ id: "high-today", due: "2026-07-16", priority: "high" }),
  ];
  assert.deepEqual(sortTasks(tasks, "priority", "due").map((task) => task.id), ["high-today", "high-tomorrow", "low-today"]);
});

test("同じ条件を2回指定しても安定した順序になる", () => {
  const tasks = [
    makeTask({ id: "later", due: "2026-07-16", createdAt: 2 }),
    makeTask({ id: "earlier", due: "2026-07-16", createdAt: 1 }),
  ];
  assert.deepEqual(sortTasks(tasks, "due", "due").map((task) => task.id), ["earlier", "later"]);
});

test("期限なしは期限付きタスクより後ろになる", () => {
  const tasks = [makeTask({ id: "undated", due: null }), makeTask({ id: "dated", due: "2026-07-20" })];
  assert.deepEqual(sortTasks(tasks, "due", "none").map((task) => task.id), ["dated", "undated"]);
});

test("進行中、未着手、完了の順に並べられる", () => {
  const tasks = [makeTask({ id: "done", status: "done" }), makeTask({ id: "todo", status: "todo" }), makeTask({ id: "doing", status: "doing" })];
  assert.deepEqual(sortTasks(tasks, "status", "none").map((task) => task.id), ["doing", "todo", "done"]);
});

test("プロジェクト名を第2条件に使える", () => {
  const tasks = [makeTask({ id: "work", priority: "high", project: "仕事" }), makeTask({ id: "personal", priority: "high", project: "個人" })];
  assert.deepEqual(sortTasks(tasks, "priority", "project").map((task) => task.id), ["personal", "work"]);
});

test("工数とサブタスクを安全な形式へ整える", () => {
  const task = normalizeTask({ id: "detail", title: "詳細", estimate: "2.5", actual: "1", subtasks: [{ title: "確認", completed: 1 }] });
  assert.equal(task.estimate, 2.5);
  assert.equal(task.actual, 1);
  assert.equal(task.subtasks.length, 1);
  assert.equal(task.subtasks[0].completed, true);
  assert.ok(task.subtasks[0].id);
});

test("空のプロジェクトを追加して重複なく保持できる", () => {
  const created = addProject(["未分類", "買い物"], "  引っ越し   準備  ");
  assert.equal(created.name, "引っ越し 準備");
  assert.equal(created.added, true);
  assert.deepEqual(created.projects, ["未分類", "買い物", "引っ越し 準備"]);
  const duplicate = addProject(created.projects, "引っ越し 準備");
  assert.equal(duplicate.added, false);
  assert.deepEqual(duplicate.projects, created.projects);
});

test("詳細追加の全項目をタスクデータへ反映できる", () => {
  const base = normalizeTask({ id: "new-detail", title: "仮", createdAt: 1 });
  const task = applyTaskDetails(base, {
    title: " 旅行の予約 ", status: "doing", priority: "high", due: "2026-08-01",
    project: "夏休み", tags: "重要, 予約、#重要", estimate: "3.5", actual: "1",
    subtasks: [{ id: "sub-1", title: "ホテル", completed: true }],
  }, 100);
  assert.deepEqual({
    title: task.title, status: task.status, priority: task.priority, due: task.due,
    project: task.project, tags: task.tags, estimate: task.estimate, actual: task.actual,
    completed: task.completed, subtasks: task.subtasks,
  }, {
    title: "旅行の予約", status: "doing", priority: "high", due: "2026-08-01",
    project: "夏休み", tags: ["重要", "予約"], estimate: 3.5, actual: 1,
    completed: false, subtasks: [{ id: "sub-1", title: "ホテル", completed: true }],
  });
});

test("詳細編集で完了と未完了を切り替えられる", () => {
  const base = normalizeTask({ id: "toggle", title: "確認", status: "todo" });
  const completed = applyTaskDetails(base, { title: "確認", status: "done", priority: "low" }, 1234);
  assert.equal(completed.completed, true);
  assert.equal(completed.completedAt, 1234);
  assert.equal(completed.priority, "low");
  const reopened = applyTaskDetails(completed, { title: "確認", status: "todo", priority: "normal" }, 2345);
  assert.equal(reopened.completed, false);
  assert.equal(reopened.completedAt, null);
});

test("必須項目の状態に関係なく開いているダイアログを閉じられる", () => {
  let closeCount = 0;
  const dialog = { open: true, close: () => { closeCount += 1; dialog.open = false; } };
  assert.equal(closeDialog(dialog), true);
  assert.equal(closeCount, 1);
  assert.equal(closeDialog(dialog), false);
  assert.equal(closeCount, 1);
});
