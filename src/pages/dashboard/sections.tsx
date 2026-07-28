// ==================================================
// dashboard/sections — セクションコンポーネント群（DashboardPage から分割）
// ==================================================
import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MarkdownBody } from '../../components/MarkdownBody';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  PlusIcon, ChevronDownIcon,
  GripVerticalIcon, Trash2Icon, CopyIcon, ExternalLinkIcon,
  XIcon, PencilIcon,
  RefreshCwIcon, ClockIcon, Columns3Icon, ArrowUpDownIcon,
  CalendarDaysIcon, BriefcaseIcon, SearchIcon, BanIcon,
  HelpCircleIcon, BookmarkIcon, CheckIcon, SaveIcon,
} from 'lucide-react';
import {
  dashboardDB,
  type DashboardSection, type DashboardItem, type DashboardPreset,
  type SectionPreset, type TableView,
} from '../../db/dashboard_db';
import {
  parseTableQuery, findOperator, needsQuote, splitTopLevelTerms, describeTerm, isBalanced,
  type FilterColumn, type TermChip,
} from '../../core/table_filter';
import {
  resolveDateVars, resolveColumnRefs, resolveBindVars, resolveAll,
  isUrl, countCalendarDays, countBusinessDaysSimple, getResetPeriodKey,
  TABLE_ACTIVE_PRESET_PFX, LIST_ACTIVE_PRESET_PFX, GRID_ACTIVE_PRESET_PFX,
} from '../../core/dashboard_resolve';
import { lsGet, lsSet, lsJson } from '../../core/utils';
import { useToast } from '../../components/Toast';
import { DatePicker } from '../../components/DatePicker';
import { Select } from '../../components/Select';
import { Clipboard } from '../../core/clipboard';
import { Opener } from '../../core/opener';
import { ActivityLogger } from '../../core/activity_logger';
import {
  CMD_HISTORY_PREFIX, COLLAPSE_PREFIX, CHECKLIST_STATE_PREFIX, CHECKLIST_DATE_PREFIX,
  TABLE_COL_HIDDEN_PREFIX, TABLE_COL_ORDER_PREFIX, TABLE_SORT_PREFIX, TABLE_QUERY_PREFIX,
  TABLE_ACTIVE_VIEW_PREFIX, SORT_BY_USAGE_PREFIX,
  EDGE_TO_EDGE_TYPES, CMD_BTN_COLORS, CMD_BTN_STYLE,
  WIDTH_COLS, type BindUiType,
} from './shared';

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

export interface SectionProps {
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

// ── クエリ検索ボックス（オートコンプリート付き） ───────────
// complete: 挿入するだけで term として完結する候補（確定してチップ化してよい）
interface QuerySugg { text: string; hint: string; insert: string; complete?: boolean }

// 入力中フラグメントから列名／演算子のサジェストを生成
function buildQuerySuggestions(frag: string, columns: FilterColumn[]): QuerySugg[] {
  let prefix = '';
  let body = frag;
  if (body.startsWith('-')) { prefix = '-'; body = body.slice(1); }

  const op = findOperator(body);
  if (op) {
    // 値位置: ':' のときだけ empty / !empty を補助
    if (op.op === ':') {
      const colPart = body.slice(0, op.idx);
      const valPart = body.slice(op.idx + 1).toLowerCase();
      const base = `${prefix}${colPart}:`;
      const out: QuerySugg[] = [];
      if ('empty'.startsWith(valPart)) out.push({ text: ':empty', hint: '空', insert: `${base}empty`, complete: true });
      if ('!empty'.startsWith(valPart) || valPart === '') out.push({ text: ':!empty', hint: '空でない', insert: `${base}!empty`, complete: true });
      return out;
    }
    return [];
  }

  const lc = body.toLowerCase();
  // 列名を打ち切った直後 → 演算子メニューを提示
  const exact = columns.find((c) => c.label.toLowerCase() === lc);
  if (exact) {
    const q = needsQuote(exact.label) ? `"${exact.label}"` : exact.label;
    return [
      { text: `${exact.label} : 含む`,       hint: '部分一致', insert: `${prefix}${q}:` },
      { text: `${exact.label} = 完全一致`,   hint: '一致',     insert: `${prefix}${q}=` },
      { text: `${exact.label} ^= 前方一致`,  hint: '前方',     insert: `${prefix}${q}^=` },
      { text: `${exact.label} $= 後方一致`,  hint: '後方',     insert: `${prefix}${q}$=` },
      { text: `${exact.label} ~ 正規表現`,   hint: '正規表現', insert: `${prefix}${q}~/` },
      { text: `${exact.label} : 空`,         hint: '空',       insert: `${prefix}${q}:empty`, complete: true },
      { text: `${exact.label} : 空でない`,   hint: '空でない', insert: `${prefix}${q}:!empty`, complete: true },
    ];
  }

  // 列名候補
  const out: QuerySugg[] = [];
  for (const c of columns) {
    if (!lc || c.label.toLowerCase().includes(lc)) {
      const q = needsQuote(c.label) ? `"${c.label}"` : c.label;
      out.push({ text: c.label, hint: '列で絞り込み', insert: `${prefix}${q}` });
    }
  }
  if (body && 'or'.startsWith(lc)) out.push({ text: 'OR', hint: 'または', insert: 'OR ' });
  return out;
}

// 確定済み条件 1 件を表すチップ
function FilterChipView({ chip, onEdit, onRemove }: {
  chip: TermChip;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const tone = chip.negate
    ? 'border-[var(--c-danger)] bg-[var(--c-danger-bg)] text-[var(--c-danger)]'
    : 'border-[var(--c-border)] bg-[var(--c-bg-2)] text-[var(--c-fg)] hover:border-[var(--c-accent)]';
  return (
    <span className={`inline-flex items-center h-[20px] rounded-full border text-[11px] max-w-[240px] shrink-0 transition-colors ${tone}`}>
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onEdit}
        title={`${chip.raw}（クリックで編集）`}
        className="inline-flex items-center gap-1 min-w-0 pl-1.5 pr-1 h-full rounded-l-full focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--c-accent)]">
        {chip.negate
          ? <BanIcon size={10} className="shrink-0 opacity-80" />
          : chip.kind === 'free' && <SearchIcon size={10} className="shrink-0 opacity-60" />}
        {chip.colLabel && <span className="shrink-0 opacity-70 truncate max-w-[80px]">{chip.colLabel}</span>}
        {chip.opLabel && <span className="shrink-0 font-mono opacity-60">{chip.opLabel}</span>}
        <span className={`truncate font-medium ${chip.kind === 'expr' ? 'font-mono' : ''}`}>{chip.value}</span>
      </button>
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onRemove} title="この条件を削除"
        className="shrink-0 inline-flex items-center justify-center w-[18px] h-full rounded-r-full opacity-50 hover:opacity-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--c-accent)]">
        <XIcon size={10} />
      </button>
    </span>
  );
}

/** 折りたたみ時に表示するチップの最大数 */
const CHIP_COLLAPSE_LIMIT = 3;

function TableQueryInput({ value, onChange, columns, error, count }: {
  value: string;
  onChange: (q: string) => void;
  columns: FilterColumn[];
  error?: string;
  count: number | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const helpBtnRef = useRef<HTMLButtonElement>(null);
  const helpRef = useRef<HTMLDivElement>(null);
  const [caret, setCaret] = useState(0);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [selIdx, setSelIdx] = useState(0);
  const [popStyle, setPopStyle] = useState<React.CSSProperties>({ visibility: 'hidden' });
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpStyle, setHelpStyle] = useState<React.CSSProperties>({ visibility: 'hidden' });

  // ── チップ（確定済み）と入力中テキストの分離 ──
  // クエリ文字列が single source of truth。確定済み term はチップとして描画し、
  // input 要素には未確定の 1 term だけを保持する。
  const [terms, setTerms] = useState<string[]>(() => splitTopLevelTerms(value));
  const [tail, setTail] = useState('');
  const [expanded, setExpanded] = useState(false);
  const emitted = useRef(value);

  // 外部からクエリが差し替わったとき（ビュー適用・全クリア等）はチップを作り直す
  useEffect(() => {
    if (value === emitted.current) return;
    emitted.current = value;
    setTerms(splitTopLevelTerms(value));
    setTail('');
  }, [value]);

  function emit(nextTerms: string[], nextTail: string) {
    setTerms(nextTerms);
    setTail(nextTail);
    const q = [...nextTerms, nextTail].join(' ').trim();
    emitted.current = q;
    onChange(q);
  }

  /** 入力中テキストを確定してチップにする（確定できなければ false） */
  function commitTail(): boolean {
    const t = tail.trim();
    if (!t || !isBalanced(t)) return false;
    emit([...terms, ...splitTopLevelTerms(t)], '');
    setCaret(0);
    return true;
  }

  function editChip(idx: number) {
    // 編集対象を入力欄に戻す。入力中テキストがあれば先にチップ化して退避
    const rest = terms.filter((_, i) => i !== idx);
    const raw = terms[idx];
    const base = tail.trim() && isBalanced(tail.trim()) ? [...rest, ...splitTopLevelTerms(tail.trim())] : rest;
    emit(base, raw);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) { el.focus(); el.setSelectionRange(raw.length, raw.length); }
      setCaret(raw.length);
    });
  }

  const chips = useMemo(() => terms.map((t) => describeTerm(t, columns)), [terms, columns]);
  const overflowing = !expanded && chips.length > CHIP_COLLAPSE_LIMIT;
  const shownChips = overflowing ? chips.slice(0, CHIP_COLLAPSE_LIMIT) : chips;

  const frag = useMemo(() => {
    let start = 0;
    for (let i = caret - 1; i >= 0; i--) {
      const c = tail[i];
      if (c === ' ' || c === '(' || c === ')') { start = i + 1; break; }
    }
    return { start, text: tail.slice(start, caret) };
  }, [tail, caret]);

  const suggestions = useMemo(() => buildQuerySuggestions(frag.text, columns), [frag.text, columns]);
  useEffect(() => { setSelIdx(0); }, [frag.text]);

  const showSug = focused && !dismissed && suggestions.length > 0;

  useLayoutEffect(() => {
    if (!showSug || !boxRef.current) return;
    const rect = boxRef.current.getBoundingClientRect();
    setPopStyle({ position: 'fixed', top: rect.bottom + 4, left: rect.left, width: rect.width, zIndex: 2000, visibility: 'visible' });
  }, [showSug, suggestions.length, tail, chips.length, expanded]);

  useLayoutEffect(() => {
    if (!helpOpen || !helpBtnRef.current) return;
    const rect = helpBtnRef.current.getBoundingClientRect();
    const W = 320;
    let left = rect.right - W;
    if (left < 8) left = 8;
    setHelpStyle({ position: 'fixed', top: rect.bottom + 4, left, width: W, zIndex: 2001, visibility: 'visible' });
  }, [helpOpen]);

  useEffect(() => {
    if (!helpOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!helpBtnRef.current?.contains(e.target as Node) && !helpRef.current?.contains(e.target as Node)) setHelpOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [helpOpen]);

  function syncCaret() {
    const el = inputRef.current;
    if (el) setCaret(el.selectionStart ?? 0);
  }

  function accept(s: QuerySugg) {
    const before = tail.slice(0, frag.start);
    const after = tail.slice(caret);
    const newTail = before + s.insert + after;
    setDismissed(false);
    // term として完結する候補（:empty 等）はそのままチップ化
    const t = newTail.trim();
    if (s.complete && t && isBalanced(t)) {
      emit([...terms, ...splitTopLevelTerms(t)], '');
      setCaret(0);
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }
    const newCaret = (before + s.insert).length;
    emit(terms, newTail);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) { el.focus(); el.setSelectionRange(newCaret, newCaret); }
      setCaret(newCaret);
    });
  }

  // 確定は Enter（と blur）のみ。スペースでは確定しない
  // ── 値にスペースを含められること、IME の変換スペースと衝突しないことを優先
  function handleChange(next: string) {
    setDismissed(false);
    emit(terms, next);
    setCaret(inputRef.current?.selectionStart ?? next.length);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (showSug) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelIdx((i) => (i + 1) % suggestions.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelIdx((i) => (i - 1 + suggestions.length) % suggestions.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (e.nativeEvent.isComposing) return;
        e.preventDefault(); accept(suggestions[Math.min(selIdx, suggestions.length - 1)]); return;
      }
      if (e.key === 'Escape') { e.preventDefault(); setDismissed(true); return; }
    }
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); commitTail(); return; }
    // 入力が空の Backspace → 直前のチップを入力欄に戻して編集
    if (e.key === 'Backspace' && tail === '' && terms.length > 0) { e.preventDefault(); editChip(terms.length - 1); }
  }

  const dropdown = showSug ? createPortal(
    <div ref={popRef} style={popStyle}
      className="bg-[var(--c-bg)] border border-[var(--c-border)] rounded-xl shadow-[0_8px_32px_rgba(0,0,0,.16)] overflow-hidden py-1 max-h-72 overflow-y-auto">
      {suggestions.map((s, i) => (
        <button key={s.text + i} type="button"
          onMouseDown={(e) => { e.preventDefault(); accept(s); }}
          onMouseEnter={() => setSelIdx(i)}
          className={`w-full flex items-center justify-between gap-3 px-3 py-1.5 text-left text-xs transition-colors ${
            i === selIdx ? 'bg-[var(--c-accent-dim)] text-[var(--c-accent)]' : 'text-[var(--c-fg)] hover:bg-[var(--c-bg-2)]'
          }`}>
          <span className="truncate">{s.text}</span>
          <span className="shrink-0 text-[10px] text-[var(--c-fg-3)]">{s.hint}</span>
        </button>
      ))}
    </div>,
    document.body,
  ) : null;

  const help = helpOpen ? createPortal(
    <div ref={helpRef} style={helpStyle}
      className="bg-[var(--c-bg)] border border-[var(--c-border)] rounded-xl shadow-[0_8px_32px_rgba(0,0,0,.16)] p-3 text-xs text-[var(--c-fg-2)] space-y-1.5">
      <div className="font-semibold text-[var(--c-fg)] mb-1">クエリの書き方</div>
      {[
        ['API', '全列にAPIを含む'],
        ['列名:値', 'その列が値を含む'],
        ['A B', 'スペース＝AND（両方）'],
        ['A OR B', 'OR（どちらか）'],
        ['(A OR B) C', '括弧でグループ化'],
        ['-列名:値', '先頭 - で否定'],
        ['列名=値', '完全一致'],
        ['列名^=値 / 列名$=値', '前方 / 後方一致'],
        ['列名~/正規表現/', '正規表現'],
        ['列名:empty / :!empty', '空 / 空でない'],
      ].map(([syntax, desc]) => (
        <div key={syntax} className="flex items-baseline gap-2">
          <code className="shrink-0 px-1 py-0.5 rounded bg-[var(--c-bg-2)] text-[var(--c-accent)] font-mono text-[10px] whitespace-nowrap">{syntax}</code>
          <span className="text-[var(--c-fg-3)]">{desc}</span>
        </div>
      ))}
    </div>,
    document.body,
  ) : null;

  return (
    <div ref={boxRef} className="relative flex-1 flex items-center gap-1.5">
      <div
        onMouseDown={(e) => { if (e.target === e.currentTarget) inputRef.current?.focus(); }}
        className={`flex-1 flex items-center flex-wrap gap-1 min-h-7 py-[3px] px-2 rounded border bg-[var(--c-bg)] transition-colors cursor-text ${
          error ? 'border-[var(--c-danger,#e5484d)]' : 'border-[var(--c-border)] focus-within:border-[var(--c-accent)]'
        }`}>
        <SearchIcon size={12} className="shrink-0 text-[var(--c-fg-3)]" />
        {shownChips.map((chip, i) => (
          <FilterChipView key={`${chip.raw}-${i}`} chip={chip}
            onEdit={() => editChip(i)}
            onRemove={() => emit(terms.filter((_, j) => j !== i), tail)} />
        ))}
        {overflowing && (
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setExpanded(true)}
            title="残りの条件を表示"
            className="shrink-0 h-[20px] px-1.5 rounded-full border border-dashed border-[var(--c-border)] text-[11px] text-[var(--c-fg-3)] hover:border-[var(--c-accent)] hover:text-[var(--c-accent)] transition-colors">
            +{chips.length - CHIP_COLLAPSE_LIMIT}
          </button>
        )}
        {expanded && chips.length > CHIP_COLLAPSE_LIMIT && (
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setExpanded(false)}
            title="条件を折りたたむ"
            className="shrink-0 h-[20px] px-1.5 rounded-full border border-dashed border-[var(--c-border)] text-[11px] text-[var(--c-fg-3)] hover:border-[var(--c-accent)] hover:text-[var(--c-accent)] transition-colors">
            折りたたむ
          </button>
        )}
        <input
          ref={inputRef} type="text" value={tail}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onKeyUp={syncCaret}
          onClick={syncCaret}
          onFocus={() => { setFocused(true); setDismissed(false); }}
          onBlur={() => { setFocused(false); commitTail(); }}
          placeholder={chips.length > 0 ? '条件を追加（Enter で確定）' : 'フィルター（列名:値 / AND / OR / -否定 …）'}
          className="flex-1 min-w-[90px] h-[20px] bg-transparent text-[var(--c-fg)] text-xs focus:outline-none"
        />
        {(chips.length > 0 || tail) && (
          <button type="button" onMouseDown={(e) => e.preventDefault()}
            onClick={() => { emit([], ''); setExpanded(false); inputRef.current?.focus(); }}
            className="shrink-0 text-[var(--c-fg-3)] hover:text-[var(--c-fg)]" title="すべてクリア">
            <XIcon size={12} />
          </button>
        )}
      </div>
      {error ? (
        <span className="text-[10px] text-[var(--c-danger,#e5484d)] shrink-0 whitespace-nowrap">{error}</span>
      ) : count != null && (
        <span className="text-xs text-[var(--c-fg-3)] shrink-0 tabular-nums">{count}件</span>
      )}
      <button ref={helpBtnRef} type="button" onClick={() => setHelpOpen((v) => !v)}
        className={`shrink-0 transition-colors ${helpOpen ? 'text-[var(--c-accent)]' : 'text-[var(--c-fg-3)] hover:text-[var(--c-accent)]'}`}
        title="クエリの書き方">
        <HelpCircleIcon size={14} />
      </button>
      {dropdown}
      {help}
    </div>
  );
}

// ── 保存ビュー切替（ViewSwitcher） ─────────────────────────
// 1 ビュー行。マウス＝グリップで DnD、キーボード＝行フォーカス中の Alt+↑/↓ で並び替え
function SortableViewRow({ view, active, dirty, onApply, onUpdate, onDelete, onMove }: {
  view: TableView;
  active: boolean;
  dirty: boolean;
  onApply: () => void;
  onUpdate: () => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: view.id });
  return (
    <div ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className="group/vw flex items-center gap-1 px-1">
      <button {...attributes} {...listeners} tabIndex={-1} title="ドラッグで並び替え"
        className="shrink-0 p-0.5 text-[var(--c-fg-3)] cursor-grab active:cursor-grabbing opacity-0 group-hover/vw:opacity-100 transition-opacity touch-none">
        <GripVerticalIcon size={12} />
      </button>
      <button type="button" onClick={onApply} data-view-id={view.id}
        onKeyDown={(e) => {
          // Alt+↑/↓ で並び替え（テーブル行移動と同じキーバインド）
          if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
            e.preventDefault();
            onMove(e.key === 'ArrowUp' ? -1 : 1);
          }
        }}
        title={`${view.name}（Alt+↑/↓ で並び替え）`}
        className={`flex-1 min-w-0 flex items-center gap-2 px-1 py-1.5 text-left text-xs rounded hover:bg-[var(--c-bg-2)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--c-accent)] ${active ? 'text-[var(--c-accent)]' : 'text-[var(--c-fg)]'}`}>
        <span className="w-3 shrink-0">{active && <CheckIcon size={12} />}</span>
        <span className="truncate">{view.name}</span>
      </button>
      {active && dirty && (
        <button type="button" onClick={onUpdate} title="現在の条件で更新"
          className="shrink-0 p-1 text-[var(--c-fg-3)] hover:text-[var(--c-accent)]"><SaveIcon size={12} /></button>
      )}
      <button type="button" onClick={onDelete} title="削除"
        className="shrink-0 p-1 text-[var(--c-fg-3)] hover:text-[var(--c-danger,#e5484d)] opacity-0 group-hover/vw:opacity-100 focus-visible:opacity-100 transition-opacity"><Trash2Icon size={12} /></button>
    </div>
  );
}

function ViewSwitcher({ views, activeId, onApply, onSaveNew, onUpdate, onDelete, onReorder, dirty }: {
  views: TableView[];
  activeId: string | null;
  onApply: (v: TableView | null) => void;
  onSaveNew: (name: string) => void;
  onUpdate: (id: string) => void;
  onDelete: (id: string) => void;
  onReorder: (next: TableView[]) => void;
  dirty: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [popStyle, setPopStyle] = useState<React.CSSProperties>({ visibility: 'hidden' });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const active = views.find((v) => v.id === activeId) || null;

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const W = 240;
    let left = rect.left;
    if (left + W > window.innerWidth - 8) left = window.innerWidth - W - 8;
    setPopStyle({ position: 'fixed', top: rect.bottom + 4, left, width: W, zIndex: 2000, visibility: 'visible' });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!btnRef.current?.contains(e.target as Node) && !popRef.current?.contains(e.target as Node)) { setOpen(false); setNaming(false); }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); setNaming(false); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  function submitNew() {
    const n = name.trim();
    if (!n) return;
    onSaveNew(n);
    setName(''); setNaming(false); setOpen(false);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active: a, over } = event;
    if (!over || a.id === over.id) return;
    const oldIdx = views.findIndex((v) => v.id === a.id);
    const newIdx = views.findIndex((v) => v.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    onReorder(arrayMove(views, oldIdx, newIdx));
  }

  /** Alt+↑/↓ での 1 件移動。移動後もフォーカスを追従させる */
  function moveView(id: string, dir: -1 | 1) {
    const idx = views.findIndex((v) => v.id === id);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= views.length) return;
    onReorder(arrayMove(views, idx, next));
    requestAnimationFrame(() => {
      popRef.current?.querySelector<HTMLElement>(`[data-view-id="${id}"]`)?.focus();
    });
  }

  const popover = open ? createPortal(
    <div ref={popRef} style={popStyle}
      className="bg-[var(--c-bg)] border border-[var(--c-border)] rounded-xl shadow-[0_8px_32px_rgba(0,0,0,.16)] overflow-hidden py-1">
      <button type="button" onClick={() => { onApply(null); setOpen(false); }}
        className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-[var(--c-bg-2)] ${activeId === null ? 'text-[var(--c-accent)]' : 'text-[var(--c-fg-2)]'}`}>
        <span className="w-3 shrink-0">{activeId === null && <CheckIcon size={12} />}</span>
        フィルターなし
      </button>
      {views.length > 0 && <div className="my-1 border-t border-[var(--c-border)]" />}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={views.map((v) => v.id)} strategy={verticalListSortingStrategy}>
          {views.map((v) => (
            <SortableViewRow key={v.id} view={v}
              active={v.id === activeId}
              dirty={dirty}
              onApply={() => { onApply(v); setOpen(false); }}
              onUpdate={() => onUpdate(v.id)}
              onDelete={() => onDelete(v.id)}
              onMove={(dir) => moveView(v.id, dir)} />
          ))}
        </SortableContext>
      </DndContext>
      <div className="my-1 border-t border-[var(--c-border)]" />
      {naming ? (
        <div className="flex items-center gap-1 px-2 py-1">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) submitNew(); }}
            placeholder="ビュー名" className="flex-1 min-w-0 h-6 px-2 rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] text-xs focus:outline-none focus:border-[var(--c-accent)]" />
          <button type="button" onClick={submitNew}
            className="shrink-0 px-2 h-6 rounded bg-[var(--c-accent)] text-white text-[11px]">保存</button>
        </div>
      ) : (
        <button type="button" onClick={() => setNaming(true)}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--c-fg-2)] hover:bg-[var(--c-bg-2)]">
          <PlusIcon size={12} /> 現在の条件をビューに保存
        </button>
      )}
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <button ref={btnRef} type="button" onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded border shrink-0 transition-colors ${
          active || open
            ? 'border-[var(--c-accent)] text-[var(--c-accent)] bg-[var(--c-accent-dim)]'
            : 'border-[var(--c-border)] text-[var(--c-fg-2)] hover:border-[var(--c-accent)] hover:text-[var(--c-accent)]'
        }`}>
        <BookmarkIcon size={11} />
        <span className="max-w-[100px] truncate">{active ? active.name : 'ビュー'}</span>
        <ChevronDownIcon size={11} />
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
  const [query, setQuery] = useState(() => lsGet(TABLE_QUERY_PREFIX + section.id) ?? '');
  const [views, setViews] = useState<TableView[]>(() => section.table_views ?? []);
  const [activeViewId, setActiveViewId] = useState<string | null>(
    () => lsJson<string>(TABLE_ACTIVE_VIEW_PREFIX + section.id)
  );

  // テーブルは行依存の列値バインド {@列名} を先に解決してから
  // セクション→共通→日付バインドを解決する（行ごとに値が変わるため item 必須）
  const resolve = (s: string, item: DashboardItem) =>
    resolveAll(resolveColumnRefs(s, item, columns), section, globalVarNames, presets, activePresetId);

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

  // クエリ言語で絞り込み（マッチ対象は row_data の生値）
  const filterCols = useMemo<FilterColumn[]>(() => columns.map((c) => ({ id: c.id, label: c.label })), [columns]);
  const parsed = useMemo(() => parseTableQuery(query, filterCols), [query, filterCols]);

  function updateQuery(q: string) {
    setQuery(q);
    setPage(0);
    lsSet(TABLE_QUERY_PREFIX + section.id, q);
  }

  const filteredItems = useMemo(() => {
    if (!query.trim()) return sortedItems;
    return sortedItems.filter((item) => parsed.test(item.row_data ?? {}));
  }, [sortedItems, query, parsed]);

  // ── 保存ビュー ──
  const activeView = views.find((v) => v.id === activeViewId) || null;
  const normView = (v: { query: string; sort: TableView['sort']; hiddenCols: string[]; colOrder: string[] }) =>
    JSON.stringify({ query: v.query, sort: v.sort, hiddenCols: [...v.hiddenCols].sort(), colOrder: v.colOrder });
  const snapshot = (): Pick<TableView, 'query' | 'sort' | 'hiddenCols' | 'colOrder'> =>
    ({ query, sort: sortState, hiddenCols: [...hiddenCols], colOrder });
  const viewDirty = activeView ? normView(snapshot()) !== normView(activeView) : false;

  async function persistViews(next: TableView[]) {
    setViews(next);
    if (section.id) await dashboardDB.patchSection(section.id, { table_views: next });
  }
  function setActiveView(id: string | null) {
    setActiveViewId(id);
    if (id) lsSet(TABLE_ACTIVE_VIEW_PREFIX + section.id, JSON.stringify(id));
    else localStorage.removeItem(TABLE_ACTIVE_VIEW_PREFIX + section.id);
  }
  function applyView(v: TableView | null) {
    if (!v) { setActiveView(null); updateQuery(''); return; }
    setActiveView(v.id);
    updateQuery(v.query);
    setSortState(v.sort);
    if (v.sort) lsSet(TABLE_SORT_PREFIX + section.id, JSON.stringify(v.sort));
    else localStorage.removeItem(TABLE_SORT_PREFIX + section.id);
    setHiddenCols(new Set(v.hiddenCols));
    lsSet(TABLE_COL_HIDDEN_PREFIX + section.id, JSON.stringify(v.hiddenCols));
    setColOrder(v.colOrder);
    lsSet(TABLE_COL_ORDER_PREFIX + section.id, JSON.stringify(v.colOrder));
  }
  async function saveNewView(name: string) {
    const v: TableView = { id: `v${Date.now().toString(36)}`, name, ...snapshot() };
    await persistViews([...views, v]);
    setActiveView(v.id);
    toast.success('ビューを保存しました');
  }
  async function updateView(id: string) {
    await persistViews(views.map((v) => (v.id === id ? { ...v, ...snapshot() } : v)));
    toast.success('ビューを更新しました');
  }
  async function deleteView(id: string) {
    await persistViews(views.filter((v) => v.id !== id));
    if (activeViewId === id) setActiveView(null);
  }
  /** ビューの並び順を変更（配列順がそのまま表示順・IndexedDB に保存） */
  async function reorderViews(next: TableView[]) {
    await persistViews(next);
  }

  const totalPages = pageSize > 0 ? Math.ceil(filteredItems.length / pageSize) : 1;
  const pagedItems = pageSize > 0 ? filteredItems.slice(page * pageSize, (page + 1) * pageSize) : filteredItems;

  async function handleCellClick(item: DashboardItem, col: { id: string; label: string; type: 'text' | 'copy' | 'link' }) {
    const val = resolve(item.row_data?.[col.id] ?? '', item);
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
        <TableQueryInput
          value={query}
          onChange={updateQuery}
          columns={filterCols}
          error={query.trim() && !parsed.ok ? parsed.error : undefined}
          count={query.trim() ? filteredItems.length : null}
        />
        <ViewSwitcher
          views={views}
          activeId={activeViewId}
          onApply={applyView}
          onSaveNew={saveNewView}
          onUpdate={updateView}
          onDelete={deleteView}
          onReorder={reorderViews}
          dirty={viewDirty}
        />
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
                  const val = resolve(item.row_data?.[c.id] ?? '', item);
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

export const SectionCard = React.memo(function SectionCard({
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

