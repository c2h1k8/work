// SqlDB クラスは js/db/sql_db.js を参照

// ==================================================
// グローバル状態
// ==================================================
let _db            = null;
let selectedEnvKey = "";
let _nextParamId   = 1;

const DEFAULT_ENVS = [
  { key: "UT",  username: "xxxx", password: "xxxx", connect_identifier: "127.0.0.1:1521/xxxx" },
  { key: "XXX", username: "xxxx", password: "xxxx", connect_identifier: "127.0.0.1:1521/xxxx" },
];

// ==================================================
// SQL*Plus 起動オプション定義
// ==================================================
const SQLPLUS_OPTIONS = [
  { id: "opt-silent",     flag: "-S", label: "-S", desc: "サイレントモード（ヘッダー・プロンプト非表示）" },
  { id: "opt-login-once", flag: "-L", label: "-L", desc: "ログイン試行を1回のみに制限" },
];

// ==================================================
// バインド変数の型定義（datatype.txt の仕様に準拠）
// lenMode: "required" = 桁数必須, "optional" = 精度/スケール任意, "none" = 桁数なし
// ==================================================
const TYPE_DEFS = {
  VARCHAR2:  { label: "VARCHAR2",  lenMode: "required", isStrings: true,  nPrefix: false, isDate: false, defaultLen: "20" },
  NVARCHAR2: { label: "NVARCHAR2", lenMode: "required", isStrings: true,  nPrefix: true,  isDate: false, defaultLen: "20" },
  CHAR:      { label: "CHAR",      lenMode: "required", isStrings: true,  nPrefix: false, isDate: false, defaultLen: "6"  },
  NUMBER:    { label: "NUMBER",    lenMode: "optional", isStrings: false, nPrefix: false, isDate: false, defaultLen: ""   },
  DATE:      { label: "DATE",      lenMode: "none",     isStrings: false, nPrefix: false, isDate: true,  defaultLen: ""   },
};

// ==================================================
// 実行計画ガイド（操作定義）
// level: "high"=要改善（赤）/ "mid"=要注意（黄）/ "low"=参考（青）/ "ok"=良好（緑）
// ==================================================
const TUNE_ITEMS = [
  // ── スキャン ──────────────────────────────────────────────
  { op: "INDEX UNIQUE SCAN",
    category: "スキャン", level: "ok",
    desc: "等価条件で B-tree インデックスから 1 件取得。最もコストが低い最適なアクセス方法。" },
  { op: "INDEX RANGE SCAN",
    category: "スキャン", level: "ok",
    desc: "範囲条件（= / < / > / BETWEEN / LIKE 前方一致）でのインデックス走査。典型的な良好アクセスパス。" },
  { op: "INDEX RANGE SCAN DESCENDING",
    category: "スキャン", level: "ok",
    desc: "INDEX RANGE SCAN の降順版。ORDER BY 列 DESC にインデックスが利用されているとき発生。" },
  { op: "TABLE ACCESS BY INDEX ROWID",
    category: "スキャン", level: "ok",
    desc: "インデックスで特定した ROWID でテーブル行を取得。インデックス経由アクセスの標準的な形。" },
  { op: "TABLE ACCESS BY INDEX ROWID BATCHED",
    category: "スキャン", level: "ok",
    desc: "複数 ROWID を一括取得（Oracle 12c 以降）。TABLE ACCESS BY INDEX ROWID よりブロック I/O を削減。" },
  { op: "INDEX FULL SCAN (MIN/MAX)",
    category: "スキャン", level: "ok",
    desc: "MIN / MAX 取得のためにインデックスの先頭または末尾エントリのみを参照。極めて低コスト。" },
  { op: "PARTITION RANGE SINGLE",
    category: "スキャン", level: "ok",
    desc: "WHERE 句にパーティションキーが含まれ、1 つのパーティションに絞り込まれた（プルーニング成功）。" },
  { op: "TABLE ACCESS FULL",
    category: "スキャン", level: "high",
    desc: "テーブル全件スキャン。大テーブルで発生している場合はインデックスの作成・利用を検討する。" },
  { op: "PARTITION RANGE ALL",
    category: "スキャン", level: "high",
    desc: "全パーティションを走査。WHERE 句にパーティションキーを含めてプルーニングを効かせる。" },
  { op: "INDEX FULL SCAN",
    category: "スキャン", level: "mid",
    desc: "インデックスの全エントリを順に走査。INDEX RANGE SCAN に絞り込めないか条件を見直す。" },
  { op: "INDEX FAST FULL SCAN",
    category: "スキャン", level: "mid",
    desc: "マルチブロック読み込みによるインデックス全走査。SELECT 列をインデックス列のみに絞れないか確認する。" },
  { op: "INDEX SKIP SCAN",
    category: "スキャン", level: "mid",
    desc: "複合インデックスの先頭列が WHERE 条件にない場合に発生。インデックス構成の見直し（先頭列の選択）を検討する。" },
  { op: "PARTITION RANGE ITERATOR",
    category: "スキャン", level: "mid",
    desc: "複数パーティションをスキャン。プルーニング条件をさらに絞り込めないか見直す。" },

  // ── 結合 ──────────────────────────────────────────────────
  { op: "NESTED LOOPS",
    category: "結合", level: "low",
    desc: "外側ループの各行に対して内側テーブルをアクセス。内側テーブルに適切なインデックスがある小〜中規模結合に有効。" },
  { op: "NESTED LOOPS OUTER",
    category: "結合", level: "low",
    desc: "Nested Loops の外部結合版。内側テーブルに一致しない場合も外側の行を返す。" },
  { op: "HASH JOIN",
    category: "結合", level: "low",
    desc: "小さい方のテーブルをハッシュテーブルに構築して大テーブルと等価結合。PGA / hash_area_size の調整を検討する。" },
  { op: "HASH JOIN OUTER",
    category: "結合", level: "low",
    desc: "Hash Join の外部結合版。大規模テーブルの LEFT OUTER JOIN で典型的に発生。" },
  { op: "SORT MERGE JOIN",
    category: "結合", level: "low",
    desc: "両テーブルを結合キーでソートしてマージ。等価・不等価結合に対応。既にソート済みの場合はコスト低。" },
  { op: "MERGE JOIN CARTESIAN",
    category: "結合", level: "high",
    desc: "デカルト積（直積）結合。結合条件の漏れが原因のことが多い。WHERE 句の結合条件を確認する。" },

  // ── 処理 ──────────────────────────────────────────────────
  { op: "HASH (GROUP BY)",
    category: "処理", level: "ok",
    desc: "ハッシュ集計による GROUP BY。ソートが不要でメモリ効率が良い。大量データの集計に有効。" },
  { op: "HASH UNIQUE",
    category: "処理", level: "ok",
    desc: "ハッシュによる重複排除（DISTINCT 相当）。SORT UNIQUE よりソートコストがない分効率的。" },
  { op: "COUNT STOPKEY",
    category: "処理", level: "ok",
    desc: "ROWNUM 条件による早期終了（FETCH FIRST / LIMIT 相当）。必要な件数に達した時点で処理を停止。" },
  { op: "SORT (ORDER BY)",
    category: "処理", level: "mid",
    desc: "行のソート処理。インデックスで ORDER BY を排除できないか、または SORT_AREA_SIZE の調整を検討する。" },
  { op: "SORT (GROUP BY)",
    category: "処理", level: "mid",
    desc: "集約のためのソート処理。HASH GROUP BY への変換（_GBY_HASH_AGGREGATION_ENABLED）を検討する。" },
  { op: "SORT (GROUP BY ROLLUP)",
    category: "処理", level: "mid",
    desc: "ROLLUP / CUBE 集計のソート処理。集計列数・行数が多い場合は PGA メモリに注意する。" },
  { op: "SORT UNIQUE",
    category: "処理", level: "mid",
    desc: "DISTINCT 処理のためのソート。HASH UNIQUE に変換できないか確認する。" },
  { op: "FILTER",
    category: "処理", level: "mid",
    desc: "相関サブクエリによるフィルター。外側クエリの行数分だけ実行される。EXISTS や JOIN への書き換えを検討する。" },
  { op: "BUFFER SORT",
    category: "処理", level: "low",
    desc: "一時メモリ領域でのソート・バッファリング。SORT_AREA_SIZE / PGA の調整を検討する。" },
  { op: "WINDOW SORT",
    category: "処理", level: "low",
    desc: "分析関数（ウィンドウ関数）のためのソート。PARTITION BY / ORDER BY の列にインデックスが利用できないか確認する。" },
  { op: "WINDOW BUFFER",
    category: "処理", level: "low",
    desc: "ROWS / RANGE 指定を伴う分析関数のバッファリング。PGA に収まるサイズか確認する。" },

  // ── その他 ─────────────────────────────────────────────────
  { op: "VIEW",
    category: "その他", level: "low",
    desc: "ビューまたはインラインビューの評価。必要に応じてビューのマージ（View Merging）が発生しているか確認する。" },
  { op: "UNION-ALL",
    category: "その他", level: "low",
    desc: "複数の結果セットを UNION ALL で連結。各ブランチが独立して実行される。" },
  { op: "CONCATENATION",
    category: "その他", level: "mid",
    desc: "OR 条件を複数の実行計画に分割して結果を UNION ALL。各ブランチのコストを確認する。" },
  { op: "CONNECT BY (WITH FILTERING)",
    category: "その他", level: "mid",
    desc: "START WITH フィルタリングありの階層クエリ。再帰深度が深い場合はメモリ・CPU に注意する。" },
  { op: "REMOTE",
    category: "その他", level: "mid",
    desc: "DB Link 経由のリモートアクセス。ネットワーク遅延と転送データ量に注意。ローカルでの JOIN を検討する。" },
];

// ==================================================
// SVG アイコン定数
// ==================================================
const PENCIL_SVG = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.25.25 0 0 0-.064.108l-.558 1.953 1.953-.558a.249.249 0 0 0 .108-.064Zm1.238-3.763a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354Z"/></svg>`;
const TRASH_SVG  = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z"/></svg>`;

// DB が空の場合にデフォルト環境を投入
async function ensureDefaultEnvs(db) {
  const envs = await db.getAllEnvs();
  if (envs.length === 0) {
    for (const e of DEFAULT_ENVS) await db.addEnv({ ...e });
  }
}

// ==================================================
// connect_identifier のパース（"host:port/service" → オブジェクト）
// ==================================================
function parseConnIdentifier(ci) {
  const m = (ci ?? "").match(/^([^:/]+)(?::(\d+))?\/(.+)$/);
  if (!m) return { host: ci ?? "", port: "", service: "" };
  return { host: m[1], port: m[2] ?? "", service: m[3] };
}

// ==================================================
// 環境フォームバリデーション（追加・編集共通）
// ==================================================
function validateEnvInputs({ key, user, host, portRaw, service }) {
  if (!key)  return "環境名を入力してください";
  if (!user) return "ユーザー名を入力してください";
  if (!/^[A-Za-z][A-Za-z0-9_$#]*$/.test(user))
    return "ユーザー名: 英字始まり、英数字・_・$・# のみ使用できます";
  if (!host) return "ホスト名またはIPアドレスを入力してください";
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(host))
    return "ホスト名: 英数字・.・- のみ使用できます（IPv4アドレスも可）";
  if (portRaw !== "" && (!/^\d+$/.test(portRaw) || +portRaw < 1 || +portRaw > 65535))
    return "ポート: 1〜65535 の数値を入力してください";
  if (!service) return "サービス名を入力してください";
  if (!/^[A-Za-z0-9][A-Za-z0-9._]*$/.test(service))
    return "サービス名: 英数字・.・_ のみ使用できます";
  return null;
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
    navigator.clipboard.writeText(cmd).then(() => showToast("コピーしました"));
  });

  // バインド変数: 行追加ボタン
  document.getElementById("param-add").addEventListener("click", () => {
    appendParamRow();
    saveParamState();
  });

  // バインド変数コピー
  document.getElementById("param-copy").addEventListener("click", () => {
    const text = buildParamText();
    if (!text) { showToast("使用する変数がありません", true); return; }
    navigator.clipboard.writeText(text).then(() => showToast("コピーしました"));
  });

  // セッション設定コピーボタン（トーストのみ追加）
  document.querySelectorAll(".btn.copy").forEach(btn => {
    btn.addEventListener("click", () => {
      const text = getString(btn.dataset.copy, btn.dataset.params ?? null);
      navigator.clipboard.writeText(text).then(() => showToast("コピーしました"));
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
    if (err) { showToast(err, true); return; }

    const currentEnvs = await _db.getAllEnvs();
    if (currentEnvs.some(e => e.key === key)) {
      showToast(`環境名「${key}」はすでに存在します`, true);
      return;
    }

    const port = portRaw || "1521";
    await _db.addEnv({ key, username: user, password: pass, connect_identifier: `${host}:${port}/${service}` });
    e.target.reset();
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
    if (err) { showToast(err, true); return; }

    // キー変更時の重複チェック
    const allEnvs = await _db.getAllEnvs();
    if (key !== env.key && allEnvs.some(e => e.key === key)) {
      showToast(`環境名「${key}」はすでに存在します`, true);
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
  if (envs.length <= 1) { showToast("最後の接続環境は削除できません", true); return; }
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
          showToast("無効なJSON形式です", true);
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
        showToast("JSONの読み込みに失敗しました", true);
      }
      resolve();
    };
    reader.readAsText(file);
  });
}

// ==================================================
// チューニング対象グリッドの描画
// ==================================================
function renderTuneGrid() {
  const grid = document.getElementById("tune-grid");
  TUNE_ITEMS.forEach(item => {
    const card   = document.createElement("div");
    card.className = `tune-card tune-card--${item.level}`;
    card.dataset.category = item.category;

    const header = document.createElement("div");
    header.className = "tune-card__header";

    const op = document.createElement("code");
    op.className   = "tune-card__op";
    op.textContent = item.op;

    const badges = document.createElement("div");
    badges.className = "tune-card__badges";

    const lvMap = {
      high: { badge: "badge--danger",  label: "要改善" },
      mid:  { badge: "badge--warning", label: "要注意" },
      low:  { badge: "badge--info",    label: "参考" },
      ok:   { badge: "badge--success", label: "良好" },
    };
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
    grid.appendChild(card);
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
// バインド変数 入力状態の localStorage 永続化
// ==================================================
const PARAM_STORAGE_KEY = "sql_params";

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

// テーマ変更を受け取る（親フレームからの postMessage）
window.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'theme-change') {
    document.documentElement.setAttribute('data-theme', e.data.theme);
    localStorage.setItem('mytools_theme', e.data.theme);
  }
});

// ==================================================
// 実行計画ガイド: タブ + 検索フィルター
// ==================================================
let _tuneTab = "all";

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
// テーブル定義メモ
// ==================================================

let _memoEditingId = null; // null = 追加, number = 編集対象ID
let _memoColCount  = 0;
let _memoIdxCount  = 0;

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
  if (!data.table_name) { showToast("テーブル名を入力してください", true); return; }

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

// ── メモリスト描画 ──
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
          showToast("無効なファイル形式です", true); resolve(); return;
        }
        for (const m of data.memos) {
          if (m.table_name) await _db.addTableMemo(m);
        }
        showToast(`${data.memos.length} 件をインポートしました`);
        await refreshMemoList();
      } catch {
        showToast("インポートに失敗しました", true);
      }
      resolve();
    };
    reader.readAsText(file);
  });
}

// ── テーブル定義メモの初期化 ──
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
}

// ==================================================
// トースト通知
// ==================================================
function showToast(msg = "コピーしました", isError = false) {
  const toast = document.getElementById("copy-toast");
  toast.textContent = msg;
  toast.className   = "toast" + (isError ? " toast--error" : "");
  toast.hidden      = false;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.hidden = true; }, 2500);
}
