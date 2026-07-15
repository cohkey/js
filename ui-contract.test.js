const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("index.html", "utf8");
const script = fs.readFileSync("script.js", "utf8");
const css = fs.readFileSync("styles.css", "utf8");

test("画面内のIDが重複していない", () => {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
});

test("JavaScriptが参照するすべての画面要素が存在する", () => {
  const referencedIds = [...script.matchAll(/querySelector\("#([^"]+)"\)/g)].map((match) => match[1]);
  const htmlIds = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
  assert.deepEqual([...new Set(referencedIds)].filter((id) => !htmlIds.has(id)), []);
});

test("詳細のプロジェクト欄は選択式で、新規作成欄もある", () => {
  assert.match(html, /<select id="edit-project"/);
  assert.match(html, /id="edit-new-project"/);
  assert.doesNotMatch(html, /project-options/);
});

test("サイドバーにプロジェクト追加ボタンと追加画面がある", () => {
  assert.match(html, /id="open-project-dialog"/);
  assert.match(html, /id="project-dialog"/);
  assert.match(html, /id="new-project-name"/);
  assert.match(script, /PROJECTS_KEY/);
});

test("詳細画面で優先度を選択して保存できる", () => {
  assert.match(html, /<select id="edit-priority"/);
  assert.match(script, /elements\.editPriority\.value = task\.priority/);
  assert.match(script, /priority: elements\.editPriority\.value/);
  assert.match(script, /applyTaskDetails\(baseTask/);
});

test("プロジェクト名のEnter操作がフォーム送信につながる", () => {
  assert.match(script, /elements\.newProjectName\.addEventListener\("keydown"/);
  assert.match(script, /event\.key !== "Enter" \|\| event\.isComposing/);
  assert.match(script, /elements\.projectForm\.requestSubmit\(\)/);
});

test("簡易追加と詳細追加の2つの入口がある", () => {
  assert.match(html, /<button class="add-button" type="submit"><span>すぐ追加<\/span>/);
  assert.match(html, /id="open-detailed-add"/);
  assert.match(html, /<span>詳細設定して追加<\/span>/);
  assert.match(script, /function openNewTaskDialog\(\)/);
  assert.match(script, /document\.querySelector\("#open-detailed-add"\)\.addEventListener\("click", openNewTaskDialog\)/);
});

test("詳細追加は新規作成、既存詳細は編集として保存される", () => {
  assert.match(script, /const isCreating = !elements\.editId\.value/);
  assert.match(script, /if \(isCreating\) state\.tasks\.unshift\(task\)/);
  assert.match(script, /elements\.deleteTaskButton\.hidden = true/);
  assert.match(script, /elements\.deleteTaskButton\.hidden = false/);
});

test("×とキャンセルは送信ではなく閉じる専用ボタンになっている", () => {
  const closeButtons = [...html.matchAll(/<button[^>]*data-close-dialog="([^"]+)"[^>]*>/g)];
  assert.equal(closeButtons.length, 4);
  closeButtons.forEach((match) => assert.match(match[0], /type="button"/));
  assert.deepEqual(closeButtons.map((match) => match[1]).sort(), ["project-dialog", "project-dialog", "task-dialog", "task-dialog"]);
  assert.doesNotMatch(html, /class="dialog-close" value="cancel"/);
  assert.match(script, /closeDialog\(document\.getElementById\(closeButton\.dataset\.closeDialog\)\)/);
});

test("詳細追加ボタンは補助リンクではなく十分な大きさの選択肢になっている", () => {
  assert.match(css, /\.add-actions button \{ min-height: 48px;/);
  assert.match(css, /\.detailed-add-button \{[^}]*border: 1px solid var\(--line\)/);
  assert.match(css, /\.add-actions button small/);
  assert.match(css, /\.add-actions \{ width: 100%; \}/);
});

test("複合並び替えの2つの選択欄がある", () => {
  assert.match(html, /id="sort-primary"/);
  assert.match(html, /id="sort-secondary"/);
  assert.match(script, /sortTasks\(filtered, state\.sortPrimary, state\.sortSecondary\)/);
});

test("ダークモードにタスクとタグ専用の配色がある", () => {
  assert.match(css, /body\.is-dark \.task-card \{/);
  assert.match(css, /body\.is-dark \.tag-pill \{/);
  assert.match(css, /body\.is-dark \.task-dialog \{/);
});

test("共通ロジックをアプリより先に読み込む", () => {
  assert.ok(html.indexOf('src="task-core.js"') < html.indexOf('src="script.js"'));
});

test("Windows向けのCtrl K検索ショートカットを表示・処理する", () => {
  assert.match(html, /<kbd>Ctrl K<\/kbd>/);
  assert.doesNotMatch(html, /⌘/);
  assert.match(script, /event\.ctrlKey && event\.key\.toLowerCase\(\) === "k"/);
  assert.doesNotMatch(script, /event\.metaKey/);
});

test("ショートカット表示にライト・ダーク専用の背景色がある", () => {
  assert.match(css, /kbd \{[^}]*background: var\(--surface\)/);
  assert.match(css, /body\.is-dark kbd \{[^}]*background: #262724/);
});
