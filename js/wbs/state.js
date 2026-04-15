'use strict';

// ==========================================
// WBS 状態管理・日付ユーティリティ・ガントレイアウト・親子集計
// ==========================================

// 状態変数
let _db = null;
let _customHolidays = loadCustomHolidays();
let _customSet = new Set(_customHolidays.map(h => h.date));

const State = {
  tasks: [],
  selectedId: null,
  collapsed: new Set(),        // 折りたたんでいる親タスク ID の Set
  _collapsedMonths: new Set(), // 折りたたんでいるガント月 'YYYY-MM' の Set
  // 派生状態（renderAll() 時に再計算）
  _childrenMap: new Map(),
  _taskMap: new Map(),
  _aggValues: new Map(),
  _visibleTasks: [],
};

const STATUS_CONFIG = {
  not_started: { label: '未着手', cls: 's-not-started' },
  in_progress:  { label: '進行中', cls: 's-in-progress' },
  done:         { label: '完了',   cls: 's-done' },
  on_hold:      { label: '保留',   cls: 's-on-hold' },
};

const TOAST = (msg, type) => Toast.show(msg, type);
const showSuccess = (msg) => Toast.success(msg);
const showError = (msg) => Toast.error(msg);

// ==========================================
// 日付ユーティリティ
// ==========================================

function calcPlanEnd(task) {
  return addBusinessDays(task.plan_start, task.plan_days, _customSet);
}

function calcActualEnd(task) {
  return task.actual_end || '';
}

function calcActualDays(task) {
  if (!task.actual_start) return 0;
  const end = task.actual_end || formatDate(new Date());
  return countBusinessDays(task.actual_start, end, _customSet);
}

function shortDate(str) {
  if (!str) return '';
  const [y, m, d] = str.split('-').map(Number);
  return `${y}/${m}/${d}`;
}

// ==========================================
// ガントチャートレイアウト
// ==========================================
const DAY_PX = 22;
const COLLAPSED_MONTH_W = 22; // 折りたたんだ月の幅（px）

function calcDisplayPeriod() {
  let minDate = null;
  let maxDate = null;

  for (const t of State.tasks) {
    const planEnd = calcPlanEnd(t);
    const actualEnd = calcActualEnd(t);
    const dates = [t.plan_start, planEnd, t.actual_start, actualEnd].filter(Boolean).map(parseDate).filter(Boolean);
    for (const d of dates) {
      if (!minDate || d < minDate) minDate = new Date(d);
      if (!maxDate || d > maxDate) maxDate = new Date(d);
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!minDate) {
    minDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    maxDate = new Date(today.getFullYear(), today.getMonth() + 3, 0);
  } else {
    minDate = new Date(minDate);
    minDate.setDate(minDate.getDate() - 14);
    maxDate = new Date(maxDate);
    maxDate.setDate(maxDate.getDate() + 21);
  }

  if (today < minDate) minDate = new Date(today.getFullYear(), today.getMonth(), 1);
  if (today > maxDate) maxDate = new Date(today);

  minDate = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  maxDate = new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 0);

  const days = Math.round((maxDate - minDate) / 86400000) + 1;
  return { start: minDate, end: maxDate, days };
}

/**
 * ガントチャートのレイアウト情報を構築
 * 折りたたんだ月は COLLAPSED_MONTH_W px に圧縮される
 */
function buildGanttLayout(period, collapsedMonths) {
  const months = [];
  let x = 0;
  let cur = new Date(period.start);

  while (cur <= period.end) {
    const y = cur.getFullYear();
    const m = cur.getMonth();
    const key = `${y}-${String(m + 1).padStart(2, '0')}`;
    const monthEnd = new Date(y, m + 1, 0);
    const end = monthEnd > period.end ? period.end : monthEnd;
    const dayCount = Math.round((end - cur) / 86400000) + 1;
    const collapsed = collapsedMonths.has(key);
    const width = collapsed ? COLLAPSED_MONTH_W : dayCount * DAY_PX;

    months.push({
      key,
      label: `${y}/${String(m + 1).padStart(2, '0')}`,
      startX: x,
      width,
      dayCount,
      collapsed,
      firstDay: new Date(cur),
      lastDay: new Date(end),
    });

    x += width;
    cur = new Date(y, m + 1, 1);
  }

  function _findMonth(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    for (const ml of months) {
      if (d >= ml.firstDay && d <= ml.lastDay) return { ml, d };
    }
    return null;
  }

  return {
    months,
    totalWidth: x,
    /** 日付の左端 X 座標（バー開始位置に使用） */
    dateToLeftX(date) {
      const found = _findMonth(date);
      if (!found) return -1;
      const { ml, d } = found;
      if (ml.collapsed) return ml.startX;
      const off = Math.round((d - ml.firstDay) / 86400000);
      return ml.startX + off * DAY_PX;
    },
    /** 日付の右端 X 座標（バー終了位置に使用） */
    dateToRightX(date) {
      const found = _findMonth(date);
      if (!found) return -1;
      const { ml, d } = found;
      if (ml.collapsed) return ml.startX + ml.width;
      const off = Math.round((d - ml.firstDay) / 86400000);
      return ml.startX + (off + 1) * DAY_PX;
    },
    /** 今日の縦線 X 座標 */
    todayLineX() {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (today < period.start || today > period.end) return -1;
      const found = _findMonth(today);
      if (!found) return -1;
      const { ml, d } = found;
      if (ml.collapsed) return ml.startX + ml.width / 2;
      const off = Math.round((d - ml.firstDay) / 86400000);
      return ml.startX + off * DAY_PX + DAY_PX / 2;
    },
  };
}

// ==========================================
// 親子関係の構築とアグリゲーション
// ==========================================

function buildChildrenMap(tasks) {
  const children = new Map();
  const levelStack = [];

  for (const task of tasks) {
    levelStack.length = task.level + 1;
    levelStack[task.level] = task.id;

    if (task.level > 0 && levelStack[task.level - 1] !== undefined) {
      const parentId = levelStack[task.level - 1];
      if (!children.has(parentId)) children.set(parentId, []);
      children.get(parentId).push(task.id);
    }
  }
  return children;
}

/**
 * 子タスクから親タスクの集計値を再帰的に計算
 * @returns {{ plan_start, plan_days, plan_end, actual_start, actual_end, _isOngoing, progress, status } | null}
 */
function calcAggregatedValues(task, taskMap, childrenMap) {
  const childIds = childrenMap.get(task.id);
  if (!childIds || childIds.length === 0) return null;

  const childEffective = childIds.map(id => {
    const child = taskMap.get(id);
    if (!child) return null;
    const agg = calcAggregatedValues(child, taskMap, childrenMap);
    if (agg) return agg;
    const isOngoing = !!child.actual_start && !child.actual_end;
    return {
      plan_start:   child.plan_start,
      plan_days:    child.plan_days || 0,
      plan_end:     calcPlanEnd(child),
      actual_start: child.actual_start,
      actual_end:   child.actual_end || '',   // ongoing でも今日付を入れない（生値のまま）
      _isOngoing:   isOngoing,
      progress:     child.progress || 0,
      status:       child.status || 'not_started',
    };
  }).filter(Boolean);

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

  const plan_days = plan_start && plan_end
    ? countBusinessDays(plan_start, plan_end, _customSet)
    : 0;

  // 進捗: plan_days による重み付き平均
  let totalWeight = 0, weightedProgress = 0;
  for (const v of childEffective) {
    const w = Math.max(1, v.plan_days || 1);
    weightedProgress += (v.progress || 0) * w;
    totalWeight += w;
  }
  const progress = totalWeight > 0 ? Math.round(weightedProgress / totalWeight) : 0;

  const _isOngoing = childEffective.some(v => v._isOngoing);

  // ステータス集計: 全完了→完了、進行中あり→進行中、保留あり→保留、それ以外→未着手
  const statuses = childEffective.map(v => v.status || 'not_started');
  let status;
  if (statuses.every(s => s === 'done')) status = 'done';
  else if (statuses.some(s => s === 'in_progress')) status = 'in_progress';
  else if (statuses.some(s => s === 'on_hold')) status = 'on_hold';
  else status = 'not_started';

  return { plan_start, plan_days, plan_end, actual_start, actual_end, _isOngoing, progress, status };
}

function getVisibleTasks(tasks, childrenMap) {
  if (State.collapsed.size === 0) return tasks;
  const hidden = new Set();
  function markHidden(taskId) {
    for (const kidId of (childrenMap.get(taskId) || [])) {
      hidden.add(kidId);
      markHidden(kidId);
    }
  }
  for (const taskId of State.collapsed) markHidden(taskId);
  return tasks.filter(t => !hidden.has(t.id));
}
