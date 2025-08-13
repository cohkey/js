(() => {
  // ======= Settings =======
  const DEDUPE_BY_NAME = true;   // true: 同名のラジオ/チェックは1行に集約, false: 全ノードを列挙
  const INCLUDE_SYSTEM_FIELDS = true; // false: __RequestVerificationToken 等の内部用hiddenを除外

  // ======= Helpers =======
  const clean = (s) =>
    (s || "")
      .replace(/\s+/g, " ")
      .replace(/\s*[*＊:：]\s*$/, "") // 末尾の * や : を除去
      .trim();

  const textOf = (el) => clean(el?.textContent || "");

  const getByIdSafe = (id) => {
    try { return document.getElementById(id); } catch { return null; }
  };

  const labelFromTableHeader = (el) => {
    const cell = el.closest("td, th");
    if (!cell) return "";
    const row = cell.parentElement;
    const table = row?.closest("table");
    if (!table) return "";
    const idx = Array.from(row.children).indexOf(cell);
    const headerRow = table.querySelector("thead tr");
    const th = headerRow?.children?.[idx];
    return th ? clean(th.textContent) : "";
  };

  const findLabel = (el) => {
    // 0) ネイティブ関連付け
    if (el.labels && el.labels.length) {
      return clean([...el.labels].map(l => l.textContent).join(" "));
    }
    // 1) aria-label
    const aria = el.getAttribute("aria-label");
    if (aria) return clean(aria);
    // 2) aria-labelledby
    const labelledby = el.getAttribute("aria-labelledby");
    if (labelledby) {
      const t = labelledby
        .split(/\s+/)
        .map(id => textOf(getByIdSafe(id)))
        .join(" ");
      if (clean(t)) return clean(t);
    }
    // 3) <label for="...">
    if (el.id) {
      try {
        const lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (lab) return clean(lab.textContent);
      } catch {}
    }
    // 4) ラップされた<label>
    const wrap = el.closest("label");
    if (wrap) return clean(wrap.textContent.replace(el.innerText || "", ""));
    // 5) 近傍の<label>
    const container = el.closest(".form-group, .field, .control-group, tr, td, th, .row, div");
    if (container) {
      const lab = Array.from(container.querySelectorAll("label")).find(l => !l.contains(el));
      if (lab) return clean(lab.textContent);
    }
    // 6) テーブルヘッダー
    const th = labelFromTableHeader(el);
    if (th) return th;
    // 7) placeholder / title / data-*
    const ph = el.getAttribute("placeholder") || el.getAttribute("title");
    if (ph) return clean(ph);
    for (const a of ["data-label", "data-name", "data-title", "name"]) {
      const v = el.getAttribute(a);
      if (v) return clean(v);
    }
    return "";
  };

  const isSystem = (el) => {
    const key = (el.name || "" + " " + el.id || "").toLowerCase();
    if (/__requestverificationtoken/.test(key)) return true;
    if (/viewstate|eventvalidation/.test(key)) return true;
    return false;
  };

  // ======= Main =======
  const form =
    document.querySelector('form[action*="/Items/Edit"]') ||
    document.querySelector("form") ||
    document;

  const controls = Array.from(form.querySelectorAll("input, select, textarea")); // 非表示含む

  const seen = new Set();
  const rows = [];
  for (const el of controls) {
    if (!INCLUDE_SYSTEM_FIELDS && isSystem(el)) continue;

    const controlName = el.name || el.id || "";
    if (!controlName) continue;

    if (DEDUPE_BY_NAME) {
      if (seen.has(controlName)) continue;
      seen.add(controlName);
    }

    const label = findLabel(el) || "(no label)";
    const cs = getComputedStyle(el);
    const visibility =
      el.type === "hidden" ||
      cs.display === "none" ||
      cs.visibility === "hidden" ||
      (el.offsetParent === null && cs.position !== "fixed")
        ? "hidden"
        : "visible";

    rows.push({
      control: controlName,
      label,
      tag: el.tagName.toLowerCase(),
      type: el.type || "",
      id: el.id || "",
      visibility
    });
  }

  console.table(rows, ["control", "label", "tag", "type", "visibility"]);
  console.log(rows.map(r => `${r.control}\t${r.label}`).join("\n"));
  return rows;
})();
