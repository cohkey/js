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
  });

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
    };
  }

  function closeDialog(dialog) {
    if (!dialog || !dialog.open || typeof dialog.close !== "function") return false;
    dialog.close();
    return true;
  }

  return { makeId, normalizeTask, compareBy, sortTasks, resolveProject, normalizeProjectName, addProject, applyTaskDetails, closeDialog };
});
