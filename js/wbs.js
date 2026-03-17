// ==========================================
// WBS（作業分解構造）メインスクリプト
// ==========================================

// ==========================================
// 日本の祝日計算
// ==========================================

// ローカルストレージキー
const CUSTOM_HOLIDAY_KEY     = 'wbs_custom_holidays';
const COLLAPSED_KEY          = 'wbs_collapsed';
const COLLAPSED_MONTHS_KEY   = 'wbs_gantt_collapsed_months';

/** カスタム祝日をロード: [{ date:'YYYY-MM-DD', name:string }] */
function loadCustomHolidays() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_HOLIDAY_KEY) || '[]'); } catch { return []; }
}
function saveCustomHolidays(list) {
  localStorage.setItem(CUSTOM_HOLIDAY_KEY, JSON.stringify(list));
}

/** タスク折りたたみ状態をロード: taskId の Set */
function loadCollapsed() {
  try { return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '[]')); } catch { return new Set(); }
}
function saveCollapsed() {
  localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...State.collapsed]));
}

/** ガント折りたたみ月をロード: 'YYYY-MM' の Set */
function loadCollapsedMonths() {
  try { return new Set(JSON.parse(localStorage.getItem(COLLAPSED_MONTHS_KEY) || '[]')); } catch { return new Set(); }
}
function saveCollapsedMonths() {
  localStorage.setItem(COLLAPSED_MONTHS_KEY, JSON.stringify([...State._collapsedMonths]));
}

/** 日付文字列 'YYYY-MM-DD' を Date に変換（ローカル日時） */
function parseDate(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Date を 'YYYY-MM-DD' に変換 */
function formatDate(d) {
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 指定年の日本の祝日 Set（'YYYY-MM-DD' 文字列） */
const _holidayCache = {};
function getJapaneseHolidays(year) {
  if (_holidayCache[year]) return _holidayCache[year];

  const add = (m, d) => `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  const fixed = new Set([
    add(1, 1),  add(2, 11), add(2, 23), add(4, 29),
    add(5, 3),  add(5, 4),  add(5, 5),  add(8, 11),
    add(11, 3), add(11, 23),
  ]);

  const shunbun = Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  fixed.add(add(3, shunbun));
  const shubun = Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  fixed.add(add(9, shubun));

  const nthMonday = (month, n) => {
    const first = new Date(year, month - 1, 1);
    const dow = first.getDay();
    const firstMon = dow === 1 ? 1 : (8 - dow) % 7 + 1;
    return firstMon + (n - 1) * 7;
  };
  fixed.add(add(1, nthMonday(1, 2)));
  fixed.add(add(7, nthMonday(7, 3)));
  fixed.add(add(9, nthMonday(9, 3)));
  fixed.add(add(10, nthMonday(10, 2)));

  // 振替休日
  const result = new Set(fixed);
  fixed.forEach(dateStr => {
    const d = new Date(dateStr);
    if (d.getDay() === 0) {
      let sub = new Date(d);
      sub.setDate(sub.getDate() + 1);
      while (result.has(formatDate(sub))) sub.setDate(sub.getDate() + 1);
      result.add(formatDate(sub));
    }
  });

  // 国民の休日（敬老の日と秋分の日の間）
  const keiro = add(9, nthMonday(9, 3));
  const shubunDate = add(9, shubun);
  if (keiro && shubunDate) {
    const kd = parseDate(keiro), sd = parseDate(shubunDate);
    if (sd && kd && sd - kd === 2 * 86400000) {
      const mid = new Date(kd);
      mid.setDate(mid.getDate() + 1);
      if (mid.getDay() !== 0 && mid.getDay() !== 6) result.add(formatDate(mid));
    }
  }

  _holidayCache[year] = result;
  return result;
}

function isNonWorkingDay(date, customSet) {
  const dow = date.getDay();
  if (dow === 0 || dow === 6) return true;
  const str = formatDate(date);
  if (getJapaneseHolidays(date.getFullYear()).has(str)) return true;
  if (customSet && customSet.has(str)) return true;
  return false;
}

function addBusinessDays(startStr, days, customSet) {
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

function countBusinessDays(startStr, endStr, customSet) {
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

// ==========================================
// 状態管理
// ==========================================
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
      plan_start:  child.plan_start,
      plan_days:   child.plan_days || 0,
      plan_end:    calcPlanEnd(child),
      actual_start: child.actual_start,
      actual_end:  isOngoing ? formatDate(new Date()) : child.actual_end,
      _isOngoing:  isOngoing,
      progress:    child.progress || 0,
      status:      child.status || 'not_started',
    };
  }).filter(Boolean);

  if (!childEffective.length) return null;

  const planStarts   = childEffective.map(v => v.plan_start).filter(Boolean);
  const planEnds     = childEffective.map(v => v.plan_end).filter(Boolean);
  const actualStarts = childEffective.map(v => v.actual_start).filter(Boolean);
  const actualEnds   = childEffective.map(v => v.actual_end).filter(Boolean);

  const plan_start   = planStarts.length   ? planStarts.reduce((a, b) => a < b ? a : b)   : '';
  const plan_end     = planEnds.length     ? planEnds.reduce((a, b) => a > b ? a : b)     : '';
  const actual_start = actualStarts.length ? actualStarts.reduce((a, b) => a < b ? a : b) : '';
  const actual_end   = actualEnds.length   ? actualEnds.reduce((a, b) => a > b ? a : b)   : '';

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

// ==========================================
// レンダリング
// ==========================================
const Renderer = {

  renderAll() {
    const childrenMap = buildChildrenMap(State.tasks);
    const taskMap = new Map(State.tasks.map(t => [t.id, t]));
    State._childrenMap = childrenMap;
    State._taskMap = taskMap;
    State._aggValues = new Map();
    for (const task of State.tasks) {
      State._aggValues.set(task.id, calcAggregatedValues(task, taskMap, childrenMap));
    }
    State._visibleTasks = getVisibleTasks(State.tasks, childrenMap);
    this.renderTable();
    this.renderGantt();
  },

  renderTable() {
    const body = document.getElementById('wbs-table-body');
    if (!State.tasks.length) {
      body.innerHTML = `
        <div class="wbs-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <div>タスクがありません<br><small style="color:var(--c-text-3)">「タスク追加」ボタンで追加してください</small></div>
        </div>`;
      return;
    }

    const todayStr = formatDate(new Date());

    const rows = State._visibleTasks.map((task) => {
      const idx = State.tasks.indexOf(task);
      const hasChildren = (State._childrenMap.get(task.id) || []).length > 0;
      const isCollapsed = State.collapsed.has(task.id);
      const agg = State._aggValues.get(task.id);

      // 表示値（子タスクがあれば集計値、なければタスク自身）
      const planStart   = agg ? agg.plan_start   : task.plan_start;
      const planEnd     = agg ? agg.plan_end     : calcPlanEnd(task);
      const planDays    = agg ? agg.plan_days    : (task.plan_days || 0);
      const actualStart = agg ? agg.actual_start : task.actual_start;
      const actualEndRaw = agg ? agg.actual_end  : task.actual_end;
      const isOngoing   = agg ? agg._isOngoing   : (!!task.actual_start && !task.actual_end);
      const progress    = agg ? agg.progress     : (task.progress || 0);
      const aggStatus   = agg ? agg.status       : (task.status || 'not_started');

      // 実績工数計算
      const actualEndForCalc = actualEndRaw || (isOngoing ? todayStr : '');
      const actualDays = actualStart ? countBusinessDays(actualStart, actualEndForCalc, _customSet) : 0;

      const isDone    = aggStatus === 'done';
      const isDelayed = !isDone && planEnd && planEnd < todayStr;
      const isDueSoon = !isDone && !isDelayed && planEnd &&
        Math.round((parseDate(planEnd) - parseDate(todayStr)) / 86400000) <= 3;
      const isOverrun = planDays > 0 && actualDays > planDays;

      const sc = STATUS_CONFIG[aggStatus] || STATUS_CONFIG.not_started;
      const isSelected = task.id === State.selectedId;
      const indent = task.level * 16;

      // ツールチップ（タスク名＋詳細情報）
      const tooltipLines = [task.title || '（タスク名未設定）'];
      const statusLabel = sc.label;
      tooltipLines.push(`${statusLabel}  ${progress}%`);
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

      // 折りたたみボタン
      const collapseBtn = hasChildren
        ? `<button class="wbs-collapse-btn${isCollapsed ? ' is-collapsed' : ''}" data-action="toggle-collapse" title="${isCollapsed ? '展開' : '折りたたむ'}">
            <svg viewBox="0 0 16 16"><path d="M12.78 5.22a.749.749 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.06 0L3.22 6.28a.749.749 0 1 1 1.06-1.06L8 8.94l3.72-3.72a.749.749 0 0 1 1.06 0Z"/></svg>
          </button>`
        : '<span class="wbs-collapse-placeholder"></span>';

      // 集計フィールドは読み取り専用
      const planStartCell = agg
        ? `<div class="wbs-cell cell-date is-readonly is-agg">${shortDate(planStart)}</div>`
        : `<div class="wbs-cell cell-date is-clickable is-date-picker" data-field="plan_start">${shortDate(planStart)}</div>`;

      const planDaysCell = agg
        ? `<div class="wbs-cell cell-days is-readonly is-agg">${planDays || ''}</div>`
        : `<div class="wbs-cell cell-days is-clickable" data-field="plan_days">${planDays || ''}</div>`;

      const actualStartCell = agg
        ? `<div class="wbs-cell cell-date is-readonly is-agg">${shortDate(actualStart)}</div>`
        : `<div class="wbs-cell cell-date is-clickable is-date-picker" data-field="actual_start">${shortDate(actualStart)}</div>`;

      const actualEndCell = agg
        ? `<div class="wbs-cell cell-date is-readonly is-agg">${shortDate(actualEndRaw)}</div>`
        : `<div class="wbs-cell cell-date is-clickable is-date-picker" data-field="actual_end">${shortDate(actualEndRaw)}</div>`;

      const progressCell = agg
        ? `<div class="wbs-cell cell-pct is-readonly is-agg">
            <div class="wbs-progress-wrap">
              <div class="wbs-progress-bar"><div class="wbs-progress-fill" style="width:${progress}%"></div></div>
              <div class="wbs-progress-label">${progress}%</div>
            </div>
          </div>`
        : `<div class="wbs-cell cell-pct is-clickable" data-field="progress">
            <div class="wbs-progress-wrap">
              <div class="wbs-progress-bar"><div class="wbs-progress-fill" style="width:${progress}%"></div></div>
              <div class="wbs-progress-label">${progress}%</div>
            </div>
          </div>`;

      // 親タスクのステータスは集計値を表示（編集不可）
      const statusCell = agg
        ? `<div class="wbs-cell cell-status is-readonly is-agg">
            <span class="wbs-status ${sc.cls}">${sc.label}</span>
          </div>`
        : `<div class="wbs-cell cell-status is-clickable" data-field="status">
            <span class="wbs-status ${sc.cls}">${sc.label}</span>
          </div>`;

      return `<div class="wbs-row wbs-row--l${task.level}${isSelected ? ' is-selected' : ''}${agg ? ' is-parent-agg' : ''}"
                   data-task-id="${task.id}"
                   data-status="${task.status || 'not_started'}">
        <div class="wbs-cell cell-no">${idx + 1}</div>
        <div class="wbs-cell cell-title is-clickable" data-field="title" data-tooltip="${escapeHtml(titleTooltip)}"${isDelayed ? ' data-tooltip-type="danger"' : isDueSoon ? ' data-tooltip-type="warning"' : ''}>
          <div class="wbs-title-indent">
            <span class="wbs-title-spacer" style="width:${indent}px"></span>
            ${collapseBtn}
            <span class="wbs-title-text">${escapeHtml(task.title || '（タスク名未設定）')}</span>
            ${isDelayed ? '<span class="wbs-badge wbs-badge--delay">遅延</span>' : ''}
            ${isDueSoon ? '<span class="wbs-badge wbs-badge--soon">期日近</span>' : ''}
          </div>
        </div>
        ${planStartCell}
        ${planDaysCell}
        <div class="wbs-cell cell-date is-readonly${isDelayed ? ' is-overdue' : isDueSoon ? ' is-due-soon' : ''}" data-tooltip="${isDelayed ? '予定終了日を超過しています' : isDueSoon ? '期日まで3日以内です' : ''}">${shortDate(planEnd)}</div>
        ${actualStartCell}
        ${actualEndCell}
        <div class="wbs-cell cell-days is-readonly${isOverrun ? ' is-overrun' : ''}${isOngoing ? ' is-ongoing' : ''}" data-tooltip="${isOverrun ? `予定(${planDays}日)を超過しています` : isOngoing ? '実績終了未入力のため本日までの工数' : ''}">${actualDays || ''}</div>
        ${progressCell}
        ${statusCell}
        <div class="wbs-cell cell-ops">
          <button class="wbs-icon-btn danger" data-action="delete" title="削除">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z"/></svg>
          </button>
        </div>
      </div>`;
    }).join('');

    body.innerHTML = rows;
  },

  // ガントチャート
  renderGantt() {
    const period = calcDisplayPeriod();
    const layout = buildGanttLayout(period, State._collapsedMonths);
    this._renderGanttHeader(period, layout);
    this._renderGanttBody(period, layout);
    document.getElementById('wbs-gantt-header-inner').style.width = layout.totalWidth + 'px';
    document.getElementById('wbs-gantt-body-inner').style.width = layout.totalWidth + 'px';
  },

  _renderGanttHeader(period, layout) {
    const monthsEl = document.getElementById('gantt-months');
    const daysEl   = document.getElementById('gantt-days');
    const today = formatDate(new Date());

    // 月ヘッダー（クリックで折りたたみトグル）
    let monthsHtml = '';
    for (const ml of layout.months) {
      monthsHtml += `<div class="gantt-month-cell${ml.collapsed ? ' is-collapsed' : ''}" style="width:${ml.width}px" data-collapse-month="${ml.key}" title="${ml.collapsed ? ml.key + ' 展開' : ml.key + ' 折りたたむ'}">
        <span class="gantt-month-toggle">${ml.collapsed ? '▶' : '▼'}</span>
        ${ml.collapsed ? '' : `<span class="gantt-month-label">${ml.label}</span>`}
      </div>`;
    }
    monthsEl.innerHTML = monthsHtml;

    // 日ヘッダー（折りたたんだ月はプレースホルダーのみ）
    let daysHtml = '';
    for (const ml of layout.months) {
      if (ml.collapsed) {
        daysHtml += `<div class="gantt-day-cell is-collapsed-month" style="width:${ml.width}px"></div>`;
      } else {
        const cur = new Date(ml.firstDay);
        while (cur <= ml.lastDay) {
          const str = formatDate(cur);
          const dow = cur.getDay();
          const year = cur.getFullYear();
          const isHoliday = getJapaneseHolidays(year).has(str) || _customSet.has(str);
          const isToday = str === today;
          const isMonthStart = cur.getDate() === 1;
          let cls = '';
          if (isToday) cls = 'is-today';
          else if (isHoliday) cls = 'is-holiday';
          else if (dow === 0) cls = 'is-sunday';
          else if (dow === 6) cls = 'is-saturday';
          if (isMonthStart) cls += ' is-month-start';
          daysHtml += `<div class="gantt-day-cell ${cls}">${cur.getDate()}</div>`;
          cur.setDate(cur.getDate() + 1);
        }
      }
    }
    daysEl.innerHTML = daysHtml;
  },

  _renderGanttBody(period, layout) {
    const body = document.getElementById('wbs-gantt-body-inner');
    const today = formatDate(new Date());
    const bgCells = this._buildBgCells(layout, today);

    const rowsHtml = State._visibleTasks.map(task => {
      const isDone = task.status === 'done';
      const agg = State._aggValues.get(task.id);

      const planStart   = agg ? agg.plan_start   : task.plan_start;
      const planEnd     = agg ? agg.plan_end      : calcPlanEnd(task);
      const actualStart = agg ? agg.actual_start  : task.actual_start;
      const isOngoing   = agg ? agg._isOngoing    : (!!task.actual_start && !task.actual_end);
      const actualEndRaw = agg ? agg.actual_end : task.actual_end;
      const actualEnd = actualEndRaw || (isOngoing ? today : '');

      const actualBarCls = isOngoing ? 'gantt-bar--actual is-ongoing' : 'gantt-bar--actual';
      const planBar   = this._buildBar(period, planStart, planEnd, 'gantt-bar--plan', layout);
      const actualBar = this._buildBar(period, actualStart, actualEnd, actualBarCls, layout);

      return `<div class="gantt-row ${isDone ? 'is-done' : ''}" data-task-id="${task.id}">
        ${bgCells}
        <div class="gantt-bar-wrap">
          ${planBar}
          ${actualBar}
        </div>
      </div>`;
    }).join('');

    const todayLineX = layout.todayLineX();

    body.innerHTML = `
      <div style="position:relative;">
        ${rowsHtml}
        ${todayLineX >= 0
          ? `<div class="gantt-today-line" style="left:${todayLineX}px"></div>` : ''}
      </div>`;
  },

  _buildBgCells(layout, todayStr) {
    let html = '';
    for (const ml of layout.months) {
      if (ml.collapsed) {
        // 折りたたんだ月: 単一の圧縮セル
        html += `<div class="gantt-bg-cell is-collapsed-month" style="width:${ml.width}px"></div>`;
      } else {
        const cur = new Date(ml.firstDay);
        while (cur <= ml.lastDay) {
          const str = formatDate(cur);
          const dow = cur.getDay();
          const year = cur.getFullYear();
          const isHoliday = getJapaneseHolidays(year).has(str) || _customSet.has(str);
          const isToday = str === todayStr;
          const isMonthStart = cur.getDate() === 1;
          let cls = '';
          if (isToday) cls = 'is-today';
          else if (isHoliday) cls = 'is-holiday';
          else if (dow === 0) cls = 'is-sunday';
          else if (dow === 6) cls = 'is-saturday';
          if (isMonthStart) cls += ' is-month-start';
          html += `<div class="gantt-bg-cell ${cls}"></div>`;
          cur.setDate(cur.getDate() + 1);
        }
      }
    }
    return html;
  },

  _buildBar(period, startStr, endStr, cls, layout) {
    if (!startStr || !endStr) return '';
    const start = parseDate(startStr);
    const end   = parseDate(endStr);
    if (!start || !end || start > period.end || end < period.start) return '';

    const s = start < period.start ? period.start : start;
    const e = end   > period.end   ? period.end   : end;

    const left  = layout.dateToLeftX(s);
    const right = layout.dateToRightX(e);
    if (left < 0 || right < 0 || right <= left) return '';

    const width = right - left;
    const overlays = this._buildNonWorkOverlays(s, e, layout, left);
    const tooltip = shortDate(startStr) + ' 〜 ' + shortDate(endStr);
    return `<div class="gantt-bar ${cls}" style="left:${left}px;width:${width}px;" data-tooltip="${escapeHtml(tooltip)}">${overlays}</div>`;
  },

  /** バー内の土日・祝日を暗化オーバーレイで表示（折りたたんだ月はスキップ） */
  _buildNonWorkOverlays(barStart, barEnd, layout, barLeft) {
    let html = '';
    const cur = new Date(barStart);
    cur.setHours(0, 0, 0, 0);
    while (cur <= barEnd) {
      const dayLeft  = layout.dateToLeftX(cur);
      const dayRight = layout.dateToRightX(cur);
      const dayWidth = dayRight - dayLeft;
      // 非折りたたみ日のみオーバーレイ追加
      if (dayWidth === DAY_PX && isNonWorkingDay(cur, _customSet)) {
        html += `<div class="gantt-bar-nonwork" style="left:${dayLeft - barLeft}px;width:${DAY_PX}px;"></div>`;
      }
      cur.setDate(cur.getDate() + 1);
    }
    return html;
  },

  initScrollSync() {
    const tBody   = document.getElementById('wbs-table-body');
    const gBody   = document.getElementById('wbs-gantt-body');
    const gHeader = document.getElementById('wbs-gantt-header');

    if (!tBody || !gBody) return;

    let syncing = false;
    tBody.addEventListener('scroll', () => {
      if (syncing) return;
      syncing = true;
      gBody.scrollTop = tBody.scrollTop;
      syncing = false;
    });
    gBody.addEventListener('scroll', () => {
      if (syncing) return;
      syncing = true;
      tBody.scrollTop  = gBody.scrollTop;
      gHeader.scrollLeft = gBody.scrollLeft;
      syncing = false;
      localStorage.setItem('wbs_gantt_scroll_x', String(Math.round(gBody.scrollLeft)));
    });

    // テーブルクリック委譲
    EventHandlers.bindTableBodyEvents(tBody);

    // ガント月ヘッダークリック委譲（gantt-header は固定要素なので一度だけ登録）
    gHeader.addEventListener('click', e => {
      const cell = e.target.closest('[data-collapse-month]');
      if (!cell) return;
      const key = cell.dataset.collapseMonth;
      if (State._collapsedMonths.has(key)) {
        State._collapsedMonths.delete(key);
      } else {
        State._collapsedMonths.add(key);
      }
      saveCollapsedMonths();
      Renderer.renderGantt();
    });

    this._restoreOrCenterToday(gBody);
  },

  _restoreOrCenterToday(gBody) {
    const saved = localStorage.getItem('wbs_gantt_scroll_x');
    if (saved !== null) {
      gBody.scrollLeft = Number(saved);
      return;
    }
    this.scrollToToday(gBody);
  },

  scrollToToday(gBody) {
    const period = calcDisplayPeriod();
    const layout = buildGanttLayout(period, State._collapsedMonths);
    const todayX = layout.todayLineX();
    requestAnimationFrame(() => {
      const center = todayX - gBody.clientWidth / 2;
      gBody.scrollLeft = Math.max(0, center);
      localStorage.setItem('wbs_gantt_scroll_x', String(Math.round(gBody.scrollLeft)));
    });
  },
};

// ==========================================
// イベントハンドラー
// ==========================================
const EventHandlers = {

  bindAll() {
    document.getElementById('add-task-btn').addEventListener('click', () => this.addTask());
    document.getElementById('indent-in-btn').addEventListener('click', () => this.indentTask(1));
    document.getElementById('indent-out-btn').addEventListener('click', () => this.indentTask(-1));
    document.getElementById('move-up-btn').addEventListener('click', () => this.moveTask(-1));
    document.getElementById('move-down-btn').addEventListener('click', () => this.moveTask(1));
    document.getElementById('export-btn').addEventListener('click', () => this.exportData());
    document.getElementById('import-file').addEventListener('change', e => this.importData(e));
    document.getElementById('holiday-btn').addEventListener('click', () => this.openHolidayModal());
    document.getElementById('today-btn').addEventListener('click', () => {
      const gBody = document.getElementById('wbs-gantt-body');
      if (gBody) Renderer.scrollToToday(gBody);
    });

    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'Tab') { e.preventDefault(); this.indentTask(e.shiftKey ? -1 : 1); }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (State.selectedId) this.deleteTask(State.selectedId);
      }
    });

    window.addEventListener('message', e => {
      if (e.data && e.data.type === 'theme-change') {
        document.documentElement.setAttribute('data-theme', e.data.theme);
      }
    });
  },

  bindTableBodyEvents(tbody) {
    tbody.addEventListener('click', e => {
      const row = e.target.closest('[data-task-id]');
      if (!row) return;
      const taskId = Number(row.dataset.taskId);

      const delBtn = e.target.closest('[data-action="delete"]');
      if (delBtn) { this.deleteTask(taskId); return; }

      const collapseBtn = e.target.closest('[data-action="toggle-collapse"]');
      if (collapseBtn) { this.toggleCollapse(taskId); return; }

      State.selectedId = taskId;
      document.querySelectorAll('.wbs-row').forEach(r => r.classList.remove('is-selected'));
      row.classList.add('is-selected');

      const cell = e.target.closest('[data-field]');
      if (cell) this.startEditing(taskId, cell.dataset.field, cell);
    });
  },

  toggleCollapse(taskId) {
    if (State.collapsed.has(taskId)) {
      State.collapsed.delete(taskId);
    } else {
      State.collapsed.add(taskId);
    }
    saveCollapsed();
    Renderer.renderAll();
  },

  async addTask() {
    const position = State.tasks.length
      ? State.tasks[State.tasks.length - 1].position + 1
      : 0;
    const selectedTask = State.tasks.find(t => t.id === State.selectedId);
    const level = selectedTask ? selectedTask.level : 0;

    const id = await _db.addTask({
      title: 'タスク名', level, position,
      plan_start: '', plan_days: 0,
      actual_start: '', actual_end: '',
      progress: 0, status: 'not_started', memo: '',
    });

    State.tasks = await _db.getAllTasks();
    State.selectedId = id;
    Renderer.renderAll();
    TOAST('タスクを追加しました', 'success');
  },

  async deleteTask(id) {
    if (!confirm('このタスクを削除しますか？')) return;
    await _db.deleteTask(id);
    if (State.selectedId === id) State.selectedId = null;
    State.collapsed.delete(id);
    saveCollapsed();
    State.tasks = await _db.getAllTasks();
    Renderer.renderAll();
    TOAST('タスクを削除しました');
  },

  startEditing(taskId, field, cell) {
    if (!field) return;
    // 編集中はツールチップを無効化（セルが残っていると data-tooltip が再トリガーされるため属性ごと除去）
    Tooltip.hide();
    cell.removeAttribute('data-tooltip');
    cell.removeAttribute('data-tooltip-type');
    const task = State.tasks.find(t => t.id === taskId);
    if (!task) return;

    if (field === 'plan_start' || field === 'actual_start' || field === 'actual_end') {
      this._openDatePicker(task, field);
      return;
    }
    if (field === 'status') {
      this._openStatusPicker(task, cell);
      return;
    }

    const val = task[field] != null ? String(task[field]) : '';
    let input;

    if (field === 'title') {
      input = document.createElement('input');
      input.type = 'text';
      input.className = 'wbs-cell-input';
      input.value = val;
    } else if (field === 'plan_days') {
      input = document.createElement('input');
      input.type = 'number';
      input.min = '0'; input.max = '9999';
      input.className = 'wbs-cell-input';
      input.value = val === '0' ? '' : val;
    } else if (field === 'progress') {
      input = document.createElement('input');
      input.type = 'number';
      input.min = '0'; input.max = '100';
      input.className = 'wbs-cell-input';
      input.value = val === '0' ? '0' : val;
    }

    if (!input) return;
    cell.innerHTML = '';
    cell.appendChild(input);
    input.focus();
    if (input.select) input.select();

    let _saved = false;
    const save = async () => {
      if (_saved) return;
      _saved = true;
      let newVal = input.value;
      if (field === 'plan_days') {
        newVal = Math.max(0, parseInt(newVal || '0', 10)) || 0;
      } else if (field === 'progress') {
        newVal = Math.min(100, Math.max(0, parseInt(newVal || '0', 10))) || 0;
      }
      task[field] = newVal;
      await _db.updateTask(task);
      State.tasks = await _db.getAllTasks();
      Renderer.renderAll();
    };

    input.addEventListener('blur', save);
    input.addEventListener('keydown', e => {
      if (field === 'title') {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { _saved = true; Renderer.renderAll(); }
      } else {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { _saved = true; Renderer.renderAll(); }
      }
    });
  },

  _openStatusPicker(task, cell) {
    document.getElementById('wbs-status-picker')?.remove();

    const rect = cell.getBoundingClientRect();
    const picker = document.createElement('div');
    picker.id = 'wbs-status-picker';
    picker.className = 'wbs-status-picker';
    picker.style.left = rect.left + 'px';
    picker.style.top  = rect.bottom + 'px';

    picker.innerHTML = Object.entries(STATUS_CONFIG).map(([k, v]) =>
      `<div class="wbs-status-option${k === (task.status || 'not_started') ? ' is-selected' : ''}" data-status="${k}">
        <span class="wbs-status ${v.cls}">${v.label}</span>
      </div>`
    ).join('');

    document.body.appendChild(picker);

    picker.addEventListener('click', async e => {
      const opt = e.target.closest('[data-status]');
      if (!opt) return;
      picker.remove();
      task.status = opt.dataset.status;
      await _db.updateTask(task);
      State.tasks = await _db.getAllTasks();
      Renderer.renderAll();
    });

    setTimeout(() => {
      const close = e => {
        if (!picker.contains(e.target)) {
          picker.remove();
          document.removeEventListener('click', close, true);
        }
      };
      document.addEventListener('click', close, true);
    }, 0);
  },

  _openDatePicker(task, field) {
    DatePicker.open(
      task[field] || '',
      async (dateStr) => {
        task[field] = dateStr;
        await _db.updateTask(task);
        State.tasks = await _db.getAllTasks();
        Renderer.renderAll();
      },
      async () => {
        task[field] = '';
        await _db.updateTask(task);
        State.tasks = await _db.getAllTasks();
        Renderer.renderAll();
      }
    );
  },

  async indentTask(dir) {
    if (!State.selectedId) return;
    const task = State.tasks.find(t => t.id === State.selectedId);
    if (!task) return;
    const newLevel = Math.min(4, Math.max(0, task.level + dir));
    if (newLevel === task.level) return;
    task.level = newLevel;
    await _db.updateTask(task);
    State.tasks = await _db.getAllTasks();
    Renderer.renderAll();
  },

  async moveTask(dir) {
    if (!State.selectedId) return;
    const idx = State.tasks.findIndex(t => t.id === State.selectedId);
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= State.tasks.length) return;
    const a = State.tasks[idx];
    const b = State.tasks[newIdx];
    [a.position, b.position] = [b.position, a.position];
    await _db.bulkUpdate([a, b]);
    State.tasks = await _db.getAllTasks();
    Renderer.renderAll();
  },

  async exportData() {
    const json = await _db.exportAll();
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
    a.download = `wbs_export_${ts}.json`;
    a.click();
    URL.revokeObjectURL(url);
    TOAST('エクスポートしました', 'success');
  },

  async importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      await _db.importAll(text);
      State.tasks = await _db.getAllTasks();
      State.selectedId = null;
      Renderer.renderAll();
      TOAST('インポートしました', 'success');
    } catch (err) {
      TOAST('インポートに失敗しました: ' + err.message, 'error');
    }
    e.target.value = '';
  },

  openHolidayModal() {
    document.getElementById('holiday-modal')?.remove();

    const modal = document.createElement('div');
    modal.className = 'wbs-holiday-modal';
    modal.id = 'holiday-modal';
    modal.innerHTML = `
      <div class="wbs-holiday-dialog">
        <h2 class="wbs-holiday-title">カスタム祝日・休業日の設定</h2>
        <p style="font-size:12px;color:var(--c-text-3);margin:0">
          土日・日本の祝日は自動で非営業日として扱われます。<br>
          それ以外の休業日（年末年始・夏季休暇等）をここで追加できます。
        </p>
        <div class="wbs-holiday-input-row">
          <button class="btn btn--secondary btn--sm is-date-picker" id="hday-date-btn" style="min-width:100px;">日付を選択</button>
          <input type="hidden" id="hday-date">
          <input type="text" id="hday-name" placeholder="名称（例: 夏季休暇）" style="flex:2">
          <button class="btn btn--primary btn--sm" id="hday-add-btn">追加</button>
        </div>
        <div class="wbs-holiday-body">
          <div class="wbs-holiday-list" id="hday-list"></div>
        </div>
        <div class="wbs-holiday-footer">
          <button class="btn btn--secondary btn--sm" id="hday-close-btn">閉じる</button>
        </div>
      </div>`;

    document.body.appendChild(modal);

    const renderList = () => {
      const list = loadCustomHolidays().sort((a, b) => a.date.localeCompare(b.date));
      const el = document.getElementById('hday-list');
      if (!list.length) {
        el.innerHTML = '<div style="color:var(--c-text-3);font-size:12px;padding:8px 0">登録なし</div>';
        return;
      }
      el.innerHTML = list.map(h => `
        <div class="wbs-holiday-item">
          <span class="wbs-holiday-item-date">${h.date}</span>
          <span class="wbs-holiday-item-name">${escapeHtml(h.name)}</span>
          <button class="wbs-icon-btn danger" data-del="${escapeHtml(h.date)}" title="削除">
            <svg viewBox="0 0 16 16"><path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z"/></svg>
          </button>
        </div>`).join('');
    };

    renderList();

    document.getElementById('hday-date-btn').addEventListener('click', () => {
      const cur = document.getElementById('hday-date').value || '';
      DatePicker.open(cur, dateStr => {
        document.getElementById('hday-date').value = dateStr;
        document.getElementById('hday-date-btn').textContent = dateStr;
        document.getElementById('hday-date-btn').classList.toggle('has-value', !!dateStr);
      }, () => {
        document.getElementById('hday-date').value = '';
        document.getElementById('hday-date-btn').textContent = '日付を選択';
        document.getElementById('hday-date-btn').classList.remove('has-value');
      });
    });

    document.getElementById('hday-add-btn').addEventListener('click', () => {
      const date = document.getElementById('hday-date').value;
      const name = document.getElementById('hday-name').value.trim();
      if (!date) { TOAST('日付を入力してください', 'error'); return; }
      const cur = loadCustomHolidays();
      if (cur.some(h => h.date === date)) { TOAST('既に登録されています', 'error'); return; }
      cur.push({ date, name: name || '休業日' });
      saveCustomHolidays(cur);
      _customHolidays = loadCustomHolidays();
      _customSet = new Set(_customHolidays.map(h => h.date));
      document.getElementById('hday-date').value = '';
      document.getElementById('hday-date-btn').textContent = '日付を選択';
      document.getElementById('hday-date-btn').classList.remove('has-value');
      document.getElementById('hday-name').value = '';
      renderList();
      Renderer.renderAll();
    });

    document.getElementById('hday-list').addEventListener('click', e => {
      const btn = e.target.closest('[data-del]');
      if (!btn) return;
      const date = btn.dataset.del;
      const cur = loadCustomHolidays().filter(h => h.date !== date);
      saveCustomHolidays(cur);
      _customHolidays = loadCustomHolidays();
      _customSet = new Set(_customHolidays.map(h => h.date));
      renderList();
      Renderer.renderAll();
    });

    document.getElementById('hday-close-btn').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  },
};

// ==========================================
// アプリ初期化
// ==========================================
const App = {
  async init() {
    _db = await new WbsDB().open();
    State.tasks = await _db.getAllTasks();
    State.collapsed = loadCollapsed();
    State._collapsedMonths = loadCollapsedMonths();
    Renderer.renderAll();
    Renderer.initScrollSync();
    Tooltip.init(document.getElementById('wbs-gantt-body'));
    Tooltip.init(document.getElementById('wbs-table-body'));
    EventHandlers.bindAll();
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
