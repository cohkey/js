// 子テーブルの HTML を動的に変換してフォームに置き換える
$P.ex.transformLinkedTables = function() {
  console.groupCollapsed('◇transformLinkedTables() 開始');

  // その要素以下の最奥の子孫要素を取得するヘルパー
  function getDeepestChild(element) {
    let currentEl = element;
    while (currentEl.children.length > 0) {
      currentEl = currentEl.children[currentEl.children.length - 1];
    }
    return currentEl;
  }

  // 定義配列 TABLE_TRANSFORM_CONFIGS をループ
  TABLE_TRANSFORM_CONFIGS.forEach(({ id, sectionId, status, layout }) => {
    // ① 元のテーブル要素を非表示に
    let table = document.getElementById(id);
    if (!table) {
      console.warn(`テーブルが見つかりません。id:${id}, status:${status}`);
      return;
    }
    table.style.display = 'none';

    // ② リンク URL から子レコードの ID を取得
    let linkUrlText = table.querySelector('a').getAttribute('href');
    const parts = linkUrlText.split('/');
    const linkRecordId = parts[2];

    // ③ 元の <thead> の th と <tbody> の td それぞれ最奥の要素を抽出
    const thDeepest = Array.from(table.querySelectorAll('thead th')).map(getDeepestChild);
    const tdDeepest = Array.from(table.querySelectorAll('tbody td')).map(getDeepestChild);

    // ④ 新規 <form> 要素を生成
    let newForm = document.createElement('form');
    newForm.id = `addedForm${status}`;
    newForm.classList.add('wrapper', 'added');
    newForm.setAttribute('data-record-id', linkRecordId);

    // ⑤ th/td の中身をもとに、レイアウト定義(layout)に従って
    //    <div> や <label>、<input>/<textarea>/<select> を作って newForm に追加
    let lay_i = 1;  // layout 配列のインデックス
    tdDeepest.forEach((element, th_i) => {
      // 見出し行はスキップ
      if (th_i === 0) return;

      // layout に "section" 定義があればセクション見出しを挿入
      if (layout[lay_i].includes('section')) {
        const [_, sectionText] = layout[lay_i].split('_');
        let mySection = document.createElement('div');
        mySection.id = `section-${status}-${th_i}`;
        mySection.classList.add('section', 'added');
        newForm.appendChild(mySection);

        let mySectionLabel = document.createElement('label');
        mySectionLabel.classList.add('field-section', 'added');
        mySection.appendChild(mySectionLabel);

        let mySpan = document.createElement('span');
        mySpan.textContent = sectionText;
        mySectionLabel.appendChild(mySpan);

        lay_i++;
      }

      // コンテナ <div> を生成
      let myDiv = document.createElement('div');
      myDiv.id = `container-${status}-${th_i}`;
      myDiv.classList.add('container', 'added', 'field-normal');
      newForm.appendChild(myDiv);

      // 項目ラベル用 <p><label> を生成
      let myP = document.createElement('p');
      myP.id = `p-${status}-${th_i}`;
      myP.classList.add('added', 'field-label');
      myP.setAttribute('data-ctrl-name', layout[lay_i]);
      myDiv.appendChild(myP);

      let myLabel = document.createElement('label');
      // 元テーブルのヘッダテキスト(element.innerText) から
      // 「_」以降だけを取り出すか、丸ごと使うか
      let labelText = element.innerText.includes('_')
        ? element.innerText.split('_')[1]
        : element.innerText;
      // 特殊なトリム処理
      if (labelText.includes('工事実施依頼日(')) {
        labelText = '工事実施依頼日';
      }
      myLabel.textContent = labelText;
      myLabel.setAttribute('for', `control-${status}-${th_i}`);
      myP.appendChild(myLabel);

      // ⑥ ラベルや layout によって input, textarea, select を切り替え
      if (labelText === '社内連絡') {
        // textarea
        let ta = document.createElement('textarea');
        ta.id = `control-${status}-${th_i}`;
        ta.classList.add('control-textarea', 'added');
        ta.style.resize = 'none';
        ta.name = layout[lay_i];
        ta.value = tdDeepest[th_i].innerText;
        myDiv.appendChild(ta);

      } else if (layout[lay_i] === 'next_is_select') {
        // 選択肢(select)
        lay_i++;
        let ctrlName = Object.keys(layout[lay_i])[0];
        let sel = document.createElement('select');
        sel.name = ctrlName;
        // 空白オプション
        let opt0 = document.createElement('option');
        opt0.value = '';
        opt0.textContent = '';
        sel.appendChild(opt0);
        // 定義された選択肢を追加
        layout[lay_i][ctrlName].forEach(val => {
          let o = document.createElement('option');
          o.value = val;
          o.textContent = val;
          sel.appendChild(o);
        });
        // 元の値をセット
        sel.value = tdDeepest[th_i].innerText;
        myDiv.appendChild(sel);

      } else if (layout[lay_i].includes('Date')) {
        // 日付入力
        let inp = document.createElement('input');
        inp.type = 'text';
        inp.id = `control-${status}-${th_i}`;
        inp.classList.add('control-textbox', 'added');
        myDiv.classList.add('dateField');
        inp.name = layout[lay_i];
        inp.value = tdDeepest[th_i].innerText;
        // _calendar が付いていれば datepicker クラスを追加
        if (layout[lay_i].includes('_calendar')) {
          inp.name = layout[lay_i].replace('_calendar', '');
          inp.classList.add('datepicker');
          inp.setAttribute('data-format', 'yyyy/MM/dd');
        }
        // 曜日など数字以外を除去
        inp.value = inp.value.replace(/[^0-9]/g, '');
        myDiv.appendChild(inp);

      } else {
        // 通常のテキスト or 数値入力
        let inp = document.createElement('input');
        inp.type = 'text';
        inp.id = `control-${status}-${th_i}`;
        inp.classList.add('control-textbox', 'added');
        inp.name = layout[lay_i];
        inp.value = tdDeepest[th_i].innerText;
        // 説明項目なら追加でクラスを付与
        if (layout[lay_i].includes('Description')) {
          myDiv.classList.add('descriptionField');
        }
        // ID 項目なら追加でクラスを付与
        if (labelText.includes('登録者ID') || labelText.includes('受領者ID')) {
          myDiv.classList.add('idField');
        }
        myDiv.appendChild(inp);
      }

      lay_i++;
    });

    // ⑦ 見出し用の sectionId 要素に新フォームを挿入
    let targetSection = document.getElementById(sectionId);
    targetSection.appendChild(newForm);

    console.log(`sectionId: ${sectionId}`);
    console.log(newForm);
  });

  console.groupEnd();
};

// デフォルトで特定ステータスのセクションを隠す
$P.ex.setDefaultHidden = function() {
  console.log('04_08_step2_09_step2 デフォルトで非表示');
  const container04 = document.getElementById('sectionFields8container');
  // ステータス04を非表示に
  toggleHiddenElement(container04, 'hidden');
};
