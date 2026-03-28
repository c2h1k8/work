'use strict';

// ==================================================
// SQL Toolkit — 描画関数
// 環境管理・チューニングガイド・接続プレビュー・バインド変数・テーブル定義メモの描画
// ==================================================

// ==================================================
// セグメントコントロール（接続先選択）の描画
// ==================================================
function renderEnvSegCtrl(envs) {
  const group = document.getElementById("env");
  group.innerHTML = "";
  envs.forEach(env => {
    const wrap  = document.createElement("div");
    const input = document.createElement("input");
    input.type    = "radio";
    input.name    = "env";
    input.id      = `env-${env.key}`;
    input.value   = env.key;
    input.checked = env.key === selectedEnvKey;
    input.addEventListener("change", () => {
      selectedEnvKey = env.key;
      localStorage.setItem("sql_selected_env", selectedEnvKey);
      updateConnPreview(envs);
    });
    const label = document.createElement("label");
    label.htmlFor     = `env-${env.key}`;
    label.textContent = env.key;
    wrap.append(input, label);
    group.appendChild(wrap);
  });
}

// ==================================================
// 接続環境一覧の描画
// ==================================================
function renderEnvList(envs) {
  const list = document.getElementById("env-list");
  list.innerHTML = "";

  if (envs.length === 0) {
    const empty = document.createElement("p");
    empty.className   = "env-list__empty";
    empty.textContent = "登録された接続環境がありません";
    list.appendChild(empty);
    return;
  }

  envs.forEach((env, idx) => {
    list.appendChild(createEnvRow(env, idx, envs.length));
  });
}

// 環境一覧の1行を生成
function createEnvRow(env, idx, total) {
  const row = document.createElement("div");
  row.className     = "env-list__row";
  row.dataset.envId = env.id;

  // ─── 通常表示部 ───
  const view = document.createElement("div");
  view.className = "env-list__view";

  // 上/下ボタン
  const orderBtns = document.createElement("div");
  orderBtns.className = "env-list__order-btns";
  const upBtn = makeIconBtn("▲", "上へ移動", "env-list__order-btn");
  const dnBtn = makeIconBtn("▼", "下へ移動", "env-list__order-btn");
  upBtn.disabled = idx === 0;
  dnBtn.disabled = idx === total - 1;
  upBtn.addEventListener("click", () => moveEnv(env.id, -1));
  dnBtn.addEventListener("click", () => moveEnv(env.id, +1));
  orderBtns.append(upBtn, dnBtn);

  // 情報
  const info = document.createElement("div");
  info.className = "env-list__info";
  const keyEl = document.createElement("span");
  keyEl.className   = "env-list__key";
  keyEl.textContent = env.key;
  const connEl = document.createElement("span");
  connEl.className   = "env-list__conn";
  connEl.textContent = `${env.username}@${env.connect_identifier}`;
  info.append(keyEl, connEl);

  // ボタン群（編集・削除）
  const btnGroup = document.createElement("div");
  btnGroup.className = "env-list__btn-group";

  const editBtn = makeIconBtn(PENCIL_SVG, `${env.key} を編集`, "btn btn--ghost btn--sm");
  editBtn.addEventListener("click", () => {
    row.dataset.editing = row.dataset.editing === "true" ? "" : "true";
  });

  const delBtn = makeIconBtn(TRASH_SVG, `${env.key} を削除`, "btn btn--ghost-danger btn--sm");
  delBtn.addEventListener("click", () => deleteEnvRow(env.id, env.key));

  btnGroup.append(editBtn, delBtn);
  view.append(orderBtns, info, btnGroup);

  // ─── インライン編集フォーム（初期非表示） ───
  const editForm = buildEnvEditForm(env, row);

  row.append(view, editForm);
  return row;
}

// 汎用アイコンボタン生成
function makeIconBtn(contentOrSvg, title, className) {
  const btn = document.createElement("button");
  btn.type      = "button";
  btn.title     = title;
  btn.className = className;
  if (typeof contentOrSvg === "string" && contentOrSvg.trim().startsWith("<")) {
    btn.innerHTML = contentOrSvg;
  } else {
    btn.textContent = contentOrSvg;
  }
  return btn;
}

// インライン編集フォームを生成
function buildEnvEditForm(env, row) {
  const { host, port, service } = parseConnIdentifier(env.connect_identifier);

  const form = document.createElement("div");
  form.className = "env-list__edit-form";

  const grid = document.createElement("div");
  grid.className = "env-form__grid";

  // インライン入力フィールドを生成するヘルパー
  const mkInput = (suffix, placeholder, value, type = "text") => {
    const inp = document.createElement("input");
    inp.type           = type;
    inp.id             = `edit-${suffix}-${env.id}`;
    inp.className      = "form-input form-input--sm";
    inp.placeholder    = placeholder;
    inp.value          = value;
    inp.autocomplete   = type === "password" ? "new-password" : "off";
    inp.autocorrect    = "off";
    inp.autocapitalize = "none";
    inp.spellcheck     = false;
    return inp;
  };

  const keyInp  = mkInput("key",     "環境名 (例: PROD)",         env.key);
  const userInp = mkInput("user",    "ユーザー名 (例: SCOTT)",     env.username);
  const passInp = mkInput("pass",    "パスワード",                 env.password, "password");
  const hostInp = mkInput("host",    "ホスト名または IP",           host);
  const portInp = mkInput("port",    "ポート (省略時: 1521)",       port);
  const svcInp  = mkInput("service", "サービス名 (例: ORCL)",      service);
  grid.append(keyInp, userInp, passInp, hostInp, portInp, svcInp);

  // 保存・キャンセルボタン
  const actions = document.createElement("div");
  actions.className = "env-list__edit-actions";

  const saveBtn = document.createElement("button");
  saveBtn.type      = "button";
  saveBtn.className = "btn btn--primary btn--sm";
  saveBtn.textContent = "保存";

  const cancelBtn = document.createElement("button");
  cancelBtn.type      = "button";
  cancelBtn.className = "btn btn--secondary btn--sm";
  cancelBtn.textContent = "キャンセル";

  saveBtn.addEventListener("click", async () => {
    const key     = keyInp.value.trim();
    const user    = userInp.value.trim();
    const pass    = passInp.value;
    const host    = hostInp.value.trim();
    const portRaw = portInp.value.trim();
    const service = svcInp.value.trim();

    const err = validateEnvInputs({ key, user, host, portRaw, service });
    if (err) { showError(err); return; }

    // キー変更時の重複チェック
    const allEnvs = await _db.getAllEnvs();
    if (key !== env.key && allEnvs.some(e => e.key === key)) {
      showError(`環境名「${key}」はすでに存在します`);
      return;
    }

    const port    = portRaw || "1521";
    const oldKey  = env.key;
    await _db.updateEnv(env.id, {
      key,
      username:           user,
      password:           pass,
      connect_identifier: `${host}:${port}/${service}`,
    });

    // 選択中の環境キーが変わった場合は更新
    if (selectedEnvKey === oldKey && key !== oldKey) {
      selectedEnvKey = key;
      localStorage.setItem("sql_selected_env", selectedEnvKey);
    }

    showToast(`「${key}」を更新しました`);
    await refreshEnvs();
  });

  cancelBtn.addEventListener("click", () => {
    row.dataset.editing = "";
  });

  actions.append(saveBtn, cancelBtn);
  form.append(grid, actions);
  return form;
}

// ==================================================
// チューニング対象グリッドの描画
// ==================================================
function renderTuneGrid() {
  const grid = document.getElementById("tune-grid");

  const lvMap = {
    high: { badge: "badge--danger",  label: "要改善" },
    mid:  { badge: "badge--warning", label: "要注意" },
    low:  { badge: "badge--info",    label: "参考" },
    ok:   { badge: "badge--success", label: "良好" },
  };

  // カード要素を生成するヘルパー
  function createCard(item) {
    const card = document.createElement("div");
    card.className = `tune-card tune-card--${item.level}`;
    card.dataset.category = item.category;

    const header = document.createElement("div");
    header.className = "tune-card__header";

    const op = document.createElement("code");
    op.className   = "tune-card__op";
    op.textContent = item.op;

    const badges = document.createElement("div");
    badges.className = "tune-card__badges";
    [
      { cls: "badge--neutral", text: item.category },
      { cls: lvMap[item.level].badge, text: lvMap[item.level].label },
    ].forEach(({ cls, text }) => {
      const b = document.createElement("span");
      b.className   = `badge ${cls}`;
      b.textContent = text;
      badges.appendChild(b);
    });

    header.append(op, badges);

    const desc = document.createElement("p");
    desc.className   = "tune-card__desc";
    desc.textContent = item.desc;

    card.append(header, desc);
    return card;
  }

  // カテゴリ別グループとして描画
  const categories = ["スキャン", "結合", "処理", "その他"];
  categories.forEach(cat => {
    const items = TUNE_ITEMS.filter(i => i.category === cat);

    const group = document.createElement("div");
    group.className    = "tune-group";
    group.dataset.category = cat;

    // カテゴリ見出し
    const groupHeader = document.createElement("div");
    groupHeader.className = "tune-group__header";
    groupHeader.innerHTML =
      `<span class="tune-group__label">${escapeHtml(cat)}</span>` +
      `<span class="tune-group__count">${items.length}</span>`;

    // カードコンテナ（グリッド）
    const cards = document.createElement("div");
    cards.className = "tune-group__cards";
    items.forEach(item => cards.appendChild(createCard(item)));

    group.append(groupHeader, cards);
    grid.appendChild(group);
  });
}

// ==================================================
// SQL*Plus 起動オプション チェックボックスの描画
// ==================================================
function renderSqlplusOptions() {
  const wrap = document.getElementById("sqlplus-options");
  SQLPLUS_OPTIONS.forEach(opt => {
    const label = document.createElement("label");
    label.className = "opt-check";
    label.htmlFor   = opt.id;

    const cb = document.createElement("input");
    cb.type      = "checkbox";
    cb.id        = opt.id;
    cb.value     = opt.flag;
    cb.className = "opt-check__input";

    const flag = document.createElement("span");
    flag.className   = "opt-check__flag";
    flag.textContent = opt.label;

    const desc = document.createElement("span");
    desc.className   = "opt-check__desc";
    desc.textContent = opt.desc;

    label.append(cb, flag, desc);
    wrap.appendChild(label);
  });
}

// ==================================================
// 接続コマンドを構築
// ==================================================
function getSelectedEnv(envs) {
  return envs.find(e => e.key === selectedEnvKey) ?? envs[0];
}

function buildConnCommand(envs) {
  const env = getSelectedEnv(envs);
  if (!env) return "sqlplus";
  const preParts = [];
  document.querySelectorAll("#sqlplus-options input:checked").forEach(cb => {
    preParts.push(cb.value);
  });
  const extra     = document.getElementById("sqlplus-extra").value.trim();
  const postParts = extra ? [extra] : [];
  const connStr   = `${env.username}/${env.password}@${env.connect_identifier}`;
  return ["sqlplus", ...preParts, connStr, ...postParts].join(" ");
}

function updateConnPreview(envs) {
  document.getElementById("conn-preview").textContent = buildConnCommand(envs);
}

// ==================================================
// バインド変数テーブル: 行の追加・描画
// ==================================================

// 行を末尾に追加し、保存済みの初期値 s を適用する
function appendParamRow(s = {}) {
  const no  = _nextParamId++;
  document.getElementById("param-wrapper").appendChild(createParamRow(no, s));
}

// param-row 要素を生成して返す。s に初期値を渡せる
function createParamRow(no, s = {}) {
  const row = document.createElement("div");
  row.className       = "param-row";
  row.dataset.paramId = no;

  // ── 使用チェックボックス ──
  const useWrap  = document.createElement("div");
  useWrap.className  = "param-row__use";
  const useCheck = document.createElement("input");
  useCheck.type      = "checkbox";
  useCheck.id        = `use-${no}`;
  useCheck.className = "param-row__use-check";
  useCheck.checked   = s.use ?? false;
  useCheck.setAttribute("aria-label", `変数${no} 使用`);
  useWrap.appendChild(useCheck);

  // ── 変数名入力 ──
  const varnameInput     = document.createElement("input");
  varnameInput.type      = "text";
  varnameInput.id        = `varname-${no}`;
  varnameInput.className = "param-row__varname";
  varnameInput.value     = s.varname ?? "";
  varnameInput.placeholder = `B${no}`;
  varnameInput.setAttribute("aria-label", `変数名 ${no}`);

  // ── 型 <select> ──
  const typeSelect     = document.createElement("select");
  typeSelect.id        = `type-${no}`;
  typeSelect.className = "param-row__type-select kn-select--sm";
  typeSelect.setAttribute("aria-label", `型 ${no}`);
  Object.entries(TYPE_DEFS).forEach(([key, def]) => {
    const opt       = document.createElement("option");
    opt.value       = key;
    opt.textContent = def.label;
    typeSelect.appendChild(opt);
  });
  if (s.type && s.type in TYPE_DEFS) typeSelect.value = s.type;

  // ── 桁数/精度スケール入力 ──
  const lenInput     = document.createElement("input");
  lenInput.type      = "text";
  lenInput.id        = `length-${no}`;
  lenInput.className = "len-input";
  lenInput.setAttribute("aria-label", `桁数 ${no}`);

  // ── 値セル: テキスト or DatePicker ボタン ──
  const valCell = document.createElement("div");
  valCell.className = "val-cell";

  // 値の実態は hidden input で保持（buildParamText はここを読む）
  const valInput     = document.createElement("input");
  valInput.type      = "hidden";
  valInput.id        = `value-${no}`;

  // テキスト入力（DATE 以外）
  const valText     = document.createElement("input");
  valText.type      = "text";
  valText.id        = `valtext-${no}`;
  valText.className = "val-input";
  valText.setAttribute("aria-label", `値 ${no}`);
  valText.addEventListener("input", () => { valInput.value = valText.value; saveParamState(); });

  // DatePicker ボタン（DATE 型）
  const CAL_SVG = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.75 0a.75.75 0 0 1 .75.75V2h5V.75a.75.75 0 0 1 1.5 0V2h1.25c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 13.25 16H2.75A1.75 1.75 0 0 1 1 14.25V3.75C1 2.784 1.784 2 2.75 2H4V.75A.75.75 0 0 1 4.75 0ZM2.5 7.5v6.75c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25V7.5Zm10.75-4H2.75a.25.25 0 0 0-.25.25V6h11V3.75a.25.25 0 0 0-.25-.25Z"/></svg>`;
  const valDateBtn = document.createElement("button");
  valDateBtn.type      = "button";
  valDateBtn.id        = `date-btn-${no}`;
  valDateBtn.className = "val-date-btn val-date-btn--empty";
  valDateBtn.setAttribute("aria-label", `日付を選択 変数${no}`);
  valDateBtn.innerHTML = `<span class="val-date-text">日付を選択…</span>${CAL_SVG}`;
  valDateBtn.addEventListener("click", () => {
    DatePicker.open(
      valInput.value,
      (dateStr) => {
        valInput.value = dateStr;
        valDateBtn.querySelector(".val-date-text").textContent = dateStr;
        valDateBtn.classList.remove("val-date-btn--empty");
        saveParamState();
      },
      () => {
        valInput.value = "";
        valDateBtn.querySelector(".val-date-text").textContent = "日付を選択…";
        valDateBtn.classList.add("val-date-btn--empty");
        saveParamState();
      },
    );
  });

  valCell.append(valInput, valText, valDateBtn);

  // ── 削除ボタン ──
  const deleteBtn = makeIconBtn(TRASH_SVG, `変数${no} を削除`, "btn btn--ghost-danger btn--sm param-row__delete");
  deleteBtn.addEventListener("click", () => { row.remove(); saveParamState(); });

  // ── 型変更時: フィールド更新（ユーザー操作では値をリセット、初期化時は後から値を上書き） ──
  function updateFields() {
    const def = TYPE_DEFS[typeSelect.value];
    switch (def.lenMode) {
      case "required":
        lenInput.disabled    = false;
        lenInput.placeholder = "桁数";
        if (!lenInput._touched) lenInput.value = def.defaultLen;
        break;
      case "optional":
        lenInput.disabled    = false;
        lenInput.placeholder = "精度,スケール";
        if (!lenInput._touched) lenInput.value = "";
        break;
      case "none":
        lenInput.disabled    = true;
        lenInput.value       = "";
        lenInput.placeholder = "—";
        break;
    }
    if (def.isDate) {
      valText.hidden    = true;
      valDateBtn.hidden = false;
      valInput.value    = "";
      valDateBtn.querySelector(".val-date-text").textContent = "日付を選択…";
      valDateBtn.classList.add("val-date-btn--empty");
    } else {
      valText.hidden    = false;
      valDateBtn.hidden = true;
      valText.value     = "";
      valInput.value    = "";
      if (def.nPrefix)        valText.placeholder = "例: テスト";
      else if (def.isStrings) valText.placeholder = "例: HELLO";
      else                    valText.placeholder = "例: 0";
    }
  }

  lenInput.addEventListener("input", () => { lenInput._touched = true; saveParamState(); });
  typeSelect.addEventListener("change", () => { lenInput._touched = false; updateFields(); saveParamState(); });
  useCheck.addEventListener("change", saveParamState);
  varnameInput.addEventListener("input", saveParamState);

  // 初期フィールド設定（updateFields で値がリセットされる前に呼ぶ）
  updateFields();

  // 初期値を updateFields の後で上書き適用
  if (s.length) { lenInput.value = s.length; lenInput._touched = true; }
  if (s.value) {
    valInput.value = s.value;
    if (TYPE_DEFS[typeSelect.value]?.isDate) {
      valDateBtn.querySelector(".val-date-text").textContent = s.value;
      valDateBtn.classList.remove("val-date-btn--empty");
    } else {
      valText.value = s.value;
    }
  }

  row.append(useWrap, varnameInput, typeSelect, lenInput, valCell, deleteBtn);
  // CustomSelect で型セレクトを置き換え（DOM に追加後に適用）
  CustomSelect.create(typeSelect);
  return row;
}

// ==================================================
// メモリスト描画
// ==================================================
function renderMemoList(memos) {
  const list    = document.getElementById("memo-list");
  const query   = document.getElementById("memo-search").value.trim().toLowerCase();
  const filtered = query
    ? memos.filter(m => (m.table_name?.toLowerCase().includes(query) || m.schema_name?.toLowerCase().includes(query)))
    : memos;

  list.innerHTML = "";
  if (filtered.length === 0) {
    const empty = document.createElement("p");
    empty.className   = "memo-list__empty";
    empty.textContent = query ? "該当するテーブルがありません" : "テーブルが登録されていません";
    list.appendChild(empty);
    return;
  }

  filtered.forEach(memo => list.appendChild(createMemoRow(memo)));
}

// ── メモ1行（<details>）を生成 ──
function createMemoRow(memo) {
  const details = document.createElement("details");
  details.className = "memo-row";

  // サマリー（ヘッダー）
  const summary = document.createElement("summary");
  summary.className = "memo-row__summary";

  const nameEl = document.createElement("span");
  nameEl.className   = "memo-row__name";
  nameEl.textContent = memo.schema_name ? `${memo.schema_name}.${memo.table_name}` : memo.table_name;

  const metaEl = document.createElement("span");
  metaEl.className = "memo-row__meta";

  if (memo.comment) {
    const cmtEl = document.createElement("span");
    cmtEl.className   = "memo-row__comment";
    cmtEl.textContent = memo.comment;
    metaEl.appendChild(cmtEl);
  }

  if (memo.columns?.length) {
    const badge = document.createElement("span");
    badge.className   = "memo-row__badge";
    badge.textContent = `${memo.columns.length} 列`;
    metaEl.appendChild(badge);
  }
  if (memo.indexes?.length) {
    const badge = document.createElement("span");
    badge.className   = "memo-row__badge";
    badge.textContent = `${memo.indexes.length} インデックス`;
    metaEl.appendChild(badge);
  }

  const actions = document.createElement("div");
  actions.className = "memo-row__actions";

  const editBtn = document.createElement("button");
  editBtn.type      = "button";
  editBtn.className = "btn btn--ghost btn--sm";
  editBtn.innerHTML = `${Icons.edit} 編集`;
  editBtn.addEventListener("click", (e) => { e.preventDefault(); openMemoModal(memo); });

  const delBtn = document.createElement("button");
  delBtn.type      = "button";
  delBtn.className = "btn btn--ghost-danger btn--sm";
  delBtn.innerHTML = `${Icons.close} 削除`;
  delBtn.addEventListener("click", (e) => { e.preventDefault(); deleteMemo(memo.id, memo.table_name); });

  actions.append(editBtn, delBtn);
  summary.append(nameEl, metaEl, actions);

  // 展開コンテンツ（カラム・インデックス・メモ）
  const detail = document.createElement("div");
  detail.className = "memo-row__detail";

  if (memo.columns?.length) {
    const sec = document.createElement("div");
    sec.className = "memo-row__detail-sec";

    const title = document.createElement("p");
    title.className   = "memo-row__detail-title";
    title.textContent = "カラム定義";
    sec.appendChild(title);

    const tbl = document.createElement("div");
    tbl.className = "memo-detail-table";

    const head = document.createElement("div");
    head.className = "memo-detail-table__head";
    head.innerHTML = `<span>PK</span><span>カラム名</span><span>型(桁数)</span><span>NULL可</span><span>コメント</span>`;
    tbl.appendChild(head);

    memo.columns.forEach(col => {
      const row = document.createElement("div");
      row.className = "memo-detail-table__row";
      row.innerHTML = `
        <span>${col.pk ? '<svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12"><path d="M4 4a4 4 0 0 1 8 0v2h.25c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 12.25 15h-8.5A1.75 1.75 0 0 1 2 13.25v-5.5C2 6.784 2.784 6 3.75 6H4Zm8.25 3.5h-8.5a.25.25 0 0 0-.25.25v5.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-5.5a.25.25 0 0 0-.25-.25ZM10.5 6V4a2.5 2.5 0 0 0-5 0v2Z"/></svg>' : ''}</span>
        <span class="memo-detail-table__code">${escapeHtml(col.name)}</span>
        <span class="memo-detail-table__code">${escapeHtml(col.type)}</span>
        <span>${col.nullable ? '○' : '✕'}</span>
        <span>${escapeHtml(col.comment ?? '')}</span>`;
      tbl.appendChild(row);
    });
    sec.appendChild(tbl);
    detail.appendChild(sec);
  }

  if (memo.indexes?.length) {
    const sec = document.createElement("div");
    sec.className = "memo-row__detail-sec";

    const title = document.createElement("p");
    title.className   = "memo-row__detail-title";
    title.textContent = "インデックス";
    sec.appendChild(title);

    const tbl = document.createElement("div");
    tbl.className = "memo-detail-table memo-detail-table--idx";

    const head = document.createElement("div");
    head.className = "memo-detail-table__head";
    head.innerHTML = `<span>インデックス名</span><span>UNIQUE</span><span>カラム</span><span>コメント</span>`;
    tbl.appendChild(head);

    memo.indexes.forEach(idx => {
      const row = document.createElement("div");
      row.className = "memo-detail-table__row";
      row.innerHTML = `
        <span class="memo-detail-table__code">${escapeHtml(idx.name)}</span>
        <span>${idx.unique ? '○' : ''}</span>
        <span class="memo-detail-table__code">${escapeHtml(idx.cols)}</span>
        <span>${escapeHtml(idx.comment ?? '')}</span>`;
      tbl.appendChild(row);
    });
    sec.appendChild(tbl);
    detail.appendChild(sec);
  }

  if (memo.memo) {
    const sec = document.createElement("div");
    sec.className = "memo-row__detail-sec";

    const title = document.createElement("p");
    title.className   = "memo-row__detail-title";
    title.textContent = "メモ";
    sec.appendChild(title);

    const pre = document.createElement("pre");
    pre.className   = "memo-detail-memo";
    pre.textContent = memo.memo;
    sec.appendChild(pre);
    detail.appendChild(sec);
  }

  details.append(summary, detail);
  return details;
}

// ── カラム行を生成 ──
function createMemoColRow(col = {}) {
  const id  = ++_memoColCount;
  const row = document.createElement("div");
  row.className = "memo-col-row";

  const pkCb = document.createElement("input");
  pkCb.type    = "checkbox";
  pkCb.title   = "主キー";
  pkCb.checked = col.pk ?? false;
  pkCb.className = "memo-col-row__pk";

  const nameInp = document.createElement("input");
  nameInp.type        = "text";
  nameInp.placeholder = "例: EMPNO";
  nameInp.value       = col.name ?? "";
  nameInp.className   = "memo-col-row__name";
  nameInp.autocomplete = "off";
  nameInp.spellcheck  = false;

  const typeInp = document.createElement("input");
  typeInp.type        = "text";
  typeInp.placeholder = "例: NUMBER(4)";
  typeInp.value       = col.type ?? "";
  typeInp.className   = "memo-col-row__type";
  typeInp.autocomplete = "off";
  typeInp.spellcheck  = false;

  const nullCb = document.createElement("input");
  nullCb.type    = "checkbox";
  nullCb.title   = "NULL可";
  nullCb.checked = col.nullable ?? true;
  nullCb.className = "memo-col-row__null";

  const cmtInp = document.createElement("input");
  cmtInp.type        = "text";
  cmtInp.placeholder = "コメント";
  cmtInp.value       = col.comment ?? "";
  cmtInp.className   = "memo-col-row__cmt";
  cmtInp.autocomplete = "off";

  const delBtn = document.createElement("button");
  delBtn.type      = "button";
  delBtn.innerHTML = Icons.close;
  delBtn.title     = "削除";
  delBtn.className = "btn btn--ghost-danger btn--sm memo-row-del-btn";
  delBtn.addEventListener("click", () => row.remove());

  row.append(pkCb, nameInp, typeInp, nullCb, cmtInp, delBtn);
  return row;
}

// ── インデックス行を生成 ──
function createMemoIdxRow(idx = {}) {
  ++_memoIdxCount;
  const row = document.createElement("div");
  row.className = "memo-idx-row";

  const nameInp = document.createElement("input");
  nameInp.type        = "text";
  nameInp.placeholder = "例: IDX_EMP_01";
  nameInp.value       = idx.name ?? "";
  nameInp.className   = "memo-idx-row__name";
  nameInp.autocomplete = "off";
  nameInp.spellcheck  = false;

  const uniqueCb = document.createElement("input");
  uniqueCb.type    = "checkbox";
  uniqueCb.title   = "UNIQUE";
  uniqueCb.checked = idx.unique ?? false;
  uniqueCb.className = "memo-idx-row__unique";

  const colsInp = document.createElement("input");
  colsInp.type        = "text";
  colsInp.placeholder = "例: DEPTNO, SAL";
  colsInp.value       = idx.cols ?? "";
  colsInp.className   = "memo-idx-row__cols";
  colsInp.autocomplete = "off";
  colsInp.spellcheck  = false;

  const cmtInp = document.createElement("input");
  cmtInp.type        = "text";
  cmtInp.placeholder = "コメント";
  cmtInp.value       = idx.comment ?? "";
  cmtInp.className   = "memo-idx-row__cmt";
  cmtInp.autocomplete = "off";

  const delBtn = document.createElement("button");
  delBtn.type      = "button";
  delBtn.innerHTML = Icons.close;
  delBtn.title     = "削除";
  delBtn.className = "btn btn--ghost-danger btn--sm memo-row-del-btn";
  delBtn.addEventListener("click", () => row.remove());

  row.append(nameInp, uniqueCb, colsInp, cmtInp, delBtn);
  return row;
}
