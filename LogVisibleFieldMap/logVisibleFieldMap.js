(() => {
  // ---- helpers ----
  const isVisible = (el) => {
    if (!el || el.type === "hidden") return false;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    if (el.offsetParent === null && cs.position !== "fixed") return false;
    // 隠しselect（select2 など）対策：幅高さ0は除外
    const rect = el.getBoundingClientRect();
    if (!rect.width && !rect.height) return false;
    return true;
  };

  const clean = (s) =>
    (s || "")
      .replace(/\s*[*＊]\s*$/, "")        // 必須のアスタリスク除去
      .replace(/\s*[:：]\s*$/, "")        // 末尾コロン除去
      .replace(/\s+/g, " ")
      .trim();

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
    // 1) <label for="id">
    if (el.id) {
      const lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lab) return clean(lab.textContent);
    }
    // 2) ラップされた<label>内
    const wrapped = el.closest("label");
    if (wrapped) return clean(wrapped.textContent.replace(el.innerText || "", ""));
    // 3) 近傍コンテナにある<label>
    const container = el.closest(".form-group, .field, .control-group, .row, div, td, th");
    if (container) {
      // 自分以外のlabelを優先
      const labels = Array.from(container.querySelectorAll("label")).filter(l => !l.contains(el));
      if (labels[0]) return clean(labels[0].textContent);
    }
    // 4) 直前の兄弟<label>
    let sib = el.previousElementSibling;
    while (sib) {
      if (sib.tagName.toLowerCase() === "label") return clean(sib.textContent);
      sib = sib.previousElementSibling;
    }
    // 5) テーブル型の入力ならヘッダーから
    return labelFromTableHeader(el);
  };

  // ---- main ----
  const form =
    document.querySelector('form[action*="/Items/Edit"]') ||
    document.querySelector("form") ||
    document;

  const controls = Array.from(
    form.querySelectorAll("input, select, textarea")
  ).filter(isVisible);

  // ラジオ/チェックボックスなど同名グループの重複を除く
  const seen = new Set();
  const rows = [];
  for (const el of controls) {
    const controlName = el.name || el.id || "";
    if (!controlName) continue;
    const key = `${el.tagName}/${controlName}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const label = findLabel(el) || "(no label)";
    rows.push({
      control: controlName,
      label: label,
      tag: el.tagName.toLowerCase(),
      type: el.type || ""
    });
  }

  // 見やすく出力
  console.table(rows, ["control", "label", "tag", "type"]);
  console.log(
    rows.map(r => `${r.control}\t${r.label}`).join("\n")
  );

  // 返り値としても確認できるように
  return rows;
})();
