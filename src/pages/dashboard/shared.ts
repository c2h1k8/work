// ==================================================
// dashboard/shared — 定数・型（DashboardPage から分割）
// ==================================================
import {
  
  
  type SectionType, type SectionWidth,
} from '../../db/dashboard_db';
import { type SelectOption } from '../../components/Select';

// ── localStorage キー ──────────────────────────────────────
export const CMD_HISTORY_PREFIX       = 'dashboard_url_history_';
export const COLLAPSE_PREFIX          = 'dashboard_collapsed_';
export const CHECKLIST_STATE_PREFIX   = 'dashboard_checklist_';
export const CHECKLIST_DATE_PREFIX    = 'dashboard_checklist_date_';
export const TABLE_COL_HIDDEN_PREFIX  = 'dashboard_table_hidden_cols_';
export const TABLE_COL_ORDER_PREFIX   = 'dashboard_table_col_order_';
export const TABLE_SORT_PREFIX        = 'dashboard_table_sort_';
export const TABLE_QUERY_PREFIX       = 'dashboard_table_query_';
export const TABLE_ACTIVE_VIEW_PREFIX = 'dashboard_table_active_view_';
export const SORT_BY_USAGE_PREFIX     = 'dashboard_sort_by_usage_';
export const ACTIVE_PRESET_KEY_PREFIX = 'dashboard_active_preset_';


// ── セクション幅マップ ─────────────────────────────────────
export const WIDTH_COLS: Record<SectionWidth, number> = {
  narrow: 1, auto: 2, w3: 3, wide: 4, w5: 5, full: 6,
};

// Select コンポーネント用オプション定数
export const TYPE_SELECT_OPTIONS: SelectOption[] = [
  { value: 'list',            label: 'リスト' },
  { value: 'grid',            label: 'グリッド' },
  { value: 'table',           label: 'テーブル' },
  { value: 'command_builder', label: 'コマンドビルダー' },
  { value: 'countdown',       label: 'カウントダウン' },
  { value: 'checklist',       label: 'チェックリスト' },
  { value: 'memo',            label: 'メモ' },
  { value: 'markdown',        label: 'Markdown' },
  { value: 'iframe',          label: 'iframe' },
];

export const WIDTH_SELECT_OPTIONS: SelectOption[] = [
  { value: 'narrow', label: '1列（狭い）' },
  { value: 'auto',   label: '2列（通常）' },
  { value: 'w3',     label: '3列' },
  { value: 'wide',   label: '4列' },
  { value: 'w5',     label: '5列' },
  { value: 'full',   label: '全幅（6列）' },
];

// コマンドビルダー専用タイプ選択肢（copy=コピー / link=開く）
export const CMD_ITEM_TYPE_OPTIONS: SelectOption[] = [
  { value: 'copy', label: 'コピー', color: '#94a3b8' },
  { value: 'link', label: '開く',   color: '#10b981' },
];

export const COL_TYPE_OPTIONS: SelectOption[] = [
  { value: 'text', label: 'テキスト' },
  { value: 'copy', label: 'コピー' },
  { value: 'link', label: 'リンク' },
];

export const CHECKLIST_RESET_OPTIONS: SelectOption[] = [
  { value: 'never',   label: 'リセットしない' },
  { value: 'daily',   label: '毎日' },
  { value: 'weekly',  label: '毎週' },
  { value: 'monthly', label: '毎月' },
  { value: 'yearly',  label: '毎年' },
];

// ── セクションタイプラベル ─────────────────────────────────
export const TYPE_LABELS: Record<SectionType, string> = {
  list: 'リスト', grid: 'グリッド', command_builder: 'コマンドビルダー',
  table: 'テーブル', memo: 'メモ', checklist: 'チェックリスト',
  markdown: 'Markdown', iframe: 'iframe', countdown: 'カウントダウン',
};

// カード本体パディングを持たないタイプ（行が全幅に広がる）
export const EDGE_TO_EDGE_TYPES: SectionType[] = ['list', 'table', 'countdown', 'checklist'];

// タイプバッジ色（カラーピル）
export const TYPE_BADGE: Record<SectionType, string> = {
  list:            'bg-blue-100 text-blue-700',
  grid:            'bg-violet-100 text-violet-700',
  table:           'bg-emerald-100 text-emerald-700',
  command_builder: 'bg-orange-100 text-orange-700',
  countdown:       'bg-rose-100 text-rose-700',
  markdown:        'bg-amber-100 text-amber-700',
  memo:            'bg-slate-100 text-slate-600',
  checklist:       'bg-teal-100 text-teal-700',
  iframe:          'bg-cyan-100 text-cyan-700',
};

// bindConfig の型（uiType はプリセット選択 UI の表示形式）
export type BindUiType = 'pill' | 'segment' | 'tabs' | 'select';
export type BindConfig = { varNames: string[]; uiType?: BindUiType; barLabel?: string };

// ── ショートカット一覧（? キーで表示） ─────────────────────
export const DASHBOARD_SHORTCUTS = [{
  name: 'アイテム管理（スプレッドシート）',
  shortcuts: [
    { keys: ['↑', '↓', '←', '→'],     description: 'セル移動（Shift 併用で範囲選択）' },
    { keys: ['Enter'],                 description: 'セルを編集（F2 も可）' },
    { keys: ['Tab'],                   description: '次のセルへ移動して編集を継続（Shift で前へ）' },
    { keys: ['Ctrl', 'C'],             description: '選択範囲を TSV でコピー' },
    { keys: ['Ctrl', 'V'],             description: 'TSV を貼り付け（複数セル展開）' },
    { keys: ['Ctrl', 'Z'],             description: '元に戻す（Shift 併用でやり直し）' },
    { keys: ['Ctrl', 'D'],             description: '選択行を複製（範囲選択で複数行）' },
    { keys: ['Ctrl', 'Enter'],         description: '選択行の下に行を挿入（Shift 併用で上に挿入）' },
    { keys: ['Alt', '↑', '↓'],         description: '選択行を移動（範囲選択で複数行）' },
    { keys: ['Delete'],                description: '選択範囲のセルをクリア' },
    { keys: ['Shift', 'Delete'],       description: '選択行を削除（範囲選択で複数行）' },
    { keys: ['Escape'],                description: '選択解除 / フィルタークリア / 閉じる' },
  ],
}];

// ── ボタンカラー（command_builder） ───────────────────────
export const CMD_BTN_COLORS = ['indigo', 'green', 'amber', 'purple', 'pink', 'teal'];
export const CMD_BTN_STYLE: Record<string, string> = {
  indigo: 'bg-indigo-500 hover:bg-indigo-600 text-white',
  green:  'bg-green-500  hover:bg-green-600  text-white',
  amber:  'bg-amber-500  hover:bg-amber-600  text-white',
  purple: 'bg-purple-500 hover:bg-purple-600 text-white',
  pink:   'bg-pink-500   hover:bg-pink-600   text-white',
  teal:   'bg-teal-500   hover:bg-teal-600   text-white',
};

