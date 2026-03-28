'use strict';

// ==================================================
// SQL Toolkit — アプリケーション初期化・イベントリスナー登録
// ==================================================

// ==================================================
// テーブル定義メモの初期化
// ==================================================
async function initTableMemo() {
  // 開閉状態の復元
  const memoDetails = document.getElementById("memo-details");
  const stored = localStorage.getItem("sql_memo_open");
  if (stored !== null) memoDetails.open = stored === "true";
  memoDetails.addEventListener("toggle", () => {
    localStorage.setItem("sql_memo_open", memoDetails.open);
  });

  // リスト描画
  await refreshMemoList();

  // 検索
  document.getElementById("memo-search").addEventListener("input", () => refreshMemoList());

  // テーブルを追加
  document.getElementById("memo-add-btn").addEventListener("click", () => openMemoModal(null));

  // エクスポート
  document.getElementById("memo-export-btn").addEventListener("click", async () => {
    const memos = await _db.getAllTableMemos();
    exportMemos(memos);
  });

  // インポート
  document.getElementById("memo-import-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (file) await importMemos(file);
    e.target.value = "";
  });

  // モーダル: カラム追加
  document.getElementById("memo-col-add-btn").addEventListener("click", () => {
    document.getElementById("memo-col-body").appendChild(createMemoColRow());
  });

  // モーダル: インデックス追加
  document.getElementById("memo-idx-add-btn").addEventListener("click", () => {
    document.getElementById("memo-idx-body").appendChild(createMemoIdxRow());
  });

  // モーダル: 保存
  document.getElementById("memo-save-btn").addEventListener("click", saveMemoForm);

  // モーダル: キャンセル・閉じる
  document.getElementById("memo-cancel-btn").addEventListener("click", closeMemoModal);
  document.getElementById("memo-modal-close-btn").addEventListener("click", closeMemoModal);
  document.getElementById("memo-modal-backdrop").addEventListener("click", closeMemoModal);

  // モーダル: Esc で閉じる
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !document.getElementById("memo-modal").hidden) closeMemoModal();
  });

  // SQL 取り込みパネル: 開閉トグル
  document.getElementById("memo-sql-toggle-btn").addEventListener("click", () => {
    const panel = document.getElementById("memo-sql-import");
    panel.hidden = !panel.hidden;
    if (!panel.hidden) document.getElementById("memo-sql-input").focus();
  });

  // SQL 取り込みパネル: 解析・反映
  document.getElementById("memo-sql-parse-btn").addEventListener("click", () => {
    const sql = document.getElementById("memo-sql-input").value;
    if (!sql.trim()) { showError("SQL を入力してください"); return; }
    const parsed = parseSqlToMemo(sql);
    if (applyParsedMemo(parsed)) {
      document.getElementById("memo-sql-import").hidden = true;
      document.getElementById("memo-sql-input").value = "";
      showToast("SQL を取り込みました");
    }
  });
}

// ==================================================
// 初期化
// ==================================================
window.addEventListener("load", async () => {
  _db = new SqlDB();
  await _db.open();
  await ensureDefaultEnvs(_db);

  // 選択済み環境キーを復元（ブラウザ固有の選択状態のため localStorage を使用）
  const saved = localStorage.getItem("sql_selected_env");
  const envs  = await _db.getAllEnvs();
  selectedEnvKey = (saved && envs.some(e => e.key === saved)) ? saved : (envs[0]?.key ?? "");

  // チューニング対象グリッドの描画
  renderTuneGrid();

  // チューニング対象: 検索初期化
  initTuneSearch();

  // テーブル定義メモ
  await initTableMemo();

  // チューニング対象の開閉状態を復元
  const tuneDetails = document.getElementById("tune-details");
  const tuneStored  = localStorage.getItem("sql_tune_open");
  tuneDetails.open = tuneStored !== null ? tuneStored === "true" : true;
  tuneDetails.addEventListener("toggle", () => {
    localStorage.setItem("sql_tune_open", tuneDetails.open);
  });

  renderEnvSegCtrl(envs);
  renderEnvList(envs);
  renderSqlplusOptions();
  loadParamState();
  updateConnPreview(envs);

  // 接続先変更 → プレビュー更新
  document.getElementById("env").addEventListener("change", async () => {
    updateConnPreview(await _db.getAllEnvs());
  });
  document.getElementById("sqlplus-options").addEventListener("change", async () => {
    updateConnPreview(await _db.getAllEnvs());
  });
  document.getElementById("sqlplus-extra").addEventListener("input", async () => {
    updateConnPreview(await _db.getAllEnvs());
  });

  // 接続コマンドをコピー
  document.getElementById("conn").addEventListener("click", async () => {
    const cmd = buildConnCommand(await _db.getAllEnvs());
    Clipboard.copy(cmd).then(() => showToast("コピーしました"));
  });

  // バインド変数: 行追加ボタン
  document.getElementById("param-add").addEventListener("click", () => {
    appendParamRow();
    saveParamState();
  });

  // バインド変数コピー
  document.getElementById("param-copy").addEventListener("click", () => {
    const text = buildParamText();
    if (!text) { showError("使用する変数がありません"); return; }
    Clipboard.copy(text).then(() => showToast("コピーしました"));
  });

  // セッション設定コピーボタン（トーストのみ追加）
  document.querySelectorAll(".btn.copy").forEach(btn => {
    btn.addEventListener("click", () => {
      const text = getString(btn.dataset.copy, btn.dataset.params ?? null);
      Clipboard.copy(text).then(() => showToast("コピーしました"));
    });
  });

  // 環境追加フォーム
  document.getElementById("env-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const key     = document.getElementById("env-key").value.trim();
    const user    = document.getElementById("env-user").value.trim();
    const pass    = document.getElementById("env-pass").value;
    const host    = document.getElementById("env-host").value.trim();
    const portRaw = document.getElementById("env-port").value.trim();
    const service = document.getElementById("env-service").value.trim();

    const err = validateEnvInputs({ key, user, host, portRaw, service });
    if (err) { showError(err); return; }

    const currentEnvs = await _db.getAllEnvs();
    if (currentEnvs.some(e => e.key === key)) {
      showError(`環境名「${key}」はすでに存在します`);
      return;
    }

    const port = portRaw || "1521";
    await _db.addEnv({ key, username: user, password: pass, connect_identifier: `${host}:${port}/${service}` });
    e.target.reset();
    // アクティビティログに記録
    ActivityLogger.log('sql', 'create', 'env', key, `接続環境「${key}」を追加`);
    showToast(`「${key}」を追加しました`);
    await refreshEnvs();
  });

  // JSON エクスポート
  document.getElementById("env-export").addEventListener("click", async () => {
    exportEnvJson(await _db.getAllEnvs());
  });

  // JSON インポート
  document.getElementById("env-import-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (file) await importEnvJson(file);
    e.target.value = "";
  });
});

// キーボードショートカット
document.addEventListener('keydown', (e) => {
  // Escape: 入力中ならフォーカスを外す
  if (e.key === 'Escape') {
    const isInInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable;
    if (isInInput && !e.isComposing) { e.target.blur(); return; }
  }
  // Ctrl+Enter: 接続コマンドをコピー
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('conn')?.click();
    return;
  }
});

// ショートカットキー一覧登録
ShortcutHelp.register([
  { name: 'ショートカット', shortcuts: [
    { keys: ['Ctrl', 'Enter'], description: '接続コマンドをコピー' },
    { keys: ['Escape'], description: 'モーダルを閉じる' },
  ]}
]);

// テーマ変更を受け取る（親フレームからの postMessage）
window.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'theme-change') {
    document.documentElement.setAttribute('data-theme', e.data.theme);
    localStorage.setItem('mytools_theme', e.data.theme);
  }
});
