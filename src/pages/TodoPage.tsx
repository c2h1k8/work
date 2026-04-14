// ==================================================
// TodoPage — Kanban ボード（DnD + ラベル + チェックリスト + 依存関係）
// ==================================================
// kanban_db version 2
// ストア: tasks / columns / labels / task_labels / templates / archives / dependencies / note_links

import '../styles/pages/todo.css';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  DndContext, DragOverlay, closestCorners,
  PointerSensor, useSensor, useSensors,
  type DragStartEvent, type DragEndEvent, type DragOverEvent,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  PlusIcon, XIcon, Trash2Icon, PencilIcon, CheckIcon,
  ArchiveIcon, Settings2Icon, TagIcon,
  LockIcon, CalendarIcon, RotateCcwIcon, FilterIcon,
  GripVerticalIcon, ArrowUpIcon, ArrowDownIcon,
} from 'lucide-react';
import {
  kanbanDB,
  type KanbanTask, type KanbanColumn, type KanbanLabel,
  type KanbanTaskLabel, type ChecklistItem,
  type KanbanArchive, type KanbanDependency,
} from '../db/kanban_db';
import { activityDB } from '../db/activity_db';
import { useToast } from '../components/Toast';

// ── localStorage ───────────────────────────────────────────
const LS_SORT   = 'kanban_sort';
const LS_FILTER = 'kanban_filter_text';

function lsGet(k: string) { return localStorage.getItem(k); }
function lsSet(k: string, v: string) { localStorage.setItem(k, v); }
function lsJson<T>(k: string): T | null {
  try { const v = lsGet(k); return v ? JSON.parse(v) as T : null; } catch { return null; }
}

// ── 日付ユーティリティ ─────────────────────────────────────
function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function isOverdue(due: string, isDoneColumn: boolean): boolean {
  if (!due || isDoneColumn) return false;
  return new Date(due) < new Date(new Date().toDateString());
}

// ── ID生成 ────────────────────────────────────────────────
function newId(): string { return crypto.randomUUID(); }

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// KanbanCard（ドラッグ可能カード）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface CardProps {
  task: KanbanTask;
  labels: KanbanLabel[];
  taskLabels: Map<number, Set<number>>;
  isDoneColumn: boolean;
  blockedBy: Set<number>;
  onClick: () => void;
  overlay?: boolean;
}

const KanbanCard = React.memo(function KanbanCard({ task, labels, taskLabels, isDoneColumn, blockedBy, onClick, overlay }: CardProps) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: `task-${task.id}`,
    data: { type: 'task', taskId: task.id, columnKey: task.column },
  });

  const labelIds = taskLabels.get(task.id!) || new Set();
  const cardLabels = labels.filter((l) => labelIds.has(l.id!));

  const checkDone   = (task.checklist || []).filter((c) => c.done).length;
  const checkTotal  = (task.checklist || []).length;
  const overdue     = isOverdue(task.due_date, isDoneColumn);
  const isBlocked   = blockedBy.size > 0;

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={overlay ? undefined : style}
      className={`group bg-[var(--c-bg)] border rounded-lg p-2 shadow-sm cursor-pointer hover:border-[var(--c-accent)] transition-all select-none
        ${isDragging ? 'opacity-40' : ''}
        ${overdue ? 'border-red-400 dark:border-red-600' : 'border-[var(--c-border)]'}`}
      onClick={onClick}
    >
      {/* ドラッグハンドル + ラベル行 */}
      <div className="flex items-start gap-1 mb-1">
        <span {...attributes} {...listeners}
          className="mt-0.5 text-[var(--c-fg-3)] cursor-grab active:cursor-grabbing hover:text-[var(--c-fg)] shrink-0">
          <GripVerticalIcon size={12} />
        </span>
        <div className="flex-1 min-w-0">
          {cardLabels.length > 0 && (
            <div className="flex flex-wrap gap-0.5 mb-1">
              {cardLabels.map((l) => (
                <span key={l.id} className="px-1.5 py-px rounded-full text-[10px] font-medium text-white"
                  style={{ backgroundColor: l.color }}>{l.name}</span>
              ))}
            </div>
          )}
          <p className="text-sm font-medium text-[var(--c-fg)] break-words leading-snug">{task.title}</p>
        </div>
      </div>
      {/* フッターバッジ */}
      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
        {task.due_date && (
          <span className={`flex items-center gap-0.5 text-[10px] px-1 py-px rounded ${overdue ? 'bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-300' : 'bg-[var(--c-bg-2)] text-[var(--c-fg-3)]'}`}>
            <CalendarIcon size={9} />{formatDate(task.due_date)}
          </span>
        )}
        {checkTotal > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] px-1 py-px rounded bg-[var(--c-bg-2)] text-[var(--c-fg-3)]">
            <CheckIcon size={9} />{checkDone}/{checkTotal}
          </span>
        )}
        {task.recurring && (
          <span className="text-[10px] text-[var(--c-fg-3)]"><RotateCcwIcon size={9} /></span>
        )}
        {isBlocked && (
          <span className="text-[10px] text-amber-500"><LockIcon size={9} /></span>
        )}
      </div>
    </div>
  );
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// KanbanColumn（ドロップターゲット）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface ColumnProps {
  column: KanbanColumn;
  tasks: KanbanTask[];
  allTasks: KanbanTask[];
  labels: KanbanLabel[];
  taskLabels: Map<number, Set<number>>;
  dependencies: Map<number, { blockedBy: Set<number> }>;
  onCardClick: (task: KanbanTask) => void;
  onAddCard: (columnKey: string, title: string) => void;
  onArchiveColumn: (columnKey: string) => void;
  onEditColumn: (column: KanbanColumn) => void;
}

const KanbanColumnView = React.memo(function KanbanColumnView({
  column, tasks, labels, taskLabels, dependencies,
  onCardClick, onAddCard, onArchiveColumn, onEditColumn,
}: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${column.key}` });
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const wipExceeded = (column.wip_limit ?? 0) > 0 && tasks.length > (column.wip_limit ?? 0);

  function startAdd() { setAdding(true); setTimeout(() => inputRef.current?.focus(), 10); }

  function commitAdd() {
    if (newTitle.trim()) {
      onAddCard(column.key, newTitle.trim());
    }
    setNewTitle('');
    setAdding(false);
  }

  return (
    <div className={`flex flex-col rounded-xl border transition-colors shrink-0 w-64
      ${isOver ? 'border-[var(--c-accent)] bg-[var(--c-accent)]/5' : 'border-[var(--c-border)] bg-[var(--c-bg-2)]'}`}
      style={{ maxHeight: 'calc(100vh - 120px)' }}>
      {/* ヘッダー */}
      <div className={`flex items-center gap-2 px-3 py-2 rounded-t-xl border-b border-[var(--c-border)] shrink-0
        ${wipExceeded ? 'bg-red-50 dark:bg-red-950' : ''}`}>
        <span className="flex-1 font-semibold text-sm text-[var(--c-fg)] truncate">{column.name}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded-full font-mono
          ${wipExceeded ? 'bg-red-500 text-white' : 'bg-[var(--c-bg)] text-[var(--c-fg-3)]'}`}>
          {tasks.length}{column.wip_limit ? `/${column.wip_limit}` : ''}
        </span>
        {column.done && (
          <button onClick={() => onArchiveColumn(column.key)} title="一括アーカイブ" aria-label={`${column.name}を一括アーカイブ`}
            className="p-0.5 rounded hover:bg-[var(--c-bg)] text-[var(--c-fg-3)] hover:text-[var(--c-fg)]">
            <ArchiveIcon size={12} aria-hidden="true" />
          </button>
        )}
        <button onClick={() => onEditColumn(column)} aria-label={`${column.name}を編集`}
          className="p-0.5 rounded hover:bg-[var(--c-bg)] text-[var(--c-fg-3)] hover:text-[var(--c-fg)]">
          <Settings2Icon size={12} aria-hidden="true" />
        </button>
        <button onClick={startAdd} aria-label={`${column.name}にタスクを追加`}
          className="p-0.5 rounded hover:bg-[var(--c-bg)] text-[var(--c-fg-3)] hover:text-[var(--c-fg)]">
          <PlusIcon size={14} aria-hidden="true" />
        </button>
      </div>
      {/* カード一覧 */}
      <div ref={setNodeRef} className="flex-1 overflow-y-auto p-2 space-y-2">
        <SortableContext items={tasks.map((t) => `task-${t.id!}`)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <KanbanCard
              key={task.id}
              task={task}
              labels={labels}
              taskLabels={taskLabels}
              isDoneColumn={column.done || false}
              blockedBy={dependencies.get(task.id!)?.blockedBy || new Set()}
              onClick={() => onCardClick(task)}
            />
          ))}
        </SortableContext>
        {/* 追加フォーム */}
        {adding && (
          <div className="mt-1">
            <input
              ref={inputRef}
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) commitAdd();
                if (e.key === 'Escape') { setAdding(false); setNewTitle(''); }
              }}
              onBlur={commitAdd}
              placeholder="タイトルを入力…"
              className="w-full px-2 py-1.5 rounded border border-[var(--c-accent)] bg-[var(--c-bg)] text-[var(--c-fg)] text-sm focus:outline-none"
            />
          </div>
        )}
        {tasks.length === 0 && !adding && (
          <div className="text-xs text-[var(--c-fg-3)] text-center py-4 opacity-50">タスクがありません</div>
        )}
      </div>
    </div>
  );
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TaskModal（タスク詳細編集）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface TaskModalProps {
  task: KanbanTask;
  columns: KanbanColumn[];
  labels: KanbanLabel[];
  taskLabels: Set<number>;
  onClose: () => void;
  onSaved: (task: KanbanTask) => void;
  onDeleted: (id: number) => void;
  onArchived: (task: KanbanTask) => void;
}

function TaskModal({ task, columns, labels, taskLabels, onClose, onSaved, onDeleted, onArchived }: TaskModalProps) {
  const toast = useToast();
  const [title,       setTitle]       = useState(task.title);
  const [description, setDescription] = useState(task.description || '');
  const [dueDate,     setDueDate]     = useState(task.due_date || '');
  const [column,      setColumn]      = useState(task.column);
  const [checklist,   setChecklist]   = useState<ChecklistItem[]>(task.checklist || []);
  const [newCheckText, setNewCheckText] = useState('');
  const [selectedLabels, setSelectedLabels] = useState<Set<number>>(new Set(taskLabels));
  const [recurring,   setRecurring]   = useState(task.recurring ?? null);
  const [dirty,       setDirty]       = useState(false);
  const [isOpen,      setIsOpen]      = useState(false);

  // マウント後にアニメーション開始
  useEffect(() => {
    requestAnimationFrame(() => setIsOpen(true));
  }, []);

  function mark() { setDirty(true); }

  function handleClose() {
    setIsOpen(false);
    setTimeout(() => {
      if (dirty) handleSave();
      onClose();
    }, 300);
  }

  async function handleSave() {
    const updated = await kanbanDB.updateTask(task.id!, {
      title, description, due_date: dueDate, column,
      checklist: checklist.length > 0 ? checklist : null,
      recurring: recurring || null,
    });
    // ラベル同期
    const currentLabels = new Set(taskLabels);
    for (const lid of selectedLabels) { if (!currentLabels.has(lid)) await kanbanDB.addTaskLabel(task.id!, lid); }
    for (const lid of currentLabels)  { if (!selectedLabels.has(lid)) await kanbanDB.removeTaskLabel(task.id!, lid); }
    onSaved(updated);
  }

  async function handleDelete() {
    if (!confirm(`「${task.title}」を削除しますか？`)) return;
    await kanbanDB.deleteTask(task.id!);
    await activityDB.add({ page: 'todo', action: 'delete', target_type: 'task', target_id: String(task.id!), summary: task.title, created_at: new Date().toISOString() });
    onDeleted(task.id!);
    toast.success('削除しました');
  }

  async function handleArchive() {
    await kanbanDB.archiveTask(task);
    await kanbanDB.deleteTask(task.id!);
    await activityDB.add({ page: 'todo', action: 'archive', target_type: 'task', target_id: String(task.id!), summary: task.title, created_at: new Date().toISOString() });
    onArchived(task);
    toast.success('アーカイブしました');
  }

  function addChecklist() {
    if (!newCheckText.trim()) return;
    const item: ChecklistItem = { id: newId(), text: newCheckText.trim(), done: false, position: checklist.length };
    setChecklist([...checklist, item]);
    setNewCheckText('');
    mark();
  }

  function toggleCheck(id: string) {
    setChecklist(checklist.map((c) => c.id === id ? { ...c, done: !c.done } : c));
    mark();
  }

  function deleteCheck(id: string) {
    setChecklist(checklist.filter((c) => c.id !== id));
    mark();
  }

  function toggleLabel(lid: number) {
    const next = new Set(selectedLabels);
    if (next.has(lid)) next.delete(lid); else next.add(lid);
    setSelectedLabels(next);
    mark();
  }

  // タイトル自動保存（500ms debounce）
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleTitleChange(v: string) {
    setTitle(v);
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(() => {
      kanbanDB.updateTask(task.id!, { title: v });
    }, 500);
  }

  const doneCheck = checklist.filter((c) => c.done).length;
  const overdue = isOverdue(dueDate, columns.find((c) => c.key === column)?.done || false);

  return (
    <div className={`modal${isOpen ? ' is-open' : ''}`} role="dialog" aria-modal="true" aria-label="タスク編集">
      {/* 背景オーバーレイ */}
      <div className="modal__backdrop" onClick={handleClose} />

      {/* 右サイドドロワー */}
      <div className="modal__dialog">
        {/* ヘッダー */}
        <div className="modal__header">
          <div className="modal__title-row">
            <input
              className="modal__title-input"
              value={title}
              onChange={(e) => { handleTitleChange(e.target.value); mark(); }}
              aria-label="タスクタイトル"
              autoFocus
            />
          </div>
          <button className="modal__close" onClick={handleClose} aria-label="閉じる">
            <XIcon size={16} aria-hidden="true" />
          </button>
        </div>

        {/* ボディ（2カラム） */}
        <div className="modal__body">
          {/* メインエリア */}
          <div className="modal__main">
            {/* 説明セクション */}
            <div className="modal__section">
              <h4 className="modal__section-title">説明</h4>
              <textarea
                className="modal__description"
                value={description}
                onChange={(e) => { setDescription(e.target.value); mark(); }}
                placeholder="説明を入力…"
              />
            </div>

            {/* チェックリストセクション */}
            <div className="modal__section">
              <h4 className="modal__section-title">
                <CheckIcon size={14} aria-hidden="true" />
                チェックリスト
                {checklist.length > 0 && (
                  <span style={{ fontWeight: 400, fontSize: '12px', color: 'var(--color-text-muted)' }}>
                    （{doneCheck}/{checklist.length}）
                  </span>
                )}
              </h4>
              <div className="checklist-items">
                {checklist.map((item) => (
                  <div key={item.id} className={`checklist-item${item.done ? ' is-checked' : ''}`}
                    onClick={() => { toggleCheck(item.id); mark(); }}>
                    <span className="checklist-check-icon">
                      {item.done && <CheckIcon size={10} />}
                    </span>
                    <span className="checklist-label">{item.text}</span>
                    <button className="checklist-item__del"
                      onClick={(e) => { e.stopPropagation(); deleteCheck(item.id); }}
                      aria-label="削除">
                      <XIcon size={12} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="checklist-add-row">
                <input
                  className="checklist-new-input"
                  value={newCheckText}
                  onChange={(e) => setNewCheckText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addChecklist(); }}
                  placeholder="項目を追加…"
                />
                <button className="modal-action-btn" onClick={addChecklist}>追加</button>
              </div>
            </div>
          </div>

          {/* サイドバー */}
          <div className="modal__sidebar">
            {/* カラム */}
            <div className="modal__sidebar-item">
              <span className="modal__sidebar-label">カラム</span>
              <select className="modal__select" value={column}
                onChange={(e) => { setColumn(e.target.value); mark(); }}>
                {columns.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
              </select>
            </div>

            {/* 期日 */}
            <div className="modal__sidebar-item">
              <span className="modal__sidebar-label">期日</span>
              <input
                type="date"
                className={`modal__select${overdue ? ' modal__date-display--overdue' : ''}`}
                value={dueDate}
                onChange={(e) => { setDueDate(e.target.value); mark(); }}
              />
              {dueDate && (
                <button onClick={() => { setDueDate(''); mark(); }} className="modal-clear-btn">
                  クリア
                </button>
              )}
            </div>

            {/* ラベル */}
            {labels.length > 0 && (
              <div className="modal__sidebar-item">
                <span className="modal__sidebar-label">ラベル</span>
                <div className="modal__label-list">
                  {labels.map((l) => (
                    <button key={l.id}
                      onClick={() => toggleLabel(l.id!)}
                      style={{ backgroundColor: l.color, color: '#fff', opacity: selectedLabels.has(l.id!) ? 1 : 0.3 }}
                      className="modal-existing-label">
                      {l.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 繰り返し */}
            <div className="modal__sidebar-item">
              <span className="modal__sidebar-label">繰り返し</span>
              <label className="modal-check-label">
                <input type="checkbox" checked={!!recurring}
                  onChange={(e) => { setRecurring(e.target.checked ? { interval: 'weekly', next_date: '' } : null); mark(); }} />
                有効
              </label>
              {recurring && (
                <select className="modal__select" value={recurring.interval}
                  onChange={(e) => { setRecurring({ ...recurring, interval: e.target.value as 'daily' | 'weekly' | 'monthly' }); mark(); }}>
                  <option value="daily">毎日</option>
                  <option value="weekly">毎週</option>
                  <option value="monthly">毎月</option>
                </select>
              )}
            </div>

            {/* アクション */}
            <div className="modal__sidebar-item modal__sidebar-actions">
              <button onClick={() => { handleSave(); onClose(); }} className="modal-save-btn">
                保存
              </button>
              <button onClick={handleArchive} className="modal-archive-btn">
                <ArchiveIcon size={13} aria-hidden="true" />アーカイブ
              </button>
              <button onClick={handleDelete} className="modal-delete-btn">
                <Trash2Icon size={13} aria-hidden="true" />削除
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ColumnEditModal（カラム設定）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface ColumnEditModalProps {
  column: KanbanColumn | null;  // null = 新規
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: (key: string) => void;
  taskCount?: number;
}

function ColumnEditModal({ column, onClose, onSaved, onDeleted, taskCount }: ColumnEditModalProps) {
  const [name,     setName]     = useState(column?.name || '新しいカラム');
  const [wipLimit, setWipLimit] = useState(String(column?.wip_limit ?? 0));
  const [done,     setDone]     = useState(column?.done || false);

  async function handleSave() {
    if (column) {
      await kanbanDB.updateColumn({ ...column, name, wip_limit: parseInt(wipLimit) || 0, done });
    } else {
      const all = await kanbanDB.getAllColumns();
      const pos = all.length;
      const key = 'col_' + Date.now();
      await kanbanDB.addColumn(name, key, pos);
    }
    onSaved();
    onClose();
  }

  async function handleDelete() {
    if (!column) return;
    if ((taskCount ?? 0) > 0) {
      alert(`このカラムには ${taskCount} 件のタスクがあります。タスクを別のカラムに移動してから削除してください。`);
      return;
    }
    if (!confirm(`「${column.name}」を削除しますか？`)) return;
    await kanbanDB.deleteColumn(column.id!);
    onDeleted?.(column.key);
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[var(--c-bg)] rounded-xl border border-[var(--c-border)] w-80" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--c-border)]">
          <h3 className="font-semibold text-[var(--c-fg)] text-sm">{column ? 'カラムを編集' : 'カラムを追加'}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--c-bg-2)] text-[var(--c-fg-3)]"><XIcon size={14} /></button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-xs text-[var(--c-fg-3)]">カラム名</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-1.5 rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] focus:outline-none focus:border-[var(--c-accent)]" />
          </div>
          <div>
            <label className="text-xs text-[var(--c-fg-3)]">WIP 上限（0=無制限）</label>
            <input type="number" min="0" value={wipLimit} onChange={(e) => setWipLimit(e.target.value)}
              className="w-full px-3 py-1.5 rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] focus:outline-none focus:border-[var(--c-accent)]" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} className="accent-[var(--c-accent)]" />
            <span className="text-sm text-[var(--c-fg)]">完了カラム</span>
          </label>
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--c-border)]">
          {column ? (
            <button onClick={handleDelete} className="px-2 py-1.5 rounded border border-red-300 text-red-500 text-xs hover:bg-red-50 dark:hover:bg-red-950">削除</button>
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
// LabelManagerModal（ラベル管理）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface LabelManagerModalProps {
  labels: KanbanLabel[];
  onClose: () => void;
  onChanged: () => void;
}

const PRESET_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b'];

function LabelManagerModal({ labels, onClose, onChanged }: LabelManagerModalProps) {
  const [newName,  setNewName]  = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [editing,  setEditing]  = useState<KanbanLabel | null>(null);

  async function addLabel() {
    if (!newName.trim()) return;
    await kanbanDB.addLabel(newName.trim(), newColor);
    setNewName('');
    onChanged();
  }

  async function saveEdit() {
    if (!editing?.id) return;
    await kanbanDB.updateLabel(editing.id, editing.name, editing.color);
    setEditing(null);
    onChanged();
  }

  async function deleteLabel(id: number) {
    if (!confirm('削除しますか？')) return;
    await kanbanDB.deleteLabel(id);
    onChanged();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[var(--c-bg)] rounded-xl border border-[var(--c-border)] w-80 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--c-border)]">
          <h3 className="font-semibold text-[var(--c-fg)] text-sm flex items-center gap-2"><TagIcon size={14} />ラベル管理</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--c-bg-2)] text-[var(--c-fg-3)]"><XIcon size={14} /></button>
        </div>
        <div className="p-4 space-y-3">
          {labels.map((l) => (
            <div key={l.id} className="flex items-center gap-2">
              {editing?.id === l.id ? (
                <>
                  <input type="color" value={editing!.color} onChange={(e) => setEditing((prev) => prev ? { ...prev, color: e.target.value } : prev)}
                    className="w-6 h-6 rounded cursor-pointer border-0 p-0" />
                  <input value={editing!.name} onChange={(e) => setEditing((prev) => prev ? { ...prev, name: e.target.value } : prev)}
                    className="flex-1 px-2 py-0.5 rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] text-sm focus:outline-none" />
                  <button onClick={saveEdit} className="p-0.5 text-green-500"><CheckIcon size={14} /></button>
                  <button onClick={() => setEditing(null)} className="p-0.5 text-[var(--c-fg-3)]"><XIcon size={12} /></button>
                </>
              ) : (
                <>
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                  <span className="flex-1 text-sm text-[var(--c-fg)]">{l.name}</span>
                  <button onClick={() => setEditing(l)} className="p-0.5 text-[var(--c-fg-3)] hover:text-[var(--c-fg)]"><PencilIcon size={12} /></button>
                  <button onClick={() => deleteLabel(l.id!)} className="p-0.5 text-red-400 hover:text-red-500"><Trash2Icon size={12} /></button>
                </>
              )}
            </div>
          ))}
          {/* 追加フォーム */}
          <div className="flex gap-1 pt-2 border-t border-[var(--c-border)]">
            <div className="flex gap-1">
              {PRESET_COLORS.map((c) => (
                <button key={c} onClick={() => setNewColor(c)}
                  className={`w-4 h-4 rounded-full shrink-0 ${newColor === c ? 'ring-2 ring-[var(--c-accent)] ring-offset-1' : ''}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <div className="flex gap-1">
            <input value={newName} onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addLabel(); }}
              placeholder="ラベル名"
              className="flex-1 px-2 py-1 rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] text-sm focus:outline-none" />
            <button onClick={addLabel}
              className="px-2 py-1 rounded bg-[var(--c-accent)] text-white text-sm">追加</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ArchiveModal（アーカイブ管理）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface ArchiveModalProps {
  columns: KanbanColumn[];
  onClose: () => void;
  onRestored: () => void;
}

function ArchiveModal({ columns, onClose, onRestored }: ArchiveModalProps) {
  const toast = useToast();
  const [archives, setArchives] = useState<KanbanArchive[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => { kanbanDB.getAllArchives().then(setArchives); }, []);

  const filtered = useMemo(() =>
    archives.filter((a) => !search || a.title.toLowerCase().includes(search.toLowerCase())),
    [archives, search]
  );

  async function restore(archive: KanbanArchive) {
    const allTasks = await kanbanDB.getAllTasks();
    const colTasks = allTasks.filter((t) => t.column === archive.column);
    await kanbanDB.addTask({ ...archive, id: undefined, position: colTasks.length, checklist: archive.checklist ?? null });
    await kanbanDB.deleteArchive(archive.id!);
    setArchives((prev) => prev.filter((a) => a.id !== archive.id));
    onRestored();
    toast.success('復元しました');
  }

  async function deleteArchive(id: number) {
    await kanbanDB.deleteArchive(id);
    setArchives((prev) => prev.filter((a) => a.id !== id));
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[var(--c-bg)] rounded-xl border border-[var(--c-border)] w-full max-w-lg max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--c-border)]">
          <h3 className="font-semibold text-[var(--c-fg)] text-sm flex items-center gap-2"><ArchiveIcon size={14} />アーカイブ</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--c-bg-2)] text-[var(--c-fg-3)]"><XIcon size={14} /></button>
        </div>
        <div className="p-3 border-b border-[var(--c-border)]">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="検索…"
            className="w-full px-3 py-1.5 rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] text-sm focus:outline-none" />
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-[var(--c-border)]">
          {filtered.map((a) => {
            const colName = columns.find((c) => c.key === a.column)?.name || a.column;
            return (
              <div key={a.id} className="flex items-center gap-2 px-4 py-2 hover:bg-[var(--c-bg-2)]">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-[var(--c-fg)] truncate">{a.title}</div>
                  <div className="text-xs text-[var(--c-fg-3)]">{colName} · {new Date(a.archived_at).toLocaleDateString('ja-JP')}</div>
                </div>
                <button onClick={() => restore(a)}
                  className="px-2 py-0.5 rounded border border-[var(--c-accent)] text-[var(--c-accent)] text-xs shrink-0">復元</button>
                <button onClick={() => deleteArchive(a.id!)}
                  className="p-0.5 rounded text-red-400 hover:text-red-500 shrink-0"><Trash2Icon size={12} /></button>
              </div>
            );
          })}
          {filtered.length === 0 && <div className="px-4 py-8 text-center text-xs text-[var(--c-fg-3)]">アーカイブがありません</div>}
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// メインコンポーネント
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DEFAULT_COLUMNS: Omit<KanbanColumn, 'id'>[] = [
  { key: 'backlog',     name: 'バックログ', position: 0 },
  { key: 'in_progress', name: '進行中',     position: 1 },
  { key: 'review',      name: 'レビュー',   position: 2 },
  { key: 'done',        name: '完了',       position: 3, done: true },
];

export function TodoPage() {
  const toast = useToast();

  const [columns,     setColumns]     = useState<KanbanColumn[]>([]);
  const [tasksMap,    setTasksMap]    = useState<Record<string, KanbanTask[]>>({});
  const [labels,      setLabels]      = useState<KanbanLabel[]>([]);
  const [taskLabels,  setTaskLabels]  = useState<Map<number, Set<number>>>(new Map());
  const [dependencies, setDependencies] = useState<Map<number, { blockedBy: Set<number> }>>(new Map());

  // モーダル・UI 状態
  const [selectedTask,    setSelectedTask]    = useState<KanbanTask | null>(null);
  const [selectedTaskLabels, setSelectedTaskLabels] = useState<Set<number>>(new Set());
  const [editingColumn,  setEditingColumn]   = useState<KanbanColumn | null | undefined>(undefined);
  const [showLabelMgr,   setShowLabelMgr]    = useState(false);
  const [showArchive,    setShowArchive]      = useState(false);

  // フィルター・ソート
  const [filterText,    setFilterText]    = useState(() => lsGet(LS_FILTER) || '');
  const [filterLabels,  setFilterLabels]  = useState<Set<number>>(new Set());
  const [showFilter,    setShowFilter]    = useState(false);
  const [sort,          setSort]          = useState<{ field: string; dir: 'asc' | 'desc' }>(
    () => lsJson<{ field: string; dir: 'asc' | 'desc' }>(LS_SORT) || { field: 'position', dir: 'asc' }
  );

  // DnD
  const [dragTaskId, setDragTaskId] = useState<number | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  // ── データ読み込み ────────────────────────────────────────
  const load = useCallback(async () => {
    let cols = await kanbanDB.getAllColumns();
    if (cols.length === 0) {
      // 初回: デフォルトカラムを作成
      for (const c of DEFAULT_COLUMNS) await kanbanDB.addColumn(c.name, c.key, c.position);
      cols = await kanbanDB.getAllColumns();
    }
    cols.sort((a, b) => a.position - b.position);
    setColumns(cols);

    const allTasks = await kanbanDB.getAllTasks();
    const map: Record<string, KanbanTask[]> = {};
    cols.forEach((c) => { map[c.key] = []; });
    allTasks.forEach((t) => { if (map[t.column]) map[t.column].push(t); });
    Object.keys(map).forEach((k) => { map[k].sort((a, b) => a.position - b.position); });
    setTasksMap(map);

    const allLabels = await kanbanDB.getAllLabels();
    setLabels(allLabels);

    const allTaskLabels = await kanbanDB.task_labels.toArray();
    const tlMap = new Map<number, Set<number>>();
    allTaskLabels.forEach((tl: KanbanTaskLabel) => {
      if (!tlMap.has(tl.task_id)) tlMap.set(tl.task_id, new Set());
      tlMap.get(tl.task_id)!.add(tl.label_id);
    });
    setTaskLabels(tlMap);

    // 依存関係の構築
    const allDeps = await kanbanDB.dependencies.toArray();
    const depsMap = new Map<number, { blockedBy: Set<number> }>();
    allTasks.forEach((t) => { depsMap.set(t.id!, { blockedBy: new Set() }); });
    allDeps.forEach((d: KanbanDependency) => {
      if (!depsMap.has(d.to_task_id)) depsMap.set(d.to_task_id, { blockedBy: new Set() });
      depsMap.get(d.to_task_id)!.blockedBy.add(d.from_task_id);
    });
    setDependencies(depsMap);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── フィルター適用 ────────────────────────────────────────
  const filteredTasksMap = useMemo((): Record<string, KanbanTask[]> => {
    const result: Record<string, KanbanTask[]> = {};
    const q = filterText.toLowerCase();

    for (const [key, tasks] of Object.entries(tasksMap)) {
      let filtered = tasks;
      if (q) filtered = filtered.filter((t) => t.title.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q));
      if (filterLabels.size > 0) {
        filtered = filtered.filter((t) => {
          const tls = taskLabels.get(t.id!) || new Set();
          return [...filterLabels].some((lid) => tls.has(lid));
        });
      }
      // ソート
      if (sort.field !== 'position') {
        filtered = [...filtered].sort((a, b) => {
          let va: string | number = '', vb: string | number = '';
          if (sort.field === 'title')      { va = a.title.toLowerCase(); vb = b.title.toLowerCase(); }
          else if (sort.field === 'due')   { va = a.due_date || '9999'; vb = b.due_date || '9999'; }
          else if (sort.field === 'created') { va = a.created_at; vb = b.created_at; }
          if (va < vb) return sort.dir === 'asc' ? -1 : 1;
          if (va > vb) return sort.dir === 'asc' ? 1 : -1;
          return 0;
        });
      }
      result[key] = filtered;
    }
    return result;
  }, [tasksMap, filterText, filterLabels, sort, taskLabels]);

  // ── タスク追加 ────────────────────────────────────────────
  const addTask = useCallback(async (columnKey: string, title: string) => {
    const colTasks = tasksMap[columnKey] || [];
    const task = await kanbanDB.addTask({ title, column: columnKey, position: colTasks.length });
    await activityDB.add({ page: 'todo', action: 'create', target_type: 'task', target_id: String(task.id!), summary: title, created_at: new Date().toISOString() });
    await load();
    toast.success('タスクを追加しました');
  }, [tasksMap, load, toast]);

  // ── タスク選択 ────────────────────────────────────────────
  const openTask = useCallback(async (task: KanbanTask) => {
    const tls = await kanbanDB.getTaskLabels(task.id!);
    setSelectedTaskLabels(new Set(tls.map((tl) => tl.label_id)));
    setSelectedTask(task);
  }, []);

  // ── アーカイブ一括（完了カラム） ───────────────────────────
  const archiveColumn = useCallback(async (columnKey: string) => {
    const tasks = tasksMap[columnKey] || [];
    if (!tasks.length) return;
    if (!confirm(`${tasks.length} 件のタスクをアーカイブしますか？`)) return;
    for (const t of tasks) {
      await kanbanDB.archiveTask(t);
      await kanbanDB.deleteTask(t.id!);
    }
    await load();
    toast.success('アーカイブしました');
  }, [tasksMap, load, toast]);

  // ── 繰り返しタスク生成 ────────────────────────────────────
  async function createRecurringNext(task: KanbanTask) {
    if (!task.recurring) return;
    const { interval } = task.recurring;
    const base = task.due_date ? new Date(task.due_date) : new Date();
    if (interval === 'daily')   base.setDate(base.getDate() + 1);
    else if (interval === 'weekly')  base.setDate(base.getDate() + 7);
    else if (interval === 'monthly') base.setMonth(base.getMonth() + 1);
    const nextDate = base.toISOString().slice(0, 10);
    const firstCol = columns[0];
    if (!firstCol) return;
    const colTasks = tasksMap[firstCol.key] || [];
    await kanbanDB.addTask({ ...task, id: undefined, column: firstCol.key, position: colTasks.length, due_date: nextDate, recurring: { interval, next_date: nextDate } });
  }

  // ── DnD イベント ──────────────────────────────────────────
  const dragOverColumnRef = useRef<string | null>(null);

  function handleDragStart(event: DragStartEvent) {
    const { data } = event.active;
    if (data.current?.type === 'task') {
      setDragTaskId(data.current.taskId as number);
    }
  }

  function handleDragOver(event: DragOverEvent) {
    const { over } = event;
    if (!over) return;
    const overId = String(over.id);
    if (overId.startsWith('col-')) {
      dragOverColumnRef.current = overId.replace('col-', '');
    } else if (overId.startsWith('task-')) {
      // タスクの上にホバー中: そのタスクのカラムを記録
      const overTaskId = parseInt(overId.replace('task-', ''));
      for (const [key, tasks] of Object.entries(tasksMap)) {
        if (tasks.some((t) => t.id === overTaskId)) {
          dragOverColumnRef.current = key;
          break;
        }
      }
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setDragTaskId(null);
    if (!over) return;

    const activeTaskId = parseInt(String(active.id).replace('task-', ''));
    if (isNaN(activeTaskId)) return;

    const overId = String(over.id);
    let targetColumnKey: string | null = null;
    let overTaskId: number | null = null;

    if (overId.startsWith('col-')) {
      targetColumnKey = overId.replace('col-', '');
    } else if (overId.startsWith('task-')) {
      overTaskId = parseInt(overId.replace('task-', ''));
      // ターゲットタスクのカラムを見つける
      for (const [key, tasks] of Object.entries(tasksMap)) {
        if (tasks.some((t) => t.id === overTaskId)) {
          targetColumnKey = key;
          break;
        }
      }
    }

    if (!targetColumnKey) return;

    // ドラッグ元のカラムを特定
    let sourceColumnKey: string | null = null;
    let sourceTask: KanbanTask | null = null;
    for (const [key, tasks] of Object.entries(tasksMap)) {
      const task = tasks.find((t) => t.id === activeTaskId);
      if (task) { sourceColumnKey = key; sourceTask = task; break; }
    }
    if (!sourceTask || !sourceColumnKey) return;

    if (sourceColumnKey === targetColumnKey && overTaskId === null) return;
    if (sourceColumnKey === targetColumnKey && overTaskId === activeTaskId) return;

    // 楽観的更新
    const newMap = { ...tasksMap };
    const sourceTasks = [...(newMap[sourceColumnKey] || [])];
    const activeIdx = sourceTasks.findIndex((t) => t.id === activeTaskId);
    if (activeIdx === -1) return;
    const [movedTask] = sourceTasks.splice(activeIdx, 1);

    const isDoneColumn = columns.find((c) => c.key === targetColumnKey)?.done || false;

    if (sourceColumnKey !== targetColumnKey) {
      movedTask.column = targetColumnKey;
      // 繰り返しタスクの場合、完了カラムに移したら次のタスクを生成
      if (isDoneColumn && movedTask.recurring) {
        await createRecurringNext(movedTask);
      }
    }

    const targetTasks = sourceColumnKey === targetColumnKey ? sourceTasks : [...(newMap[targetColumnKey] || [])];
    if (overTaskId !== null) {
      const overIdx = targetTasks.findIndex((t) => t.id === overTaskId);
      targetTasks.splice(overIdx >= 0 ? overIdx : targetTasks.length, 0, movedTask);
    } else {
      targetTasks.push(movedTask);
    }

    // position を再計算
    targetTasks.forEach((t, i) => { t.position = i; });
    if (sourceColumnKey !== targetColumnKey) sourceTasks.forEach((t, i) => { t.position = i; });

    newMap[sourceColumnKey] = sourceTasks;
    newMap[targetColumnKey] = targetTasks;
    setTasksMap(newMap);

    // DB 更新
    await kanbanDB.updateTask(activeTaskId, { column: targetColumnKey, position: movedTask.position });
    await Promise.all(targetTasks.map((t) => kanbanDB.updateTask(t.id!, { position: t.position })));
    if (sourceColumnKey !== targetColumnKey) {
      await Promise.all(sourceTasks.map((t) => kanbanDB.updateTask(t.id!, { position: t.position })));
    }
    if (isDoneColumn && movedTask.recurring) await load();
  }

  // ── ドラッグ中のカード ────────────────────────────────────
  const dragTask = useMemo(() => {
    if (!dragTaskId) return null;
    for (const tasks of Object.values(tasksMap)) {
      const t = tasks.find((t) => t.id === dragTaskId);
      if (t) return t;
    }
    return null;
  }, [dragTaskId, tasksMap]);

  // ── タスク保存後の処理 ────────────────────────────────────
  async function handleTaskSaved(_updated: KanbanTask) {
    setSelectedTask(null);
    setSelectedTaskLabels(new Set());
    await load();
  }

  // ── タスク削除後の処理 ────────────────────────────────────
  function handleTaskDeleted(_id: number) {
    setSelectedTask(null);
    setSelectedTaskLabels(new Set());
    load();
  }

  // ── カラム編集モーダルを開く ─────────────────────────────
  const openEditColumn = useCallback((c: KanbanColumn) => setEditingColumn(c), []);

  // ── ソート変更 ────────────────────────────────────────────
  function changeSort(field: string) {
    const next = sort.field === field && sort.dir === 'asc'
      ? { field, dir: 'desc' as const }
      : { field, dir: 'asc' as const };
    setSort(next);
    lsSet(LS_SORT, JSON.stringify(next));
  }

  // ── フィルターラベルトグル ────────────────────────────────
  function toggleFilterLabel(lid: number) {
    setFilterLabels((prev) => {
      const next = new Set(prev);
      if (next.has(lid)) next.delete(lid); else next.add(lid);
      return next;
    });
  }

  const totalTasks = Object.values(tasksMap).reduce((sum, tasks) => sum + tasks.length, 0);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[var(--c-bg)]">
      {/* ツールバー */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--c-border)] shrink-0">
        {/* 検索 */}
        <div className="relative">
          <input
            value={filterText}
            onChange={(e) => { setFilterText(e.target.value); lsSet(LS_FILTER, e.target.value); }}
            placeholder="検索…"
            className="pl-3 pr-8 py-1 rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] text-sm focus:outline-none focus:border-[var(--c-accent)] w-40"
          />
          {filterText && (
            <button onClick={() => { setFilterText(''); lsSet(LS_FILTER, ''); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--c-fg-3)]"><XIcon size={10} /></button>
          )}
        </div>

        {/* フィルター */}
        <div className="relative">
          <button onClick={() => setShowFilter(!showFilter)}
            className={`flex items-center gap-1 px-2 py-1 rounded border text-xs transition-colors
              ${filterLabels.size > 0 || showFilter ? 'bg-[var(--c-accent)] text-white border-[var(--c-accent)]' : 'border-[var(--c-border)] text-[var(--c-fg-2)]'}`}>
            <FilterIcon size={12} />フィルター
            {filterLabels.size > 0 && <span className="font-bold">{filterLabels.size}</span>}
          </button>
          {showFilter && labels.length > 0 && (
            <div className="absolute top-full left-0 mt-1 z-20 bg-[var(--c-bg)] border border-[var(--c-border)] rounded-lg shadow-lg p-2 min-w-[160px]">
              <div className="text-xs font-medium text-[var(--c-fg-2)] mb-1">ラベル</div>
              {labels.map((l) => (
                <label key={l.id} className="flex items-center gap-1.5 px-1 py-0.5 rounded hover:bg-[var(--c-bg-2)] cursor-pointer">
                  <input type="checkbox" checked={filterLabels.has(l.id!)} onChange={() => toggleFilterLabel(l.id!)}
                    className="accent-[var(--c-accent)]" />
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                  <span className="text-xs text-[var(--c-fg)]">{l.name}</span>
                </label>
              ))}
              {filterLabels.size > 0 && (
                <button onClick={() => setFilterLabels(new Set())}
                  className="mt-1 text-xs text-[var(--c-fg-3)] hover:text-[var(--c-fg)] w-full text-left px-1">クリア</button>
              )}
            </div>
          )}
        </div>

        {/* ソート */}
        <div className="flex gap-1">
          {[
            { field: 'position', label: '並び' },
            { field: 'due',      label: '期限' },
            { field: 'created',  label: '作成' },
          ].map(({ field, label }) => (
            <button key={field} onClick={() => changeSort(field)}
              className={`px-2 py-0.5 rounded border text-xs flex items-center gap-0.5 transition-colors
                ${sort.field === field ? 'bg-[var(--c-accent)] text-white border-[var(--c-accent)]' : 'border-[var(--c-border)] text-[var(--c-fg-2)]'}`}>
              {label}
              {sort.field === field && (sort.dir === 'asc' ? <ArrowUpIcon size={9} /> : <ArrowDownIcon size={9} />)}
            </button>
          ))}
        </div>

        <div className="flex-1" />
        <span className="text-xs text-[var(--c-fg-3)]">{totalTasks}件</span>

        {/* アクション */}
        <button onClick={() => setShowLabelMgr(true)} aria-label="ラベル管理"
          className="p-1.5 rounded border border-[var(--c-border)] text-[var(--c-fg-3)] hover:text-[var(--c-fg)]" title="ラベル管理">
          <TagIcon size={14} aria-hidden="true" />
        </button>
        <button onClick={() => setShowArchive(true)} aria-label="アーカイブ一覧"
          className="p-1.5 rounded border border-[var(--c-border)] text-[var(--c-fg-3)] hover:text-[var(--c-fg)]" title="アーカイブ">
          <ArchiveIcon size={14} aria-hidden="true" />
        </button>
        <button onClick={() => setEditingColumn(null)} aria-label="カラムを追加"
          className="flex items-center gap-1 px-3 py-1.5 rounded bg-[var(--c-accent)] text-white text-xs">
          <PlusIcon size={14} aria-hidden="true" />カラム
        </button>
      </div>

      {/* ボード */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 h-full">
            {columns.map((col) => (
              <KanbanColumnView
                key={col.key}
                column={col}
                tasks={filteredTasksMap[col.key] || []}
                allTasks={tasksMap[col.key] || []}
                labels={labels}
                taskLabels={taskLabels}
                dependencies={dependencies}
                onCardClick={openTask}
                onAddCard={addTask}
                onArchiveColumn={archiveColumn}
                onEditColumn={openEditColumn}
              />
            ))}
          </div>
          <DragOverlay>
            {dragTask && (
              <KanbanCard
                task={dragTask}
                labels={labels}
                taskLabels={taskLabels}
                isDoneColumn={false}
                blockedBy={new Set()}
                onClick={() => {}}
                overlay
              />
            )}
          </DragOverlay>
        </DndContext>
      </div>

      {/* TaskModal */}
      {selectedTask && (
        <TaskModal
          task={selectedTask}
          columns={columns}
          labels={labels}
          taskLabels={selectedTaskLabels}
          onClose={() => { setSelectedTask(null); setSelectedTaskLabels(new Set()); }}
          onSaved={handleTaskSaved}
          onDeleted={handleTaskDeleted}
          onArchived={() => { setSelectedTask(null); load(); }}
        />
      )}

      {/* ColumnEditModal */}
      {editingColumn !== undefined && (
        <ColumnEditModal
          column={editingColumn}
          taskCount={editingColumn ? (tasksMap[editingColumn.key] || []).length : 0}
          onClose={() => setEditingColumn(undefined)}
          onSaved={load}
          onDeleted={(key) => setTasksMap((prev) => { const next = { ...prev }; delete next[key]; return next; })}
        />
      )}

      {/* LabelManagerModal */}
      {showLabelMgr && (
        <LabelManagerModal
          labels={labels}
          onClose={() => setShowLabelMgr(false)}
          onChanged={load}
        />
      )}

      {/* ArchiveModal */}
      {showArchive && (
        <ArchiveModal
          columns={columns}
          onClose={() => setShowArchive(false)}
          onRestored={load}
        />
      )}

      {/* フィルターパネル閉じ */}
      {showFilter && <div className="fixed inset-0 z-10" onClick={() => setShowFilter(false)} />}
    </div>
  );
}
