// ==============================
// 定数
// ==============================

/** セクションタイプのラベル */
const TYPE_LABELS = {
  list: "リスト",
  grid: "グリッド",
  command_builder: "コマンドビルダー",
  table: "テーブル",
  memo: "メモ",
  checklist: "チェックリスト",
};

/** コマンドビルダー履歴の localStorage キープレフィックス（ブラウザ固有の UI 状態） */
const CMD_HISTORY_PREFIX = "dashboard_url_history_";

/** セクション折りたたみ状態の localStorage キープレフィックス（ブラウザ固有） */
const COLLAPSE_PREFIX = "dashboard_collapsed_";

/** チェックリスト状態の localStorage キープレフィックス（ブラウザ固有） */
const CHECKLIST_STATE_PREFIX = "dashboard_checklist_";

/** チェックリスト最終リセット日の localStorage キープレフィックス（ブラウザ固有） */
const CHECKLIST_DATE_PREFIX = "dashboard_checklist_date_";

/** テーブル列の非表示状態保存用 localStorage キープレフィックス（ブラウザ固有の UI 状態） */
const TABLE_COL_HIDDEN_PREFIX = "dashboard_table_hidden_cols_";

/** テーブルセクション独自バインド変数のアクティブプリセット保存用 localStorage キープレフィックス（ブラウザ固有） */
const TABLE_ACTIVE_PRESET_PREFIX = "dashboard_table_active_preset_";

/** リストセクション独自バインド変数のアクティブプリセット保存用 localStorage キープレフィックス（ブラウザ固有） */
const LIST_ACTIVE_PRESET_PREFIX = "dashboard_list_active_preset_";

/** グリッドセクション独自バインド変数のアクティブプリセット保存用 localStorage キープレフィックス（ブラウザ固有） */
const GRID_ACTIVE_PRESET_PREFIX = "dashboard_grid_active_preset_";

/** 選択中のプリセットID の localStorage キー（ブラウザ固有の UI 状態） */
const ACTIVE_PRESET_KEY_PREFIX = "dashboard_active_preset_";

// SVGアイコンは js/core/icons.js の Icons を使用

// ==============================
// ユーティリティ
// ==============================

// HTML エスケープ / 属性エスケープ: js/core/utils.js の escapeHtml を使用
const escapeAttr = escapeHtml;

// isValidUrl は js/core/utils.js に定義

// トースト通知: js/components/toast.js の Toast.show() を使用
const showToast = (msg = "コピーしました", type) => Toast.show(msg, type);

// URLパラメータから instance ID を取得（複数ホームタブ対応）
const _instanceId = new URLSearchParams(location.search).get("instance") || "";

/** 選択中のプリセットID を保存する localStorage キー */
const ACTIVE_PRESET_KEY = ACTIVE_PRESET_KEY_PREFIX + _instanceId;

// ==============================
// DashboardDB - IndexedDB 管理（js/db/dashboard_db.js を参照）
// ==============================

