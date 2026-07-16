// ==================================================
// dashboard/ItemManagerModal — アイテム管理モーダル（スプレッドシートUX）（DashboardPage から分割）
// ==================================================
import React, { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from 'react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  PlusIcon,
  GripVerticalIcon, Trash2Icon, CopyPlusIcon,
  XIcon, PencilIcon,
  Columns3Icon,
  SearchIcon,
  
} from 'lucide-react';
import {
  dashboardDB,
  type DashboardSection, type DashboardItem,
  type SectionType,
} from '../../db/dashboard_db';
import { DatePicker } from '../../components/DatePicker';
import { Select, type SelectOption } from '../../components/Select';
import { ActivityLogger } from '../../core/activity_logger';
import { confirmDialog } from '../../components/ConfirmDialog';
import { CMD_ITEM_TYPE_OPTIONS } from './shared';

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

// Undo/Redo 用のローカル state スナップショット（ItemManagerModal）
type UndoSnapshot = {
  items: DashboardItem[];
  dirtyIds: Set<number>;
  newIds: Set<number>;
  dirtyCells: Map<number, Set<string>>;
};
const UNDO_LIMIT = 100;

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
// React.memo で行単位の再レンダリングを抑制（大量行の TSV でも選択移動が軽い）。
// コールバック props は親が identity 不変のラッパーを渡す前提。
// セル選択系は rowIdx を引数に受け取る形にして行ごとのクロージャ生成を排除
const SortableEditableRow = React.memo(function SortableEditableRow({ item, rowIdx, section, colDefs, isDragDisabled, canInsert, canDuplicate, isNew, isDirty, dirtyCellKeys,
  selRange, selectedColIdx, editingColIdx,
  onCellSelect, onShiftCellSelect, onCellEdit, onCellChange, onCellCommit,
  onTypeChange, onUpdate, onDelete, onInsert, onDuplicate,
}: {
  item: DashboardItem; rowIdx: number; section: DashboardSection; colDefs: SpColDef[];
  isDragDisabled: boolean; canInsert: boolean; canDuplicate: boolean; isNew: boolean; isDirty: boolean; dirtyCellKeys: Set<string>;
  selRange: { r1: number; c1: number; r2: number; c2: number } | null;
  selectedColIdx: number | null; editingColIdx: number | null;
  onCellSelect: (rowIdx: number, ci: number) => void; onShiftCellSelect: (rowIdx: number, ci: number) => void; onCellEdit: (rowIdx: number, ci: number) => void;
  onCellChange: (rowIdx: number, ci: number, v: string) => void;
  onCellCommit: (dir: 'right' | 'down' | 'left' | 'none') => void;
  onTypeChange: (id: number, t: 'copy' | 'link' | 'template') => void;
  onUpdate: (id: number, patch: Partial<DashboardItem>) => void;
  onDelete: (id: number) => void;
  onInsert: (rowIdx: number, where: 'above' | 'below') => void;
  onDuplicate: (rowIdx: number) => void;
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
          <td key={col.key} data-cell={`${rowIdx}-${ci}`} className="align-middle p-0">
            <SpreadsheetCell
              value={col.getValue(item)}
              isSelected={selectedColIdx === ci}
              isEditing={!isSpecial && editingColIdx === ci}
              isInRange={isCellInRange(ci)}
              isCellDirty={!isNew && !isSpecial && dirtyCellKeys.has(col.key)}
              openAsDialog={isSpecial}
              onSelect={() => onCellSelect(rowIdx, ci)}
              onShiftSelect={() => onShiftCellSelect(rowIdx, ci)}
              onEdit={() => onCellEdit(rowIdx, ci)}
              onChange={isSpecial ? () => {} : (v) => onCellChange(rowIdx, ci, v)}
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

      {/* 行アクション: 下に挿入・複製・削除（ホバー時表示） */}
      <td className="w-20 pr-2 align-middle text-center whitespace-nowrap">
        {canInsert && (
          <button type="button" title="この行の下に挿入"
            onClick={(e) => { e.stopPropagation(); onInsert(rowIdx, 'below'); }}
            className="p-0.5 rounded text-[var(--c-fg-3)] hover:text-[var(--c-accent)] hover:bg-[var(--c-accent-dim)] opacity-0 group-hover:opacity-100 transition-opacity align-middle">
            <PlusIcon size={13} />
          </button>
        )}
        {canDuplicate && (
          <button type="button" title="この行を複製（範囲選択中は選択行をまとめて複製）"
            onClick={(e) => { e.stopPropagation(); onDuplicate(rowIdx); }}
            className="p-0.5 rounded text-[var(--c-fg-3)] hover:text-[var(--c-accent)] hover:bg-[var(--c-accent-dim)] opacity-0 group-hover:opacity-100 transition-opacity align-middle">
            <CopyPlusIcon size={13} />
          </button>
        )}
        <button type="button" title="削除" onClick={(e) => { e.stopPropagation(); onDelete(item.id!); }}
          className="p-0.5 rounded text-[var(--c-fg-3)] hover:text-[var(--c-danger)] hover:bg-[var(--c-danger-bg)] opacity-0 group-hover:opacity-100 transition-opacity align-middle">
          <Trash2Icon size={13} />
        </button>
      </td>
    </tr>
  );
});

// 変更のない行に毎レンダー新しい Set を渡さないための共有空セット
const EMPTY_KEY_SET = new Set<string>();

export function ItemManagerModal({ section, items, onClose, onChanged }: ItemManagerModalProps) {
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
  // ── Undo/Redo（ローカル state のスナップショット履歴） ────────────────
  // 対象: セル編集・貼り付け・範囲クリア・行移動・挿入・追加・複製・タイプ変更。
  // DB に即時反映される行削除と一括保存は巻き戻せないため履歴をクリアする
  const undoStack = useRef<UndoSnapshot[]>([]);
  const redoStack = useRef<UndoSnapshot[]>([]);
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
  // ── 列検索（列名でジャンプ）─────────────────────────────────────────
  const [colSearch,     setColSearch]     = useState('');
  const [colSearchOpen, setColSearchOpen] = useState(false);
  const [colSearchIdx,  setColSearchIdx]  = useState(0); // 候補内のハイライト位置
  const colSearchRef = useRef<HTMLInputElement>(null);
  // ── フィルター ────────────────────────────────────────────────────────
  const [filterQuery, setFilterQuery] = useState('');
  const isFiltering = filterQuery.trim().length > 0;
  // ── テンプレート編集サブモーダル ─────────────────────────────────────
  const [templateEditItem, setTemplateEditItem] = useState<DashboardItem | null>(null);

  const colDefs = useMemo(() => buildSpColDefs(section), [section]);
  const itemSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // フィルター変更時はセル選択をクリア
  useEffect(() => { setSelCell(null); setSelEnd(null); setEditCell(null); }, [filterQuery]);

  // ── アクティブセルへのスクロール追従 ─────────────────────────────────
  // 矢印/Tab 移動・範囲選択で選択セル（範囲選択時は端の selEnd）が画面外へ出たら
  // コンテナを縦横スクロールして常に可視域に入れる（Excel/Sheets 相当）。
  // sticky ヘッダーの高さと余白を考慮し、必要な分だけ動かす（見えている間は動かさない）。
  useLayoutEffect(() => {
    const target = selEnd ?? selCell;
    if (!target) return;
    const container = tableContainerRef.current;
    if (!container) return;
    const [r, c] = target;
    const cell = container.querySelector<HTMLElement>(`[data-cell="${r}-${c}"]`);
    if (!cell) return;
    const MARGIN = 8; // セルを縁に張り付けない余白
    const cRect = container.getBoundingClientRect();
    const tRect = cell.getBoundingClientRect();
    // sticky ヘッダー（thead）の高さ分だけ上端の可視境界を下げる
    const thead = container.querySelector('thead');
    const headH = thead ? thead.getBoundingClientRect().height : 0;
    // 縦方向
    const topGap = tRect.top - (cRect.top + headH) - MARGIN;
    const bottomGap = tRect.bottom - cRect.bottom + MARGIN;
    if (topGap < 0) container.scrollTop += topGap;
    else if (bottomGap > 0) container.scrollTop += bottomGap;
    // 横方向（固定列はないので単純比較）
    const leftGap = tRect.left - cRect.left - MARGIN;
    const rightGap = tRect.right - cRect.right + MARGIN;
    if (leftGap < 0) container.scrollLeft += leftGap;
    else if (rightGap > 0) container.scrollLeft += rightGap;
  }, [selCell, selEnd]);

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

  // ── 列検索: 入力に一致する列名の候補（元の colDefs index を保持）────────
  const colMatches = useMemo(() => {
    const q = colSearch.trim().toLowerCase();
    if (!q) return [];
    return colDefs
      .map((c, idx) => ({ label: c.label, idx }))
      .filter((c) => c.label.toLowerCase().includes(q));
  }, [colSearch, colDefs]);
  // 候補が変わったらハイライトを先頭に戻す
  useEffect(() => { setColSearchIdx(0); }, [colSearch]);

  // 指定列へジャンプ（現在行 or 先頭行のセルを選択 → スクロール追従で可視域へ）
  function jumpToColumn(colIdx: number) {
    if (filteredItems.length === 0) return;
    const row = selCell ? Math.min(selCell[0], filteredItems.length - 1) : 0;
    setSelCell([row, colIdx]);
    setSelEnd(null);
    setEditCell(null);
    setColSearchOpen(false);
    setColSearch('');
    // キーボード操作を継続できるようテーブルへフォーカス（スクロールは useLayoutEffect が担当）
    setTimeout(() => tableContainerRef.current?.focus(), 0);
  }

  // 列検索ボックスのキー操作（↑↓ で候補移動・Enter 確定・Esc 閉じる）
  function handleColSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setColSearchOpen(true); setColSearchIdx((i) => Math.min(colMatches.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setColSearchIdx((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); const m = colMatches[colSearchIdx]; if (m) jumpToColumn(m.idx); }
    else if (e.key === 'Escape') { e.preventDefault(); if (colSearch) { setColSearch(''); } else { setColSearchOpen(false); colSearchRef.current?.blur(); } }
  }

  // ── Undo/Redo 操作 ───────────────────────────────────────────────────
  function takeSnapshot(): UndoSnapshot {
    return {
      items: localItemsRef.current,
      dirtyIds: new Set(dirtyIds),
      newIds: new Set(newIds),
      dirtyCells: new Map([...dirtyCells].map(([k, v]) => [k, new Set(v)])),
    };
  }
  // 変更操作の直前（localItemsRef 更新前）に呼ぶこと
  function pushUndo() {
    undoStack.current.push(takeSnapshot());
    if (undoStack.current.length > UNDO_LIMIT) undoStack.current.shift();
    redoStack.current = [];
  }
  function clearUndoHistory() {
    undoStack.current = [];
    redoStack.current = [];
  }
  function applySnapshot(s: UndoSnapshot) {
    localItemsRef.current = s.items;
    setLocalItems(s.items);
    setDirtyIds(s.dirtyIds);
    setNewIds(s.newIds);
    setDirtyCells(s.dirtyCells);
    setEditCell(null); setSelEnd(null);
    // 選択セルが復元後の行数を超えていたら解除（フィルター中は行番号がずれるため常に解除）
    setSelCell((prev) => (!isFiltering && prev && prev[0] < s.items.length) ? prev : null);
  }
  function handleUndo() {
    const s = undoStack.current.pop();
    if (!s) return;
    redoStack.current.push(takeSnapshot());
    applySnapshot(s);
  }
  function handleRedo() {
    const s = redoStack.current.pop();
    if (!s) return;
    undoStack.current.push(takeSnapshot());
    applySnapshot(s);
  }

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
    // 保存で新規行の id が振り直されるため、保存前のスナップショットには戻せない
    clearUndoHistory();
    onChanged();
  }

  // ── 行追加 ───────────────────────────────────────────────────────────
  function handleAddRow() {
    pushUndo();
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

  // ── 行を間に挿入（基準行の下/上） ─────────────────────────────────────
  function handleInsertRow(refRowIdx: number, where: 'above' | 'below') {
    if (isFiltering) return; // フィルター中は挿入位置が曖昧なため無効
    // 基準行の id から localItems 内の実インデックスを引く（filteredItems と一致するが安全のため id 経由）
    const refItem = filteredItems[refRowIdx];
    const baseIdx = refItem
      ? localItemsRef.current.findIndex((i) => i.id === refItem.id)
      : localItemsRef.current.length - 1;
    const insertIdx = where === 'below' ? baseIdx + 1 : Math.max(0, baseIdx);
    pushUndo();
    const tempId = tempIdCounter.current--;
    const arr = [...localItemsRef.current];
    arr.splice(insertIdx, 0, buildEmptyItem(section, tempId, insertIdx));
    // position を全行で振り直し（DnD と同じ方式）
    const next = arr.map((i, p) => ({ ...i, position: p }));
    localItemsRef.current = next;
    setLocalItems(next);
    // 新規行 + position が動いた既存行を保存対象にマーク
    setNewIds((prev) => new Set(prev).add(tempId));
    setDirtyIds((prev) => {
      const s = new Set(prev);
      next.forEach((i) => { if (i.id! > 0) s.add(i.id!); });
      return s;
    });
    // 挿入行（フィルター無効中なので filteredItems===localItems）の先頭セルを編集状態に
    setSelCell([insertIdx, 0]);
    setSelEnd(null);
    setEditCell([insertIdx, 0]);
    setTimeout(() => tableContainerRef.current?.focus(), 0);
  }

  // ── 行削除 ───────────────────────────────────────────────────────────
  async function handleDelete(id: number) {
    if (!(await confirmDialog({ message: '削除しますか？', danger: true }))) return;
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
    // DB 反映済みの削除は Undo で戻せないため履歴をクリア
    clearUndoHistory();
    setSelCell(null); setSelEnd(null); setEditCell(null);
  }

  // ── 複数行の一括削除（範囲選択の行をまとめて削除） ─────────────────────
  async function handleDeleteRows(r1: number, r2: number) {
    const targets = filteredItems.slice(r1, r2 + 1);
    if (targets.length === 0) return;
    if (!(await confirmDialog({ message: `選択中の${targets.length}行を削除しますか？`, danger: true }))) return;
    const ids = new Set(targets.map((t) => t.id!));
    const realIds = targets.filter((t) => t.id! > 0).map((t) => t.id!);
    for (const id of realIds) await dashboardDB.deleteItem(id);
    if (realIds.length > 0) {
      ActivityLogger.log('dashboard', 'delete', 'item', section.id!, `「${section.title}」から${realIds.length}件を削除`);
    }
    const next = localItemsRef.current.filter((i) => !ids.has(i.id!));
    localItemsRef.current = next;
    setLocalItems(next);
    setNewIds((prev) => { const s = new Set(prev); ids.forEach((id) => s.delete(id)); return s; });
    setDirtyIds((prev) => { const s = new Set(prev); ids.forEach((id) => s.delete(id)); return s; });
    setDirtyCells((prev) => { const m = new Map(prev); ids.forEach((id) => m.delete(id)); return m; });
    clearUndoHistory();
    setSelCell(null); setSelEnd(null); setEditCell(null);
    if (realIds.length > 0) onChanged();
  }

  // ── 行複製（対象行ブロックを直下に複製） ───────────────────────────────
  function handleDuplicateRows(r1: number, r2: number) {
    if (isFiltering) return; // 挿入位置が曖昧なため無効（挿入と同方針）
    const src = localItemsRef.current.slice(r1, r2 + 1);
    if (src.length === 0) return;
    pushUndo();
    const clones = src.map((it) => ({
      ...it,
      id: tempIdCounter.current--,
      row_data: it.row_data ? { ...it.row_data } : undefined,
      use_count: 0,
    }));
    const arr = [...localItemsRef.current];
    arr.splice(r2 + 1, 0, ...clones);
    const next = arr.map((i, p) => ({ ...i, position: p }));
    localItemsRef.current = next;
    setLocalItems(next);
    setNewIds((prev) => { const s = new Set(prev); clones.forEach((c) => s.add(c.id!)); return s; });
    // position が動いた既存行を保存対象にマーク（挿入と同方式）
    setDirtyIds((prev) => { const s = new Set(prev); next.forEach((i) => { if (i.id! > 0) s.add(i.id!); }); return s; });
    // 複製された行ブロックを選択状態に
    const col = selCell ? selCell[1] : 0;
    setSelCell([r2 + 1, col]);
    setSelEnd(clones.length > 1 ? [r2 + clones.length, col] : null);
    setEditCell(null);
    setTimeout(() => tableContainerRef.current?.focus(), 0);
  }

  // ── DnD 並び替え（位置のみ即時保存） ─────────────────────────────────
  function handleDragEnd(event: DragEndEvent) {
    if (newIds.size > 0) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = localItemsRef.current.findIndex((i) => i.id === active.id);
    const newIdx = localItemsRef.current.findIndex((i) => i.id === over.id);
    // position を更新した上でローカルに反映（DB保存は handleSaveAll で一括）
    // 複数行の範囲選択内の行をドラッグした場合は選択行ブロックをまとめて移動
    // （DnD 有効時はフィルターなし＝filteredItems の行番号がそのまま localItems の index）
    let reordered: DashboardItem[];
    if (selRange && selRange.r1 !== selRange.r2 && oldIdx >= selRange.r1 && oldIdx <= selRange.r2) {
      if (newIdx >= selRange.r1 && newIdx <= selRange.r2) return; // ブロック内へのドロップは無視
      pushUndo();
      const arr = [...localItemsRef.current];
      const block = arr.splice(selRange.r1, selRange.r2 - selRange.r1 + 1);
      const insertIdx = newIdx < selRange.r1 ? newIdx : newIdx - block.length + 1;
      arr.splice(insertIdx, 0, ...block);
      reordered = arr.map((item, p) => ({ ...item, position: p }));
    } else {
      pushUndo();
      reordered = arrayMove([...localItemsRef.current], oldIdx, newIdx)
        .map((item, p) => ({ ...item, position: p }));
    }
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
    pushUndo();
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
    // SpreadsheetCell は編集確定時（値が変わった場合のみ）に1回だけ呼ぶため
    // ここでの push が「1編集 = 1 Undo ステップ」になる
    pushUndo();
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
    applyTsvText(text, selCell[0], selCell[1]);
  }

  // 編集中セルでのマルチセル貼り付けを拾う。input/textarea から bubble する
  // paste を捕まえ、タブ/改行を含む（=複数セル相当）場合のみ TSV 展開に回す。
  // 単一値は通常のセル内貼り付けに任せる。これで「1列目（編集モードのまま）の
  // 貼り付けが効かない」現象を解消する。
  function handleTablePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    if (!editCell) return;                              // 非編集時は keydown 経路に任せる
    const text = e.clipboardData.getData('text');
    if (!text || !/[\t\r\n]/.test(text)) return;        // 単一値はネイティブ貼り付け
    e.preventDefault();
    const [r, c] = editCell;
    setEditCell(null);                                  // 編集を抜けて範囲展開
    applyTsvText(text, r, c);
  }

  function applyTsvText(text: string, startRow: number, startCol: number) {
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
      const modifiedKeys: string[] = [];
      for (let ci = 0; ci < cells.length; ci++) {
        const colIdx = startCol + ci;
        if (colIdx >= colDefs.length) break;
        const col = colDefs[colIdx];
        if (col.isSpecial?.(item)) continue;
        // setValue を「累積中の item」に順次適用する。
        // row_data など入れ子を返す列で、複数列の浅いマージが互いの
        // row_data を上書きして先頭列が消えるのを防ぐ。
        item = { ...item, ...col.setValue(item, cells[ci]) };
        modifiedKeys.push(col.key);
      }
      next[rowIdx] = item;
      if (item.id! > 0) {
        newDirtyIds.add(item.id!);
        const keys = new Set(newDirtyCells.get(item.id!) ?? []);
        modifiedKeys.forEach((k) => keys.add(k));
        newDirtyCells.set(item.id!, keys);
      }
    }
    // localItemsRef が旧状態のうちにスナップショットを取る
    pushUndo();
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

  // ── 行への安定コールバック（React.memo を効かせるため identity 不変） ──
  // 実体は毎レンダー最新のハンドラに差し替え、ラッパーの identity は保つ
  function handleTypeChange(id: number, t: 'copy' | 'link' | 'template') {
    pushUndo();
    updateLocalItem(id, { item_type: t });
  }
  function handleRowDelete(id: number) {
    // 複数行の範囲選択内の行なら選択行をまとめて削除（DnD ブロック移動と同方針）
    const ri = filteredItems.findIndex((i) => i.id === id);
    if (selRange && selRange.r1 !== selRange.r2 && ri >= selRange.r1 && ri <= selRange.r2) {
      handleDeleteRows(selRange.r1, selRange.r2);
    } else {
      handleDelete(id);
    }
  }
  function handleRowDuplicate(ri: number) {
    // 複数行の範囲選択内の行なら選択行をまとめて複製
    if (selRange && selRange.r1 !== selRange.r2 && ri >= selRange.r1 && ri <= selRange.r2) {
      handleDuplicateRows(selRange.r1, selRange.r2);
    } else {
      handleDuplicateRows(ri, ri);
    }
  }
  const rowHandlersRef = useRef({
    handleCellSelect, handleShiftCellSelect, handleCellEdit, handleCellChange, handleCellCommit,
    handleTypeChange, updateLocalItem, handleRowDelete, handleInsertRow, handleRowDuplicate,
  });
  rowHandlersRef.current = {
    handleCellSelect, handleShiftCellSelect, handleCellEdit, handleCellChange, handleCellCommit,
    handleTypeChange, updateLocalItem, handleRowDelete, handleInsertRow, handleRowDuplicate,
  };
  const onRowCellSelect  = useCallback((r: number, c: number) => rowHandlersRef.current.handleCellSelect(r, c), []);
  const onRowShiftSelect = useCallback((r: number, c: number) => rowHandlersRef.current.handleShiftCellSelect(r, c), []);
  const onRowCellEdit    = useCallback((r: number, c: number) => rowHandlersRef.current.handleCellEdit(r, c), []);
  const onRowCellChange  = useCallback((r: number, c: number, v: string) => rowHandlersRef.current.handleCellChange(r, c, v), []);
  const onRowCellCommit  = useCallback((d: 'right' | 'down' | 'left' | 'none') => rowHandlersRef.current.handleCellCommit(d), []);
  const onRowTypeChange  = useCallback((id: number, t: 'copy' | 'link' | 'template') => rowHandlersRef.current.handleTypeChange(id, t), []);
  const onRowUpdate      = useCallback((id: number, patch: Partial<DashboardItem>) => rowHandlersRef.current.updateLocalItem(id, patch), []);
  const onRowDelete      = useCallback((id: number) => { rowHandlersRef.current.handleRowDelete(id); }, []);
  const onRowInsert      = useCallback((ri: number, w: 'above' | 'below') => rowHandlersRef.current.handleInsertRow(ri, w), []);
  const onRowDuplicate   = useCallback((ri: number) => rowHandlersRef.current.handleRowDuplicate(ri), []);

  // ── テーブルコンテナ キーダウン ──────────────────────────────────────
  function handleTableKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (editCell) return;
    if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
      e.preventDefault(); handleCopy(); return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
      e.preventDefault(); handleTsvPaste(); return;
    }
    // Ctrl/Cmd+Z = Undo / +Shift = Redo（Ctrl/Cmd+Y も Redo）
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) handleRedo(); else handleUndo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault(); handleRedo(); return;
    }
    // Ctrl/Cmd+D = 選択行を複製（範囲選択中はブロックごと）
    if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      if (selRange) handleDuplicateRows(selRange.r1, selRange.r2);
      return;
    }
    // Ctrl/Cmd+Enter = 選択行の下に挿入 / +Shift = 上に挿入
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      const refIdx = selCell ? selCell[0] : filteredItems.length - 1;
      handleInsertRow(refIdx, e.shiftKey ? 'above' : 'below');
      return;
    }
    // Alt+↑/↓ = 選択行を1つ上/下へ移動（範囲選択中は複数行ブロックをまとめて移動）
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      if (isFiltering || newIds.size > 0 || !selCell || !selRange) return; // フィルター中・未保存新規行ありは無効
      const delta = e.key === 'ArrowUp' ? -1 : 1;
      const { r1, r2 } = selRange;
      if (r1 + delta < 0 || r2 + delta >= localItemsRef.current.length) return;
      pushUndo();
      const arr = [...localItemsRef.current];
      const block = arr.splice(r1, r2 - r1 + 1);
      arr.splice(r1 + delta, 0, ...block);
      const reordered = arr.map((it, p) => ({ ...it, position: p }));
      localItemsRef.current = reordered;
      setLocalItems(reordered);
      setDirtyIds((prev) => {
        const s = new Set(prev);
        reordered.forEach((i) => { if (i.id! > 0) s.add(i.id!); });
        return s;
      });
      // 選択範囲ごと移動先に追従させ、連続移動できるように範囲を維持する
      setSelCell([selCell[0] + delta, selCell[1]]);
      if (selEnd) setSelEnd([selEnd[0] + delta, selEnd[1]]);
      return;
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
        // Shift+Delete = 選択行をまとめて削除
        if (e.shiftKey) {
          if (selRange) handleDeleteRows(selRange.r1, selRange.r2);
          break;
        }
        if (!selRange) break;
        // 範囲内の全セルをクリア（Excel 相当）。テンプレート等の特殊セルは対象外
        const next = [...localItemsRef.current];
        const nextDirtyIds = new Set(dirtyIds);
        const nextDirtyCells = new Map(dirtyCells);
        let changed = false;
        for (let r = selRange.r1; r <= selRange.r2; r++) {
          const fItem = filteredItems[r];
          if (!fItem) continue;
          const idx = next.findIndex((i) => i.id === fItem.id);
          if (idx < 0) continue;
          let item = next[idx];
          const clearedKeys: string[] = [];
          for (let c = selRange.c1; c <= selRange.c2; c++) {
            const cd = colDefs[c];
            if (!cd || cd.isSpecial?.(item)) continue;
            // applyTsvText と同じく累積中の item に setValue を順次適用（row_data の上書き防止）
            item = { ...item, ...cd.setValue(item, '') };
            clearedKeys.push(cd.key);
          }
          if (clearedKeys.length === 0) continue;
          next[idx] = item;
          changed = true;
          if (item.id! > 0) {
            nextDirtyIds.add(item.id!);
            const keys = new Set(nextDirtyCells.get(item.id!) ?? []);
            clearedKeys.forEach((k) => keys.add(k));
            nextDirtyCells.set(item.id!, keys);
          }
        }
        if (!changed) break;
        pushUndo();
        localItemsRef.current = next;
        setLocalItems(next);
        setDirtyIds(nextDirtyIds);
        setDirtyCells(nextDirtyCells);
        break;
      }
      default:
        break;
    }
  }

  // ── 閉じる（未保存確認） ─────────────────────────────────────────────
  const handleClose = useCallback(async () => {
    if (isDirtyAny && !(await confirmDialog({ message: '未保存の変更があります。保存せずに閉じますか？', okLabel: '保存せずに閉じる' }))) return;
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
        <th className={`w-20 ${thCls}`} />
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

          {/* 列検索（列名でジャンプ）。列が2つ以上あるときのみ表示 */}
          {colDefs.length > 1 && (
            <div className="relative w-44 shrink-0">
              <Columns3Icon size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--c-fg-3)] pointer-events-none" />
              <input ref={colSearchRef} value={colSearch}
                onChange={(e) => { setColSearch(e.target.value); setColSearchOpen(true); }}
                onFocus={() => setColSearchOpen(true)}
                onBlur={() => setTimeout(() => setColSearchOpen(false), 120)} // 候補クリックを拾えるよう遅延
                onKeyDown={handleColSearchKeyDown}
                placeholder="列へジャンプ…"
                className="w-full h-7 pl-7 pr-6 rounded border border-[var(--c-border)] bg-[var(--c-bg-2)] text-[var(--c-fg)] text-xs focus:outline-none focus:border-[var(--c-accent)]" />
              {colSearch && (
                <button onMouseDown={(e) => e.preventDefault()} onClick={() => { setColSearch(''); colSearchRef.current?.focus(); }}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--c-fg-3)] hover:text-[var(--c-fg)]">
                  <XIcon size={11} />
                </button>
              )}
              {colSearchOpen && colSearch.trim() && (
                <div className="absolute left-0 right-0 top-full mt-1 z-20 max-h-56 overflow-auto rounded-lg border border-[var(--c-border)] bg-[var(--c-bg)] shadow-[var(--shadow-lg)] py-1">
                  {colMatches.length === 0 ? (
                    <div className="px-3 py-1.5 text-xs text-[var(--c-fg-3)]">一致する列なし</div>
                  ) : colMatches.map((m, i) => (
                    <button key={m.idx} type="button"
                      onMouseDown={(e) => e.preventDefault()} // input の blur より先に発火させる
                      onClick={() => jumpToColumn(m.idx)}
                      onMouseEnter={() => setColSearchIdx(i)}
                      className={`w-full text-left px-3 py-1.5 text-xs truncate ${i === colSearchIdx ? 'bg-[var(--c-accent-dim)] text-[var(--c-fg)]' : 'text-[var(--c-fg)] hover:bg-[var(--c-bg-2)]'}`}>
                      {m.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <button onClick={handleClose} aria-label="閉じる"
            className="ml-auto p-1 rounded hover:bg-[var(--c-bg-2)] text-[var(--c-fg-3)] shrink-0">
            <XIcon size={16} aria-hidden />
          </button>
        </div>

        {/* ボディ */}
        <div ref={tableContainerRef} tabIndex={0}
          onKeyDown={handleTableKeyDown}
          onPaste={handleTablePaste}
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
                      canInsert={!isFiltering}
                      canDuplicate={!isFiltering}
                      isNew={newIds.has(item.id!)} isDirty={dirtyIds.has(item.id!)}
                      dirtyCellKeys={dirtyCells.get(item.id!) ?? EMPTY_KEY_SET}
                      selRange={selRange && rowIdx >= selRange.r1 && rowIdx <= selRange.r2 ? selRange : null}
                      selectedColIdx={selCell?.[0] === rowIdx ? selCell[1] : null}
                      editingColIdx={editCell?.[0] === rowIdx ? editCell[1] : null}
                      onCellSelect={onRowCellSelect}
                      onShiftCellSelect={onRowShiftSelect}
                      onCellEdit={onRowCellEdit}
                      onCellChange={onRowCellChange}
                      onCellCommit={onRowCellCommit}
                      onTypeChange={onRowTypeChange}
                      onUpdate={onRowUpdate}
                      onDelete={onRowDelete}
                      onInsert={onRowInsert}
                      onDuplicate={onRowDuplicate}
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
                <>
                  <button onClick={handleAddRow}
                    className="text-sm px-3 py-1.5 rounded border border-[var(--c-border)] text-[var(--c-fg-2)] hover:bg-[var(--c-bg-2)] transition-colors">
                    ＋ 行を追加
                  </button>
                  <span className="text-xs text-[var(--c-fg-3)]">
                    行ホバーの＋、または {navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl'}+Enter で間に挿入 ／ {navigator.platform.toLowerCase().includes('mac') ? '⌥' : 'Alt'}+↑↓ で行移動（範囲選択で複数行）
                  </span>
                </>
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
                  if (!(await confirmDialog({ message: '使用回数をリセットしますか？', danger: true }))) return;
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

