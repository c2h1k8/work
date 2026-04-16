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
  ArrowUpIcon, ArrowDownIcon,
  MessageSquareIcon, ClockIcon, LinkIcon, ActivityIcon,
  GitMergeIcon, NetworkIcon, BookmarkIcon,
} from 'lucide-react';
import {
  kanbanDB,
  type KanbanTask, type KanbanColumn, type KanbanLabel,
  type KanbanTaskLabel, type ChecklistItem,
  type KanbanArchive, type KanbanDependency,
  type KanbanComment, type KanbanActivity, type KanbanNoteLink,
} from '../db/kanban_db';
import { activityDB } from '../db/activity_db';
import { useToast } from '../components/Toast';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { noteDB } from '../db/note_db';
import type { NoteTask } from '../db/note_db';
import { DatePickerReact } from '../components/DatePickerReact';

// ── localStorage ───────────────────────────────────────────
const LS_SORT   = 'kanban_sort';
const LS_FILTER = 'kanban_filter_text';

function lsGet(k: string) { return localStorage.getItem(k); }
function lsSet(k: string, v: string) { localStorage.setItem(k, v); }
function lsJson<T>(k: string): T | null {
  try { const v = lsGet(k); return v ? JSON.parse(v) as T : null; } catch { return null; }
}

// ── 日付ユーティリティ ─────────────────────────────────────
type DueStatus = 'overdue' | 'today' | 'normal' | '';

function getDueInfo(iso: string, isDoneColumn: boolean): { text: string; status: DueStatus } {
  if (!iso) return { text: '', status: '' };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(iso);
  due.setHours(0, 0, 0, 0);
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
  const fmt = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' });
  const dateText = fmt.format(due);
  if (isDoneColumn) return { text: dateText, status: 'normal' };
  if (diff < 0)  return { text: `${dateText} (期限切れ)`, status: 'overdue' };
  if (diff === 0) return { text: `${dateText} (今日)`,    status: 'today' };
  return { text: dateText, status: 'normal' };
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
  onArchive?: (task: KanbanTask) => void;
  onDelete?: (task: KanbanTask) => void;
  overlay?: boolean;
}

const KanbanCard = React.memo(function KanbanCard({ task, labels, taskLabels, isDoneColumn, blockedBy, onClick, onArchive, onDelete, overlay }: CardProps) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: `task-${task.id}`,
    data: { type: 'task', taskId: task.id, columnKey: task.column },
  });

  const labelIds = taskLabels.get(task.id!) || new Set();
  const cardLabels = labels.filter((l) => labelIds.has(l.id!));

  const checkDone  = (task.checklist || []).filter((c) => c.done).length;
  const checkTotal = (task.checklist || []).length;
  const due        = getDueInfo(task.due_date, isDoneColumn);
  const isBlocked  = blockedBy.size > 0;

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={overlay ? undefined : style}
      className={`group bg-[var(--c-bg)] border border-l-[3px] rounded-lg p-2 shadow-sm cursor-grab active:cursor-grabbing transition-all select-none
        ${isDragging ? 'opacity-40' : ''}
        ${due.status === 'overdue'
          ? 'border-red-400 dark:border-red-600 border-l-red-400 dark:border-l-red-600'
          : 'border-[var(--c-border)] border-l-transparent hover:border-[var(--c-border)] hover:border-l-[var(--c-accent)] hover:-translate-y-0.5 hover:shadow-md'
        }`}
      onClick={onClick}
    >
      {/* ラベル行 */}
      {cardLabels.length > 0 && (
        <div className="flex flex-wrap gap-0.5 mb-1">
          {cardLabels.map((l) => (
            <span key={l.id} className="px-1.5 py-px rounded-full text-[10px] font-medium text-white"
              style={{ backgroundColor: l.color }}>{l.name}</span>
          ))}
        </div>
      )}
      {/* タイトル + ホバーアクション */}
      <div className="flex items-start justify-between gap-1">
        <p className="flex-1 text-sm font-medium text-[var(--c-fg)] break-words leading-snug">{task.title}</p>
        {/* ホバー時アクションボタン */}
        {(onArchive || onDelete) && (
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 -mt-0.5">
            {onArchive && (
              <button
                onClick={(e) => { e.stopPropagation(); onArchive(task); }}
                className="p-0.5 rounded text-[var(--c-fg-3)] hover:text-[var(--c-accent)] hover:bg-[var(--c-bg-2)]"
                title="アーカイブ" aria-label="アーカイブ">
                <ArchiveIcon size={11} />
              </button>
            )}
            {onDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(task); }}
                className="p-0.5 rounded text-[var(--c-fg-3)] hover:text-red-500 hover:bg-[var(--c-bg-2)]"
                title="削除" aria-label="削除">
                <Trash2Icon size={11} />
              </button>
            )}
          </div>
        )}
      </div>
      {/* フッターバッジ */}
      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
        {due.text && (
          <span className={`flex items-center gap-0.5 text-[10px] px-1.5 py-px rounded-full font-medium
            ${due.status === 'overdue' ? 'bg-[var(--c-danger-bg)] text-[var(--c-danger)]' :
              due.status === 'today'   ? 'bg-[var(--c-warning-bg)] text-[var(--c-warning)]' :
                                         'bg-[var(--c-bg-2)] text-[var(--c-fg-3)]'}`}>
            <CalendarIcon size={9} />{due.text}
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
  onArchiveCard: (task: KanbanTask) => void;
  onDeleteCard: (task: KanbanTask) => void;
}

const KanbanColumnView = React.memo(function KanbanColumnView({
  column, tasks, labels, taskLabels, dependencies,
  onCardClick, onAddCard, onArchiveColumn, onEditColumn,
  onArchiveCard, onDeleteCard,
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
    <div className={`flex flex-col rounded-xl border transition-colors flex-1 min-w-[220px]
      ${isOver ? 'border-[var(--c-accent)] bg-[var(--c-accent)]/5' : 'border-[var(--c-border)] bg-[var(--c-bg-2)]'}`}
      style={{ maxHeight: 'calc(100vh - 120px)' }}>
      {/* ヘッダー（group で子ボタンの hover 制御） */}
      <div className={`group/header flex items-center gap-2 px-3 py-2 rounded-t-xl border-b border-[var(--c-border)] shrink-0
        ${wipExceeded ? 'bg-red-50 dark:bg-red-950' : ''}`}>
        <span className="flex-1 font-semibold text-sm text-[var(--c-fg)] truncate">{column.name}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded-full font-mono
          ${wipExceeded ? 'bg-red-500 text-white' : 'bg-[var(--c-bg)] text-[var(--c-fg-3)]'}`}>
          {tasks.length}{column.wip_limit ? `/${column.wip_limit}` : ''}
        </span>
        {column.done && (
          <button onClick={() => onArchiveColumn(column.key)} title="一括アーカイブ" aria-label={`${column.name}を一括アーカイブ`}
            className="p-0.5 rounded hover:bg-[var(--c-bg)] text-[var(--c-fg-3)] hover:text-[var(--c-fg)] opacity-0 group-hover/header:opacity-100 transition-opacity">
            <ArchiveIcon size={12} aria-hidden="true" />
          </button>
        )}
        <button onClick={() => onEditColumn(column)} aria-label={`${column.name}を編集`}
          className="p-0.5 rounded hover:bg-[var(--c-bg)] text-[var(--c-fg-3)] hover:text-[var(--c-fg)] opacity-0 group-hover/header:opacity-100 transition-opacity">
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
              onArchive={onArchiveCard}
              onDelete={onDeleteCard}
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
// TaskPicker（タスク選択ポップオーバー）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface TaskPickerProps {
  tasks: KanbanTask[];
  columns: KanbanColumn[];
  x: number;
  y: number;
  onSelect: (taskId: number) => void;
  onClose: () => void;
}

function TaskPicker({ tasks, columns, x, y, onSelect, onClose }: TaskPickerProps) {
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = useMemo(
    () => q ? tasks.filter((t) => t.title.toLowerCase().includes(q.toLowerCase())) : tasks,
    [tasks, q],
  );

  return (
    <>
      <div className="fixed inset-0 z-[390]" onClick={onClose} />
      <div className="task-picker" style={{ left: x, top: y, zIndex: 400 }}>
        <input
          ref={inputRef}
          className="task-picker__input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="タスクを検索…"
          onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
        />
        <ul className="task-picker__list">
          {filtered.length === 0 && <li className="task-picker__empty">該当なし</li>}
          {filtered.map((t) => (
            <li key={t.id} className="task-picker__item" onClick={() => onSelect(t.id!)}>
              <span className="task-picker__item-title">{t.title}</span>
              <span className="task-picker__item-column">{columns.find((c) => c.key === t.column)?.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// NotePicker（ノート選択ポップオーバー）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface NotePickerProps {
  x: number;
  y: number;
  excludeIds: number[];
  onSelect: (noteTaskId: number) => void;
  onClose: () => void;
}

function NotePicker({ x, y, excludeIds, onSelect, onClose }: NotePickerProps) {
  const [q, setQ] = useState('');
  const [notes, setNotes] = useState<NoteTask[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    noteDB.getAllTasks().then((tasks) => setNotes(tasks.filter((t) => !excludeIds.includes(t.id!))));
    inputRef.current?.focus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(
    () => q ? notes.filter((n) => n.title.toLowerCase().includes(q.toLowerCase())) : notes,
    [notes, q],
  );

  return (
    <>
      <div className="fixed inset-0 z-[390]" onClick={onClose} />
      <div className="task-picker" style={{ left: x, top: y, zIndex: 400 }}>
        <input
          ref={inputRef}
          className="task-picker__input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ノートを検索…"
          onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
        />
        <ul className="task-picker__list">
          {filtered.length === 0 && <li className="task-picker__empty">該当なし</li>}
          {filtered.map((n) => (
            <li key={n.id} className="task-picker__item" onClick={() => onSelect(n.id!)}>
              <span className="task-picker__item-title">{n.title}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

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

  // ── 基本フィールド ──────────────────────────────────────
  const [title,        setTitle]        = useState(task.title);
  const [description,  setDescription]  = useState(task.description || '');
  const [dueDate,      setDueDate]      = useState(task.due_date || '');
  const [column,       setColumn]       = useState(task.column);
  const [checklist,    setChecklist]    = useState<ChecklistItem[]>(task.checklist || []);
  const [newCheckText, setNewCheckText] = useState('');
  const [selectedLabels, setSelectedLabels] = useState<Set<number>>(new Set(taskLabels));
  const [recurring,    setRecurring]    = useState(task.recurring ?? null);
  const [dirty,        setDirty]        = useState(false);
  const [isOpen,       setIsOpen]       = useState(false);

  // ── 説明タブ ────────────────────────────────────────────
  const [descTab, setDescTab] = useState<'write' | 'preview'>('write');


  // ── チェックリスト インライン編集 ────────────────────────
  const [editingCheckId,   setEditingCheckId]   = useState<string | null>(null);
  const [editingCheckText, setEditingCheckText] = useState('');

  // ── コメント・タイムライン ───────────────────────────────
  const [comments,       setComments]       = useState<KanbanComment[]>([]);
  const [activities,     setActivities]     = useState<KanbanActivity[]>([]);
  const [commentInput,   setCommentInput]   = useState('');
  const [editingComment, setEditingComment] = useState<{ id: number; text: string } | null>(null);
  const [timelineTab,    setTimelineTab]    = useState<'all' | 'comments'>('all');
  const [showAbsTime,    setShowAbsTime]    = useState(false);

  // ── 依存関係 ────────────────────────────────────────────
  const [predecessors, setPredecessors] = useState<Array<{ dep: KanbanDependency; task: KanbanTask }>>([]);
  const [successors,   setSuccessors]   = useState<Array<{ dep: KanbanDependency; task: KanbanTask }>>([]);

  // ── タスク関係 ──────────────────────────────────────────
  const [relParent,   setRelParent]   = useState<{ task: KanbanTask; relationId: number } | null>(null);
  const [relChildren, setRelChildren] = useState<Array<{ task: KanbanTask; relationId: number }>>([]);
  const [relRelated,  setRelRelated]  = useState<Array<{ task: KanbanTask; relationId: number }>>([]);

  // ── ノート紐づけ ────────────────────────────────────────
  const [noteLinks, setNoteLinks] = useState<Array<{ link: KanbanNoteLink; noteTitle: string }>>([]);

  // ── タスクピッカー ──────────────────────────────────────
  type PickerType = 'dep-pre' | 'dep-suc' | 'parent' | 'child' | 'related' | 'note';
  const [picker,   setPicker]   = useState<{ type: PickerType; x: number; y: number } | null>(null);
  const [allTasks, setAllTasks] = useState<KanbanTask[]>([]);

  // マウント後にアニメーション開始
  useEffect(() => {
    requestAnimationFrame(() => setIsOpen(true));
  }, []);

  // 追加データ読み込み（コメント・アクティビティ・依存関係・タスク関係・ノート紐づけ）
  useEffect(() => {
    async function loadExtras() {
      const [cmts, acts, allT] = await Promise.all([
        kanbanDB.getCommentsByTask(task.id!),
        kanbanDB.getActivitiesByTask(task.id!),
        kanbanDB.getAllTasks(),
      ]);
      setComments(cmts);
      setActivities(acts);
      setAllTasks(allT.filter((t) => t.id !== task.id));

      const taskMap = new Map(allT.map((t) => [t.id!, t]));

      // 依存関係
      const allDeps = await kanbanDB.getDependenciesForTask(task.id!);
      setPredecessors(
        allDeps
          .filter((d) => d.to_task_id === task.id)
          .map((d) => ({ dep: d, task: taskMap.get(d.from_task_id)! }))
          .filter((x) => x.task),
      );
      setSuccessors(
        allDeps
          .filter((d) => d.from_task_id === task.id)
          .map((d) => ({ dep: d, task: taskMap.get(d.to_task_id)! }))
          .filter((x) => x.task),
      );

      // タスク関係
      const rels = await kanbanDB.getRelationsByTask(task.id!);
      setRelParent(rels.parent);
      setRelChildren(rels.children);
      setRelRelated(rels.related);

      // ノート紐づけ
      const kNoteLinks = await kanbanDB.getNoteLinksByTodo(task.id!);
      if (kNoteLinks.length > 0) {
        const noteTasks = await noteDB.getAllTasks();
        const noteMap = new Map(noteTasks.map((t) => [t.id!, t]));
        setNoteLinks(
          kNoteLinks.map((l) => ({
            link: l,
            noteTitle: noteMap.get(l.note_task_id)?.title || `ノート #${l.note_task_id}`,
          })),
        );
      }
    }
    loadExtras();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id]);

  function mark() { setDirty(true); }

  function handleClose() {
    setIsOpen(false);
    setTimeout(() => {
      if (dirty) handleSave();
      onClose();
    }, 300);
  }

  async function handleSave() {
    const actEntries: Array<[string, Record<string, unknown>]> = [];

    // タイトル変更
    if (title !== task.title) {
      actEntries.push(['title_change', { to: title }]);
    }
    // カラム変更
    if (column !== task.column) {
      actEntries.push(['column_change', {
        from: columns.find((c) => c.key === task.column)?.name || task.column,
        to:   columns.find((c) => c.key === column)?.name   || column,
      }]);
    }
    // 期日変更（追加 / 解除 / 変更 の3種を旧版どおり区別）
    const prevDue = task.due_date || '';
    if (dueDate !== prevDue) {
      if (!prevDue && dueDate)       actEntries.push(['due_add',    { to: dueDate }]);
      else if (prevDue && !dueDate)  actEntries.push(['due_remove', { from: prevDue }]);
      else                           actEntries.push(['due_change', { from: prevDue, to: dueDate }]);
    }
    // 説明変更
    if (description !== (task.description || '')) {
      actEntries.push(['description_change', {}]);
    }

    const updated = await kanbanDB.updateTask(task.id!, {
      title, description, due_date: dueDate, column,
      checklist: checklist.length > 0 ? checklist : null,
      recurring: recurring || null,
    });

    // アクティビティ保存 & state 反映
    if (actEntries.length > 0) {
      const newActs = await Promise.all(
        actEntries.map(([type, content]) => kanbanDB.addActivity(task.id!, type, content)),
      );
      setActivities((prev) =>
        [...prev, ...newActs].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
      );
    }

    // ラベル同期（追加 / 削除 それぞれアクティビティ記録）
    const currentLabels = new Set(taskLabels);
    const labelActEntries: Array<[string, Record<string, unknown>]> = [];
    for (const lid of selectedLabels) {
      if (!currentLabels.has(lid)) {
        await kanbanDB.addTaskLabel(task.id!, lid);
        const l = labels.find((lb) => lb.id === lid);
        if (l) labelActEntries.push(['label_add', { name: l.name, color: l.color }]);
      }
    }
    for (const lid of currentLabels) {
      if (!selectedLabels.has(lid)) {
        await kanbanDB.removeTaskLabel(task.id!, lid);
        const l = labels.find((lb) => lb.id === lid);
        if (l) labelActEntries.push(['label_remove', { name: l.name, color: l.color }]);
      }
    }
    if (labelActEntries.length > 0) {
      const newActs = await Promise.all(
        labelActEntries.map(([type, content]) => kanbanDB.addActivity(task.id!, type, content)),
      );
      setActivities((prev) =>
        [...prev, ...newActs].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
      );
    }

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
    await kanbanDB.addActivity(task.id!, 'archive', {}).catch(() => {});
    await kanbanDB.archiveTask(task);
    await kanbanDB.deleteTask(task.id!);
    await activityDB.add({ page: 'todo', action: 'archive', target_type: 'task', target_id: String(task.id!), summary: task.title, created_at: new Date().toISOString() });
    onArchived(task);
    toast.success('アーカイブしました');
  }

  // ── チェックリスト ──────────────────────────────────────
  async function addChecklist() {
    if (!newCheckText.trim()) return;
    const text = newCheckText.trim();
    const item: ChecklistItem = { id: newId(), text, done: false, position: checklist.length };
    setChecklist([...checklist, item]);
    setNewCheckText('');
    mark();
    // アクティビティ記録
    const act = await kanbanDB.addActivity(task.id!, 'checklist_add', { text });
    setActivities((prev) => [...prev, act]);
  }

  async function toggleCheck(id: string) {
    const item = checklist.find((c) => c.id === id);
    const nextDone = item ? !item.done : false;
    setChecklist(checklist.map((c) => c.id === id ? { ...c, done: !c.done } : c));
    mark();
    // チェック完了・未完了のアクティビティ記録
    if (item) {
      const act = await kanbanDB.addActivity(
        task.id!,
        nextDone ? 'checklist_complete' : 'checklist_uncheck',
        { text: item.text },
      );
      setActivities((prev) => [...prev, act]);
    }
  }

  async function deleteCheck(id: string) {
    const item = checklist.find((c) => c.id === id);
    setChecklist(checklist.filter((c) => c.id !== id));
    mark();
    if (item) {
      const act = await kanbanDB.addActivity(task.id!, 'checklist_remove', { text: item.text });
      setActivities((prev) => [...prev, act]);
    }
  }

  function startEditCheck(id: string, text: string) {
    setEditingCheckId(id);
    setEditingCheckText(text);
  }

  async function commitEditCheck(id: string) {
    const oldText = checklist.find((c) => c.id === id)?.text ?? '';
    const newText = editingCheckText.trim();
    if (newText && newText !== oldText) {
      setChecklist((prev) => prev.map((c) => c.id === id ? { ...c, text: newText } : c));
      mark();
      const act = await kanbanDB.addActivity(task.id!, 'checklist_edit', { from: oldText, to: newText });
      setActivities((prev) => [...prev, act]);
    }
    setEditingCheckId(null);
  }

  // ── ラベル ──────────────────────────────────────────────
  function toggleLabel(lid: number) {
    const next = new Set(selectedLabels);
    if (next.has(lid)) next.delete(lid); else next.add(lid);
    setSelectedLabels(next);
    mark();
  }

  // ── タイトル自動保存（500ms debounce） ──────────────────
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleTitleChange(v: string) {
    setTitle(v);
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(() => {
      kanbanDB.updateTask(task.id!, { title: v });
    }, 500);
  }

  // ── コメント ────────────────────────────────────────────
  async function addComment() {
    if (!commentInput.trim()) return;
    const comment = await kanbanDB.addComment(task.id!, commentInput.trim());
    setComments((prev) => [...prev, comment]);
    setCommentInput('');
    // コメント自体がタイムラインに表示されるためアクティビティ記録は不要
  }

  async function updateComment(id: number, body: string) {
    if (!body.trim()) return;
    const updated = await kanbanDB.updateComment(id, { body: body.trim(), updated_at: new Date().toISOString() });
    setComments((prev) => prev.map((c) => c.id === id ? updated : c));
    setEditingComment(null);
    // アクティビティ記録
    const act = await kanbanDB.addActivity(task.id!, 'comment_edit', {});
    setActivities((prev) => [...prev, act]);
  }

  async function deleteComment(id: number) {
    if (!confirm('コメントを削除しますか？')) return;
    await kanbanDB.deleteComment(id);
    setComments((prev) => prev.filter((c) => c.id !== id));
    // アクティビティ記録
    const act = await kanbanDB.addActivity(task.id!, 'comment_delete', {});
    setActivities((prev) => [...prev, act]);
  }

  // ── 依存関係 ────────────────────────────────────────────
  async function addDependency(type: 'pre' | 'suc', targetTaskId: number) {
    setPicker(null);
    const targetTask = allTasks.find((t) => t.id === targetTaskId)!;
    if (type === 'pre') {
      const dep = await kanbanDB.addDependency(targetTaskId, task.id!);
      setPredecessors((prev) => [...prev, { dep, task: targetTask }]);
      // アクティビティ記録（current 側: blockedBy）
      const act = await kanbanDB.addActivity(task.id!, 'dep_add', { relation: 'blockedBy', taskTitle: targetTask.title });
      setActivities((prev) => [...prev, act]);
    } else {
      const dep = await kanbanDB.addDependency(task.id!, targetTaskId);
      setSuccessors((prev) => [...prev, { dep, task: targetTask }]);
      // アクティビティ記録（current 側: blocking）
      const act = await kanbanDB.addActivity(task.id!, 'dep_add', { relation: 'blocking', taskTitle: targetTask.title });
      setActivities((prev) => [...prev, act]);
    }
  }

  async function removeDependency(depId: number, type: 'pre' | 'suc') {
    const target = type === 'pre'
      ? predecessors.find((x) => x.dep.id === depId)?.task
      : successors.find((x) => x.dep.id === depId)?.task;
    await kanbanDB.deleteDependency(depId);
    if (type === 'pre') setPredecessors((prev) => prev.filter((x) => x.dep.id !== depId));
    else                setSuccessors((prev) => prev.filter((x) => x.dep.id !== depId));
    if (target) {
      const relation = type === 'pre' ? 'blockedBy' : 'blocking';
      const act = await kanbanDB.addActivity(task.id!, 'dep_remove', { relation, taskTitle: target.title });
      setActivities((prev) => [...prev, act]);
    }
  }

  // ── タスク関係 ──────────────────────────────────────────
  async function addRelation(type: 'parent' | 'child' | 'related', targetTaskId: number) {
    setPicker(null);
    const targetTask = allTasks.find((t) => t.id === targetTaskId)!;
    const roleMap = { parent: '親タスク', child: '子タスク', related: '関連タスク' } as const;
    if (type === 'parent') {
      const rel = await kanbanDB.addRelation(targetTaskId, task.id!, 'child');
      setRelParent({ task: targetTask, relationId: rel.id! });
    } else if (type === 'child') {
      const rel = await kanbanDB.addRelation(task.id!, targetTaskId, 'child');
      setRelChildren((prev) => [...prev, { task: targetTask, relationId: rel.id! }]);
    } else {
      const rel = await kanbanDB.addRelation(task.id!, targetTaskId, 'related');
      setRelRelated((prev) => [...prev, { task: targetTask, relationId: rel.id! }]);
    }
    const act = await kanbanDB.addActivity(task.id!, 'relation_add', { role: type, with_title: targetTask.title });
    setActivities((prev) => [...prev, act]);
    void roleMap; // 参照のみ
  }

  async function removeRelation(relationId: number, type: 'parent' | 'child' | 'related') {
    const target =
      type === 'parent' ? relParent?.task :
      type === 'child'  ? relChildren.find((x) => x.relationId === relationId)?.task :
                          relRelated.find((x) => x.relationId === relationId)?.task;
    await kanbanDB.deleteRelation(relationId);
    if (type === 'parent')      setRelParent(null);
    else if (type === 'child')  setRelChildren((prev) => prev.filter((x) => x.relationId !== relationId));
    else                        setRelRelated((prev) => prev.filter((x) => x.relationId !== relationId));
    const act = await kanbanDB.addActivity(task.id!, 'relation_remove', { role: type, with_title: target?.title ?? '' });
    setActivities((prev) => [...prev, act]);
  }

  // ── ノート紐づけ ────────────────────────────────────────
  async function addNoteLink(noteTaskId: number) {
    setPicker(null);
    const link = await kanbanDB.addNoteLink(task.id!, noteTaskId);
    const noteTasks = await noteDB.getAllTasks();
    const noteTask = noteTasks.find((t) => t.id === noteTaskId);
    setNoteLinks((prev) => [...prev, { link, noteTitle: noteTask?.title || `ノート #${noteTaskId}` }]);
  }

  async function removeNoteLink(linkId: number) {
    await kanbanDB.deleteNoteLink(linkId);
    setNoteLinks((prev) => prev.filter((x) => x.link.id !== linkId));
  }

  // ── テンプレート保存 ────────────────────────────────────
  async function saveAsTemplate() {
    const name = prompt('テンプレート名を入力してください', title);
    if (name === null) return;
    const allTemplates = await kanbanDB.getAllTemplates();
    await kanbanDB.addTemplate({
      name: name || title,
      title,
      description,
      checklist: checklist.length > 0 ? checklist : null,
      label_ids: [...selectedLabels],
      position: allTemplates.length,
    });
    toast.success('テンプレートとして保存しました');
  }

  // ── タイムライン 結合・ソート ────────────────────────────
  type TimelineItem =
    | { kind: 'comment';  data: KanbanComment;  time: Date }
    | { kind: 'activity'; data: KanbanActivity; time: Date };

  const timelineItems = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];
    if (timelineTab === 'all' || timelineTab === 'comments') {
      comments.forEach((c) => items.push({ kind: 'comment', data: c, time: new Date(c.created_at) }));
    }
    if (timelineTab === 'all') {
      activities.forEach((a) => items.push({ kind: 'activity', data: a, time: new Date(a.created_at) }));
    }
    items.sort((a, b) => a.time.getTime() - b.time.getTime());
    return items;
  }, [comments, activities, timelineTab]);

  // ── 時刻フォーマット ─────────────────────────────────────
  function formatTime(iso: string) {
    const d = new Date(iso);
    if (showAbsTime) {
      return d.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    const diff = Date.now() - d.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1)  return 'たった今';
    if (minutes < 60) return `${minutes}分前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24)   return `${hours}時間前`;
    const days = Math.floor(hours / 24);
    if (days < 7)     return `${days}日前`;
    return d.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
  }

  // ── アクティビティ表示テキスト（旧版 renderer.js と同仕様）──
  function activityText(act: KanbanActivity): string {
    const c = act.content as Record<string, unknown>;
    const fmtDate = (iso: unknown) => {
      if (!iso || typeof iso !== 'string') return '（なし）';
      const [y, m, d] = (iso as string).split('-');
      return `${y}/${m}/${d}`;
    };
    switch (act.type) {
      case 'task_create':        return 'タスクを作成';
      case 'column_change':      return `カラムを「${c.from}」→「${c.to}」に変更`;
      case 'label_add':          return `ラベル「${c.name}」を追加`;
      case 'label_remove':       return `ラベル「${c.name}」を削除`;
      case 'title_change':       return `タイトルを「${c.to}」に変更`;
      case 'description_change': return '説明を更新';
      case 'due_add':            return `期限を「${fmtDate(c.to)}」に設定`;
      case 'due_remove':         return '期限を解除';
      case 'due_change':         return `期限を「${fmtDate(c.from)}」→「${fmtDate(c.to)}」に変更`;
      case 'comment_delete':     return 'コメントを削除';
      case 'comment_edit':       return 'コメントを編集';
      case 'relation_add': {
        const roleLabel = ({ parent: '親タスク', child: '子タスク', related: '関連タスク' } as Record<string, string>)[String(c.role)] ?? '関係タスク';
        return `${roleLabel}「${c.with_title ?? ''}」を紐づけ`;
      }
      case 'relation_remove': {
        const roleLabel = ({ parent: '親タスク', child: '子タスク', related: '関連タスク' } as Record<string, string>)[String(c.role)] ?? '関係タスク';
        return `${roleLabel}の紐づけを解除`;
      }
      case 'checklist_add':      return `チェックリスト「${c.text ?? ''}」を追加`;
      case 'checklist_remove':   return `チェックリスト「${c.text ?? ''}」を削除`;
      case 'checklist_check':
      case 'checklist_complete': return `「${c.text ?? ''}」を完了へ`;
      case 'checklist_uncheck':  return `「${c.text ?? ''}」を未完了へ`;
      case 'checklist_edit':     return `チェックリスト「${c.from ?? ''}」→「${c.to ?? ''}」に変更`;
      case 'dep_add':            return c.relation === 'blocking'
        ? `先行タスク「${c.taskTitle ?? ''}」を設定`
        : `後続タスク「${c.taskTitle ?? ''}」を設定`;
      case 'dep_remove':         return c.relation === 'blocking'
        ? `先行タスク「${c.taskTitle ?? ''}」の依存を解除`
        : `後続タスク「${c.taskTitle ?? ''}」の依存を解除`;
      case 'archive':            return 'アーカイブへ移動';
      case 'restore_archive':    return 'アーカイブから復元';
      default:                   return '変更';
    }
  }

  // ── ピッカー除外 ID ──────────────────────────────────────
  function getExcludedIds(): number[] {
    const base = [task.id!];
    if (!picker) return base;
    if (picker.type === 'dep-pre')  return [...base, ...predecessors.map((x) => x.task.id!)];
    if (picker.type === 'dep-suc')  return [...base, ...successors.map((x) => x.task.id!)];
    if (picker.type === 'parent')   return [...base, ...relChildren.map((x) => x.task.id!)];
    if (picker.type === 'child')    return [...base, ...(relParent ? [relParent.task.id!] : []), ...relChildren.map((x) => x.task.id!)];
    if (picker.type === 'related')  return [...base, ...relRelated.map((x) => x.task.id!)];
    return base;
  }

  function openPicker(e: React.MouseEvent, type: PickerType) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPicker({ type, x: r.left, y: r.bottom + 4 });
  }

  const doneCheck = checklist.filter((c) => c.done).length;

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

            {/* ── 説明セクション（Markdown write/preview） ── */}
            <div className="modal__section">
              <div className="md-editor">
                <div className="md-editor__tabs">
                  <button
                    className={`md-editor__tab${descTab === 'write' ? ' is-active' : ''}`}
                    onClick={() => setDescTab('write')}>編集</button>
                  <button
                    className={`md-editor__tab${descTab === 'preview' ? ' is-active' : ''}`}
                    onClick={() => setDescTab('preview')}>プレビュー</button>
                </div>
                {descTab === 'write' ? (
                  <textarea
                    className="modal__description"
                    value={description}
                    onChange={(e) => { setDescription(e.target.value); mark(); }}
                    placeholder="説明を入力（Markdown対応）…"
                  />
                ) : (
                  <div className="md-editor__preview md-body">
                    <ReactMarkdown rehypePlugins={[rehypeSanitize]}>
                      {description || ''}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            </div>

            {/* ── チェックリストセクション（進捗バー + インライン編集） ── */}
            <div className="modal__section">
              <h4 className="modal__section-title">
                <CheckIcon size={14} aria-hidden="true" />
                チェックリスト
              </h4>
              {checklist.length > 0 && (
                <div className="checklist-progress">
                  <div className="checklist-progress__bar">
                    <div
                      className="checklist-progress__fill"
                      style={{ width: `${Math.round((doneCheck / checklist.length) * 100)}%` }}
                    />
                  </div>
                  <span className="checklist-progress__text">{doneCheck}/{checklist.length}</span>
                </div>
              )}
              <div className="checklist-items">
                {checklist.map((item) => (
                  <div
                    key={item.id}
                    className={`checklist-item${item.done ? ' is-checked' : ''}`}
                    onClick={() => { if (editingCheckId !== item.id) { toggleCheck(item.id); mark(); } }}
                  >
                    <span className="checklist-check-icon">
                      {item.done && <CheckIcon size={10} />}
                    </span>
                    {editingCheckId === item.id ? (
                      <input
                        className="checklist-item__edit-input"
                        value={editingCheckText}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setEditingCheckText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.nativeEvent.isComposing) commitEditCheck(item.id);
                          if (e.key === 'Escape') setEditingCheckId(null);
                        }}
                        onBlur={() => commitEditCheck(item.id)}
                      />
                    ) : (
                      <span
                        className="checklist-label"
                        onDoubleClick={(e) => { e.stopPropagation(); startEditCheck(item.id, item.text); }}
                        title="ダブルクリックで編集"
                      >
                        {item.text}
                      </span>
                    )}
                    <button
                      className="checklist-item__del"
                      onClick={(e) => { e.stopPropagation(); deleteCheck(item.id); }}
                      aria-label="削除"
                    >
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

            {/* ── タイムライン（コメント + アクティビティ）セクション ── */}
            <div className="modal__section">
              <div className="timeline-header">
                <h4 className="modal__section-title">
                  <MessageSquareIcon size={14} aria-hidden="true" />
                  アクティビティ
                </h4>
                <div className="timeline-header__right">
                  <div className="timeline-tabs">
                    <button
                      className={`timeline-tab${timelineTab === 'all' ? ' is-active' : ''}`}
                      onClick={() => setTimelineTab('all')}>すべて</button>
                    <button
                      className={`timeline-tab${timelineTab === 'comments' ? ' is-active' : ''}`}
                      onClick={() => setTimelineTab('comments')}>コメント</button>
                  </div>
                  <button
                    className={`timeline-time-btn${showAbsTime ? ' is-active' : ''}`}
                    onClick={() => setShowAbsTime((v) => !v)}
                    title={showAbsTime ? '相対時刻で表示' : '日時で表示'}
                    aria-label={showAbsTime ? '相対時刻で表示' : '日時で表示'}
                  >
                    {/* 現在のモードと逆の意味のアイコンを表示（クリック後の状態を示す） */}
                    {showAbsTime
                      ? <ClockIcon size={13} aria-hidden="true" />
                      : <CalendarIcon size={13} aria-hidden="true" />
                    }
                  </button>
                </div>
              </div>
              <div className="modal__comments">
                {timelineItems.map((item, i) => {
                  if (item.kind === 'comment') {
                    const c = item.data;
                    return (
                      <div key={`c-${c.id}`} className="comment-item">
                        <div className="comment-item__header">
                          <span className="comment-item__date">
                            {formatTime(c.created_at)}{c.updated_at ? '（編集済）' : ''}
                          </span>
                          <div className="comment-item__header-actions">
                            <button
                              className="comment-item__edit"
                              onClick={() => setEditingComment({ id: c.id!, text: c.body })}
                              aria-label="編集"
                            >
                              <PencilIcon size={11} aria-hidden="true" />
                            </button>
                            <button
                              className="comment-item__delete"
                              onClick={() => deleteComment(c.id!)}
                              aria-label="削除"
                            >
                              <Trash2Icon size={11} aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                        {editingComment?.id === c.id && editingComment ? (
                          <>
                            <textarea
                              className="comment-item__edit-textarea"
                              value={editingComment.text}
                              onChange={(e) => setEditingComment({ id: editingComment.id, text: e.target.value })}
                            />
                            <div className="comment-item__edit-actions">
                              <button
                                className="comment-item__edit-cancel"
                                onClick={() => setEditingComment(null)}
                              >キャンセル</button>
                              <button
                                className="comment-item__edit-save"
                                onClick={() => updateComment(c.id!, editingComment.text)}
                              >保存</button>
                            </div>
                          </>
                        ) : (
                          <p className="comment-item__body">{c.body}</p>
                        )}
                      </div>
                    );
                  } else {
                    const a = item.data;
                    return (
                      <div key={`a-${a.id}-${i}`} className="activity-item">
                        <span className="activity-item__icon">
                          <ActivityIcon size={10} aria-hidden="true" />
                        </span>
                        <span className="activity-item__text">{activityText(a)}</span>
                        <span className="activity-item__date">{formatTime(a.created_at)}</span>
                      </div>
                    );
                  }
                })}
              </div>
              <div className="modal__comment-form">
                <textarea
                  className="modal__comment-input"
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      addComment();
                    }
                  }}
                  placeholder="コメントを追加… (Shift+Enter で改行)"
                />
                <div className="modal__comment-actions">
                  <button className="modal-comment-submit-btn" onClick={addComment}>
                    <MessageSquareIcon size={13} aria-hidden="true" />
                    コメント
                  </button>
                </div>
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

            {/* 期日（カスタム日付ピッカー） */}
            <div className="modal__sidebar-item">
              <span className="modal__sidebar-label">期日</span>
              <DatePickerReact
                value={dueDate}
                onChange={(v) => { setDueDate(v); mark(); }}
                onClear={() => { setDueDate(''); mark(); }}
                displayText={dueDate
                  ? getDueInfo(dueDate, columns.find((c) => c.key === column)?.done || false).text
                  : undefined}
                status={getDueInfo(dueDate, columns.find((c) => c.key === column)?.done || false).status || undefined}
              />
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

            {/* 依存関係 */}
            <div className="modal__sidebar-item">
              <span className="modal__sidebar-label modal__sidebar-label--icon">
                <GitMergeIcon size={11} aria-hidden="true" />依存関係
              </span>
              <div className="modal__relation-group">
                <span className="modal__relation-sublabel">先行タスク（完了待ち）</span>
                {predecessors.map(({ dep, task: t }) => (
                  <div key={dep.id} className="relation-chip">
                    <span className="relation-chip__title">{t.title}</span>
                    <span className="relation-chip__column">
                      {columns.find((c) => c.key === t.column)?.name}
                    </span>
                    <button className="relation-chip__remove"
                      onClick={() => removeDependency(dep.id!, 'pre')} aria-label="削除">
                      <XIcon size={10} />
                    </button>
                  </div>
                ))}
                <button className="modal__relation-add-btn" onClick={(e) => openPicker(e, 'dep-pre')}>
                  + 追加
                </button>
              </div>
              <div className="modal__relation-group">
                <span className="modal__relation-sublabel">後続タスク</span>
                {successors.map(({ dep, task: t }) => (
                  <div key={dep.id} className="relation-chip">
                    <span className="relation-chip__title">{t.title}</span>
                    <span className="relation-chip__column">
                      {columns.find((c) => c.key === t.column)?.name}
                    </span>
                    <button className="relation-chip__remove"
                      onClick={() => removeDependency(dep.id!, 'suc')} aria-label="削除">
                      <XIcon size={10} />
                    </button>
                  </div>
                ))}
                <button className="modal__relation-add-btn" onClick={(e) => openPicker(e, 'dep-suc')}>
                  + 追加
                </button>
              </div>
            </div>

            {/* タスク関係 */}
            <div className="modal__sidebar-item">
              <span className="modal__sidebar-label modal__sidebar-label--icon">
                <NetworkIcon size={11} aria-hidden="true" />タスク関係
              </span>
              <div className="modal__relation-group">
                <span className="modal__relation-sublabel">親タスク</span>
                {relParent && (
                  <div className="relation-chip">
                    <span className="relation-chip__title">{relParent.task.title}</span>
                    <span className="relation-chip__column">
                      {columns.find((c) => c.key === relParent.task.column)?.name}
                    </span>
                    <button className="relation-chip__remove"
                      onClick={() => removeRelation(relParent.relationId, 'parent')} aria-label="削除">
                      <XIcon size={10} />
                    </button>
                  </div>
                )}
                {!relParent && (
                  <button className="modal__relation-add-btn" onClick={(e) => openPicker(e, 'parent')}>
                    + 設定
                  </button>
                )}
              </div>
              <div className="modal__relation-group">
                <span className="modal__relation-sublabel">子タスク</span>
                {relChildren.map(({ task: t, relationId }) => (
                  <div key={relationId} className="relation-chip">
                    <span className="relation-chip__title">{t.title}</span>
                    <span className="relation-chip__column">
                      {columns.find((c) => c.key === t.column)?.name}
                    </span>
                    <button className="relation-chip__remove"
                      onClick={() => removeRelation(relationId, 'child')} aria-label="削除">
                      <XIcon size={10} />
                    </button>
                  </div>
                ))}
                <button className="modal__relation-add-btn" onClick={(e) => openPicker(e, 'child')}>
                  + 追加
                </button>
              </div>
              <div className="modal__relation-group">
                <span className="modal__relation-sublabel">関連タスク</span>
                {relRelated.map(({ task: t, relationId }) => (
                  <div key={relationId} className="relation-chip">
                    <span className="relation-chip__title">{t.title}</span>
                    <span className="relation-chip__column">
                      {columns.find((c) => c.key === t.column)?.name}
                    </span>
                    <button className="relation-chip__remove"
                      onClick={() => removeRelation(relationId, 'related')} aria-label="削除">
                      <XIcon size={10} />
                    </button>
                  </div>
                ))}
                <button className="modal__relation-add-btn" onClick={(e) => openPicker(e, 'related')}>
                  + 追加
                </button>
              </div>
            </div>

            {/* ノート紐づけ */}
            <div className="modal__sidebar-item">
              <span className="modal__sidebar-label modal__sidebar-label--icon">
                <LinkIcon size={11} aria-hidden="true" />ノート紐づけ
              </span>
              <div className="modal__relation-group">
                {noteLinks.map(({ link, noteTitle }) => (
                  <div key={link.id} className="relation-chip">
                    <span className="relation-chip__title">{noteTitle}</span>
                    <button className="relation-chip__remove"
                      onClick={() => removeNoteLink(link.id!)} aria-label="削除">
                      <XIcon size={10} />
                    </button>
                  </div>
                ))}
                <button className="modal__relation-add-btn" onClick={(e) => openPicker(e, 'note')}>
                  + 追加
                </button>
              </div>
            </div>

            {/* テンプレート保存（繰り返しの下・アクションの上） */}
            <div className="modal__sidebar-item">
              <button onClick={saveAsTemplate} className="modal-template-btn">
                <BookmarkIcon size={12} aria-hidden="true" />
                テンプレートとして保存
              </button>
            </div>

            {/* アクション（アーカイブ・削除のみ。保存は閉じる時に自動） */}
            <div className="modal__sidebar-item modal__sidebar-actions">
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

      {/* タスクピッカー */}
      {picker && picker.type !== 'note' && (
        <TaskPicker
          tasks={allTasks.filter((t) => !getExcludedIds().includes(t.id!))}
          columns={columns}
          x={picker.x}
          y={picker.y}
          onSelect={(taskId) => {
            if (picker.type === 'dep-pre')      addDependency('pre', taskId);
            else if (picker.type === 'dep-suc') addDependency('suc', taskId);
            else if (picker.type === 'parent')  addRelation('parent', taskId);
            else if (picker.type === 'child')   addRelation('child', taskId);
            else if (picker.type === 'related') addRelation('related', taskId);
          }}
          onClose={() => setPicker(null)}
        />
      )}
      {picker?.type === 'note' && (
        <NotePicker
          x={picker.x}
          y={picker.y}
          excludeIds={noteLinks.map((x) => x.link.note_task_id)}
          onSelect={addNoteLink}
          onClose={() => setPicker(null)}
        />
      )}
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
    // タスク固有アクティビティ（詳細画面タイムライン用）
    await kanbanDB.addActivity(task.id!, 'task_create', {}).catch(() => {});
    // 全体アクティビティログ
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

  // ── カード単体アーカイブ ──────────────────────────────────
  const archiveCard = useCallback(async (task: KanbanTask) => {
    await kanbanDB.archiveTask(task);
    await kanbanDB.deleteTask(task.id!);
    await activityDB.add({ page: 'todo', action: 'archive', target_type: 'task', target_id: String(task.id!), summary: task.title, created_at: new Date().toISOString() });
    await load();
    toast.success('アーカイブしました');
  }, [load, toast]);

  // ── カード単体削除 ────────────────────────────────────────
  const deleteCard = useCallback(async (task: KanbanTask) => {
    if (!confirm(`「${task.title}」を削除しますか？`)) return;
    await kanbanDB.deleteTask(task.id!);
    await activityDB.add({ page: 'todo', action: 'delete', target_type: 'task', target_id: String(task.id!), summary: task.title, created_at: new Date().toISOString() });
    await load();
    toast.success('削除しました');
  }, [load, toast]);

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
          {showFilter && (
            <div className="absolute top-full left-0 mt-1 z-20 bg-[var(--c-bg)] border border-[var(--c-border)] rounded-lg shadow-lg py-1 min-w-[180px]">
              {labels.length === 0 ? (
                <div className="text-xs text-[var(--c-fg-3)] px-3 py-2 text-center">ラベルが未作成です</div>
              ) : (
                labels.map((l) => {
                  const active = filterLabels.has(l.id!);
                  return (
                    <button key={l.id}
                      onClick={() => toggleFilterLabel(l.id!)}
                      className={`flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm transition-colors
                        ${active ? 'bg-[var(--c-accent-dim)]' : 'hover:bg-[var(--c-bg-2)]'}`}>
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                      <span className="flex-1 text-[var(--c-fg)]">{l.name}</span>
                      {active && <span className="text-[var(--c-accent)] font-bold text-xs">✓</span>}
                    </button>
                  );
                })
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
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4"
        style={{
          backgroundImage: 'radial-gradient(circle, var(--c-border) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}>
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
                onArchiveCard={archiveCard}
                onDeleteCard={deleteCard}
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
