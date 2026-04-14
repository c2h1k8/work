// ==================================================
// DashboardPage — カスタムダッシュボード
// ==================================================
// セクションタイプ: list / grid / command_builder / table /
//                  memo / checklist / markdown / iframe / countdown
// バインド変数: 共通プリセット + セクション固有プリセット（2段階解決）
// 日付変数: {TODAY} / {NOW} / {DATE:±N単位:Fmt}

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  PlusIcon, Settings2Icon, ChevronDownIcon, ChevronRightIcon,
  GripVerticalIcon, Trash2Icon, CopyIcon, ExternalLinkIcon,
  DownloadIcon, UploadIcon, XIcon, PencilIcon,
  ArrowUpIcon, ArrowDownIcon, RefreshCwIcon,
} from 'lucide-react';
import {
  dashboardDB,
  type DashboardSection, type DashboardItem, type DashboardPreset,
  type SectionType, type SectionWidth,
} from '../db/dashboard_db';
import { useTabLabel } from '../contexts/TabContext';
import { useToast } from '../components/Toast';

// ── localStorage キー ──────────────────────────────────────
const CMD_HISTORY_PREFIX       = 'dashboard_url_history_';
const COLLAPSE_PREFIX          = 'dashboard_collapsed_';
const CHECKLIST_STATE_PREFIX   = 'dashboard_checklist_';
const CHECKLIST_DATE_PREFIX    = 'dashboard_checklist_date_';
const TABLE_COL_HIDDEN_PREFIX  = 'dashboard_table_hidden_cols_';
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
  return fmt
    .replace('dddd', DAY_LONG[d.getDay()])
    .replace('ddd',  DAY_SHORT[d.getDay()])
    .replace('YYYY', String(d.getFullYear()))
    .replace('MM',   pad(d.getMonth() + 1))
    .replace('DD',   pad(d.getDate()))
    .replace('HH',   pad(d.getHours()))
    .replace('mm',   pad(d.getMinutes()))
    .replace('ss',   pad(d.getSeconds()));
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
  return str.replace(
    /\{(TODAY|NOW|DATE)(?::([^:}]*))?(?::([^}]*))?\}/g,
    (_m, type, arg1, arg2) => {
      if (type === 'TODAY') return formatDate(now, arg1 || 'YYYY/MM/DD');
      if (type === 'NOW')   return formatDate(now, arg1 || 'YYYY/MM/DD HH:mm');
      if (type === 'DATE')  return formatDate(applyOffset(now, arg1 || '+0d'), arg2 || 'YYYY/MM/DD');
      return _m;
    },
  );
}

// ── バインド変数解決 ───────────────────────────────────────
function resolveBindVars(str: string, presets: DashboardPreset[], activePresetId: number | null): string {
  if (!str) return str || '';
  const preset = presets.find((p) => p.id === activePresetId);
  if (!preset) return str;
  return str.replace(/\{([^}]+)\}/g, (m, key) => {
    if (key === 'INPUT') return m;
    return (preset.values && preset.values[key] !== undefined) ? preset.values[key] : m;
  });
}

function resolveSectionVars(str: string, section: DashboardSection): string {
  if (!str) return str || '';
  let presets: Array<{ id: string; name: string; values: Record<string, string> }> = [];
  let activePfx = '';
  if      (section.type === 'table') { presets = section.table_presets || []; activePfx = TABLE_ACTIVE_PRESET_PFX; }
  else if (section.type === 'list')  { presets = section.list_presets  || []; activePfx = LIST_ACTIVE_PRESET_PFX;  }
  else if (section.type === 'grid')  { presets = section.grid_presets  || []; activePfx = GRID_ACTIVE_PRESET_PFX;  }
  else return str;
  if (presets.length === 0) return str;
  const activeId = lsJson<string>(activePfx + section.id);
  const preset = activeId != null ? presets.find((p) => p.id === activeId) : null;
  if (!preset) return str;
  const vals = preset.values || {};
  return str.replace(/\{([^}]+)\}/g, (m, key) => (key in vals ? vals[key] : m));
}

function resolveAll(str: string, section: DashboardSection, presets: DashboardPreset[], activePresetId: number | null): string {
  return resolveDateVars(resolveBindVars(resolveSectionVars(str, section), presets, activePresetId));
}

// ── URL 判定 ───────────────────────────────────────────────
function isUrl(str: string): boolean {
  try { new URL(str); return true; } catch { return /^https?:\/\//.test(str); }
}

// ── 営業日計算（countdown 用） ─────────────────────────────
function countCalendarDays(from: Date, to: Date): number {
  const msPerDay = 86400000;
  return Math.round((to.getTime() - from.getTime()) / msPerDay);
}

function countBusinessDaysSimple(from: Date, to: Date): number {
  let count = 0;
  const cur = new Date(from);
  const sign = to > from ? 1 : -1;
  while ((sign === 1 ? cur < to : cur > to)) {
    const d = cur.getDay();
    if (d !== 0 && d !== 6) count += sign;
    cur.setDate(cur.getDate() + sign);
  }
  return count;
}

// ── セクション幅マップ ─────────────────────────────────────
const WIDTH_COLS: Record<SectionWidth, number> = {
  narrow: 1, auto: 2, w3: 3, wide: 4, w5: 5, full: 12,
};

// ── セクションタイプラベル ─────────────────────────────────
const TYPE_LABELS: Record<SectionType, string> = {
  list: 'リスト', grid: 'グリッド', command_builder: 'コマンドビルダー',
  table: 'テーブル', memo: 'メモ', checklist: 'チェックリスト',
  markdown: 'Markdown', iframe: 'iframe', countdown: 'カウントダウン',
};

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
// セクション別コンポーネント
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface SectionProps {
  section: DashboardSection;
  items: DashboardItem[];
  presets: DashboardPreset[];
  activePresetId: number | null;
  onItemsChange: () => void;
}

// ── List セクション ────────────────────────────────────────
function ListSection({ section, items, presets, activePresetId, onItemsChange }: SectionProps) {
  const toast = useToast();
  const sectionPresets = section.list_presets || [];
  const [activeSPresetId, setActiveSPresetId] = useState<string | null>(
    () => lsJson<string>(LIST_ACTIVE_PRESET_PFX + section.id)
  );
  const [sortByUsage, setSortByUsage] = useState<boolean>(
    () => lsGet(SORT_BY_USAGE_PREFIX + section.id) === '1'
  );

  const resolve = (s: string) => resolveAll(s, section, presets, activePresetId);

  const visibleItems = useMemo(() => {
    const list = [...items];
    if (sortByUsage) list.sort((a, b) => (b.use_count ?? 0) - (a.use_count ?? 0));
    return list;
  }, [items, sortByUsage]);

  async function handleClick(item: DashboardItem) {
    const val = resolve(item.value);
    if (item.item_type === 'link' || (item.item_type !== 'copy' && item.item_type !== 'template' && isUrl(val))) {
      window.open(val, '_blank');
    } else {
      await navigator.clipboard.writeText(val);
      toast.success('コピーしました');
    }
    if (item.id) await dashboardDB.incrementUseCount(item.id);
    onItemsChange();
  }

  function toggleSortByUsage() {
    const next = !sortByUsage;
    setSortByUsage(next);
    lsSet(SORT_BY_USAGE_PREFIX + section.id, next ? '1' : '0');
  }

  return (
    <div>
      {sectionPresets.length > 0 && (
        <div className="flex gap-1 flex-wrap mb-2">
          <button onClick={() => { setActiveSPresetId(null); lsSet(LIST_ACTIVE_PRESET_PFX + section.id, 'null'); }}
            className={`px-2 py-0.5 rounded text-xs border ${activeSPresetId == null ? 'bg-[var(--c-accent)] text-white border-[var(--c-accent)]' : 'border-[var(--c-border)]'}`}>
            なし
          </button>
          {sectionPresets.map((p) => (
            <button key={p.id} onClick={() => { setActiveSPresetId(p.id); lsSet(LIST_ACTIVE_PRESET_PFX + section.id, JSON.stringify(p.id)); }}
              className={`px-2 py-0.5 rounded text-xs border ${activeSPresetId === p.id ? 'bg-[var(--c-accent)] text-white border-[var(--c-accent)]' : 'border-[var(--c-border)]'}`}>
              {p.name}
            </button>
          ))}
        </div>
      )}
      <div className="flex justify-end mb-1">
        <button onClick={toggleSortByUsage} title="使用頻度順"
          className={`text-xs px-2 py-0.5 rounded border ${sortByUsage ? 'bg-[var(--c-accent)] text-white border-[var(--c-accent)]' : 'border-[var(--c-border)] text-[var(--c-fg-2)]'}`}>
          使用頻度順
        </button>
      </div>
      <div className="space-y-1">
        {visibleItems.map((item) => (
          <button key={item.id} onClick={() => handleClick(item)}
            className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[var(--c-bg-2)] transition-colors group">
            {item.item_type === 'link' ? <ExternalLinkIcon size={12} className="text-[var(--c-fg-3)] shrink-0" /> : <CopyIcon size={12} className="text-[var(--c-fg-3)] shrink-0" />}
            <span className="font-medium text-sm text-[var(--c-fg)]">{item.label}</span>
            {item.hint && <span className="text-xs text-[var(--c-fg-3)] truncate">{resolve(item.hint)}</span>}
          </button>
        ))}
        {items.length === 0 && <p className="text-xs text-[var(--c-fg-3)] text-center py-4">アイテムがありません</p>}
      </div>
    </div>
  );
}

// ── Grid セクション ────────────────────────────────────────
function GridSection({ section, items, presets, activePresetId, onItemsChange }: SectionProps) {
  const toast = useToast();
  const sectionPresets = section.grid_presets || [];
  const [activeSPresetId, setActiveSPresetId] = useState<string | null>(
    () => lsJson<string>(GRID_ACTIVE_PRESET_PFX + section.id)
  );

  const resolve = (s: string) => resolveAll(s, section, presets, activePresetId);

  async function handleClick(item: DashboardItem) {
    const val = resolve(item.value);
    if (item.item_type === 'link' || isUrl(val)) {
      window.open(val, '_blank');
    } else {
      await navigator.clipboard.writeText(val);
      toast.success('コピーしました');
    }
    if (item.id) await dashboardDB.incrementUseCount(item.id);
    onItemsChange();
  }

  return (
    <div>
      {sectionPresets.length > 0 && (
        <div className="flex gap-1 flex-wrap mb-2">
          <button onClick={() => { setActiveSPresetId(null); lsSet(GRID_ACTIVE_PRESET_PFX + section.id, 'null'); }}
            className={`px-2 py-0.5 rounded text-xs border ${activeSPresetId == null ? 'bg-[var(--c-accent)] text-white border-[var(--c-accent)]' : 'border-[var(--c-border)]'}`}>
            なし
          </button>
          {sectionPresets.map((p) => (
            <button key={p.id} onClick={() => { setActiveSPresetId(p.id); lsSet(GRID_ACTIVE_PRESET_PFX + section.id, JSON.stringify(p.id)); }}
              className={`px-2 py-0.5 rounded text-xs border ${activeSPresetId === p.id ? 'bg-[var(--c-accent)] text-white border-[var(--c-accent)]' : 'border-[var(--c-border)]'}`}>
              {p.name}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <button key={item.id} onClick={() => handleClick(item)}
            className="flex flex-col items-center gap-1 p-2 rounded-lg border border-[var(--c-border)] hover:bg-[var(--c-bg-2)] transition-colors min-w-[60px]">
            <span className="text-2xl">{item.emoji || '📄'}</span>
            <span className="text-xs text-[var(--c-fg)] text-center break-words max-w-[72px]">{item.label}</span>
          </button>
        ))}
        {items.length === 0 && <p className="text-xs text-[var(--c-fg-3)] py-4">アイテムがありません</p>}
      </div>
    </div>
  );
}

// ── CommandBuilder セクション ──────────────────────────────
function CommandBuilderSection({ section, presets, activePresetId }: SectionProps) {
  const toast = useToast();
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>(() => lsJson<string[]>(CMD_HISTORY_PREFIX + section.id) || []);

  const resolve = (template: string) => {
    const withInput = template.replace(/\{INPUT\}/g, input);
    return resolveDateVars(resolveBindVars(withInput, presets, activePresetId));
  };

  async function execButton(template: string, actionMode: 'copy' | 'open') {
    const result = resolve(template);
    if (actionMode === 'open') {
      window.open(result, '_blank');
    } else {
      await navigator.clipboard.writeText(result);
      toast.success('コピーしました');
    }
    if (input) {
      const next = [input, ...history.filter((h) => h !== input)].slice(0, 20);
      setHistory(next);
      lsSet(CMD_HISTORY_PREFIX + section.id, JSON.stringify(next));
    }
  }

  const buttons = section.cmd_buttons && section.cmd_buttons.length > 0
    ? section.cmd_buttons
    : section.command_template
    ? [{ id: '0', label: section.action_mode === 'open' ? '開く' : 'コピー', template: section.command_template, action_mode: section.action_mode || 'copy' }]
    : [];

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && buttons.length > 0) execButton(buttons[0].template, buttons[0].action_mode); }}
        placeholder="入力値 {INPUT}"
        className="w-full px-3 py-1.5 rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] text-sm focus:outline-none focus:border-[var(--c-accent)]"
      />
      {history.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {history.slice(0, 5).map((h, i) => (
            <button key={i} onClick={() => setInput(h)}
              className="px-2 py-0.5 rounded text-xs border border-[var(--c-border)] text-[var(--c-fg-2)] hover:border-[var(--c-accent)]">
              {h}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2 flex-wrap">
        {buttons.map((btn, i) => (
          <button key={btn.id} onClick={() => execButton(btn.template, btn.action_mode)}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${CMD_BTN_STYLE[CMD_BTN_COLORS[i % CMD_BTN_COLORS.length]]}`}>
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Table セクション ───────────────────────────────────────
function TableSection({ section, items, presets, activePresetId, onItemsChange }: SectionProps) {
  const toast = useToast();
  const columns = section.columns || [];
  const pageSize = section.page_size || 0;
  const sectionPresets = section.table_presets || [];
  const [activeSPresetId, setActiveSPresetId] = useState<string | null>(
    () => lsJson<string>(TABLE_ACTIVE_PRESET_PFX + section.id)
  );
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(
    () => new Set(lsJson<string[]>(TABLE_COL_HIDDEN_PREFIX + section.id) || [])
  );
  const [sortState, setSortState] = useState<{ colId: string; dir: 'asc' | 'desc' } | null>(null);
  const [page, setPage] = useState(0);
  const [sortByUsage, setSortByUsage] = useState<boolean>(
    () => lsGet(SORT_BY_USAGE_PREFIX + section.id) === '1'
  );

  const resolve = (s: string) => resolveAll(s, section, presets, activePresetId);

  function toggleColHide(colId: string) {
    const next = new Set(hiddenCols);
    if (next.has(colId)) next.delete(colId); else next.add(colId);
    setHiddenCols(next);
    lsSet(TABLE_COL_HIDDEN_PREFIX + section.id, JSON.stringify([...next]));
  }

  function toggleSort(colId: string) {
    setSortState((prev) => {
      if (!prev || prev.colId !== colId) return { colId, dir: 'asc' };
      if (prev.dir === 'asc') return { colId, dir: 'desc' };
      return null;
    });
  }

  const sortedItems = useMemo(() => {
    let list = [...items];
    if (sortByUsage) { list.sort((a, b) => (b.use_count ?? 0) - (a.use_count ?? 0)); }
    else if (sortState) {
      const { colId, dir } = sortState;
      list.sort((a, b) => {
        const va = (a.row_data?.[colId] ?? '').toLowerCase();
        const vb = (b.row_data?.[colId] ?? '').toLowerCase();
        return dir === 'asc' ? va.localeCompare(vb, 'ja') : vb.localeCompare(va, 'ja');
      });
    }
    return list;
  }, [items, sortState, sortByUsage]);

  const totalPages = pageSize > 0 ? Math.ceil(sortedItems.length / pageSize) : 1;
  const pagedItems = pageSize > 0 ? sortedItems.slice(page * pageSize, (page + 1) * pageSize) : sortedItems;
  const visibleCols = columns.filter((c) => !hiddenCols.has(c.id));

  async function handleCellClick(item: DashboardItem, col: { id: string; label: string; type: 'text' | 'copy' | 'link' }) {
    const val = resolve(item.row_data?.[col.id] ?? '');
    if (col.type === 'link' || (col.type !== 'text' && col.type !== 'copy' && isUrl(val))) {
      window.open(val, '_blank');
    } else if (col.type === 'copy' || col.type === 'text') {
      await navigator.clipboard.writeText(val);
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
      {sectionPresets.length > 0 && (
        <div className="flex gap-1 flex-wrap mb-2">
          <button onClick={() => { setActiveSPresetId(null); lsSet(TABLE_ACTIVE_PRESET_PFX + section.id, 'null'); }}
            className={`px-2 py-0.5 rounded text-xs border ${activeSPresetId == null ? 'bg-[var(--c-accent)] text-white border-[var(--c-accent)]' : 'border-[var(--c-border)]'}`}>
            なし
          </button>
          {sectionPresets.map((p) => (
            <button key={p.id} onClick={() => { setActiveSPresetId(p.id); lsSet(TABLE_ACTIVE_PRESET_PFX + section.id, JSON.stringify(p.id)); }}
              className={`px-2 py-0.5 rounded text-xs border ${activeSPresetId === p.id ? 'bg-[var(--c-accent)] text-white border-[var(--c-accent)]' : 'border-[var(--c-border)]'}`}>
              {p.name}
            </button>
          ))}
        </div>
      )}
      <div className="flex justify-between items-center mb-1">
        <div className="flex gap-1 flex-wrap">
          {columns.map((c) => (
            <button key={c.id} onClick={() => toggleColHide(c.id)}
              className={`text-xs px-1.5 py-0.5 rounded border ${hiddenCols.has(c.id) ? 'opacity-40 border-[var(--c-border)]' : 'border-[var(--c-accent)] text-[var(--c-accent)]'}`}>
              {c.label}
            </button>
          ))}
        </div>
        <button onClick={() => { setSortByUsage(!sortByUsage); lsSet(SORT_BY_USAGE_PREFIX + section.id, !sortByUsage ? '1' : '0'); }}
          className={`text-xs px-2 py-0.5 rounded border ${sortByUsage ? 'bg-[var(--c-accent)] text-white border-[var(--c-accent)]' : 'border-[var(--c-border)] text-[var(--c-fg-2)]'}`}>
          使用頻度順
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              {visibleCols.map((c) => (
                <th key={c.id} onClick={() => toggleSort(c.id)}
                  className="text-left px-2 py-1.5 border-b border-[var(--c-border)] text-[var(--c-fg-2)] font-medium cursor-pointer hover:text-[var(--c-fg)] whitespace-nowrap select-none">
                  {c.label}
                  {sortState?.colId === c.id && <span className="ml-1">{sortState.dir === 'asc' ? '↑' : '↓'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagedItems.map((item) => (
              <tr key={item.id} className="hover:bg-[var(--c-bg-2)] transition-colors">
                {visibleCols.map((c) => {
                  const val = resolve(item.row_data?.[c.id] ?? '');
                  return (
                    <td key={c.id} className="px-2 py-1.5 border-b border-[var(--c-border)]">
                      {c.type === 'link' ? (
                        <a href={val} target="_blank" rel="noreferrer"
                          onClick={(e) => { e.preventDefault(); handleCellClick(item, c); }}
                          className="text-[var(--c-accent)] hover:underline">{val}</a>
                      ) : c.type === 'copy' ? (
                        <button onClick={() => handleCellClick(item, c)}
                          className="text-left w-full hover:text-[var(--c-accent)]">{val}</button>
                      ) : (
                        <span className="text-[var(--c-fg)]">{val}</span>
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
        <div className="flex items-center gap-2 mt-2 justify-end">
          <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
            className="px-2 py-0.5 rounded border border-[var(--c-border)] text-xs disabled:opacity-40">‹</button>
          <span className="text-xs text-[var(--c-fg-2)]">{page + 1}/{totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
            className="px-2 py-0.5 rounded border border-[var(--c-border)] text-xs disabled:opacity-40">›</button>
        </div>
      )}
    </div>
  );
}

// ── Memo セクション ────────────────────────────────────────
function MemoSection({ section }: SectionProps) {
  const [content, setContent] = useState(section.memo_content || '');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function handleChange(val: string) {
    setContent(val);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await dashboardDB.updateSection({ ...section, memo_content: val });
    }, 600);
  }

  return (
    <textarea
      value={content}
      onChange={(e) => handleChange(e.target.value)}
      className="w-full min-h-[120px] px-3 py-2 rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] text-sm resize-y focus:outline-none focus:border-[var(--c-accent)]"
      placeholder="メモを入力…"
    />
  );
}

// ── Checklist セクション ───────────────────────────────────
function ChecklistSection({ section, items }: SectionProps) {
  const stateKey = CHECKLIST_STATE_PREFIX + section.id;
  const dateKey  = CHECKLIST_DATE_PREFIX  + section.id;

  const today = new Date().toDateString();
  const [checked, setChecked] = useState<Record<number, boolean>>(() => {
    const lastDate = lsGet(dateKey);
    if (lastDate !== today) return {};
    return lsJson<Record<number, boolean>>(stateKey) || {};
  });

  function toggle(id: number) {
    const next = { ...checked, [id]: !checked[id] };
    setChecked(next);
    lsSet(stateKey, JSON.stringify(next));
    lsSet(dateKey, today);
  }

  function reset() {
    setChecked({});
    lsSet(stateKey, '{}');
    lsSet(dateKey, today);
  }

  return (
    <div>
      <div className="flex justify-end mb-1">
        <button onClick={reset} title="リセット"
          className="p-1 rounded hover:bg-[var(--c-bg-2)] text-[var(--c-fg-3)]">
          <RefreshCwIcon size={12} />
        </button>
      </div>
      <div className="space-y-1">
        {items.map((item) => (
          <label key={item.id} className="flex items-center gap-2 cursor-pointer px-1 py-0.5 rounded hover:bg-[var(--c-bg-2)]">
            <input type="checkbox" checked={checked[item.id!] || false} onChange={() => toggle(item.id!)}
              className="accent-[var(--c-accent)]" />
            <span className={`text-sm ${checked[item.id!] ? 'line-through text-[var(--c-fg-3)]' : 'text-[var(--c-fg)]'}`}>
              {item.label}
            </span>
          </label>
        ))}
        {items.length === 0 && <p className="text-xs text-[var(--c-fg-3)] text-center py-4">アイテムがありません</p>}
      </div>
    </div>
  );
}

// ── Markdown セクション ────────────────────────────────────
function MarkdownSection({ section }: SectionProps) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(section.body || '');

  async function save() {
    await dashboardDB.updateSection({ ...section, body });
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="space-y-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="w-full min-h-[200px] px-3 py-2 rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] text-sm font-mono resize-y focus:outline-none focus:border-[var(--c-accent)]"
          autoFocus
        />
        <div className="flex gap-2 justify-end">
          <button onClick={() => setEditing(false)} className="px-3 py-1 rounded border border-[var(--c-border)] text-sm text-[var(--c-fg-2)]">キャンセル</button>
          <button onClick={save} className="px-3 py-1 rounded bg-[var(--c-accent)] text-white text-sm">保存</button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative group">
      <button onClick={() => setEditing(true)}
        className="absolute top-0 right-0 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity bg-[var(--c-bg-2)] text-[var(--c-fg-3)] hover:text-[var(--c-fg)]">
        <PencilIcon size={12} />
      </button>
      {body ? (
        <div className="prose prose-sm max-w-none dark:prose-invert text-[var(--c-fg)]">
          <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{body}</ReactMarkdown>
        </div>
      ) : (
        <p className="text-xs text-[var(--c-fg-3)] py-4 text-center">Markdownを入力…（編集ボタンをクリック）</p>
      )}
    </div>
  );
}

// ── Iframe セクション ──────────────────────────────────────
function IframeSection({ section, presets, activePresetId }: SectionProps) {
  const resolve = (s: string) => resolveAll(s, section, presets, activePresetId);
  const url = resolve(section.url || '');
  const height = section.iframe_height || 400;

  if (!url) return <p className="text-xs text-[var(--c-fg-3)] text-center py-4">URLが設定されていません</p>;
  return (
    <iframe src={url} height={height} className="w-full rounded border border-[var(--c-border)]"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups" />
  );
}

// ── Countdown セクション ───────────────────────────────────
function CountdownSection({ section, items }: SectionProps) {
  const mode = section.countdown_mode || 'calendar';
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (items.length === 0) return <p className="text-xs text-[var(--c-fg-3)] text-center py-4">マイルストーンがありません</p>;

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const target = new Date(item.value);
        target.setHours(0, 0, 0, 0);
        const days = mode === 'business' ? countBusinessDaysSimple(today, target) : countCalendarDays(today, target);
        const isOver = days < 0;
        const isSoon = !isOver && days <= 7;
        return (
          <div key={item.id} className="flex items-center justify-between px-2 py-1.5 rounded border border-[var(--c-border)]">
            <div>
              <div className="text-sm font-medium text-[var(--c-fg)]">{item.label}</div>
              <div className="text-xs text-[var(--c-fg-3)]">{item.value}</div>
            </div>
            <div className={`text-2xl font-bold tabular-nums ${isOver ? 'text-red-500' : isSoon ? 'text-amber-500' : 'text-[var(--c-accent)]'}`}>
              {isOver ? `+${Math.abs(days)}` : days}<span className="text-xs font-normal ml-1">日</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// セクションカード（折りたたみ + ヘッダー + コンテンツ）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface SectionCardProps extends SectionProps {
  onOpenItemMgr: (sectionId: number) => void;
  onEditSection: (section: DashboardSection) => void;
}

const SectionCard = React.memo(function SectionCard({
  section, items, presets, activePresetId, onItemsChange,
  onOpenItemMgr, onEditSection,
}: SectionCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id! });
  const colSpan = WIDTH_COLS[section.width] || 2;

  const [collapsed, setCollapsed] = useState<boolean>(() => lsGet(COLLAPSE_PREFIX + section.id) === '1');

  function toggleCollapse() {
    const next = !collapsed;
    setCollapsed(next);
    lsSet(COLLAPSE_PREFIX + section.id, next ? '1' : '0');
  }

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    gridColumn: `span ${colSpan}`,
  };

  const sectionProps: SectionProps = { section, items, presets, activePresetId, onItemsChange };

  return (
    <div ref={setNodeRef} style={style}
      className="bg-[var(--c-bg)] border border-[var(--c-border)] rounded-lg overflow-hidden">
      {/* ヘッダー */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--c-border)] bg-[var(--c-bg-2)]">
        <span ref={setNodeRef} {...attributes} {...listeners}
          className="text-[var(--c-fg-3)] cursor-grab active:cursor-grabbing hover:text-[var(--c-fg)] transition-colors">
          <GripVerticalIcon size={14} />
        </span>
        <span className="text-base">{section.icon}</span>
        <span className="font-medium text-sm text-[var(--c-fg)] flex-1 truncate">{section.title}</span>
        <span className="text-xs text-[var(--c-fg-3)]">{TYPE_LABELS[section.type]}</span>
        <button onClick={() => onOpenItemMgr(section.id!)}
          className="p-1 rounded hover:bg-[var(--c-bg)] text-[var(--c-fg-3)] hover:text-[var(--c-fg)]" title="アイテム管理">
          <PlusIcon size={14} />
        </button>
        <button onClick={() => onEditSection(section)}
          className="p-1 rounded hover:bg-[var(--c-bg)] text-[var(--c-fg-3)] hover:text-[var(--c-fg)]" title="設定">
          <Settings2Icon size={14} />
        </button>
        <button onClick={toggleCollapse} aria-expanded={!collapsed} aria-label={collapsed ? 'セクションを展開' : 'セクションを折りたたむ'}
          className="p-1 rounded hover:bg-[var(--c-bg)] text-[var(--c-fg-3)]">
          {collapsed ? <ChevronRightIcon size={14} aria-hidden="true" /> : <ChevronDownIcon size={14} aria-hidden="true" />}
        </button>
      </div>
      {/* コンテンツ */}
      {!collapsed && (
        <div className="p-3">
          {section.type === 'list'            && <ListSection            {...sectionProps} />}
          {section.type === 'grid'            && <GridSection            {...sectionProps} />}
          {section.type === 'command_builder' && <CommandBuilderSection  {...sectionProps} />}
          {section.type === 'table'           && <TableSection           {...sectionProps} />}
          {section.type === 'memo'            && <MemoSection            {...sectionProps} />}
          {section.type === 'checklist'       && <ChecklistSection       {...sectionProps} />}
          {section.type === 'markdown'        && <MarkdownSection        {...sectionProps} />}
          {section.type === 'iframe'          && <IframeSection          {...sectionProps} />}
          {section.type === 'countdown'       && <CountdownSection       {...sectionProps} />}
        </div>
      )}
    </div>
  );
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// セクション編集モーダル
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface SectionEditModalProps {
  section: DashboardSection | null;  // null = 新規追加
  instanceId: string;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: (id: number) => void;
  initialType?: SectionType;
}

function SectionEditModal({ section, instanceId, onClose, onSaved, onDeleted, initialType }: SectionEditModalProps) {
  const [title, setTitle] = useState(section?.title || '新しいセクション');
  const [icon,  setIcon]  = useState(section?.icon  || '📋');
  const [type,  setType]  = useState<SectionType>(section?.type || initialType || 'list');
  const [width, setWidth] = useState<SectionWidth>(section?.width || 'auto');
  // memo/markdown はセクション内インライン編集のため、ここでは初期値を保持するのみ
  const memoContent = section?.memo_content || '';
  const body = section?.body || '';
  // iframe
  const [url, setUrl]           = useState(section?.url || '');
  const [iframeHeight, setIframeHeight] = useState(String(section?.iframe_height || 400));
  // countdown
  const [countdownMode, setCountdownMode] = useState<'calendar' | 'business'>(section?.countdown_mode || 'calendar');
  // command_builder
  const [cmdTemplate, setCmdTemplate] = useState(section?.command_template || '');
  const [actionMode,  setActionMode]  = useState<'copy' | 'open'>(section?.action_mode || 'copy');
  // table columns
  const [columns, setColumns] = useState<Array<{ id: string; label: string; type: 'text' | 'copy' | 'link' }>>(section?.columns || []);
  const [pageSize, setPageSize] = useState(String(section?.page_size || 0));

  async function handleSave() {
    const base: Omit<DashboardSection, 'id'> = {
      instance_id: instanceId,
      title, icon, type, width,
      position: section?.position ?? 9999,
      memo_content: memoContent,
      body,
      url,
      iframe_height: parseInt(iframeHeight) || 400,
      countdown_mode: countdownMode,
      command_template: cmdTemplate,
      action_mode: actionMode,
      columns,
      page_size: parseInt(pageSize) || 0,
    };
    if (section?.id) {
      await dashboardDB.updateSection({ ...section, ...base });
    } else {
      const count = await dashboardDB.countSections(instanceId);
      await dashboardDB.addSection({ ...base, position: count }, instanceId);
    }
    onSaved();
    onClose();
  }

  async function handleDelete() {
    if (!section?.id) return;
    if (!confirm(`「${section.title}」を削除しますか？`)) return;
    await dashboardDB.deleteSection(section.id);
    onDeleted?.(section.id);
    onSaved();
    onClose();
  }

  function addColumn() {
    setColumns([...columns, { id: crypto.randomUUID(), label: '列' + (columns.length + 1), type: 'text' }]);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
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
              <select value={type} onChange={(e) => setType(e.target.value as SectionType)}
                className="w-full px-2 py-1.5 rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] focus:outline-none">
                {(Object.keys(TYPE_LABELS) as SectionType[]).map((t) => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-[var(--c-fg-3)]">幅</label>
              <select value={width} onChange={(e) => setWidth(e.target.value as SectionWidth)}
                className="w-full px-2 py-1.5 rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] focus:outline-none">
                <option value="narrow">狭い(1)</option>
                <option value="auto">通常(2)</option>
                <option value="w3">やや広(3)</option>
                <option value="wide">広い(4)</option>
                <option value="w5">特広(5)</option>
                <option value="full">全幅(12)</option>
              </select>
            </div>
          </div>

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
              <label className="text-xs text-[var(--c-fg-3)]">カウント方法</label>
              <div className="flex gap-2 mt-1">
                {(['calendar', 'business'] as const).map((m) => (
                  <label key={m} className="flex items-center gap-1 cursor-pointer">
                    <input type="radio" value={m} checked={countdownMode === m} onChange={() => setCountdownMode(m)} />
                    <span className="text-sm text-[var(--c-fg)]">{m === 'calendar' ? 'カレンダー日数' : '営業日'}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {type === 'command_builder' && (
            <>
              <div>
                <label className="text-xs text-[var(--c-fg-3)]">テンプレート（{'{INPUT}'} = 入力値）</label>
                <input value={cmdTemplate} onChange={(e) => setCmdTemplate(e.target.value)} placeholder="https://example.com/{INPUT}"
                  className="w-full px-3 py-1.5 rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] font-mono text-sm focus:outline-none focus:border-[var(--c-accent)]" />
              </div>
              <div>
                <label className="text-xs text-[var(--c-fg-3)]">アクション</label>
                <div className="flex gap-2 mt-1">
                  {(['copy', 'open'] as const).map((m) => (
                    <label key={m} className="flex items-center gap-1 cursor-pointer">
                      <input type="radio" value={m} checked={actionMode === m} onChange={() => setActionMode(m)} />
                      <span className="text-sm text-[var(--c-fg)]">{m === 'copy' ? 'コピー' : '開く'}</span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}

          {type === 'table' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-[var(--c-fg-3)]">列定義</label>
                <button onClick={addColumn} className="text-xs px-2 py-0.5 rounded bg-[var(--c-accent)] text-white">追加</button>
              </div>
              <div className="space-y-1">
                {columns.map((col, i) => (
                  <div key={col.id} className="flex gap-1 items-center">
                    <input value={col.label} onChange={(e) => {
                      const next = [...columns]; next[i] = { ...col, label: e.target.value }; setColumns(next);
                    }} className="flex-1 px-2 py-1 rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] text-sm focus:outline-none" />
                    <select value={col.type} onChange={(e) => {
                      const next = [...columns]; next[i] = { ...col, type: e.target.value as 'text' | 'copy' | 'link' }; setColumns(next);
                    }} className="px-1 py-1 rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] text-xs focus:outline-none">
                      <option value="text">テキスト</option>
                      <option value="copy">コピー</option>
                      <option value="link">リンク</option>
                    </select>
                    <button onClick={() => setColumns(columns.filter((_, j) => j !== i))}
                      className="p-1 rounded hover:bg-[var(--c-bg-2)] text-[var(--c-fg-3)]"><Trash2Icon size={12} /></button>
                  </div>
                ))}
              </div>
              <div className="mt-2">
                <label className="text-xs text-[var(--c-fg-3)]">ページサイズ（0=無制限）</label>
                <input value={pageSize} onChange={(e) => setPageSize(e.target.value)} type="number" min="0"
                  className="w-full px-3 py-1.5 rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] focus:outline-none focus:border-[var(--c-accent)]" />
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--c-border)]">
          {section?.id ? (
            <button onClick={handleDelete} className="px-3 py-1.5 rounded border border-red-300 text-red-500 text-sm hover:bg-red-50 dark:hover:bg-red-950">削除</button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 rounded border border-[var(--c-border)] text-sm text-[var(--c-fg-2)]">キャンセル</button>
            <button onClick={handleSave} className="px-3 py-1.5 rounded bg-[var(--c-accent)] text-white text-sm">保存</button>
          </div>
        </div>
      </div>
    </div>
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

function ItemManagerModal({ section, items, onClose, onChanged }: ItemManagerModalProps) {
  const toast = useToast();
  const [tab, setTab] = useState<'list' | 'add' | 'bulk'>('list');
  const [editingItem, setEditingItem] = useState<DashboardItem | null>(null);
  // フォーム
  const [label, setLabel]   = useState('');
  const [hint,  setHint]    = useState('');
  const [value, setValue]   = useState('');
  const [emoji, setEmoji]   = useState('📄');
  const [rowData, setRowData] = useState<Record<string, string>>({});
  const [bulkText, setBulkText] = useState('');

  const columns = section.columns || [];

  function resetForm() {
    setLabel(''); setHint(''); setValue(''); setEmoji('📄'); setRowData({});
    setEditingItem(null);
  }

  function loadEdit(item: DashboardItem) {
    setEditingItem(item);
    setLabel(item.label);
    setHint(item.hint || '');
    setValue(item.value);
    setEmoji(item.emoji || '📄');
    setRowData(item.row_data || {});
    setTab('add');
  }

  async function handleSave() {
    if (!label && section.type !== 'table') return;
    const autoType = isUrl(value) ? 'link' : 'copy';
    if (editingItem?.id) {
      await dashboardDB.updateItem({
        ...editingItem, label, hint, value, emoji,
        row_data: section.type === 'table' ? rowData : undefined,
        item_type: section.type === 'table' ? 'row' : autoType,
      });
    } else {
      const pos = items.length;
      await dashboardDB.addItem({
        section_id: section.id!, position: pos, label, hint, value, emoji,
        row_data: section.type === 'table' ? rowData : undefined,
        item_type: section.type === 'table' ? 'row' : autoType,
        use_count: 0,
      });
    }
    onChanged();
    resetForm();
    setTab('list');
  }

  async function handleDelete(id: number) {
    if (!confirm('削除しますか？')) return;
    await dashboardDB.deleteItem(id);
    onChanged();
  }

  async function handleBulkImport() {
    const lines = bulkText.split('\n').filter((l) => l.trim() && !l.startsWith('#'));
    let pos = items.length;
    for (const line of lines) {
      const parts = line.split('\t');
      if (section.type === 'grid') {
        const [emo, lbl, val] = parts;
        await dashboardDB.addItem({ section_id: section.id!, position: pos++, emoji: emo || '📄', label: lbl || '', value: val || '', item_type: isUrl(val || '') ? 'link' : 'copy', use_count: 0 });
      } else if (section.type === 'table') {
        const rdata: Record<string, string> = {};
        columns.forEach((c, i) => { rdata[c.id] = parts[i] || ''; });
        await dashboardDB.addItem({ section_id: section.id!, position: pos++, label: parts[0] || '', value: '', item_type: 'row', row_data: rdata, use_count: 0 });
      } else if (section.type === 'countdown') {
        const [lbl, val] = parts;
        await dashboardDB.addItem({ section_id: section.id!, position: pos++, label: lbl || '', value: val || '', item_type: 'copy', use_count: 0 });
      } else {
        const [lbl, hnt, val] = parts;
        await dashboardDB.addItem({ section_id: section.id!, position: pos++, label: lbl || '', hint: hnt || '', value: val || '', item_type: isUrl(val || '') ? 'link' : 'copy', use_count: 0 });
      }
    }
    toast.success(`${lines.length}件追加しました`);
    onChanged();
    setBulkText('');
    setTab('list');
  }

  async function moveItem(item: DashboardItem, dir: 'up' | 'down') {
    const idx = items.findIndex((i) => i.id === item.id);
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= items.length) return;
    const a = { ...items[idx],    position: items[swapIdx].position };
    const b = { ...items[swapIdx], position: items[idx].position };
    await dashboardDB.updateItem(a);
    await dashboardDB.updateItem(b);
    onChanged();
  }

  const bulkPlaceholder = section.type === 'grid'
    ? '絵文字\tカード名\t値\n（各行 Tab 区切り）'
    : section.type === 'table'
    ? columns.map((c) => c.label).join('\t') + '\n（各行 Tab 区切り）'
    : section.type === 'countdown'
    ? 'マイルストーン名\tYYYY-MM-DD\n（各行 Tab 区切り）'
    : 'ラベル\tヒント\t値\n（各行 Tab 区切り）';

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-10 px-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`${section.title} アイテム管理`}
        className="bg-[var(--c-bg)] rounded-xl border border-[var(--c-border)] w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--c-border)]">
          <h3 className="font-semibold text-[var(--c-fg)]">{section.icon} {section.title} — アイテム管理</h3>
          <button onClick={onClose} aria-label="閉じる" className="p-1 rounded hover:bg-[var(--c-bg-2)] text-[var(--c-fg-3)]"><XIcon size={16} aria-hidden="true" /></button>
        </div>
        {/* タブ */}
        <div className="flex border-b border-[var(--c-border)]">
          {(['list', 'add', 'bulk'] as const).map((t) => (
            <button key={t} onClick={() => { setTab(t); if (t !== 'add') resetForm(); }}
              className={`px-4 py-2 text-sm border-b-2 transition-colors ${tab === t ? 'border-[var(--c-accent)] text-[var(--c-accent)]' : 'border-transparent text-[var(--c-fg-2)]'}`}>
              {t === 'list' ? '一覧' : t === 'add' ? (editingItem ? '編集' : '追加') : '一括追加'}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'list' && (
            <div className="space-y-1">
              {items.map((item, idx) => (
                <div key={item.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[var(--c-bg-2)] group">
                  {section.type === 'grid' && <span>{item.emoji}</span>}
                  <span className="flex-1 text-sm text-[var(--c-fg)] truncate">{item.label}</span>
                  {section.type !== 'table' && <span className="text-xs text-[var(--c-fg-3)] truncate max-w-[120px]">{item.value}</span>}
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => moveItem(item, 'up')} disabled={idx === 0} className="p-0.5 rounded hover:bg-[var(--c-bg)] disabled:opacity-30"><ArrowUpIcon size={12} /></button>
                    <button onClick={() => moveItem(item, 'down')} disabled={idx === items.length - 1} className="p-0.5 rounded hover:bg-[var(--c-bg)] disabled:opacity-30"><ArrowDownIcon size={12} /></button>
                    <button onClick={() => loadEdit(item)} className="p-0.5 rounded hover:bg-[var(--c-bg)] text-[var(--c-fg-3)]"><PencilIcon size={12} /></button>
                    <button onClick={() => handleDelete(item.id!)} className="p-0.5 rounded hover:bg-[var(--c-bg)] text-red-400"><Trash2Icon size={12} /></button>
                  </div>
                </div>
              ))}
              {items.length === 0 && <p className="text-xs text-[var(--c-fg-3)] text-center py-4">アイテムがありません</p>}
            </div>
          )}
          {tab === 'add' && (
            <div className="space-y-3">
              {section.type === 'table' ? (
                columns.map((col) => (
                  <div key={col.id}>
                    <label className="text-xs text-[var(--c-fg-3)]">{col.label}</label>
                    <input value={rowData[col.id] || ''} onChange={(e) => setRowData({ ...rowData, [col.id]: e.target.value })}
                      className="w-full px-3 py-1.5 rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] focus:outline-none focus:border-[var(--c-accent)]" />
                  </div>
                ))
              ) : (
                <>
                  {section.type === 'grid' && (
                    <div>
                      <label className="text-xs text-[var(--c-fg-3)]">絵文字</label>
                      <input value={emoji} onChange={(e) => setEmoji(e.target.value)}
                        className="w-16 px-2 py-1.5 rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-center text-lg focus:outline-none" />
                    </div>
                  )}
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
                  {section.type !== 'checklist' && (
                    <div>
                      <label className="text-xs text-[var(--c-fg-3)]">
                        {section.type === 'countdown' ? '目標日 (YYYY-MM-DD)' : '値（URL またはコピーテキスト）'}
                      </label>
                      <input value={value} onChange={(e) => setValue(e.target.value)}
                        type={section.type === 'countdown' ? 'date' : 'text'}
                        className="w-full px-3 py-1.5 rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] focus:outline-none focus:border-[var(--c-accent)]" />
                    </div>
                  )}
                </>
              )}
              <div className="flex gap-2 justify-end pt-2">
                <button onClick={() => { resetForm(); setTab('list'); }}
                  className="px-3 py-1.5 rounded border border-[var(--c-border)] text-sm text-[var(--c-fg-2)]">キャンセル</button>
                <button onClick={handleSave}
                  className="px-3 py-1.5 rounded bg-[var(--c-accent)] text-white text-sm">{editingItem ? '更新' : '追加'}</button>
              </div>
            </div>
          )}
          {tab === 'bulk' && (
            <div className="space-y-3">
              <textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={bulkPlaceholder}
                className="w-full min-h-[200px] px-3 py-2 rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] font-mono text-sm resize-y focus:outline-none focus:border-[var(--c-accent)]"
              />
              <div className="flex justify-end">
                <button onClick={handleBulkImport}
                  className="px-4 py-1.5 rounded bg-[var(--c-accent)] text-white text-sm">一括追加</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// プリセット設定パネル
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface PresetPanelProps {
  instanceId: string;
  presets: DashboardPreset[];
  activePresetId: number | null;
  bindConfig: { varNames: string[] };
  onChanged: () => void;
  onActiveChange: (id: number | null) => void;
}

function PresetPanel({ instanceId, presets, activePresetId, bindConfig, onChanged, onActiveChange }: PresetPanelProps) {
  const [editingPreset, setEditingPreset] = useState<DashboardPreset | null>(null);
  const [varNames, setVarNames] = useState<string[]>(bindConfig.varNames);
  const [newVarName, setNewVarName] = useState('');

  async function saveVarNames() {
    await dashboardDB.setAppConfig('bind_config', instanceId, { varNames });
    onChanged();
  }

  async function addPreset() {
    const pos = presets.length;
    const id = await dashboardDB.addPreset({ instance_id: instanceId, name: '新しいプリセット', position: pos, values: {} }, instanceId);
    onChanged();
    const newPreset = await dashboardDB.presets.get(id);
    if (newPreset) setEditingPreset(newPreset);
  }

  async function savePreset(preset: DashboardPreset) {
    await dashboardDB.updatePreset(preset);
    setEditingPreset(null);
    onChanged();
  }

  async function deletePreset(id: number) {
    await dashboardDB.deletePreset(id);
    if (activePresetId === id) onActiveChange(null);
    onChanged();
  }

  if (editingPreset) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setEditingPreset(null)} className="p-1 rounded hover:bg-[var(--c-bg-2)]"><XIcon size={14} /></button>
          <span className="font-medium text-sm text-[var(--c-fg)]">{editingPreset.name}</span>
        </div>
        <div>
          <label className="text-xs text-[var(--c-fg-3)]">プリセット名</label>
          <input value={editingPreset.name} onChange={(e) => setEditingPreset({ ...editingPreset, name: e.target.value })}
            className="w-full px-3 py-1.5 rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] focus:outline-none" />
        </div>
        {varNames.map((vn) => (
          <div key={vn}>
            <label className="text-xs text-[var(--c-fg-3)]">{'{' + vn + '}'}</label>
            <input
              value={editingPreset.values?.[vn] ?? ''}
              onChange={(e) => setEditingPreset({ ...editingPreset, values: { ...editingPreset.values, [vn]: e.target.value } })}
              className="w-full px-3 py-1.5 rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] focus:outline-none focus:border-[var(--c-accent)]"
            />
          </div>
        ))}
        <button onClick={() => savePreset(editingPreset)}
          className="w-full py-1.5 rounded bg-[var(--c-accent)] text-white text-sm">保存</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* バインド変数名設定 */}
      <div>
        <label className="text-xs font-medium text-[var(--c-fg-2)]">バインド変数名</label>
        <div className="mt-1 space-y-1">
          {varNames.map((vn, i) => (
            <div key={i} className="flex gap-1 items-center">
              <span className="flex-1 text-sm font-mono text-[var(--c-fg)]">{'{' + vn + '}'}</span>
              <button onClick={() => { const next = varNames.filter((_, j) => j !== i); setVarNames(next); }} className="p-1 text-[var(--c-fg-3)]"><XIcon size={12} /></button>
            </div>
          ))}
          <div className="flex gap-1">
            <input value={newVarName} onChange={(e) => setNewVarName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && newVarName.trim()) { setVarNames([...varNames, newVarName.trim()]); setNewVarName(''); } }}
              placeholder="変数名（Enter で追加）" className="flex-1 px-2 py-1 rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] text-sm focus:outline-none" />
            <button onClick={() => { if (newVarName.trim()) { setVarNames([...varNames, newVarName.trim()]); setNewVarName(''); } }}
              className="px-2 py-1 rounded bg-[var(--c-accent)] text-white text-sm">追加</button>
          </div>
        </div>
        <button onClick={saveVarNames} className="mt-1 text-xs px-2 py-0.5 rounded border border-[var(--c-accent)] text-[var(--c-accent)]">変数名を保存</button>
      </div>
      {/* プリセット一覧 */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-[var(--c-fg-2)]">プリセット</label>
          <button onClick={addPreset} className="text-xs px-2 py-0.5 rounded bg-[var(--c-accent)] text-white">追加</button>
        </div>
        <div className="space-y-1">
          {presets.map((p) => (
            <div key={p.id} className="flex items-center gap-2 px-2 py-1 rounded border border-[var(--c-border)] hover:bg-[var(--c-bg-2)]">
              <input type="radio" name="active-preset" checked={activePresetId === p.id} onChange={() => onActiveChange(p.id ?? null)} />
              <span className="flex-1 text-sm text-[var(--c-fg)]">{p.name}</span>
              <button onClick={() => setEditingPreset(p)} className="p-1 text-[var(--c-fg-3)] hover:text-[var(--c-fg)]"><PencilIcon size={12} /></button>
              <button onClick={() => deletePreset(p.id!)} className="p-1 text-red-400 hover:text-red-500"><Trash2Icon size={12} /></button>
            </div>
          ))}
          {presets.length === 0 && <p className="text-xs text-[var(--c-fg-3)] text-center py-2">プリセットがありません</p>}
        </div>
        {activePresetId != null && (
          <button onClick={() => onActiveChange(null)} className="mt-1 text-xs text-[var(--c-fg-3)] hover:text-[var(--c-fg)]">選択解除</button>
        )}
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// メインコンポーネント
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function DashboardPage() {
  const instanceId = useTabLabel();
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
  const [bindConfig, setBindConfig] = useState<{ varNames: string[] }>({ varNames: [] });

  // モーダル状態
  const [editingSection, setEditingSection] = useState<DashboardSection | null | undefined>(undefined);  // undefined = 閉じてる, null = 新規
  const [itemMgrSection, setItemMgrSection] = useState<DashboardSection | null>(null);
  // sections の最新値を常に参照できる ref（安定コールバックから参照するため）
  const sectionsRef = useRef<DashboardSection[]>([]);
  const [showPresets, setShowPresets] = useState(false);

  // DnD
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

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
  const handleOpenItemMgr = useCallback((id: number) => {
    setItemMgrSection(sectionsRef.current.find((s) => s.id === id) || null);
  }, []);

  const handleEditSection = useCallback((s: DashboardSection) => {
    setEditingSection(s);
  }, []);

  // ── エクスポート ──────────────────────────────────────
  async function handleExport() {
    const data = await dashboardDB.exportInstance(instanceId);
    const json = JSON.stringify({ type: 'dashboard_export', version: 2, instanceId, ...data }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `dashboard_${instanceId || 'default'}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
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

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[var(--c-bg)]">
      {/* ヘッダーバー */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--c-border)] shrink-0">
        {/* バインド変数プリセット選択 */}
        {presets.length > 0 && (
          <div className="flex gap-1 flex-wrap flex-1">
            <button onClick={() => changeActivePreset(null)}
              className={`px-2 py-0.5 rounded text-xs border ${activePresetId == null ? 'bg-[var(--c-accent)] text-white border-[var(--c-accent)]' : 'border-[var(--c-border)] text-[var(--c-fg-2)]'}`}>
              なし
            </button>
            {presets.map((p) => (
              <button key={p.id} onClick={() => changeActivePreset(p.id ?? null)}
                className={`px-2 py-0.5 rounded text-xs border ${activePresetId === p.id ? 'bg-[var(--c-accent)] text-white border-[var(--c-accent)]' : 'border-[var(--c-border)] text-[var(--c-fg-2)]'}`}>
                {p.name}
              </button>
            ))}
          </div>
        )}
        <div className="flex-1" />
        <button onClick={() => setShowPresets(!showPresets)} title="バインド変数設定"
          className={`p-1.5 rounded border text-xs ${showPresets ? 'bg-[var(--c-accent)] text-white border-[var(--c-accent)]' : 'border-[var(--c-border)] text-[var(--c-fg-3)] hover:text-[var(--c-fg)]'}`}>
          {'{'}x{'}'}
        </button>
        <button onClick={handleExport} title="エクスポート"
          className="p-1.5 rounded border border-[var(--c-border)] text-[var(--c-fg-3)] hover:text-[var(--c-fg)]">
          <DownloadIcon size={14} />
        </button>
        <label title="インポート"
          className="p-1.5 rounded border border-[var(--c-border)] text-[var(--c-fg-3)] hover:text-[var(--c-fg)] cursor-pointer">
          <UploadIcon size={14} />
          <input ref={importRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
        </label>
        <button onClick={() => setEditingSection(null)} title="セクション追加"
          className="flex items-center gap-1 px-3 py-1.5 rounded bg-[var(--c-accent)] text-white text-xs">
          <PlusIcon size={14} />
          <span>追加</span>
        </button>
      </div>

      {/* バインド変数プリセットパネル */}
      {showPresets && (
        <div className="border-b border-[var(--c-border)] p-4 bg-[var(--c-bg-2)]">
          <PresetPanel
            instanceId={instanceId}
            presets={presets}
            activePresetId={activePresetId}
            bindConfig={bindConfig}
            onChanged={load}
            onActiveChange={changeActivePreset}
          />
        </div>
      )}

      {/* セクショングリッド */}
      <div className="flex-1 overflow-y-auto p-4">
        {sections.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-[var(--c-fg-3)]">
            <p className="text-sm">セクションがありません</p>
            <button onClick={() => setEditingSection(null)}
              className="flex items-center gap-1 px-4 py-2 rounded bg-[var(--c-accent)] text-white text-sm">
              <PlusIcon size={14} />セクションを追加
            </button>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={sections.map((s) => s.id!)} strategy={verticalListSortingStrategy}>
              <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(12, 1fr)' }}>
                {sections.map((section) => (
                  <SectionCard
                    key={section.id}
                    section={section}
                    items={itemsMap[section.id!] || []}
                    presets={presets}
                    activePresetId={activePresetId}
                    onItemsChange={() => reloadItems(section.id)}
                    onOpenItemMgr={handleOpenItemMgr}
                    onEditSection={handleEditSection}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* セクション編集/追加モーダル */}
      {editingSection !== undefined && (
        <SectionEditModal
          section={editingSection}
          instanceId={instanceId}
          onClose={() => setEditingSection(undefined)}
          onSaved={load}
          onDeleted={(id) => setSections((prev) => prev.filter((s) => s.id !== id))}
        />
      )}

      {/* アイテム管理モーダル */}
      {itemMgrSection && (
        <ItemManagerModal
          section={itemMgrSection}
          items={itemsMap[itemMgrSection.id!] || []}
          onClose={() => setItemMgrSection(null)}
          onChanged={() => { reloadItems(itemMgrSection.id!); }}
        />
      )}
    </div>
  );
}
