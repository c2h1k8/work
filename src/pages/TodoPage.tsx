// ==================================================
// TodoPage — Kanban ボード（DnD + ラベル + チェックリスト + 依存関係）
// ==================================================
// kanban_db version 2
// ストア: tasks / columns / labels / task_labels / templates / archives / dependencies / note_links

import '../styles/pages/todo.css';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  DndContext, DragOverlay, rectIntersection,
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
  LockIcon, CalendarIcon, RotateCcwIcon,
  MessageSquareIcon, LinkIcon,
  GitMergeIcon, NetworkIcon, BookmarkIcon,
  FilePlusIcon, ArrowRightIcon, AlignLeftIcon,
  CheckSquareIcon, MinusSquareIcon, FileEditIcon,
  CircleDotIcon, TimerIcon, Repeat2Icon,
  DownloadIcon, UploadIcon, FilterXIcon, ArrowUpDownIcon,
} from 'lucide-react';
import {
  kanbanDB,
  type KanbanTask, type KanbanColumn, type KanbanLabel,
  type KanbanTaskLabel, type ChecklistItem,
  type KanbanArchive, type KanbanDependency,
  type KanbanComment, type KanbanActivity, type KanbanNoteLink,
  type KanbanTemplate,
} from '../db/kanban_db';
import { activityDB } from '../db/activity_db';
import { useToast } from '../components/Toast';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { noteDB } from '../db/note_db';
import type { NoteTask } from '../db/note_db';
import { DatePicker } from '../components/DatePicker';
import { Select } from '../components/Select';
import { searchRegistry } from '../stores/search_store';
import { useTabStore } from '../stores/tab_store';

// ── localStorage ───────────────────────────────────────────
const LS_SORT         = 'kanban_sort';
const LS_FILTER       = 'kanban_filter_text';
const LS_FILTER_DUE   = 'kanban_filter_due';
const LS_TIMELINE_TAB = 'kanban_timeline_tab';
const LS_ABS_TIME     = 'kanban_abs_time';

function lsGet(k: string) { return localStorage.getItem(k); }
function lsSet(k: string, v: string) { localStorage.setItem(k, v); }
function lsJson<T>(k: string): T | null {
  try { const v = lsGet(k); return v ? JSON.parse(v) as T : null; } catch { return null; }
}

// ── グローバル検索用抜粋生成 ──────────────────────────────────
function extractSearchExcerpt(text: string, query: string, maxLen = 80): string {
  if (!text) return '';
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query);
  if (idx === -1) return text.slice(0, maxLen) + (text.length > maxLen ? '…' : '');
  const start = Math.max(0, idx - 20);
  const end   = Math.min(text.length, start + maxLen);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

// ── Markdown チェックボックストグル ──────────────────────────
function toggleCheckboxInMarkdown(md: string, index: number, checked: boolean): string {
  let count = 0;
  return md.replace(/^(\s*[-*+]\s+)\[[ xX]\]/gm, (match, prefix) => {
    if (count++ === index) return `${prefix}[${checked ? 'x' : ' '}]`;
    return match;
  });
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
      className={`card${isDragging ? ' opacity-40' : ''}${due.status === 'overdue' ? ' card--overdue' : ''}`}
      onClick={onClick}
    >
      {/* 右上ステータス（ブロックアイコン） */}
      <div className="card__status">
        {isBlocked && <span className="card__lock-badge" title="先行タスクが未完了"><LockIcon size={13} /></span>}
      </div>
      {/* ラベル行 */}
      {cardLabels.length > 0 && (
        <div className="card__labels">
          {cardLabels.map((l) => (
            <span key={l.id} className="label-chip" style={{ backgroundColor: l.color, color: '#fff' }}>{l.name}</span>
          ))}
        </div>
      )}
      {/* タイトル */}
      <p className="card__title">{task.title}</p>
      {/* バッジ行（チェックリスト・繰り返し） */}
      {(checkTotal > 0 || task.recurring) && (
        <div className="card__badges">
          {checkTotal > 0 && (
            <span className={`card__checklist-badge${checkDone === checkTotal ? ' card__checklist-badge--done' : ''}`}>
              <CheckIcon size={10} />{checkDone}/{checkTotal}
            </span>
          )}
          {task.recurring && <span className="card__repeat-badge" title={`繰り返し（${task.recurring.interval === 'daily' ? '毎日' : task.recurring.interval === 'weekly' ? '毎週' : '毎月'}）`}><Repeat2Icon size={12} /></span>}
        </div>
      )}
      {/* フッター（期日 + アクション） */}
      {(due.text || onArchive || onDelete) && (
        <div className="card__footer">
          {due.text ? (
            <span className={`card__due${due.status === 'overdue' ? ' card__due--overdue' : due.status === 'today' ? ' card__due--today' : ''}`}>
              <CalendarIcon size={10} />{due.text}
            </span>
          ) : <span />}
          {(onArchive || onDelete) && (
            <div className="card__actions">
              {onArchive && (
                <button onClick={(e) => { e.stopPropagation(); onArchive(task); }}
                  className="card__btn card__btn--archive" title="アーカイブ" aria-label="アーカイブ">
                  <ArchiveIcon size={12} />
                </button>
              )}
              {onDelete && (
                <button onClick={(e) => { e.stopPropagation(); onDelete(task); }}
                  className="card__btn card__btn--delete" title="削除" aria-label="削除">
                  <Trash2Icon size={12} />
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// KanbanColumn（ドロップターゲット）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface ColumnProps {
  column: KanbanColumn;
  tasks: KanbanTask[];
  labels: KanbanLabel[];
  taskLabels: Map<number, Set<number>>;
  dependencies: Map<number, { blockedBy: Set<number> }>;
  isDragOver: boolean;
  templates: KanbanTemplate[];
  onCardClick: (task: KanbanTask) => void;
  onAddCard: (columnKey: string, title: string) => void;
  onAddFromTemplate: (columnKey: string, template: KanbanTemplate) => void;
  onArchiveColumn: (columnKey: string) => void;
  onEditColumn: (column: KanbanColumn) => void;
  onArchiveCard: (task: KanbanTask) => void;
  onDeleteCard: (task: KanbanTask) => void;
}

const KanbanColumnView = React.memo(function KanbanColumnView({
  column, tasks, labels, taskLabels, dependencies, isDragOver, templates,
  onCardClick, onAddCard, onAddFromTemplate, onArchiveColumn, onEditColumn,
  onArchiveCard, onDeleteCard,
}: ColumnProps) {
  const { setNodeRef } = useDroppable({ id: `col-${column.key}` });
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [showTplPicker, setShowTplPicker] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const wipExceeded = (column.wip_limit ?? 0) > 0 && tasks.length > (column.wip_limit ?? 0);

  function startAdd() {
    if (templates.length > 0) {
      setShowTplPicker(true);
    } else {
      setAdding(true);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }

  function commitAdd() {
    if (newTitle.trim()) {
      onAddCard(column.key, newTitle.trim());
    }
    setNewTitle('');
    setAdding(false);
  }

  return (
    <div className={`flex flex-col rounded-xl border transition-colors flex-1 min-w-[220px]
      ${wipExceeded ? 'border-[var(--c-danger)] bg-[var(--c-bg-2)]' : isDragOver ? 'border-[var(--c-accent)] bg-[var(--c-accent)]/5' : 'border-[var(--c-border)] bg-[var(--c-bg-2)]'}`}
      style={{ maxHeight: 'calc(100vh - 120px)' }}>
      {/* ヘッダー（group で子ボタンの hover 制御） */}
      <div className={`group/header flex items-center gap-2 px-3 py-2 rounded-t-xl border-b shrink-0
        ${wipExceeded ? 'bg-[var(--c-danger-bg)] border-[var(--c-danger)]' : 'border-[var(--c-border)]'}`}>
        <span className="flex-1 font-semibold text-sm text-[var(--c-fg)] truncate">{column.name}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded-full font-mono
          ${wipExceeded ? 'bg-[var(--c-danger)] text-white' : 'bg-[var(--c-bg)] text-[var(--c-fg-3)]'}`}>
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
        <div className="relative">
          <button onClick={startAdd} aria-label={`${column.name}にタスクを追加`}
            className="p-0.5 rounded hover:bg-[var(--c-bg)] text-[var(--c-fg-3)] hover:text-[var(--c-fg)]">
            <PlusIcon size={14} aria-hidden="true" />
          </button>
          {showTplPicker && (
            <>
              <div className="fixed inset-0 z-[50]" onClick={() => setShowTplPicker(false)} />
              <div className="absolute right-0 top-full mt-1 z-[60] bg-[var(--c-bg)] border border-[var(--c-border)] rounded-lg shadow-lg min-w-[160px] overflow-hidden">
                <div className="px-3 py-1.5 text-[10px] font-semibold text-[var(--c-fg-3)] uppercase tracking-wide border-b border-[var(--c-border)]">テンプレートを選択</div>
                <ul>
                  <li className="px-3 py-2 text-xs text-[var(--c-fg-3)] cursor-pointer hover:bg-[var(--c-bg-2)] italic border-b border-[var(--c-border)]"
                    onClick={() => { setShowTplPicker(false); setAdding(true); setTimeout(() => inputRef.current?.focus(), 10); }}>
                    空のタスク
                  </li>
                  {templates.map((t) => (
                    <li key={t.id} className="px-3 py-2 text-sm text-[var(--c-fg)] cursor-pointer hover:bg-[var(--c-bg-2)] truncate"
                      onClick={() => { setShowTplPicker(false); onAddFromTemplate(column.key, t); }}>
                      {t.name}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
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
  onColumnChange: (taskId: number, newColumn: string) => void;
  onDepsMutated: (taskId: number, blockedBy: Set<number>) => void;
  onLabelsChanged?: () => void;
}

function TaskModal({ task, columns, labels, taskLabels, onClose, onSaved, onDeleted, onArchived, onColumnChange, onDepsMutated, onLabelsChanged }: TaskModalProps) {
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
  const [isOpen,       setIsOpen]       = useState(false);

  // ── タイトル編集モード ──────────────────────────────────
  const [titleEditing, setTitleEditing] = useState(false);
  const committedTitle = useRef(task.title);

  // ── 説明編集モード（デフォルト参照） ──────────────────────
  const [descEditing,  setDescEditing]  = useState(false);
  const [descSubTab,   setDescSubTab]   = useState<'write' | 'preview'>('write');
  const committedDesc = useRef(task.description || '');


  // ── チェックリスト インライン編集 ────────────────────────
  const [editingCheckId,   setEditingCheckId]   = useState<string | null>(null);
  const [editingCheckText, setEditingCheckText] = useState('');

  // ── コメント・タイムライン ───────────────────────────────
  const [comments,       setComments]       = useState<KanbanComment[]>([]);
  const [activities,     setActivities]     = useState<KanbanActivity[]>([]);
  const [commentInput,   setCommentInput]   = useState('');
  const [editingComment, setEditingComment] = useState<{ id: number; text: string } | null>(null);
  const [timelineTab,    setTimelineTab]    = useState<'all' | 'comments'>(
    () => (lsGet(LS_TIMELINE_TAB) === 'comments' ? 'comments' : 'all'),
  );
  const [showAbsTime,    setShowAbsTime]    = useState(
    () => lsGet(LS_ABS_TIME) === '1',
  );
  const [localLabels,       setLocalLabels]       = useState<KanbanLabel[]>(labels);
  const [showInlineLabelMgr, setShowInlineLabelMgr] = useState(false);
  const commentsRef = useRef<HTMLDivElement>(null);

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

  function handleClose() {
    setIsOpen(false);
    setTimeout(() => onClose(), 300);
  }

  async function commitColumn(nextKey: string) {
    const prevKey = column;
    if (nextKey === prevKey) return;
    if (!task.id) { console.error('[commitColumn] task.id is undefined'); return; }
    setColumn(nextKey);
    const from = columns.find((c) => c.key === prevKey)?.name || prevKey;
    const to   = columns.find((c) => c.key === nextKey)?.name || nextKey;
    try {
      const updated = await kanbanDB.updateTask(task.id, { column: nextKey });
      onSaved(updated);
      const act = await kanbanDB.addActivity(task.id, 'column_change', { from, to });
      setActivities((prev) => [...prev, act].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
      await activityDB.add({ page: 'todo', action: 'move', target_type: 'task', target_id: String(task.id), summary: `${from} → ${to}`, created_at: new Date().toISOString() });
      onColumnChange(task.id, nextKey);
    } catch (e) {
      toast.error(`アクティビティ記録に失敗: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function handleDelete() {
    if (!confirm(`「${task.title}」を削除しますか？`)) return;
    await kanbanDB.deleteTask(task.id!);
    await activityDB.add({ page: 'todo', action: 'delete', target_type: 'task', target_id: String(task.id!), summary: task.title, created_at: new Date().toISOString() });
    onDeleted(task.id!);
    toast.success('削除しました');
  }

  async function handleArchive() {
    // 依存関係解除をアーカイブ前にアクティビティへ記録
    for (const { task: t } of predecessors) {
      await kanbanDB.addActivity(task.id!, 'dep_remove', { relation: 'blockedBy', taskTitle: t.title, reason: 'archived' }).catch(() => {});
    }
    for (const { task: t } of successors) {
      await kanbanDB.addActivity(task.id!, 'dep_remove', { relation: 'blocking', taskTitle: t.title, reason: 'archived' }).catch(() => {});
    }
    // タスク関係解除を記録
    if (relParent) await kanbanDB.addActivity(task.id!, 'relation_remove', { role: 'parent', with_title: relParent.task.title, reason: 'archived' }).catch(() => {});
    for (const { task: t } of relChildren) await kanbanDB.addActivity(task.id!, 'relation_remove', { role: 'child', with_title: t.title, reason: 'archived' }).catch(() => {});
    for (const { task: t } of relRelated) await kanbanDB.addActivity(task.id!, 'relation_remove', { role: 'related', with_title: t.title, reason: 'archived' }).catch(() => {});
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
    const newList = [...checklist, item];
    setChecklist(newList);
    setNewCheckText('');
    const updated = await kanbanDB.updateTask(task.id!, { checklist: newList });
    onSaved(updated);
    const act = await kanbanDB.addActivity(task.id!, 'checklist_add', { text });
    setActivities((prev) => [...prev, act]);
  }

  async function toggleCheck(id: string) {
    const item = checklist.find((c) => c.id === id);
    const nextDone = item ? !item.done : false;
    const newList = checklist.map((c) => c.id === id ? { ...c, done: !c.done } : c);
    setChecklist(newList);
    const updated = await kanbanDB.updateTask(task.id!, { checklist: newList });
    onSaved(updated);
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
    const newList = checklist.filter((c) => c.id !== id);
    setChecklist(newList);
    const updated = await kanbanDB.updateTask(task.id!, { checklist: newList.length > 0 ? newList : null });
    onSaved(updated);
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
      const newList = checklist.map((c) => c.id === id ? { ...c, text: newText } : c);
      setChecklist(newList);
      const updated = await kanbanDB.updateTask(task.id!, { checklist: newList });
      onSaved(updated);
      const act = await kanbanDB.addActivity(task.id!, 'checklist_edit', { from: oldText, to: newText });
      setActivities((prev) => [...prev, act]);
    }
    setEditingCheckId(null);
  }

  // ── 期日変更（即時保存） ─────────────────────────────────────
  const committedDue = useRef(task.due_date || '');
  async function commitDue(next: string) {
    setDueDate(next);
    const prev = committedDue.current;
    if (next === prev) return;
    committedDue.current = next;
    const updated = await kanbanDB.updateTask(task.id!, { due_date: next || undefined });
    onSaved(updated);
    let type: string;
    if (!prev && next)      type = 'due_add';
    else if (prev && !next) type = 'due_remove';
    else                    type = 'due_change';
    const act = await kanbanDB.addActivity(task.id!, type, { from: prev, to: next });
    setActivities((prev2) => [...prev2, act].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
  }

  // ── ラベル（即時アクティビティ記録） ────────────────────────
  async function toggleLabel(lid: number) {
    const next = new Set(selectedLabels);
    const adding = !next.has(lid);
    if (adding) next.add(lid); else next.delete(lid);
    setSelectedLabels(next);
    const l = localLabels.find((lb) => lb.id === lid);
    if (!l) return;
    if (adding) {
      await kanbanDB.addTaskLabel(task.id!, lid);
      const act = await kanbanDB.addActivity(task.id!, 'label_add', { name: l.name, color: l.color });
      setActivities((prev) => [...prev, act].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
    } else {
      await kanbanDB.removeTaskLabel(task.id!, lid);
      const act = await kanbanDB.addActivity(task.id!, 'label_remove', { name: l.name, color: l.color });
      setActivities((prev) => [...prev, act].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
    }
  }

  // ── タイトル確定（blur / Enter） ─────────────────────────
  async function commitTitle() {
    setTitleEditing(false);
    const trimmed = title.trim() || task.title;
    if (trimmed !== title) setTitle(trimmed);
    if (trimmed === committedTitle.current) return;
    committedTitle.current = trimmed;
    const updated = await kanbanDB.updateTask(task.id!, { title: trimmed });
    onSaved(updated);
    const act = await kanbanDB.addActivity(task.id!, 'title_change', { to: trimmed });
    setActivities((prev) => [...prev, act].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
  }

  // ── 説明確定（blur / 参照モードへ戻るとき） ────────────────
  async function commitDesc() {
    setDescEditing(false);
    if (description === committedDesc.current) return;
    committedDesc.current = description;
    const updated = await kanbanDB.updateTask(task.id!, { description });
    onSaved(updated);
    const act = await kanbanDB.addActivity(task.id!, 'description_change', {});
    setActivities((prev) => [...prev, act].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
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
    const deleted = await kanbanDB.deleteComment(id);
    // コメントを削除済みに更新（タイムラインに墓石表示するため state に残す）
    setComments((prev) => prev.map((c) => c.id === id ? deleted : c));
    // アクティビティ記録（本文冒頭を保存）
    const act = await kanbanDB.addActivity(task.id!, 'comment_delete', { preview: id });
    setActivities((prev) => [...prev, act]);
  }

  // ── 依存関係 ────────────────────────────────────────────
  async function addDependency(type: 'pre' | 'suc', targetTaskId: number) {
    setPicker(null);
    const targetTask = allTasks.find((t) => t.id === targetTaskId)!;
    if (type === 'pre') {
      const dep = await kanbanDB.addDependency(targetTaskId, task.id!);
      const newPreds = [...predecessors, { dep, task: targetTask }];
      setPredecessors(newPreds);
      onDepsMutated(task.id!, new Set(newPreds.map((p) => p.dep.from_task_id)));
      await kanbanDB.addActivity(task.id!,      'dep_add', { relation: 'blockedBy', taskTitle: targetTask.title });
      await kanbanDB.addActivity(targetTaskId,  'dep_add', { relation: 'blocking',  taskTitle: task.title });
      const act = await kanbanDB.getActivitiesByTask(task.id!);
      setActivities(act);
    } else {
      const dep = await kanbanDB.addDependency(task.id!, targetTaskId);
      setSuccessors((prev) => [...prev, { dep, task: targetTask }]);
      await kanbanDB.addActivity(task.id!,      'dep_add', { relation: 'blocking',  taskTitle: targetTask.title });
      await kanbanDB.addActivity(targetTaskId,  'dep_add', { relation: 'blockedBy', taskTitle: task.title });
      const act = await kanbanDB.getActivitiesByTask(task.id!);
      setActivities(act);
    }
  }

  async function removeDependency(depId: number, type: 'pre' | 'suc') {
    const target = type === 'pre'
      ? predecessors.find((x) => x.dep.id === depId)?.task
      : successors.find((x) => x.dep.id === depId)?.task;
    await kanbanDB.deleteDependency(depId);
    if (type === 'pre') {
      const newPreds = predecessors.filter((x) => x.dep.id !== depId);
      setPredecessors(newPreds);
      onDepsMutated(task.id!, new Set(newPreds.map((p) => p.dep.from_task_id)));
    } else {
      setSuccessors((prev) => prev.filter((x) => x.dep.id !== depId));
    }
    if (target) {
      const myRelation     = type === 'pre' ? 'blockedBy' : 'blocking';
      const targetRelation = type === 'pre' ? 'blocking'  : 'blockedBy';
      await kanbanDB.addActivity(task.id!,   'dep_remove', { relation: myRelation,     taskTitle: target.title });
      await kanbanDB.addActivity(target.id!, 'dep_remove', { relation: targetRelation, taskTitle: task.title });
      const act = await kanbanDB.getActivitiesByTask(task.id!);
      setActivities(act);
    }
  }

  // ── タスク関係 ──────────────────────────────────────────
  async function addRelation(type: 'parent' | 'child' | 'related', targetTaskId: number) {
    setPicker(null);
    const targetTask = allTasks.find((t) => t.id === targetTaskId)!;
    // 相手から見たロール（自分が parent を追加 → 相手には child として追加された）
    const mirrorRole: Record<string, string> = { parent: 'child', child: 'parent', related: 'related' };
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
    await kanbanDB.addActivity(task.id!,    'relation_add', { role: type,              with_title: targetTask.title });
    await kanbanDB.addActivity(targetTaskId,'relation_add', { role: mirrorRole[type],  with_title: task.title });
    const act = await kanbanDB.getActivitiesByTask(task.id!);
    setActivities(act);
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
    if (target) {
      const mirrorRole: Record<string, string> = { parent: 'child', child: 'parent', related: 'related' };
      await kanbanDB.addActivity(task.id!,   'relation_remove', { role: type,              with_title: target.title });
      await kanbanDB.addActivity(target.id!, 'relation_remove', { role: mirrorRole[type],  with_title: task.title });
      const act = await kanbanDB.getActivitiesByTask(task.id!);
      setActivities(act);
    }
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
    if (timelineTab === 'comments') {
      // コメントタブ: 削除済みを除外
      comments.filter((c) => !c.deleted_at).forEach((c) =>
        items.push({ kind: 'comment', data: c, time: new Date(c.created_at) }),
      );
    } else {
      // すべてタブ: 削除済みも含めて表示（墓石）
      comments.forEach((c) => items.push({ kind: 'comment', data: c, time: new Date(c.created_at) }));
      activities.forEach((a) => items.push({ kind: 'activity', data: a, time: new Date(a.created_at) }));
    }
    items.sort((a, b) => a.time.getTime() - b.time.getTime());
    return items;
  }, [comments, activities, timelineTab]);

  // ── 時刻フォーマット（今年は年省略、昨年以前は年表示）──────────
  function formatTime(iso: string) {
    const d = new Date(iso);
    const thisYear = d.getFullYear() === new Date().getFullYear();
    if (showAbsTime) {
      return d.toLocaleString('ja-JP', {
        ...(thisYear ? {} : { year: 'numeric' }),
        month: 'numeric', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    }
    const diff = Date.now() - d.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1)  return 'たった今';
    if (minutes < 60) return `${minutes}分前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24)   return `${hours}時間前`;
    const days = Math.floor(hours / 24);
    if (days < 7)     return `${days}日前`;
    return d.toLocaleDateString('ja-JP', {
      ...(thisYear ? {} : { year: 'numeric' }),
      month: 'numeric', day: 'numeric',
    });
  }

  // ── インラインラベル管理変更時のリロード ────────────────────
  async function handleLabelManagerChanged() {
    const updated = await kanbanDB.getAllLabels();
    setLocalLabels(updated);
    onLabelsChanged?.();
  }

  // ── タイムライン縦線の高さを CSS 変数で設定 ─────────────────
  useEffect(() => {
    const el = commentsRef.current;
    if (!el) return;
    const update = () => el.style.setProperty('--timeline-h', `${el.scrollHeight}px`);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [timelineItems]);

  // ── アクティビティアイコン（タイプ別） ──────────────────────
  function activityIcon(type: string) {
    const s = 10;
    switch (type) {
      case 'task_create':        return <FilePlusIcon size={s} />;
      case 'title_change':       return <PencilIcon size={s} />;
      case 'description_change': return <AlignLeftIcon size={s} />;
      case 'column_change':      return <ArrowRightIcon size={s} />;
      case 'label_add':
      case 'label_remove':       return <TagIcon size={s} />;
      case 'due_add':
      case 'due_remove':
      case 'due_change':         return <CalendarIcon size={s} />;
      case 'comment_delete':     return <Trash2Icon size={s} />;
      case 'comment_edit':       return <PencilIcon size={s} />;
      case 'relation_add':
      case 'relation_remove':    return <NetworkIcon size={s} />;
      case 'checklist_add':
      case 'checklist_check':
      case 'checklist_complete':
      case 'checklist_uncheck':  return <CheckSquareIcon size={s} />;
      case 'checklist_remove':   return <MinusSquareIcon size={s} />;
      case 'checklist_edit':     return <FileEditIcon size={s} />;
      case 'dep_add':
      case 'dep_remove':         return <GitMergeIcon size={s} />;
      case 'archive':            return <ArchiveIcon size={s} />;
      case 'restore_archive':    return <RotateCcwIcon size={s} />;
      default:                   return <CircleDotIcon size={s} />;
    }
  }

  // ── アクティビティ表示コンテンツ（テキスト or JSX） ──────────
  function activityContent(act: KanbanActivity): React.ReactNode {
    const c = act.content as Record<string, unknown>;
    const fmtDate = (iso: unknown) => {
      if (!iso || typeof iso !== 'string') return '（なし）';
      const [y, m, d] = (iso as string).split('-');
      return `${y}/${m}/${d}`;
    };
    const color = String(c.color ?? '#999');
    const labelBadge = (action: string) => (
      <span className="activity-label-badge">
        <span
          className="activity-label-badge__name"
          style={{ background: color }}
        >{String(c.name ?? '')}</span>
        <span className="activity-label-badge__action">{action}</span>
      </span>
    );
    switch (act.type) {
      case 'task_create':        return 'タスクを作成';
      case 'column_change':      return `カラムを「${c.from}」→「${c.to}」に変更`;
      case 'label_add':          return labelBadge('を追加');
      case 'label_remove':       return labelBadge('を削除');
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
    const x = Math.min(r.left, window.innerWidth - 268 - 8);
    setPicker({ type, x, y: r.bottom + 4 });
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
            {titleEditing ? (
              <input
                className="modal__title-input modal__title-input--editing"
                value={title}
                autoFocus
                onChange={(e) => setTitle(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) commitTitle();
                  if (e.key === 'Escape') { setTitle(committedTitle.current); setTitleEditing(false); }
                }}
                aria-label="タスクタイトル"
              />
            ) : (
              <span
                className="modal__title-text modal__title-text--clickable"
                onClick={() => setTitleEditing(true)}
                title="クリックして編集"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setTitleEditing(true); }}
              >
                {title || '（タイトルなし）'}
              </span>
            )}
          </div>
          <button className="modal__close" onClick={handleClose} aria-label="閉じる">
            <XIcon size={16} aria-hidden="true" />
          </button>
        </div>

        {/* ボディ（2カラム） */}
        <div className="modal__body">
          {/* メインエリア */}
          <div className="modal__main">

            {/* ── 説明セクション（参照 / 編集 切替） ── */}
            <div className="modal__section">
              {descEditing ? (
                <div className="desc-editor">
                  <div className="desc-editor__tabs">
                    <button
                      className={`desc-editor__tab${descSubTab === 'write' ? ' is-active' : ''}`}
                      onMouseDown={(e) => { e.preventDefault(); setDescSubTab('write'); }}
                    >編集</button>
                    <button
                      className={`desc-editor__tab${descSubTab === 'preview' ? ' is-active' : ''}`}
                      onMouseDown={(e) => { e.preventDefault(); setDescSubTab('preview'); }}
                    >プレビュー</button>
                    <button
                      className="desc-editor__confirm"
                      onMouseDown={(e) => { e.preventDefault(); commitDesc(); }}
                      title="確定"
                    >確定</button>
                  </div>
                  {descSubTab === 'write' ? (
                    <textarea
                      className="modal__description modal__description--editing"
                      value={description}
                      autoFocus
                      onChange={(e) => { setDescription(e.target.value); }}
                      onBlur={commitDesc}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') { setDescription(committedDesc.current); setDescEditing(false); }
                        if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); setDescSubTab('preview'); }
                      }}
                      placeholder="説明を入力（Markdown対応）…"
                    />
                  ) : (
                    <div
                      className="desc-editor__preview md-body"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); setDescSubTab('write'); } }}
                    >
                      {description ? (() => {
                        let cbIdx = 0;
                        return (
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            rehypePlugins={[rehypeSanitize]}
                            components={{
                              input: ({ type, checked }) => {
                                if (type === 'checkbox') {
                                  const idx = cbIdx++;
                                  return (
                                    <input type="checkbox" checked={!!checked} className="md-task-checkbox"
                                      onChange={(e) => {
                                        const next = toggleCheckboxInMarkdown(description, idx, e.target.checked);
                                        setDescription(next); committedDesc.current = next;
                                        kanbanDB.updateTask(task.id!, { description: next }).then(onSaved);
                                      }} />
                                  );
                                }
                                return <input type={type} />;
                              },
                            }}
                          >{description}</ReactMarkdown>
                        );
                      })() : <span className="desc-editor__empty">（内容なし）</span>}
                    </div>
                  )}
                </div>
              ) : (
                <div
                  className={`modal__desc-preview md-body${!description ? ' modal__desc-preview--empty' : ''}`}
                  onClick={() => { setDescEditing(true); setDescSubTab('write'); }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') { setDescEditing(true); setDescSubTab('write'); } }}
                  title="クリックして編集"
                >
                  {description ? (() => {
                    let cbIdx = 0;
                    return (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeSanitize]}
                        components={{
                          input: ({ type, checked }) => {
                            if (type === 'checkbox') {
                              const idx = cbIdx++;
                              return (
                                <input
                                  type="checkbox"
                                  checked={!!checked}
                                  className="md-task-checkbox"
                                  onChange={(e) => {
                                    const next = toggleCheckboxInMarkdown(description, idx, e.target.checked);
                                    setDescription(next);
                                    committedDesc.current = next;
                                    kanbanDB.updateTask(task.id!, { description: next }).then(onSaved);
                                  }}
                                />
                              );
                            }
                            return <input type={type} />;
                          },
                        }}
                      >
                        {description}
                      </ReactMarkdown>
                    );
                  })() : null}
                </div>
              )}
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
                    onClick={() => { if (editingCheckId !== item.id) { toggleCheck(item.id); } }}
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
                <button className="checklist-add-btn" onClick={addChecklist}>追加</button>
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
                      onClick={() => { setTimelineTab('all'); lsSet(LS_TIMELINE_TAB, 'all'); }}>すべて</button>
                    <button
                      className={`timeline-tab${timelineTab === 'comments' ? ' is-active' : ''}`}
                      onClick={() => { setTimelineTab('comments'); lsSet(LS_TIMELINE_TAB, 'comments'); }}>コメント</button>
                  </div>
                  <button
                    className={`timeline-time-btn${showAbsTime ? ' is-active' : ''}`}
                    onClick={() => { setShowAbsTime((v) => { lsSet(LS_ABS_TIME, v ? '0' : '1'); return !v; }); }}
                    title={showAbsTime ? '相対時刻で表示' : '絶対時刻で表示'}
                    aria-label={showAbsTime ? '相対時刻で表示' : '絶対時刻で表示'}
                  >
                    {/* 現在のモードを示すアイコン（絶対=カレンダー、相対=時計） */}
                    {showAbsTime
                      ? <CalendarIcon size={13} aria-hidden="true" />
                      : <TimerIcon    size={13} aria-hidden="true" />
                    }
                  </button>
                </div>
              </div>
              <div className="modal__comments" ref={commentsRef}>
                {timelineItems.map((item, i) => {
                  if (item.kind === 'comment') {
                    const c = item.data;
                    // 削除済みコメントは墓石表示（本文あり）
                    if (c.deleted_at) {
                      return (
                        <div key={`c-${c.id}`} className="comment-item comment-item--deleted">
                          <div className="comment-item__header">
                            <span className="comment-item__date">
                              {formatTime(c.created_at)}
                              <span className="comment-item__deleted-badge">
                                <Trash2Icon size={9} aria-hidden="true" />削除済み
                              </span>
                            </span>
                          </div>
                          <p className="comment-item__tombstone-body">{c.body}</p>
                        </div>
                      );
                    }
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
                          <div className="comment-item__body md-body">
                            {(() => {
                              let cbIdx = 0;
                              return (
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm]}
                                  rehypePlugins={[rehypeSanitize]}
                                  components={{
                                    input: ({ type, checked }) => {
                                      if (type === 'checkbox') {
                                        const idx = cbIdx++;
                                        return (
                                          <input
                                            type="checkbox"
                                            checked={!!checked}
                                            className="md-task-checkbox"
                                            onChange={(e) => {
                                              const next = toggleCheckboxInMarkdown(c.body, idx, e.target.checked);
                                              updateComment(c.id!, next);
                                            }}
                                          />
                                        );
                                      }
                                      return <input type={type} />;
                                    },
                                  }}
                                >
                                  {c.body}
                                </ReactMarkdown>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    );
                  } else {
                    const a = item.data;
                    return (
                      <div key={`a-${a.id}-${i}`} className="activity-item">
                        <span className="activity-item__icon" aria-hidden="true">
                          {activityIcon(a.type)}
                        </span>
                        <span className="activity-item__text">{activityContent(a)}</span>
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
              <Select
                value={column}
                options={columns.map((c) => ({ value: c.key, label: c.name }))}
                onChange={commitColumn}
              />
            </div>

            {/* 期日（カスタム日付ピッカー） */}
            <div className="modal__sidebar-item">
              <span className="modal__sidebar-label">期日</span>
              <DatePicker
                value={dueDate}
                onChange={(v) => commitDue(v)}
                onClear={() => commitDue('')}
                displayText={dueDate
                  ? getDueInfo(dueDate, columns.find((c) => c.key === column)?.done || false).text
                  : undefined}
                status={getDueInfo(dueDate, columns.find((c) => c.key === column)?.done || false).status || undefined}
                disabled={columns.find((c) => c.key === column)?.done || false}
              />
            </div>

            {/* ラベル */}
            <div className="modal__sidebar-item">
              <div className="flex items-center justify-between">
                <span className="modal__sidebar-label">ラベル</span>
                <button onClick={() => setShowInlineLabelMgr(true)}
                  className="p-0.5 rounded hover:bg-[var(--c-bg-2)] text-[var(--c-fg-3)]" title="ラベル管理">
                  <TagIcon size={11} aria-hidden="true" />
                </button>
              </div>
              {localLabels.length > 0 && (
                <div className="modal__label-list">
                  {localLabels.map((l) => (
                    <button key={l.id}
                      onClick={() => toggleLabel(l.id!)}
                      style={{ backgroundColor: l.color, color: '#fff', opacity: selectedLabels.has(l.id!) ? 1 : 0.3 }}
                      className="modal-existing-label">
                      {l.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 繰り返し */}
            <div className="modal__sidebar-item">
              <span className="modal__sidebar-label">繰り返し</span>
              <div className="recurring-row">
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    className="toggle-switch__input"
                    checked={!!recurring}
                    onChange={(e) => {
                      const next = e.target.checked ? { interval: 'weekly' as const, next_date: '' } : null;
                      setRecurring(next);
                      kanbanDB.updateTask(task.id!, { recurring: next || null }).then(onSaved);
                    }}
                  />
                  <span className="toggle-switch__slider" />
                </label>
                <span className="recurring-toggle-text">繰り返す</span>
                {recurring && (
                  <Select
                    value={recurring.interval}
                    options={[
                      { value: 'daily',   label: '毎日' },
                      { value: 'weekly',  label: '毎週' },
                      { value: 'monthly', label: '毎月' },
                    ]}
                    onChange={(v) => {
                      const next = { ...recurring, interval: v as 'daily' | 'weekly' | 'monthly' };
                      setRecurring(next);
                      kanbanDB.updateTask(task.id!, { recurring: next }).then(onSaved);
                    }}
                  />
                )}
              </div>
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
              <button onClick={saveAsTemplate} className="modal-action-btn modal-action-btn--bookmark">
                <BookmarkIcon size={13} aria-hidden="true" />
                テンプレートとして保存
              </button>
            </div>

            {/* アクション（アーカイブ・削除のみ。保存は閉じる時に自動） */}
            <div className="modal__sidebar-item modal__sidebar-actions">
              <button onClick={handleArchive} className="modal-action-btn modal-action-btn--amber">
                <ArchiveIcon size={13} aria-hidden="true" />アーカイブ
              </button>
              <button onClick={handleDelete} className="modal-action-btn modal-action-btn--danger">
                <Trash2Icon size={13} aria-hidden="true" />削除
              </button>
            </div>

          </div>
        </div>
      </div>

      {/* インラインラベル管理 */}
      {showInlineLabelMgr && (
        <LabelManagerModal
          labels={localLabels}
          onClose={() => setShowInlineLabelMgr(false)}
          onChanged={handleLabelManagerChanged}
          wrapperClassName="z-[300]"
        />
      )}

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
          <h3 className="font-semibold text-[var(--c-fg)] text-sm">{column ? 'カラム設定' : 'カラムを追加'}</h3>
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
          <div className="recurring-row">
            <label className="toggle-switch">
              <input type="checkbox" className="toggle-switch__input" checked={done} onChange={(e) => setDone(e.target.checked)} />
              <span className="toggle-switch__slider" />
            </label>
            <span className="text-sm text-[var(--c-fg)]">完了カラム</span>
          </div>
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--c-border)]">
          {column ? (
            <button onClick={handleDelete} className="px-2 py-1.5 rounded border border-red-300 text-red-500 text-xs hover:bg-red-50 dark:hover:bg-red-950">削除</button>
          ) : <span />}
          <button onClick={handleSave} className="px-3 py-1.5 rounded bg-[var(--c-accent)] text-white text-sm">保存</button>
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
  wrapperClassName?: string;
}

const PRESET_COLORS = [
  '#ef4444', '#f43f5e', '#f97316', '#f59e0b', '#eab308', '#84cc16',
  '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#3b82f6', '#0ea5e9',
  '#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#64748b', '#71717a',
  '#1e293b', '#92400e',
];

function LabelManagerModal({ labels, onClose, onChanged, wrapperClassName }: LabelManagerModalProps) {
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
    <div className={`fixed inset-0 bg-black/50 flex items-center justify-center p-4 ${wrapperClassName ?? 'z-50'}`} onClick={onClose}>
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
          <div className="pt-2 border-t border-[var(--c-border)]">
            <div className="grid grid-cols-10 gap-1 mb-1">
              {PRESET_COLORS.map((c) => (
                <button key={c} onClick={() => setNewColor(c)}
                  className={`w-5 h-5 rounded-full shrink-0 ${newColor === c ? 'ring-2 ring-[var(--c-accent)] ring-offset-1' : ''}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
            <div className="flex items-center gap-1 mt-1">
              <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)}
                className="w-6 h-6 rounded cursor-pointer border-0 p-0 shrink-0" title="カスタムカラー" />
              <span className="text-xs text-[var(--c-fg-3)]">カスタム</span>
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
  labels: KanbanLabel[];
  onClose: () => void;
  onRestored: () => void;
}

function ArchiveModal({ columns, labels, onClose, onRestored }: ArchiveModalProps) {
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
    const newTask = await kanbanDB.addTask({ ...archive, id: undefined, position: colTasks.length, checklist: archive.checklist ?? null });
    // アクティビティを新しい task_id で復元
    if (archive.archived_activities?.length) {
      for (const act of archive.archived_activities) {
        await kanbanDB.addActivity(newTask.id!, act.type, act.content);
      }
    }
    // ラベルを復元（まだ存在するもののみ）
    if (archive.archived_label_ids?.length) {
      const allLabels = await kanbanDB.getAllLabels();
      const existingIds = new Set(allLabels.map((l) => l.id!));
      for (const lid of archive.archived_label_ids) {
        if (existingIds.has(lid)) await kanbanDB.addTaskLabel(newTask.id!, lid).catch(() => {});
      }
    }
    // コメントを復元（削除済みを除く）
    if (archive.archived_comments?.length) {
      for (const c of archive.archived_comments) {
        if (!c.deleted_at) await kanbanDB.addComment(newTask.id!, c.body);
      }
    }
    await kanbanDB.addActivity(newTask.id!, 'restore_archive', {});
    await kanbanDB.deleteArchive(archive.id!);
    await activityDB.add({ page: 'todo', action: 'create', target_type: 'task', target_id: String(newTask.id!), summary: `「${archive.title}」をアーカイブから復元`, created_at: new Date().toISOString() });
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
            const archivedLabels = (a.archived_label_ids || [])
              .map((id) => labels.find((l) => l.id === id))
              .filter(Boolean) as KanbanLabel[];
            const checkTotal = (a.checklist || []).length;
            const checkDone  = (a.checklist || []).filter((c) => c.done).length;
            return (
              <div key={a.id} className="flex items-start gap-2 px-4 py-3 hover:bg-[var(--c-bg-2)]">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-[var(--c-fg)] truncate font-medium">{a.title}</div>
                  <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-1">
                    <span className="text-xs text-[var(--c-fg-3)] bg-[var(--c-bg-2)] px-1.5 py-0.5 rounded">{colName}</span>
                    {archivedLabels.map((l) => (
                      <span key={l.id} className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: l.color }} title={l.name} />
                    ))}
                    {a.due_date && (
                      <span className="flex items-center gap-0.5 text-xs text-[var(--c-fg-3)]">
                        <CalendarIcon size={10} />{new Date(a.due_date + 'T00:00:00').toLocaleDateString('ja-JP')}
                      </span>
                    )}
                    {checkTotal > 0 && (
                      <span className="flex items-center gap-0.5 text-xs text-[var(--c-fg-3)]">
                        <CheckIcon size={10} />{checkDone}/{checkTotal}
                      </span>
                    )}
                    <span className="text-xs text-[var(--c-fg-3)] ml-auto">{new Date(a.archived_at).toLocaleDateString('ja-JP')}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 pt-0.5">
                  <button onClick={() => restore(a)} title="復元"
                    className="p-1 rounded hover:bg-[var(--c-accent)]/10 text-[var(--c-accent)]"><RotateCcwIcon size={13} /></button>
                  <button onClick={() => deleteArchive(a.id!)} title="完全に削除"
                    className="p-1 rounded hover:bg-red-50 text-red-400 hover:text-red-500"><Trash2Icon size={13} /></button>
                </div>
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
// TemplateManagerModal（テンプレート管理）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface TemplateManagerModalProps {
  labels: KanbanLabel[];
  onClose: () => void;
  onChanged: () => void;
}

function TemplateManagerModal({ labels, onClose, onChanged }: TemplateManagerModalProps) {
  const toast = useToast();
  const [templates, setTemplates]       = useState<KanbanTemplate[]>([]);
  const [selected,  setSelected]        = useState<KanbanTemplate | null>(null);
  const [editName,  setEditName]        = useState('');
  const [editTitle, setEditTitle]       = useState('');
  const [editDesc,  setEditDesc]        = useState('');
  const [editChecklist, setEditChecklist] = useState<ChecklistItem[]>([]);
  const [editLabelIds,  setEditLabelIds]  = useState<Set<number>>(new Set());
  const [newCheckText,  setNewCheckText]  = useState('');

  useEffect(() => { kanbanDB.getAllTemplates().then(setTemplates); }, []);

  function selectTemplate(t: KanbanTemplate) {
    setSelected(t);
    setEditName(t.name);
    setEditTitle(t.title);
    setEditDesc(t.description || '');
    setEditChecklist(t.checklist ? [...t.checklist] : []);
    setEditLabelIds(new Set(t.label_ids));
  }

  async function newTemplate() {
    const all = await kanbanDB.getAllTemplates();
    const t = await kanbanDB.addTemplate({ name: '新規テンプレート', title: '', description: '', label_ids: [], position: all.length });
    const updated = await kanbanDB.getAllTemplates();
    setTemplates(updated);
    selectTemplate(t);
    onChanged();
  }

  async function saveTemplate() {
    if (!selected) return;
    await kanbanDB.updateTemplate({
      ...selected, name: editName, title: editTitle, description: editDesc,
      checklist: editChecklist.length > 0 ? editChecklist : null,
      label_ids: [...editLabelIds],
    });
    const updated = await kanbanDB.getAllTemplates();
    setTemplates(updated);
    const next = updated.find((t) => t.id === selected.id);
    if (next) setSelected(next);
    onChanged();
    toast.success('保存しました');
  }

  async function deleteTemplate(id: number) {
    if (!confirm('削除しますか？')) return;
    await kanbanDB.deleteTemplate(id);
    const updated = await kanbanDB.getAllTemplates();
    setTemplates(updated);
    if (selected?.id === id) setSelected(null);
    onChanged();
  }

  function addChecklistItem() {
    if (!newCheckText.trim()) return;
    setEditChecklist((prev) => [...prev, { id: newId(), text: newCheckText.trim(), done: false, position: prev.length }]);
    setNewCheckText('');
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[var(--c-bg)] rounded-xl border border-[var(--c-border)] w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--c-border)]">
          <h3 className="font-semibold text-[var(--c-fg)] text-sm flex items-center gap-2"><FileEditIcon size={14} />テンプレート管理</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--c-bg-2)] text-[var(--c-fg-3)]"><XIcon size={14} /></button>
        </div>
        <div className="template-modal__body flex-1 overflow-hidden">
          {/* 左カラム：一覧 */}
          <div className="template-modal__list-col">
            <button onClick={newTemplate}
              className="w-full px-3 py-1.5 rounded bg-[var(--c-accent)] text-white text-xs text-center">+ 新規テンプレート</button>
            {templates.length === 0 && <p className="template-list__empty">テンプレートがありません</p>}
            <ul className="template-list">
              {templates.map((t) => (
                <li key={t.id} className={`template-list__item${selected?.id === t.id ? ' is-active' : ''}`}
                  onClick={() => selectTemplate(t)}>
                  <span className="template-list__name">{t.name}</span>
                  <button className="template-list__del p-0.5 text-[var(--c-fg-3)] hover:text-red-400"
                    onClick={(e) => { e.stopPropagation(); deleteTemplate(t.id!); }}>
                    <Trash2Icon size={10} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
          {/* 右カラム：編集 */}
          <div className="template-modal__form-col overflow-y-auto">
            {!selected ? (
              <p className="template-form__empty">テンプレートを選択してください</p>
            ) : (
              <div className="template-form">
                <div className="template-form__row">
                  <label className="template-form__label">テンプレート名</label>
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} className="template-form__input" placeholder="テンプレート名" />
                </div>
                <div className="template-form__row">
                  <label className="template-form__label">タイトル</label>
                  <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="template-form__input" placeholder="タスクタイトル" />
                </div>
                <div className="template-form__row">
                  <label className="template-form__label">説明</label>
                  <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className="template-form__textarea" rows={3} placeholder="説明" />
                </div>
                <div className="template-form__row">
                  <label className="template-form__label">チェックリスト</label>
                  <div className="template-checklist-items">
                    {editChecklist.map((item) => (
                      <div key={item.id} className="template-checklist-item">
                        <span className="template-checklist-item__text">{item.text}</span>
                        <button className="template-checklist-item__del hover:text-red-400"
                          onClick={() => setEditChecklist((prev) => prev.filter((c) => c.id !== item.id))}>
                          <XIcon size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-1 mt-1">
                    <input value={newCheckText} onChange={(e) => setNewCheckText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addChecklistItem(); }}
                      className="template-form__input flex-1" placeholder="チェックリスト項目を追加" />
                    <button onClick={addChecklistItem} className="px-2 rounded bg-[var(--c-accent)] text-white text-xs shrink-0">追加</button>
                  </div>
                </div>
                {labels.length > 0 && (
                  <div className="template-form__row">
                    <label className="template-form__label">ラベル</label>
                    <div className="flex flex-wrap gap-1">
                      {labels.map((l) => (
                        <button key={l.id}
                          style={{ backgroundColor: l.color, color: '#fff', opacity: editLabelIds.has(l.id!) ? 1 : 0.3 }}
                          className="modal-existing-label text-xs"
                          onClick={() => setEditLabelIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(l.id!)) next.delete(l.id!); else next.add(l.id!);
                            return next;
                          })}>
                          {l.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="template-form__actions">
                  <button onClick={saveTemplate} className="px-4 py-1.5 rounded bg-[var(--c-accent)] text-white text-sm">保存</button>
                </div>
              </div>
            )}
          </div>
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

  const [templates,      setTemplates]      = useState<KanbanTemplate[]>([]);

  // モーダル・UI 状態
  const [selectedTask,    setSelectedTask]    = useState<KanbanTask | null>(null);
  const [selectedTaskLabels, setSelectedTaskLabels] = useState<Set<number>>(new Set());
  const [editingColumn,  setEditingColumn]   = useState<KanbanColumn | null | undefined>(undefined);
  const [showLabelMgr,   setShowLabelMgr]    = useState(false);
  const [showArchive,    setShowArchive]      = useState(false);
  const [showTemplateMgr, setShowTemplateMgr] = useState(false);

  const importFileRef = useRef<HTMLInputElement>(null);

  // フィルター・ソート
  const [filterText,    setFilterText]    = useState(() => lsGet(LS_FILTER) || '');
  const [filterLabels,  setFilterLabels]  = useState<Set<number>>(new Set());
  const [filterDue,     setFilterDue]     = useState(() => lsGet(LS_FILTER_DUE) || '');
  const [sort,          setSort]          = useState<{ field: string; dir: 'asc' | 'desc' }>(
    () => lsJson<{ field: string; dir: 'asc' | 'desc' }>(LS_SORT) || { field: 'position', dir: 'asc' }
  );

  // DnD
  const [dragTaskId,        setDragTaskId]        = useState<number | null>(null);
  const [dragOverColumnKey, setDragOverColumnKey] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  // ドラッグ開始時のスナップショットと最新プレビューを ref で保持
  const dragOriginRef  = useRef<{ taskId: number; sourceColumnKey: string; snapshot: Record<string, KanbanTask[]> } | null>(null);
  const previewMapRef  = useRef<Record<string, KanbanTask[]>>({});

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

    const allTemplates = await kanbanDB.getAllTemplates();
    setTemplates(allTemplates);

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

  // ── グローバル検索ハンドラ登録 ─────────────────────────────
  // ref で最新の tasksMap を保持し、ハンドラを一度だけ登録する。
  // tasksMap を deps に入れると update のたびに unregister/register が走り
  // その窓で検索が来ると結果が返らなくなるため ref パターンを使用。
  const { config: tabConfig, setActiveTab } = useTabStore();
  const tasksMapRef = useRef(tasksMap);
  tasksMapRef.current = tasksMap; // レンダーのたびに同期更新

  useEffect(() => {
    const todoLabel = tabConfig.find((t) => t.pageSrc === 'pages/todo.html')?.label ?? '';

    searchRegistry.register('todo', async (query) => {
      const q = query.toLowerCase();
      const found: Array<{ task: KanbanTask }> = [];
      outer: for (const tasks of Object.values(tasksMapRef.current)) {
        for (const task of tasks) {
          if (
            task.title.toLowerCase().includes(q) ||
            (task.description || '').toLowerCase().includes(q)
          ) {
            found.push({ task });
            if (found.length >= 10) break outer;
          }
        }
      }
      return found.map(({ task }) => ({
        id: `todo-${task.id}`,
        pageSrc: 'pages/todo.html',
        title: task.title,
        excerpt: extractSearchExcerpt(task.description || '', q),
        onSelect: async () => {
          if (todoLabel) setActiveTab(todoLabel);
          const lblIds = await kanbanDB.getTaskLabels(task.id!);
          setSelectedTask(task);
          setSelectedTaskLabels(new Set(lblIds.map((l) => l.label_id)));
        },
      }));
    });

    return () => searchRegistry.unregister('todo');
  // tasksMap は ref 経由で読むため deps から除外
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabConfig, setActiveTab]);

  // ── フィルター適用 ────────────────────────────────────────
  const filteredTasksMap = useMemo((): Record<string, KanbanTask[]> => {
    const result: Record<string, KanbanTask[]> = {};
    const q = filterText.toLowerCase();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().slice(0, 10);
    const weekEnd = new Date(today); weekEnd.setDate(today.getDate() + 7);
    const weekEndStr = weekEnd.toISOString().slice(0, 10);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const monthEndStr = monthEnd.toISOString().slice(0, 10);

    for (const [key, tasks] of Object.entries(tasksMap)) {
      let filtered = tasks;
      if (q) filtered = filtered.filter((t) => t.title.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q));
      if (filterLabels.size > 0) {
        filtered = filtered.filter((t) => {
          const tls = taskLabels.get(t.id!) || new Set();
          return [...filterLabels].some((lid) => tls.has(lid));
        });
      }
      // 期日フィルタ
      if (filterDue) {
        filtered = filtered.filter((t) => {
          const d = t.due_date || '';
          if (filterDue === 'has_due')  return !!d;
          if (filterDue === 'no_due')   return !d;
          if (filterDue === 'overdue')  return !!d && d < todayStr;
          if (filterDue === 'today')    return d === todayStr;
          if (filterDue === 'week')     return !!d && d >= todayStr && d <= weekEndStr;
          if (filterDue === 'month')    return !!d && d >= todayStr && d <= monthEndStr;
          return true;
        });
      }
      // ソート
      if (sort.field !== 'position') {
        filtered = [...filtered].sort((a, b) => {
          let va: string | number = '', vb: string | number = '';
          if (sort.field === 'title')    { va = a.title.toLowerCase(); vb = b.title.toLowerCase(); }
          else if (sort.field === 'due') { va = a.due_date || '9999';  vb = b.due_date || '9999'; }
          else if (sort.field === 'created') { va = a.created_at; vb = b.created_at; }
          else if (sort.field === 'updated') { va = a.updated_at; vb = b.updated_at; }
          if (va < vb) return sort.dir === 'asc' ? -1 : 1;
          if (va > vb) return sort.dir === 'asc' ? 1 : -1;
          return 0;
        });
      }
      result[key] = filtered;
    }
    return result;
  }, [tasksMap, filterText, filterLabels, filterDue, sort, taskLabels]);

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
    await kanbanDB.addActivity(task.id!, 'archive', {});
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
      await kanbanDB.addActivity(t.id!, 'archive', {});
      await kanbanDB.archiveTask(t);
      await kanbanDB.deleteTask(t.id!);
      await activityDB.add({ page: 'todo', action: 'archive', target_type: 'task', target_id: String(t.id!), summary: t.title, created_at: new Date().toISOString() });
    }
    await load();
    toast.success('アーカイブしました');
  }, [tasksMap, load, toast]);

  // ── テンプレートからタスク追加 ───────────────────────────────
  const addTaskFromTemplate = useCallback(async (columnKey: string, template: KanbanTemplate) => {
    const colTasks = tasksMap[columnKey] || [];
    const task = await kanbanDB.addTask({
      title: template.title || template.name,
      description: template.description || '',
      column: columnKey,
      position: colTasks.length,
      checklist: template.checklist ?? null,
    });
    if (template.label_ids?.length) {
      for (const lid of template.label_ids) {
        await kanbanDB.addTaskLabel(task.id!, lid).catch(() => {});
      }
    }
    await kanbanDB.addActivity(task.id!, 'task_create', {}).catch(() => {});
    await activityDB.add({ page: 'todo', action: 'create', target_type: 'task', target_id: String(task.id!), summary: task.title, created_at: new Date().toISOString() });
    await load();
    toast.success('タスクを追加しました');
  }, [tasksMap, load, toast]);

  // ── エクスポート ──────────────────────────────────────────
  const exportData = useCallback(async () => {
    const data = await kanbanDB.exportAll();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    a.href = url;
    a.download = `kanban_export_${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('エクスポートしました');
  }, [toast]);

  // ── インポート ────────────────────────────────────────────
  const handleImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!confirm('現在のデータをすべて上書きしてインポートしますか？')) return;
      await kanbanDB.importAll(data);
      await load();
      toast.success('インポートしました');
    } catch {
      toast.error('インポートに失敗しました。JSONファイルを確認してください。');
    }
  }, [load, toast]);

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

  // スナップショットからプレビュー用 tasksMap を構築するヘルパー
  function buildPreview(
    snapshot: Record<string, KanbanTask[]>,
    taskId: number,
    sourceKey: string,
    targetKey: string,
    overTaskId: number | null,
  ): Record<string, KanbanTask[]> {
    const activeTask = (snapshot[sourceKey] || []).find((t) => t.id === taskId);
    if (!activeTask) return snapshot;
    const newMap: Record<string, KanbanTask[]> = {};
    for (const key of Object.keys(snapshot)) {
      newMap[key] = snapshot[key].filter((t) => t.id !== taskId);
    }
    if (!newMap[targetKey]) newMap[targetKey] = [];
    const moved = { ...activeTask, column: targetKey };
    if (overTaskId !== null) {
      const idx = newMap[targetKey].findIndex((t) => t.id === overTaskId);
      newMap[targetKey].splice(idx >= 0 ? idx : newMap[targetKey].length, 0, moved);
    } else {
      newMap[targetKey].push(moved);
    }
    return newMap;
  }

  function handleDragStart(event: DragStartEvent) {
    const { data } = event.active;
    if (data.current?.type !== 'task') return;
    const taskId = data.current.taskId as number;
    setDragTaskId(taskId);
    for (const [key, tasks] of Object.entries(tasksMap)) {
      if (tasks.some((t) => t.id === taskId)) {
        dragOriginRef.current = { taskId, sourceColumnKey: key, snapshot: tasksMap };
        previewMapRef.current = tasksMap;
        break;
      }
    }
  }

  function handleDragOver(event: DragOverEvent) {
    const { over } = event;
    if (!over || !dragOriginRef.current) { setDragOverColumnKey(null); return; }
    const { taskId, sourceColumnKey, snapshot } = dragOriginRef.current;
    const overId = String(over.id);
    let targetColumnKey: string | null = null;
    let overTaskId: number | null = null;

    if (overId.startsWith('col-')) {
      targetColumnKey = overId.replace('col-', '');
    } else if (overId.startsWith('task-')) {
      overTaskId = parseInt(overId.replace('task-', ''));
      if (overTaskId === taskId) return;
      // スナップショットから対象カラムを特定（live state は変動するため）
      for (const [key, tasks] of Object.entries(snapshot)) {
        if (tasks.some((t) => t.id === overTaskId)) { targetColumnKey = key; break; }
      }
    }
    if (!targetColumnKey) return;

    setDragOverColumnKey(targetColumnKey);
    const preview = buildPreview(snapshot, taskId, sourceColumnKey, targetColumnKey, overTaskId);
    previewMapRef.current = preview;
    setTasksMap(preview);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { over } = event;
    setDragTaskId(null);
    setDragOverColumnKey(null);

    const origin = dragOriginRef.current;
    dragOriginRef.current = null;
    if (!origin) return;

    const { taskId: activeTaskId, sourceColumnKey, snapshot } = origin;

    // キャンセル時はスナップショットに戻す
    if (!over) { setTasksMap(snapshot); previewMapRef.current = snapshot; return; }

    // 最新のプレビューから最終カラムを特定
    const finalMap = previewMapRef.current;
    let targetColumnKey: string | null = null;
    for (const [key, tasks] of Object.entries(finalMap)) {
      if (tasks.some((t) => t.id === activeTaskId)) { targetColumnKey = key; break; }
    }
    if (!targetColumnKey) { setTasksMap(snapshot); return; }

    const sourceTasks = [...(finalMap[sourceColumnKey] || [])];
    const targetTasks = sourceColumnKey === targetColumnKey
      ? sourceTasks
      : [...(finalMap[targetColumnKey] || [])];

    // position 再計算
    targetTasks.forEach((t, i) => { t.position = i; });
    if (sourceColumnKey !== targetColumnKey) sourceTasks.forEach((t, i) => { t.position = i; });

    const commitMap = { ...finalMap, [sourceColumnKey]: sourceTasks, [targetColumnKey]: targetTasks };
    setTasksMap(commitMap);

    const isDoneColumn = columns.find((c) => c.key === targetColumnKey)?.done || false;

    // カラム間移動: アクティビティ記録 → DB 更新
    if (sourceColumnKey !== targetColumnKey) {
      const from = columns.find((c) => c.key === sourceColumnKey)?.name ?? sourceColumnKey;
      const to   = columns.find((c) => c.key === targetColumnKey)?.name ?? targetColumnKey;
      try {
        await kanbanDB.addActivity(activeTaskId, 'column_change', { from, to });
        await activityDB.add({ page: 'todo', action: 'move', target_type: 'task', target_id: String(activeTaskId), summary: `${from} → ${to}`, created_at: new Date().toISOString() });
      } catch (e) {
        toast.error(`アクティビティ記録に失敗: ${e instanceof Error ? e.message : String(e)}`);
      }
      await Promise.all(targetTasks.map((t) => kanbanDB.updateTask(t.id!, { column: targetColumnKey!, position: t.position })));
      await Promise.all(sourceTasks.map((t) => kanbanDB.updateTask(t.id!, { position: t.position })));
    } else {
      await Promise.all(targetTasks.map((t) => kanbanDB.updateTask(t.id!, { position: t.position })));
    }

    const movedTask = targetTasks.find((t) => t.id === activeTaskId);
    if (isDoneColumn && movedTask?.recurring) { await createRecurringNext(movedTask); await load(); }
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

  // ── タスク即時保存後の処理（モーダルは閉じない） ─────────────
  function handleTaskSaved(updated: KanbanTask) {
    setSelectedTask(updated);
    setTasksMap((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        next[key] = next[key].map((t) => t.id === updated.id ? updated : t);
      }
      return next;
    });
  }

  // ── モーダルでの依存関係変更をボードに即時反映 ───────────────
  function handleDepsMutated(taskId: number, blockedBy: Set<number>) {
    setDependencies((prev) => {
      const next = new Map(prev);
      next.set(taskId, { blockedBy });
      return next;
    });
  }

  // ── モーダルからのカラム変更をボードに即時反映 ──────────────
  function handleModalColumnChange(taskId: number, newColumn: string) {
    setTasksMap((prev) => {
      const next: Record<string, KanbanTask[]> = {};
      let movedTask: KanbanTask | undefined;
      for (const [key, tasks] of Object.entries(prev)) {
        const remaining = tasks.filter((t) => { if (t.id === taskId) { movedTask = t; return false; } return true; });
        next[key] = remaining;
      }
      if (movedTask) {
        next[newColumn] = [...(next[newColumn] || []), { ...movedTask, column: newColumn }];
      }
      return next;
    });
  }

  // ── タスク削除後の処理 ────────────────────────────────────
  function handleTaskDeleted(_id: number) {
    setSelectedTask(null);
    setSelectedTaskLabels(new Set());
    load();
  }

  // ── カラム編集モーダルを開く ─────────────────────────────
  const openEditColumn = useCallback((c: KanbanColumn) => setEditingColumn(c), []);


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

        {/* ラベルフィルタ */}
        <Select
          multiple
          values={[...filterLabels].map(String)}
          options={labels.map((l) => ({ value: String(l.id!), label: l.name, color: l.color }))}
          onChangeMultiple={(vals) => setFilterLabels(new Set(vals.map(Number)))}
          placeholder="ラベル"
          icon={<TagIcon size={12} aria-hidden="true" />}
          className="toolbar-select toolbar-select--label"
        />

        {/* 期日フィルタ */}
        <Select
          value={filterDue}
          options={[
            { value: '',         label: '期限: すべて' },
            { value: 'overdue',  label: '期限切れ' },
            { value: 'today',    label: '今日' },
            { value: 'week',     label: '今週' },
            { value: 'month',    label: '今月' },
            { value: 'has_due',  label: '期限あり' },
            { value: 'no_due',   label: '期限なし' },
          ]}
          onChange={(v) => { setFilterDue(v); lsSet(LS_FILTER_DUE, v); }}
          className="toolbar-select"
        />

        {/* フィルタが有効なときのみクリアボタンを表示 */}
        {(filterText !== '' || filterLabels.size > 0 || filterDue !== '') && (
          <button
            onClick={() => {
              setFilterText(''); lsSet(LS_FILTER, '');
              setFilterLabels(new Set());
              setFilterDue(''); lsSet(LS_FILTER_DUE, '');
            }}
            className="flex items-center gap-1 px-2 py-1 rounded border border-[var(--c-border)] text-[var(--c-fg-3)] hover:text-[var(--c-fg)] text-xs"
            title="フィルタをクリア"
            aria-label="フィルタをクリア"
          >
            <FilterXIcon size={12} aria-hidden="true" />
          </button>
        )}

        <div className="flex-1" />
        <span className="text-xs text-[var(--c-fg-3)]">{totalTasks}件</span>

        {/* ソート（表示順の設定として右側に配置） */}
        <Select
          value={sort.field === 'position' ? 'position' : `${sort.field}:${sort.dir}`}
          options={[
            { value: 'position',     label: '並び順: 手動' },
            { value: 'due:asc',      label: '期限日 ↑' },
            { value: 'due:desc',     label: '期限日 ↓' },
            { value: 'title:asc',    label: 'タイトル ↑' },
            { value: 'title:desc',   label: 'タイトル ↓' },
            { value: 'created:asc',  label: '作成日 ↑' },
            { value: 'created:desc', label: '作成日 ↓' },
            { value: 'updated:asc',  label: '更新日 ↑' },
            { value: 'updated:desc', label: '更新日 ↓' },
          ]}
          onChange={(v) => {
            const next = v === 'position'
              ? { field: 'position', dir: 'asc' as const }
              : { field: v.split(':')[0], dir: v.split(':')[1] as 'asc' | 'desc' };
            setSort(next);
            lsSet(LS_SORT, JSON.stringify(next));
          }}
          icon={<ArrowUpDownIcon size={12} aria-hidden="true" />}
          className="toolbar-select toolbar-select--wide"
        />

        {/* アクション */}
        <button onClick={() => setShowTemplateMgr(true)} aria-label="テンプレート管理"
          className="p-1.5 rounded border border-[var(--c-border)] text-[var(--c-fg-3)] hover:text-[var(--c-fg)]" title="テンプレート管理">
          <FileEditIcon size={14} aria-hidden="true" />
        </button>
        <button onClick={() => setShowLabelMgr(true)} aria-label="ラベル管理"
          className="p-1.5 rounded border border-[var(--c-border)] text-[var(--c-fg-3)] hover:text-[var(--c-fg)]" title="ラベル管理">
          <TagIcon size={14} aria-hidden="true" />
        </button>
        <button onClick={() => setShowArchive(true)} aria-label="アーカイブ一覧"
          className="p-1.5 rounded border border-[var(--c-border)] text-[var(--c-fg-3)] hover:text-[var(--c-fg)]" title="アーカイブ">
          <ArchiveIcon size={14} aria-hidden="true" />
        </button>
        <button onClick={exportData} aria-label="エクスポート"
          className="p-1.5 rounded border border-[var(--c-border)] text-[var(--c-fg-3)] hover:text-[var(--c-fg)]" title="エクスポート">
          <DownloadIcon size={14} aria-hidden="true" />
        </button>
        <button onClick={() => importFileRef.current?.click()} aria-label="インポート"
          className="p-1.5 rounded border border-[var(--c-border)] text-[var(--c-fg-3)] hover:text-[var(--c-fg)]" title="インポート">
          <UploadIcon size={14} aria-hidden="true" />
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
          collisionDetection={rectIntersection}
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
                labels={labels}
                taskLabels={taskLabels}
                dependencies={dependencies}
                isDragOver={dragOverColumnKey === col.key}
                templates={templates}
                onCardClick={openTask}
                onAddCard={addTask}
                onAddFromTemplate={addTaskFromTemplate}
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
          onColumnChange={handleModalColumnChange}
          onDepsMutated={handleDepsMutated}
          onLabelsChanged={load}
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
          labels={labels}
          onClose={() => setShowArchive(false)}
          onRestored={load}
        />
      )}

      {/* TemplateManagerModal */}
      {showTemplateMgr && (
        <TemplateManagerModal
          labels={labels}
          onClose={() => setShowTemplateMgr(false)}
          onChanged={load}
        />
      )}

      {/* インポート用ファイル入力（非表示） */}
      <input
        ref={importFileRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleImportFile}
      />

    </div>
  );
}
