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
  assert.equal(closeButtons.length, 10);
  closeButtons.forEach((match) => assert.match(match[0], /type="button"/));
  assert.deepEqual(closeButtons.map((match) => match[1]).sort(), ["csv-import-dialog", "csv-import-dialog", "filter-dialog", "filter-dialog", "project-dialog", "project-dialog", "tag-dialog", "tag-dialog", "task-dialog", "task-dialog"]);
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

test("テーブル表示は主要項目のインライン編集と詳細画面に対応する", () => {
  assert.match(html, /data-mode="table"/);
  assert.match(html, /id="table-view"/);
  assert.match(script, /function renderTable\(tasks\)/);
  assert.match(script, /elements\.table\.addEventListener\("change"/);
  assert.match(script, /applyTableEdit\(task, nextField, nextValue\)/);
  assert.match(script, /makeTableSelect\("repeat", task\.repeat/);
  assert.match(script, /dataset\.action = "detail"/);
  assert.match(script, /\["list", "table", "board", "timeline"\]/);
});

test("テーブル表示でもプロジェクト・タグ・優先度でグルーピングできる", () => {
  assert.match(script, /\["list", "table"\]\.includes\(state\.mode\)/);
  assert.match(script, /const groups = grouped[\s\S]*groupTasks\(tasks, state\.groupBy, getProjects\(\)\)/);
  assert.match(script, /group\.tasks\.forEach\(\(task\) =>/);
  assert.match(css, /\.table-group-heading/);
});

test("クイック追加欄は意味のないプラスをなくし入力目的を明示する", () => {
  assert.doesNotMatch(html, /class="add-symbol"/);
  assert.match(html, /class="quick-add-heading"><span>QUICK ADD<\/span><small>Enterでも追加できます<\/small>/);
  assert.match(html, /placeholder="次にやることは？"/);
  assert.match(css, /\.quick-add::before/);
  assert.match(css, /\.quick-input-row/);
  assert.match(css, /body\.is-dark \.quick-add/);
});

test("テーブル表示は横スクロール・固定見出し・ダークモードに対応する", () => {
  assert.match(css, /\.table-scroll \{[^}]*overflow-x: auto/);
  assert.match(css, /\.task-table th \{[^}]*position: sticky/);
  assert.match(css, /body\.is-dark \.task-table td/);
  assert.match(css, /\.task-table \{[^}]*min-width: 1290px/);
});

test("テーブルの値は意味ごとに色分けされ、プロジェクトとタグは名前から自動配色される", () => {
  assert.match(script, /function colorHue\(value\)/);
  assert.match(script, /applyNamedColor\(projectSelect, task\.project\)/);
  assert.match(script, /dueInput\.dataset\.value = dueTone\(task\.due, task\.status\)/);
  assert.match(css, /data-color-type="priority"\]\[data-value="high"\]/);
  assert.match(css, /data-color-type="status"\]\[data-value="done"\]/);
  assert.match(css, /\.named-color \{/);
});

test("表示形式を切り替えると選択したビュー以外は確実に隠れる", () => {
  assert.match(script, /elements\.list\.hidden = upcomingView \|\| reportView/);
  assert.match(css, /\.task-list\[hidden\].*display: none !important/);
});

test("削除したタスクはゴミ箱へ移動し復元・完全削除・元に戻すができる", () => {
  assert.match(html, /data-view="trash"/);
  assert.match(html, /id="undo-button"/);
  assert.match(script, /state\.trash\.unshift\(normalizeTask/);
  assert.match(script, /restore\.dataset\.trashAction = "restore"/);
  assert.match(script, /function undoLastChange\(\)/);
  assert.match(script, /event\.ctrlKey && event\.key\.toLowerCase\(\) === "z"/);
});

test("詳細画面で繰り返しを設定し完了時に次回タスクを作成できる", () => {
  assert.match(html, /id="edit-repeat"/);
  assert.match(html, /<option value="weekdays">平日のみ<\/option>/);
  assert.match(script, /createNextOccurrenceIfNeeded/);
  assert.match(script, /repeat: elements\.editRepeat\.value/);
});

test("複合条件の保存フィルターを追加・適用・削除できる", () => {
  ["filter-dialog", "filter-form", "filter-name", "filter-project", "filter-status", "filter-priority", "filter-due", "filter-tag"].forEach((id) => assert.match(html, new RegExp(`id="${id}"`)));
  assert.match(script, /function updateFilterNavigation\(\)/);
  assert.match(script, /matchesSavedFilter\(task, savedFilter, todayISO\(\)\)/);
  assert.match(script, /localStorage\.setItem\(FILTERS_KEY/);
  assert.match(html, /<option value="tomorrow">明日<\/option>/);
});

test("近日予定・完了・ゴミ箱では追加欄を隠し用途に合う空表示へ切り替える", () => {
  assert.match(html, /data-view="upcoming">[\s\S]*近日予定/);
  assert.match(script, /const addAllowed = !\["upcoming", "completed", "trash", "report"\]\.includes\(state\.view\)/);
  assert.match(script, /elements\.form\.hidden = !addAllowed/);
  assert.match(script, /upcoming: \["近日予定はありません。"/);
  assert.match(script, /週ごとのカレンダーで、期限付きタスクを先まで見通せます。/);
});

test("詳細ダイアログは背景をクリックしても閉じられる", () => {
  assert.match(script, /document\.querySelectorAll\("dialog"\)\.forEach/);
  assert.match(script, /if \(event\.target === dialog\) closeDialog\(dialog\)/);
});

test("近日予定は表示切替のない専用週間カレンダーになる", () => {
  assert.match(html, /id="upcoming-calendar"/);
  assert.match(script, /function renderUpcomingCalendar\(\)/);
  assert.match(script, /elements\.viewSwitcher\.hidden = trashView \|\| upcomingView \|\| reportView/);
  assert.match(script, /document\.body\.classList\.toggle\("is-upcoming", upcomingView\)/);
  assert.match(script, /dataset\.calendarAction/);
  assert.match(css, /\.upcoming-calendar-grid \{/);
  assert.match(css, /body\.is-upcoming \.content-wrap/);
});

test("リスト情報は形と記号でも区別できる", () => {
  assert.match(css, /\.task-date::before \{ content: "▦ "/);
  assert.match(css, /\.task-project-label::before \{ content: "▰ "/);
  assert.match(css, /\.repeat-label::before \{ content: "↻ "/);
  assert.match(html, /class="priority-button"/);
  assert.doesNotMatch(html, /class="star-button"/);
});

test("プロジェクトをお気に入りにしてサイドバー上部へ表示できる", () => {
  assert.match(html, /id="favorite-project-section"/);
  assert.match(html, /id="favorite-project-navigation"/);
  assert.match(html, /id="new-project-favorite"/);
  assert.match(script, /FAVORITES_KEY = "tempo-favorite-projects-v1"/);
  assert.match(script, /function toggleFavoriteProject\(project\)/);
  assert.match(script, /favoriteProjects: state\.favoriteProjects/);
});

test("プロジェクトを削除してタスクを未分類へ安全に移動できる", () => {
  assert.match(script, /dataset\.removeProject = project/);
  assert.match(script, /function deleteProject\(project\)/);
  assert.match(script, /removeProject\(state\.tasks, state\.projects, state\.favoriteProjects, state\.savedFilters, project\)/);
  assert.match(script, /件を「未分類」へ移動しました/);
  assert.match(css, /\.project-remove-button/);
});

test("タグ一覧で追加・名称変更・削除ができる", () => {
  ["open-tag-dialog", "open-tag-manager", "tag-dialog", "new-tag-name", "add-tag", "tag-manager-list", "tag-count"].forEach((id) => assert.match(html, new RegExp(`id="${id}"`)));
  assert.match(script, /TAGS_KEY = "tempo-tags-v1"/);
  assert.match(script, /function renderTagManager\(\)/);
  assert.match(script, /function renameManagedTag\(oldName, newName\)/);
  assert.match(script, /function deleteManagedTag\(name\)/);
  assert.match(css, /\.tag-manager-row/);
  assert.match(css, /body\.is-dark \.tag-manager-row/);
});

test("週間カレンダーでは完了タスクもチェックと取り消し線で区別する", () => {
  assert.match(script, /button\.classList\.toggle\("is-completed", task\.status === "done"\)/);
  assert.match(script, /task\.status === "done" \? "✓ " : ""/);
  assert.match(script, /完了 \$\{completedCount\}件/);
  assert.match(css, /\.calendar-task\.is-completed/);
  assert.match(css, /\.calendar-task\.is-completed strong \{[^}]*text-decoration: line-through/);
  assert.match(css, /body\.is-dark \.calendar-task\.is-completed/);
});

test("タスクの開始と停止で実績時間を自動計測できる", () => {
  assert.match(html, /class="task-timer-button"/);
  assert.match(html, /id="toggle-task-timer"/);
  assert.match(script, /function toggleTaskTimer\(taskId\)/);
  assert.match(script, /Object\.assign\(task, startTaskTimer\(task, now\)\)/);
  assert.match(script, /Object\.assign\(task, stopTaskTimer\(task, now\)\)/);
  assert.match(script, /setInterval\(\(\) => syncTimerDisplays\(\), 1000\)/);
});

test("保存フィルターは既存条件を読み込んで編集保存できる", () => {
  assert.match(html, /id="filter-id"/);
  assert.match(html, /id="filter-dialog-title"/);
  assert.match(script, /edit\.dataset\.editFilter = filter\.id/);
  assert.match(script, /function openFilterDialog\(filter = null\)/);
  assert.match(script, /state\.savedFilters\[index\] = filter/);
});

test("今日・すべて・完了をプロジェクト別にグループ表示できる", () => {
  assert.match(html, /id="group-select"/);
  assert.match(html, /<option value="tag">タグ別<\/option>/);
  assert.match(html, /<option value="priority">優先度別<\/option>/);
  assert.match(script, /groupTasks\(tasks, state\.groupBy, getProjects\(\)\)/);
  assert.match(script, /\["today", "all", "completed"\]\.includes\(state\.view\)/);
  assert.match(script, /localStorage\.setItem\(GROUP_KEY, state\.groupBy\)/);
  assert.match(css, /\.task-group-heading \{/);
});

test("長い画面でもサイドバーだけを最後までスクロールできる", () => {
  assert.match(css, /\.sidebar \{[\s\S]*overflow-y: auto/);
  assert.match(css, /overscroll-behavior: contain/);
  assert.match(css, /scrollbar-gutter: stable/);
});

test("空のプロジェクトでは表示コンテナを隠して専用メッセージだけを出す", () => {
  assert.match(script, /const emptyProject = Boolean\(state\.activeProject\) && listTasks\.length === 0/);
  assert.match(script, /elements\.list\.hidden = true/);
  assert.match(script, /このプロジェクトは空です。/);
  assert.match(script, /自動で追加されます。/);
});

test("期限サマリーを常設し期限切れと近い期限を強調する", () => {
  assert.match(html, /id="deadline-summary"/);
  ["overdue", "today", "tomorrow", "week"].forEach((key) => assert.match(html, new RegExp(`data-deadline-count="${key}"`)));
  assert.match(script, /function renderDeadlineSummary\(stats\)/);
  assert.match(script, /formatDeadlineLabel\(task\)/);
  assert.match(css, /\.task-card\[data-due-tone="overdue"\]/);
  assert.match(css, /\.task-card\[data-due-tone="week"\]/);
});

test("プロジェクト画面の期限サマリーは選択中のプロジェクトだけを集計する", () => {
  assert.match(script, /const dashboardTasks = state\.activeProject/);
  assert.match(script, /state\.tasks\.filter\(\(task\) => task\.project === state\.activeProject\)/);
  assert.match(script, /calculateDashboardStats\(dashboardTasks, todayISO\(\)\)/);
});

test("アプリアイコンとファビコンを読み込む", () => {
  assert.match(html, /rel="icon" type="image\/svg\+xml" href="assets\/icons\/tempo-icon\.svg"/);
  assert.match(html, /rel="icon"[^>]*href="assets\/icons\/favicon-32\.png"/);
  assert.match(html, /rel="apple-touch-icon"[^>]*href="assets\/icons\/apple-touch-icon\.png"/);
  assert.match(html, /rel="manifest" href="manifest\.webmanifest"/);
  ["assets/icons/tempo-icon.svg", "assets/icons/favicon-32.png", "assets/icons/apple-touch-icon.png", "assets/icons/tempo-icon-192.png", "assets/icons/tempo-icon-512.png", "manifest.webmanifest"].forEach((path) => assert.equal(fs.existsSync(path), true));
});

test("レポート画面で複数ジャンルの集計とグラフを表示する", () => {
  assert.match(html, /data-view="report"/);
  assert.match(html, /id="report-view"/);
  assert.match(script, /function renderReport\(stats\)/);
  assert.match(script, /conic-gradient/);
  assert.match(script, /completionTrend/);
  assert.match(css, /\.report-donut \{/);
  assert.match(css, /\.completion-chart \{/);
  assert.match(css, /body\.is-dark \.deadline-summary/);
});

test("ダークモードにタスクとタグ専用の配色がある", () => {
  assert.match(css, /body\.is-dark \.task-card \{/);
  assert.match(css, /body\.is-dark \.named-color \{/);
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

test("サイドバーにCSVとJSONの入出力操作が揃っている", () => {
  ["csv-import-button", "csv-export-button", "json-export-button", "json-import-button", "csv-file-input", "json-file-input"].forEach((id) => assert.match(html, new RegExp(`id="${id}"`)));
  assert.match(html, /accept="\.csv,text\/csv"/);
  assert.match(html, /accept="\.json,application\/json"/);
});

test("CSV取込画面に割り当て・プレビュー・取込条件がある", () => {
  ["csv-import-dialog", "csv-mapping-grid", "csv-preview-head", "csv-preview-body", "csv-import-mode", "csv-duplicate-mode", "execute-csv-import"].forEach((id) => assert.match(html, new RegExp(`id="${id}"`)));
  assert.match(script, /autoMapHeaders\(parsed\.headers\)/);
  assert.match(script, /csvRowsToTasks\(state\.csvParsed, state\.csvMapping\)/);
  assert.match(script, /mergeImportedTasks\(state\.tasks, converted\.tasks/);
  assert.match(script, /if \(!elements\.csvImportDialog\.open\) elements\.csvImportDialog\.showModal\(\)/);
});

test("ファイル選択を使わずCSV全文やExcel表を貼り付けて取り込める", () => {
  ["csv-paste-button", "csv-paste-panel", "csv-paste-input", "parse-csv-paste"].forEach((id) => assert.match(html, new RegExp(`id="${id}"`)));
  assert.match(html, /Excelからのタブ区切り貼り付けにも対応/);
  assert.match(script, /function prepareCsvText\(text, sourceName = "貼り付けたCSV"\)/);
  assert.match(script, /function openCsvPasteDialog\(\)/);
  assert.match(script, /prepareCsvText\(elements\.csvPasteInput\.value\)/);
  assert.match(css, /\.csv-paste-panel textarea/);
});

test("CSVはBOM付きで出力しJSONは設定を含めて保存・復元する", () => {
  assert.match(script, /tasksToCSV\(state\.tasks\)/);
  assert.match(script, /createBackup\(state\.tasks, state\.projects, currentBackupSettings\(\)\)/);
  assert.match(script, /parseBackup\(await file\.text\(\)\)/);
  assert.match(script, /applyBackupSettings\(backup\.settings\)/);
});

test("取込画面はスマホとダークモードにも対応する", () => {
  assert.match(css, /body\.is-dark \.import-dialog/);
  assert.match(css, /\.import-option-grid, \.mapping-grid \{ grid-template-columns: 1fr; \}/);
  assert.match(css, /\.csv-preview-scroll/);
});
