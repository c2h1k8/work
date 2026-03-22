'use strict';

// ==================================================
// SQL Toolkit — イベントハンドラ・CRUD操作
// 環境CRUD・エクスポート/インポート・バインド変数・チューニング検索・テーブル定義メモ
// ==================================================

// ==================================================
// 環境管理 — 共通リフレッシュ
// ==================================================
async function refreshEnvs() {
  const envs = await _db.getAllEnvs();
  if (selectedEnvKey && !envs.some(e => e.key === selectedEnvKey)) {
    selectedEnvKey = envs[0]?.key ?? "";
    localStorage.setItem("sql_selected_env", selectedEnvKey);
  }
  renderEnvSegCtrl(envs);
  renderEnvList(envs);
  updateConnPreview(envs);
}

// ==================================================
// 環境の順序移動（dir: -1=上, +1=下）
// ==================================================
async function moveEnv(id, dir) {
  const envs  = await _db.getAllEnvs();
  const idx   = envs.findIndex(e => e.id === id);
  const swapI = idx + dir;
  if (swapI < 0 || swapI >= envs.length) return;

  // position を入れ替え
  const p1 = envs[idx].position;
  const p2 = envs[swapI].position;
  await _db.updateEnv(envs[idx].id,   { position: p2 });
  await _db.updateEnv(envs[swapI].id, { position: p1 });
  await refreshEnvs();
}

// ==================================================
// 環境を削除
// ==================================================
async function deleteEnvRow(id, key) {
  const envs = await _db.getAllEnvs();
  if (envs.length <= 1) { showToast("最後の接続環境は削除できません", 'error'); return; }
  if (!confirm(`接続環境「${key}」を削除しますか？`)) return;

  await _db.deleteEnv(id);
  if (selectedEnvKey === key) {
    const rest = envs.filter(e => e.id !== id);
    selectedEnvKey = rest[0]?.key ?? "";
    localStorage.setItem("sql_selected_env", selectedEnvKey);
  }
  await refreshEnvs();
}

// ==================================================
// JSON エクスポート（ファイルダウンロード）
// ==================================================
function exportEnvJson(envs) {
  // 内部管理フィールド（id/position）は除外してエクスポート
  const data = envs.map(({ key, username, password, connect_identifier }) =>
    ({ key, username, password, connect_identifier })
  );
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  const now  = new Date();
  const pad  = n => String(n).padStart(2, "0");
  const ts   = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  a.download = `sql_envs_${ts}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

// ==================================================
// JSON インポート（ファイル読み込み）
// ==================================================
async function importEnvJson(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (
          !Array.isArray(data) ||
          data.length === 0 ||
          data.some(e => !e.key || !e.username || !e.connect_identifier)
        ) {
          showToast("無効なJSON形式です", 'error');
          resolve();
          return;
        }
        // 既存データを全件削除してからインポート
        const existing = await _db.getAllEnvs();
        for (const env of existing) await _db.deleteEnv(env.id);
        for (const env of data) {
          await _db.addEnv({
            key:                env.key,
            username:           env.username,
            password:           env.password ?? "",
            connect_identifier: env.connect_identifier,
          });
        }
        selectedEnvKey = data[0].key;
        localStorage.setItem("sql_selected_env", selectedEnvKey);
        showToast(`${data.length} 件の環境をインポートしました`);
        await refreshEnvs();
      } catch {
        showToast("JSONの読み込みに失敗しました", 'error');
      }
      resolve();
    };
    reader.readAsText(file);
  });
}

// ==================================================
// バインド変数 入力状態の localStorage 永続化
// ==================================================
function saveParamState() {
  const rows  = document.querySelectorAll("#param-wrapper .param-row");
  const state = Array.from(rows).map(row => {
    const no = row.dataset.paramId;
    return {
      use:     !!document.getElementById(`use-${no}`)?.checked,
      varname: document.getElementById(`varname-${no}`)?.value ?? "",
      type:    document.getElementById(`type-${no}`)?.value ?? "VARCHAR2",
      length:  document.getElementById(`length-${no}`)?.value ?? "",
      value:   document.getElementById(`value-${no}`)?.value ?? "",
    };
  });
  localStorage.setItem(PARAM_STORAGE_KEY, JSON.stringify(state));
}

function loadParamState() {
  const wrapper = document.getElementById("param-wrapper");
  wrapper.innerHTML = "";
  _nextParamId = 1;
  try {
    const stored = localStorage.getItem(PARAM_STORAGE_KEY);
    if (stored) {
      const state = JSON.parse(stored);
      if (Array.isArray(state) && state.length > 0) {
        state.forEach(s => appendParamRow(s));
      }
    }
  } catch {
    // 読み込みに失敗した場合は何も表示しない
  }
}

// ==================================================
// バインド変数 EXEC 文を構築
// ==================================================
function buildParamText() {
  let text = "";
  document.querySelectorAll("#param-wrapper .param-row").forEach(row => {
    const no = row.dataset.paramId;

    // 使用チェックが OFF の行はスキップ
    if (!document.getElementById(`use-${no}`)?.checked) return;

    const typeKey = document.getElementById(`type-${no}`)?.value;
    const def     = TYPE_DEFS[typeKey];
    if (!def) return;

    // 変数名（未入力は B{no} をフォールバック）
    const varname = document.getElementById(`varname-${no}`)?.value?.trim() || `B${no}`;
    const lenRaw  = document.getElementById(`length-${no}`)?.value?.trim() ?? "";
    const valRaw  = document.getElementById(`value-${no}`)?.value?.trim() ?? "";

    // VAR 宣言: DATE は桁数なし, その他は lenRaw があれば付ける
    const lenPart = (!def.isDate && lenRaw) ? `(${lenRaw})` : "";
    const varDecl = `VAR ${varname} ${def.label}${lenPart}`;

    // EXEC 文
    let execStmt;
    if (def.isDate) {
      const dateVal = valRaw || new Date().toISOString().slice(0, 10);
      execStmt = `EXEC :${varname} := TO_DATE('${dateVal}','YYYY-MM-DD');`;
    } else if (def.nPrefix) {
      execStmt = `EXEC :${varname} := N'${valRaw}';`;
    } else if (def.isStrings) {
      execStmt = `EXEC :${varname} := '${valRaw}';`;
    } else {
      execStmt = `EXEC :${varname} := ${valRaw || "0"};`;
    }

    text += `${varDecl}\n${execStmt}\n`;
  });
  return text;
}

// ==================================================
// 実行計画ガイド: タブ + 検索フィルター
// ==================================================
function applyTuneFilter() {
  const q = document.getElementById("tune-search").value.trim().toLowerCase();
  document.querySelectorAll(".tune-card").forEach(card => {
    const op   = card.querySelector(".tune-card__op")?.textContent.toLowerCase()  ?? "";
    const desc = card.querySelector(".tune-card__desc")?.textContent.toLowerCase() ?? "";
    const matchSearch = !q || op.includes(q) || desc.includes(q);
    const matchTab    = _tuneTab === "all" || card.dataset.category === _tuneTab;
    card.hidden = !(matchSearch && matchTab);
  });
}

function initTuneSearch() {
  document.getElementById("tune-search").addEventListener("input", applyTuneFilter);

  document.getElementById("tune-tabs").addEventListener("click", e => {
    const btn = e.target.closest(".tune-tab");
    if (!btn) return;
    _tuneTab = btn.dataset.tab;
    document.querySelectorAll(".tune-tab").forEach(b =>
      b.classList.toggle("tune-tab--active", b === btn)
    );
    applyTuneFilter();
  });
}

// ==================================================
// テーブル定義メモ — モーダル操作
// ==================================================

// ── モーダルを開く ──
function openMemoModal(memo = null) {
  _memoEditingId = memo ? memo.id : null;
  document.getElementById("memo-modal-title").textContent = memo ? "テーブルを編集" : "テーブルを追加";
  document.getElementById("memo-f-schema").value  = memo?.schema_name ?? "";
  document.getElementById("memo-f-table").value   = memo?.table_name  ?? "";
  document.getElementById("memo-f-comment").value = memo?.comment     ?? "";
  document.getElementById("memo-f-memo").value    = memo?.memo        ?? "";

  // カラム初期化
  _memoColCount = 0;
  const colBody = document.getElementById("memo-col-body");
  colBody.innerHTML = "";
  (memo?.columns ?? []).forEach(col => colBody.appendChild(createMemoColRow(col)));

  // インデックス初期化
  _memoIdxCount = 0;
  const idxBody = document.getElementById("memo-idx-body");
  idxBody.innerHTML = "";
  (memo?.indexes ?? []).forEach(idx => idxBody.appendChild(createMemoIdxRow(idx)));

  document.getElementById("memo-modal").hidden = false;
  document.getElementById("memo-f-table").focus();
}

// ── モーダルを閉じる ──
function closeMemoModal() {
  document.getElementById("memo-modal").hidden = true;
  _memoEditingId = null;
}

// ── フォームからデータを収集 ──
function collectMemoFormData() {
  const columns = Array.from(document.querySelectorAll("#memo-col-body .memo-col-row")).map(row => ({
    pk:       row.querySelector(".memo-col-row__pk").checked,
    name:     row.querySelector(".memo-col-row__name").value.trim(),
    type:     row.querySelector(".memo-col-row__type").value.trim(),
    nullable: row.querySelector(".memo-col-row__null").checked,
    comment:  row.querySelector(".memo-col-row__cmt").value.trim(),
  })).filter(c => c.name);

  const indexes = Array.from(document.querySelectorAll("#memo-idx-body .memo-idx-row")).map(row => ({
    name:    row.querySelector(".memo-idx-row__name").value.trim(),
    unique:  row.querySelector(".memo-idx-row__unique").checked,
    cols:    row.querySelector(".memo-idx-row__cols").value.trim(),
    comment: row.querySelector(".memo-idx-row__cmt").value.trim(),
  })).filter(i => i.name);

  return {
    schema_name: document.getElementById("memo-f-schema").value.trim(),
    table_name:  document.getElementById("memo-f-table").value.trim(),
    comment:     document.getElementById("memo-f-comment").value.trim(),
    memo:        document.getElementById("memo-f-memo").value.trim(),
    columns,
    indexes,
  };
}

// ── メモを保存 ──
async function saveMemoForm() {
  const data = collectMemoFormData();
  if (!data.table_name) { showToast("テーブル名を入力してください", 'error'); return; }

  if (_memoEditingId != null) {
    await _db.updateTableMemo(_memoEditingId, data);
    showToast(`「${data.table_name}」を更新しました`);
  } else {
    await _db.addTableMemo(data);
    showToast(`「${data.table_name}」を追加しました`);
  }
  closeMemoModal();
  await refreshMemoList();
}

// ── メモを削除 ──
async function deleteMemo(id, tableName) {
  if (!confirm(`テーブル「${tableName}」を削除しますか？`)) return;
  await _db.deleteTableMemo(id);
  showToast(`「${tableName}」を削除しました`);
  await refreshMemoList();
}

// ── リストを再描画 ──
async function refreshMemoList() {
  const memos = await _db.getAllTableMemos();
  renderMemoList(memos);
}

// ── エクスポート ──
function exportMemos(memos) {
  const data = JSON.stringify({ type: 'sql_table_memos_export', version: 1, memos }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  const now  = new Date();
  const pad  = n => String(n).padStart(2, "0");
  const ts   = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  a.download = `sql_table_memos_${ts}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

// ── インポート ──
async function importMemos(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (data.type !== 'sql_table_memos_export' || !Array.isArray(data.memos)) {
          showToast("無効なファイル形式です", 'error'); resolve(); return;
        }
        for (const m of data.memos) {
          if (m.table_name) await _db.addTableMemo(m);
        }
        showToast(`${data.memos.length} 件をインポートしました`);
        await refreshMemoList();
      } catch {
        showToast("インポートに失敗しました", 'error');
      }
      resolve();
    };
    reader.readAsText(file);
  });
}
