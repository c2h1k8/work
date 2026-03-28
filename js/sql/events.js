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
  if (envs.length <= 1) { showError("最後の接続環境は削除できません"); return; }
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
          showError("無効なJSON形式です");
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
        showError("JSONの読み込みに失敗しました");
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

    // VAR 宣言:
    //   - lenMode === "required" (VARCHAR2/NVARCHAR2/CHAR) のみ桁数を付ける
    //   - NUMBER は SQL*Plus VAR コマンドが精度/スケール指定非対応のため桁数なし
    //   - DATE は SQL*Plus VAR コマンドが DATE 型非対応のため VARCHAR2(10) で代用
    const lenPart  = (def.lenMode === "required" && lenRaw) ? `(${lenRaw})` : "";
    // DATE は SQL*Plus VAR が DATE 型非対応のため VARCHAR2(30) で宣言し TO_DATE で代入
    const varLabel = def.isDate ? "VARCHAR2(30)" : `${def.label}${lenPart}`;
    const varDecl  = `VAR ${varname} ${varLabel}`;

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
  const q     = document.getElementById("tune-search").value.trim().toLowerCase();
  const isAll = _tuneTab === "all";

  // 「すべて」のときだけグループ区切り線を有効化
  document.getElementById("tune-grid").classList.toggle("tune-grid--grouped", isAll);

  // 「すべて」に戻る際は localStorage から開閉状態を復元
  const savedStates = isAll
    ? JSON.parse(localStorage.getItem("sql_tune_groups") || "{}")
    : null;

  document.querySelectorAll(".tune-group").forEach(group => {
    const cat = group.dataset.category;

    // カテゴリタブ選択時: 一致しないグループは非表示
    if (!isAll && cat !== _tuneTab) { group.hidden = true; return; }

    // カテゴリタブ選択時は強制展開
    if (!isAll) group.open = true;

    // カード単位で検索フィルター
    let visible = 0;
    group.querySelectorAll(".tune-card").forEach(card => {
      const op   = card.querySelector(".tune-card__op")?.textContent.toLowerCase()  ?? "";
      const desc = card.querySelector(".tune-card__desc")?.textContent.toLowerCase() ?? "";
      const show = !q || op.includes(q) || desc.includes(q);
      card.hidden = !show;
      if (show) visible++;
    });

    // 検索で全カードが非表示になったらグループごと隠す
    group.hidden = visible === 0;

    // 「すべて」表示時: 開閉状態を復元（検索中はすべて展開）
    if (isAll) group.open = q ? true : (savedStates[cat] !== false);
  });
}

function initTuneSearch() {
  document.getElementById("tune-search").addEventListener("input", applyTuneFilter);

  // フィルタータブ切替
  document.getElementById("tune-tabs").addEventListener("click", e => {
    const btn = e.target.closest(".tune-tab");
    if (!btn) return;
    _tuneTab = btn.dataset.tab;
    localStorage.setItem("sql_tune_tab", _tuneTab);
    document.querySelectorAll(".tune-tab").forEach(b =>
      b.classList.toggle("tune-tab--active", b === btn)
    );
    applyTuneFilter();
  });

  // カテゴリ別件数バッジを付与
  const counts = { all: TUNE_ITEMS.length };
  TUNE_ITEMS.forEach(item => { counts[item.category] = (counts[item.category] || 0) + 1; });
  const tabLabels = { all: "すべて", スキャン: "スキャン", 結合: "結合", 処理: "処理", その他: "その他" };
  document.querySelectorAll(".tune-tab[data-tab]").forEach(btn => {
    const tab = btn.dataset.tab;
    if (!(tab in counts)) return;
    btn.innerHTML = `${escapeHtml(tabLabels[tab] || tab)}<span class="tune-tab__badge">${counts[tab]}</span>`;
  });

  // 選択タブを復元
  const savedTab = localStorage.getItem("sql_tune_tab");
  if (savedTab && savedTab !== "all") {
    const btn = document.querySelector(`.tune-tab[data-tab="${savedTab}"]`);
    if (btn) btn.click();
  }

  // 解析パネル トグルボタン
  document.getElementById("tune-analyze-toggle").addEventListener("click", () => {
    const panel   = document.getElementById("tune-analyze");
    const isOpen  = !panel.hidden;
    panel.hidden  = isOpen;
    document.getElementById("tune-analyze-toggle")
      .classList.toggle("tune-analyze-toggle--active", !isOpen);
    if (isOpen) {
      // 閉じるときは結果もリセット
      document.getElementById("tune-plan-input").value   = "";
      const r = document.getElementById("tune-analyze-result");
      r.hidden    = true;
      r.innerHTML = "";
    } else {
      document.getElementById("tune-plan-input").focus();
    }
  });

  // 解析ボタン
  document.getElementById("tune-analyze-btn").addEventListener("click", () => {
    const text = document.getElementById("tune-plan-input").value;
    if (!text.trim()) { showError("実行計画を入力してください"); return; }
    renderAnalyzeResult(analyzeExecutionPlan(text));
  });

  // クリアボタン
  document.getElementById("tune-analyze-clear-btn").addEventListener("click", () => {
    document.getElementById("tune-plan-input").value   = "";
    const r = document.getElementById("tune-analyze-result");
    r.hidden    = true;
    r.innerHTML = "";
  });
}

// ==================================================
// 実行計画解析
// ==================================================

// DBMS_XPLAN / AUTOTRACE 出力から操作名を抽出し TUNE_ITEMS とマッチング
function analyzeExecutionPlan(text) {
  const lines = text.split('\n');

  // ヘッダー行（"| Id | Operation | Name |..."）から Operation・Name 列インデックスを特定
  let opColIndex   = -1;
  let nameColIndex = -1;
  for (const line of lines) {
    if (/\|\s*Id/i.test(line) && /Operation/i.test(line)) {
      const parts  = line.split('|');
      opColIndex   = parts.findIndex(p => /^\s*Operation\s*$/i.test(p));
      nameColIndex = parts.findIndex(p => /^\s*Name\s*$/i.test(p));
      break;
    }
  }
  // 見つからない場合は2・3列目をデフォルトとする
  const colIdx  = opColIndex   >= 1 ? opColIndex   : 2;
  const nameIdx = nameColIndex >= 1 ? nameColIndex : colIdx + 1;

  // 各データ行から操作名・対象名・出現回数を収集
  // Map<op_upper, { op: string, names: Set<string>, count: number }>
  const opMap = new Map();
  for (const line of lines) {
    if (!line.includes('|')) continue;
    // ヘッダー行・区切り行をスキップ
    if (/Operation/i.test(line) && /Id/i.test(line)) continue;
    if (/^[\s|\-+]+$/.test(line)) continue;

    const parts = line.split('|');
    if (colIdx >= parts.length) continue;
    const op = parts[colIdx].trim();
    if (!op || op.length <= 1) continue;

    const name = nameIdx < parts.length ? parts[nameIdx].trim() : "";
    const key  = op.toUpperCase();
    if (!opMap.has(key)) opMap.set(key, { op, names: new Set(), count: 0 });
    const entry = opMap.get(key);
    entry.count++;
    if (name) entry.names.add(name);
  }

  // TUNE_ITEMS とマッチング（大文字小文字を無視した完全一致）
  const matched = [];
  for (const item of TUNE_ITEMS) {
    const found = opMap.get(item.op.toUpperCase());
    if (found) matched.push({ item, names: [...found.names], count: found.count });
  }

  // 重要度順（high → mid → low → ok）にソート
  const levelOrder = { high: 0, mid: 1, low: 2, ok: 3 };
  matched.sort((a, b) => levelOrder[a.item.level] - levelOrder[b.item.level]);

  return { matched, opCount: opMap.size };
}

function renderAnalyzeResult({ matched, opCount }) {
  const result = document.getElementById("tune-analyze-result");
  result.hidden = false;

  const highCount = matched.filter(m => m.item.level === "high").length;
  const midCount  = matched.filter(m => m.item.level === "mid").length;

  const lvMap = {
    high: { badge: "badge--danger",  label: "要改善" },
    mid:  { badge: "badge--warning", label: "要注意" },
    low:  { badge: "badge--info",    label: "参考" },
    ok:   { badge: "badge--success", label: "良好" },
  };

  let html = '<div class="tune-analyze__summary">';

  if (opCount === 0) {
    html += '<p class="tune-analyze__msg">実行計画を解析できませんでした。AUTOTRACE または DBMS_XPLAN の出力をそのまま貼り付けてください。</p>';
  } else if (matched.length === 0) {
    html += '<p class="tune-analyze__msg tune-analyze__msg--ok">検出された操作に問題はありません。</p>';
  } else {
    html += '<div class="tune-analyze__counts">';
    if (highCount > 0) html += `<span class="badge badge--danger">要改善 ${highCount}</span>`;
    if (midCount  > 0) html += `<span class="badge badge--warning">要注意 ${midCount}</span>`;
    const rest = matched.length - highCount - midCount;
    if (rest > 0) html += `<span class="badge badge--info">参考 ${rest}</span>`;
    html += `<span class="tune-analyze__op-count">${opCount} 操作を検出</span>`;
    html += '</div>';
  }
  html += '</div>';

  if (matched.length > 0) {
    html += '<div class="tune-analyze__grid">';
    for (const { item, names, count } of matched) {
      // 出現回数バッジ（2回以上の場合のみ表示）
      const countBadge = count > 1
        ? `<span class="tune-card__count">×${count}</span>`
        : '';
      // 対象テーブル/インデックス名タグ
      const namesTags = names.length > 0
        ? `<div class="tune-card__names">${names.map(n => `<span class="tune-card__name">${escapeHtml(n)}</span>`).join('')}</div>`
        : '';
      html += `
        <div class="tune-card tune-card--${escapeHtml(item.level)}">
          <div class="tune-card__header">
            <div class="tune-card__op-wrap">
              <code class="tune-card__op">${escapeHtml(item.op)}</code>
              ${countBadge}
            </div>
            <div class="tune-card__badges">
              <span class="badge badge--neutral">${escapeHtml(item.category)}</span>
              <span class="badge ${lvMap[item.level].badge}">${lvMap[item.level].label}</span>
            </div>
          </div>
          ${namesTags}
          <p class="tune-card__desc">${escapeHtml(item.desc)}</p>
        </div>`;
    }
    html += '</div>';
  }

  result.innerHTML = html;
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

  // SQL 取り込みパネルをリセット
  document.getElementById("memo-sql-import").hidden = true;
  document.getElementById("memo-sql-input").value = "";

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
  if (!data.table_name) { showError("テーブル名を入力してください"); return; }

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
          showError("無効なファイル形式です"); resolve(); return;
        }
        for (const m of data.memos) {
          if (m.table_name) await _db.addTableMemo(m);
        }
        showToast(`${data.memos.length} 件をインポートしました`);
        await refreshMemoList();
      } catch {
        showError("インポートに失敗しました");
      }
      resolve();
    };
    reader.readAsText(file);
  });
}

// ==================================================
// SQL パーサー: CREATE TABLE / COMMENT / INDEX → メモ形式に変換
// ==================================================

// カンマ区切り（括弧内はスキップ）
function _splitTopLevel(str) {
  const parts = [];
  let depth = 0, cur = '';
  for (const ch of str) {
    if (ch === '(') { depth++; cur += ch; }
    else if (ch === ')') { depth--; cur += ch; }
    else if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; }
    else { cur += ch; }
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

// CREATE TABLE パース
function _parseCreateTable(stmt, result, pkCols) {
  const nameMatch = stmt.match(/CREATE\s+(?:GLOBAL\s+TEMPORARY\s+)?TABLE\s+([\w."]+)\s*\(/i);
  if (!nameMatch) return;
  const parts = nameMatch[1].replace(/"/g, '').split('.');
  if (!result.table_name) result.table_name = parts[parts.length - 1];
  if (!result.schema_name && parts.length > 1) result.schema_name = parts[parts.length - 2];

  // 最外の括弧を取得
  const start = stmt.indexOf('(');
  if (start === -1) return;
  let depth = 0, end = -1;
  for (let i = start; i < stmt.length; i++) {
    if (stmt[i] === '(') depth++;
    else if (stmt[i] === ')') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) return;

  const defs = _splitTopLevel(stmt.substring(start + 1, end));
  for (const def of defs) {
    const trimmed = def.trim();
    if (!trimmed) continue;

    // PRIMARY KEY 制約
    if (/^(?:CONSTRAINT\s+\S+\s+)?PRIMARY\s+KEY\s*\(/i.test(trimmed)) {
      const m = trimmed.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);
      if (m) m[1].split(',').forEach(c => pkCols.add(c.trim().replace(/^"|"$/g, '').toUpperCase()));
      continue;
    }
    // UNIQUE / FOREIGN KEY / CHECK 制約はスキップ
    if (/^(?:CONSTRAINT\s+\S+\s+)?(?:UNIQUE|FOREIGN\s+KEY|CHECK)\s*/i.test(trimmed)) continue;

    const col = _parseColumnDef(trimmed, pkCols);
    if (col) result.columns.push(col);
  }
}

// カラム定義パース
function _parseColumnDef(def, pkCols) {
  const trimmed = def.trim();
  // 予約語で始まる行はカラムではない
  if (/^(?:CONSTRAINT|PRIMARY|UNIQUE|FOREIGN|CHECK|INDEX)\b/i.test(trimmed)) return null;

  // カラム名（引用符あり・なし）
  const nameMatch = trimmed.match(/^"?(\w+)"?\s+(.+)/is);
  if (!nameMatch) return null;
  const name = nameMatch[1];
  const rest = nameMatch[2];

  // 型: DEFAULT / NULL / NOT / CONSTRAINT / ENABLE / DISABLE / GENERATED が来るまで
  const terminators = /\b(?:DEFAULT|NOT\s+NULL|NULL|CONSTRAINT|ENABLE|DISABLE|GENERATED|ENCRYPT|VISIBLE|INVISIBLE)\b/i;
  const termMatch = rest.match(terminators);
  const type = (termMatch ? rest.substring(0, termMatch.index) : rest).trim().replace(/\s+/g, ' ');
  if (!type) return null;

  const afterType = rest.substring(termMatch ? termMatch.index : rest.length).toUpperCase();
  const nullable = !/\bNOT\s+NULL\b/.test(afterType);
  const pk = /\bPRIMARY\s+KEY\b/.test(afterType);
  if (pk && pkCols) pkCols.add(name.toUpperCase());

  return { pk, name, type, nullable, comment: '' };
}

// COMMENT ON TABLE パース
function _parseCommentOnTable(stmt, result) {
  const m = stmt.match(/COMMENT\s+ON\s+TABLE\s+([\w."]+)\s+IS\s+'((?:[^']|'')*)'/i);
  if (!m) return;
  result.comment = m[2].replace(/''/g, "'");
  if (!result.table_name) {
    const parts = m[1].replace(/"/g, '').split('.');
    result.table_name = parts[parts.length - 1];
    if (parts.length > 1) result.schema_name = parts[parts.length - 2];
  }
}

// COMMENT ON COLUMN パース
function _parseCommentOnColumn(stmt, result) {
  const m = stmt.match(/COMMENT\s+ON\s+COLUMN\s+([\w."]+)\s+IS\s+'((?:[^']|'')*)'/i);
  if (!m) return;
  const parts = m[1].replace(/"/g, '').split('.');
  const colName = parts[parts.length - 1].toUpperCase();
  const comment = m[2].replace(/''/g, "'");
  const col = result.columns.find(c => c.name.toUpperCase() === colName);
  if (col) col.comment = comment;
}

// CREATE INDEX パース
function _parseCreateIndex(stmt, result) {
  const m = stmt.match(/CREATE\s+(UNIQUE\s+)?INDEX\s+"?(\w+)"?\s+ON\s+([\w."]+)\s*\(([^)]+)\)/i);
  if (!m) return;
  const unique = !!m[1];
  const idxName = m[2];
  // カラムリスト: ASC/DESC・関数部分を除いて名前のみ
  const cols = m[4].split(',')
    .map(c => c.trim().split(/[\s(]/)[0].replace(/^"|"$/g, ''))
    .filter(Boolean)
    .join(', ');
  result.indexes.push({ name: idxName, unique, cols, comment: '' });
}

// ALTER TABLE ADD PRIMARY KEY パース
function _parseAlterTablePK(stmt, pkCols) {
  const m = stmt.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);
  if (m) m[1].split(',').forEach(c => pkCols.add(c.trim().replace(/^"|"$/g, '').toUpperCase()));
}

// SQL 全体をパースしてメモ形式に変換
function parseSqlToMemo(sql) {
  const result = { schema_name: '', table_name: '', comment: '', columns: [], indexes: [] };
  const pkCols = new Set();

  // コメント除去
  const cleaned = sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');

  // セミコロンで文を分割
  const stmts = cleaned.split(';').map(s => s.trim()).filter(Boolean);

  for (const stmt of stmts) {
    if (/^\s*CREATE\s+(?:GLOBAL\s+TEMPORARY\s+)?TABLE\s+/i.test(stmt)) {
      _parseCreateTable(stmt, result, pkCols);
    } else if (/^\s*COMMENT\s+ON\s+TABLE\s+/i.test(stmt)) {
      _parseCommentOnTable(stmt, result);
    } else if (/^\s*COMMENT\s+ON\s+COLUMN\s+/i.test(stmt)) {
      _parseCommentOnColumn(stmt, result);
    } else if (/^\s*CREATE\s+(?:UNIQUE\s+)?INDEX\s+/i.test(stmt)) {
      _parseCreateIndex(stmt, result);
    } else if (/^\s*ALTER\s+TABLE\s+/i.test(stmt) && /PRIMARY\s+KEY/i.test(stmt)) {
      _parseAlterTablePK(stmt, pkCols);
    }
  }

  // PK 列をマーク
  result.columns.forEach(col => {
    if (pkCols.has(col.name.toUpperCase())) col.pk = true;
  });

  return result;
}

// パース結果をフォームに反映
function applyParsedMemo(parsed) {
  if (!parsed.table_name) {
    showError("テーブル名が見つかりませんでした。CREATE TABLE 文を含めてください。");
    return false;
  }
  document.getElementById("memo-f-schema").value  = parsed.schema_name;
  document.getElementById("memo-f-table").value   = parsed.table_name;
  document.getElementById("memo-f-comment").value = parsed.comment;

  _memoColCount = 0;
  const colBody = document.getElementById("memo-col-body");
  colBody.innerHTML = "";
  parsed.columns.forEach(col => colBody.appendChild(createMemoColRow(col)));

  _memoIdxCount = 0;
  const idxBody = document.getElementById("memo-idx-body");
  idxBody.innerHTML = "";
  parsed.indexes.forEach(idx => idxBody.appendChild(createMemoIdxRow(idx)));

  return true;
}
