/**
 * １つのリンクテーブル→フォーム変換を担当するクラス
 */
class SingleTableTransformer {
  /**
   * @param {Object} config
   * @param {string} config.id         - 元テーブルの ID
   * @param {string} config.sectionId  - 出力先セクション要素の ID
   * @param {string|number} config.status    - ステータス識別子
   * @param {Array}  config.layout     - フィールドレイアウト定義配列
   */
  constructor({ id, sectionId, status, layout }) {
    this.id        = id;
    this.sectionId = sectionId;
    this.status    = status;
    this.layout    = layout;
  }

  /** 最深子要素取得ユーティリティ */
  getDeepestChild(el) {
    while (el.children.length) {
      el = el.children[el.children.length - 1];
    }
    return el;
  }

  /** 実際に１つのテーブルをフォームに置き換える */
  transform() {
    const table = document.getElementById(this.id);
    if (!table) {
      console.warn(`テーブルが見つかりません id=${this.id}`);
      return;
    }
    table.style.display = 'none';

    // リンク URL から子レコード ID
    const href = table.querySelector('a')?.getAttribute('href') || '';
    const recordId = href.split('/')[2] || '';

    // thead th, tbody td の最深要素を配列化
    const thEls = Array.from(table.querySelectorAll('thead th')).map(e => this.getDeepestChild(e));
    const tdEls = Array.from(table.querySelectorAll('tbody td')).map(e => this.getDeepestChild(e));

    // 新フォーム準備
    const form = document.createElement('form');
    form.id = `addedForm${this.status}`;
    form.classList.add('wrapper', 'added');
    form.dataset.recordId = recordId;

    // 各セルを layout 定義に従ってレンダリング
    let layIndex = 1;  // layout 配列のインデックス
    tdEls.forEach((tdEl, idx) => {
      if (idx === 0) return; // ヘッダー行は飛ばす

      // section 分岐
      if (this.layout[layIndex]?.includes('section')) {
        this._renderSection(form, idx);
        layIndex++;
      }

      // フィールド本体
      this._renderField(form, tdEl, thEls[idx].innerText, layIndex, idx);
      layIndex++;
    });

    // 出力先に差し込み
    const container = document.getElementById(this.sectionId);
    container && container.appendChild(form);
  }

  /** section 要素を作成 */
  _renderSection(form, thIndex) {
    const [, labelText] = this.layout[arguments[1]].split('_');
    const div = document.createElement('div');
    div.id = `section-${this.status}-${thIndex}`;
    div.classList.add('section', 'added');
    const lbl = document.createElement('label');
    lbl.classList.add('field-section','added');
    lbl.textContent = labelText;
    div.appendChild(lbl);
    form.appendChild(div);
  }

  /** 単一フィールドの描画 */
  _renderField(form, tdEl, headerText, layIndex, thIndex) {
    // container
    const div = document.createElement('div');
    div.id = `container-${this.status}-${thIndex}`;
    div.classList.add('container','added','field-normal');
    form.appendChild(div);

    // ラベル
    const p = document.createElement('p');
    p.id = `p-${this.status}-${thIndex}`;
    p.classList.add('added','field-label');
    p.dataset.ctrlName = this.layout[layIndex];
    div.appendChild(p);

    const label = document.createElement('label');
    let text = headerText.includes('_') ? headerText.split('_')[1] : headerText;
    if (text.includes('工事実施依頼日(')) text = '工事実施依頼日';
    label.textContent = text;
    label.htmlFor = `control-${this.status}-${thIndex}`;
    p.appendChild(label);

    // コントロール本体
    const key = this.layout[layIndex];
    const value = tdEl.innerText;
    if (text === '社内連絡') {
      this._makeTextArea(div, key, value, thIndex);
    }
    else if (key === 'next_is_select') {
      this._makeSelect(div, this.layout[++layIndex], value);
    }
    else if (key.includes('Date')) {
      this._makeDateInput(div, key, value, thIndex);
    }
    else {
      this._makeTextInput(div, key, value, thIndex, text);
    }
  }

  _makeTextArea(div, name, value, idx) {
    const ta = document.createElement('textarea');
    ta.id   = `control-${this.status}-${idx}`;
    ta.name = name;
    ta.classList.add('control-textarea','added');
    ta.style.resize = 'none';
    ta.value = value;
    div.appendChild(ta);
  }

  _makeSelect(div, selectDef, value) {
    const [ctrlName, options] = Object.entries(selectDef)[0];
    const sel = document.createElement('select');
    sel.name = ctrlName;
    // 空オプション
    sel.appendChild(new Option('', ''));
    options.forEach(opt => sel.appendChild(new Option(opt, opt)));
    sel.value = value;
    div.appendChild(sel);
  }

  _makeDateInput(div, name, value, idx) {
    const inp = document.createElement('input');
    inp.type  = 'text';
    inp.id    = `control-${this.status}-${idx}`;
    inp.name  = name.replace('_calendar','');
    inp.value = value.replace(/[^0-9]/g, '');
    inp.classList.add('control-textbox','added','datepicker');
    inp.dataset.format = 'yyyy/MM/dd';
    div.classList.add('dateField');
    div.appendChild(inp);
  }

  _makeTextInput(div, name, value, idx, headerText) {
    const inp = document.createElement('input');
    inp.type  = 'text';
    inp.id    = `control-${this.status}-${idx}`;
    inp.name  = name;
    inp.value = value;
    inp.classList.add('control-textbox','added');
    if (name.includes('Description')) div.classList.add('descriptionField');
    if (headerText.includes('登録者ID') || headerText.includes('受領者ID')) {
      div.classList.add('idField');
    }
    div.appendChild(inp);
  }
}


/**
 * 全テーブルをまとめて変換するマネージャークラス
 */
class LinkedTablesManager {
  /**
   * @param {Array<Object>} configs  - TABLE_TRANSFORM_CONFIGS と同じ形式の配列
   */
  constructor(configs) {
    this.configs = configs;
  }

  runAll() {
    console.groupCollapsed('◇ transformLinkedTables 開始');
    this.configs.forEach(cfg => new SingleTableTransformer(cfg).transform());
    console.groupEnd();
  }
}


/**
 * 初回表示時に特定セクションを隠すコントローラー
 */
class DefaultVisibilityController {
  /**
   * @param {Array<{ sectionId: string, className: string }>} items
   */
  constructor(items) {
    this.items = items;
  }
  apply() {
    this.items.forEach(({ sectionId, className }) => {
      const el = document.getElementById(sectionId);
      el && el.classList.add(className);
    });
  }
}


// ——— 実行例 ———
document.addEventListener('DOMContentLoaded', () => {
  // 1) 変換実行
  const manager = new LinkedTablesManager(TABLE_TRANSFORM_CONFIGS);
  manager.runAll();

  // 2) デフォルト非表示設定
  const hider = new DefaultVisibilityController([
    { sectionId: 'sectionFields8container', className: 'hidden' },
    // 他の初期非表示もここに
  ]);
  hider.apply();
});
