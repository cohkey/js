const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeTask, sortTasks, resolveProject, addProject, applyTaskDetails, closeDialog,
  parseCSV, autoMapHeaders, normalizeImportDate, csvRowsToTasks, mergeImportedTasks, tasksToCSV, createBackup, parseBackup,
} = require("./task-core.js");

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

test("BOM・引用符・カンマ・改行を含むExcel CSVを解析できる", () => {
  const parsed = parseCSV('\uFEFFタスク名,メモ,プロジェクト\r\n"資料を確認,返信","1行目\n2行目",仕事\r\n"""重要""を確認",,個人\r\n');
  assert.deepEqual(parsed.headers, ["タスク名", "メモ", "プロジェクト"]);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0][0], "資料を確認,返信");
  assert.equal(parsed.rows[0][1], "1行目\n2行目");
  assert.equal(parsed.rows[1][0], '"重要"を確認');
});

test("日本語と英語の列名を自動で割り当てる", () => {
  const mapping = autoMapHeaders(["Title", "状態", "期限日", "リスト", "見積工数"]);
  assert.deepEqual({ title: mapping.title, status: mapping.status, due: mapping.due, project: mapping.project, estimate: mapping.estimate }, { title: 0, status: 1, due: 2, project: 3, estimate: 4 });
  assert.equal(mapping.tags, -1);
});

test("Excelの日付表現とシリアル値をISO日付へ変換する", () => {
  assert.equal(normalizeImportDate("2026/7/16"), "2026-07-16");
  assert.equal(normalizeImportDate("2026年7月16日"), "2026-07-16");
  assert.equal(normalizeImportDate("46219"), "2026-07-16");
  assert.equal(normalizeImportDate("2026/2/30"), null);
});

test("CSV行からタグ・工数・サブタスクを含むタスクを作れる", () => {
  const parsed = parseCSV("タスク名,状態,優先度,期限,プロジェクト,タグ,見積時間,実績時間,サブタスク\n移行テスト,進行中,高,2026/7/20,移行,重要;確認,2.5,1,[x] 済み | [ ] 未完了");
  const mapping = autoMapHeaders(parsed.headers);
  const result = csvRowsToTasks(parsed, mapping, 1000);
  assert.equal(result.tasks.length, 1);
  assert.deepEqual({
    title: result.tasks[0].title, status: result.tasks[0].status, priority: result.tasks[0].priority,
    due: result.tasks[0].due, project: result.tasks[0].project, tags: result.tasks[0].tags,
    estimate: result.tasks[0].estimate, actual: result.tasks[0].actual,
  }, { title: "移行テスト", status: "doing", priority: "high", due: "2026-07-20", project: "移行", tags: ["重要", "確認"], estimate: 2.5, actual: 1 });
  assert.deepEqual(result.tasks[0].subtasks.map((item) => [item.title, item.completed]), [["済み", true], ["未完了", false]]);
});

test("タイトルが空のCSV行を安全にスキップする", () => {
  const parsed = parseCSV("タスク名,状態\n,完了\n有効,未着手");
  const result = csvRowsToTasks(parsed, autoMapHeaders(parsed.headers), 1000);
  assert.equal(result.tasks.length, 1);
  assert.deepEqual(result.skippedRows, [2]);
});

test("追加時の重複スキップと全置換を選べる", () => {
  const existing = [makeTask({ id: "old", title: "同じ", due: "2026-07-20", project: "仕事" })];
  const imported = [
    makeTask({ id: "duplicate", title: "同じ", due: "2026-07-20", project: "仕事" }),
    makeTask({ id: "new", title: "新規", due: "2026-07-21", project: "仕事" }),
  ];
  const appended = mergeImportedTasks(existing, imported, { mode: "append", skipDuplicates: true });
  assert.equal(appended.added, 1);
  assert.equal(appended.skipped, 1);
  assert.deepEqual(appended.tasks.map((task) => task.id), ["new", "old"]);
  const replaced = mergeImportedTasks(existing, imported, { mode: "replace", skipDuplicates: true });
  assert.equal(replaced.tasks.length, 2);
});

test("Excel向けBOM付きCSVへ書き出して再解析できる", () => {
  const task = makeTask({ id: "export", title: "確認,返信", status: "done", priority: "high", due: "2026-07-20", project: "仕事", tags: ["重要", "連絡"], estimate: 2, actual: 1.5, subtasks: [{ id: "s1", title: "メール\n確認", completed: true }] });
  const csv = tasksToCSV([task]);
  assert.equal(csv.charCodeAt(0), 0xFEFF);
  const parsed = parseCSV(csv);
  assert.equal(parsed.rows[0][0], "確認,返信");
  assert.equal(parsed.rows[0][1], "完了");
  assert.equal(parsed.rows[0][8], "[x] メール\n確認");
});

test("JSONバックアップでタスク・プロジェクト・設定を往復できる", () => {
  const tasks = [makeTask({ id: "backup", title: "保存", project: "保管" })];
  const json = createBackup(tasks, ["未分類", "保管"], { theme: "dark", mode: "board" }, "2026-07-16T00:00:00.000Z");
  const restored = parseBackup(json);
  assert.equal(restored.tasks[0].title, "保存");
  assert.deepEqual(restored.projects, ["未分類", "保管"]);
  assert.deepEqual(restored.settings, { theme: "dark", mode: "board" });
  assert.throws(() => parseBackup('{"tasks":[]}'), /対応していない/);
});
