// ==================================================
// DashboardPage — カスタムダッシュボード
// ==================================================
// セクションタイプ: list / grid / command_builder / table /
//                  memo / checklist / markdown / iframe / countdown
// バインド変数: 共通プリセット + セクション固有プリセット（2段階解決）
// 日付変数: {TODAY} / {NOW} / {DATE:±N単位:Fmt}

import React, { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MarkdownBody } from '../components/MarkdownBody';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  PlusIcon, Settings2Icon, ChevronDownIcon,
  GripVerticalIcon, Trash2Icon, CopyIcon, ExternalLinkIcon,
  DownloadIcon, UploadIcon, XIcon, PencilIcon,
  RefreshCwIcon, ClockIcon, Columns3Icon, ArrowUpDownIcon,
  ChevronRightIcon, ListIcon, CalendarDaysIcon, BriefcaseIcon, SearchIcon,
} from 'lucide-react';
import {
  dashboardDB,
  type DashboardSection, type DashboardItem, type DashboardPreset,
  type SectionType, type SectionWidth, type SectionPreset,
} from '../db/dashboard_db';
import { useTabLabel } from '../contexts/TabContext';
import { useTabStore } from '../stores/tab_store';
import { useToast } from '../components/Toast';
import { DatePicker } from '../components/DatePicker';
import { Select, type SelectOption } from '../components/Select';
import { Clipboard } from '../core/clipboard';
import { Opener } from '../core/opener';
import { FileSaver } from '../core/file_saver';
import { ActivityLogger } from '../core/activity_logger';

// ── localStorage キー ──────────────────────────────────────
const CMD_HISTORY_PREFIX       = 'dashboard_url_history_';
const COLLAPSE_PREFIX          = 'dashboard_collapsed_';
const CHECKLIST_STATE_PREFIX   = 'dashboard_checklist_';
const CHECKLIST_DATE_PREFIX    = 'dashboard_checklist_date_';
const TABLE_COL_HIDDEN_PREFIX  = 'dashboard_table_hidden_cols_';
const TABLE_COL_ORDER_PREFIX   = 'dashboard_table_col_order_';
const TABLE_SORT_PREFIX        = 'dashboard_table_sort_';
const TABLE_ACTIVE_PRESET_PFX  = 'dashboard_table_active_preset_';
const LIST_ACTIVE_PRESET_PFX   = 'dashboard_list_active_preset_';
const GRID_ACTIVE_PRESET_PFX   = 'dashboard_grid_active_preset_';
const SORT_BY_USAGE_PREFIX     = 'dashboard_sort_by_usage_';
const ACTIVE_PRESET_KEY_PREFIX = 'dashboard_active_preset_';

function lsGet(key: string): string | null { return localStorage.getItem(key); }
function lsSet(key: string, val: string): void { localStorage.setItem(key, val); }
function lsJson<T>(key: string): T | null {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) as T : null; } catch { return null; }
}

// ── 日付変数解決 ───────────────────────────────────────────
const DAY_SHORT = ['日', '月', '火', '水', '木', '金', '土'];
const DAY_LONG  = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];

function formatDate(d: Date, fmt = 'YYYY/MM/DD'): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yy  = String(d.getFullYear()).slice(-2);
  return fmt
    // 長いトークンを先に処理して短縮形との競合を防ぐ
    .replace('dddd', DAY_LONG[d.getDay()])
    .replace('ddd',  DAY_SHORT[d.getDay()])
    .replace('YYYY', String(d.getFullYear()))
    .replace('YY',   yy)
    .replace('MM',   pad(d.getMonth() + 1))
    .replace('DD',   pad(d.getDate()))
    .replace('HH',   pad(d.getHours()))
    .replace('mm',   pad(d.getMinutes()))
    .replace('ss',   pad(d.getSeconds()))
    // ゼロ埋めなし（ダブル処理後に適用）
    .replace('M',    String(d.getMonth() + 1))
    .replace('D',    String(d.getDate()))
    .replace('H',    String(d.getHours()))
    .replace('m',    String(d.getMinutes()))
    .replace('s',    String(d.getSeconds()));
}

function applyOffset(date: Date, offset: string): Date {
  const m = offset.match(/^([+-])(\d+)([dwMyhm])$/);
  if (!m) return date;
  const sign = m[1] === '+' ? 1 : -1;
  const n = parseInt(m[2], 10) * sign;
  const d = new Date(date);
  if      (m[3] === 'd') d.setDate(d.getDate() + n);
  else if (m[3] === 'w') d.setDate(d.getDate() + n * 7);
  else if (m[3] === 'M') d.setMonth(d.getMonth() + n);
  else if (m[3] === 'y') d.setFullYear(d.getFullYear() + n);
  else if (m[3] === 'h') d.setHours(d.getHours() + n);
  else if (m[3] === 'm') d.setMinutes(d.getMinutes() + n);
  return d;
}

function resolveDateVars(str: string): string {
  if (!str) return str;
  const now = new Date();
  // フォーマット文字列がコロンを含む場合（例: HH:mm）に対応するため、
  // 最初の : 以降をすべて1つのキャプチャグループで受け取り、DATE のみ内部で分割する
  return str.replace(
    /\{(TODAY|NOW|DATE)(?::([^}]*))?\}/g,
    (_m, type, arg1) => {
      if (type === 'TODAY') return formatDate(now, arg1 || 'YYYY/MM/DD');
      if (type === 'NOW')   return formatDate(now, arg1 || 'YYYY/MM/DD HH:mm');
      if (type === 'DATE') {
        const sep    = (arg1 || '').indexOf(':');
        const offset = sep >= 0 ? arg1.slice(0, sep) : (arg1 || '+0d');
        const fmt    = sep >= 0 ? arg1.slice(sep + 1) : 'YYYY/MM/DD';
        return formatDate(applyOffset(now, offset || '+0d'), fmt);
      }
      return _m;
    },
  );
}

// ── バインド変数解決 ───────────────────────────────────────
// ① グローバルプリセットで置換。globalVarNames に含まれるキーのみ対象。
//    プリセット選択中: 値があれば値、なければ '' / 未選択: 変えない
function resolveBindVars(
  str: string,
  globalVarNames: string[],
  presets: DashboardPreset[],
  activePresetId: number | null,
): string {
  if (!str) return str || '';
  const preset = presets.find((p) => p.id === activePresetId);
  if (!preset) return str;
  const varSet = new Set(globalVarNames);
  return str.replace(/\{([^}]+)\}/g, (m, key) => {
    if (key === 'INPUT') return m;
    if (!varSet.has(key)) return m;  // グローバルスコープ外は触らない
    return (preset.values && preset.values[key] !== undefined) ? preset.values[key] : '';
  });
}

// ② セクション固有プリセットで置換（グローバルより優先）。
//    section bind_vars に含まれるキーのみ対象。未マッチは {key} のまま残す。
function resolveSectionVars(str: string, section: DashboardSection): { result: string; hadPreset: boolean } {
  if (!str) return { result: str || '', hadPreset: false };
  let sPresets: SectionPreset[] = [];
  let activePfx = '';
  let bindVars: string[] = [];
  if      (section.type === 'table') { sPresets = section.table_presets || []; activePfx = TABLE_ACTIVE_PRESET_PFX; bindVars = section.table_bind_vars || []; }
  else if (section.type === 'list')  { sPresets = section.list_presets  || []; activePfx = LIST_ACTIVE_PRESET_PFX;  bindVars = section.list_bind_vars  || []; }
  else if (section.type === 'grid')  { sPresets = section.grid_presets  || []; activePfx = GRID_ACTIVE_PRESET_PFX;  bindVars = section.grid_bind_vars  || []; }
  else return { result: str, hadPreset: false };
  if (sPresets.length === 0) return { result: str, hadPreset: false };
  const activeId = lsJson<string | number>(activePfx + section.id);
  const preset = activeId != null ? sPresets.find((p) => String(p.id) === String(activeId)) : null;
  if (!preset) return { result: str, hadPreset: false };
  const vals = preset.values || {};
  const varSet = new Set(bindVars);
  return {
    result: str.replace(/\{([^}]+)\}/g, (m, key) => {
      if (!varSet.has(key)) return m;        // セクションスコープ外は触らない
      return key in vals ? vals[key] : '';   // スコープ内: 値 or ''
    }),
    hadPreset: true,
  };
}

// ③ チェーン: セクション（優先）→ グローバル（フォールバック）→ 日付
//    {U}（どちらの bind_vars にも未定義）は常にそのまま残る
function resolveAll(
  str: string,
  section: DashboardSection,
  globalVarNames: string[],
  presets: DashboardPreset[],
  activePresetId: number | null,
): string {
  const { result: afterSection } = resolveSectionVars(str, section);
  const afterGlobal = resolveBindVars(afterSection, globalVarNames, presets, activePresetId);
  return resolveDateVars(afterGlobal);
}

// ── URL 判定 ───────────────────────────────────────────────
function isUrl(str: string): boolean {
  try { new URL(str); return true; } catch { return /^https?:\/\//.test(str); }
}

// ── 営業日計算（countdown 用） ─────────────────────────────
function countCalendarDays(from: Date, to: Date): number {
  // Date.UTC でローカル年月日を正規化することで DST/タイムゾーン誤差を排除
  const fromUTC = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const toUTC   = Date.UTC(to.getFullYear(),   to.getMonth(),   to.getDate());
  return Math.round((toUTC - fromUTC) / 86400000);
}

function countBusinessDaysSimple(from: Date, to: Date): number {
  // Vanilla JS 版と同ロジック: 常に小→大方向に順方向カウントして最後に符号付与
  const sign  = to >= from ? 1 : -1;
  const start = sign === 1 ? new Date(from) : new Date(to);
  const end   = sign === 1 ? new Date(to)   : new Date(from);
  let count = 0;
  const cur = new Date(start);
  while (cur < end) {
    if (cur.getDay() !== 0 && cur.getDay() !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count * sign;
}

// ── チェックリストリセット周期キー（vanilla JS と同ロジック）─
function getResetPeriodKey(reset: string): string {
  const now = new Date();
  if (reset === 'daily')   return now.toISOString().slice(0, 10);
  if (reset === 'weekly') {
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
  }
  if (reset === 'monthly') return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  if (reset === 'yearly')  return String(now.getFullYear());
  return '';
}

// ── セクション幅マップ ─────────────────────────────────────
const WIDTH_COLS: Record<SectionWidth, number> = {
  narrow: 1, auto: 2, w3: 3, wide: 4, w5: 5, full: 6,
};

// Select コンポーネント用オプション定数
const TYPE_SELECT_OPTIONS: SelectOption[] = [
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

const WIDTH_SELECT_OPTIONS: SelectOption[] = [
  { value: 'narrow', label: '1列（狭い）' },
  { value: 'auto',   label: '2列（通常）' },
  { value: 'w3',     label: '3列' },
  { value: 'wide',   label: '4列' },
  { value: 'w5',     label: '5列' },
  { value: 'full',   label: '全幅（6列）' },
];

// コマンドビルダー専用タイプ選択肢（copy=コピー / link=開く）
const CMD_ITEM_TYPE_OPTIONS: SelectOption[] = [
  { value: 'copy', label: 'コピー', color: '#94a3b8' },
  { value: 'link', label: '開く',   color: '#10b981' },
];

const COL_TYPE_OPTIONS: SelectOption[] = [
  { value: 'text', label: 'テキスト' },
  { value: 'copy', label: 'コピー' },
  { value: 'link', label: 'リンク' },
];

const CHECKLIST_RESET_OPTIONS: SelectOption[] = [
  { value: 'never',   label: 'リセットしない' },
  { value: 'daily',   label: '毎日' },
  { value: 'weekly',  label: '毎週' },
  { value: 'monthly', label: '毎月' },
  { value: 'yearly',  label: '毎年' },
];

// ── セクションタイプラベル ─────────────────────────────────
const TYPE_LABELS: Record<SectionType, string> = {
  list: 'リスト', grid: 'グリッド', command_builder: 'コマンドビルダー',
  table: 'テーブル', memo: 'メモ', checklist: 'チェックリスト',
  markdown: 'Markdown', iframe: 'iframe', countdown: 'カウントダウン',
};

// カード本体パディングを持たないタイプ（行が全幅に広がる）
const EDGE_TO_EDGE_TYPES: SectionType[] = ['list', 'table', 'countdown', 'checklist'];

// タイプバッジ色（カラーピル）
const TYPE_BADGE: Record<SectionType, string> = {
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
type BindUiType = 'pill' | 'segment' | 'tabs' | 'select';
type BindConfig = { varNames: string[]; uiType?: BindUiType; barLabel?: string };

// ── ボタンカラー（command_builder） ───────────────────────
const CMD_BTN_COLORS = ['indigo', 'green', 'amber', 'purple', 'pink', 'teal'];
const CMD_BTN_STYLE: Record<string, string> = {
  indigo: 'bg-indigo-500 hover:bg-indigo-600 text-white',
  green:  'bg-green-500  hover:bg-green-600  text-white',
  amber:  'bg-amber-500  hover:bg-amber-600  text-white',
  purple: 'bg-purple-500 hover:bg-purple-600 text-white',
  pink:   'bg-pink-500   hover:bg-pink-600   text-white',
  teal:   'bg-teal-500   hover:bg-teal-600   text-white',
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// セクション固有プリセットバー（ui_type に応じた表示形式）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function SectionPresetBar({
  presets, uiType = 'segment', activeId, storageKey, onSelect, barLabel, wrapClass = '',
}: {
  presets: SectionPreset[];
  uiType?: BindUiType;
  activeId: string | number | null;
  storageKey: string;
  onSelect: (id: string | number | null) => void;
  barLabel?: string;
  wrapClass?: string;
}) {
  if (presets.length === 0) return null;

  const isActive = (id: string | number | null) => String(activeId) === String(id);
  const toggle = (id: string | number | null) => {
    const next = isActive(id) ? null : id;
    onSelect(next);
    lsSet(storageKey, JSON.stringify(next));
  };
  // segment/tabs はラジオボタン相当 — 選択中の項目をクリックしても解除しない
  const selectOnly = (id: string | number | null) => {
    if (isActive(id)) return;
    onSelect(id);
    lsSet(storageKey, JSON.stringify(id));
  };

  if (uiType === 'select') return (
    <div className={`flex items-center gap-2 px-[18px] py-2 border-b border-[var(--c-border)] ${wrapClass}`}>
      {barLabel && <span className="text-xs text-[var(--c-fg-3)] shrink-0">{barLabel}</span>}
      <Select
        options={[{ value: '', label: '選択なし' }, ...presets.map((p) => ({ value: String(p.id), label: p.name }))]}
        value={activeId != null ? String(activeId) : ''}
        onChange={(v) => toggle(v || null)}
      />
    </div>
  );

  if (uiType === 'tabs') return (
    <div className={`flex items-end gap-0 border-b border-[var(--c-border)] flex-wrap ${wrapClass}`}>
      {barLabel && <span className="text-xs text-[var(--c-fg-3)] px-[18px] self-center shrink-0">{barLabel}</span>}
      {presets.map((p) => (
        <button key={p.id} onClick={() => selectOnly(p.id)}
          className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors ${isActive(p.id) ? 'border-[var(--c-accent)] text-[var(--c-accent)]' : 'border-transparent text-[var(--c-fg-2)] hover:text-[var(--c-fg)]'}`}>
          {p.name}
        </button>
      ))}
    </div>
  );

  if (uiType === 'segment') return (
    <div className={`flex gap-2 flex-wrap items-center px-[18px] py-2 border-b border-[var(--c-border)] ${wrapClass}`}>
      {barLabel && <span className="text-xs text-[var(--c-fg-3)] shrink-0">{barLabel}</span>}
      <div className="seg-ctrl">
        {presets.map((p) => (
          <button key={p.id ?? 'null'}
            className={`seg-btn seg-btn--sm${isActive(p.id) ? ' seg-btn--active' : ''}`}
            onClick={() => selectOnly(p.id)}>
            {p.name}
          </button>
        ))}
      </div>
    </div>
  );

  // pill（デフォルト）: 独立したカプセル形ボタン、クリックでトグル解除可
  return (
    <div className={`flex gap-1 flex-wrap items-center px-[18px] py-2 border-b border-[var(--c-border)] ${wrapClass}`}>
      {barLabel && <span className="text-xs text-[var(--c-fg-3)] shrink-0">{barLabel}</span>}
      {presets.map((p) => (
        <button key={p.id ?? 'null'} onClick={() => toggle(p.id)}
          className={`px-2.5 py-0.5 rounded-full text-xs border transition-colors ${isActive(p.id) ? 'bg-[var(--c-accent)] text-white border-[var(--c-accent)]' : 'border-[var(--c-border)] text-[var(--c-fg-2)] hover:border-[var(--c-accent)] hover:text-[var(--c-accent)]'}`}>
          {p.name}
        </button>
      ))}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// セクション別コンポーネント
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface SectionProps {
  section: DashboardSection;
  items: DashboardItem[];
  presets: DashboardPreset[];
  activePresetId: number | null;
  globalVarNames: string[];
  onItemsChange: () => void;
  sortByUsage?: boolean;
  onToggleSortByUsage?: () => void;
}

// ── List セクション ────────────────────────────────────────
function ListSection({ section, items, presets, activePresetId, globalVarNames, onItemsChange, sortByUsage = false }: SectionProps) {
  const toast = useToast();
  const sectionPresets = section.list_presets || [];
  const showFilter = section.show_filter ?? false;
  const [activeSPresetId, setActiveSPresetId] = useState<string | null>(
    () => lsJson<string>(LIST_ACTIVE_PRESET_PFX + section.id)
  );
  const [filter, setFilter] = useState('');

  const resolve = (s: string) => resolveAll(s, section, globalVarNames, presets, activePresetId);

  const displayItems = useMemo(() => {
    let list = [...items];
    if (sortByUsage) list.sort((a, b) => (b.use_count ?? 0) - (a.use_count ?? 0));
    if (filter.trim()) {
      const q = filter.toLowerCase();
      list = list.filter((item) =>
        item.label.toLowerCase().includes(q) || (item.hint || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [items, sortByUsage, filter]);

  async function handleClick(item: DashboardItem) {
    const val = resolve(item.value);
    if (item.item_type === 'link' || (item.item_type !== 'copy' && item.item_type !== 'template' && isUrl(val))) {
      await Opener.open(val);
    } else {
      await Clipboard.copy(val);
      toast.success('コピーしました');
    }
    if (item.id) await dashboardDB.incrementUseCount(item.id);
    onItemsChange();
  }

  return (
    <div>
      <SectionPresetBar
        presets={sectionPresets}
        uiType={section.list_vars_ui_type}
        activeId={activeSPresetId}
        storageKey={LIST_ACTIVE_PRESET_PFX + section.id}
        onSelect={(id) => setActiveSPresetId(id != null ? String(id) : null)}
        barLabel={section.list_vars_bar_label}
      />
      {showFilter && (
        <div className="flex items-center gap-2 px-[18px] py-2 border-b border-[var(--c-border)]">
          <input
            type="text" value={filter} onChange={(e) => setFilter(e.target.value)}
            placeholder="フィルター…"
            className="flex-1 h-7 px-2 rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] text-xs focus:outline-none focus:border-[var(--c-accent)]"
          />
          {filter && <span className="text-xs text-[var(--c-fg-3)] shrink-0">{displayItems.length}件</span>}
        </div>
      )}
      <div>
        {displayItems.map((item) => {
          const val = resolve(item.value);
          const isLink = item.item_type === 'link' || (item.item_type !== 'copy' && item.item_type !== 'template' && isUrl(val));
          return (
            <button key={item.id} onClick={() => handleClick(item)}
              className="w-full text-left flex items-center gap-3 px-[18px] py-[11px] border-t border-[var(--c-border)] first:border-t-0 hover:bg-[var(--c-accent-dim)] transition-colors group cursor-pointer">
              <span className="font-medium text-sm text-[var(--c-fg)] flex-1 truncate">{item.label}</span>
              {item.hint && <span className="text-xs text-[var(--c-fg-3)] truncate max-w-[120px]">{resolve(item.hint)}</span>}
              <span className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-[var(--c-fg-3)]">
                {isLink ? <ExternalLinkIcon size={12} /> : <CopyIcon size={12} />}
              </span>
            </button>
          );
        })}
        {displayItems.length === 0 && (
          <p className="text-xs text-[var(--c-fg-3)] text-center py-4">
            {filter ? 'マッチするアイテムがありません' : 'アイテムがありません'}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Grid セクション ────────────────────────────────────────
function GridSection({ section, items, presets, activePresetId, globalVarNames, onItemsChange }: SectionProps) {
  const toast = useToast();
  const sectionPresets = section.grid_presets || [];
  const [activeSPresetId, setActiveSPresetId] = useState<string | null>(
    () => lsJson<string>(GRID_ACTIVE_PRESET_PFX + section.id)
  );

  const resolve = (s: string) => resolveAll(s, section, globalVarNames, presets, activePresetId);

  async function handleClick(item: DashboardItem) {
    const val = resolve(item.value);
    if (item.item_type === 'link' || (item.item_type !== 'copy' && item.item_type !== 'template' && isUrl(val))) {
      await Opener.open(val);
    } else {
      await Clipboard.copy(val);
      toast.success('コピーしました');
    }
    if (item.id) await dashboardDB.incrementUseCount(item.id);
    onItemsChange();
  }

  return (
    <div>
      <SectionPresetBar
        presets={sectionPresets}
        uiType={section.grid_vars_ui_type}
        activeId={activeSPresetId}
        storageKey={GRID_ACTIVE_PRESET_PFX + section.id}
        onSelect={(id) => setActiveSPresetId(id != null ? String(id) : null)}
        barLabel={section.grid_vars_bar_label}
        wrapClass="p-2.5"
      />
      <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
        {items.map((item) => {
          const isCopy = item.item_type === 'copy' || item.item_type === 'template' || (item.item_type !== 'link' && !isUrl(resolve(item.value)));
          return (
            <button key={item.id}
              style={{ gridColumnStart: item.new_row ? 1 : undefined }}
              onClick={() => handleClick(item)}
              className="flex items-center gap-2.5 px-3.5 py-3 rounded-[7px] border border-[1.5px] border-[var(--c-border)] bg-[var(--c-bg)] hover:bg-[var(--c-accent-dim)] hover:border-[var(--c-accent)] transition-all group cursor-pointer">
              <span className="text-[22px] shrink-0 leading-none">{item.emoji || (isCopy ? '📋' : '📝')}</span>
              <span className="flex-1 text-sm font-medium text-[var(--c-fg)] text-left truncate">{item.label}</span>
              <span className="opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all text-[var(--c-accent)] shrink-0">
                {isCopy ? <CopyIcon size={12} /> : <ExternalLinkIcon size={13} />}
              </span>
            </button>
          );
        })}
        {items.length === 0 && <p className="text-xs text-[var(--c-fg-3)] py-4 col-span-full">アイテムがありません</p>}
      </div>
    </div>
  );
}

// ── CommandBuilder セクション ──────────────────────────────
type CmdHistoryEntry = { value: string; ts: number; count?: number };

function relativeTime(ts: number): string {
  if (ts === 0) return '以前';
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return 'たった今';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}時間前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}日前`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}ヶ月前`;
  return `${Math.floor(mo / 12)}年前`;
}

function CommandBuilderSection({ section, items, presets, activePresetId, globalVarNames }: SectionProps) {
  const toast = useToast();
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<CmdHistoryEntry[]>(() => {
    const raw = lsJson<(string | CmdHistoryEntry)[]>(CMD_HISTORY_PREFIX + section.id) || [];
    // 旧形式 string[] は ts: 0（「以前」表示）に変換
    return raw.map((item) => typeof item === 'string' ? { value: item, ts: 0 } : item);
  });

  const resolve = (template: string) => {
    const withInput = template.replace(/\{INPUT\}/g, input);
    return resolveDateVars(resolveBindVars(withInput, globalVarNames, presets, activePresetId));
  };

  async function execButton(template: string, actionMode: 'copy' | 'open') {
    const result = resolve(template);
    if (actionMode === 'open') {
      await Opener.open(result);
    } else {
      await Clipboard.copy(result);
      toast.success('コピーしました');
    }
    if (input) {
      const prev = history.find((h) => h.value === input);
      const entry: CmdHistoryEntry = { value: input, ts: Date.now(), count: (prev?.count ?? 0) + 1 };
      const next = [entry, ...history.filter((h) => h.value !== input)].slice(0, section.history_limit ?? 10);
      setHistory(next);
      lsSet(CMD_HISTORY_PREFIX + section.id, JSON.stringify(next));
    }
  }

  function deleteHistoryItem(value: string) {
    const next = history.filter((h) => h.value !== value);
    setHistory(next);
    lsSet(CMD_HISTORY_PREFIX + section.id, JSON.stringify(next));
  }

  // items テーブルから読み取り（item_type: 'link' → 開く, それ以外 → コピー）
  const buttons = items.map((item, i) => ({
    id:         String(item.id!),
    label:      item.label || `ボタン ${i + 1}`,
    template:   item.value,
    actionMode: (item.item_type === 'link' ? 'open' : 'copy') as 'copy' | 'open',
    colorIdx:   i,
  }));

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && buttons.length > 0) execButton(buttons[0].template, buttons[0].actionMode); }}
        placeholder={section.cmd_placeholder || '入力値 {INPUT}'}
        className="w-full px-3 py-1.5 rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] text-sm focus:outline-none focus:border-[var(--c-accent)]"
      />
      {history.length > 0 && (
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--c-fg-3)] uppercase tracking-wide mb-1.5 px-0.5">
            <ClockIcon size={11} aria-hidden />
            最近使ったテキスト
          </p>
          <div className="rounded border border-[var(--c-border)] overflow-hidden">
            {history.map((h, i) => (
              <div key={i} className="group flex items-center gap-2 px-3 py-2 border-t border-[var(--c-border)] first:border-t-0 hover:bg-[var(--c-accent-dim)] transition-colors">
                {h.count != null && h.count > 0 && (
                  <span className="min-w-[18px] h-[18px] rounded-full bg-[var(--c-border)] text-[var(--c-fg-3)] text-[10px] font-semibold flex items-center justify-center px-1 shrink-0 transition-colors">
                    {h.count}
                  </span>
                )}
                <button onClick={() => setInput(h.value)}
                  className="flex-1 text-left text-xs text-[var(--c-fg-2)] truncate min-w-0 cursor-pointer hover:text-[var(--c-fg)]">
                  {h.value}
                </button>
                <span className="text-[10px] text-[var(--c-fg-3)] shrink-0 group-hover:opacity-0 transition-opacity">
                  {relativeTime(h.ts)}
                </span>
                <button onClick={() => deleteHistoryItem(h.value)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-0.5 rounded text-[var(--c-fg-3)] hover:text-[var(--c-danger,#ef4444)] hover:bg-[var(--c-danger-bg,#fef2f2)]"
                  title="履歴から削除">
                  <XIcon size={11} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-2 flex-wrap">
        {buttons.map((btn) => (
          <button key={btn.id} onClick={() => execButton(btn.template, btn.actionMode)}
            className={`flex-1 min-w-[90px] px-3 py-[7px] rounded text-sm font-medium transition-colors cursor-pointer ${CMD_BTN_STYLE[CMD_BTN_COLORS[btn.colorIdx % CMD_BTN_COLORS.length]]}`}>
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── 列管理ポップオーバー ───────────────────────────────────
type ColDef = { id: string; label: string; type: 'text' | 'copy' | 'link' };
const USE_COUNT_COL: ColDef = { id: '__use_count', label: '利用回数', type: 'text' };

function SortableColRow({ col, visible, onToggle }: { col: ColDef; visible: boolean; onToggle: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: col.id });
  return (
    <div ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className="flex items-center gap-2 px-3 py-2 hover:bg-[var(--c-bg-2)] transition-colors group border-t border-[var(--c-border)] first:border-t-0">
      <button {...attributes} {...listeners} tabIndex={-1}
        className="text-[var(--c-fg-3)] cursor-grab active:cursor-grabbing shrink-0 opacity-0 group-hover:opacity-100 transition-opacity touch-none">
        <GripVerticalIcon size={12} />
      </button>
      <span className="flex-1 text-xs text-[var(--c-fg)] truncate">{col.label}</span>
      <button type="button" role="switch" aria-checked={visible} onClick={onToggle}
        className={`relative inline-flex w-8 h-[18px] rounded-full transition-colors duration-150 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-accent)] ${
          visible ? 'bg-[var(--c-accent)]' : 'bg-[var(--c-border)]'
        }`}>
        <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow-sm transition-transform duration-150 ${
          visible ? 'translate-x-[18px]' : 'translate-x-[2px]'
        }`} />
      </button>
    </div>
  );
}

function ColumnManagerPopover({ columns, hiddenCols, colOrder, onToggle, onShowAll, onReorder, extraCols, onReset }: {
  columns: ColDef[];
  hiddenCols: Set<string>;
  colOrder: string[];
  onToggle: (id: string) => void;
  onShowAll: () => void;
  onReorder: (ids: string[]) => void;
  extraCols?: ColDef[];
  onReset?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [popStyle, setPopStyle] = useState<React.CSSProperties>({ visibility: 'hidden' });
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const orderedCols = useMemo(() => {
    const colMap = new Map(columns.map((c) => [c.id, c]));
    const ordered = colOrder.map((id) => colMap.get(id)).filter(Boolean) as ColDef[];
    const remaining = columns.filter((c) => !colOrder.includes(c.id));
    return [...ordered, ...remaining];
  }, [columns, colOrder]);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const W = 200;
    let left = rect.right - W;
    if (left < 8) left = 8;
    if (left + W > window.innerWidth - 8) left = window.innerWidth - W - 8;
    setPopStyle({ position: 'fixed', top: rect.bottom + 4, left, width: W, zIndex: 2000, visibility: 'visible' });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!btnRef.current?.contains(e.target as Node) && !popRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = orderedCols.findIndex((c) => c.id === active.id);
    const newIdx = orderedCols.findIndex((c) => c.id === over.id);
    onReorder(arrayMove(orderedCols, oldIdx, newIdx).map((c) => c.id));
  }

  const allCols = [...columns, ...(extraCols ?? [])];
  const hiddenCount = allCols.filter((c) => hiddenCols.has(c.id)).length;

  const popover = open ? createPortal(
    <div ref={popRef} style={popStyle}
      className="bg-[var(--c-bg)] border border-[var(--c-border)] rounded-xl shadow-[0_8px_32px_rgba(0,0,0,.16)] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--c-border)]">
        <span className="text-[11px] font-semibold text-[var(--c-fg-3)] uppercase tracking-wide">表示する列</span>
        {hiddenCount > 0 && (
          <button onClick={onShowAll}
            className="text-[10px] text-[var(--c-accent)] hover:underline">すべて表示</button>
        )}
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={orderedCols.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {orderedCols.map((col) => (
            <SortableColRow key={col.id} col={col} visible={!hiddenCols.has(col.id)} onToggle={() => onToggle(col.id)} />
          ))}
        </SortableContext>
      </DndContext>
      {extraCols?.map((col) => (
        <div key={col.id}
          className="flex items-center gap-2 px-3 py-2 hover:bg-[var(--c-bg-2)] transition-colors border-t border-[var(--c-border)]">
          <span className="w-3 shrink-0" />
          <span className="flex-1 text-xs text-[var(--c-fg)] truncate">{col.label}</span>
          <button type="button" role="switch" aria-checked={!hiddenCols.has(col.id)} onClick={() => onToggle(col.id)}
            className={`relative inline-flex w-8 h-[18px] rounded-full transition-colors duration-150 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-accent)] ${
              !hiddenCols.has(col.id) ? 'bg-[var(--c-accent)]' : 'bg-[var(--c-border)]'
            }`}>
            <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow-sm transition-transform duration-150 ${
              !hiddenCols.has(col.id) ? 'translate-x-[18px]' : 'translate-x-[2px]'
            }`} />
          </button>
        </div>
      ))}
      {onReset && (
        <div className="px-3 py-2 border-t border-[var(--c-border)]">
          <button onClick={onReset}
            className="text-[10px] text-[var(--c-fg-3)] hover:text-[var(--c-accent)] hover:underline w-full text-left">
            列順をリセット
          </button>
        </div>
      )}
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <button ref={btnRef} type="button" onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded border shrink-0 transition-colors ${
          hiddenCount > 0 || open
            ? 'border-[var(--c-accent)] text-[var(--c-accent)] bg-[var(--c-accent-dim)]'
            : 'border-[var(--c-border)] text-[var(--c-fg-2)] hover:border-[var(--c-accent)] hover:text-[var(--c-accent)]'
        }`}>
        <Columns3Icon size={11} />
        列
        {hiddenCount > 0 && (
          <span className="w-[16px] h-[16px] rounded-full bg-[var(--c-accent)] text-white text-[9px] font-bold flex items-center justify-center leading-none">
            {hiddenCount}
          </span>
        )}
      </button>
      {popover}
    </>
  );
}

// ── Table セクション ───────────────────────────────────────
function TableSection({ section, items, presets, activePresetId, globalVarNames, onItemsChange }: SectionProps) {
  const toast = useToast();
  const columns = (section.columns || []) as ColDef[];
  const pageSize = section.page_size || 0;
  const sectionPresets = section.table_presets || [];
  const [activeSPresetId, setActiveSPresetId] = useState<string | null>(
    () => lsJson<string>(TABLE_ACTIVE_PRESET_PFX + section.id)
  );
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(
    () => new Set(lsJson<string[]>(TABLE_COL_HIDDEN_PREFIX + section.id) ?? ['__use_count'])
  );
  const [colOrder, setColOrder] = useState<string[]>(
    () => lsJson<string[]>(TABLE_COL_ORDER_PREFIX + section.id) || columns.map((c) => c.id)
  );
  const [sortState, setSortState] = useState<{ colId: string; dir: 'asc' | 'desc' } | null>(
    () => lsJson<{ colId: string; dir: 'asc' | 'desc' }>(TABLE_SORT_PREFIX + section.id)
  );
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState('');

  const resolve = (s: string) => resolveAll(s, section, globalVarNames, presets, activePresetId);

  // colOrder に存在しない新列を末尾に補完した表示順列定義（仮想列 __use_count は含まない）
  const orderedColumns = useMemo<ColDef[]>(() => {
    const colMap = new Map(columns.map((c) => [c.id, c]));
    const ordered = colOrder.map((id) => colMap.get(id)).filter(Boolean) as ColDef[];
    const remaining = columns.filter((c) => !colOrder.includes(c.id));
    return [...ordered, ...remaining];
  }, [columns, colOrder]);

  // 仮想列を末尾に結合した全表示列
  const allDisplayCols = useMemo(() => [...orderedColumns, USE_COUNT_COL], [orderedColumns]);

  function toggleColHide(colId: string) {
    const next = new Set(hiddenCols);
    if (next.has(colId)) next.delete(colId); else next.add(colId);
    setHiddenCols(next);
    lsSet(TABLE_COL_HIDDEN_PREFIX + section.id, JSON.stringify([...next]));
  }

  function showAllCols() {
    setHiddenCols(new Set());
    lsSet(TABLE_COL_HIDDEN_PREFIX + section.id, JSON.stringify([]));
  }

  function handleReorder(ids: string[]) {
    setColOrder(ids);
    lsSet(TABLE_COL_ORDER_PREFIX + section.id, JSON.stringify(ids));
  }

  function resetColOrder() {
    const defaultOrder = columns.map((c) => c.id);
    setColOrder(defaultOrder);
    localStorage.removeItem(TABLE_COL_ORDER_PREFIX + section.id);
  }

  function toggleSort(colId: string) {
    setSortState((prev) => {
      let next: { colId: string; dir: 'asc' | 'desc' } | null;
      if (!prev || prev.colId !== colId) next = { colId, dir: 'asc' };
      else if (prev.dir === 'asc') next = { colId, dir: 'desc' };
      else next = null;
      // ソート状態を localStorage に永続化（解除時はキー削除）
      if (next) lsSet(TABLE_SORT_PREFIX + section.id, JSON.stringify(next));
      else localStorage.removeItem(TABLE_SORT_PREFIX + section.id);
      return next;
    });
  }

  const sortedItems = useMemo(() => {
    let list = [...items];
    if (sortState) {
      const { colId, dir } = sortState;
      if (colId === '__use_count') {
        list.sort((a, b) => dir === 'asc'
          ? (a.use_count ?? 0) - (b.use_count ?? 0)
          : (b.use_count ?? 0) - (a.use_count ?? 0));
      } else {
        list.sort((a, b) => {
          const va = (a.row_data?.[colId] ?? '').toLowerCase();
          const vb = (b.row_data?.[colId] ?? '').toLowerCase();
          return dir === 'asc' ? va.localeCompare(vb, 'ja') : vb.localeCompare(va, 'ja');
        });
      }
    }
    return list;
  }, [items, sortState]);

  const visibleCols = allDisplayCols.filter((c) => !hiddenCols.has(c.id));

  const filteredItems = useMemo(() => {
    if (!filter.trim()) return sortedItems;
    const q = filter.toLowerCase();
    return sortedItems.filter((item) =>
      visibleCols.some((c) => (item.row_data?.[c.id] ?? '').toLowerCase().includes(q))
    );
  }, [sortedItems, filter, visibleCols]);

  const totalPages = pageSize > 0 ? Math.ceil(filteredItems.length / pageSize) : 1;
  const pagedItems = pageSize > 0 ? filteredItems.slice(page * pageSize, (page + 1) * pageSize) : filteredItems;

  async function handleCellClick(item: DashboardItem, col: { id: string; label: string; type: 'text' | 'copy' | 'link' }) {
    const val = resolve(item.row_data?.[col.id] ?? '');
    if (col.type === 'link' || (col.type !== 'text' && col.type !== 'copy' && isUrl(val))) {
      await Opener.open(val);
    } else if (col.type === 'copy' || col.type === 'text') {
      await Clipboard.copy(val);
      toast.success('コピーしました');
    }
    if (item.id && col.type !== 'text') {
      await dashboardDB.incrementUseCount(item.id);
      onItemsChange();
    }
  }

  if (columns.length === 0) {
    return <p className="text-xs text-[var(--c-fg-3)] text-center py-4">列が定義されていません</p>;
  }

  return (
    <div>
      <SectionPresetBar
        presets={sectionPresets}
        uiType={section.table_vars_ui_type}
        activeId={activeSPresetId}
        storageKey={TABLE_ACTIVE_PRESET_PFX + section.id}
        onSelect={(id) => setActiveSPresetId(id != null ? String(id) : null)}
        barLabel={section.table_vars_bar_label}
        wrapClass="mb-2"
      />
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--c-border)]">
        <input
          type="text" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(0); }}
          placeholder="フィルター…"
          className="flex-1 h-7 px-2 rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] text-xs focus:outline-none focus:border-[var(--c-accent)]"
        />
        {filter && <span className="text-xs text-[var(--c-fg-3)] shrink-0">{filteredItems.length}件</span>}
        <ColumnManagerPopover
          columns={orderedColumns}
          hiddenCols={hiddenCols}
          colOrder={colOrder}
          onToggle={toggleColHide}
          onShowAll={showAllCols}
          onReorder={handleReorder}
          extraCols={[USE_COUNT_COL]}
          onReset={resetColOrder}
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              {visibleCols.map((c) => (
                <th key={c.id} onClick={() => toggleSort(c.id)}
                  className="text-left px-3 py-2 border-b-2 border-[var(--c-border)] text-[var(--c-fg-3)] text-xs font-semibold tracking-wide uppercase cursor-pointer hover:text-[var(--c-fg)] whitespace-nowrap select-none bg-[var(--c-bg)]">
                  <span className="inline-flex items-center gap-1">
                    {c.type === 'copy' && <CopyIcon size={10} className="shrink-0 opacity-60" />}
                    {c.type === 'link' && <ExternalLinkIcon size={10} className="shrink-0 opacity-60" />}
                    {c.label}
                    {sortState?.colId === c.id && <span className="ml-0.5 text-[var(--c-accent)]">{sortState.dir === 'asc' ? '↑' : '↓'}</span>}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagedItems.map((item) => (
              <tr key={item.id} className="hover:bg-[var(--c-accent-dim)] transition-colors">
                {visibleCols.map((c) => {
                  if (c.id === '__use_count') {
                    return (
                      <td key={c.id} className="px-3 py-2 border-b border-[var(--c-border)] text-right tabular-nums text-[var(--c-fg-2)] cursor-default">
                        {item.use_count ?? 0}
                      </td>
                    );
                  }
                  const val = resolve(item.row_data?.[c.id] ?? '');
                  return (
                    <td key={c.id} className={`px-3 py-2 border-b border-[var(--c-border)] ${c.type === 'text' ? 'cursor-text' : 'cursor-pointer'}`}>
                      {c.type === 'link' ? (
                        <a href={val} target="_blank" rel="noreferrer"
                          onClick={(e) => { e.preventDefault(); handleCellClick(item, c); }}
                          className="inline-flex items-center gap-1.5 text-[var(--c-accent)] hover:underline">
                          <span>{val}</span>
                          <ExternalLinkIcon size={11} className="shrink-0 opacity-50" />
                        </a>
                      ) : c.type === 'copy' ? (
                        <button onClick={() => handleCellClick(item, c)}
                          className="group/copy text-left w-full flex items-center justify-between gap-2 hover:text-[var(--c-accent)]">
                          <span className="truncate">{val}</span>
                          <CopyIcon size={12} className="shrink-0 opacity-0 group-hover/copy:opacity-50 transition-opacity" />
                        </button>
                      ) : (
                        <span className="text-[var(--c-fg)] select-text">{val}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {pagedItems.length === 0 && (
              <tr><td colSpan={visibleCols.length} className="px-2 py-4 text-center text-xs text-[var(--c-fg-3)]">データがありません</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {pageSize > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-[var(--c-border)]">
          <span className="text-xs text-[var(--c-fg-3)] tabular-nums select-none">
            {page * pageSize + 1}〜{Math.min((page + 1) * pageSize, filteredItems.length)}件 / 全{filteredItems.length}件
          </span>
          <div className="flex items-center gap-1">
            {[
              { label: '«', title: '先頭', disabled: page === 0, onClick: () => setPage(0) },
              { label: '‹', title: '前へ', disabled: page === 0, onClick: () => setPage((p) => p - 1) },
              { label: '›', title: '次へ', disabled: page >= totalPages - 1, onClick: () => setPage((p) => p + 1) },
              { label: '»', title: '末尾', disabled: page >= totalPages - 1, onClick: () => setPage(totalPages - 1) },
            ].map(({ label, title, disabled, onClick }, i) => (
              <React.Fragment key={label}>
                {i === 2 && (
                  <span className="text-xs text-[var(--c-fg-2)] tabular-nums select-none px-1">
                    {page + 1} / {totalPages}
                  </span>
                )}
                <button
                  onClick={onClick} disabled={disabled} title={title}
                  className="flex items-center justify-center w-7 h-7 rounded border border-[var(--c-border)] text-xs text-[var(--c-fg-2)] hover:border-[var(--c-accent)] hover:text-[var(--c-accent)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:border-[var(--c-border)] disabled:hover:text-[var(--c-fg-2)]">
                  {label}
                </button>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Memo セクション ────────────────────────────────────────
function MemoSection({ section }: SectionProps) {
  const [content, setContent] = useState(section.memo_content || '');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [content]);

  async function handleChange(val: string) {
    setContent(val);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await dashboardDB.updateSection({ ...section, memo_content: val });
    }, 600);
  }

  return (
    <textarea
      ref={textareaRef}
      value={content}
      onChange={(e) => handleChange(e.target.value)}
      className="w-full min-h-[72px] max-h-[480px] px-3 py-2 rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] text-sm resize-none overflow-y-auto focus:outline-none focus:border-[var(--c-accent)]"
      placeholder="メモを入力…"
    />
  );
}

// ── Checklist セクション ───────────────────────────────────
function SortableChecklistItem({ item, isChecked, isEditing, editLabel, onToggle, onStartEdit, onEditChange, onSaveEdit, onCancelEdit, onDelete }: {
  item: DashboardItem;
  isChecked: boolean;
  isEditing: boolean;
  editLabel: string;
  onToggle: () => void;
  onStartEdit: () => void;
  onEditChange: (v: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id! });
  return (
    <div ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--c-border)] last:border-b-0 hover:bg-[var(--c-accent-dim)] transition-colors group">
      {/* ドラッグハンドル */}
      <button {...attributes} {...listeners} tabIndex={-1}
        className="shrink-0 text-[var(--c-fg-3)] cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity touch-none -ml-1">
        <GripVerticalIcon size={12} />
      </button>
      {/* カスタムチェックボックス */}
      <button type="button" onClick={onToggle}
        className={`shrink-0 flex items-center justify-center w-[18px] h-[18px] rounded-[4px] border-[1.5px] transition-all duration-150 ${
          isChecked
            ? 'bg-[var(--c-success)] border-[var(--c-success)]'
            : 'border-[var(--c-border)] group-hover:border-[var(--c-success)]'
        }`}>
        <svg className={`transition-transform duration-150 ${isChecked ? 'scale-100' : 'scale-0'}`}
          width="10" height="8" viewBox="0 0 10 8" fill="none">
          <path d="M1 3.5L3.8 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {/* ラベル / インライン編集 */}
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <input type="text" value={editLabel} autoFocus
            onChange={(e) => onEditChange(e.target.value)}
            onBlur={onSaveEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) onSaveEdit();
              if (e.key === 'Escape') onCancelEdit();
            }}
            className="w-full text-sm font-medium bg-transparent border-b border-[var(--c-accent)] focus:outline-none text-[var(--c-fg)]"
          />
        ) : (
          <button onClick={onStartEdit}
            className={`w-full text-left text-sm font-medium transition-all duration-150 truncate block ${
              isChecked ? 'line-through opacity-40 cursor-default' : 'text-[var(--c-fg)] hover:text-[var(--c-accent)]'
            }`}>
            {item.label}
          </button>
        )}
      </div>
      {/* 削除ボタン */}
      <button onClick={onDelete}
        className="shrink-0 w-[22px] h-[22px] flex items-center justify-center rounded text-[var(--c-fg-3)] hover:text-[var(--c-danger,#ef4444)] hover:bg-[rgba(239,68,68,.1)] opacity-0 group-hover:opacity-100 transition-all">
        <Trash2Icon size={12} />
      </button>
    </div>
  );
}

function ChecklistSection({ section, items, onItemsChange }: SectionProps) {
  const stateKey  = CHECKLIST_STATE_PREFIX + section.id;
  const dateKey   = CHECKLIST_DATE_PREFIX  + section.id;
  const resetMode = section.checklist_reset || 'never';

  const [checked, setChecked] = useState<Record<number, boolean>>(() => {
    if (resetMode !== 'never') {
      const periodKey = getResetPeriodKey(resetMode);
      if (lsGet(dateKey) !== periodKey) {
        lsSet(dateKey, periodKey);
        lsSet(stateKey, '{}');
        return {};
      }
    }
    return lsJson<Record<number, boolean>>(stateKey) || {};
  });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const addInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function toggle(id: number) {
    const next = { ...checked, [id]: !checked[id] };
    setChecked(next);
    lsSet(stateKey, JSON.stringify(next));
    if (resetMode !== 'never') lsSet(dateKey, getResetPeriodKey(resetMode));
  }

  function resetChecked() {
    setChecked({});
    lsSet(stateKey, '{}');
    if (resetMode !== 'never') lsSet(dateKey, getResetPeriodKey(resetMode));
  }

  function startEdit(item: DashboardItem) {
    if (checked[item.id!]) return;
    setEditingId(item.id!);
    setEditLabel(item.label);
  }

  async function saveEdit(item: DashboardItem) {
    if (editLabel.trim()) {
      await dashboardDB.updateItem({ ...item, label: editLabel.trim() });
      onItemsChange();
    }
    setEditingId(null);
  }

  async function handleDelete(id: number) {
    const target = items.find((i) => i.id === id);
    await dashboardDB.deleteItem(id);
    ActivityLogger.log('dashboard', 'delete', 'item', id, `「${section.title}」から「${target?.label || ''}」を削除`);
    onItemsChange();
  }

  async function handleAdd() {
    if (!newLabel.trim()) { setShowAdd(false); return; }
    const newId = await dashboardDB.addItem({
      section_id: section.id!, position: items.length,
      label: newLabel.trim(), value: '', item_type: 'copy', use_count: 0,
    });
    ActivityLogger.log('dashboard', 'create', 'item', newId, `「${section.title}」に「${newLabel.trim()}」を追加`);
    setNewLabel('');
    onItemsChange();
    // フォーカスを保持して連続入力できるようにする
    setTimeout(() => addInputRef.current?.focus(), 0);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = items.findIndex((i) => i.id === active.id);
    const newIdx = items.findIndex((i) => i.id === over.id);
    const reordered = arrayMove(items, oldIdx, newIdx);
    await Promise.all(reordered.map((item, pos) => dashboardDB.updateItem({ ...item, position: pos })));
    onItemsChange();
  }

  const totalCount = items.length;
  const checkedCount = items.filter((item) => checked[item.id!]).length;
  const progress = totalCount > 0 ? (checkedCount / totalCount) * 100 : 0;
  const allDone = totalCount > 0 && checkedCount === totalCount;

  return (
    <div>
      {/* プログレスバー */}
      {totalCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--c-border)]">
          <div className="flex-1 h-1.5 rounded-full bg-[var(--c-border)] overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500 bg-[var(--c-success)]"
              style={{ width: `${progress}%` }} />
          </div>
          <span className={`text-xs font-semibold tabular-nums shrink-0 transition-colors ${allDone ? 'text-[var(--c-success)]' : 'text-[var(--c-fg-3)]'}`}>
            {checkedCount} / {totalCount}
          </span>
          <button onClick={resetChecked} title="チェックをリセット"
            className="shrink-0 p-1 rounded hover:bg-[var(--c-bg-2)] text-[var(--c-fg-3)] hover:text-[var(--c-fg)] transition-colors">
            <RefreshCwIcon size={12} />
          </button>
        </div>
      )}
      {/* アイテムリスト */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map((i) => i.id!)} strategy={verticalListSortingStrategy}>
          {items.map((item) => (
            <SortableChecklistItem
              key={item.id}
              item={item}
              isChecked={checked[item.id!] || false}
              isEditing={editingId === item.id}
              editLabel={editLabel}
              onToggle={() => toggle(item.id!)}
              onStartEdit={() => startEdit(item)}
              onEditChange={setEditLabel}
              onSaveEdit={() => saveEdit(item)}
              onCancelEdit={() => setEditingId(null)}
              onDelete={() => handleDelete(item.id!)}
            />
          ))}
        </SortableContext>
      </DndContext>
      {/* 追加フォーム */}
      {showAdd ? (
        <div className="flex items-center gap-2 px-4 py-2.5 border-t border-[var(--c-border)]">
          <span className="shrink-0 w-[18px] h-[18px] rounded-[4px] border-[1.5px] border-[var(--c-border)]" />
          <input ref={addInputRef} type="text" value={newLabel} autoFocus
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAdd();
              if (e.key === 'Escape') { setShowAdd(false); setNewLabel(''); }
            }}
            onBlur={() => { if (!newLabel.trim()) setShowAdd(false); }}
            placeholder="アイテム名を入力…"
            className="flex-1 text-sm font-medium bg-transparent border-b border-[var(--c-accent)] focus:outline-none text-[var(--c-fg)] placeholder:text-[var(--c-fg-3)]"
          />
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)}
          className="w-full px-4 py-2.5 border-t border-[var(--c-border)] text-xs text-[var(--c-fg-3)] hover:text-[var(--c-accent)] hover:bg-[var(--c-accent-dim)] transition-colors flex items-center gap-1.5">
          <PlusIcon size={12} />アイテムを追加
        </button>
      )}
    </div>
  );
}

// ── Markdown セクション ────────────────────────────────────
interface MarkdownSectionProps extends SectionProps {
  editing: boolean;
  onToggleEdit: () => void;
}

function MarkdownSection({ section, editing, onToggleEdit }: MarkdownSectionProps) {
  const [body, setBody] = useState(section.body || '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) return;
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [editing, body]);

  async function save() {
    await dashboardDB.updateSection({ ...section, body });
    onToggleEdit();
  }

  if (editing) {
    return (
      <div>
        <textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="w-full min-h-[200px] px-3 py-2 border-b border-[var(--c-border)] bg-[var(--c-bg-2)] text-[var(--c-fg)] text-sm font-mono resize-none overflow-hidden focus:outline-none"
          autoFocus
        />
        <div className="flex gap-2 justify-end px-3 py-2 bg-[var(--c-bg-2)]">
          <button onClick={onToggleEdit} className="px-3 py-1 rounded border border-[var(--c-border)] text-sm text-[var(--c-fg-2)]">キャンセル</button>
          <button onClick={save} className="px-3 py-1 rounded bg-[var(--c-accent)] text-white text-sm">保存</button>
        </div>
      </div>
    );
  }

  return body ? (
    <MarkdownBody>{body}</MarkdownBody>
  ) : (
    <p className="text-xs text-[var(--c-fg-3)] py-4 text-center">Markdownを入力…（ヘッダーの編集ボタンをクリック）</p>
  );
}

// ── Iframe セクション ──────────────────────────────────────
function IframeSection({ section, presets, activePresetId, globalVarNames }: SectionProps) {
  const resolve = (s: string) => resolveAll(s, section, globalVarNames, presets, activePresetId);
  const url = resolve(section.url || '');
  const height = section.iframe_height || 400;

  if (!url) return <p className="text-xs text-[var(--c-fg-3)] text-center py-4">URLが設定されていません</p>;
  return (
    <iframe src={url} height={height} className="w-full rounded border border-[var(--c-border)]"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups" />
  );
}

// ── Countdown セクション ───────────────────────────────────
interface CountdownSectionProps extends SectionProps {
  countdownMode: 'calendar' | 'business';
}

function CountdownSection({ section, items, onItemsChange, countdownMode: mode }: CountdownSectionProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newDate, setNewDate] = useState('');

  // YYYY-MM-DD をローカル時間として解析（UTC解釈によるタイムゾーンズレを回避）
  function parseLocalDate(dateStr: string): Date {
    const [y, m, d] = dateStr.split('T')[0].split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function getDayInfo(dateStr: string) {
    if (!dateStr) return { days: null, isOver: false, isToday: false, isSoon: false };
    const datePart = dateStr.split('T')[0];
    const n = new Date();
    const pad = (v: number) => String(v).padStart(2, '0');
    const todayIso = `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
    const now = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    const target = parseLocalDate(datePart);
    const days = mode === 'business' ? countBusinessDaysSimple(now, target) : countCalendarDays(now, target);
    const isToday = datePart === todayIso; // 文字列比較で確実に判定
    return { days, isOver: days < 0 && !isToday, isToday, isSoon: days > 0 && days <= 7 };
  }

  async function startLabelEdit(item: DashboardItem) {
    setEditingId(item.id!);
    setEditLabel(item.label);
  }

  async function saveLabelEdit(item: DashboardItem) {
    if (editLabel.trim()) {
      await dashboardDB.updateItem({ ...item, label: editLabel.trim() });
      onItemsChange();
    }
    setEditingId(null);
  }

  async function handleDateChange(item: DashboardItem, date: string) {
    await dashboardDB.updateItem({ ...item, value: date });
    onItemsChange();
  }

  async function handleDelete(id: number) {
    const target = items.find((i) => i.id === id);
    await dashboardDB.deleteItem(id);
    ActivityLogger.log('dashboard', 'delete', 'item', id, `「${section.title}」から「${target?.label || ''}」を削除`);
    onItemsChange();
  }

  async function handleAdd() {
    if (!newLabel.trim()) return;
    const newId = await dashboardDB.addItem({
      section_id: section.id!, position: items.length,
      label: newLabel.trim(), value: newDate, item_type: 'copy', use_count: 0,
    });
    ActivityLogger.log('dashboard', 'create', 'item', newId, `「${section.title}」に「${newLabel.trim()}」を追加`);
    setNewLabel(''); setNewDate(''); setShowAddForm(false);
    onItemsChange();
  }

  return (
    <div>
      {items.length === 0 && !showAddForm && (
        <p className="text-xs text-[var(--c-fg-3)] text-center py-4">マイルストーンがありません</p>
      )}
      {items.map((item) => {
        const { days, isOver, isToday, isSoon } = getDayInfo(item.value);
        const dayColorClass = isOver ? 'text-[var(--c-danger)]'
          : isToday ? 'text-[var(--c-success)]'
          : isSoon ? 'text-[var(--c-warning)]'
          : 'text-[var(--c-accent)]';
        return (
          <div key={item.id}
            className={`flex items-center gap-3 px-[18px] py-2.5 border-b border-[var(--c-border)] last:border-b-0 transition-colors group ${isOver ? 'bg-[var(--c-danger-bg)] hover:bg-[var(--c-danger-bg)]' : 'hover:bg-[var(--c-accent-dim)]'}`}>
            <div className="flex-1 min-w-0">
              {editingId === item.id ? (
                <input type="text" value={editLabel} autoFocus
                  onChange={(e) => setEditLabel(e.target.value)}
                  onBlur={() => saveLabelEdit(item)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) saveLabelEdit(item); if (e.key === 'Escape') setEditingId(null); }}
                  className="w-full text-sm font-semibold bg-transparent border-b border-[var(--c-accent)] focus:outline-none text-[var(--c-fg)]"
                />
              ) : (
                <button onClick={() => startLabelEdit(item)}
                  className="text-sm font-semibold text-[var(--c-fg)] text-left truncate block w-full hover:text-[var(--c-accent)] transition-colors">
                  {item.label}
                </button>
              )}
              <DatePicker
                value={item.value || ''}
                onChange={(date) => handleDateChange(item, date)}
                onClear={() => handleDateChange(item, '')}
                placeholder="未設定"
                compact
                align="left"
                className="mt-0.5 w-fit"
              />
            </div>
            {/* 日数テキスト表示（背景なし・色のみ） */}
            <div className={`shrink-0 min-w-[60px] text-right tabular-nums ${days === null ? 'text-[var(--c-fg-3)]' : dayColorClass}`}>
              {days === null ? (
                <span className="text-sm">—</span>
              ) : isToday ? (
                <span className="text-base font-bold">今日</span>
              ) : isOver ? (
                <><span className="text-[1.6rem] font-bold leading-none">{Math.abs(days)}</span><span className="text-xs ml-0.5">日超過</span></>
              ) : (
                <><span className="text-xs mr-0.5">あと</span><span className="text-[1.6rem] font-bold leading-none">{days}</span><span className="text-xs ml-0.5">日</span></>
              )}
            </div>
            <button onClick={() => handleDelete(item.id!)}
              className="opacity-0 group-hover:opacity-100 w-[22px] h-[22px] flex items-center justify-center rounded text-[var(--c-fg-3)] hover:text-[var(--c-danger,#ef4444)] hover:bg-[rgba(239,68,68,.1)] transition-all">
              <Trash2Icon size={12} />
            </button>
          </div>
        );
      })}
      {showAddForm ? (
        <div className="px-[18px] py-3 border-t border-[var(--c-border)] flex flex-col gap-2">
          <input type="text" value={newLabel} autoFocus onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { setShowAddForm(false); setNewLabel(''); setNewDate(''); } }}
            placeholder="マイルストーン名"
            className="w-full h-8 px-2 rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] text-sm focus:outline-none focus:border-[var(--c-accent)]"
          />
          <DatePicker
            value={newDate}
            onChange={(date) => setNewDate(date)}
            onClear={() => setNewDate('')}
            placeholder="日付を選択"
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setShowAddForm(false); setNewLabel(''); setNewDate(''); }}
              className="px-3 py-1 rounded border border-[var(--c-border)] text-sm text-[var(--c-fg-2)]">キャンセル</button>
            <button onClick={handleAdd}
              className="px-3 py-1 rounded bg-[var(--c-accent)] text-white text-sm">追加</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAddForm(true)}
          className="w-full px-[18px] py-2 border-t border-[var(--c-border)] text-xs text-[var(--c-fg-3)] hover:text-[var(--c-accent)] hover:bg-[var(--c-accent-dim)] transition-colors flex items-center justify-center gap-1">
          <PlusIcon size={12} />マイルストーンを追加
        </button>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// セクションカード（折りたたみ + ヘッダー + コンテンツ）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface SectionCardProps extends SectionProps {
  onOpenItemMgr?: (section: DashboardSection) => void;
}

const SectionCard = React.memo(function SectionCard({
  section, items, presets, activePresetId, globalVarNames, onItemsChange, onOpenItemMgr,
}: SectionCardProps) {
  const colSpan = WIDTH_COLS[section.width] || 2;
  const [collapsed, setCollapsed] = useState<boolean>(() => lsGet(COLLAPSE_PREFIX + section.id) === '1');
  const [mdEditing, setMdEditing] = useState(false);
  const [countdownMode, setCountdownMode] = useState<'calendar' | 'business'>(
    () => section.countdown_mode || 'calendar'
  );
  const [sortByUsage, setSortByUsage] = useState<boolean>(
    () => lsGet(SORT_BY_USAGE_PREFIX + section.id) === '1'
  );

  function toggleCollapse() {
    const next = !collapsed;
    setCollapsed(next);
    lsSet(COLLAPSE_PREFIX + section.id, next ? '1' : '0');
  }

  async function toggleCountdownMode() {
    const next = countdownMode === 'calendar' ? 'business' : 'calendar';
    setCountdownMode(next);
    await dashboardDB.updateSection({ ...section, countdown_mode: next });
  }

  function toggleSortByUsage() {
    const next = !sortByUsage;
    setSortByUsage(next);
    lsSet(SORT_BY_USAGE_PREFIX + section.id, next ? '1' : '0');
  }

  // new_row: vanilla JS互換のため (section as any).newRow も参照
  const isNewRow = section.new_row ?? (section as any).newRow ?? false;
  const style: React.CSSProperties = {
    gridColumn: isNewRow ? `1 / span ${colSpan}` : `span ${colSpan}`,
  };

  const sectionProps: SectionProps = { section, items, presets, activePresetId, globalVarNames, onItemsChange, sortByUsage, onToggleSortByUsage: toggleSortByUsage };
  const isEdgeless = EDGE_TO_EDGE_TYPES.includes(section.type);

  return (
    <div
      id={`section-${section.id}`}
      style={style}
      className="min-w-0 self-start bg-[var(--c-bg-2)] border border-[var(--c-border)] border-l-[3px] border-l-transparent rounded-[10px] overflow-hidden shadow-sm hover:shadow-md hover:border-[var(--c-border-2,var(--c-border))] hover:border-l-[var(--c-accent)] transition-all duration-200"
    >
      {/* ヘッダー */}
      <div className="flex items-center gap-2 px-3.5 py-3 border-b border-[var(--c-border)]">
        <span className="text-[18px] shrink-0 leading-none">{section.icon}</span>
        <button onClick={toggleCollapse} aria-expanded={!collapsed}
          className="flex-1 text-left font-semibold text-sm text-[var(--c-fg)] truncate min-w-0 cursor-pointer"
        >
          {section.title}
        </button>
        {section.type === 'list' && (
          <button onClick={toggleSortByUsage} title={sortByUsage ? '追加順に戻す' : '使用頻度順に並べる'}
            className={`p-1.5 rounded transition-colors shrink-0 ${sortByUsage ? 'text-[var(--c-accent)] bg-[var(--c-accent-dim)]' : 'text-[var(--c-fg-3)] hover:bg-[var(--c-bg)] hover:text-[var(--c-fg)]'}`}>
            <ArrowUpDownIcon size={13} />
          </button>
        )}
        {section.type === 'countdown' && (
          <button onClick={toggleCountdownMode}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border border-[var(--c-border)] text-[var(--c-fg-3)] hover:border-[var(--c-accent)] hover:text-[var(--c-accent)] transition-colors shrink-0 whitespace-nowrap"
            title="カレンダー日/営業日を切替">
            {countdownMode === 'calendar'
              ? <><CalendarDaysIcon size={11} /><span>暦日</span></>
              : <><BriefcaseIcon size={11} /><span>営業日</span></>}
          </button>
        )}
        {section.type === 'markdown' && (
          <button
            onClick={() => setMdEditing(!mdEditing)}
            className={`p-1.5 rounded transition-colors shrink-0 ${mdEditing ? 'text-[var(--c-accent)] bg-[var(--c-bg)]' : 'text-[var(--c-fg-3)] hover:bg-[var(--c-bg)] hover:text-[var(--c-fg)]'}`}
            title={mdEditing ? '表示モードに切替' : '編集'}
          >
            <PencilIcon size={13} />
          </button>
        )}
        {onOpenItemMgr && section.show_add_btn && ['list', 'grid', 'table'].includes(section.type) && (
          <button
            onClick={() => onOpenItemMgr(section)}
            className="p-1.5 rounded text-[var(--c-fg-3)] hover:bg-[var(--c-bg)] hover:text-[var(--c-accent)] transition-colors shrink-0"
            title="アイテムを追加"
          >
            <PlusIcon size={13} />
          </button>
        )}
        <button onClick={toggleCollapse} aria-expanded={!collapsed}
          className="p-1.5 rounded hover:bg-[var(--c-bg)] text-[var(--c-fg-3)] transition-colors shrink-0">
          <ChevronDownIcon
            size={14}
            className={`transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`}
          />
        </button>
      </div>
      {/* コンテンツ */}
      {!collapsed && (
        <div className={isEdgeless ? '' : 'p-3'}>
          {section.type === 'list'            && <ListSection            {...sectionProps} />}
          {section.type === 'grid'            && <GridSection            {...sectionProps} />}
          {section.type === 'command_builder' && <CommandBuilderSection  {...sectionProps} />}
          {section.type === 'table'           && <TableSection           {...sectionProps} />}
          {section.type === 'memo'            && <MemoSection            {...sectionProps} />}
          {section.type === 'checklist'       && <ChecklistSection       {...sectionProps} />}
          {section.type === 'markdown'        && (
            <MarkdownSection {...sectionProps} editing={mdEditing} onToggleEdit={() => setMdEditing(!mdEditing)} />
          )}
          {section.type === 'iframe'          && <IframeSection          {...sectionProps} />}
          {section.type === 'countdown'       && <CountdownSection       {...sectionProps} countdownMode={countdownMode} />}
        </div>
      )}
    </div>
  );
});

// SectionVarEditor は BindVarModal に統合済みのため削除

type TableColumn = { id: string; label: string; type: 'text' | 'copy' | 'link' };

function SortableColumnRow({ col, i, columns, setColumns }: {
  col: TableColumn; i: number; columns: TableColumn[]; setColumns: (cols: TableColumn[]) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: col.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, gridTemplateColumns: '1.5rem 1fr auto auto' }}
      className="grid items-center gap-2 px-3 py-1.5 border-b border-[var(--c-border)] last:border-b-0"
    >
      <button type="button" className="flex items-center justify-center cursor-grab text-[var(--c-fg-3)]" {...attributes} {...listeners}>
        <GripVerticalIcon size={12} />
      </button>
      <input value={col.label} onChange={(e) => { const next = [...columns]; next[i] = { ...col, label: e.target.value }; setColumns(next); }}
        className="w-full px-2 py-1 rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] text-sm focus:outline-none focus:border-[var(--c-accent)]" />
      <div className="w-28 shrink-0">
        <Select options={COL_TYPE_OPTIONS} value={col.type}
          onChange={(v) => { const next = [...columns]; next[i] = { ...col, type: v as 'text' | 'copy' | 'link' }; setColumns(next); }} />
      </div>
      <button type="button" onClick={() => setColumns(columns.filter((_, j) => j !== i))}
        className="p-1 rounded text-[var(--c-fg-3)] hover:text-red-500 transition-colors">
        <Trash2Icon size={12} />
      </button>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// セクション編集モーダル
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface SectionEditModalProps {
  section: DashboardSection | null;  // null = 新規追加
  instanceId: string;
  items: DashboardItem[];
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: (id: number) => void;
  initialType?: SectionType;
  isOverlaid?: boolean;
}

function SectionEditModal({ section, instanceId, items, onClose, onSaved, onDeleted, initialType, isOverlaid = false }: SectionEditModalProps) {
  const [title, setTitle] = useState(section?.title || '新しいセクション');
  const [icon,  setIcon]  = useState(section?.icon  || '📋');
  const [type,  setType]  = useState<SectionType>(section?.type || initialType || 'list');
  const [width, setWidth] = useState<SectionWidth>(section?.width || 'auto');
  const [newRow, setNewRow] = useState<boolean>(section?.new_row ?? (section as any)?.newRow ?? false);
  // memo/markdown はセクション内インライン編集のため、ここでは初期値を保持するのみ
  const memoContent = section?.memo_content || '';
  const body = section?.body || '';
  // iframe
  const [url, setUrl]                   = useState(section?.url || '');
  const [iframeHeight, setIframeHeight] = useState(String(section?.iframe_height || 400));
  // countdown
  const [countdownMode, setCountdownMode] = useState<'calendar' | 'business'>(section?.countdown_mode || 'calendar');
  // table columns
  const [columns, setColumns] = useState<Array<{ id: string; label: string; type: 'text' | 'copy' | 'link' }>>(section?.columns || []);
  const [pageSize, setPageSize] = useState(String(section?.page_size || 0));
  // list 専用
  const hasItems = items.length > 0;
  const [showFilterBar, setShowFilterBar] = useState(section?.show_filter ?? false);
  const [showAddBtn, setShowAddBtn] = useState(section?.show_add_btn ?? false);
  // 列 DnD
  const columnSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  // command_builder 専用
  const [historyLimit, setHistoryLimit] = useState(String(section?.history_limit ?? 10));
  const [cmdPlaceholder, setCmdPlaceholder] = useState(section?.cmd_placeholder || '');
  // checklist 専用
  const [checklistReset, setChecklistReset] = useState<NonNullable<DashboardSection['checklist_reset']>>(section?.checklist_reset || 'never');
  // セクション固有バインド変数（table / list / grid）
  const [tableBindVars, setTableBindVars]       = useState<string[]>(section?.table_bind_vars || []);
  const [tablePresets, setTablePresets]         = useState<SectionPreset[]>(section?.table_presets || []);
  const [tableVarsUiType, setTableVarsUiType]   = useState<BindUiType>(section?.table_vars_ui_type || 'segment');
  const [tableVarsBarLabel, setTableVarsBarLabel] = useState(section?.table_vars_bar_label || '');
  const [listBindVars, setListBindVars]         = useState<string[]>(section?.list_bind_vars || []);
  const [listPresets, setListPresets]           = useState<SectionPreset[]>(section?.list_presets || []);
  const [listVarsUiType, setListVarsUiType]     = useState<BindUiType>(section?.list_vars_ui_type || 'segment');
  const [listVarsBarLabel, setListVarsBarLabel] = useState(section?.list_vars_bar_label || '');
  const [gridBindVars, setGridBindVars]         = useState<string[]>(section?.grid_bind_vars || []);
  const [gridPresets, setGridPresets]           = useState<SectionPreset[]>(section?.grid_presets || []);
  const [gridVarsUiType, setGridVarsUiType]     = useState<BindUiType>(section?.grid_vars_ui_type || 'segment');
  const [gridVarsBarLabel, setGridVarsBarLabel] = useState(section?.grid_vars_bar_label || '');
  // セクション固有バインド変数モーダル
  const [sectionBindTarget, setSectionBindTarget] = useState<'table' | 'list' | 'grid' | null>(null);
  const [sectionBindActiveId, setSectionBindActiveId] = useState<string | number | null>(null);

  // ESC で閉じる（上位モーダルや BindVarModal が開いていればスキップ）
  useEffect(() => {
    if (isOverlaid || sectionBindTarget !== null) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOverlaid, sectionBindTarget, onClose]);

  // セクション固有バインド変数モーダル用ヘルパー
  const sectionBindVarNames  = sectionBindTarget === 'table' ? tableBindVars  : sectionBindTarget === 'list' ? listBindVars  : gridBindVars;
  const sectionBindUiType    = sectionBindTarget === 'table' ? tableVarsUiType : sectionBindTarget === 'list' ? listVarsUiType : gridVarsUiType;
  const sectionBindBarLabel  = sectionBindTarget === 'table' ? tableVarsBarLabel : sectionBindTarget === 'list' ? listVarsBarLabel : gridVarsBarLabel;
  const sectionBindPresets   = sectionBindTarget === 'table' ? tablePresets   : sectionBindTarget === 'list' ? listPresets   : gridPresets;

  function setSectionBindConfig(varNames: string[], uiType: BindUiType, barLabel: string) {
    if (sectionBindTarget === 'table') { setTableBindVars(varNames); setTableVarsUiType(uiType); setTableVarsBarLabel(barLabel); }
    else if (sectionBindTarget === 'list')  { setListBindVars(varNames); setListVarsUiType(uiType); setListVarsBarLabel(barLabel); }
    else if (sectionBindTarget === 'grid')  { setGridBindVars(varNames); setGridVarsUiType(uiType); setGridVarsBarLabel(barLabel); }
  }
  function setSectionBindPresetsForTarget(p: SectionPreset[]) {
    if (sectionBindTarget === 'table') setTablePresets(p);
    else if (sectionBindTarget === 'list')  setListPresets(p);
    else if (sectionBindTarget === 'grid')  setGridPresets(p);
  }
  function sectionBindPatch(target: 'table' | 'list' | 'grid', varNames: string[], uiType: BindUiType, barLabel: string): Partial<DashboardSection> {
    if (target === 'table') return { table_bind_vars: varNames, table_vars_ui_type: uiType, table_vars_bar_label: barLabel };
    if (target === 'list')  return { list_bind_vars: varNames,  list_vars_ui_type: uiType,  list_vars_bar_label: barLabel };
    return                         { grid_bind_vars: varNames,  grid_vars_ui_type: uiType,  grid_vars_bar_label: barLabel };
  }
  const handleSectionBindSaveConfig = async (varNames: string[], uiType: BindUiType, barLabel: string) => {
    setSectionBindConfig(varNames, uiType, barLabel);
    if (section?.id && sectionBindTarget) {
      await dashboardDB.patchSection(section.id, sectionBindPatch(sectionBindTarget, varNames, uiType, barLabel));
      onSaved();
    }
  };
  const handleSectionBindPresetAdd = async (data: { name: string; values: Record<string, string> }): Promise<SectionPreset | null> => {
    const p: SectionPreset = { id: crypto.randomUUID(), name: data.name, values: data.values };
    const next = [...sectionBindPresets, p];
    setSectionBindPresetsForTarget(next);
    if (section?.id && sectionBindTarget) {
      const key = `${sectionBindTarget}_presets` as 'table_presets' | 'list_presets' | 'grid_presets';
      await dashboardDB.patchSection(section.id, { [key]: next });
      onSaved();
    }
    return p;
  };
  const handleSectionBindPresetSave = async (p: SectionPreset) => {
    const next = sectionBindPresets.map((x) => String(x.id) === String(p.id) ? p : x);
    setSectionBindPresetsForTarget(next);
    if (section?.id && sectionBindTarget) {
      const key = `${sectionBindTarget}_presets` as 'table_presets' | 'list_presets' | 'grid_presets';
      await dashboardDB.patchSection(section.id, { [key]: next });
      onSaved();
    }
  };
  const handleSectionBindPresetDelete = async (id: string | number) => {
    if (!confirm('このプリセットを削除しますか？')) return;
    const next = sectionBindPresets.filter((p) => String(p.id) !== String(id));
    setSectionBindPresetsForTarget(next);
    if (String(sectionBindActiveId) === String(id)) setSectionBindActiveId(null);
    if (section?.id && sectionBindTarget) {
      const key = `${sectionBindTarget}_presets` as 'table_presets' | 'list_presets' | 'grid_presets';
      await dashboardDB.patchSection(section.id, { [key]: next });
      onSaved();
    }
  };
  const handleSectionBindPresetReorder = async (reordered: SectionPreset[]) => {
    setSectionBindPresetsForTarget(reordered);
    if (section?.id && sectionBindTarget) {
      const key = `${sectionBindTarget}_presets` as 'table_presets' | 'list_presets' | 'grid_presets';
      await dashboardDB.patchSection(section.id, { [key]: reordered });
      onSaved();
    }
  };

  const SECTION_BIND_TITLE: Record<string, string> = {
    table: 'テーブル バインド変数',
    list: 'リスト バインド変数',
    grid: 'グリッド バインド変数',
  };

  async function handleSave() {
    const base: Omit<DashboardSection, 'id'> = {
      instance_id: instanceId,
      title, icon, type, width, new_row: newRow,
      position: section?.position ?? 9999,
      memo_content: memoContent,
      body,
      url,
      iframe_height: parseInt(iframeHeight) || 400,
      countdown_mode: countdownMode,
      cmd_buttons: [],
      command_template: section?.command_template ?? '',
      action_mode: section?.action_mode ?? 'copy',
      columns,
      page_size: parseInt(pageSize) || 0,
      show_filter: showFilterBar,
      show_add_btn: showAddBtn,
      history_limit: parseInt(historyLimit) || 10,
      cmd_placeholder: cmdPlaceholder || undefined,
      checklist_reset: checklistReset as DashboardSection['checklist_reset'],
      // セクション固有バインド変数（保存時に全タイプ分を維持する）
      table_bind_vars: tableBindVars,
      table_presets: tablePresets,
      table_vars_ui_type: tableVarsUiType,
      table_vars_bar_label: tableVarsBarLabel,
      list_bind_vars: listBindVars,
      list_presets: listPresets,
      list_vars_ui_type: listVarsUiType,
      list_vars_bar_label: listVarsBarLabel,
      grid_bind_vars: gridBindVars,
      grid_presets: gridPresets,
      grid_vars_ui_type: gridVarsUiType,
      grid_vars_bar_label: gridVarsBarLabel,
    };
    if (section?.id) {
      await dashboardDB.updateSection({ ...section, ...base });
      ActivityLogger.log('dashboard', 'update', 'section', section.id, `セクション「${title}」を更新`);
    } else {
      const count = await dashboardDB.countSections(instanceId);
      const newId = await dashboardDB.addSection({ ...base, position: count }, instanceId);
      ActivityLogger.log('dashboard', 'create', 'section', newId, `セクション「${title}」を追加`);
    }
    onSaved();
    onClose();
  }

  async function handleDelete() {
    if (!section?.id) return;
    if (!confirm(`「${section.title}」を削除しますか？`)) return;
    ActivityLogger.log('dashboard', 'delete', 'section', section.id, `セクション「${section.title}」を削除`);
    await dashboardDB.deleteSection(section.id);
    onDeleted?.(section.id);
    onSaved();
    onClose();
  }

  function addColumn() {
    setColumns([...columns, { id: crypto.randomUUID(), label: '列' + (columns.length + 1), type: 'text' }]);
  }

  function handleColumnDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = columns.findIndex((c) => c.id === active.id);
    const newIdx = columns.findIndex((c) => c.id === over.id);
    setColumns(arrayMove(columns, oldIdx, newIdx));
  }

  return (
    <>
    <div className="fixed inset-0 bg-black/50 z-[400] flex items-center justify-center p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={section ? 'セクションを編集' : 'セクションを追加'}
        className="bg-[var(--c-bg)] rounded-xl border border-[var(--c-border)] w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--c-border)]">
          <h3 className="font-semibold text-[var(--c-fg)]">{section ? 'セクションを編集' : 'セクションを追加'}</h3>
          <button onClick={onClose} aria-label="閉じる" className="p-1 rounded hover:bg-[var(--c-bg-2)] text-[var(--c-fg-3)]"><XIcon size={16} aria-hidden="true" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex gap-2">
            <div className="w-16">
              <label className="text-xs text-[var(--c-fg-3)]">アイコン</label>
              <input value={icon} onChange={(e) => setIcon(e.target.value)}
                className="w-full px-2 py-1.5 rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-center text-lg focus:outline-none" />
            </div>
            <div className="flex-1">
              <label className="text-xs text-[var(--c-fg-3)]">タイトル</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-1.5 rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] focus:outline-none focus:border-[var(--c-accent)]" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-[var(--c-fg-3)]">タイプ</label>
              <div className={hasItems ? 'pointer-events-none opacity-50' : ''}>
                <Select options={TYPE_SELECT_OPTIONS} value={type} onChange={(v) => setType(v as SectionType)} />
              </div>
              {hasItems && <p className="text-[10px] text-[var(--c-fg-3)] mt-0.5">アイテムを削除すると変更できます</p>}
            </div>
            <div>
              <label className="text-xs text-[var(--c-fg-3)]">幅</label>
              <Select options={WIDTH_SELECT_OPTIONS} value={width} onChange={(v) => setWidth(v as SectionWidth)} />
            </div>
          </div>

          <label className="toggle-wrap">
            <input type="checkbox" className="toggle-input" checked={newRow} onChange={(e) => setNewRow(e.target.checked)} />
            <span className="toggle-track"><span className="toggle-thumb" /></span>
            <span className="toggle-label">行頭から開始する</span>
          </label>

          {type === 'iframe' && (
            <>
              <div>
                <label className="text-xs text-[var(--c-fg-3)]">URL</label>
                <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..."
                  className="w-full px-3 py-1.5 rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] focus:outline-none focus:border-[var(--c-accent)]" />
              </div>
              <div>
                <label className="text-xs text-[var(--c-fg-3)]">高さ(px)</label>
                <input value={iframeHeight} onChange={(e) => setIframeHeight(e.target.value)} type="number"
                  className="w-full px-3 py-1.5 rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] focus:outline-none focus:border-[var(--c-accent)]" />
              </div>
            </>
          )}

          {type === 'countdown' && (
            <div>
              <label className="text-xs text-[var(--c-fg-3)] block">カウント方法</label>
              <div className="seg-ctrl">
                {(['calendar', 'business'] as const).map((m) => (
                  <button key={m} type="button"
                    className={`seg-btn${countdownMode === m ? ' seg-btn--active' : ''}`}
                    onClick={() => setCountdownMode(m)}>
                    {m === 'calendar' ? 'カレンダー日数' : '営業日'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {type === 'table' && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-[var(--c-fg-3)]">ページサイズ（0=無制限）</label>
                <input value={pageSize} onChange={(e) => setPageSize(e.target.value)} type="number" min="0"
                  className="w-full px-3 py-1.5 rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] focus:outline-none focus:border-[var(--c-accent)]" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-[var(--c-fg-3)]">列定義</label>
                  <button type="button" onClick={addColumn} className="text-xs px-2 py-1 rounded-md bg-[var(--c-accent)] text-white">追加</button>
                </div>
                <DndContext sensors={columnSensors} collisionDetection={closestCenter} onDragEnd={handleColumnDragEnd}>
                  <div className="border border-[var(--c-border)] rounded-lg overflow-hidden">
                    <div className="grid items-center gap-2 px-3 py-1.5 bg-[var(--c-bg-2)] border-b border-[var(--c-border)]" style={{ gridTemplateColumns: '1.5rem 1fr auto auto' }}>
                      <span />
                      <span className="text-[10px] font-semibold text-[var(--c-fg-3)] uppercase tracking-wide">列名</span>
                      <span className="text-[10px] font-semibold text-[var(--c-fg-3)] uppercase tracking-wide">タイプ</span>
                      <span />
                    </div>
                    <SortableContext items={columns.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                      {columns.map((col, i) => (
                        <SortableColumnRow key={col.id} col={col} i={i} columns={columns} setColumns={setColumns} />
                      ))}
                    </SortableContext>
                    {columns.length === 0 && <p className="text-xs text-[var(--c-fg-3)] text-center py-3">列がありません</p>}
                  </div>
                </DndContext>
              </div>
              <label className="toggle-wrap">
                <input type="checkbox" className="toggle-input" checked={showAddBtn} onChange={(e) => setShowAddBtn(e.target.checked)} />
                <span className="toggle-track"><span className="toggle-thumb" /></span>
                <span className="toggle-label">ヘッダに追加ボタンを表示する</span>
              </label>
              <button type="button" onClick={() => setSectionBindTarget('table')}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-[7px] border border-[var(--c-border)] bg-[var(--c-bg)] text-sm text-[var(--c-fg)] hover:border-[var(--c-accent)] hover:bg-[var(--c-accent-dim)] transition-colors">
                <span className="font-mono text-xs text-[var(--c-accent)] shrink-0">{'{x}'}</span>
                <span className="flex-1 text-left">バインド変数を設定</span>
                {(tableBindVars.length > 0 || tablePresets.length > 0) && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--c-accent-dim)] text-[var(--c-accent)] shrink-0">{tableBindVars.length}変数 / {tablePresets.length}プリセット</span>}
                <ChevronRightIcon size={13} className="text-[var(--c-fg-3)] shrink-0" />
              </button>
            </div>
          )}

          {type === 'list' && (
            <div className="space-y-2">
              <label className="toggle-wrap">
                <input type="checkbox" className="toggle-input" checked={showFilterBar} onChange={(e) => setShowFilterBar(e.target.checked)} />
                <span className="toggle-track"><span className="toggle-thumb" /></span>
                <span className="toggle-label">フィルターバーを表示する</span>
              </label>
              <label className="toggle-wrap">
                <input type="checkbox" className="toggle-input" checked={showAddBtn} onChange={(e) => setShowAddBtn(e.target.checked)} />
                <span className="toggle-track"><span className="toggle-thumb" /></span>
                <span className="toggle-label">ヘッダに追加ボタンを表示する</span>
              </label>
              <button type="button" onClick={() => setSectionBindTarget('list')}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-[7px] border border-[var(--c-border)] bg-[var(--c-bg)] text-sm text-[var(--c-fg)] hover:border-[var(--c-accent)] hover:bg-[var(--c-accent-dim)] transition-colors">
                <span className="font-mono text-xs text-[var(--c-accent)] shrink-0">{'{x}'}</span>
                <span className="flex-1 text-left">バインド変数を設定</span>
                {(listBindVars.length > 0 || listPresets.length > 0) && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--c-accent-dim)] text-[var(--c-accent)] shrink-0">{listBindVars.length}変数 / {listPresets.length}プリセット</span>}
                <ChevronRightIcon size={13} className="text-[var(--c-fg-3)] shrink-0" />
              </button>
            </div>
          )}

          {type === 'checklist' && (
            <div>
              <label className="text-xs text-[var(--c-fg-3)]">自動リセット</label>
              <Select options={CHECKLIST_RESET_OPTIONS} value={checklistReset}
                onChange={(v) => setChecklistReset(v as NonNullable<DashboardSection['checklist_reset']>)} />
            </div>
          )}

          {type === 'command_builder' && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-[var(--c-fg-3)]">入力欄のプレースホルダー</label>
                <input value={cmdPlaceholder} onChange={(e) => setCmdPlaceholder(e.target.value)}
                  placeholder="入力値 {INPUT}"
                  className="w-full px-3 py-1.5 rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] focus:outline-none focus:border-[var(--c-accent)]" />
              </div>
              <div>
                <label className="text-xs text-[var(--c-fg-3)]">履歴の上限件数（0=無効）</label>
                <input value={historyLimit} onChange={(e) => setHistoryLimit(e.target.value)} type="number" min="0"
                  className="w-full px-3 py-1.5 rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] focus:outline-none focus:border-[var(--c-accent)]" />
              </div>
            </div>
          )}

          {type === 'grid' && (
            <div className="space-y-2">
              <label className="toggle-wrap">
                <input type="checkbox" className="toggle-input" checked={showAddBtn} onChange={(e) => setShowAddBtn(e.target.checked)} />
                <span className="toggle-track"><span className="toggle-thumb" /></span>
                <span className="toggle-label">ヘッダに追加ボタンを表示する</span>
              </label>
              <button type="button" onClick={() => setSectionBindTarget('grid')}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-[7px] border border-[var(--c-border)] bg-[var(--c-bg)] text-sm text-[var(--c-fg)] hover:border-[var(--c-accent)] hover:bg-[var(--c-accent-dim)] transition-colors">
                <span className="font-mono text-xs text-[var(--c-accent)] shrink-0">{'{x}'}</span>
                <span className="flex-1 text-left">バインド変数を設定</span>
                {(gridBindVars.length > 0 || gridPresets.length > 0) && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--c-accent-dim)] text-[var(--c-accent)] shrink-0">{gridBindVars.length}変数 / {gridPresets.length}プリセット</span>}
                <ChevronRightIcon size={13} className="text-[var(--c-fg-3)] shrink-0" />
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--c-border)]">
          {section?.id ? (
            <button onClick={handleDelete} className="px-3 py-1.5 rounded border border-red-300 text-red-500 text-sm hover:bg-red-50 dark:hover:bg-red-950">削除</button>
          ) : <span />}
          <button onClick={handleSave} className="px-3 py-1.5 rounded bg-[var(--c-accent)] text-white text-sm">保存</button>
        </div>
      </div>
    </div>
    {sectionBindTarget && (
      <BindVarModal
        open={true}
        onClose={() => setSectionBindTarget(null)}
        title={SECTION_BIND_TITLE[sectionBindTarget]}
        zIndex={500}
        varNames={sectionBindVarNames}
        uiType={sectionBindUiType}
        barLabel={sectionBindBarLabel}
        presets={sectionBindPresets}
        activePresetId={sectionBindActiveId}
        onActiveChange={setSectionBindActiveId}
        onSaveConfig={handleSectionBindSaveConfig}
        onPresetAdd={handleSectionBindPresetAdd}
        onPresetSave={handleSectionBindPresetSave}
        onPresetDelete={handleSectionBindPresetDelete}
        onPresetReorder={handleSectionBindPresetReorder}
      />
    )}
    </>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// アイテム管理モーダル
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface ItemManagerModalProps {
  section: DashboardSection;
  items: DashboardItem[];
  onClose: () => void;
  onChanged: () => void;
}

// ── アイテムタイプ選択肢 ────────────────────────────────────
const ITEM_TYPE_OPTIONS: SelectOption[] = [
  { value: 'copy',     label: 'コピー',       color: '#94a3b8' },
  { value: 'link',     label: 'リンク',       color: '#10b981' },
  { value: 'template', label: 'テンプレート', color: 'var(--c-accent)' },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// テンプレートアイテム編集モーダル
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function TemplateEditModal({ item, section, onClose, onConfirmed }: {
  item: DashboardItem;
  section: DashboardSection;
  onClose: () => void;
  onConfirmed: (updated: DashboardItem) => void;
}) {
  const [label, setLabel] = useState(item.label);
  const [hint,  setHint]  = useState(item.hint || '');
  const [value, setValue] = useState(item.value);

  // ESC で閉じる
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  function handleConfirm() {
    onConfirmed({ ...item, label, hint, value });
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[450] flex items-center justify-center px-4"
      onClick={onClose}>
      <div className="bg-[var(--c-bg)] rounded-xl border border-[var(--c-border)] w-[600px] max-w-[calc(100vw-32px)] p-5 flex flex-col gap-3 shadow-xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between shrink-0">
          <h4 className="font-semibold text-[var(--c-fg)]">テンプレート編集</h4>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--c-bg-2)] text-[var(--c-fg-3)]">
            <XIcon size={16} aria-hidden />
          </button>
        </div>
        <div>
          <label className="text-xs text-[var(--c-fg-3)]">ラベル</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)}
            className="w-full px-3 py-1.5 rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] focus:outline-none focus:border-[var(--c-accent)]" />
        </div>
        {section.type === 'list' && (
          <div>
            <label className="text-xs text-[var(--c-fg-3)]">ヒント</label>
            <input value={hint} onChange={(e) => setHint(e.target.value)}
              className="w-full px-3 py-1.5 rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] focus:outline-none focus:border-[var(--c-accent)]" />
          </div>
        )}
        <div>
          <label className="text-xs text-[var(--c-fg-3)]">テンプレート</label>
          <textarea value={value} onChange={(e) => setValue(e.target.value)} rows={8}
            placeholder="{TODAY} / {NOW} / {DATE:+1d:YYYY-MM-DD}"
            className="w-full px-3 py-1.5 rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] text-sm focus:outline-none focus:border-[var(--c-accent)] resize-none font-mono" />
          <div className="mt-1 p-2 rounded bg-[var(--c-bg-2)] border border-[var(--c-border)] text-[10px] text-[var(--c-fg-3)] leading-relaxed space-y-1">
            <div className="font-semibold text-[var(--c-fg-2)]">日付プレースホルダー</div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
              <span><span className="font-mono text-[var(--c-accent)]">{'{TODAY}'}</span> 今日</span>
              <span><span className="font-mono text-[var(--c-accent)]">{'{NOW}'}</span> 現在日時</span>
              <span><span className="font-mono text-[var(--c-accent)]">{'{DATE:+1d}'}</span> 明日</span>
              <span><span className="font-mono text-[var(--c-accent)]">{'{DATE:-2h}'}</span> 2時間前</span>
              <span><span className="font-mono text-[var(--c-accent)]">{'{DATE:+30m}'}</span> 30分後</span>
            </div>
            <div>オフセット単位（小→大）: <span className="font-mono">m</span>=分 <span className="font-mono">h</span>=時間 <span className="font-mono">d</span>=日 <span className="font-mono">w</span>=週 <span className="font-mono">M</span>=月 <span className="font-mono">y</span>=年</div>
            <div className="border-t border-[var(--c-border)] pt-1">
              <span className="font-semibold text-[var(--c-fg-2)]">フォーマットトークン</span>（ダブル=ゼロ埋め / シングル=なし）
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
              <span>年: <span className="font-mono">YYYY</span> / <span className="font-mono">YY</span></span>
              <span>月: <span className="font-mono">MM</span> / <span className="font-mono">M</span></span>
              <span>日: <span className="font-mono">DD</span> / <span className="font-mono">D</span></span>
              <span>時: <span className="font-mono">HH</span> / <span className="font-mono">H</span></span>
              <span>分: <span className="font-mono">mm</span> / <span className="font-mono">m</span></span>
              <span>秒: <span className="font-mono">ss</span> / <span className="font-mono">s</span></span>
              <span>曜日略: <span className="font-mono">ddd</span>（土）</span>
              <span>曜日: <span className="font-mono">dddd</span>（土曜日）</span>
            </div>
            <div className="border-t border-[var(--c-border)] pt-1 space-y-0.5">
              <div>例: <span className="font-mono text-[var(--c-accent)]">{'{TODAY:YYYY年M月D日(ddd)}'}</span> → 2026年5月3日(土)</div>
              <div>　　<span className="font-mono text-[var(--c-accent)]">{'{DATE:+1d:M/D(ddd)}'}</span> → 明日の日付＋曜日</div>
              <div>　　<span className="font-mono text-[var(--c-accent)]">{'{NOW:YY/M/D H:mm}'}</span> → 26/5/3 9:07</div>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 shrink-0">
          <button onClick={onClose}
            className="px-3 py-1.5 rounded border border-[var(--c-border)] text-sm text-[var(--c-fg-2)]">キャンセル</button>
          <button onClick={handleConfirm}
            className="px-3 py-1.5 rounded bg-[var(--c-accent)] text-white text-sm">確定</button>
        </div>
      </div>
    </div>
  );
}

// ── スプレッドシート列定義 ──────────────────────────────────
type SpColDef = {
  key: string;
  label: string;
  getValue: (item: DashboardItem) => string;
  setValue: (item: DashboardItem, val: string) => Partial<DashboardItem>;
  isSpecial?: (item: DashboardItem) => boolean;
};

function buildSpColDefs(section: DashboardSection): SpColDef[] {
  switch (section.type) {
    case 'table':
      return (section.columns || []).map((c) => ({
        key: c.id, label: c.label,
        getValue: (i) => i.row_data?.[c.id] || '',
        setValue: (i, v) => ({ row_data: { ...i.row_data, [c.id]: v } }),
      }));
    case 'countdown':
      return [{ key: 'label', label: '名前', getValue: (i) => i.label, setValue: (_, v) => ({ label: v }) }];
    case 'checklist':
      return [{ key: 'label', label: 'ラベル', getValue: (i) => i.label, setValue: (_, v) => ({ label: v }) }];
    case 'command_builder':
      return [
        { key: 'label', label: 'ボタン名',     getValue: (i) => i.label,  setValue: (_, v) => ({ label: v }) },
        { key: 'value', label: 'テンプレート', getValue: (i) => i.value,  setValue: (_, v) => ({ value: v }) },
      ];
    case 'grid':
      return [
        { key: 'label', label: 'ラベル', getValue: (i) => i.label, setValue: (_, v) => ({ label: v }) },
        { key: 'value', label: '値',     getValue: (i) => i.value,  setValue: (_, v) => ({ value: v }) },
      ];
    default: // list
      return [
        { key: 'label', label: 'ラベル', getValue: (i) => i.label,       setValue: (_, v) => ({ label: v }) },
        { key: 'hint',  label: 'ヒント', getValue: (i) => i.hint || '',   setValue: (_, v) => ({ hint: v }) },
        { key: 'value', label: '値',     getValue: (i) => i.value,        setValue: (_, v) => ({ value: v }),
          isSpecial: (i) => i.item_type === 'template' },
      ];
  }
}

function buildEmptyItem(section: DashboardSection, tempId: number, pos: number): DashboardItem {
  const base = { id: tempId, section_id: section.id!, position: pos, use_count: 0 };
  if (section.type === 'grid')
    return { ...base, label: '', value: '', emoji: '📄', item_type: 'copy' };
  if (section.type === 'table') {
    const rdata: Record<string, string> = {};
    (section.columns || []).forEach((c) => { rdata[c.id] = ''; });
    return { ...base, label: '', value: '', item_type: 'row', row_data: rdata };
  }
  if (section.type === 'countdown')
    return { ...base, label: '', value: '', item_type: 'copy' };
  if (section.type === 'command_builder')
    return { ...base, label: '', value: '', item_type: 'copy' };
  return { ...base, label: '', hint: '', value: '', item_type: 'copy' };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// スプレッドシートセル
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function SpreadsheetCell({ value, isSelected, isEditing, isInRange = false, isCellDirty = false,
  onSelect, onShiftSelect, onEdit, onChange, onCommit, mono = false, openAsDialog = false }: {
  value: string;
  isSelected: boolean;
  isEditing: boolean;
  isInRange?: boolean;
  isCellDirty?: boolean;
  onSelect: () => void;
  onShiftSelect: () => void;
  onEdit: () => void;
  onChange: (v: string) => void;
  onCommit: (dir: 'right' | 'down' | 'left' | 'none') => void;
  mono?: boolean;
  openAsDialog?: boolean;
}) {
  const isComposingRef   = useRef(false);
  const imeEscRef        = useRef(false); // IME変換中にEscが押されたフラグ
  const inputRef         = useRef<HTMLInputElement>(null);
  const committedRef     = useRef(false); // 多重コミット防止
  const escapingRef      = useRef(false); // Esc 離脱中フラグ
  const prevIsEditingRef = useRef(isEditing);

  // render フェーズで isEditing 変化時にフラグをリセット（state 更新なし = 再レンダリングなし）
  if (prevIsEditingRef.current !== isEditing) {
    prevIsEditingRef.current = isEditing;
    if (isEditing) {
      committedRef.current = false;
      escapingRef.current  = false;
      imeEscRef.current    = false;
    }
  }

  // commit: inputRef から現在値を読んで onChange → onCommit（Esc 以外で使用）
  function commit(dir: 'right' | 'down' | 'left' | 'none') {
    if (committedRef.current) return; // 多重コミット防止
    committedRef.current = true;
    const current = inputRef.current?.value ?? '';
    if (current !== value) onChange(current); // 値が変わっていない場合は dirty にしない
    onCommit(dir);
  }

  // Esc 離脱（onChange を呼ばない → 外部値が元のまま保持 = 自動リバート）
  function escapeEdit() {
    escapingRef.current = true;
    inputRef.current?.blur(); // onBlur を1回だけ発火させてフラグを消費
    onCommit('none');
  }

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (e.shiftKey) { onShiftSelect(); return; }
    if (isSelected && !isEditing) onEdit();
    else onSelect();
  }


  if (isEditing) {
    return (
      <input ref={inputRef} autoFocus
        defaultValue={value}
        onCompositionStart={() => { isComposingRef.current = true; }}
        onCompositionEnd={() => {
          isComposingRef.current = false;
          if (imeEscRef.current) {
            imeEscRef.current = false;
            // compositionend の同期処理内で focus() を呼ぶと IME がフォーカスを上書きする
            // ため、イベントサイクル完了後に離脱する
            escapingRef.current = true; // この間に来る blur で commit させないガード
            setTimeout(() => escapeEdit(), 0);
          }
        }}
        onKeyDown={(e) => {
          if (isComposingRef.current) {
            // IME変換中: Esc だけ記録して IME に処理させる
            if (e.key === 'Escape') imeEscRef.current = true;
            return;
          }
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); escapeEdit(); }
          else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); commit('none'); }
          else if (e.key === 'Tab')   { e.preventDefault(); e.stopPropagation(); commit(e.shiftKey ? 'left' : 'right'); }
        }}
        onBlur={() => {
          if (escapingRef.current) { escapingRef.current = false; return; }
          commit('none');
        }}
        onClick={(e) => e.stopPropagation()}
        className={`w-full h-full px-2 py-1 text-sm outline-none bg-[var(--c-bg)] border border-[var(--c-accent)] text-[var(--c-fg)] ${mono ? 'font-mono' : ''}`}
      />
    );
  }

  const bgClass = isSelected
    ? 'outline outline-2 outline-[var(--c-accent)] outline-offset-[-2px] bg-[var(--c-accent-dim)]'
    : isInRange
    ? 'bg-blue-100/60 dark:bg-blue-900/30'
    : isCellDirty
    ? 'bg-sky-100/50 dark:bg-sky-900/20'
    : '';

  return (
    <div onClick={handleClick} onDoubleClick={(e) => { e.stopPropagation(); onEdit(); }}
      className={`relative w-full h-full px-2 py-1 text-sm cursor-default select-none truncate leading-[26px] text-[var(--c-fg)] ${isSelected && openAsDialog ? 'pr-6' : ''} ${bgClass} ${mono ? 'font-mono' : ''}`}>
      {value || <span className="text-[var(--c-fg-3)] text-xs">—</span>}
      {openAsDialog && isSelected && (
        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--c-accent)] pointer-events-none">
          <PencilIcon size={10} />
        </span>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// インライン編集テーブル行（スプレッドシートモード）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function SortableEditableRow({ item, rowIdx, section, colDefs, isDragDisabled, isNew, isDirty, dirtyCellKeys,
  selRange, selectedColIdx, editingColIdx,
  onCellSelect, onShiftCellSelect, onCellEdit, onCellChange, onCellCommit,
  onTypeChange, onUpdate, onDelete,
}: {
  item: DashboardItem; rowIdx: number; section: DashboardSection; colDefs: SpColDef[];
  isDragDisabled: boolean; isNew: boolean; isDirty: boolean; dirtyCellKeys: Set<string>;
  selRange: { r1: number; c1: number; r2: number; c2: number } | null;
  selectedColIdx: number | null; editingColIdx: number | null;
  onCellSelect: (ci: number) => void; onShiftCellSelect: (ci: number) => void; onCellEdit: (ci: number) => void;
  onCellChange: (ci: number, v: string) => void;
  onCellCommit: (dir: 'right' | 'down' | 'left' | 'none') => void;
  onTypeChange: (id: number, t: 'copy' | 'link' | 'template') => void;
  onUpdate: (id: number, patch: Partial<DashboardItem>) => void;
  onDelete: (id: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id! });
  const showTypeToggle = section.type === 'list' || section.type === 'grid' || section.type === 'command_builder';
  const typeOptions = section.type === 'command_builder' ? CMD_ITEM_TYPE_OPTIONS : ITEM_TYPE_OPTIONS;
  const rowIndicator = isNew ? 'border-l-2 border-l-amber-400 bg-amber-100/40 dark:bg-amber-900/25'
    : isDirty ? 'border-l-2 border-l-sky-400' : 'border-l-2 border-l-transparent';
  const isRowInRange = selRange ? rowIdx >= selRange.r1 && rowIdx <= selRange.r2 : false;
  const isCellInRange = (ci: number) => isRowInRange && !!selRange && ci >= selRange.c1 && ci <= selRange.c2;

  return (
    <tr ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className={`border-b border-[var(--c-border)] last:border-0 hover:bg-[var(--c-bg-2)] group transition-colors ${rowIndicator}`}>

      {/* ドラッグハンドル */}
      <td className="w-7 pl-1 align-middle">
        {!isDragDisabled ? (
          <button type="button" {...attributes} {...listeners}
            className="cursor-grab active:cursor-grabbing text-[var(--c-fg-3)] hover:text-[var(--c-fg)] opacity-0 group-hover:opacity-100 transition-opacity p-0.5 block">
            <GripVerticalIcon size={12} />
          </button>
        ) : <span className="w-5 block" />}
      </td>

      {/* タイプ選択（list/grid のみ） */}
      {showTypeToggle && (
        <td className="w-[110px] px-1 align-middle">
          <Select compact options={typeOptions} value={item.item_type}
            onChange={(v) => onTypeChange(item.id!, v as 'copy' | 'link' | 'template')} />
        </td>
      )}

      {/* 絵文字（grid のみ） */}
      {section.type === 'grid' && (
        <td className="w-10 px-1 align-middle text-center">
          <input value={item.emoji || '📄'}
            onChange={(e) => onUpdate(item.id!, { emoji: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            className="w-9 text-center rounded border border-transparent focus:border-[var(--c-accent)] focus:bg-[var(--c-bg-2)] outline-none text-base bg-transparent py-0.5" />
        </td>
      )}

      {/* スプレッドシートセル */}
      {colDefs.map((col, ci) => {
        const isSpecial = col.isSpecial?.(item) ?? false;
        return (
          <td key={col.key} className="align-middle p-0">
            <SpreadsheetCell
              value={col.getValue(item)}
              isSelected={selectedColIdx === ci}
              isEditing={!isSpecial && editingColIdx === ci}
              isInRange={isCellInRange(ci)}
              isCellDirty={!isNew && !isSpecial && dirtyCellKeys.has(col.key)}
              openAsDialog={isSpecial}
              onSelect={() => onCellSelect(ci)}
              onShiftSelect={() => onShiftCellSelect(ci)}
              onEdit={() => onCellEdit(ci)}
              onChange={isSpecial ? () => {} : (v) => onCellChange(ci, v)}
              onCommit={onCellCommit}
              mono={col.key === 'value' || isSpecial}
            />
          </td>
        );
      })}

      {/* countdown: 日付ピッカー */}
      {section.type === 'countdown' && (
        <td className="w-44 px-1 align-middle">
          <DatePicker value={item.value}
            onChange={(v) => onUpdate(item.id!, { value: v })}
            onClear={() => onUpdate(item.id!, { value: '' })}
            placeholder="日付を選択" compact />
        </td>
      )}

      {/* grid: 行頭配置トグル */}
      {section.type === 'grid' && (
        <td className="w-12 px-1 align-middle text-center">
          <button type="button"
            onClick={(e) => { e.stopPropagation(); onUpdate(item.id!, { new_row: !item.new_row }); }}
            title="行頭から配置"
            role="switch" aria-checked={item.new_row ?? false}
            className={`relative inline-flex w-9 h-5 rounded-full transition-colors duration-150 cursor-pointer shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-accent)] focus-visible:ring-offset-1 ${
              item.new_row ? 'bg-[var(--c-accent)]' : 'bg-[var(--c-bg-2)] border border-[var(--c-border)]'
            }`}>
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-150 ${
              item.new_row ? 'translate-x-4' : 'translate-x-0'
            }`} />
          </button>
        </td>
      )}

      {/* 削除ボタン */}
      <td className="w-8 pr-2 align-middle text-center">
        <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(item.id!); }}
          className="p-0.5 rounded text-[var(--c-fg-3)] hover:text-[var(--c-danger)] hover:bg-[var(--c-danger-bg)] opacity-0 group-hover:opacity-100 transition-opacity">
          <Trash2Icon size={13} />
        </button>
      </td>
    </tr>
  );
}

function ItemManagerModal({ section, items, onClose, onChanged }: ItemManagerModalProps) {
  // ── ローカル items 状態 ───────────────────────────────────────────────
  const [localItems, setLocalItems] = useState<DashboardItem[]>(() => [...items]);
  const localItemsRef = useRef<DashboardItem[]>([...items]);
  // ── 未保存状態追跡 ───────────────────────────────────────────────────
  const [dirtyIds,   setDirtyIds]   = useState<Set<number>>(new Set());
  const [newIds,     setNewIds]     = useState<Set<number>>(new Set());
  // セル単位の変更追跡（itemId → 変更された colDef.key の Set）
  const [dirtyCells, setDirtyCells] = useState<Map<number, Set<string>>>(new Map());
  const tempIdCounter = useRef(-1);
  const isDirtyAny = dirtyIds.size > 0 || newIds.size > 0;
  // ── スプレッドシートセル選択状態 ─────────────────────────────────────
  const [selCell,     setSelCell]     = useState<[number, number] | null>(null);
  const [selEnd,      setSelEnd]      = useState<[number, number] | null>(null);
  const [editCell,    setEditCell]    = useState<[number, number] | null>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const selRange = useMemo(() => {
    if (!selCell) return null;
    const [r1, c1] = selCell;
    const [r2, c2] = selEnd ?? selCell;
    return { r1: Math.min(r1,r2), c1: Math.min(c1,c2), r2: Math.max(r1,r2), c2: Math.max(c1,c2) };
  }, [selCell, selEnd]);
  // ── フィルター ────────────────────────────────────────────────────────
  const [filterQuery, setFilterQuery] = useState('');
  const isFiltering = filterQuery.trim().length > 0;
  // ── テンプレート編集サブモーダル ─────────────────────────────────────
  const [templateEditItem, setTemplateEditItem] = useState<DashboardItem | null>(null);

  const colDefs = useMemo(() => buildSpColDefs(section), [section]);
  const itemSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // フィルター変更時はセル選択をクリア
  useEffect(() => { setSelCell(null); setSelEnd(null); setEditCell(null); }, [filterQuery]);

  // ── フィルタリング ────────────────────────────────────────────────────
  const filteredItems = isFiltering
    ? localItems.filter((item) => {
        const q = filterQuery.toLowerCase();
        return (item.label || '').toLowerCase().includes(q)
          || (item.hint  || '').toLowerCase().includes(q)
          || (item.value || '').toLowerCase().includes(q)
          || Object.values(item.row_data || {}).some((v) => (v || '').toLowerCase().includes(q));
      })
    : localItems;

  // ── ローカル items 操作 ──────────────────────────────────────────────
  function updateLocalItem(id: number, patch: Partial<DashboardItem>) {
    const next = localItemsRef.current.map((i) => i.id === id ? { ...i, ...patch } : i);
    localItemsRef.current = next;
    setLocalItems(next);
    if (id > 0) setDirtyIds((prev) => new Set(prev).add(id));
  }

  // ── 一括保存 ─────────────────────────────────────────────────────────
  async function handleSaveAll() {
    let next = [...localItemsRef.current];
    const idMap: Record<number, number> = {};
    let addCount = 0, updateCount = 0;
    for (const item of next) {
      if (newIds.has(item.id!)) {
        const { id: _tid, ...data } = item;
        const realId = await dashboardDB.addItem(data);
        idMap[item.id!] = realId;
        addCount++;
      } else if (dirtyIds.has(item.id!)) {
        await dashboardDB.updateItem(item);
        updateCount++;
      }
    }
    if (Object.keys(idMap).length > 0) {
      next = next.map((i) => idMap[i.id!] !== undefined ? { ...i, id: idMap[i.id!] } : i);
    }
    if (addCount > 0) ActivityLogger.log('dashboard', 'create', 'item', section.id!, `「${section.title}」に${addCount}件追加`);
    if (updateCount > 0) ActivityLogger.log('dashboard', 'update', 'item', section.id!, `「${section.title}」の${updateCount}件を更新`);
    localItemsRef.current = next;
    setLocalItems(next);
    setDirtyIds(new Set());
    setNewIds(new Set());
    setDirtyCells(new Map());
    onChanged();
  }

  // ── 行追加 ───────────────────────────────────────────────────────────
  function handleAddRow() {
    const tempId = tempIdCounter.current--;
    const pos = localItemsRef.current.length;
    const newItem = buildEmptyItem(section, tempId, pos);
    const next = [...localItemsRef.current, newItem];
    localItemsRef.current = next;
    setLocalItems(next);
    setNewIds((prev) => new Set(prev).add(tempId));
    // 新しい行の先頭セルを選択・編集
    const newRowIdx = filteredItems.length;
    setSelCell([newRowIdx, 0]);
    setEditCell([newRowIdx, 0]);
    setTimeout(() => tableContainerRef.current?.focus(), 0);
  }

  // ── 行削除 ───────────────────────────────────────────────────────────
  async function handleDelete(id: number) {
    if (!confirm('削除しますか？')) return;
    if (id < 0) {
      const next = localItemsRef.current.filter((i) => i.id !== id);
      localItemsRef.current = next;
      setLocalItems(next);
      setNewIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
    } else {
      const target = localItemsRef.current.find((i) => i.id === id);
      ActivityLogger.log('dashboard', 'delete', 'item', id, `「${section.title}」から「${target?.label || ''}」を削除`);
      await dashboardDB.deleteItem(id);
      const next = localItemsRef.current.filter((i) => i.id !== id);
      localItemsRef.current = next;
      setLocalItems(next);
      setDirtyIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
      setDirtyCells((prev) => { const m = new Map(prev); m.delete(id); return m; });
      onChanged();
    }
    setSelCell(null); setEditCell(null);
  }

  // ── DnD 並び替え（位置のみ即時保存） ─────────────────────────────────
  function handleDragEnd(event: DragEndEvent) {
    if (newIds.size > 0) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = localItemsRef.current.findIndex((i) => i.id === active.id);
    const newIdx = localItemsRef.current.findIndex((i) => i.id === over.id);
    // position を更新した上でローカルに反映（DB保存は handleSaveAll で一括）
    const reordered = arrayMove([...localItemsRef.current], oldIdx, newIdx)
      .map((item, p) => ({ ...item, position: p }));
    localItemsRef.current = reordered;
    setLocalItems(reordered);
    setSelCell(null); setEditCell(null);
    setDirtyIds((prev) => {
      const s = new Set(prev);
      reordered.forEach((i) => { if (i.id! > 0) s.add(i.id!); });
      return s;
    });
  }

  function handleTemplateConfirmed(updated: DashboardItem) {
    const next = localItemsRef.current.map((i) => i.id === updated.id ? updated : i);
    localItemsRef.current = next;
    setLocalItems(next);
    setDirtyIds((prev) => new Set(prev).add(updated.id!));
    setDirtyCells((prev) => {
      const m = new Map(prev);
      const keys = new Set(m.get(updated.id!) ?? []);
      keys.add('label'); keys.add('hint'); keys.add('value');
      m.set(updated.id!, keys);
      return m;
    });
    setTemplateEditItem(null);
  }

  // ── スプレッドシートセル操作 ─────────────────────────────────────────
  function handleCellSelect(rowIdx: number, colIdx: number) {
    setSelCell([rowIdx, colIdx]); setSelEnd(null); setEditCell(null);
    tableContainerRef.current?.focus();
  }
  function handleShiftCellSelect(rowIdx: number, colIdx: number) {
    if (!selCell) { setSelCell([rowIdx, colIdx]); setSelEnd(null); return; }
    setSelEnd([rowIdx, colIdx]);
    setEditCell(null);
    tableContainerRef.current?.focus();
  }
  function handleCellEdit(rowIdx: number, colIdx: number) {
    const item = filteredItems[rowIdx];
    const col  = colDefs[colIdx];
    if (item && col?.isSpecial?.(item)) {
      setTemplateEditItem(item);
      return;
    }
    setSelCell([rowIdx, colIdx]); setSelEnd(null); setEditCell([rowIdx, colIdx]);
  }
  function handleCellChange(rowIdx: number, colIdx: number, val: string) {
    const item = filteredItems[rowIdx];
    if (!item) return;
    const col = colDefs[colIdx];
    updateLocalItem(item.id!, col.setValue(item, val));
    if (item.id! > 0) {
      setDirtyCells((prev) => {
        const m = new Map(prev);
        const keys = new Set(m.get(item.id!) ?? []);
        keys.add(col.key);
        m.set(item.id!, keys);
        return m;
      });
    }
  }
  function handleCellCommit(dir: 'right' | 'down' | 'left' | 'none') {
    if (!selCell) return;
    setEditCell(null); setSelEnd(null);
    // none（Esc・Enter）: selCell はそのまま維持してテーブルに戻す
    if (dir === 'none') {
      tableContainerRef.current?.focus();
      return;
    }
    const [row, col] = selCell;
    const maxRow = filteredItems.length - 1;
    const maxCol = colDefs.length - 1;
    let next: [number, number] | null = null;
    if (dir === 'down')       next = [Math.min(row + 1, maxRow), col];
    else if (dir === 'right') {
      if (col < maxCol) next = [row, col + 1];
      else if (row < maxRow) next = [row + 1, 0];
    } else if (dir === 'left') {
      if (col > 0) next = [row, col - 1];
      else if (row > 0) next = [row - 1, maxCol];
    }
    setSelCell(next);
    // Tab（right/left）は次セルもそのまま編集モードで継続
    if (next && (dir === 'right' || dir === 'left')) {
      const [nr, nc] = next;
      const nextItem = filteredItems[nr];
      const nextCol  = colDefs[nc];
      if (nextItem && !nextCol?.isSpecial?.(nextItem)) {
        setEditCell(next);
        return; // input の autoFocus に任せるためテーブルへのフォーカスは不要
      }
    }
    tableContainerRef.current?.focus();
  }

  // ── TSV ペースト（Ctrl+V） ────────────────────────────────────────────
  async function handleTsvPaste() {
    if (!selCell) return;
    let text: string;
    try { text = await navigator.clipboard.readText(); } catch { return; }
    if (!text.trim()) return;

    const [startRow, startCol] = selCell;
    const rows = text.split(/\r?\n/).filter((r) => r.length > 0);
    let next = [...localItemsRef.current];
    const newNewIds    = new Set(newIds);
    const newDirtyIds  = new Set(dirtyIds);
    const newDirtyCells = new Map(dirtyCells);

    for (let ri = 0; ri < rows.length; ri++) {
      const cells = rows[ri].split('\t');
      const rowIdx = startRow + ri;
      if (rowIdx >= next.length) {
        const tempId = tempIdCounter.current--;
        next.push(buildEmptyItem(section, tempId, next.length));
        newNewIds.add(tempId);
      }
      let item = next[rowIdx];
      let patch: Partial<DashboardItem> = {};
      const modifiedKeys: string[] = [];
      for (let ci = 0; ci < cells.length; ci++) {
        const colIdx = startCol + ci;
        if (colIdx >= colDefs.length) break;
        const col = colDefs[colIdx];
        if (col.isSpecial?.(item)) continue;
        patch = { ...patch, ...col.setValue(item, cells[ci]) };
        modifiedKeys.push(col.key);
      }
      item = { ...item, ...patch };
      next[rowIdx] = item;
      if (item.id! > 0) {
        newDirtyIds.add(item.id!);
        const keys = new Set(newDirtyCells.get(item.id!) ?? []);
        modifiedKeys.forEach((k) => keys.add(k));
        newDirtyCells.set(item.id!, keys);
      }
    }
    localItemsRef.current = next;
    setLocalItems(next);
    setNewIds(newNewIds);
    setDirtyIds(newDirtyIds);
    setDirtyCells(newDirtyCells);
  }

  // ── 範囲コピー（Ctrl+C → TSV） ───────────────────────────────────────
  function handleCopy() {
    if (!selRange) return;
    const lines: string[] = [];
    for (let r = selRange.r1; r <= selRange.r2; r++) {
      const item = filteredItems[r];
      if (!item) continue;
      const cells: string[] = [];
      for (let c = selRange.c1; c <= selRange.c2; c++) {
        const col = colDefs[c];
        if (!col || col.isSpecial?.(item)) { cells.push(''); continue; }
        cells.push(col.getValue(item));
      }
      lines.push(cells.join('\t'));
    }
    navigator.clipboard.writeText(lines.join('\n')).catch(() => {});
  }

  // ── テーブルコンテナ キーダウン ──────────────────────────────────────
  function handleTableKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (editCell) return;
    if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
      e.preventDefault(); handleCopy(); return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
      e.preventDefault(); handleTsvPaste(); return;
    }
    if (!selCell) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        if (filteredItems.length > 0) setSelCell([0, 0]);
      }
      return;
    }
    const [row, col] = selCell;
    const maxRow = filteredItems.length - 1;
    const maxCol = colDefs.length - 1;
    switch (e.key) {
      case 'ArrowUp': {
        e.preventDefault();
        if (e.shiftKey) {
          const [er, ec] = selEnd ?? selCell;
          setSelEnd([Math.max(0, er - 1), ec]);
        } else { setSelCell([Math.max(0, row - 1), col]); setSelEnd(null); }
        break;
      }
      case 'ArrowDown': {
        e.preventDefault();
        if (e.shiftKey) {
          const [er, ec] = selEnd ?? selCell;
          setSelEnd([Math.min(maxRow, er + 1), ec]);
        } else { setSelCell([Math.min(maxRow, row + 1), col]); setSelEnd(null); }
        break;
      }
      case 'ArrowLeft': {
        e.preventDefault();
        if (e.shiftKey) {
          const [er, ec] = selEnd ?? selCell;
          setSelEnd([er, Math.max(0, ec - 1)]);
        } else { setSelCell([row, Math.max(0, col - 1)]); setSelEnd(null); }
        break;
      }
      case 'ArrowRight': {
        e.preventDefault();
        if (e.shiftKey) {
          const [er, ec] = selEnd ?? selCell;
          setSelEnd([er, Math.min(maxCol, ec + 1)]);
        } else { setSelCell([row, Math.min(maxCol, col + 1)]); setSelEnd(null); }
        break;
      }
      case 'Enter': case 'F2': {
        e.preventDefault();
        const [r, c] = selCell;
        const kbItem = filteredItems[r];
        const kbCol  = colDefs[c];
        if (kbItem && kbCol?.isSpecial?.(kbItem)) {
          setTemplateEditItem(kbItem);
        } else {
          setEditCell(selCell);
        }
        break;
      }
      case 'Delete': case 'Backspace': {
        e.preventDefault();
        const item = filteredItems[row];
        if (item) {
          const cd = colDefs[col];
          if (!cd.isSpecial?.(item)) {
            updateLocalItem(item.id!, cd.setValue(item, ''));
            if (item.id! > 0) {
              setDirtyCells((prev) => {
                const m = new Map(prev);
                const keys = new Set(m.get(item.id!) ?? []);
                keys.add(cd.key);
                m.set(item.id!, keys);
                return m;
              });
            }
          }
        }
        break;
      }
      default:
        break;
    }
  }

  // ── 閉じる（未保存確認） ─────────────────────────────────────────────
  const handleClose = useCallback(() => {
    if (isDirtyAny && !confirm('未保存の変更があります。保存せずに閉じますか？')) return;
    onClose();
  }, [isDirtyAny, onClose]);

  // ── ESC グローバルハンドラ（最上位モーダルのみ閉じる） ────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape' || e.isComposing) return; // IME 変換中は無視
      if (templateEditItem) return; // TemplateEditModal が最上位
      if (editCell) return;         // セル編集中は SpreadsheetCell 側で処理
      if (selEnd) { setSelEnd(null); return; }       // 範囲選択解除 → 起点セルはそのまま
      if (selCell) { setSelCell(null); return; }
      if (filterQuery) { setFilterQuery(''); return; } // フィルターをクリア
      handleClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [templateEditItem, editCell, selCell, selEnd, filterQuery, handleClose]);

  // ── テーブルヘッダー ─────────────────────────────────────────────────
  const thCls = 'px-2 py-1.5 text-left text-[11px] font-semibold text-[var(--c-fg-3)] border-b border-[var(--c-border)] whitespace-nowrap bg-[var(--c-bg-2)]';
  const showType = section.type === 'list' || section.type === 'grid' || section.type === 'command_builder';

  function renderTableHead() {
    return (
      <tr className="sticky top-0 z-10">
        <th className={`w-7 ${thCls}`} />
        {showType && <th className={`w-[110px] ${thCls}`}>{section.type === 'command_builder' ? 'アクション' : 'タイプ'}</th>}
        {section.type === 'grid' && <th className={`w-10 ${thCls}`}>絵文字</th>}
        {colDefs.map((c) => <th key={c.key} className={thCls}>{c.label}</th>)}
        {section.type === 'countdown' && <th className={`w-44 ${thCls}`}>日付</th>}
        {section.type === 'grid' && <th className={`w-12 ${thCls} text-center`} title="行頭から配置">行頭</th>}
        <th className={`w-8 ${thCls}`} />
      </tr>
    );
  }

  const unsavedCount = dirtyIds.size + newIds.size;

  // ── JSX ─────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/60 z-[400] flex items-center justify-center px-4"
      onClick={handleClose}>
      <div role="dialog" aria-modal="true" aria-label={`${section.title} アイテム管理`}
        className="bg-[var(--c-bg)] rounded-xl border border-[var(--c-border)] flex flex-col w-[960px] max-w-[calc(100vw-32px)] h-[760px] max-h-[calc(100vh-48px)]"
        onClick={(e) => e.stopPropagation()}>

        {/* ヘッダー */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--c-border)] shrink-0">
          <h3 className="font-semibold text-[var(--c-fg)] shrink-0">{section.icon} {section.title} — アイテム管理</h3>
          <div className="flex-1 relative max-w-xs">
            <SearchIcon size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--c-fg-3)] pointer-events-none" />
            <input value={filterQuery} onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="フィルター…"
              className="w-full h-7 pl-7 pr-6 rounded border border-[var(--c-border)] bg-[var(--c-bg-2)] text-[var(--c-fg)] text-xs focus:outline-none focus:border-[var(--c-accent)]" />
            {filterQuery && (
              <button onClick={() => setFilterQuery('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--c-fg-3)] hover:text-[var(--c-fg)]">
                <XIcon size={11} />
              </button>
            )}
          </div>
          <button onClick={handleClose} aria-label="閉じる"
            className="ml-auto p-1 rounded hover:bg-[var(--c-bg-2)] text-[var(--c-fg-3)] shrink-0">
            <XIcon size={16} aria-hidden />
          </button>
        </div>

        {/* ボディ */}
        <div ref={tableContainerRef} tabIndex={0}
          onKeyDown={handleTableKeyDown}
          onClick={() => { if (!editCell) tableContainerRef.current?.focus(); }}
          className="flex-1 overflow-auto focus:outline-none">
          <table className="w-full text-sm border-collapse table-fixed">
            <thead>{renderTableHead()}</thead>
            <DndContext sensors={itemSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={localItems.map((i) => i.id!)} strategy={verticalListSortingStrategy}>
                <tbody>
                  {filteredItems.map((item, rowIdx) => (
                    <SortableEditableRow
                      key={item.id} item={item} rowIdx={rowIdx} section={section} colDefs={colDefs}
                      isDragDisabled={isFiltering || newIds.size > 0}
                      isNew={newIds.has(item.id!)} isDirty={dirtyIds.has(item.id!)}
                      dirtyCellKeys={dirtyCells.get(item.id!) ?? new Set()}
                      selRange={selRange}
                      selectedColIdx={selCell?.[0] === rowIdx ? selCell[1] : null}
                      editingColIdx={editCell?.[0] === rowIdx ? editCell[1] : null}
                      onCellSelect={(ci) => handleCellSelect(rowIdx, ci)}
                      onShiftCellSelect={(ci) => handleShiftCellSelect(rowIdx, ci)}
                      onCellEdit={(ci) => handleCellEdit(rowIdx, ci)}
                      onCellChange={(ci, v) => handleCellChange(rowIdx, ci, v)}
                      onCellCommit={handleCellCommit}
                      onTypeChange={(id, t) => updateLocalItem(id, { item_type: t })}
                      onUpdate={updateLocalItem}
                      onDelete={handleDelete}
                    />
                  ))}
                </tbody>
              </SortableContext>
            </DndContext>
          </table>
          {filteredItems.length === 0 && (
            <p className="text-center text-sm text-[var(--c-fg-3)] py-12">
              {isFiltering ? '該当するアイテムがありません' : 'アイテムがありません。下の「＋ 行を追加」で追加できます'}
            </p>
          )}
        </div>

        {/* フッター */}
        <div className="border-t border-[var(--c-border)] px-4 py-2 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              {isFiltering ? (
                <span className="text-xs text-[var(--c-fg-3)]">フィルター中は追加・並び替えができません</span>
              ) : (
                <button onClick={handleAddRow}
                  className="text-sm px-3 py-1.5 rounded border border-[var(--c-border)] text-[var(--c-fg-2)] hover:bg-[var(--c-bg-2)] transition-colors">
                  ＋ 行を追加
                </button>
              )}
              {isDirtyAny && (
                <span className="text-xs text-amber-500 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                  {unsavedCount}件未保存
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {(['list', 'table'] as SectionType[]).includes(section.type) && localItems.filter((i) => i.id! > 0).length > 0 && (
                <button onClick={async () => {
                  if (!confirm('使用回数をリセットしますか？')) return;
                  await dashboardDB.clearUseCounts(section.id!); onChanged();
                }} className="text-xs px-2 py-1 rounded border border-[var(--c-border)] text-[var(--c-fg-3)] hover:border-[var(--c-fg-3)] hover:text-[var(--c-fg)] transition-colors">
                  使用回数をリセット
                </button>
              )}
              <button onClick={handleSaveAll} disabled={!isDirtyAny}
                className={`text-sm px-4 py-1.5 rounded font-medium transition-colors ${
                  isDirtyAny ? 'bg-[var(--c-accent)] text-white hover:opacity-90'
                             : 'bg-[var(--c-bg-2)] text-[var(--c-fg-3)] cursor-not-allowed opacity-50'
                }`}>
                保存{isDirtyAny ? ` (${unsavedCount})` : ''}
              </button>
            </div>
          </div>
      </div>

      {templateEditItem && (
        <TemplateEditModal item={templateEditItem} section={section}
          onClose={() => setTemplateEditItem(null)} onConfirmed={handleTemplateConfirmed} />
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// プリセット設定パネル
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function SortablePresetRow({ preset, isActive, onActiveChange, onEdit, onDelete, isDragDisabled = false }: {
  preset: SectionPreset;
  isActive: boolean;
  onActiveChange: (id: string | number | null) => void;
  onEdit: (p: SectionPreset) => void;
  onDelete: (id: string | number) => void;
  isDragDisabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: preset.id });
  return (
    <div ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className={`flex items-center gap-2 px-3 py-2.5 rounded-[8px] border transition-all cursor-pointer ${isActive ? 'border-[var(--c-accent)] bg-[var(--c-bg-2)]' : 'border-[var(--c-border)] hover:border-[var(--c-accent)] hover:bg-[var(--c-bg-2)]'}`}
      onClick={() => onActiveChange(isActive ? null : preset.id)}
    >
      {!isDragDisabled && (
        <button {...attributes} {...listeners}
          className="text-[var(--c-fg-3)] hover:text-[var(--c-fg)] cursor-grab active:cursor-grabbing shrink-0 p-0.5"
          onClick={(e) => e.stopPropagation()} tabIndex={-1}>
          <GripVerticalIcon size={12} />
        </button>
      )}
      <span className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 transition-colors ${isActive ? 'border-[var(--c-accent)] bg-[var(--c-accent)]' : 'border-[var(--c-border)] bg-transparent'}`} />
      <span className={`flex-1 text-sm font-medium truncate ${isActive ? 'text-[var(--c-accent)]' : 'text-[var(--c-fg)]'}`}>{preset.name}</span>
      <button onClick={(e) => { e.stopPropagation(); onEdit(preset); }}
        className="p-1.5 rounded text-[var(--c-fg-3)] hover:text-[var(--c-accent)] hover:bg-[var(--c-bg)] transition-colors" title="編集">
        <PencilIcon size={12} />
      </button>
      <button onClick={(e) => { e.stopPropagation(); onDelete(preset.id); }}
        className="p-1.5 rounded text-[var(--c-fg-3)] hover:text-red-500 hover:bg-red-50 transition-colors" title="削除">
        <Trash2Icon size={12} />
      </button>
    </div>
  );
}

interface BindVarPanelProps {
  varNames: string[];
  uiType: BindUiType;
  barLabel: string;
  presets: SectionPreset[];
  activePresetId: string | number | null;
  formState: { id: string | number | null; name: string; values: Record<string, string> } | null;
  onFormStateChange: (s: { id: string | number | null; name: string; values: Record<string, string> } | null) => void;
  onActiveChange: (id: string | number | null) => void;
  onSaveConfig: (varNames: string[], uiType: BindUiType, barLabel: string) => Promise<void>;
  onPresetAdd: (data: { name: string; values: Record<string, string> }) => Promise<SectionPreset | null>;
  onPresetSave: (preset: SectionPreset) => Promise<void>;
  onPresetDelete: (id: string | number) => Promise<void>;
  onPresetReorder: (reordered: SectionPreset[]) => Promise<void>;
}

function BindVarPanel({
  varNames: initVarNames, uiType: initUiType, barLabel: initBarLabel,
  presets, activePresetId, formState, onFormStateChange, onActiveChange,
  onSaveConfig, onPresetAdd, onPresetSave, onPresetDelete, onPresetReorder,
}: BindVarPanelProps) {
  const presetSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const [varNames, setVarNames] = useState<string[]>(initVarNames);
  const [uiType, setUiType] = useState<BindUiType>(initUiType || 'segment');
  const [barLabel, setBarLabel] = useState<string>(initBarLabel || '');
  const [newVarName, setNewVarName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingVarIdx, setEditingVarIdx] = useState<number | null>(null);

  async function addVarName() {
    const trimmed = newVarName.trim();
    if (!trimmed || varNames.includes(trimmed)) return;
    const next = [...varNames, trimmed];
    setVarNames(next);
    setNewVarName('');
    await onSaveConfig(next, uiType, barLabel);
  }

  async function removeVarName(i: number) {
    const next = varNames.filter((_, j) => j !== i);
    setVarNames(next);
    await onSaveConfig(next, uiType, barLabel);
  }

  async function renameVarName(i: number, newName: string) {
    const trimmed = newName.trim();
    setEditingVarIdx(null);
    setNewVarName('');
    if (!trimmed || (trimmed !== varNames[i] && varNames.includes(trimmed))) return;
    const next = varNames.map((vn, j) => (j === i ? trimmed : vn));
    setVarNames(next);
    await onSaveConfig(next, uiType, barLabel);
  }

  async function changeUiType(ut: BindUiType) {
    setUiType(ut);
    await onSaveConfig(varNames, ut, barLabel);
  }

  async function handlePresetDragEnd(event: DragEndEvent) {
    if (searchQuery) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = presets.findIndex((p) => String(p.id) === String(active.id));
    const newIdx = presets.findIndex((p) => String(p.id) === String(over.id));
    const reordered = arrayMove(presets, oldIdx, newIdx).map((p, i) => ({ ...p, position: i }));
    await onPresetReorder(reordered);
  }

  async function handleFormSave() {
    if (!formState) return;
    if (formState.id === null) {
      const newPreset = await onPresetAdd({ name: formState.name, values: formState.values });
      onFormStateChange(null);
      if (newPreset) onActiveChange(newPreset.id);
    } else {
      await onPresetSave({ id: formState.id, name: formState.name, values: formState.values });
      onFormStateChange(null);
    }
  }

  const filteredPresets = searchQuery
    ? presets.filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : presets;

  return (
    <div className="flex h-full">

      {/* ── 左カラム: 変数設定 ── */}
      <div className="w-96 shrink-0 flex flex-col gap-5 border-r border-[var(--c-border)] p-5 overflow-y-auto">

        {/* 変数名 */}
        <section>
          <span className="text-xs font-semibold text-[var(--c-fg-2)] uppercase tracking-wide block mb-2">バインド変数</span>
          <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
            {varNames.map((vn, i) => (
              <span key={i}
                onClick={() => {
                  if (editingVarIdx === i) { setEditingVarIdx(null); setNewVarName(''); }
                  else { setEditingVarIdx(i); setNewVarName(vn); }
                }}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-mono cursor-pointer transition-colors ${
                  editingVarIdx === i
                    ? 'bg-[var(--c-accent-dim)] border-[var(--c-accent)] text-[var(--c-accent)]'
                    : 'bg-[var(--c-bg-2)] border-[var(--c-border)] text-[var(--c-fg)] hover:border-[var(--c-accent)]'
                }`}>
                <span className="opacity-60">{'{'}</span>{vn}<span className="opacity-60">{'}'}</span>
                <button onClick={(e) => { e.stopPropagation(); removeVarName(i); }}
                  className="opacity-50 hover:opacity-100 hover:text-red-500 transition-all ml-0.5">
                  <XIcon size={10} />
                </button>
              </span>
            ))}
            {varNames.length === 0 && <span className="text-xs text-[var(--c-fg-3)]">変数なし</span>}
          </div>

          <div className="flex gap-1.5">
            <input value={newVarName} onChange={(e) => setNewVarName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { setEditingVarIdx(null); setNewVarName(''); }
                else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  editingVarIdx !== null ? renameVarName(editingVarIdx, newVarName) : addVarName();
                }
              }}
              placeholder={editingVarIdx !== null ? `"${varNames[editingVarIdx]}" を変更…` : '変数名…'}
              className={`flex-1 h-8 px-3 rounded-[7px] border bg-[var(--c-bg)] text-[var(--c-fg)] text-xs focus:outline-none ${editingVarIdx !== null ? 'border-[var(--c-accent)]' : 'border-[var(--c-border)] focus:border-[var(--c-accent)]'}`}
            />
            {editingVarIdx !== null ? (
              <button onClick={() => renameVarName(editingVarIdx, newVarName)}
                className="h-8 px-3 rounded-[7px] bg-[var(--c-accent)] text-white text-xs shrink-0">変更</button>
            ) : (
              <button onClick={addVarName}
                className="h-8 px-3 rounded-[7px] bg-[var(--c-accent)] text-white text-xs shrink-0">追加</button>
            )}
          </div>
        </section>

        {/* 表示形式（横並び） */}
        <section>
          <span className="text-xs font-semibold text-[var(--c-fg-2)] uppercase tracking-wide block mb-2">表示形式</span>
          <div className="flex border border-[var(--c-border)] rounded-[7px] overflow-hidden">
            {([
              ['pill',    'ピル'],
              ['segment', 'セグメント'],
              ['tabs',    'タブ'],
              ['select',  'ドロップダウン'],
            ] as [BindUiType, string][]).map(([val, label], i, arr) => (
              <button key={val} onClick={() => changeUiType(val)}
                className={`flex-1 py-1.5 text-xs font-medium transition-colors ${i < arr.length - 1 ? 'border-r border-[var(--c-border)]' : ''} ${uiType === val ? 'bg-[var(--c-accent)] text-white' : 'text-[var(--c-fg-2)] hover:bg-[var(--c-bg-2)]'}`}>
                {label}
              </button>
            ))}
          </div>
        </section>

        {/* バーラベル */}
        <section>
          <label className="text-xs font-semibold text-[var(--c-fg-2)] uppercase tracking-wide block mb-2">バーラベル</label>
          <input value={barLabel} onChange={(e) => setBarLabel(e.target.value)}
            onBlur={() => onSaveConfig(varNames, uiType, barLabel)}
            placeholder="例: 環境:"
            className="w-full h-8 px-3 rounded-[7px] border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] text-xs focus:outline-none focus:border-[var(--c-accent)]"
          />
        </section>
      </div>

      {/* ── 右カラム: プリセット ── */}
      <div className="flex-1 flex flex-col gap-3 min-w-0 overflow-y-auto p-5">

        {formState !== null ? (
          /* ── フォームビュー（追加 / 編集 共通）── */
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs font-medium text-[var(--c-fg-2)] block mb-1">プリセット名</label>
              <input value={formState.name}
                onChange={(e) => onFormStateChange({ ...formState, name: e.target.value })}
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                className="w-full px-3 py-2 rounded-[7px] border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] text-sm focus:outline-none focus:border-[var(--c-accent)]"
              />
            </div>
            {varNames.length > 0 ? (
              <div className="space-y-2">
                <label className="text-xs font-medium text-[var(--c-fg-2)] block">変数値</label>
                {varNames.map((vn) => (
                  <div key={vn}>
                    <label className="text-xs text-[var(--c-fg-3)] font-mono mb-0.5 block">{'{' + vn + '}'}</label>
                    <input
                      value={formState.values?.[vn] ?? ''}
                      onChange={(e) => onFormStateChange({ ...formState, values: { ...formState.values, [vn]: e.target.value } })}
                      className="w-full px-3 py-2 rounded-[7px] border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] text-sm focus:outline-none focus:border-[var(--c-accent)]"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[var(--c-fg-3)] bg-[var(--c-bg-2)] rounded-[7px] px-3 py-2">
                変数名を先に追加してください
              </p>
            )}
            <div className="flex gap-2 mt-1">
              <button onClick={() => onFormStateChange(null)}
                className="flex-1 py-2 rounded-[7px] border border-[var(--c-border)] text-sm text-[var(--c-fg-2)] hover:bg-[var(--c-bg-2)] transition-colors">キャンセル</button>
              <button onClick={handleFormSave}
                className="flex-1 py-2 rounded-[7px] bg-[var(--c-accent)] text-white text-sm font-medium">保存</button>
            </div>
          </div>
        ) : (
          /* ── リストビュー ── */
          <>
            {/* ヘッダー */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--c-fg-2)] uppercase tracking-wide">プリセット</span>
              <div className="flex items-center gap-1.5">
                {activePresetId != null && (
                  <button
                    onClick={() => {
                      const src = presets.find((p) => String(p.id) === String(activePresetId));
                      if (src) onFormStateChange({ id: null, name: src.name + ' のコピー', values: { ...src.values } });
                    }}
                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border border-[var(--c-border)] text-[var(--c-fg-2)] hover:border-[var(--c-accent)] hover:text-[var(--c-accent)] font-medium transition-colors"
                    title="選択中のプリセットをコピーして追加">
                    <CopyIcon size={10} />コピー追加
                  </button>
                )}
                <button
                  onClick={() => onFormStateChange({ id: null, name: '新しいプリセット', values: {} })}
                  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-[var(--c-accent)] text-white font-medium">
                  <PlusIcon size={10} />追加
                </button>
              </div>
            </div>

            {/* 検索フィールド */}
            <div className="relative">
              <SearchIcon size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--c-fg-3)] pointer-events-none" />
              <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="プリセットを検索…"
                className="w-full h-8 pl-7 pr-3 rounded-[7px] border border-[var(--c-border)] bg-[var(--c-bg-2)] text-[var(--c-fg)] text-xs focus:outline-none focus:border-[var(--c-accent)]"
              />
            </div>

            {/* プリセット一覧 */}
            <DndContext sensors={presetSensors} collisionDetection={closestCenter} onDragEnd={handlePresetDragEnd}>
              <SortableContext items={filteredPresets.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-1.5">
                  {filteredPresets.map((p) => (
                    <SortablePresetRow
                      key={String(p.id)}
                      preset={p}
                      isActive={String(activePresetId) === String(p.id)}
                      onActiveChange={onActiveChange}
                      onEdit={(preset) => onFormStateChange({ id: preset.id, name: preset.name, values: preset.values ?? {} })}
                      onDelete={onPresetDelete}
                      isDragDisabled={!!searchQuery}
                    />
                  ))}
                  {filteredPresets.length === 0 && (
                    <p className="text-xs text-[var(--c-fg-3)] text-center py-4 bg-[var(--c-bg-2)] rounded-[7px]">
                      {searchQuery ? '該当するプリセットがありません' : 'プリセットがありません'}
                    </p>
                  )}
                </div>
              </SortableContext>
            </DndContext>
          </>
        )}
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// セクションジャンプナビ（3件以上で表示）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function SectionJumpNav({ sections }: { sections: DashboardSection[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  if (sections.length < 3) return null;

  function scrollTo(sectionId: number) {
    document.getElementById(`section-${sectionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setOpen(false);
  }

  return (
    <div ref={ref} className="fixed top-[56px] right-5 z-[200]">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="w-[38px] h-[38px] rounded-[7px] bg-[var(--c-bg)] border-[1.5px] border-[var(--c-border)] shadow flex items-center justify-center text-[var(--c-fg-3)] hover:bg-[var(--c-accent)] hover:text-white hover:border-[var(--c-accent)] transition-all"
        title="セクションへジャンプ"
      >
        <ListIcon size={14} />
      </button>
      {open && (
        <div className="absolute top-[calc(100%+6px)] right-0 min-w-[200px] max-w-[280px] max-h-[70vh] overflow-y-auto bg-[var(--c-bg)] border border-[var(--c-border)] rounded-[7px] shadow-md py-1">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => scrollTo(s.id!)}
              className="w-full text-left px-3 py-1.5 text-sm text-[var(--c-fg)] hover:bg-[var(--c-bg-2)] hover:text-[var(--c-accent)] transition-colors flex items-center gap-2"
            >
              <span className="shrink-0">{s.icon}</span>
              <span className="truncate">{s.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// バインド変数バー（グリッド直上・プリセット存在時のみ表示）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function BindVarBar({
  presets, activePresetId, uiType, barLabel, onActiveChange,
}: {
  presets: DashboardPreset[];
  activePresetId: number | null;
  uiType: BindUiType;
  barLabel?: string;
  onActiveChange: (id: number | null) => void;
}) {
  if (presets.length === 0) return null;

  const toggle = (id: number | undefined) =>
    onActiveChange(activePresetId === (id ?? null) ? null : (id ?? null));

  return (
    <div className="px-8 pt-6">
      <div className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg px-4 py-2.5 flex items-center gap-3 shadow-[var(--shadow-sm,0_1px_4px_rgba(0,0,0,.06))] flex-wrap">
        {barLabel && <span className="text-xs text-[var(--c-fg-3)] shrink-0 font-medium">{barLabel}</span>}
        {uiType === 'segment' ? (
          <div className="seg-ctrl">
            {presets.map((p) => (
              <button key={p.id}
                className={`seg-btn seg-btn--sm${activePresetId === p.id ? ' seg-btn--active' : ''}`}
                onClick={() => toggle(p.id)}>
                {p.name}
              </button>
            ))}
          </div>
        ) : uiType === 'tabs' ? (
          <div className="flex items-end gap-0 flex-wrap border-b border-[var(--c-border)] -mx-4 px-4">
            {presets.map((p) => (
              <button key={p.id}
                onClick={() => toggle(p.id)}
                className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors ${activePresetId === p.id ? 'border-[var(--c-accent)] text-[var(--c-accent)]' : 'border-transparent text-[var(--c-fg-2)] hover:text-[var(--c-fg)]'}`}>
                {p.name}
              </button>
            ))}
          </div>
        ) : uiType === 'select' ? (
          <Select
            options={[{ value: '', label: '選択なし' }, ...presets.map((p) => ({ value: String(p.id), label: p.name }))]}
            value={activePresetId != null ? String(activePresetId) : ''}
            onChange={(v) => onActiveChange(v ? Number(v) : null)}
          />
        ) : (
          /* pill: 独立したカプセル形ボタン */
          <div className="flex gap-1 flex-wrap">
            {presets.map((p) => {
              const isActive = activePresetId === p.id;
              return (
                <button key={p.id} onClick={() => toggle(p.id)}
                  className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${isActive ? 'bg-[var(--c-accent)] text-white border-[var(--c-accent)]' : 'border-[var(--c-border)] text-[var(--c-fg-2)] hover:border-[var(--c-accent)] hover:text-[var(--c-accent)]'}`}>
                  {p.name}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 設定パネル内ソータブル行
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ITEM_MANAGED_TYPES: SectionType[] = ['list', 'grid', 'table', 'command_builder'];

function SortableSettingsRow({
  section,
  onEdit,
  onDelete,
  onOpenItemMgr,
  onToggleNewRow,
  onToggleShowFilter,
  onToggleShowAddBtn,
  onUpdateWidth,
}: {
  section: DashboardSection;
  onEdit: (s: DashboardSection) => void;
  onDelete: (id: number) => void;
  onOpenItemMgr: (s: DashboardSection) => void;
  onToggleNewRow: (s: DashboardSection, value: boolean) => void;
  onToggleShowFilter: (s: DashboardSection, value: boolean) => void;
  onToggleShowAddBtn: (s: DashboardSection, value: boolean) => void;
  onUpdateWidth: (s: DashboardSection, width: SectionWidth) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id! });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const isNewRow = section.new_row ?? (section as any).newRow ?? false;

  return (
    <div ref={setNodeRef} style={style}
      className="group border border-[var(--c-border)] rounded-xl bg-[var(--c-surface)] hover:border-[var(--c-border-2,var(--c-border))] transition-colors">
      {/* 上段: ハンドル・バッジ・アイコン・タイトル・アクション */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button {...attributes} {...listeners}
          className="text-[var(--c-fg-3)] cursor-grab active:cursor-grabbing hover:text-[var(--c-fg)] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity touch-none p-0.5"
          tabIndex={-1} aria-label="ドラッグして並び替え">
          <GripVerticalIcon size={14} />
        </button>
        <span className={`text-[10px] shrink-0 px-2 py-0.5 rounded-full font-semibold whitespace-nowrap ${TYPE_BADGE[section.type]}`}>
          {TYPE_LABELS[section.type]}
        </span>
        <span className="text-base shrink-0 leading-none">{section.icon}</span>
        <span className="flex-1 text-sm font-medium text-[var(--c-fg)] truncate min-w-0">{section.title}</span>
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {ITEM_MANAGED_TYPES.includes(section.type) && (
            <button onClick={() => onOpenItemMgr(section)}
              className="p-1.5 rounded-md text-[var(--c-fg-3)] hover:text-[var(--c-accent)] hover:bg-[var(--c-accent-dim)] transition-colors" title="アイテム管理">
              <ListIcon size={12} />
            </button>
          )}
          <button onClick={() => onEdit(section)}
            className="p-1.5 rounded-md text-[var(--c-fg-3)] hover:text-[var(--c-accent)] hover:bg-[var(--c-accent-dim)] transition-colors" title="編集">
            <PencilIcon size={12} />
          </button>
          <button onClick={() => onDelete(section.id!)}
            className="p-1.5 rounded-md text-[var(--c-fg-3)] hover:text-red-500 hover:bg-[var(--c-danger-bg)] transition-colors" title="削除">
            <Trash2Icon size={12} />
          </button>
        </div>
      </div>
      {/* 下段: 幅・行頭トグル・フィルタバートグル */}
      <div className="flex items-center gap-3 px-3 pb-2.5 border-t border-[var(--c-border)]/60 pt-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-[var(--c-fg-3)] shrink-0">幅</span>
          <div className="w-[112px] shrink-0">
            <Select
              options={WIDTH_SELECT_OPTIONS}
              value={section.width}
              onChange={(v) => onUpdateWidth(section, v as SectionWidth)}
            />
          </div>
        </div>
        <label className="toggle-wrap">
          <input type="checkbox" className="toggle-input" checked={isNewRow}
            onChange={(e) => onToggleNewRow(section, e.target.checked)} />
          <span className="toggle-track"><span className="toggle-thumb" /></span>
          <span className="toggle-label" style={{ fontSize: '11px' }}>行頭</span>
        </label>
        {section.type === 'list' && (
          <label className="toggle-wrap">
            <input type="checkbox" className="toggle-input" checked={section.show_filter ?? false}
              onChange={(e) => onToggleShowFilter(section, e.target.checked)} />
            <span className="toggle-track"><span className="toggle-thumb" /></span>
            <span className="toggle-label" style={{ fontSize: '11px' }}>フィルタ</span>
          </label>
        )}
        {['list', 'grid', 'table'].includes(section.type) && (
          <label className="toggle-wrap">
            <input type="checkbox" className="toggle-input" checked={section.show_add_btn ?? false}
              onChange={(e) => onToggleShowAddBtn(section, e.target.checked)} />
            <span className="toggle-track"><span className="toggle-thumb" /></span>
            <span className="toggle-label" style={{ fontSize: '11px' }}>追加ボタン</span>
          </label>
        )}
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 共通バインド変数モーダル
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function BindVarModal({
  open, onClose, title, zIndex = 400,
  varNames, uiType, barLabel,
  presets, activePresetId, onActiveChange,
  onSaveConfig, onPresetAdd, onPresetSave, onPresetDelete, onPresetReorder,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  zIndex?: number;
  varNames: string[];
  uiType: BindUiType;
  barLabel: string;
  presets: SectionPreset[];
  activePresetId: string | number | null;
  onActiveChange: (id: string | number | null) => void;
  onSaveConfig: (varNames: string[], uiType: BindUiType, barLabel: string) => Promise<void>;
  onPresetAdd: (data: { name: string; values: Record<string, string> }) => Promise<SectionPreset | null>;
  onPresetSave: (preset: SectionPreset) => Promise<void>;
  onPresetDelete: (id: string | number) => Promise<void>;
  onPresetReorder: (reordered: SectionPreset[]) => Promise<void>;
}) {
  const [formState, setFormState] = useState<{ id: string | number | null; name: string; values: Record<string, string> } | null>(null);

  useEffect(() => { if (!open) setFormState(null); }, [open]);

  // ESC で閉じる
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const modalTitle = title ?? '共通バインド変数';

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex }} onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
      <div
        role="dialog" aria-modal="true"
        aria-label={modalTitle}
        className="relative bg-[var(--c-bg)] border border-[var(--c-border)] rounded-2xl shadow-[var(--shadow-lg,0_20px_60px_rgba(0,0,0,.25))] w-[780px] h-[760px] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-5 py-4 border-b border-[var(--c-border)] shrink-0">
          <span className="font-mono text-xs font-semibold text-[var(--c-accent)] shrink-0">{'{x}'}</span>
          <h2 className="font-semibold text-sm flex-1">{modalTitle}</h2>
          <button onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--c-fg-3)] hover:text-[var(--c-fg)] hover:bg-[var(--c-bg-2)] transition-colors"
            aria-label="閉じる">
            <XIcon size={14} />
          </button>
        </div>
        <div className="flex-1 overflow-hidden min-h-0">
          <BindVarPanel
            varNames={varNames}
            uiType={uiType}
            barLabel={barLabel}
            presets={presets}
            activePresetId={activePresetId}
            formState={formState}
            onFormStateChange={setFormState}
            onActiveChange={onActiveChange}
            onSaveConfig={onSaveConfig}
            onPresetAdd={onPresetAdd}
            onPresetSave={onPresetSave}
            onPresetDelete={onPresetDelete}
            onPresetReorder={onPresetReorder}
          />
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 設定パネル
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface DashboardSettingsPanelProps {
  open: boolean;
  onClose: () => void;
  sections: DashboardSection[];
  onDragEnd: (event: DragEndEvent) => void;
  onAddSectionDirect: (name: string, type: SectionType) => Promise<void>;
  onEditSection: (section: DashboardSection) => void;
  onDeleteSection: (id: number) => void;
  onToggleNewRow: (section: DashboardSection, value: boolean) => Promise<void>;
  onToggleShowFilter: (section: DashboardSection, value: boolean) => Promise<void>;
  onUpdateWidth: (section: DashboardSection, width: SectionWidth) => Promise<void>;
  onOpenItemMgr: (section: DashboardSection) => void;
  instanceId: string;
  presets: DashboardPreset[];
  activePresetId: number | null;
  bindConfig: BindConfig;
  onPresetsChanged: () => void;
  onActiveChange: (id: number | null) => void;
  onExport: () => void;
  onImportClick: () => void;
  isOverlaid?: boolean;
  onToggleShowAddBtn: (section: DashboardSection, value: boolean) => void;
}

function DashboardSettingsPanel({
  open, onClose, sections, onDragEnd, onAddSectionDirect, onEditSection, onDeleteSection,
  onToggleNewRow, onToggleShowFilter, onToggleShowAddBtn, onUpdateWidth, onOpenItemMgr,
  instanceId, presets, activePresetId, bindConfig, onPresetsChanged, onActiveChange,
  onExport, onImportClick, isOverlaid = false,
}: DashboardSettingsPanelProps) {
  const [bindModalOpen, setBindModalOpen] = useState(false);

  // ESC で閉じる（上位モーダルや BindVarModal が開いていればスキップ）
  useEffect(() => {
    if (!open || isOverlaid || bindModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, isOverlaid, bindModalOpen, onClose]);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<SectionType>('list');
  const panelSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[300] flex items-center justify-center p-4"
        onClick={onClose}
      >
        {/* バックドロップ */}
        <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />

        {/* モーダル本体 */}
        <div
          role="dialog" aria-modal="true" aria-label="ダッシュボード設定"
          className="relative bg-[var(--c-bg)] border border-[var(--c-border)] rounded-2xl shadow-[var(--shadow-lg,0_20px_60px_rgba(0,0,0,.25))] w-[640px] max-h-[85vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* ヘッダー */}
          <div className="flex items-center gap-2 px-5 py-4 border-b border-[var(--c-border)] shrink-0">
            <Settings2Icon size={15} className="text-[var(--c-accent)] shrink-0" />
            <h2 className="font-semibold text-sm flex-1">ダッシュボード設定</h2>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--c-bg-2)] text-[var(--c-fg-3)] shrink-0">
              {sections.length} セクション
            </span>
            <div className="flex items-center gap-0.5 shrink-0">
              <button onClick={onExport}
                className="p-1.5 rounded-lg text-[var(--c-fg-3)] hover:text-[var(--c-fg)] hover:bg-[var(--c-bg-2)] transition-colors" title="エクスポート">
                <DownloadIcon size={14} />
              </button>
              <button onClick={onImportClick}
                className="p-1.5 rounded-lg text-[var(--c-fg-3)] hover:text-[var(--c-fg)] hover:bg-[var(--c-bg-2)] transition-colors" title="インポート">
                <UploadIcon size={14} />
              </button>
              <button onClick={onClose}
                className="p-1.5 rounded-lg text-[var(--c-fg-3)] hover:text-[var(--c-fg)] hover:bg-[var(--c-bg-2)] transition-colors ml-0.5"
                aria-label="閉じる">
                <XIcon size={14} />
              </button>
            </div>
          </div>

          {/* ボディ */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="flex flex-col gap-2 p-4">
              {/* 共通バインド変数 固定ナビ行（DnD対象外） */}
              <button
                onClick={() => setBindModalOpen(true)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] text-left hover:border-[var(--c-accent)] hover:bg-[var(--c-accent-dim)] transition-colors"
              >
                <span className="font-mono text-xs font-semibold text-[var(--c-accent)] shrink-0">{'{x}'}</span>
                <span className="flex-1 text-sm text-[var(--c-fg)]">共通バインド変数</span>
                {(bindConfig.varNames.length > 0 || presets.length > 0) && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--c-accent-dim)] text-[var(--c-accent)] shrink-0">
                    {bindConfig.varNames.length}変数 / {presets.length}プリセット
                  </span>
                )}
                <ChevronRightIcon size={13} className="text-[var(--c-fg-3)] shrink-0" />
              </button>
              <DndContext sensors={panelSensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={sections.map((s) => s.id!)} strategy={verticalListSortingStrategy}>
                  {sections.map((s) => (
                    <SortableSettingsRow
                      key={s.id}
                      section={s}
                      onEdit={onEditSection}
                      onDelete={onDeleteSection}
                      onOpenItemMgr={onOpenItemMgr}
                      onToggleNewRow={onToggleNewRow}
                      onToggleShowFilter={onToggleShowFilter}
                      onToggleShowAddBtn={onToggleShowAddBtn}
                      onUpdateWidth={onUpdateWidth}
                    />
                  ))}
                </SortableContext>
              </DndContext>
              {sections.length === 0 && (
                <p className="text-xs text-[var(--c-fg-3)] text-center py-8">セクションがありません</p>
              )}
            </div>
          </div>

          {/* フッター（セクション追加フォーム） */}
          <div className="shrink-0 border-t border-[var(--c-border)] px-5 py-4 bg-[var(--c-bg-2)]/40 rounded-b-2xl">
            <p className="text-[10px] font-semibold text-[var(--c-fg-3)] uppercase tracking-wider mb-3">セクションを追加</p>
            <div className="flex gap-2 items-center">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing && newName.trim()) {
                    onAddSectionDirect(newName.trim(), newType).then(() => setNewName(''));
                  }
                }}
                placeholder="セクション名"
                className="flex-1 px-3 py-2 text-sm rounded-lg border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] focus:outline-none focus:border-[var(--c-accent)] focus:shadow-[0_0_0_3px_var(--c-accent-dim)] transition-all"
              />
              <div className="w-36 shrink-0">
                <Select
                  options={TYPE_SELECT_OPTIONS}
                  value={newType}
                  onChange={(v) => setNewType(v as SectionType)}
                />
              </div>
              <button
                onClick={() => {
                  if (newName.trim()) {
                    onAddSectionDirect(newName.trim(), newType).then(() => setNewName(''));
                  }
                }}
                disabled={!newName.trim()}
                className="btn btn--primary btn--sm flex items-center gap-1.5 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed">
                <PlusIcon size={13} />追加
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 共通バインド変数モーダル（設定パネルより前面） */}
      <BindVarModal
        open={bindModalOpen}
        onClose={() => setBindModalOpen(false)}
        zIndex={400}
        varNames={bindConfig.varNames}
        uiType={bindConfig.uiType || 'segment'}
        barLabel={bindConfig.barLabel || ''}
        presets={presets.map((p) => ({ id: p.id!, name: p.name, values: p.values }))}
        activePresetId={activePresetId}
        onActiveChange={(id) => onActiveChange(id !== null ? Number(id) : null)}
        onSaveConfig={async (varNames, uiType, barLabel) => {
          await dashboardDB.setAppConfig('bind_config', instanceId, { varNames, uiType, barLabel: barLabel || undefined });
          onPresetsChanged();
        }}
        onPresetAdd={async (data) => {
          const id = await dashboardDB.addPreset(
            { instance_id: instanceId, name: data.name, position: presets.length, values: data.values }, instanceId
          );
          onPresetsChanged();
          const p = await dashboardDB.presets.get(id);
          return p ? { id: p.id!, name: p.name, values: p.values } : null;
        }}
        onPresetSave={async (preset) => {
          const existing = presets.find((p) => String(p.id) === String(preset.id));
          if (!existing) return;
          await dashboardDB.updatePreset({ ...existing, name: preset.name, values: preset.values });
          onPresetsChanged();
        }}
        onPresetDelete={async (id) => {
          if (!confirm('このプリセットを削除しますか？')) return;
          await dashboardDB.deletePreset(Number(id));
          if (String(activePresetId) === String(id)) onActiveChange(null);
          onPresetsChanged();
        }}
        onPresetReorder={async (reordered) => {
          await Promise.all(reordered.map((p, i) => {
            const existing = presets.find((orig) => String(orig.id) === String(p.id));
            return existing ? dashboardDB.updatePreset({ ...existing, position: i }) : Promise.resolve();
          }));
          onPresetsChanged();
        }}
      />
    </>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// メインコンポーネント
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function DashboardPage() {
  const tabLabel = useTabLabel();
  const { config } = useTabStore();
  // pageSrc の ?instance= パラメータを instanceId として使用（VanillaJS 互換）
  // 例: 'pages/dashboard.html'           → instanceId = ""
  //     'pages/dashboard.html?instance=x' → instanceId = "x"
  const instanceId = useMemo(() => {
    const tab = config.find(t => t.label === tabLabel);
    const qs = tab?.pageSrc.split('?')[1] ?? '';
    return new URLSearchParams(qs).get('instance') ?? '';
  }, [tabLabel, config]);
  const toast = useToast();

  const [sections,       setSections]       = useState<DashboardSection[]>([]);
  const [itemsMap,       setItemsMap]       = useState<Record<number, DashboardItem[]>>({});
  const [presets,        setPresets]        = useState<DashboardPreset[]>([]);
  const [activePresetId, setActivePresetId] = useState<number | null>(
    () => {
      const key = ACTIVE_PRESET_KEY_PREFIX + instanceId;
      const v = lsJson<number | null>(key);
      return v ?? null;
    }
  );
  const [bindConfig, setBindConfig] = useState<BindConfig>({ varNames: [], uiType: 'segment' });

  // モーダル状態
  const [editingSection, setEditingSection] = useState<DashboardSection | null | undefined>(undefined);  // undefined = 閉じてる, null = 新規
  const [itemMgrSection, setItemMgrSection] = useState<DashboardSection | null>(null);
  // sections の最新値を常に参照できる ref（安定コールバックから参照するため）
  const sectionsRef = useRef<DashboardSection[]>([]);

  // ── データ読み込み ────────────────────────────────────
  const load = useCallback(async () => {
    const [secs, pres, cfg] = await Promise.all([
      dashboardDB.getAllSections(instanceId),
      dashboardDB.getAllPresets(instanceId),
      dashboardDB.getAppConfig<{ varNames: string[] }>('bind_config', instanceId),
    ]);
    setSections(secs);
    sectionsRef.current = secs;
    setPresets(pres);
    setBindConfig(cfg || { varNames: [] });

    const map: Record<number, DashboardItem[]> = {};
    await Promise.all(secs.map(async (s) => {
      map[s.id!] = await dashboardDB.getItemsBySection(s.id!);
    }));
    setItemsMap(map);
  }, [instanceId]);

  useEffect(() => { load(); }, [load]);

  // アクティブプリセット変更
  function changeActivePreset(id: number | null) {
    setActivePresetId(id);
    lsSet(ACTIVE_PRESET_KEY_PREFIX + instanceId, JSON.stringify(id));
  }

  // ── DnD セクション並び替え ────────────────────────────
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = sections.findIndex((s) => s.id === active.id);
    const newIdx = sections.findIndex((s) => s.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(sections, oldIdx, newIdx).map((s, i) => ({ ...s, position: i }));
    setSections(reordered);
    await Promise.all(reordered.map((s) => dashboardDB.updateSection(s)));
  }

  // ── アイテム変更後のリロード ───────────────────────────
  const reloadItems = useCallback(async (sectionId?: number) => {
    if (sectionId !== undefined) {
      const items = await dashboardDB.getItemsBySection(sectionId);
      setItemsMap((prev) => ({ ...prev, [sectionId]: items }));
    } else {
      await load();
    }
  }, [load]);

  // ── SectionCard へ渡す安定コールバック（sectionsRef 経由で最新状態を参照） ──
  const handleOpenItemMgr = useCallback((section: DashboardSection) => {
    setItemMgrSection(section);
  }, []);

  const handleEditSection = useCallback((s: DashboardSection) => {
    setEditingSection(s);
  }, []);

  // ── ヘッダ追加ボタン表示設定（セクション単位で DB に保存） ──
  async function handleToggleShowAddBtn(section: DashboardSection, value: boolean) {
    await dashboardDB.patchSection(section.id!, { show_add_btn: value });
    setSections((prev) => prev.map((s) => s.id === section.id ? { ...s, show_add_btn: value } : s));
  }

  // ── エクスポート ──────────────────────────────────────
  async function handleExport() {
    const data = await dashboardDB.exportInstance(instanceId);
    const json = JSON.stringify({ type: 'dashboard_export', version: 2, instanceId, ...data }, null, 2);
    await FileSaver.save(json, `dashboard_${instanceId || 'default'}_${new Date().toISOString().slice(0, 10)}.json`);
  }

  // ── インポート ────────────────────────────────────────
  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await dashboardDB.importInstance(data, instanceId, true);
      await load();
      toast.success('インポートしました');
    } catch {
      toast.error('インポートに失敗しました');
    }
    e.target.value = '';
  }

  const importRef = useRef<HTMLInputElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  async function handleDeleteSection(id: number) {
    if (!confirm('このセクションを削除しますか？')) return;
    const target = sections.find((s) => s.id === id);
    ActivityLogger.log('dashboard', 'delete', 'section', id, `セクション「${target?.title || ''}」を削除`);
    await dashboardDB.deleteSection(id);
    await load();
  }

  async function handleAddSectionDirect(name: string, type: SectionType) {
    const count = await dashboardDB.countSections(instanceId);
    const newId = await dashboardDB.addSection({
      instance_id: instanceId,
      title: name,
      icon: '📋',
      type,
      width: 'auto',
      position: count,
      new_row: false,
      memo_content: '',
      body: '',
      url: '',
      iframe_height: 400,
      countdown_mode: 'calendar',
      cmd_buttons: [],
      command_template: '',
      action_mode: 'copy',
      columns: [],
      page_size: 0,
      show_filter: true,
      history_limit: 10,
      table_bind_vars: [], table_presets: [],
      list_bind_vars: [],  list_presets: [],
      grid_bind_vars: [],  grid_presets: [],
    }, instanceId);
    ActivityLogger.log('dashboard', 'create', 'section', newId, `セクション「${name}」を追加`);
    await load();
  }

  async function handleToggleNewRow(section: DashboardSection, value: boolean) {
    await dashboardDB.updateSection({ ...section, new_row: value });
    setSections((prev) => prev.map((s) => s.id === section.id ? { ...s, new_row: value } : s));
  }

  async function handleToggleShowFilter(section: DashboardSection, value: boolean) {
    await dashboardDB.patchSection(section.id!, { show_filter: value });
    setSections((prev) => prev.map((s) => s.id === section.id ? { ...s, show_filter: value } : s));
  }

  async function handleUpdateWidth(section: DashboardSection, width: SectionWidth) {
    await dashboardDB.updateSection({ ...section, width });
    setSections((prev) => prev.map((s) => s.id === section.id ? { ...s, width } : s));
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[var(--c-bg)]">
      {/* セクショングリッド（ドット背景） */}
      <div
        className="flex-1 overflow-y-auto pb-20"
        style={{
          backgroundColor: 'var(--c-bg)',
          backgroundImage: 'radial-gradient(circle, var(--c-border) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      >
        {/* バインド変数バー（プリセット存在時のみ） */}
        <BindVarBar
          presets={presets}
          activePresetId={activePresetId}
          uiType={bindConfig.uiType || 'segment'}
          barLabel={bindConfig.barLabel}
          onActiveChange={changeActivePreset}
        />

        {sections.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[var(--c-fg-3)]">
            <p className="text-sm">セクションがありません</p>
          </div>
        ) : (
          <div className="grid gap-5 p-8 pt-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(max(190px, calc(100% / 6 - 20px)), 1fr))' }}>
            {sections.map((section) => (
              <SectionCard
                key={section.id}
                section={section}
                items={itemsMap[section.id!] || []}
                presets={presets}
                activePresetId={activePresetId}
                globalVarNames={bindConfig.varNames}
                onItemsChange={() => reloadItems(section.id)}
                onOpenItemMgr={handleOpenItemMgr}
              />
            ))}
          </div>
        )}
      </div>

      {/* セクションジャンプナビ */}
      <SectionJumpNav sections={sections} />

      {/* 右下ギアボタン */}
      <button
        onClick={() => setSettingsOpen(true)}
        className="fixed bottom-6 right-5 z-[100] w-11 h-11 rounded-full bg-[var(--c-bg)] border-[1.5px] border-[var(--c-border)] shadow-[0_4px_16px_rgba(0,0,0,.1)] flex items-center justify-center text-[var(--c-fg-3)] hover:bg-[var(--c-accent)] hover:text-white hover:border-[var(--c-accent)] hover:shadow-[0_4px_20px_rgba(99,102,241,.35)] transition-all"
        aria-label="ダッシュボード設定"
      >
        <Settings2Icon size={18} />
      </button>

      {/* 設定パネル（モーダル） */}
      <DashboardSettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        isOverlaid={editingSection !== undefined || !!itemMgrSection}
        sections={sections}
        onDragEnd={handleDragEnd}
        onAddSectionDirect={handleAddSectionDirect}
        onEditSection={handleEditSection}
        onDeleteSection={handleDeleteSection}
        onToggleNewRow={handleToggleNewRow}
        onToggleShowFilter={handleToggleShowFilter}
        onUpdateWidth={handleUpdateWidth}
        onOpenItemMgr={handleOpenItemMgr}
        instanceId={instanceId}
        presets={presets}
        activePresetId={activePresetId}
        bindConfig={bindConfig}
        onPresetsChanged={load}
        onActiveChange={changeActivePreset}
        onExport={handleExport}
        onImportClick={() => importRef.current?.click()}
        onToggleShowAddBtn={handleToggleShowAddBtn}
      />
      <input ref={importRef} type="file" accept=".json" onChange={handleImport} className="hidden" />

      {/* セクション編集/追加モーダル */}
      {editingSection !== undefined && (
        <SectionEditModal
          section={editingSection}
          instanceId={instanceId}
          items={editingSection?.id ? (itemsMap[editingSection.id] || []) : []}
          onClose={() => setEditingSection(undefined)}
          onSaved={load}
          onDeleted={(id) => setSections((prev) => prev.filter((s) => s.id !== id))}
          isOverlaid={!!itemMgrSection}
        />
      )}

      {/* アイテム管理モーダル */}
      {itemMgrSection && (
        <ItemManagerModal
          section={itemMgrSection}
          items={itemsMap[itemMgrSection.id!] || []}
          onClose={() => setItemMgrSection(null)}
          onChanged={() => reloadItems(itemMgrSection.id!)}
        />
      )}
    </div>
  );
}
