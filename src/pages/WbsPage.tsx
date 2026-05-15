// ==================================================
// WbsPage — WBS ガントチャート（React 移行版）
// ==================================================

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  PlusIcon, IndentIcon, OutdentIcon, CalendarIcon, CalendarDaysIcon,
  DownloadIcon, UploadIcon, XIcon,
} from 'lucide-react';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useToast } from '../components/Toast';
import { DatePicker } from '../components/DatePicker';
import { Tooltip } from '../components/Tooltip';
import { useIsActiveTab } from '../contexts/TabContext';
import { wbsDB, type WbsTask, type WbsStatus } from '../db/wbs_db';
import { ActivityLogger } from '../core/activity_logger';
import { useTabStore } from '../stores/tab_store';
import { searchRegistry } from '../stores/search_store';
import { ShortcutHelp } from '../components/ShortcutHelp';

const WBS_SHORTCUTS = [{
  name: 'ショートカット',
  shortcuts: [
    { keys: ['N'],          description: '新規タスク追加' },
    { keys: ['Tab'],        description: 'インデント（右）' },
    { keys: ['Shift', 'Tab'], description: 'インデント（左）' },
    { keys: ['Delete'],     description: '選択タスクを削除' },
    { keys: ['Ctrl', '↑'], description: 'タスクを上に移動' },
    { keys: ['Ctrl', '↓'], description: 'タスクを下に移動' },
    { keys: ['Ctrl', 'D'], description: '選択タスクを複製' },
  ],
}];

// ── ストレージキー ────────────────────────────────
const KEY_HOLIDAYS        = 'wbs_custom_holidays';
const KEY_COLLAPSED       = 'wbs_collapsed';
const KEY_COLLAPSED_MONTHS = 'wbs_gantt_collapsed_months';
const KEY_GANTT_SCROLL_X  = 'wbs_gantt_scroll_x';

// ── 定数 ─────────────────────────────────────────
const DAY_PX = 22;
const COLLAPSED_MONTH_W = 22;
const MAX_LEVEL = 4;

interface CustomHoliday { date: string; name: string; }

const STATUS_CONFIG: Record<WbsStatus, { label: string; cls: string }> = {
  not_started: { label: '未着手', cls: 'bg-[var(--c-text-3)]/20 text-[var(--c-text-2)]' },
  in_progress:  { label: '進行中', cls: 'bg-blue-500/20 text-blue-400' },
  done:         { label: '完了',   cls: 'bg-green-500/20 text-green-400' },
  on_hold:      { label: '保留',   cls: 'bg-yellow-500/20 text-yellow-500' },
};

// ── 日付ユーティリティ ────────────────────────────
function parseDate(str: string): Date | null {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function shortDate(str: string): string {
  if (!str) return '';
  const [y, m, d] = str.split('-').map(Number);
  return `${y}/${m}/${d}`;
}

// ── 日本の祝日 ────────────────────────────────────
const _holidayCache: Record<number, Set<string>> = {};
function getJapaneseHolidays(year: number): Set<string> {
  if (_holidayCache[year]) return _holidayCache[year];
  const add = (m: number, d: number) => `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const fixed = new Set([
    add(1,1), add(2,11), add(2,23), add(4,29),
    add(5,3), add(5,4), add(5,5), add(8,11),
    add(11,3), add(11,23),
  ]);
  const shunbun = Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  fixed.add(add(3, shunbun));
  const shubun = Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  fixed.add(add(9, shubun));
  const nthMonday = (month: number, n: number) => {
    const first = new Date(year, month - 1, 1);
    const dow = first.getDay();
    const firstMon = dow === 1 ? 1 : (8 - dow) % 7 + 1;
    return firstMon + (n - 1) * 7;
  };
  fixed.add(add(1, nthMonday(1, 2)));
  fixed.add(add(7, nthMonday(7, 3)));
  fixed.add(add(9, nthMonday(9, 3)));
  fixed.add(add(10, nthMonday(10, 2)));
  const result = new Set(fixed);
  fixed.forEach(dateStr => {
    const d = new Date(dateStr);
    if (d.getDay() === 0) {
      const sub = new Date(d);
      sub.setDate(sub.getDate() + 1);
      while (result.has(formatDate(sub))) sub.setDate(sub.getDate() + 1);
      result.add(formatDate(sub));
    }
  });
  const keiro = add(9, nthMonday(9, 3));
  const shubunDate = add(9, shubun);
  const kd = parseDate(keiro), sd = parseDate(shubunDate);
  if (sd && kd && sd.getTime() - kd.getTime() === 2 * 86400000) {
    const mid = new Date(kd);
    mid.setDate(mid.getDate() + 1);
    if (mid.getDay() !== 0 && mid.getDay() !== 6) result.add(formatDate(mid));
  }
  _holidayCache[year] = result;
  return result;
}

function isNonWorkingDay(date: Date, customSet: Set<string>): boolean {
  const dow = date.getDay();
  if (dow === 0 || dow === 6) return true;
  const str = formatDate(date);
  if (getJapaneseHolidays(date.getFullYear()).has(str)) return true;
  if (customSet.has(str)) return true;
  return false;
}

function addBusinessDays(startStr: string, days: number, customSet: Set<string>): string {
  if (!startStr || !days || days <= 0) return '';
  const start = parseDate(startStr);
  if (!start) return '';
  while (isNonWorkingDay(start, customSet)) start.setDate(start.getDate() + 1);
  let count = 1;
  const cur = new Date(start);
  while (count < days) {
    cur.setDate(cur.getDate() + 1);
    if (!isNonWorkingDay(cur, customSet)) count++;
  }
  return formatDate(cur);
}

function countBusinessDays(startStr: string, endStr: string, customSet: Set<string>): number {
  if (!startStr || !endStr) return 0;
  const start = parseDate(startStr);
  const end = parseDate(endStr);
  if (!start || !end || start > end) return 0;
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    if (!isNonWorkingDay(cur, customSet)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// ── 親子集計 ─────────────────────────────────────
function buildChildrenMap(tasks: WbsTask[]): Map<number, number[]> {
  const children = new Map<number, number[]>();
  const levelStack: (number | undefined)[] = [];
  for (const task of tasks) {
    if (task.id === undefined) continue;
    levelStack.length = task.level + 1;
    levelStack[task.level] = task.id;
    if (task.level > 0 && levelStack[task.level - 1] !== undefined) {
      const parentId = levelStack[task.level - 1]!;
      if (!children.has(parentId)) children.set(parentId, []);
      children.get(parentId)!.push(task.id);
    }
  }
  return children;
}

interface AggValues {
  plan_start: string; plan_days: number; plan_end: string;
  actual_start: string; actual_end: string; _isOngoing: boolean;
  progress: number; status: WbsStatus;
}

function calcAggregatedValues(
  task: WbsTask,
  taskMap: Map<number, WbsTask>,
  childrenMap: Map<number, number[]>,
  customSet: Set<string>,
): AggValues | null {
  if (task.id === undefined) return null;
  const childIds = childrenMap.get(task.id);
  if (!childIds || childIds.length === 0) return null;
  const childEffective: AggValues[] = childIds.map(id => {
    const child = taskMap.get(id);
    if (!child) return null;
    const agg = calcAggregatedValues(child, taskMap, childrenMap, customSet);
    if (agg) return agg;
    const isOngoing = !!child.actual_start && !child.actual_end;
    const planEnd = addBusinessDays(child.plan_start, child.plan_days, customSet);
    return {
      plan_start:   child.plan_start,
      plan_days:    child.plan_days || 0,
      plan_end:     planEnd,
      actual_start: child.actual_start,
      actual_end:   child.actual_end || '',
      _isOngoing:   isOngoing,
      progress:     child.progress || 0,
      status:       child.status || 'not_started',
    };
  }).filter(Boolean) as AggValues[];

  if (!childEffective.length) return null;
  const planStarts   = childEffective.map(v => v.plan_start).filter(Boolean);
  const planEnds     = childEffective.map(v => v.plan_end).filter(Boolean);
  const actualStarts = childEffective.map(v => v.actual_start).filter(Boolean);
  const actualEnds   = childEffective.map(v => v.actual_end).filter(Boolean);
  const actual_start = actualStarts.length ? actualStarts.reduce((a, b) => a < b ? a : b) : '';

  // 実績終了: 一件でも actual_end 未入力の子がある場合は空白
  const actual_end = childEffective.some(v => !v.actual_end)
    ? ''
    : actualEnds.reduce((a, b) => a > b ? a : b, '');

  // 予定工数・予定終了: 全子タスクに plan_start と plan_days が揃っている場合のみ集計
  const allHavePlan = childEffective.every(v => v.plan_start && v.plan_days);
  const plan_start  = allHavePlan && planStarts.length ? planStarts.reduce((a, b) => a < b ? a : b) : '';
  const plan_end    = allHavePlan && planEnds.length   ? planEnds.reduce((a, b) => a > b ? a : b)   : '';
  const plan_days = plan_start && plan_end ? countBusinessDays(plan_start, plan_end, customSet) : 0;
  let totalWeight = 0, weightedProgress = 0;
  for (const v of childEffective) {
    const w = Math.max(1, v.plan_days || 1);
    weightedProgress += (v.progress || 0) * w;
    totalWeight += w;
  }
  const progress = totalWeight > 0 ? Math.round(weightedProgress / totalWeight) : 0;
  const _isOngoing = childEffective.some(v => v._isOngoing);
  const statuses = childEffective.map(v => v.status || 'not_started');
  let status: WbsStatus;
  if (statuses.every(s => s === 'done')) status = 'done';
  else if (statuses.some(s => s === 'in_progress')) status = 'in_progress';
  else if (statuses.some(s => s === 'on_hold')) status = 'on_hold';
  else status = 'not_started';
  return { plan_start, plan_days, plan_end, actual_start, actual_end, _isOngoing, progress, status };
}

// ── ガントレイアウト ──────────────────────────────
interface MonthLayout {
  key: string; label: string;
  startX: number; width: number;
  dayCount: number; collapsed: boolean;
  firstDay: Date; lastDay: Date;
}

interface GanttLayout {
  months: MonthLayout[];
  totalWidth: number;
  dateToLeftX(date: Date): number;
  dateToRightX(date: Date): number;
  todayLineX(): number;
}

function calcDisplayPeriod(tasks: WbsTask[], customSet: Set<string>): { start: Date; end: Date } {
  let minDate: Date | null = null;
  let maxDate: Date | null = null;
  for (const t of tasks) {
    const planEnd = addBusinessDays(t.plan_start, t.plan_days, customSet);
    const dates = [t.plan_start, planEnd, t.actual_start, t.actual_end]
      .filter(Boolean).map(s => parseDate(s)).filter(Boolean) as Date[];
    for (const d of dates) {
      if (!minDate || d < minDate) minDate = new Date(d);
      if (!maxDate || d > maxDate) maxDate = new Date(d);
    }
  }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (!minDate) {
    minDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    maxDate = new Date(today.getFullYear(), today.getMonth() + 3, 0);
  } else {
    minDate = new Date(minDate); minDate.setDate(minDate.getDate() - 14);
    maxDate = new Date(maxDate!); maxDate.setDate(maxDate.getDate() + 21);
  }
  if (today < minDate) minDate = new Date(today.getFullYear(), today.getMonth(), 1);
  if (today > maxDate!) maxDate = new Date(today);
  const start = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  const end = new Date(maxDate!.getFullYear(), maxDate!.getMonth() + 1, 0);
  return { start, end };
}

function buildGanttLayout(period: { start: Date; end: Date }, collapsedMonths: Set<string>): GanttLayout {
  const months: MonthLayout[] = [];
  let x = 0;
  let cur = new Date(period.start);
  while (cur <= period.end) {
    const y = cur.getFullYear(); const m = cur.getMonth();
    const key = `${y}-${String(m + 1).padStart(2, '0')}`;
    const monthEnd = new Date(y, m + 1, 0);
    const end = monthEnd > period.end ? period.end : monthEnd;
    const dayCount = Math.round((end.getTime() - cur.getTime()) / 86400000) + 1;
    const collapsed = collapsedMonths.has(key);
    const width = collapsed ? COLLAPSED_MONTH_W : dayCount * DAY_PX;
    months.push({ key, label: `${y}/${String(m + 1).padStart(2, '0')}`, startX: x, width, dayCount, collapsed, firstDay: new Date(cur), lastDay: new Date(end) });
    x += width;
    cur = new Date(y, m + 1, 1);
  }
  function _findMonth(date: Date) {
    const d = new Date(date); d.setHours(0, 0, 0, 0);
    for (const ml of months) {
      if (d >= ml.firstDay && d <= ml.lastDay) return { ml, d };
    }
    return null;
  }
  return {
    months, totalWidth: x,
    dateToLeftX(date: Date) {
      const found = _findMonth(date);
      if (!found) return -1;
      const { ml, d } = found;
      if (ml.collapsed) return ml.startX;
      const off = Math.round((d.getTime() - ml.firstDay.getTime()) / 86400000);
      return ml.startX + off * DAY_PX;
    },
    dateToRightX(date: Date) {
      const found = _findMonth(date);
      if (!found) return -1;
      const { ml, d } = found;
      if (ml.collapsed) return ml.startX + ml.width;
      const off = Math.round((d.getTime() - ml.firstDay.getTime()) / 86400000);
      return ml.startX + (off + 1) * DAY_PX;
    },
    todayLineX() {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      if (today < period.start || today > period.end) return -1;
      const found = _findMonth(today);
      if (!found) return -1;
      const { ml, d } = found;
      if (ml.collapsed) return ml.startX + ml.width / 2;
      const off = Math.round((d.getTime() - ml.firstDay.getTime()) / 86400000);
      return ml.startX + off * DAY_PX + DAY_PX / 2;
    },
  };
}

// ── DnD ソータブル行 ──────────────────────────────
function SortableRow({ task, children }: { task: WbsTask; children: (attrs: Record<string, unknown>) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id! });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  return (
    <div ref={setNodeRef} style={style}>
      {children({ ...attributes, ...listeners })}
    </div>
  );
}

// ── メインコンポーネント ──────────────────────────
export function WbsPage() {
  const { success: showSuccess, error: showError } = useToast();
  const isActive = useIsActiveTab();

  const [tasks, setTasks] = useState<WbsTask[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<Set<number>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(KEY_COLLAPSED) || '[]')); } catch { return new Set(); }
  });
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(KEY_COLLAPSED_MONTHS) || '[]')); } catch { return new Set(); }
  });
  const [customHolidays, setCustomHolidays] = useState<CustomHoliday[]>(() => {
    try { return JSON.parse(localStorage.getItem(KEY_HOLIDAYS) || '[]'); } catch { return []; }
  });
  const [editingCell, setEditingCell] = useState<{ taskId: number; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [hdayDate, setHdayDate] = useState('');
  const [hdayName, setHdayName] = useState('');
  const [statusPickerTaskId, setStatusPickerTaskId] = useState<number | null>(null);
  const pendingNewIds = useRef<Set<number>>(new Set());

  // ガント横スクロール同期
  const tBodyRef = useRef<HTMLDivElement>(null);
  const gBodyRef = useRef<HTMLDivElement>(null);
  const gHeaderRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);

  const customSet = useMemo(() => new Set(customHolidays.map(h => h.date)), [customHolidays]);

  // ── 派生状態 ─────────────────────────────────────
  const { childrenMap, aggValues, visibleTasks } = useMemo(() => {
    const childrenMap = buildChildrenMap(tasks);
    const taskMap = new Map(tasks.map(t => [t.id!, t]));
    const aggValues = new Map<number, AggValues | null>();
    for (const t of tasks) {
      if (t.id !== undefined) aggValues.set(t.id, calcAggregatedValues(t, taskMap, childrenMap, customSet));
    }
    const hiddenIds = new Set<number>();
    const markHidden = (id: number) => {
      for (const kidId of (childrenMap.get(id) || [])) {
        hiddenIds.add(kidId);
        markHidden(kidId);
      }
    };
    for (const id of collapsed) markHidden(id);
    const visibleTasks = tasks.filter(t => !hiddenIds.has(t.id!));
    return { childrenMap, aggValues, visibleTasks };
  }, [tasks, collapsed, customSet]);

  // ガントレイアウト
  const ganttPeriod = useMemo(() => calcDisplayPeriod(tasks, customSet), [tasks, customSet]);
  const ganttLayout = useMemo(() => buildGanttLayout(ganttPeriod, collapsedMonths), [ganttPeriod, collapsedMonths]);

  // ── データ読み込み ────────────────────────────────
  const loadTasks = useCallback(async () => {
    const t = await wbsDB.getAllTasks();
    setTasks(t);
  }, []);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  // ── グローバル検索登録 ────────────────────────────
  const { config: tabConfig, setActiveTab: setGlobalTab } = useTabStore();
  useEffect(() => {
    const label = tabConfig.find(t => t.pageSrc === 'pages/wbs.html')?.label;
    searchRegistry.register('wbs', async (query) => {
      const q = query.toLowerCase();
      const all = await wbsDB.getAllTasks();
      return all
        .filter(t => t.title.toLowerCase().includes(q))
        .slice(0, 10)
        .map(t => ({
          id: `wbs-${t.id}`,
          pageSrc: 'pages/wbs.html',
          title: t.title,
          excerpt: t.memo || '',
          onSelect: () => { if (label) setGlobalTab(label); setSelectedId(t.id!); },
        }));
    });
    return () => searchRegistry.unregister('wbs');
  }, [tabConfig, setGlobalTab]);

  // ── スクロール同期 ────────────────────────────────
  useEffect(() => {
    const tBody = tBodyRef.current;
    const gBody = gBodyRef.current;
    const gHeader = gHeaderRef.current;
    if (!tBody || !gBody) return;

    const onTableScroll = () => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      gBody.scrollTop = tBody.scrollTop;
      syncingRef.current = false;
    };
    const onGanttScroll = () => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      tBody.scrollTop = gBody.scrollTop;
      if (gHeader) gHeader.scrollLeft = gBody.scrollLeft;
      localStorage.setItem(KEY_GANTT_SCROLL_X, String(Math.round(gBody.scrollLeft)));
      syncingRef.current = false;
    };
    tBody.addEventListener('scroll', onTableScroll);
    gBody.addEventListener('scroll', onGanttScroll);
    return () => {
      tBody.removeEventListener('scroll', onTableScroll);
      gBody.removeEventListener('scroll', onGanttScroll);
    };
  }, []);

  // 初回スクロール復元
  useEffect(() => {
    if (!gBodyRef.current) return;
    const saved = localStorage.getItem(KEY_GANTT_SCROLL_X);
    if (saved !== null) {
      gBodyRef.current.scrollLeft = Number(saved);
    } else {
      // 今日にスクロール
      requestAnimationFrame(() => {
        const todayX = ganttLayout.todayLineX();
        if (gBodyRef.current && todayX >= 0) {
          gBodyRef.current.scrollLeft = Math.max(0, todayX - gBodyRef.current.clientWidth / 2);
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks.length === 0 ? 0 : 1]);

  // ── DnD ──────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const getDescendantsEnd = useCallback((idx: number, arr: WbsTask[]) => {
    const parentLevel = arr[idx].level;
    let end = idx;
    while (end + 1 < arr.length && arr[end + 1].level > parentLevel) end++;
    return end;
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = tasks.findIndex(t => t.id === active.id);
    const newIdx = tasks.findIndex(t => t.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;

    const newTasks = [...tasks];
    const groupEnd = getDescendantsEnd(oldIdx, newTasks);
    const groupSize = groupEnd - oldIdx + 1;
    const group = newTasks.splice(oldIdx, groupSize);

    // 挿入位置調整
    const insertAt = newIdx > oldIdx ? newIdx - groupSize + 1 : newIdx;
    newTasks.splice(insertAt, 0, ...group);
    newTasks.forEach((t, i) => { t.position = i; });
    setTasks(newTasks);
    await wbsDB.bulkUpdate(newTasks);
  }, [tasks, getDescendantsEnd]);

  // ── タスク操作 ────────────────────────────────────
  const addTask = useCallback(async () => {
    const position = tasks.length ? tasks[tasks.length - 1].position + 1 : 0;
    const selectedTask = tasks.find(t => t.id === selectedId);
    const level = selectedTask ? selectedTask.level : 0;
    const id = await wbsDB.addTask({
      title: 'タスク名', level, position,
      plan_start: '', plan_days: 0,
      actual_start: '', actual_end: '',
      progress: 0, status: 'not_started', memo: '',
    });
    pendingNewIds.current.add(id);
    await loadTasks();
    setSelectedId(id);
    // 追加後、タイトルセルを自動編集
    setTimeout(() => {
      setEditingCell({ taskId: id, field: 'title' });
      setEditValue('タスク名');
    }, 50);
  }, [tasks, selectedId, loadTasks]);

  const deleteTask = useCallback(async (id: number) => {
    const task = tasks.find(t => t.id === id);
    if (!confirm('このタスクを削除しますか？')) return;
    pendingNewIds.current.delete(id);
    if (task) ActivityLogger.log('wbs', 'delete', 'task', id, `WBSタスク「${task.title}」を削除`);
    await wbsDB.deleteTask(id);
    if (selectedId === id) setSelectedId(null);
    setCollapsed(prev => { const next = new Set(prev); next.delete(id); return next; });
    await loadTasks();
    showSuccess('タスクを削除しました');
  }, [tasks, selectedId, loadTasks, showSuccess]);

  const indentTask = useCallback(async (dir: 1 | -1) => {
    if (!selectedId) return;
    const task = tasks.find(t => t.id === selectedId);
    if (!task) return;
    const newLevel = Math.min(MAX_LEVEL, Math.max(0, task.level + dir));
    if (newLevel === task.level) return;
    await wbsDB.updateTask({ ...task, level: newLevel });
    await loadTasks();
  }, [selectedId, tasks, loadTasks]);

  const duplicateTask = useCallback(async (id: number) => {
    const src = tasks.find(t => t.id === id);
    if (!src) return;
    const newId = await wbsDB.addTask({
      title: src.title + '（コピー）', level: src.level, position: src.position + 1,
      plan_start: src.plan_start, plan_days: src.plan_days,
      actual_start: '', actual_end: '',
      progress: 0, status: 'not_started', memo: src.memo,
    });
    await loadTasks();
    setSelectedId(newId);
    showSuccess('タスクを複製しました');
  }, [tasks, loadTasks, showSuccess]);

  const moveTask = useCallback(async (dir: 1 | -1) => {
    if (!selectedId) return;
    const idx = tasks.findIndex(t => t.id === selectedId);
    if (idx < 0) return;
    const newTasks = [...tasks];
    const groupEnd = getDescendantsEnd(idx, newTasks);
    const groupSize = groupEnd - idx + 1;
    if (dir < 0) {
      if (idx === 0) return;
      const group = newTasks.splice(idx, groupSize);
      newTasks.splice(idx - 1, 0, ...group);
    } else {
      if (groupEnd + 1 >= newTasks.length) return;
      const nextGroupEnd = getDescendantsEnd(groupEnd + 1, newTasks);
      const group = newTasks.splice(idx, groupSize);
      newTasks.splice(idx + nextGroupEnd - groupEnd, 0, ...group);
    }
    newTasks.forEach((t, i) => { t.position = i; });
    setTasks(newTasks);
    await wbsDB.bulkUpdate(newTasks);
  }, [selectedId, tasks, getDescendantsEnd]);

  // ── 折りたたみ ────────────────────────────────────
  const toggleCollapse = useCallback((id: number) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      localStorage.setItem(KEY_COLLAPSED, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const toggleCollapseMonth = useCallback((key: string) => {
    setCollapsedMonths(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      localStorage.setItem(KEY_COLLAPSED_MONTHS, JSON.stringify([...next]));
      return next;
    });
  }, []);

  // ── インライン編集 ────────────────────────────────
  const startEditing = useCallback((taskId: number, field: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const val = (task as unknown as Record<string, unknown>)[field];
    setEditingCell({ taskId, field });
    setEditValue(val != null ? String(val) : '');
  }, [tasks]);

  const commitEdit = useCallback(async () => {
    if (!editingCell) return;
    const { taskId, field } = editingCell;
    const task = tasks.find(t => t.id === taskId);
    if (!task) { setEditingCell(null); return; }
    let newVal: string | number = editValue;
    if (field === 'title') newVal = editValue.trim() || 'タスク名';
    else if (field === 'plan_days') newVal = Math.max(0, parseInt(editValue || '0', 10)) || 0;
    else if (field === 'progress') newVal = Math.min(100, Math.max(0, parseInt(editValue || '0', 10))) || 0;
    const updated = { ...task, [field]: newVal };
    await wbsDB.updateTask(updated);
    if (field === 'title' && pendingNewIds.current.has(taskId)) {
      pendingNewIds.current.delete(taskId);
      ActivityLogger.log('wbs', 'create', 'task', taskId, `WBSタスク「${newVal}」を追加`);
      showSuccess(`「${newVal}」を追加しました`);
    }
    setEditingCell(null);
    await loadTasks();
  }, [editingCell, editValue, tasks, loadTasks, showSuccess]);

  const handleDateChange = useCallback(async (taskId: number, field: string, value: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    await wbsDB.updateTask({ ...task, [field]: value });
    await loadTasks();
  }, [tasks, loadTasks]);

  const handleStatusChange = useCallback(async (taskId: number, status: WbsStatus) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const oldStatus = task.status;
    await wbsDB.updateTask({ ...task, status });
    if (status === 'done') ActivityLogger.log('wbs', 'complete', 'task', taskId, `WBSタスク「${task.title}」を完了`);
    else if (oldStatus === 'done') ActivityLogger.log('wbs', 'update', 'task', taskId, `WBSタスク「${task.title}」を${STATUS_CONFIG[status].label}に変更`);
    await loadTasks();
  }, [tasks, loadTasks]);

  // ── エクスポート / インポート ─────────────────────
  const exportData = useCallback(async () => {
    const json = await wbsDB.exportAll();
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = `wbs_export_${ts}.json`;
    a.click();
    showSuccess('エクスポートしました');
  }, [showSuccess]);

  const importData = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      await wbsDB.importAll(text);
      await loadTasks();
      setSelectedId(null);
      showSuccess('インポートしました');
    } catch (err) {
      showError('インポートに失敗しました: ' + (err as Error).message);
    }
    e.target.value = '';
  }, [loadTasks, showSuccess, showError]);

  // ── カスタム祝日 ──────────────────────────────────
  const saveHolidays = useCallback((list: CustomHoliday[]) => {
    localStorage.setItem(KEY_HOLIDAYS, JSON.stringify(list));
    setCustomHolidays(list);
  }, []);

  const addHoliday = useCallback(() => {
    if (!hdayDate) { showError('日付を入力してください'); return; }
    if (customHolidays.some(h => h.date === hdayDate)) { showError('既に登録されています'); return; }
    saveHolidays([...customHolidays, { date: hdayDate, name: hdayName || '休業日' }]);
    setHdayDate(''); setHdayName('');
  }, [hdayDate, hdayName, customHolidays, saveHolidays, showError]);

  const removeHoliday = useCallback((date: string) => {
    saveHolidays(customHolidays.filter(h => h.date !== date));
  }, [customHolidays, saveHolidays]);

  // ステータスピッカーの外部クリックで閉じる
  useEffect(() => {
    if (!statusPickerTaskId) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('[data-status-picker]')) setStatusPickerTaskId(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [statusPickerTaskId]);

  // ── キーボードショートカット ──────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isActive) return;
      // DatePicker が開いているときは WBS ショートカットを無効化
      if (document.querySelector('[role="dialog"][aria-label="日付を選択"]')) return;
      const tag = (e.target as HTMLElement).tagName;
      const isInput = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
      if (e.key === 'Escape' && isInput) { (e.target as HTMLElement).blur(); return; }
      if (isInput) return;
      if (e.key === 'Tab') { e.preventDefault(); indentTask(e.shiftKey ? -1 : 1); }
      if (e.key === 'Delete' || e.key === 'Backspace') { if (selectedId) deleteTask(selectedId); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowUp') { e.preventDefault(); moveTask(-1); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowDown') { e.preventDefault(); moveTask(1); }
      if (e.key === 'n' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); addTask(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') { e.preventDefault(); if (selectedId) duplicateTask(selectedId); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedId, addTask, deleteTask, indentTask, duplicateTask, moveTask]);

  // ── セルレンダリングヘルパー ──────────────────────
  const todayStr = formatDate(new Date());

  const renderCell = (task: WbsTask, field: string, agg: AggValues | null, displayValue: string) => {
    if (agg) {
      return <div className="px-2 py-1 text-[var(--c-text-3)] text-xs select-none cursor-default">{displayValue}</div>;
    }
    const isEditing = editingCell?.taskId === task.id && editingCell?.field === field;
    if (isEditing) {
      const isNum = field === 'plan_days' || field === 'progress';
      return (
        <input
          autoFocus
          type={isNum ? 'number' : 'text'}
          min={isNum ? 0 : undefined}
          max={field === 'progress' ? 100 : undefined}
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onFocus={e => isNum && (e.target as HTMLInputElement).select()}
          onBlur={commitEdit}
          onKeyDown={e => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
            if (e.key === 'Escape') { setEditingCell(null); loadTasks(); }
          }}
          className={`w-full px-1 py-0.5 text-xs border border-[var(--c-accent)] bg-[var(--c-bg)] text-[var(--c-text)] rounded outline-none${isNum ? ' [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none' : ''}`}
        />
      );
    }
    return (
      <div
        className="px-2 py-1 text-xs cursor-text hover:bg-[var(--c-accent)]/10 rounded min-h-[24px]"
        onClick={() => startEditing(task.id!, field)}
      >
        {displayValue}
      </div>
    );
  };

  const renderDateCell = (task: WbsTask, field: 'plan_start' | 'actual_start' | 'actual_end', agg: AggValues | null, value: string) => {
    if (agg) return <div className="px-[5px] py-[2px] text-[var(--c-text-3)] text-[11px] select-none tabular-nums text-center w-full cursor-default">{shortDate(value)}</div>;
    return (
      <DatePicker
        compact
        value={value || ''}
        placeholder=""
        onChange={v => handleDateChange(task.id!, field, v)}
        onClear={() => handleDateChange(task.id!, field, '')}
        className="w-full"
      />
    );
  };

  const renderStatusCell = (task: WbsTask, aggStatus: WbsStatus, agg: AggValues | null) => {
    const sc = STATUS_CONFIG[aggStatus];
    if (agg) return <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold block w-full text-center cursor-default ${sc.cls}`}>{sc.label}</span>;
    const isOpen = statusPickerTaskId === task.id;
    return (
      <div className="relative w-full" data-status-picker onClick={e => e.stopPropagation()}>
        <button
          className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold w-full text-center cursor-pointer ${sc.cls} hover:opacity-80`}
          onClick={() => setStatusPickerTaskId(isOpen ? null : task.id!)}
        >
          {sc.label}
        </button>
        {isOpen && (
          <div className="absolute left-0 top-full mt-0.5 z-30 bg-[var(--c-bg)] border border-[var(--c-border)] rounded-lg shadow-lg py-1 min-w-[76px]">
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <button
                key={k}
                className={`flex items-center w-full px-2 py-1 text-left hover:bg-[var(--c-bg-2)] ${k === aggStatus ? 'font-bold' : ''}`}
                onClick={() => { handleStatusChange(task.id!, k as WbsStatus); setStatusPickerTaskId(null); }}
              >
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${v.cls}`}>{v.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ── ガントバー ────────────────────────────────────
  const buildNonWorkOverlays = (barStart: Date, barEnd: Date, barLeft: number) => {
    const overlays: React.ReactNode[] = [];
    const cur = new Date(barStart); cur.setHours(0, 0, 0, 0);
    while (cur <= barEnd) {
      const dayLeft = ganttLayout.dateToLeftX(cur);
      const dayRight = ganttLayout.dateToRightX(cur);
      if (dayRight - dayLeft === DAY_PX && isNonWorkingDay(cur, customSet)) {
        overlays.push(
          <div key={formatDate(cur)} className="absolute top-0 bottom-0 bg-black/20" style={{ left: dayLeft - barLeft, width: DAY_PX }} />
        );
      }
      cur.setDate(cur.getDate() + 1);
    }
    return overlays;
  };

  const buildBar = (startStr: string, endStr: string, topPx: number, background: string, tooltip: string) => {
    if (!startStr || !endStr) return null;
    const start = parseDate(startStr); const end = parseDate(endStr);
    if (!start || !end || start > ganttPeriod.end || end < ganttPeriod.start) return null;
    const s = start < ganttPeriod.start ? ganttPeriod.start : start;
    const e = end > ganttPeriod.end ? ganttPeriod.end : end;
    const left = ganttLayout.dateToLeftX(s);
    const right = ganttLayout.dateToRightX(e);
    if (left < 0 || right < 0 || right <= left) return null;
    const width = right - left;
    return (
      <Tooltip content={tooltip}>
        <div
          className="absolute rounded-sm overflow-hidden cursor-default hover:opacity-85 transition-opacity pointer-events-auto"
          style={{ top: topPx, height: 11, left, width, background }}
        >
          {buildNonWorkOverlays(s, e, left)}
        </div>
      </Tooltip>
    );
  };

  // ── レンダリング ──────────────────────────────────
  const todayLineX = ganttLayout.todayLineX();

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ツールバー */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[var(--c-border)] shrink-0">
        <button
          onClick={addTask}
          className="btn btn--primary btn--sm shrink-0"
        >
          <PlusIcon size={13} aria-hidden="true" />タスク追加
        </button>
        <div className="w-px h-5 bg-[var(--c-border)] mx-0.5 shrink-0" />
        <button
          onClick={() => indentTask(1)}
          className="btn btn--icon btn--sm"
          title="インデント (Tab)"
        ><IndentIcon size={14} aria-hidden="true" /></button>
        <button
          onClick={() => indentTask(-1)}
          className="btn btn--icon btn--sm"
          title="アウトデント (Shift+Tab)"
        ><OutdentIcon size={14} aria-hidden="true" /></button>
        <div className="w-px h-5 bg-[var(--c-border)] mx-0.5 shrink-0" />
        <button
          onClick={() => {
            const todayX = ganttLayout.todayLineX();
            if (gBodyRef.current && todayX >= 0) {
              gBodyRef.current.scrollLeft = Math.max(0, todayX - gBodyRef.current.clientWidth / 2);
            }
          }}
          className="btn btn--secondary btn--sm"
        ><CalendarDaysIcon size={13} aria-hidden="true" />今日</button>
        <button
          onClick={() => setShowHolidayModal(true)}
          className="btn btn--secondary btn--sm"
        ><CalendarIcon size={13} aria-hidden="true" />祝日設定</button>
        <div className="ml-auto flex items-center gap-1.5">
          {/* 凡例 */}
          <div className="flex items-center gap-3 text-[10px] text-[var(--c-text-3)] select-none mr-1">
            <div className="flex items-center gap-1">
              <div className="w-5 h-2 rounded-sm shrink-0" style={{ background: 'var(--c-accent)' }} />予定
            </div>
            <div className="flex items-center gap-1">
              <div className="w-5 h-2 rounded-sm shrink-0" style={{ background: 'var(--c-success, #10b981)' }} />実績
            </div>
          </div>
          <div className="w-px h-5 bg-[var(--c-border)] shrink-0" />
          <button
            onClick={exportData}
            className="btn btn--icon btn--sm"
            title="エクスポート"
          ><DownloadIcon size={14} aria-hidden="true" /></button>
          <label
            className="btn btn--icon btn--sm cursor-pointer"
            title="インポート"
          >
            <UploadIcon size={14} aria-hidden="true" />
            <input type="file" accept=".json" className="hidden" onChange={importData} />
          </label>
        </div>
      </div>

      {/* WBS ボディ: テーブル + ガント */}
      <div className="flex flex-1 overflow-hidden">
        {/* テーブル部 */}
        <div className="flex flex-col shrink-0" style={{ width: 760 }}>
          {/* テーブルヘッダー */}
          <div className="flex items-center text-[10px] font-semibold text-[var(--c-text-3)] bg-[var(--c-bg-2)] border-b border-[var(--c-border)] uppercase tracking-wide shrink-0" style={{ height: 52, paddingRight: 8 }}>
            <div className="shrink-0" style={{ width: 20 }} />
            <div className="w-8 shrink-0 px-1">No</div>
            <div className="flex-1 min-w-0 px-2" style={{ minWidth: 140 }}>タスク名</div>
            <div className="shrink-0 px-1" style={{ width: 82 }}>予定開始</div>
            <div className="shrink-0 px-1 text-center" style={{ width: 40 }}>工数</div>
            <div className="shrink-0 px-1" style={{ width: 82 }}>予定終了</div>
            <div className="shrink-0 px-1" style={{ width: 82 }}>実績開始</div>
            <div className="shrink-0 px-1" style={{ width: 82 }}>実績終了</div>
            <div className="shrink-0 px-1 text-center" style={{ width: 40 }}>実績</div>
            <div className="shrink-0 px-1 text-center" style={{ width: 48 }}>進捗</div>
            <div className="w-16 shrink-0 px-1">状態</div>
            <div className="shrink-0" style={{ width: 40 }} />
          </div>
          {/* テーブルボディ */}
          <div ref={tBodyRef} className="flex-1 overflow-auto">
            {tasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-2 text-[var(--c-text-3)]">
                <svg className="w-10 h-10 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                <div className="text-sm">タスクがありません</div>
                <div className="text-xs">「タスク追加」ボタンで追加してください</div>
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={visibleTasks.map(t => t.id!)} strategy={verticalListSortingStrategy}>
                  {visibleTasks.map((task) => {
                    const fullIdx = tasks.indexOf(task);
                    const hasChildren = (childrenMap.get(task.id!) || []).length > 0;
                    const isCollapsed = collapsed.has(task.id!);
                    const agg = aggValues.get(task.id!) ?? null;
                    const planStart   = agg ? agg.plan_start   : task.plan_start;
                    const planEnd     = agg ? agg.plan_end     : addBusinessDays(task.plan_start, task.plan_days, customSet);
                    const planDays    = agg ? agg.plan_days    : (task.plan_days || 0);
                    const actualStart = agg ? agg.actual_start : task.actual_start;
                    const actualEndRaw = agg ? agg.actual_end  : task.actual_end;
                    const isOngoing   = agg ? agg._isOngoing   : (!!task.actual_start && !task.actual_end);
                    const progress    = agg ? agg.progress     : (task.progress || 0);
                    const aggStatus   = agg ? agg.status       : (task.status || 'not_started');
                    const actualEndForCalc = actualEndRaw || (isOngoing ? todayStr : '');
                    const actualDays = actualStart ? countBusinessDays(actualStart, actualEndForCalc, customSet) : 0;
                    const isDone = aggStatus === 'done';
                    const isDelayed = !isDone && planEnd && planEnd < todayStr;
                    const isDueSoon = !isDone && !isDelayed && planEnd && Math.round((parseDate(planEnd)!.getTime() - parseDate(todayStr)!.getTime()) / 86400000) <= 3;
                    const isOverrun = planDays > 0 && actualDays > planDays;
                    const isSelected = task.id === selectedId;
                    const indent = task.level * 16;

                    const levelBorderColors = ['var(--c-accent)', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];
                    const levelBorder = `3px solid ${levelBorderColors[Math.min(task.level, 4)]}`;
                    const titleFontCls = task.level === 0 ? 'font-bold text-[13.5px]' : task.level === 1 ? 'font-semibold' : 'font-medium';

                    // タスク名ホバー tooltip
                    const sc = STATUS_CONFIG[aggStatus];
                    const tooltipLines: string[] = [task.title || '（タスク名未設定）'];
                    tooltipLines.push(`${sc.label}  ${progress}%`);
                    if (planStart) {
                      const planStr = planEnd
                        ? `${shortDate(planStart)} 〜 ${shortDate(planEnd)}（${planDays}日）`
                        : shortDate(planStart);
                      tooltipLines.push(`予定: ${planStr}`);
                    }
                    if (actualStart) {
                      const actualEndLabel = actualEndRaw ? shortDate(actualEndRaw) : '進行中';
                      tooltipLines.push(`実績: ${shortDate(actualStart)} 〜 ${actualEndLabel}`);
                    }
                    if (task.memo) tooltipLines.push(task.memo);
                    if (agg) tooltipLines.push('子タスクから集計');
                    const titleTooltip = tooltipLines.join('\n');

                    return (
                      <SortableRow key={task.id} task={task}>
                        {(dragHandleProps) => (
                          <div
                            className={`flex items-center text-xs border-b border-[var(--c-border)] cursor-pointer transition-colors ${isSelected ? 'bg-[var(--c-accent)]/10' : agg ? 'bg-[var(--c-accent)]/[0.03] hover:bg-[var(--c-accent)]/[0.06]' : 'hover:bg-[var(--c-bg-2)]'} ${isDone ? 'opacity-60' : ''}`}
                            style={{ height: 38, borderLeft: levelBorder }}
                            onClick={() => setSelectedId(task.id!)}
                          >
                            {/* ドラッグハンドル */}
                            <div className="shrink-0 flex items-center justify-center cursor-grab text-[var(--c-text-3)] hover:text-[var(--c-text)]" style={{ width: 20 }} {...dragHandleProps}>
                              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5"><path fill="currentColor" d="M10 13a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm0-4a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm0-4a1 1 0 1 1 0-2 1 1 0 0 1 0 2ZM6 13a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm0-4a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm0-4a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/></svg>
                            </div>
                            {/* No */}
                            <div className="w-8 shrink-0 px-1 text-center text-[var(--c-text-3)]">{fullIdx + 1}</div>
                            {/* タスク名 */}
                            <div className="flex-1 min-w-0 flex items-center gap-1" style={{ minWidth: 140 }}>
                              <span style={{ width: indent }} className="shrink-0" />
                              {hasChildren ? (
                                <button
                                  onClick={e => { e.stopPropagation(); toggleCollapse(task.id!); }}
                                  className="shrink-0 text-[var(--c-text-3)] hover:text-[var(--c-text)] transition-transform"
                                  style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
                                >
                                  <svg viewBox="0 0 16 16" className="w-3.5 h-3.5"><path fill="currentColor" d="M12.78 5.22a.749.749 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.06 0L3.22 6.28a.749.749 0 1 1 1.06-1.06L8 8.94l3.72-3.72a.749.749 0 0 1 1.06 0Z"/></svg>
                                </button>
                              ) : <span className="w-3.5 shrink-0" />}
                              <Tooltip
                                content={editingCell?.taskId !== task.id ? titleTooltip : ''}
                                type={isDelayed ? 'danger' : isDueSoon ? 'warning' : 'default'}
                              >
                              <div
                                className="min-w-0 flex-1 flex items-center gap-1 overflow-hidden"
                                onClick={e => { e.stopPropagation(); startEditing(task.id!, 'title'); }}
                              >
                                {editingCell?.taskId === task.id && editingCell?.field === 'title' ? (
                                  <input
                                    autoFocus
                                    type="text"
                                    value={editValue}
                                    onChange={e => setEditValue(e.target.value)}
                                    onBlur={commitEdit}
                                    onKeyDown={e => {
                                      if (e.nativeEvent.isComposing) return;
                                      if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
                                      if (e.key === 'Escape') { setEditingCell(null); loadTasks(); }
                                    }}
                                    className="w-full px-1 py-0.5 text-xs border border-[var(--c-accent)] bg-[var(--c-bg)] text-[var(--c-text)] rounded outline-none"
                                  />
                                ) : (
                                  <>
                                    <span className={`truncate ${titleFontCls}`}>
                                      {task.title || '（タスク名未設定）'}
                                    </span>
                                    {isDelayed && <span className="shrink-0 text-[9px] bg-red-500/20 text-red-400 px-1 rounded">遅延</span>}
                                    {isDueSoon && <span className="shrink-0 text-[9px] bg-yellow-500/20 text-yellow-400 px-1 rounded">期日近</span>}
                                  </>
                                )}
                              </div>
                              </Tooltip>
                            </div>
                            {/* 予定開始 */}
                            <div className="shrink-0 overflow-hidden" style={{ width: 82 }}>{renderDateCell(task, 'plan_start', agg, planStart)}</div>
                            {/* 計画工数 */}
                            <div className={`shrink-0 text-center${agg ? ' cursor-default' : ''}`} style={{ width: 40 }} onClick={e => { if (!agg) { e.stopPropagation(); startEditing(task.id!, 'plan_days'); } }}>
                              {renderCell(task, 'plan_days', agg, planDays ? String(planDays) : '')}
                            </div>
                            {/* 予定終了（表示のみ、計算値） */}
                            <div
                              className={`shrink-0 px-[5px] py-[2px] text-[11px] tabular-nums text-center cursor-default ${isDelayed ? 'text-red-400' : isDueSoon ? 'text-yellow-400' : 'text-[var(--c-text-2)]'}`}
                              style={{ width: 82 }}
                              title={isDelayed ? '予定終了日を超過しています' : isDueSoon ? '期日まで3日以内です' : undefined}
                            >{shortDate(planEnd)}</div>
                            {/* 実績開始 */}
                            <div className="shrink-0 overflow-hidden" style={{ width: 82 }}>{renderDateCell(task, 'actual_start', agg, actualStart)}</div>
                            {/* 実績終了 */}
                            <div className="shrink-0 overflow-hidden" style={{ width: 82 }}>{renderDateCell(task, 'actual_end', agg, actualEndRaw)}</div>
                            {/* 実績工数 */}
                            <div
                              className={`shrink-0 px-1 py-1 text-xs text-center cursor-default ${isOverrun ? 'text-red-400' : ''} ${isOngoing ? 'text-blue-400' : ''}`}
                              style={{ width: 40 }}
                              title={isOverrun ? `予定(${planDays}日)を超過しています` : isOngoing ? '実績終了未入力のため本日までの工数' : undefined}
                            >{actualDays || ''}</div>
                            {/* 進捗 */}
                            <div className={`shrink-0${agg ? ' cursor-default' : ''}`} style={{ width: 48 }} onClick={e => { if (!agg) { e.stopPropagation(); startEditing(task.id!, 'progress'); } }}>
                              {editingCell?.taskId === task.id && editingCell?.field === 'progress' && !agg ? (
                                <input
                                  autoFocus type="number" min={0} max={100}
                                  value={editValue}
                                  onChange={e => setEditValue(e.target.value)}
                                  onFocus={e => (e.target as HTMLInputElement).select()}
                                  onBlur={commitEdit}
                                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setEditingCell(null); loadTasks(); } }}
                                  className="w-full px-1 py-0.5 text-xs border border-[var(--c-accent)] bg-[var(--c-bg)] text-[var(--c-text)] rounded outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                />
                              ) : (
                                <div className="px-1 py-1">
                                  <div className="h-1.5 bg-[var(--c-border)] rounded-full overflow-hidden">
                                    <div className="h-full bg-[var(--c-accent)] rounded-full transition-all" style={{ width: `${progress}%` }} />
                                  </div>
                                  <div className="text-[9px] text-[var(--c-text-3)] text-center mt-0.5">{progress}%</div>
                                </div>
                              )}
                            </div>
                            {/* 状態 */}
                            <div className="w-16 shrink-0 px-1 flex items-center">
                              {renderStatusCell(task, aggStatus, agg)}
                            </div>
                            {/* 操作 */}
                            <div className="shrink-0 flex items-center justify-center" style={{ width: 40 }}>
                              <button
                                onClick={e => { e.stopPropagation(); deleteTask(task.id!); }}
                                className="text-[var(--c-text-3)] hover:text-red-400 transition-colors"
                                title="削除"
                              >
                                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5"><path fill="currentColor" d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z"/></svg>
                              </button>
                            </div>
                          </div>
                        )}
                      </SortableRow>
                    );
                  })}
                </SortableContext>
              </DndContext>
            )}
          </div>
        </div>

        {/* 仕切り線 */}
        <div className="w-px bg-[var(--c-border)] shrink-0" />

        {/* ガント部 */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* ガントヘッダー */}
          <div ref={gHeaderRef} className="overflow-hidden shrink-0 border-b border-[var(--c-border)] bg-[var(--c-bg-2)]">
            <div style={{ width: ganttLayout.totalWidth }}>
              {/* 月ヘッダー */}
              <div className="flex h-6 border-b border-[var(--c-border)]">
                {ganttLayout.months.map(ml => (
                  <div
                    key={ml.key}
                    className={`shrink-0 flex items-center justify-start pl-2 border-r border-[var(--c-border)] cursor-pointer text-[10px] font-medium text-[var(--c-text-2)] select-none hover:bg-[var(--c-accent)]/10 transition-colors overflow-hidden ${ml.collapsed ? 'bg-[var(--c-bg-2)]' : ''}`}
                    style={{ width: ml.width }}
                    onClick={() => toggleCollapseMonth(ml.key)}
                    title={ml.collapsed ? `${ml.key} 展開` : `${ml.key} 折りたたむ`}
                  >
                    {ml.collapsed ? '▶' : ml.label}
                  </div>
                ))}
              </div>
              {/* 日ヘッダー */}
              <div className="flex h-7">
                {ganttLayout.months.map(ml => {
                  if (ml.collapsed) {
                    return <div key={ml.key} className="shrink-0 border-r border-[var(--c-border)] bg-[var(--c-bg-2)]" style={{ width: ml.width }} />;
                  }
                  const days: React.ReactNode[] = [];
                  const cur = new Date(ml.firstDay);
                  while (cur <= ml.lastDay) {
                    const str = formatDate(cur);
                    const dow = cur.getDay();
                    const isHoliday = getJapaneseHolidays(cur.getFullYear()).has(str) || customSet.has(str);
                    const isToday = str === todayStr;
                    const isMonthStart = cur.getDate() === 1;
                    let cls = 'shrink-0 flex items-center justify-center text-[9px] border-r border-[var(--c-border)] select-none';
                    if (isToday) cls += ' bg-[var(--c-accent)]/30 text-[var(--c-accent)] font-bold';
                    else if (dow === 0) cls += ' bg-red-500/10 text-red-400';
                    else if (isHoliday) cls += ' bg-yellow-500/10 text-yellow-500';
                    else if (dow === 6) cls += ' bg-blue-500/10 text-blue-400';
                    else cls += ' text-[var(--c-text-3)]';
                    if (isMonthStart) cls += ' border-l-2 border-l-[var(--c-accent)]/40';
                    days.push(
                      <div key={str} className={cls} style={{ width: DAY_PX }}>
                        {cur.getDate()}
                      </div>
                    );
                    cur.setDate(cur.getDate() + 1);
                  }
                  return <React.Fragment key={ml.key}>{days}</React.Fragment>;
                })}
              </div>
            </div>
          </div>

          {/* ガントボディ */}
          <div ref={gBodyRef} className="flex-1 overflow-auto">
            <div className="relative" style={{ width: ganttLayout.totalWidth }}>
              {/* 今日ライン */}
              {todayLineX >= 0 && (
                <div
                  className="absolute top-0 bottom-0 pointer-events-none z-10"
                  style={{ left: todayLineX, width: 2, background: 'var(--c-danger, #ef4444)', opacity: 0.6 }}
                />
              )}
              {visibleTasks.map(task => {
                const agg = aggValues.get(task.id!) ?? null;
                const planStart   = agg ? agg.plan_start   : task.plan_start;
                const planEnd     = agg ? agg.plan_end     : addBusinessDays(task.plan_start, task.plan_days, customSet);
                const actualStart = agg ? agg.actual_start : task.actual_start;
                const isOngoing   = agg ? agg._isOngoing   : (!!task.actual_start && !task.actual_end);
                const actualEndRaw = agg ? agg.actual_end  : task.actual_end;
                const actualEnd = actualEndRaw || (isOngoing ? todayStr : '');
                const planDays  = agg ? agg.plan_days : (task.plan_days || 0);
                const actualDays = actualStart ? countBusinessDays(actualStart, actualEnd, customSet) : 0;
                const isOverrun = planDays > 0 && actualDays > planDays;
                const successColor = 'var(--c-success, #10b981)';
                const dangerColor = 'var(--c-danger, #ef4444)';
                const actualBg = isOngoing && isOverrun
                  ? `repeating-linear-gradient(90deg, ${dangerColor} 0px, ${dangerColor} 6px, transparent 6px, transparent 9px)`
                  : isOngoing
                    ? `repeating-linear-gradient(90deg, ${successColor} 0px, ${successColor} 6px, transparent 6px, transparent 9px)`
                    : isOverrun ? dangerColor : successColor;
                const planTooltip = planStart && planEnd ? `${shortDate(planStart)} 〜 ${shortDate(planEnd)}` : '';
                const actualTooltip = actualStart ? `${shortDate(actualStart)} 〜 ${shortDate(isOngoing ? todayStr : actualEnd)}` : '';
                return (
                  <div
                    key={task.id}
                    className="relative border-b border-[var(--c-border)] flex"
                    style={{ height: 38 }}
                  >
                    {/* 背景セル */}
                    {ganttLayout.months.map(ml => {
                      if (ml.collapsed) {
                        return <div key={ml.key} className="shrink-0 h-full border-r border-[var(--c-border)] bg-[var(--c-bg-2)]" style={{ width: ml.width }} />;
                      }
                      const bCells: React.ReactNode[] = [];
                      const cur = new Date(ml.firstDay);
                      while (cur <= ml.lastDay) {
                        const str = formatDate(cur);
                        const dow = cur.getDay();
                        const isHoliday = getJapaneseHolidays(cur.getFullYear()).has(str) || customSet.has(str);
                        const isToday = str === todayStr;
                        const isMonthStart = cur.getDate() === 1;
                        let cellCls = 'shrink-0 h-full border-r border-[var(--c-border)]';
                        if (isToday) cellCls += ' bg-[var(--c-accent)]/10';
                        else if (dow === 0) cellCls += ' bg-red-500/5';
                        else if (isHoliday) cellCls += ' bg-yellow-500/5';
                        else if (dow === 6) cellCls += ' bg-blue-500/5';
                        if (isMonthStart) cellCls += ' border-l border-l-[var(--c-accent)]/20';
                        bCells.push(<div key={str} className={cellCls} style={{ width: DAY_PX }} />);
                        cur.setDate(cur.getDate() + 1);
                      }
                      return <React.Fragment key={ml.key}>{bCells}</React.Fragment>;
                    })}
                    {/* ガントバー（予定: 上段 top8px、実績: 下段 top21px） */}
                    <div className="absolute inset-0 pointer-events-none">
                      {buildBar(planStart, planEnd, 8, 'var(--c-accent)', planTooltip)}
                      {buildBar(actualStart, actualEnd, 21, actualBg, actualTooltip)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* カスタム祝日モーダル */}
      {showHolidayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={e => { if (e.target === e.currentTarget) setShowHolidayModal(false); }}>
          <div className="bg-[var(--c-bg)] border border-[var(--c-border)] rounded-xl shadow-xl w-[480px] max-h-[70vh] flex flex-col p-5 gap-4">
            <h2 className="text-sm font-semibold">カスタム祝日・休業日の設定</h2>
            <p className="text-xs text-[var(--c-text-3)]">土日・日本の祝日は自動で非営業日として扱われます。<br />それ以外の休業日（年末年始・夏季休暇等）をここで追加できます。</p>
            <div className="flex gap-2">
              <DatePicker
                value={hdayDate}
                placeholder="日付を選択"
                onChange={v => setHdayDate(v ?? '')}
                onClear={() => setHdayDate('')}
                className="flex-none"
              />
              <input
                type="text"
                value={hdayName}
                onChange={e => setHdayName(e.target.value)}
                placeholder="名称（例: 夏季休暇）"
                className="flex-1 px-2 py-1.5 text-xs rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-text)]"
              />
              <button onClick={addHoliday} className="btn btn--primary btn--sm text-xs shrink-0">追加</button>
            </div>
            <div className="flex-1 overflow-auto">
              {customHolidays.length === 0 ? (
                <p className="text-xs text-[var(--c-text-3)] py-2">登録なし</p>
              ) : (
                customHolidays.slice().sort((a, b) => a.date.localeCompare(b.date)).map(h => (
                  <div key={h.date} className="flex items-center gap-2 py-1.5 border-b border-[var(--c-border)]">
                    <span className="text-xs font-mono text-[var(--c-text-2)] w-24 shrink-0">{h.date}</span>
                    <span className="text-xs flex-1">{h.name}</span>
                    <button onClick={() => removeHoliday(h.date)} className="text-[var(--c-text-3)] hover:text-red-400 transition-colors" title="削除"><XIcon size={13} aria-hidden="true" /></button>
                  </div>
                ))
              )}
            </div>
            <div className="flex justify-end">
              <button onClick={() => setShowHolidayModal(false)} className="btn btn--ghost btn--sm text-xs">閉じる</button>
            </div>
          </div>
        </div>
      )}

      <ShortcutHelp categories={WBS_SHORTCUTS} />
    </div>
  );
}
