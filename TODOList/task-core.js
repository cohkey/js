(function initializeTempoCore(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.TempoCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createTempoCore() {
  const makeId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const normalizeTask = (task) => ({
    id: task.id || makeId(),
    title: task.title || "名称未設定のタスク",
    due: task.due || null,
    project: task.project || task.list || "未分類",
    tags: Array.isArray(task.tags) ? task.tags : [],
    priority: task.priority || "normal",
    status: task.status || (task.completed ? "done" : "todo"),
    completed: task.status ? task.status === "done" : Boolean(task.completed),
    estimate: Number(task.estimate) || 0,
    actual: Number(task.actual) || 0,
    subtasks: Array.isArray(task.subtasks)
      ? task.subtasks.map((item) => ({ id: item.id || makeId(), title: item.title || "サブタスク", completed: Boolean(item.completed) }))
      : [],
    createdAt: task.createdAt || Date.now(),
    completedAt: task.completedAt || null,
    repeat: ["daily", "weekdays", "weekly", "monthly"].includes(task.repeat) ? task.repeat : "none",
    deletedAt: task.deletedAt || null,
    trackedSeconds: Math.max(0, Number(task.trackedSeconds) || 0),
    timerStartedAt: Number(task.timerStartedAt) > 0 ? Number(task.timerStartedAt) : null,
  });

  function nextRecurringDue(due, repeat, today = new Date().toISOString().slice(0, 10)) {
    if (!["daily", "weekdays", "weekly", "monthly"].includes(repeat)) return null;
    const source = due && due > today ? due : today;
    const date = new Date(`${source}T12:00:00`);
    if (repeat === "daily") date.setDate(date.getDate() + 1);
    if (repeat === "weekly") date.setDate(date.getDate() + 7);
    if (repeat === "weekdays") {
      do date.setDate(date.getDate() + 1); while ([0, 6].includes(date.getDay()));
    }
    if (repeat === "monthly") {
      const originalDay = date.getDate();
      date.setDate(1);
      date.setMonth(date.getMonth() + 1);
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      date.setDate(Math.min(originalDay, lastDay));
    }
    return date.toISOString().slice(0, 10);
  }

  function createNextRecurringTask(task, today, now = Date.now()) {
    const due = nextRecurringDue(task.due, task.repeat, today);
    if (!due) return null;
    return normalizeTask({
      ...task,
      id: makeId(),
      due,
      status: "todo",
      completed: false,
      completedAt: null,
      actual: 0,
      trackedSeconds: 0,
      timerStartedAt: null,
      subtasks: task.subtasks.map((item) => ({ ...item, id: makeId(), completed: false })),
      createdAt: now,
    });
  }

  function getLiveActualHours(task, now = Date.now()) {
    const activeSeconds = task.timerStartedAt ? Math.max(0, (now - task.timerStartedAt) / 1000) : 0;
    return Math.max(0, Number(task.actual) || 0) + (activeSeconds / 3600);
  }

  function startTaskTimer(task, now = Date.now()) {
    if (task.timerStartedAt) return { ...task };
    return { ...task, timerStartedAt: now };
  }

  function stopTaskTimer(task, now = Date.now()) {
    if (!task.timerStartedAt) return { ...task };
    const elapsedSeconds = Math.max(0, Math.round((now - task.timerStartedAt) / 1000));
    return {
      ...task,
      actual: Math.max(0, Number(task.actual) || 0) + (elapsedSeconds / 3600),
      trackedSeconds: Math.max(0, Number(task.trackedSeconds) || 0) + elapsedSeconds,
      timerStartedAt: null,
    };
  }

  function normalizeSavedFilter(filter) {
    const dueValues = ["any", "overdue", "today", "week", "none"];
    return {
      id: filter.id || makeId(),
      name: String(filter.name || "").trim().slice(0, 30),
      project: normalizeProjectName(filter.project) || "any",
      status: ["any", "todo", "doing", "done"].includes(filter.status) ? filter.status : "any",
      priority: ["any", "high", "normal", "low"].includes(filter.priority) ? filter.priority : "any",
      due: dueValues.includes(filter.due) ? filter.due : "any",
      tag: String(filter.tag || "").trim().replace(/^#/, "").slice(0, 30),
    };
  }

  function matchesSavedFilter(task, filter, today) {
    if (!filter) return true;
    if (filter.project !== "any" && task.project !== filter.project) return false;
    if (filter.status !== "any" && task.status !== filter.status) return false;
    if (filter.priority !== "any" && task.priority !== filter.priority) return false;
    if (filter.tag && !task.tags.includes(filter.tag)) return false;
    if (filter.due === "overdue" && (!task.due || task.due >= today || task.status === "done")) return false;
    if (filter.due === "today" && task.due !== today) return false;
    if (filter.due === "week") {
      const end = new Date(`${today}T12:00:00`);
      end.setDate(end.getDate() + 7);
      if (!task.due || task.due < today || task.due > end.toISOString().slice(0, 10)) return false;
    }
    if (filter.due === "none" && task.due) return false;
    return true;
  }

  function compareBy(taskA, taskB, condition) {
    const priorityScore = { high: 0, normal: 1, low: 2 };
    const statusScore = { doing: 0, todo: 1, done: 2 };
    if (condition === "due") return (taskA.due || "9999-12-31").localeCompare(taskB.due || "9999-12-31");
    if (condition === "priority") return priorityScore[taskA.priority] - priorityScore[taskB.priority];
    if (condition === "status") return statusScore[taskA.status] - statusScore[taskB.status];
    if (condition === "project") return taskA.project.localeCompare(taskB.project, "ja");
    if (condition === "newest") return taskB.createdAt - taskA.createdAt;
    if (condition === "oldest") return taskA.createdAt - taskB.createdAt;
    return 0;
  }

  function sortTasks(tasks, primary, secondary) {
    return [...tasks].sort((taskA, taskB) => {
      const primaryResult = compareBy(taskA, taskB, primary);
      if (primaryResult) return primaryResult;
      if (secondary !== "none" && secondary !== primary) {
        const secondaryResult = compareBy(taskA, taskB, secondary);
        if (secondaryResult) return secondaryResult;
      }
      return taskA.createdAt - taskB.createdAt;
    });
  }

  function groupTasksByProject(tasks, projectOrder = []) {
    const order = new Map(projectOrder.map((project, index) => [project, index]));
    const groups = new Map();
    tasks.forEach((task) => {
      const project = task.project || "未分類";
      if (!groups.has(project)) groups.set(project, []);
      groups.get(project).push(task);
    });
    return [...groups.entries()]
      .sort(([projectA], [projectB]) => (order.get(projectA) ?? Number.MAX_SAFE_INTEGER) - (order.get(projectB) ?? Number.MAX_SAFE_INTEGER) || projectA.localeCompare(projectB, "ja"))
      .map(([project, groupedTasks]) => ({ project, tasks: groupedTasks }));
  }

  const resolveProject = (activeProject, selectedProject) => activeProject || selectedProject || "未分類";

  const normalizeProjectName = (name) => String(name || "").trim().replace(/\s+/g, " ").slice(0, 30);

  function addProject(projects, rawName) {
    const name = normalizeProjectName(rawName);
    if (!name) return { name: "", projects: [...projects], added: false };
    const added = !projects.includes(name);
    return { name, projects: added ? [...projects, name] : [...projects], added };
  }

  function applyTaskDetails(task, details, now = Date.now()) {
    const status = details.status || "todo";
    const tags = Array.isArray(details.tags)
      ? details.tags
      : String(details.tags || "").split(/[,、]/).map((tag) => tag.trim().replace(/^#/, "")).filter(Boolean);
    return {
      ...task,
      title: String(details.title || "").trim(),
      status,
      priority: details.priority || "normal",
      completed: status === "done",
      completedAt: status === "done" ? (task.completedAt || now) : null,
      due: details.due || null,
      project: normalizeProjectName(details.project) || "未分類",
      tags: [...new Set(tags)].slice(0, 8),
      estimate: Math.max(0, Number(details.estimate) || 0),
      actual: Math.max(0, Number(details.actual) || 0),
      subtasks: Array.isArray(details.subtasks) ? details.subtasks.map((item) => ({ ...item })) : [],
      repeat: ["daily", "weekdays", "weekly", "monthly"].includes(details.repeat) ? details.repeat : "none",
    };
  }

  function applyTableEdit(task, field, value, now = Date.now()) {
    const editableFields = new Set(["title", "status", "priority", "due", "project", "tags", "estimate", "actual", "repeat"]);
    if (!editableFields.has(field)) return { ...task };
    if (field === "title" && !String(value || "").trim()) return { ...task };
    const details = {
      title: task.title,
      status: task.status,
      priority: task.priority,
      due: task.due,
      project: task.project,
      tags: task.tags,
      estimate: task.estimate,
      actual: task.actual,
      subtasks: task.subtasks,
      repeat: task.repeat,
      [field]: value,
    };
    if (field === "status" && !["todo", "doing", "done"].includes(value)) details.status = task.status;
    if (field === "priority" && !["low", "normal", "high"].includes(value)) details.priority = task.priority;
    if (field === "repeat" && !["none", "daily", "weekdays", "weekly", "monthly"].includes(value)) details.repeat = task.repeat;
    return applyTaskDetails(task, details, now);
  }

  function closeDialog(dialog) {
    if (!dialog || !dialog.open || typeof dialog.close !== "function") return false;
    dialog.close();
    return true;
  }

  function parseCSV(text) {
    const source = String(text || "").replace(/^\uFEFF/, "");
    const records = [];
    let record = [];
    let field = "";
    let quoted = false;
    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      if (quoted) {
        if (char === '"' && source[index + 1] === '"') { field += '"'; index += 1; }
        else if (char === '"') quoted = false;
        else field += char;
      } else if (char === '"' && field === "") quoted = true;
      else if (char === ",") { record.push(field); field = ""; }
      else if (char === "\n") { record.push(field.replace(/\r$/, "")); records.push(record); record = []; field = ""; }
      else field += char;
    }
    if (field || record.length) { record.push(field.replace(/\r$/, "")); records.push(record); }
    while (records.length && records[records.length - 1].every((value) => !String(value).trim())) records.pop();
    if (!records.length) return { headers: [], rows: [] };
    const headers = records.shift().map((header, index) => String(header).trim() || `列${index + 1}`);
    const rows = records.filter((row) => row.some((value) => String(value).trim())).map((row) => headers.map((_, index) => row[index] ?? ""));
    return { headers, rows };
  }

  const CSV_FIELDS = [
    { key: "title", label: "タスク名", required: true, aliases: ["タスク名", "タスク", "タイトル", "件名", "todo", "task", "title"] },
    { key: "status", label: "ステータス", aliases: ["ステータス", "状態", "進捗", "status"] },
    { key: "priority", label: "優先度", aliases: ["優先度", "重要度", "priority"] },
    { key: "due", label: "期限", aliases: ["期限", "期限日", "期日", "締切", "due", "date"] },
    { key: "project", label: "プロジェクト", aliases: ["プロジェクト", "リスト", "分類", "project", "list"] },
    { key: "tags", label: "タグ", aliases: ["タグ", "ラベル", "tags", "tag"] },
    { key: "estimate", label: "見積時間", aliases: ["見積時間", "見積工数", "予定工数", "estimate"] },
    { key: "actual", label: "実績時間", aliases: ["実績時間", "実績工数", "作業時間", "actual"] },
    { key: "subtasks", label: "サブタスク", aliases: ["サブタスク", "チェックリスト", "subtasks", "subtask"] },
  ];

  function autoMapHeaders(headers) {
    const normalized = headers.map((header) => String(header).trim().toLowerCase());
    return Object.fromEntries(CSV_FIELDS.map((field) => {
      const index = normalized.findIndex((header) => field.aliases.some((alias) => header === alias.toLowerCase()));
      return [field.key, index];
    }));
  }

  function normalizeImportDate(value) {
    const raw = String(value || "").trim();
    if (!raw) return null;
    if (/^\d{1,5}$/.test(raw)) {
      const serial = Number(raw);
      if (serial > 0 && serial < 80000) {
        const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
        return date.toISOString().slice(0, 10);
      }
    }
    const match = raw.match(/^(\d{4})[\/.\-年](\d{1,2})[\/.\-月](\d{1,2})日?$/);
    if (!match) return null;
    const [, year, month, day] = match;
    const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    const date = new Date(`${iso}T12:00:00`);
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso ? null : iso;
  }

  function normalizeImportStatus(value) {
    const raw = String(value || "").trim().toLowerCase();
    if (["done", "completed", "complete", "完了", "済", "済み", "○", "1", "true"].includes(raw)) return "done";
    if (["doing", "in progress", "進行中", "対応中", "作業中"].includes(raw)) return "doing";
    return "todo";
  }

  function normalizeImportPriority(value) {
    const raw = String(value || "").trim().toLowerCase();
    if (["high", "高", "優先", "重要", "1"].includes(raw)) return "high";
    if (["low", "低", "低め", "3"].includes(raw)) return "low";
    return "normal";
  }

  function csvRowsToTasks(parsed, mapping, now = Date.now()) {
    const skippedRows = [];
    const tasks = [];
    const read = (row, key) => mapping[key] >= 0 ? String(row[mapping[key]] ?? "").trim() : "";
    parsed.rows.forEach((row, index) => {
      const title = read(row, "title");
      if (!title) { skippedRows.push(index + 2); return; }
      const subtasks = read(row, "subtasks").split(/[|;\n]/).map((value) => value.trim()).filter(Boolean).map((value) => ({
        id: makeId(),
        title: value.replace(/^\[(?:x| )\]\s*/i, "").replace(/^☑\s*/, ""),
        completed: /^\[x\]/i.test(value) || /^☑/.test(value),
      }));
      const base = normalizeTask({ id: makeId(), title, createdAt: now + index });
      tasks.push(applyTaskDetails(base, {
        title,
        status: normalizeImportStatus(read(row, "status")),
        priority: normalizeImportPriority(read(row, "priority")),
        due: normalizeImportDate(read(row, "due")),
        project: read(row, "project") || "未分類",
        tags: read(row, "tags").split(/[;|、]/).map((tag) => tag.trim()).filter(Boolean),
        estimate: read(row, "estimate"),
        actual: read(row, "actual"),
        subtasks,
      }, now + index));
    });
    return { tasks, skippedRows };
  }

  const taskFingerprint = (task) => [task.title.trim().toLowerCase(), task.due || "", task.project || "未分類"].join("\u241f");

  function mergeImportedTasks(existingTasks, importedTasks, options = {}) {
    const mode = options.mode === "replace" ? "replace" : "append";
    const base = mode === "replace" ? [] : [...existingTasks];
    const fingerprints = new Set(base.map(taskFingerprint));
    let skipped = 0;
    const addedTasks = [];
    importedTasks.forEach((task) => {
      const fingerprint = taskFingerprint(task);
      if (options.skipDuplicates !== false && fingerprints.has(fingerprint)) { skipped += 1; return; }
      fingerprints.add(fingerprint);
      addedTasks.push(task);
    });
    return { tasks: [...addedTasks, ...base], added: addedTasks.length, skipped };
  }

  const escapeCSV = (value) => {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  function tasksToCSV(tasks) {
    const headers = ["タスク名", "ステータス", "優先度", "期限", "プロジェクト", "タグ", "見積時間", "実績時間", "サブタスク"];
    const statusLabels = { todo: "未着手", doing: "進行中", done: "完了" };
    const priorityLabels = { high: "高", normal: "通常", low: "低" };
    const rows = tasks.map((task) => [
      task.title, statusLabels[task.status] || "未着手", priorityLabels[task.priority] || "通常", task.due || "", task.project || "未分類",
      (task.tags || []).join("; "), task.estimate || "", task.actual || "",
      (task.subtasks || []).map((item) => `${item.completed ? "[x]" : "[ ]"} ${item.title}`).join(" | "),
    ]);
    return `\uFEFF${[headers, ...rows].map((row) => row.map(escapeCSV).join(",")).join("\r\n")}`;
  }

  function createBackup(tasks, projects, settings = {}, exportedAt = new Date().toISOString()) {
    return JSON.stringify({ format: "tempo-todo-backup", version: 1, exportedAt, tasks, projects, settings }, null, 2);
  }

  function parseBackup(text) {
    const data = JSON.parse(String(text || "").replace(/^\uFEFF/, ""));
    if (!data || data.format !== "tempo-todo-backup" || data.version !== 1 || !Array.isArray(data.tasks) || !Array.isArray(data.projects)) {
      throw new Error("対応していないバックアップ形式です");
    }
    return { tasks: data.tasks.map(normalizeTask), projects: [...new Set(data.projects.map(normalizeProjectName).filter(Boolean))], settings: data.settings || {} };
  }

  return {
    makeId, normalizeTask, nextRecurringDue, createNextRecurringTask, getLiveActualHours, startTaskTimer, stopTaskTimer, normalizeSavedFilter, matchesSavedFilter,
    compareBy, sortTasks, groupTasksByProject, resolveProject, normalizeProjectName, addProject, applyTaskDetails, applyTableEdit, closeDialog,
    CSV_FIELDS, parseCSV, autoMapHeaders, normalizeImportDate, csvRowsToTasks, mergeImportedTasks, tasksToCSV, createBackup, parseBackup,
  };
});
