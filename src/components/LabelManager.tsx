// ==================================================
// LabelManager: ラベル管理ダイアログ
// ==================================================
// 使い方:
//   <LabelManager
//     open={true}
//     title="ラベル設定"
//     labels={[{ id, name, color }]}
//     onAdd={async (name, color) => newLabel}
//     onUpdate={async (id, name, color) => void}
//     onDelete={async (id) => void}
//     onClose={() => void}
//   />

import clsx from 'clsx';
import styles from '../styles/components/label-manager.module.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Toast } from './Toast';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragOverlay,
  type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS as DndCSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { confirmDialog } from './ConfirmDialog';

export interface LabelItem {
  id: number;
  name: string;
  color: string;
}

interface LabelManagerProps {
  open: boolean;
  title?: string;
  labels: LabelItem[];
  onAdd: (name: string, color: string) => Promise<LabelItem>;
  onUpdate: (id: number, name: string, color: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onClose: () => void;
  onReorder?: (labels: LabelItem[]) => void;
}

interface PopoverPos {
  top: number;
  left: number;
}

const PRESET_COLORS = [
  // Row 1: Reds + Pinks + Oranges (12)
  '#ff6b6b', '#f85149', '#ef4444', '#dc2626',
  '#f472b6', '#ec4899', '#db2777', '#db61a2',
  '#ffa657', '#fd7e14', '#f97316', '#ea580c',
  // Row 2: Yellows + Greens + Teals (12)
  '#fbbf24', '#f59e0b', '#d97706', '#e3b341',
  '#56d364', '#3fb950', '#22c55e', '#16a34a',
  '#5eead4', '#2dd4bf', '#14b8a6', '#22d3ee',
  // Row 3: Blues + Indigos + Purples (12)
  '#79c0ff', '#58a6ff', '#3b82f6', '#2563eb',
  '#818cf8', '#6366f1', '#4f46e5', '#3730a3',
  '#a78bfa', '#8b5cf6', '#d2a8ff', '#7c3aed',
];

// 6列 × 22px + 5gap × 7px + padding 20px = 187px
const POPOVER_WIDTH = 187;
// ceil(37items / 6cols) = 7行 × 22px + 6gap × 7px + padding 20px = 216px
const POPOVER_HEIGHT = 220;

function ColorPalette({
  selected,
  onSelect,
  columns = 12,
}: {
  selected: string;
  onSelect: (color: string) => void;
  columns?: number;
}) {
  return (
    <div
      className={styles['lmgr__palette']}
      style={columns !== 12 ? { gridTemplateColumns: `repeat(${columns}, 22px)` } : undefined}
    >
      {PRESET_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          className={clsx(styles['lmgr__swatch'], selected === color && styles['is-active'])}
          style={{ background: color }}
          title={color}
          onClick={() => onSelect(color)}
        />
      ))}
      <label className={clsx(styles['lmgr__swatch'], styles['lmgr__swatch--custom'])} title="カスタムカラー">
        <input
          type="color"
          className={styles['lmgr__custom-color-input']}
          value={selected}
          onChange={(e) => onSelect(e.target.value)}
        />
        <svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor" aria-hidden="true">
          <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064Zm1.238-3.763a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354Z" />
        </svg>
      </label>
    </div>
  );
}

// ── ソータブル・ラベル行 ─────────────────────────────
function SortableLabelItem({
  label, editingId, editingName, isColorActive,
  onStartEdit, onEditNameChange, onEditSave, onEditCancel,
  onDelete, onColorBtnClick,
}: {
  label: LabelItem;
  editingId: number | null;
  editingName: string;
  isColorActive: boolean;
  onStartEdit: (label: LabelItem) => void;
  onEditNameChange: (val: string) => void;
  onEditSave: (label: LabelItem) => void;
  onEditCancel: () => void;
  onDelete: (label: LabelItem) => void;
  onColorBtnClick: (id: number, rect: DOMRect) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useSortable({ id: label.id });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: DndCSS.Transform.toString(transform),
        opacity: isDragging ? 0 : 1,
      }}
      className={styles['lmgr__item']}
    >
      {/* Grip handle */}
      <div className={styles['lmgr__item-move']}>
        <button
          {...attributes} {...listeners}
          className={styles['lmgr__grip-btn']}
          type="button"
          aria-label="ドラッグして並び替え"
          tabIndex={-1}
        >
          <GripVertical size={13} />
        </button>
      </div>

      {/* Color button */}
      <button
        className={styles['lmgr__item-color-btn']}
        type="button"
        style={{
          background: label.color,
          ...(isColorActive ? { transform: 'scale(1.25)', boxShadow: '0 0 0 3px rgba(0,0,0,0.12)' } : {}),
        }}
        title="カラーを変更"
        onClick={(e) => onColorBtnClick(label.id, (e.currentTarget as HTMLButtonElement).getBoundingClientRect())}
      />

      {/* Color chip */}
      <span
        className={styles['lmgr__item-chip']}
        style={{ background: `${label.color}33`, color: label.color, borderColor: `${label.color}99` }}
      >
        {label.name}
      </span>

      {/* Name editing */}
      {editingId === label.id ? (
        <input
          type="text"
          className={styles['lmgr__item-name-input']}
          value={editingName}
          autoFocus
          onChange={(e) => onEditNameChange(e.target.value)}
          onBlur={() => onEditSave(label)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) onEditSave(label);
            if (e.key === 'Escape') onEditCancel();
          }}
        />
      ) : (
        <span
          className={styles['lmgr__item-name']}
          role="button"
          tabIndex={0}
          title="クリックして名前を変更"
          onClick={() => onStartEdit(label)}
          onKeyDown={(e) => { if (e.key === 'Enter') onStartEdit(label); }}
        >
          {label.name}
        </span>
      )}

      {/* Delete button */}
      <button className={styles['lmgr__item-del']} type="button" title="削除" onClick={() => onDelete(label)}>
        <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
          <path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z" />
        </svg>
      </button>
    </li>
  );
}

export function LabelManager({
  open,
  title = 'ラベル設定',
  labels,
  onAdd,
  onUpdate,
  onDelete,
  onClose,
  onReorder,
}: LabelManagerProps) {
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [colorPopoverId, setColorPopoverId] = useState<number | null>(null);
  const [colorPopoverPos, setColorPopoverPos] = useState<PopoverPos | null>(null);
  const [activeDragId, setActiveDragId] = useState<number | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const closeColorPopover = useCallback(() => {
    setColorPopoverId(null);
    setColorPopoverPos(null);
  }, []);

  useEffect(() => {
    if (open) {
      setNewName('');
      setNewColor(PRESET_COLORS[0]);
      setEditingId(null);
      closeColorPopover();
      setTimeout(() => nameInputRef.current?.focus(), 50);
    }
  }, [open, closeColorPopover]);

  // ESC: カラーポップオーバーが開いていれば先に閉じ、なければモーダルを閉じる
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (colorPopoverId !== null) {
        e.stopPropagation();
        closeColorPopover();
      } else {
        onClose();
      }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [open, colorPopoverId, closeColorPopover, onClose]);

  const handleColorBtnClick = useCallback((id: number, rect: DOMRect) => {
    if (colorPopoverId === id) { closeColorPopover(); return; }
    // ビューポート端の検出: はみ出す場合は逆向きに展開
    const left = Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 8);
    const top = rect.bottom + 6 + POPOVER_HEIGHT > window.innerHeight
      ? rect.top - POPOVER_HEIGHT - 6
      : rect.bottom + 6;
    setColorPopoverId(id);
    setColorPopoverPos({ top, left });
  }, [colorPopoverId, closeColorPopover]);

  const handleAdd = useCallback(async () => {
    const name = newName.trim();
    if (!name) { nameInputRef.current?.focus(); return; }
    if (labels.some((l) => l.name === name)) {
      Toast.error('同じ名前のラベルがすでに存在します');
      nameInputRef.current?.select();
      return;
    }
    await onAdd(name, newColor);
    setNewName('');
  }, [newName, newColor, labels, onAdd]);

  const handleDelete = useCallback(async (label: LabelItem) => {
    if (!(await confirmDialog({ message: `ラベル「${label.name}」を削除しますか？`, danger: true }))) return;
    await onDelete(label.id);
  }, [onDelete]);

  const handleEditSave = useCallback(async (label: LabelItem) => {
    const name = editingName.trim();
    if (!name || name === label.name) { setEditingId(null); return; }
    if (labels.some((l) => l.id !== label.id && l.name === name)) {
      Toast.error('同じ名前のラベルがすでに存在します');
      return;
    }
    await onUpdate(label.id, name, label.color);
    setEditingId(null);
  }, [editingName, labels, onUpdate]);

  const handleColorChange = useCallback(async (label: LabelItem, color: string) => {
    await onUpdate(label.id, label.name, color);
    closeColorPopover();
  }, [onUpdate, closeColorPopover]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(event.active.id as number);
    closeColorPopover();
  }, [closeColorPopover]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveDragId(null);
    if (!onReorder) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = labels.findIndex(l => l.id === active.id);
    const newIdx = labels.findIndex(l => l.id === over.id);
    onReorder(arrayMove([...labels], oldIdx, newIdx));
  }, [labels, onReorder]);

  if (!open) return null;

  const popoverLabel = colorPopoverId !== null ? labels.find(l => l.id === colorPopoverId) : null;
  const activeDragLabel = activeDragId !== null ? labels.find(l => l.id === activeDragId) : null;

  return (
    <>
      {createPortal(
        <div id="label-manager" className={clsx(styles['lmgr'], styles['is-open'])} role="dialog" aria-modal="true" aria-labelledby="lmgr-title">
          <div className={styles['lmgr__backdrop']} onClick={onClose} />
          {/*
            DndContext を .lmgr__dialog の外に置く。
            DragOverlay は position:fixed でインラインレンダリングするため、
            .lmgr__dialog の transform / overflow:hidden に閉じ込められないよう
            dialog の兄弟要素として配置する。
          */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className={styles['lmgr__dialog']}>
              <div className={styles['lmgr__header']}>
                <span className={styles['lmgr__header-icon']} aria-hidden="true">
                  <svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor">
                    <path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3.879a1.5 1.5 0 0 1 1.06.44l8.5 8.5a1.5 1.5 0 0 1 0 2.12l-3.878 3.879a1.5 1.5 0 0 1-2.122 0l-8.5-8.5A1.5 1.5 0 0 1 1 6.38Zm1.5 0v3.879l8.5 8.5 3.879-3.878-8.5-8.5ZM6 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z" />
                  </svg>
                </span>
                <h2 className={styles['lmgr__title']} id="lmgr-title">{title}</h2>
                <button className={styles['lmgr__close']} aria-label="閉じる" onClick={onClose} type="button">
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
                    <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
                  </svg>
                </button>
              </div>

              <div
                className={styles['lmgr__body']}
                onScroll={closeColorPopover}
              >
                {/* 既存ラベル一覧 */}
                <div className={styles['lmgr__section']}>
                  <div className={styles['lmgr__section-header']}>
                    <span className={styles['lmgr__section-title']}>ラベル一覧</span>
                    <span className={styles['lmgr__label-count']}>{labels.length} 件</span>
                  </div>
                  <ul className={styles['lmgr__list']}>
                    {labels.length === 0 ? (
                      <li className={styles['lmgr__empty']}>
                        ラベルがありません。下のフォームから追加してください。
                      </li>
                    ) : (
                      <SortableContext items={labels.map(l => l.id)} strategy={verticalListSortingStrategy}>
                        {labels.map(label => (
                          <SortableLabelItem
                            key={label.id}
                            label={label}
                            editingId={editingId}
                            editingName={editingName}
                            isColorActive={colorPopoverId === label.id}
                            onStartEdit={(l) => { setEditingId(l.id); setEditingName(l.name); }}
                            onEditNameChange={setEditingName}
                            onEditSave={handleEditSave}
                            onEditCancel={() => setEditingId(null)}
                            onDelete={handleDelete}
                            onColorBtnClick={handleColorBtnClick}
                          />
                        ))}
                      </SortableContext>
                    )}
                  </ul>
                </div>

                {/* 新規追加フォーム */}
                <div className={clsx(styles['lmgr__section'], styles['lmgr__add-section'])}>
                  <div className={styles['lmgr__section-header']}>
                    <span className={styles['lmgr__section-title']}>新しいラベルを追加</span>
                  </div>
                  <div className={styles['lmgr__add-preview-wrap']}>
                    {newName.trim() && (
                      <span
                        className={styles['lmgr__add-preview']}
                        style={{
                          background: `${newColor}33`,
                          color: newColor,
                          borderColor: `${newColor}99`,
                        }}
                      >
                        {newName}
                      </span>
                    )}
                  </div>
                  <div className={styles['lmgr__add-row']}>
                    <input
                      ref={nameInputRef}
                      className={styles['lmgr__add-input']}
                      type="text"
                      placeholder="ラベル名を入力..."
                      maxLength={30}
                      autoComplete="off"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAdd();
                      }}
                    />
                    <button className={styles['lmgr__add-btn']} type="button" onClick={handleAdd}>
                      <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true">
                        <path d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z" />
                      </svg>
                      追加
                    </button>
                  </div>
                  <ColorPalette selected={newColor} onSelect={setNewColor} />
                </div>
              </div>
            </div>

            {/* DragOverlay: .lmgr__dialog の兄弟 → overflow:hidden / transform に非依存 */}
            <DragOverlay dropAnimation={null}>
              {activeDragLabel && (
                <div className={styles['lmgr__drag-ghost']}>
                  <GripVertical size={13} />
                  <span
                    className={styles['lmgr__item-chip']}
                    style={{ background: `${activeDragLabel.color}33`, color: activeDragLabel.color, borderColor: `${activeDragLabel.color}99` }}
                  >
                    {activeDragLabel.name}
                  </span>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </div>,
        document.body,
      )}

      {/* カラーポップオーバー: 別ポータルとして body に直接描画 */}
      {popoverLabel && colorPopoverPos && createPortal(
        <>
          {/* 背後クリックで閉じるオーバーレイ */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 399 }}
            onClick={closeColorPopover}
          />
          <div
            className={styles['lmgr__color-popover']}
            style={{ top: colorPopoverPos.top, left: colorPopoverPos.left }}
          >
            <ColorPalette
              selected={popoverLabel.color}
              onSelect={(c) => handleColorChange(popoverLabel, c)}
            />
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
