'use strict';

// ==================================================
// SQL Toolkit — 定数定義
// デフォルト環境・SQL*Plus オプション・型定義・実行計画ガイド・SVGアイコン
// ==================================================

// SqlDB クラスは js/db/sql_db.js を参照

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

// バインド変数 localStorage キー
const PARAM_STORAGE_KEY = "sql_params";
