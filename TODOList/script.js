const STORAGE_KEY = "tempo-tasks-v1";
const THEME_KEY = "tempo-theme";
const MODE_KEY = "tempo-view-mode";
const SORT_PRIMARY_KEY = "tempo-sort-primary";
const SORT_SECONDARY_KEY = "tempo-sort-secondary";
const PROJECTS_KEY = "tempo-projects-v1";
const {
  makeId, normalizeTask, sortTasks, resolveProject, normalizeProjectName, addProject, applyTaskDetails, applyTableEdit, closeDialog,
  CSV_FIELDS, parseCSV, autoMapHeaders, csvRowsToTasks, mergeImportedTasks, tasksToCSV, createBackup, parseBackup,
} = TempoCore;

const todayISO = () => {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

const addDays = (iso, days) => {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const starterTasks = [
  normalizeTask({ title: "今日いちばん大事なことを決める", due: todayISO(), project: "個人", tags: ["集中"], priority: "high", status: "doing", estimate: 1, actual: 0.5, subtasks: [{ title: "候補を書き出す", completed: true }, { title: "ひとつ選ぶ", completed: false }], createdAt: Date.now() - 3000 }),
  normalizeTask({ title: "メールの返信をまとめて終わらせる", due: todayISO(), project: "仕事", tags: ["連絡"], priority: "normal", status: "todo", estimate: 1.5, createdAt: Date.now() - 2000 }),
  normalizeTask({ title: "帰りにコーヒー豆を買う", due: addDays(todayISO(), 1), project: "買い物", tags: ["外出"], priority: "low", status: "todo", estimate: 0.5, createdAt: Date.now() - 1000 }),
];

function loadTasks() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) ? saved.map(normalizeTask) : starterTasks;
  } catch {
    return starterTasks;
  }
}

function loadProjects(tasks) {
  try {
    const saved = JSON.parse(localStorage.getItem(PROJECTS_KEY));
    const savedProjects = Array.isArray(saved) ? saved : [];
    return [...new Set(["未分類", "個人", "仕事", "買い物", ...savedProjects, ...tasks.map((task) => task.project)].filter(Boolean))];
  } catch {
    return [...new Set(["未分類", "個人", "仕事", "買い物", ...tasks.map((task) => task.project)].filter(Boolean))];
  }
}

const loadedTasks = loadTasks();

const state = {
  tasks: loadedTasks,
  projects: loadProjects(loadedTasks),
  view: "today",
  activeProject: null,
  search: "",
  sortPrimary: localStorage.getItem(SORT_PRIMARY_KEY) || "due",
  sortSecondary: localStorage.getItem(SORT_SECONDARY_KEY) || "priority",
  mode: localStorage.getItem(MODE_KEY) || "list",
  subtaskDraft: [],
  csvParsed: null,
  csvMapping: {},
};

const elements = {
  form: document.querySelector("#task-form"),
  input: document.querySelector("#task-input"),
  list: document.querySelector("#task-list"),
  table: document.querySelector("#table-view"),
  board: document.querySelector("#kanban-board"),
  timeline: document.querySelector("#timeline-view"),
  template: document.querySelector("#task-template"),
  empty: document.querySelector("#empty-state"),
  summary: document.querySelector("#task-summary"),
  title: document.querySelector("#view-title"),
  subtitle: document.querySelector("#view-subtitle"),
  dateLabel: document.querySelector("#date-label"),
  search: document.querySelector("#search-input"),
  sortPrimary: document.querySelector("#sort-primary"),
  sortSecondary: document.querySelector("#sort-secondary"),
  due: document.querySelector("#due-select"),
  project: document.querySelector("#project-select"),
  priority: document.querySelector("#priority-select"),
  progress: document.querySelector("#progress-ring"),
  progressValue: document.querySelector("#progress-value"),
  toast: document.querySelector("#toast"),
  sidebar: document.querySelector("#sidebar"),
  scrim: document.querySelector("#sidebar-scrim"),
  projectNavigation: document.querySelector("#project-navigation"),
  dialog: document.querySelector("#task-dialog"),
  taskDialogEyebrow: document.querySelector("#task-dialog-eyebrow"),
  taskDialogTitle: document.querySelector("#task-dialog-title"),
  editForm: document.querySelector("#edit-form"),
  editId: document.querySelector("#edit-id"),
  editTitle: document.querySelector("#edit-title"),
  editStatus: document.querySelector("#edit-status"),
  editPriority: document.querySelector("#edit-priority"),
  editDue: document.querySelector("#edit-due"),
  editProject: document.querySelector("#edit-project"),
  editNewProject: document.querySelector("#edit-new-project"),
  editTags: document.querySelector("#edit-tags"),
  editEstimate: document.querySelector("#edit-estimate"),
  editActual: document.querySelector("#edit-actual"),
  effortBalance: document.querySelector("#effort-balance"),
  subtaskList: document.querySelector("#subtask-list"),
  subtaskInput: document.querySelector("#subtask-input"),
  subtaskProgress: document.querySelector("#subtask-progress"),
  saveTaskButton: document.querySelector("#save-task"),
  deleteTaskButton: document.querySelector("#delete-task"),
  projectDialog: document.querySelector("#project-dialog"),
  projectForm: document.querySelector("#project-form"),
  newProjectName: document.querySelector("#new-project-name"),
  csvFileInput: document.querySelector("#csv-file-input"),
  jsonFileInput: document.querySelector("#json-file-input"),
  csvImportDialog: document.querySelector("#csv-import-dialog"),
  csvImportForm: document.querySelector("#csv-import-form"),
  csvFileName: document.querySelector("#csv-file-name"),
  csvFileMeta: document.querySelector("#csv-file-meta"),
  csvMappingGrid: document.querySelector("#csv-mapping-grid"),
  csvPreviewHead: document.querySelector("#csv-preview-head"),
  csvPreviewBody: document.querySelector("#csv-preview-body"),
  csvPreviewSummary: document.querySelector("#csv-preview-summary"),
  csvImportMode: document.querySelector("#csv-import-mode"),
  csvDuplicateMode: document.querySelector("#csv-duplicate-mode"),
  csvImportError: document.querySelector("#csv-import-error"),
  executeCsvImport: document.querySelector("#execute-csv-import"),
};

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
}

function saveProjects() {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(state.projects));
}

function formatDate(iso) {
  if (!iso) return "期限なし";
  if (iso === todayISO()) return "今日";
  if (iso === addDays(todayISO(), 1)) return "明日";
  return new Intl.DateTimeFormat("ja-JP", { month: "short", day: "numeric", weekday: "short" }).format(new Date(`${iso}T12:00:00`));
}

function formatHours(value) {
  return Number(value) % 1 === 0 ? `${Number(value)}h` : `${Number(value).toFixed(1)}h`;
}

function matchesCommonFilters(task) {
  if (state.activeProject && task.project !== state.activeProject) return false;
  const query = state.search.toLowerCase();
  return !query || [task.title, task.project, ...task.tags].some((value) => String(value).toLowerCase().includes(query));
}

function getVisibleTasks(includeDone = false) {
  const today = todayISO();
  const filtered = state.tasks
    .filter((task) => {
      if (!matchesCommonFilters(task)) return false;
      if (state.view === "today" && (!task.due || task.due > today || (!includeDone && task.status === "done"))) return false;
      if (state.view === "all" && !includeDone && task.status === "done") return false;
      if (state.view === "upcoming" && (task.status === "done" || !task.due || task.due <= today)) return false;
      if (state.view === "completed" && task.status !== "done") return false;
      return true;
    });
  return sortTasks(filtered, state.sortPrimary, state.sortSecondary);
}

function makeTagRow(tags) {
  const row = document.createElement("div");
  row.className = "tag-row";
  tags.slice(0, 3).forEach((tag) => {
    const pill = document.createElement("span");
    pill.className = "tag-pill";
    pill.textContent = `#${tag}`;
    row.append(pill);
  });
  return row;
}

function renderList(tasks) {
  elements.list.replaceChildren();
  tasks.forEach((task) => {
    const card = elements.template.content.firstElementChild.cloneNode(true);
    const completedSubtasks = task.subtasks.filter((item) => item.completed).length;
    card.dataset.id = task.id;
    card.dataset.project = task.project;
    card.draggable = true;
    card.classList.toggle("is-completed", task.status === "done");
    card.querySelector(".task-title").textContent = task.title;
    card.querySelector(".task-date").textContent = formatDate(task.due);
    card.querySelector(".task-date").classList.toggle("is-overdue", Boolean(task.due && task.due < todayISO() && task.status !== "done"));
    card.querySelector(".task-project-label").textContent = task.project;
    const effort = card.querySelector(".effort-label");
    effort.textContent = task.estimate ? `${formatHours(task.actual)} / ${formatHours(task.estimate)}` : "";
    effort.hidden = !task.estimate;
    const subtask = card.querySelector(".subtask-label");
    subtask.textContent = task.subtasks.length ? `${completedSubtasks}/${task.subtasks.length}` : "";
    subtask.hidden = !task.subtasks.length;
    card.querySelector(".priority-label").hidden = task.priority !== "high";
    card.querySelector(".star-button").textContent = task.priority === "high" ? "★" : "☆";
    card.querySelector(".star-button").classList.toggle("is-high", task.priority === "high");
    card.querySelector(".task-check").setAttribute("aria-label", task.status === "done" ? "未完了に戻す" : "完了にする");
    card.querySelector(".tag-row").replaceWith(makeTagRow(task.tags));
    elements.list.append(card);
  });
}

function makeTableSelect(field, value, options, label) {
  const select = document.createElement("select");
  select.className = "table-field table-select";
  select.dataset.field = field;
  select.setAttribute("aria-label", label);
  options.forEach(([optionValue, optionLabel]) => {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = optionLabel;
    option.selected = optionValue === value;
    select.append(option);
  });
  return select;
}

function makeTableInput(field, value, type, label, className = "") {
  const input = document.createElement("input");
  input.className = `table-field ${className}`.trim();
  input.dataset.field = field;
  input.type = type;
  input.value = value ?? "";
  input.setAttribute("aria-label", label);
  if (type === "number") {
    input.min = "0";
    input.step = "0.25";
  }
  return input;
}

function renderTable(tasks) {
  const wrapper = document.createElement("div");
  wrapper.className = "table-scroll";
  const table = document.createElement("table");
  table.className = "task-table";
  table.innerHTML = `<thead><tr><th class="table-check-column">完了</th><th>タスク名</th><th>プロジェクト</th><th>ステータス</th><th>優先度</th><th>期限</th><th>タグ</th><th>工数（実績 / 見積）</th><th>サブタスク</th><th><span class="visually-hidden">操作</span></th></tr></thead>`;
  const body = document.createElement("tbody");
  const projects = getProjects();
  tasks.forEach((task) => {
    const row = document.createElement("tr");
    row.dataset.id = task.id;
    row.classList.toggle("is-completed", task.status === "done");
    row.classList.toggle("is-overdue", Boolean(task.due && task.due < todayISO() && task.status !== "done"));

    const checkCell = document.createElement("td");
    checkCell.className = "table-check-cell";
    const check = document.createElement("input");
    check.type = "checkbox";
    check.className = "table-complete-check";
    check.dataset.field = "completed";
    check.checked = task.status === "done";
    check.setAttribute("aria-label", task.status === "done" ? `「${task.title}」を未完了に戻す` : `「${task.title}」を完了にする`);
    checkCell.append(check);

    const titleCell = document.createElement("td");
    titleCell.className = "table-title-cell";
    titleCell.append(makeTableInput("title", task.title, "text", `${task.title}のタスク名`, "table-title-input"));

    const projectCell = document.createElement("td");
    projectCell.append(makeTableSelect("project", task.project, projects.map((project) => [project, project]), `${task.title}のプロジェクト`));

    const statusCell = document.createElement("td");
    statusCell.append(makeTableSelect("status", task.status, [["todo", "未着手"], ["doing", "進行中"], ["done", "完了"]], `${task.title}のステータス`));

    const priorityCell = document.createElement("td");
    priorityCell.append(makeTableSelect("priority", task.priority, [["high", "優先"], ["normal", "通常"], ["low", "低め"]], `${task.title}の優先度`));

    const dueCell = document.createElement("td");
    dueCell.append(makeTableInput("due", task.due || "", "date", `${task.title}の期限`, "table-date-input"));

    const tagsCell = document.createElement("td");
    tagsCell.append(makeTableInput("tags", task.tags.join(", "), "text", `${task.title}のタグ`, "table-tags-input"));

    const effortCell = document.createElement("td");
    effortCell.className = "table-effort-cell";
    effortCell.append(
      makeTableInput("actual", task.actual || "", "number", `${task.title}の実績工数`, "table-hours-input"),
      document.createTextNode(" / "),
      makeTableInput("estimate", task.estimate || "", "number", `${task.title}の見積工数`, "table-hours-input"),
    );

    const completedSubtasks = task.subtasks.filter((item) => item.completed).length;
    const subtaskCell = document.createElement("td");
    subtaskCell.className = "table-subtask-cell";
    const subtaskText = document.createElement("span");
    subtaskText.textContent = task.subtasks.length ? `${completedSubtasks} / ${task.subtasks.length}` : "—";
    subtaskCell.append(subtaskText);
    if (task.subtasks.length) {
      const progress = document.createElement("span");
      progress.className = "table-subtask-progress";
      progress.innerHTML = `<span style="width:${Math.round((completedSubtasks / task.subtasks.length) * 100)}%"></span>`;
      subtaskCell.append(progress);
    }

    const actionCell = document.createElement("td");
    const detailButton = document.createElement("button");
    detailButton.type = "button";
    detailButton.className = "table-detail-button";
    detailButton.dataset.action = "detail";
    detailButton.textContent = "詳細";
    detailButton.setAttribute("aria-label", `「${task.title}」の詳細を開く`);
    actionCell.append(detailButton);

    row.append(checkCell, titleCell, projectCell, statusCell, priorityCell, dueCell, tagsCell, effortCell, subtaskCell, actionCell);
    body.append(row);
  });
  table.append(body);
  wrapper.append(table);
  elements.table.replaceChildren(wrapper);
}

function renderBoard() {
  const tasks = getVisibleTasks(true);
  const columns = [
    { id: "todo", title: "未着手", dot: "" },
    { id: "doing", title: "進行中", dot: "status-dot--doing" },
    { id: "done", title: "完了", dot: "status-dot--done" },
  ];
  elements.board.replaceChildren();
  columns.forEach((column) => {
    const columnTasks = tasks.filter((task) => task.status === column.id);
    const section = document.createElement("section");
    section.className = "kanban-column";
    section.dataset.status = column.id;
    section.innerHTML = `<header class="kanban-heading"><div><span class="status-dot ${column.dot}"></span><h2>${column.title}</h2></div><span class="kanban-count">${columnTasks.length}</span></header><div class="kanban-stack"></div>`;
    const stack = section.querySelector(".kanban-stack");
    columnTasks.forEach((task) => {
      const completed = task.subtasks.filter((item) => item.completed).length;
      const progress = task.subtasks.length ? Math.round((completed / task.subtasks.length) * 100) : 0;
      const card = document.createElement("article");
      card.className = "kanban-card";
      card.dataset.id = task.id;
      card.draggable = true;
      const title = document.createElement("h3");
      title.textContent = task.title;
      card.append(title, makeTagRow(task.tags));
      if (task.subtasks.length) {
        const bar = document.createElement("div");
        bar.className = "kanban-progress";
        bar.innerHTML = `<span style="width:${progress}%"></span>`;
        card.append(bar);
      }
      const meta = document.createElement("div");
      meta.className = "kanban-card-meta";
      const project = document.createElement("span");
      project.className = "kanban-card-project";
      project.textContent = task.project;
      const detail = document.createElement("span");
      detail.textContent = `${formatDate(task.due)}${task.estimate ? ` · ${formatHours(task.estimate)}` : ""}`;
      meta.append(project, detail);
      card.append(meta);
      stack.append(card);
    });
    elements.board.append(section);
  });
  return tasks.length;
}

function renderTimeline() {
  const tasks = sortTasks(
    state.tasks.filter((task) => matchesCommonFilters(task) && (state.view !== "completed" || task.status === "done")),
    state.sortPrimary,
    state.sortSecondary,
  );
  const grid = document.createElement("div");
  grid.className = "timeline-grid";
  for (let index = 0; index < 7; index += 1) {
    const iso = addDays(todayISO(), index);
    const dayTasks = tasks.filter((task) => task.due === iso);
    const day = document.createElement("section");
    day.className = `timeline-day${index === 0 ? " is-today" : ""}`;
    const date = new Date(`${iso}T12:00:00`);
    day.innerHTML = `<header class="timeline-day-header"><span>${new Intl.DateTimeFormat("ja-JP", { weekday: "short" }).format(date)}</span><strong>${date.getDate()}</strong></header><div class="timeline-day-list"></div>`;
    const dayList = day.querySelector(".timeline-day-list");
    dayTasks.forEach((task) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "timeline-task";
      item.dataset.id = task.id;
      item.dataset.project = task.project;
      const title = document.createElement("strong");
      title.textContent = task.title;
      const meta = document.createElement("span");
      meta.textContent = `${task.project}${task.estimate ? ` · ${formatHours(task.estimate)}` : ""}`;
      item.append(title, meta);
      dayList.append(item);
    });
    grid.append(day);
  }
  elements.timeline.replaceChildren(grid);
  const undated = tasks.filter((task) => !task.due && task.status !== "done").length;
  if (undated) {
    const note = document.createElement("div");
    note.className = "timeline-undated";
    note.textContent = `○ 期限未設定のタスクが ${undated}件あります`;
    elements.timeline.append(note);
  }
  return tasks.filter((task) => task.due && task.due >= todayISO() && task.due <= addDays(todayISO(), 6)).length;
}

function render() {
  const listTasks = getVisibleTasks(false);
  elements.list.hidden = state.mode !== "list";
  elements.table.hidden = state.mode !== "table";
  elements.board.hidden = state.mode !== "board";
  elements.timeline.hidden = state.mode !== "timeline";
  let visibleCount = listTasks.length;
  if (state.mode === "list") renderList(listTasks);
  if (state.mode === "table") renderTable(listTasks);
  if (state.mode === "board") visibleCount = renderBoard();
  if (state.mode === "timeline") visibleCount = renderTimeline();
  elements.empty.hidden = visibleCount !== 0 || state.mode === "timeline";
  elements.summary.textContent = visibleCount ? `${visibleCount}件のタスク` : "タスクはありません";
  document.querySelectorAll(".view-mode-button").forEach((button) => button.classList.toggle("is-active", button.dataset.mode === state.mode));
  updateNavigationCounts();
  updateProjectNavigation();
  updateHeading();
  updateProgress();
}

function updateNavigationCounts() {
  const today = todayISO();
  const counts = {
    today: state.tasks.filter((task) => task.status !== "done" && task.due && task.due <= today).length,
    all: state.tasks.filter((task) => task.status !== "done").length,
    upcoming: state.tasks.filter((task) => task.status !== "done" && task.due && task.due > today).length,
    completed: state.tasks.filter((task) => task.status === "done").length,
  };
  Object.entries(counts).forEach(([key, value]) => {
    document.querySelector(`[data-count="${key}"]`).textContent = value;
  });
}

function getProjects() {
  return [...new Set([...state.projects, ...state.tasks.map((task) => task.project).filter(Boolean)])];
}

function updateProjectNavigation() {
  const colors = ["dot--blue", "dot--coral", "dot--yellow"];
  elements.projectNavigation.replaceChildren();
  getProjects().forEach((project, index) => {
    const button = document.createElement("button");
    button.className = `list-item${state.activeProject === project ? " is-active" : ""}`;
    button.dataset.project = project;
    const dot = document.createElement("span");
    dot.className = `dot ${colors[index % colors.length]}`;
    const label = document.createElement("span");
    label.textContent = project;
    const count = document.createElement("span");
    count.className = "project-count";
    count.textContent = state.tasks.filter((task) => task.project === project && task.status !== "done").length;
    button.append(dot, label, count);
    elements.projectNavigation.append(button);
  });

  const selected = state.activeProject || elements.project.value || "未分類";
  elements.project.replaceChildren(...getProjects().map((project) => new Option(project, project)));
  elements.project.value = getProjects().includes(selected) ? selected : "未分類";
  elements.project.disabled = Boolean(state.activeProject);
  const editSelected = elements.editProject.value;
  elements.editProject.replaceChildren(...getProjects().map((project) => new Option(project, project)));
  if (getProjects().includes(editSelected)) elements.editProject.value = editSelected;
}

function updateHeading() {
  const labels = {
    today: ["今日", "今日に集中しましょう。"],
    all: ["すべてのタスク", "やることを、ひと目で。"],
    upcoming: ["これから", "先の予定を軽やかに整えましょう。"],
    completed: ["完了したタスク", "積み重ねた成果です。"],
  };
  const [title, subtitle] = state.activeProject ? [state.activeProject, `${state.activeProject}プロジェクトのタスクです。`] : labels[state.view];
  elements.title.textContent = title;
  elements.subtitle.textContent = state.search ? `「${state.search}」の検索結果` : subtitle;
}

function updateProgress() {
  const todayTasks = state.tasks.filter((task) => task.due === todayISO());
  const completed = todayTasks.filter((task) => task.status === "done").length;
  const percent = todayTasks.length ? Math.round((completed / todayTasks.length) * 100) : 0;
  elements.progress.style.setProperty("--progress", `${percent * 3.6}deg`);
  elements.progressValue.textContent = `${percent}%`;
  elements.progress.setAttribute("aria-label", `今日の達成率 ${percent}%`);
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => elements.toast.classList.remove("is-visible"), 1800);
}

function downloadTextFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function refreshCsvPreview() {
  elements.csvImportError.textContent = "";
  elements.csvPreviewHead.replaceChildren();
  elements.csvPreviewBody.replaceChildren();
  if (!state.csvParsed) return;
  const { tasks, skippedRows } = csvRowsToTasks(state.csvParsed, state.csvMapping);
  const headers = ["タスク名", "状態", "優先度", "期限", "プロジェクト"];
  const headerRow = document.createElement("tr");
  headers.forEach((label) => { const th = document.createElement("th"); th.textContent = label; headerRow.append(th); });
  elements.csvPreviewHead.append(headerRow);
  const statusLabels = { todo: "未着手", doing: "進行中", done: "完了" };
  const priorityLabels = { high: "高", normal: "通常", low: "低" };
  tasks.slice(0, 5).forEach((task) => {
    const row = document.createElement("tr");
    [task.title, statusLabels[task.status], priorityLabels[task.priority], task.due || "期限なし", task.project].forEach((value) => {
      const cell = document.createElement("td"); cell.textContent = value; cell.title = value; row.append(cell);
    });
    elements.csvPreviewBody.append(row);
  });
  elements.csvPreviewSummary.textContent = `${tasks.length}件${skippedRows.length ? `・空欄${skippedRows.length}行を除外` : ""}`;
  const hasTitle = Number(state.csvMapping.title) >= 0;
  elements.executeCsvImport.disabled = !hasTitle || !tasks.length;
  if (!hasTitle) elements.csvImportError.textContent = "「タスク名」に使う列を選択してください。";
}

function renderCsvMapping() {
  elements.csvMappingGrid.replaceChildren();
  CSV_FIELDS.forEach((field) => {
    const row = document.createElement("div");
    row.className = "mapping-row";
    const label = document.createElement("label");
    label.textContent = field.label;
    if (field.required) { const required = document.createElement("b"); required.textContent = " 必須"; label.append(required); }
    const select = document.createElement("select");
    select.dataset.field = field.key;
    select.setAttribute("aria-label", `${field.label}に割り当てるCSV列`);
    select.append(new Option("使用しない", "-1"));
    state.csvParsed.headers.forEach((header, index) => select.append(new Option(header, String(index))));
    select.value = String(state.csvMapping[field.key] ?? -1);
    row.append(label, select);
    elements.csvMappingGrid.append(row);
  });
  refreshCsvPreview();
}

async function prepareCsvImport(file) {
  try {
    const parsed = parseCSV(await file.text());
    if (!parsed.headers.length || !parsed.rows.length) throw new Error("データ行が見つかりませんでした");
    state.csvParsed = parsed;
    state.csvMapping = autoMapHeaders(parsed.headers);
    elements.csvFileName.textContent = file.name;
    elements.csvFileMeta.textContent = `${parsed.rows.length}行・${parsed.headers.length}列`;
    elements.csvImportError.textContent = "";
    renderCsvMapping();
    if (!elements.csvImportDialog.open) elements.csvImportDialog.showModal();
  } catch (error) {
    state.csvParsed = null;
    showToast(`CSVを読み込めませんでした：${error.message}`);
  }
}

function currentBackupSettings() {
  return {
    theme: document.body.classList.contains("is-dark") ? "dark" : "light",
    mode: state.mode,
    sortPrimary: state.sortPrimary,
    sortSecondary: state.sortSecondary,
  };
}

function applyBackupSettings(settings) {
  if (settings.theme === "dark" || settings.theme === "light") {
    document.body.classList.toggle("is-dark", settings.theme === "dark");
    localStorage.setItem(THEME_KEY, settings.theme);
  }
  if (["list", "table", "board", "timeline"].includes(settings.mode)) {
    state.mode = settings.mode;
    localStorage.setItem(MODE_KEY, settings.mode);
  }
  if (["due", "priority", "status", "newest", "oldest"].includes(settings.sortPrimary)) {
    state.sortPrimary = settings.sortPrimary;
    elements.sortPrimary.value = settings.sortPrimary;
    localStorage.setItem(SORT_PRIMARY_KEY, settings.sortPrimary);
  }
  if (["priority", "due", "status", "project", "none"].includes(settings.sortSecondary)) {
    state.sortSecondary = settings.sortSecondary;
    elements.sortSecondary.value = settings.sortSecondary;
    localStorage.setItem(SORT_SECONDARY_KEY, settings.sortSecondary);
  }
}

function setView(view, project = null) {
  state.view = view;
  state.activeProject = project;
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("is-active", !project && item.dataset.view === view));
  closeSidebar();
  render();
}

function openSidebar() {
  elements.sidebar.classList.add("is-open");
  elements.scrim.classList.add("is-open");
}

function closeSidebar() {
  elements.sidebar.classList.remove("is-open");
  elements.scrim.classList.remove("is-open");
}

function updateEffortPreview() {
  const estimate = Number(elements.editEstimate.value) || 0;
  const actual = Number(elements.editActual.value) || 0;
  if (!estimate) elements.effortBalance.textContent = actual ? `実績 ${formatHours(actual)}` : "未設定";
  else {
    const difference = estimate - actual;
    elements.effortBalance.textContent = difference >= 0 ? `残り ${formatHours(difference)}` : `${formatHours(Math.abs(difference))} 超過`;
  }
}

function renderSubtaskEditor() {
  elements.subtaskList.replaceChildren();
  elements.subtaskList.className = "subtask-list";
  state.subtaskDraft.forEach((subtask) => {
    const row = document.createElement("div");
    row.className = `subtask-row${subtask.completed ? " is-done" : ""}`;
    row.dataset.id = subtask.id;
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = subtask.completed;
    check.setAttribute("aria-label", `${subtask.title}を完了にする`);
    const title = document.createElement("span");
    title.textContent = subtask.title;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "subtask-remove";
    remove.setAttribute("aria-label", "サブタスクを削除");
    remove.textContent = "×";
    row.append(check, title, remove);
    elements.subtaskList.append(row);
  });
  const done = state.subtaskDraft.filter((item) => item.completed).length;
  elements.subtaskProgress.textContent = `${done} / ${state.subtaskDraft.length}`;
}

function openTaskDialog(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  elements.taskDialogEyebrow.textContent = "TASK DETAILS";
  elements.taskDialogTitle.textContent = "タスクを編集";
  elements.saveTaskButton.textContent = "変更を保存";
  elements.deleteTaskButton.hidden = false;
  elements.editId.value = task.id;
  elements.editTitle.value = task.title;
  elements.editStatus.value = task.status;
  elements.editPriority.value = task.priority;
  elements.editDue.value = task.due || "";
  elements.editProject.value = task.project;
  elements.editNewProject.value = "";
  elements.editTags.value = task.tags.join(", ");
  elements.editEstimate.value = task.estimate || "";
  elements.editActual.value = task.actual || "";
  state.subtaskDraft = task.subtasks.map((item) => ({ ...item }));
  renderSubtaskEditor();
  updateEffortPreview();
  elements.dialog.showModal();
  requestAnimationFrame(() => elements.editTitle.focus());
}

function getQuickDueDate() {
  if (elements.due.value === "today") return todayISO();
  if (elements.due.value === "tomorrow") return addDays(todayISO(), 1);
  return null;
}

function openNewTaskDialog() {
  elements.taskDialogEyebrow.textContent = "NEW TASK";
  elements.taskDialogTitle.textContent = "タスクを詳しく追加";
  elements.saveTaskButton.textContent = "タスクを追加";
  elements.deleteTaskButton.hidden = true;
  elements.editId.value = "";
  elements.editTitle.value = elements.input.value.trim();
  elements.editStatus.value = "todo";
  elements.editPriority.value = elements.priority.value;
  elements.editDue.value = getQuickDueDate() || "";
  elements.editProject.value = resolveProject(state.activeProject, elements.project.value);
  elements.editNewProject.value = "";
  elements.editTags.value = "";
  elements.editEstimate.value = "";
  elements.editActual.value = "";
  state.subtaskDraft = [];
  renderSubtaskEditor();
  updateEffortPreview();
  elements.dialog.showModal();
  requestAnimationFrame(() => elements.editTitle.focus());
}

function addSubtask() {
  const title = elements.subtaskInput.value.trim();
  if (!title) return;
  state.subtaskDraft.push({ id: makeId(), title, completed: false });
  elements.subtaskInput.value = "";
  renderSubtaskEditor();
  elements.subtaskInput.focus();
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = elements.input.value.trim();
  if (!title) return;
  const dueChoice = elements.due.value;
  const due = dueChoice === "today" ? todayISO() : dueChoice === "tomorrow" ? addDays(todayISO(), 1) : null;
  state.tasks.unshift(normalizeTask({ title, due, project: resolveProject(state.activeProject, elements.project.value), priority: elements.priority.value, status: "todo", createdAt: Date.now() }));
  saveTasks();
  elements.input.value = "";
  if (state.view === "completed") setView("all");
  else render();
  showToast("タスクを追加しました");
});

document.querySelector("#open-detailed-add").addEventListener("click", openNewTaskDialog);

elements.list.addEventListener("click", (event) => {
  const card = event.target.closest(".task-card");
  if (!card) return;
  const task = state.tasks.find((item) => item.id === card.dataset.id);
  if (!task) return;
  if (event.target.closest(".task-check")) {
    task.status = task.status === "done" ? "todo" : "done";
    task.completed = task.status === "done";
    task.completedAt = task.completed ? Date.now() : null;
    saveTasks(); render();
    showToast(task.completed ? "おつかれさま！ 1つ完了しました" : "未完了に戻しました");
  } else if (event.target.closest(".star-button")) {
    task.priority = task.priority === "high" ? "normal" : "high";
    saveTasks(); render();
  } else {
    openTaskDialog(task.id);
  }
});

elements.table.addEventListener("click", (event) => {
  const detailButton = event.target.closest("[data-action='detail']");
  const row = event.target.closest("tr[data-id]");
  if (detailButton && row) openTaskDialog(row.dataset.id);
});

elements.table.addEventListener("change", (event) => {
  const field = event.target.dataset.field;
  const row = event.target.closest("tr[data-id]");
  const task = state.tasks.find((item) => item.id === row?.dataset.id);
  if (!field || !task) return;
  const nextField = field === "completed" ? "status" : field;
  const nextValue = field === "completed" ? (event.target.checked ? "done" : "todo") : event.target.value;
  const updated = applyTableEdit(task, nextField, nextValue);
  if (field === "title" && updated.title === task.title && !String(nextValue).trim()) {
    render();
    return showToast("タスク名は空にできません");
  }
  Object.assign(task, updated);
  if (nextField === "project" && !state.projects.includes(task.project)) {
    state.projects.push(task.project);
    saveProjects();
  }
  saveTasks();
  render();
  showToast("テーブルの変更を保存しました");
});

elements.table.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && event.target.matches("input.table-field")) {
    event.preventDefault();
    event.target.blur();
  }
});

elements.board.addEventListener("click", (event) => {
  const card = event.target.closest(".kanban-card");
  if (card) openTaskDialog(card.dataset.id);
});

elements.timeline.addEventListener("click", (event) => {
  const task = event.target.closest(".timeline-task");
  if (task) openTaskDialog(task.dataset.id);
});

document.addEventListener("dragstart", (event) => {
  const card = event.target.closest("[data-id][draggable='true']");
  if (!card) return;
  event.dataTransfer.setData("text/plain", card.dataset.id);
  event.dataTransfer.effectAllowed = "move";
  card.classList.add("is-dragging");
});

document.addEventListener("dragend", (event) => event.target.closest("[draggable='true']")?.classList.remove("is-dragging"));
elements.board.addEventListener("dragover", (event) => {
  const column = event.target.closest(".kanban-column");
  if (!column) return;
  event.preventDefault();
  document.querySelectorAll(".kanban-column").forEach((item) => item.classList.toggle("is-drag-over", item === column));
});
elements.board.addEventListener("dragleave", (event) => {
  const column = event.target.closest(".kanban-column");
  if (column && !column.contains(event.relatedTarget)) column.classList.remove("is-drag-over");
});
elements.board.addEventListener("drop", (event) => {
  const column = event.target.closest(".kanban-column");
  if (!column) return;
  event.preventDefault();
  const task = state.tasks.find((item) => item.id === event.dataTransfer.getData("text/plain"));
  if (!task) return;
  task.status = column.dataset.status;
  task.completed = task.status === "done";
  task.completedAt = task.completed ? Date.now() : null;
  saveTasks(); render(); showToast(`「${column.querySelector("h2").textContent}」へ移動しました`);
});

document.querySelectorAll(".nav-item").forEach((item) => item.addEventListener("click", () => setView(item.dataset.view)));
elements.projectNavigation.addEventListener("click", (event) => {
  const button = event.target.closest("[data-project]");
  if (button) setView("all", button.dataset.project);
});
document.querySelectorAll(".view-mode-button").forEach((button) => button.addEventListener("click", () => {
  state.mode = button.dataset.mode;
  localStorage.setItem(MODE_KEY, state.mode);
  render();
}));

elements.search.addEventListener("input", () => { state.search = elements.search.value.trim(); render(); });
elements.sortPrimary.value = state.sortPrimary;
elements.sortSecondary.value = state.sortSecondary;
elements.sortPrimary.addEventListener("change", () => {
  state.sortPrimary = elements.sortPrimary.value;
  localStorage.setItem(SORT_PRIMARY_KEY, state.sortPrimary);
  render();
});
elements.sortSecondary.addEventListener("change", () => {
  state.sortSecondary = elements.sortSecondary.value;
  localStorage.setItem(SORT_SECONDARY_KEY, state.sortSecondary);
  render();
});

elements.editForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const isCreating = !elements.editId.value;
  const baseTask = isCreating
    ? normalizeTask({ title: elements.editTitle.value.trim(), createdAt: Date.now() })
    : state.tasks.find((item) => item.id === elements.editId.value);
  if (!baseTask || !elements.editTitle.value.trim()) return;
  const task = applyTaskDetails(baseTask, {
    title: elements.editTitle.value,
    status: elements.editStatus.value,
    priority: elements.editPriority.value,
    due: elements.editDue.value,
    project: normalizeProjectName(elements.editNewProject.value) || elements.editProject.value,
    tags: elements.editTags.value,
    estimate: elements.editEstimate.value,
    actual: elements.editActual.value,
    subtasks: state.subtaskDraft,
  });
  if (!state.projects.includes(task.project)) {
    state.projects.push(task.project);
    saveProjects();
  }
  if (isCreating) state.tasks.unshift(task);
  else Object.assign(baseTask, task);
  saveTasks();
  elements.dialog.close();
  if (isCreating) elements.input.value = "";
  render();
  showToast(isCreating ? "詳しい設定でタスクを追加しました" : "変更を保存しました");
});

document.querySelector("#open-project-dialog").addEventListener("click", () => {
  elements.newProjectName.value = "";
  elements.projectDialog.showModal();
  requestAnimationFrame(() => elements.newProjectName.focus());
});

elements.projectForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const result = addProject(state.projects, elements.newProjectName.value);
  if (!result.name) return;
  state.projects = result.projects;
  if (result.added) {
    saveProjects();
  }
  elements.projectDialog.close();
  setView("all", result.name);
  showToast(result.added ? "プロジェクトを追加しました" : "既存のプロジェクトを開きました");
});

elements.newProjectName.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.isComposing) return;
  event.preventDefault();
  elements.projectForm.requestSubmit();
});

document.querySelector("#csv-import-button").addEventListener("click", () => {
  elements.csvFileInput.value = "";
  elements.csvFileInput.click();
});
document.querySelector("#change-csv-file").addEventListener("click", () => {
  elements.csvFileInput.value = "";
  elements.csvFileInput.click();
});
elements.csvFileInput.addEventListener("change", () => {
  const file = elements.csvFileInput.files?.[0];
  if (file) prepareCsvImport(file);
});
elements.csvMappingGrid.addEventListener("change", (event) => {
  const select = event.target.closest("select[data-field]");
  if (!select) return;
  state.csvMapping[select.dataset.field] = Number(select.value);
  refreshCsvPreview();
});
elements.csvImportForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!state.csvParsed || Number(state.csvMapping.title) < 0) return refreshCsvPreview();
  const converted = csvRowsToTasks(state.csvParsed, state.csvMapping);
  if (!converted.tasks.length) return refreshCsvPreview();
  const replace = elements.csvImportMode.value === "replace";
  if (replace && !confirm(`現在の${state.tasks.length}件を削除し、CSVのタスクに置き換えますか？`)) return;
  const merged = mergeImportedTasks(state.tasks, converted.tasks, {
    mode: replace ? "replace" : "append",
    skipDuplicates: elements.csvDuplicateMode.value === "skip",
  });
  state.tasks = merged.tasks;
  const importedProjects = converted.tasks.map((task) => task.project);
  state.projects = replace
    ? [...new Set(["未分類", "個人", "仕事", "買い物", ...importedProjects])]
    : [...new Set([...state.projects, ...importedProjects])];
  saveTasks();
  saveProjects();
  elements.csvImportDialog.close();
  setView("all");
  const skippedTotal = merged.skipped + converted.skippedRows.length;
  showToast(`${merged.added}件を取り込みました${skippedTotal ? `（${skippedTotal}件スキップ）` : ""}`);
});

document.querySelector("#csv-export-button").addEventListener("click", () => {
  const date = todayISO().replace(/-/g, "");
  downloadTextFile(`tempo-tasks-${date}.csv`, tasksToCSV(state.tasks), "text/csv;charset=utf-8");
  showToast(`${state.tasks.length}件をCSVへ出力しました`);
});

document.querySelector("#json-export-button").addEventListener("click", () => {
  const date = todayISO().replace(/-/g, "");
  downloadTextFile(`tempo-backup-${date}.json`, createBackup(state.tasks, state.projects, currentBackupSettings()), "application/json;charset=utf-8");
  showToast("JSONバックアップを保存しました");
});

document.querySelector("#json-import-button").addEventListener("click", () => {
  elements.jsonFileInput.value = "";
  elements.jsonFileInput.click();
});
elements.jsonFileInput.addEventListener("change", async () => {
  const file = elements.jsonFileInput.files?.[0];
  if (!file) return;
  try {
    const backup = parseBackup(await file.text());
    if (!confirm(`現在のデータを、バックアップの${backup.tasks.length}件に置き換えますか？`)) return;
    state.tasks = backup.tasks;
    state.projects = [...new Set(["未分類", "個人", "仕事", "買い物", ...backup.projects, ...backup.tasks.map((task) => task.project)])];
    applyBackupSettings(backup.settings);
    saveTasks();
    saveProjects();
    setView("all");
    showToast(`${state.tasks.length}件をバックアップから復元しました`);
  } catch (error) {
    showToast(`JSONを復元できませんでした：${error.message}`);
  }
});

document.addEventListener("click", (event) => {
  const closeButton = event.target.closest("[data-close-dialog]");
  if (!closeButton) return;
  closeDialog(document.getElementById(closeButton.dataset.closeDialog));
});

elements.editEstimate.addEventListener("input", updateEffortPreview);
elements.editActual.addEventListener("input", updateEffortPreview);
document.querySelector("#add-subtask").addEventListener("click", addSubtask);
elements.subtaskInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") { event.preventDefault(); addSubtask(); }
});
elements.subtaskList.addEventListener("change", (event) => {
  const row = event.target.closest(".subtask-row");
  const subtask = state.subtaskDraft.find((item) => item.id === row?.dataset.id);
  if (subtask && event.target.matches("input[type='checkbox']")) { subtask.completed = event.target.checked; renderSubtaskEditor(); }
});
elements.subtaskList.addEventListener("click", (event) => {
  const row = event.target.closest(".subtask-row");
  if (row && event.target.closest(".subtask-remove")) {
    state.subtaskDraft = state.subtaskDraft.filter((item) => item.id !== row.dataset.id);
    renderSubtaskEditor();
  }
});

document.querySelector("#delete-task").addEventListener("click", () => {
  const task = state.tasks.find((item) => item.id === elements.editId.value);
  if (!task || !confirm(`「${task.title}」を削除しますか？`)) return;
  state.tasks = state.tasks.filter((item) => item.id !== task.id);
  saveTasks(); elements.dialog.close(); render(); showToast("タスクを削除しました");
});

document.querySelector("#clear-completed").addEventListener("click", () => {
  const completedCount = state.tasks.filter((task) => task.status === "done").length;
  if (!completedCount) return showToast("整理する完了タスクはありません");
  if (!confirm(`${completedCount}件の完了タスクを削除しますか？`)) return;
  state.tasks = state.tasks.filter((task) => task.status !== "done");
  saveTasks(); render(); showToast(`${completedCount}件の完了タスクを整理しました`);
});

document.querySelector("#focus-add").addEventListener("click", () => elements.input.focus());
document.querySelector("#menu-button").addEventListener("click", openSidebar);
document.querySelector("#sidebar-close").addEventListener("click", closeSidebar);
elements.scrim.addEventListener("click", closeSidebar);
document.querySelector("#theme-toggle").addEventListener("click", () => {
  const dark = document.body.classList.toggle("is-dark");
  localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
});

document.addEventListener("keydown", (event) => {
  if (event.ctrlKey && event.key.toLowerCase() === "k") { event.preventDefault(); elements.search.focus(); }
  if (event.key === "Escape" && !elements.dialog.open) { elements.search.blur(); closeSidebar(); }
});

if (localStorage.getItem(THEME_KEY) === "dark") document.body.classList.add("is-dark");
elements.dateLabel.textContent = new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric", weekday: "long" }).format(new Date());
saveTasks();
render();
