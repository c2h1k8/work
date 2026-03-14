// ==========================================
// WBS（作業分解構造）メインスクリプト
// ==========================================

// ==========================================
// 日本の祝日計算
// ==========================================

// ローカルストレージキー（祝日追加設定）
const CUSTOM_HOLIDAY_KEY = 'wbs_custom_holidays';

/** カスタム祝日をロード: [{ date:'YYYY-MM-DD', name:string }] */
function loadCustomHolidays() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_HOLIDAY_KEY) || '[]'); } catch { return []; }
}
function saveCustomHolidays(list) {
  localStorage.setItem(CUSTOM_HOLIDAY_KEY, JSON.stringify(list));
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
    add(1, 1),  // 元日
    add(2, 11), // 建国記念の日
    add(2, 23), // 天皇誕生日（2020年〜）
    add(4, 29), // 昭和の日
    add(5, 3),  // 憲法記念日
    add(5, 4),  // みどりの日
    add(5, 5),  // こどもの日
    add(8, 11), // 山の日（2016年〜）
    add(11, 3), // 文化の日
    add(11, 23),// 勤労感謝の日
  ]);

  // 春分の日（簡易計算: 1980〜2099年対応）
  const shunbun = Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  fixed.add(add(3, shunbun));

  // 秋分の日
  const shubun = Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  fixed.add(add(9, shubun));

  // N番目の月曜日を返す
  const nthMonday = (month, n) => {
    const first = new Date(year, month - 1, 1);
    const dow = first.getDay();
    const firstMon = dow === 1 ? 1 : (8 - dow) % 7 + 1;
    return firstMon + (n - 1) * 7;
  };

  // ハッピーマンデー
  fixed.add(add(1, nthMonday(1, 2)));  // 成人の日
  fixed.add(add(7, nthMonday(7, 3)));  // 海の日
  fixed.add(add(9, nthMonday(9, 3)));  // 敬老の日
  fixed.add(add(10, nthMonday(10, 2)));// スポーツの日（2020年〜）

  // 振替休日（祝日が日曜の場合は翌月曜、もし翌月曜も祝日なら翌火曜）
  const result = new Set(fixed);
  fixed.forEach(dateStr => {
    const d = new Date(dateStr);
    if (d.getDay() === 0) { // 日曜
      let substitute = new Date(d);
      substitute.setDate(substitute.getDate() + 1);
      while (result.has(formatDate(substitute))) {
        substitute.setDate(substitute.getDate() + 1);
      }
      result.add(formatDate(substitute));
    }
  });

  // 国民の休日（祝日に挟まれた平日）
  // 敬老の日と秋分の日の間（まれに発生）
  const keiro = add(9, nthMonday(9, 3));
  const shubunDate = add(9, shubun);
  if (keiro && shubunDate) {
    const kd = parseDate(keiro), sd = parseDate(shubunDate);
    if (sd && kd && sd - kd === 2 * 86400000) {
      const mid = new Date(kd);
      mid.setDate(mid.getDate() + 1);
      if (mid.getDay() !== 0 && mid.getDay() !== 6) {
        result.add(formatDate(mid));
      }
    }
  }

  _holidayCache[year] = result;
  return result;
}

/**
 * 指定日が非営業日（土日・祝日・カスタム祝日）かどうか
 * @param {Date} date
 * @param {Set} customSet - 'YYYY-MM-DD' の Set
 */
function isNonWorkingDay(date, customSet) {
  const dow = date.getDay();
  if (dow === 0 || dow === 6) return true; // 土日
  const str = formatDate(date);
  const year = date.getFullYear();
  if (getJapaneseHolidays(year).has(str)) return true;
  if (customSet && customSet.has(str)) return true;
  return false;
}

/**
 * 開始日から営業日数分進んだ終了日を計算
 * @param {string} startStr 'YYYY-MM-DD'
 * @param {number} days 営業日数（1以上）
 * @param {Set} customSet
 * @returns {string} 'YYYY-MM-DD'
 */
function addBusinessDays(startStr, days, customSet) {
  if (!startStr || !days || days <= 0) return '';
  const start = parseDate(startStr);
  if (!start) return '';
  // 開始日が非営業日の場合は次の営業日へ
  while (isNonWorkingDay(start, customSet)) {
    start.setDate(start.getDate() + 1);
  }
  let count = 1; // 開始日を1日目と数える
  const cur = new Date(start);
  while (count < days) {
    cur.setDate(cur.getDate() + 1);
    if (!isNonWorkingDay(cur, customSet)) count++;
  }
  return formatDate(cur);
}

/**
 * 開始日〜終了日の営業日数を計算（両端含む）
 * @param {string} startStr
 * @param {string} endStr
 * @param {Set} customSet
 */
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
let _customHolidays = loadCustomHolidays(); // [{ date:'YYYY-MM-DD', name:string }]
let _customSet = new Set(_customHolidays.map(h => h.date));

/** 選択中タスクID */
const State = {
  tasks: [],        // WbsDB から取得したタスク一覧（position 昇順）
  selectedId: null, // 選択中タスクの id
};

// ==========================================
// ステータス定義
// ==========================================
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

/** タスクの予定終了日を計算 */
function calcPlanEnd(task) {
  return addBusinessDays(task.plan_start, task.plan_days, _customSet);
}

/** タスクの実績終了日（actual_end フィールドを直接参照） */
function calcActualEnd(task) {
  // actual_end が設定されていればそれを優先（後方互換: actual_days での計算は廃止）
  return task.actual_end || '';
}

/** 実績の営業日数（actual_start〜actual_end 間を自動計算。actual_end 未設定時は本日まで） */
function calcActualDays(task) {
  if (!task.actual_start) return 0;
  const end = task.actual_end || formatDate(new Date());
  return countBusinessDays(task.actual_start, end, _customSet);
}

/** 'YYYY-MM-DD' → 'YYYY/M/D' 表示（年をまたぐ場合を考慮して年を表示） */
function shortDate(str) {
  if (!str) return '';
  const [y, m, d] = str.split('-').map(Number);
  return `${y}/${m}/${d}`;
}

// ==========================================
// ガントチャート表示期間の計算
// ==========================================
const DAY_PX = 22; // 1日の横幅（px）

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
    // マージン: 前2週間 + 後3週間
    minDate = new Date(minDate);
    minDate.setDate(minDate.getDate() - 14);
    maxDate = new Date(maxDate);
    maxDate.setDate(maxDate.getDate() + 21);
  }

  // today が範囲外なら含める
  if (today < minDate) minDate = new Date(today.getFullYear(), today.getMonth(), 1);
  if (today > maxDate) maxDate = new Date(today);

  // 月初に丸める
  minDate = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  maxDate = new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 0);

  const days = Math.round((maxDate - minDate) / 86400000) + 1;
  return { start: minDate, end: maxDate, days };
}

// ==========================================
// レンダリング
// ==========================================
const Renderer = {

  renderAll() {
    this.renderTable();
    this.renderGantt();
  },

  // テーブル本体
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

    const rows = State.tasks.map((task, idx) => {
      const planEnd = calcPlanEnd(task);
      const actualEnd = calcActualEnd(task);
      const sc = STATUS_CONFIG[task.status] || STATUS_CONFIG.not_started;
      const isSelected = task.id === State.selectedId;
      const indent = task.level * 16;

      // 遅延チェック：予定終了日を過ぎていて未完了
      const isDone = task.status === 'done';
      const isDelayed = !isDone && planEnd && planEnd < todayStr;
      // 期日近チェック：予定終了日まで 3 日以内（遅延・完了を除く）
      const isDueSoon = !isDone && !isDelayed && planEnd &&
        Math.round((parseDate(planEnd) - parseDate(todayStr)) / 86400000) <= 3;
      // 超過チェック：実績工数 > 予定工数
      const actualDays = calcActualDays(task);
      const isOverrun = task.plan_days > 0 && actualDays > task.plan_days;
      // 実績終了未入力で進行中（実績開始あり）
      const isOngoing = !!task.actual_start && !task.actual_end;

      const pct = task.progress || 0;

      return `<div class="wbs-row wbs-row--l${task.level}${isSelected ? ' is-selected' : ''}"
                   data-task-id="${task.id}"
                   data-status="${task.status || 'not_started'}">
        <div class="wbs-cell cell-no">${idx + 1}</div>
        <div class="wbs-cell cell-title is-clickable" data-field="title" title="Ctrl+Enter で確定">
          <div class="wbs-title-indent">
            <span class="wbs-title-spacer" style="width:${indent}px"></span>
            <span class="wbs-title-text">${escapeHtml(task.title || '（タスク名未設定）')}</span>
            ${isDelayed ? '<span class="wbs-badge wbs-badge--delay">遅延</span>' : ''}
            ${isDueSoon ? '<span class="wbs-badge wbs-badge--soon">期日近</span>' : ''}
          </div>
        </div>
        <div class="wbs-cell cell-date is-clickable is-date-picker" data-field="plan_start">${shortDate(task.plan_start)}</div>
        <div class="wbs-cell cell-days is-clickable" data-field="plan_days">${task.plan_days || ''}</div>
        <div class="wbs-cell cell-date is-readonly${isDelayed ? ' is-overdue' : isDueSoon ? ' is-due-soon' : ''}" title="${isDelayed ? '予定終了日を超過しています' : isDueSoon ? '期日まで3日以内です' : ''}">${shortDate(planEnd)}</div>
        <div class="wbs-cell cell-date is-clickable is-date-picker" data-field="actual_start">${shortDate(task.actual_start)}</div>
        <div class="wbs-cell cell-date is-clickable is-date-picker" data-field="actual_end">${shortDate(actualEnd)}</div>
        <div class="wbs-cell cell-days is-readonly${isOverrun ? ' is-overrun' : ''}${isOngoing ? ' is-ongoing' : ''}" title="${isOverrun ? `予定(${task.plan_days}日)を超過しています` : isOngoing ? '実績終了未入力のため本日までの工数' : ''}">${actualDays || ''}</div>
        <div class="wbs-cell cell-pct is-clickable" data-field="progress">
          <div class="wbs-progress-wrap">
            <div class="wbs-progress-bar"><div class="wbs-progress-fill" style="width:${pct}%"></div></div>
            <div class="wbs-progress-label">${pct}%</div>
          </div>
        </div>
        <div class="wbs-cell cell-status is-clickable" data-field="status">
          <span class="wbs-status ${sc.cls}">${sc.label}</span>
        </div>
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
    this._renderGanttHeader(period);
    this._renderGanttBody(period);

    // ヘッダーの内側幅をセット（スクロール同期用）
    const totalW = period.days * DAY_PX;
    document.getElementById('wbs-gantt-header-inner').style.width = totalW + 'px';
    document.getElementById('wbs-gantt-body-inner').style.width = totalW + 'px';
  },

  _renderGanttHeader(period) {
    const monthsEl = document.getElementById('gantt-months');
    const daysEl = document.getElementById('gantt-days');
    const today = formatDate(new Date());

    // 月ヘッダー
    let monthsHtml = '';
    let cur = new Date(period.start);
    while (cur <= period.end) {
      const y = cur.getFullYear();
      const m = cur.getMonth();
      // 月末
      const monthEnd = new Date(y, m + 1, 0);
      const endClamped = monthEnd > period.end ? period.end : monthEnd;
      const dayCount = Math.round((endClamped - cur) / 86400000) + 1;
      const w = dayCount * DAY_PX;
      monthsHtml += `<div class="gantt-month-cell" style="width:${w}px">${y}/${String(m + 1).padStart(2, '0')}</div>`;
      cur = new Date(y, m + 1, 1);
    }
    monthsEl.innerHTML = monthsHtml;

    // 日ヘッダー
    let daysHtml = '';
    cur = new Date(period.start);
    while (cur <= period.end) {
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
    daysEl.innerHTML = daysHtml;
  },

  _renderGanttBody(period) {
    const body = document.getElementById('wbs-gantt-body-inner');
    const today = formatDate(new Date());
    const totalW = period.days * DAY_PX;

    // 今日の位置
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    const todayOffset = Math.round((todayDate - period.start) / 86400000);
    const todayLeft = todayOffset * DAY_PX + DAY_PX / 2;

    // 背景セル（全行共通）の生成テンプレート
    const bgCells = this._buildBgCells(period, today);

    // 行生成
    const rowsHtml = State.tasks.map(task => {
      const isDone = task.status === 'done';
      const planEnd = calcPlanEnd(task);
      // 実績終了未入力かつ実績開始あり → 本日まで線を引く
      const actualEnd = task.actual_end || (task.actual_start ? today : '');
      const actualBarCls = !task.actual_end && task.actual_start ? 'gantt-bar--actual is-ongoing' : 'gantt-bar--actual';
      const planBar = this._buildBar(period, task.plan_start, planEnd, 'gantt-bar--plan');
      const actualBar = this._buildBar(period, task.actual_start, actualEnd, actualBarCls);

      return `<div class="gantt-row ${isDone ? 'is-done' : ''}" data-task-id="${task.id}">
        ${bgCells}
        <div class="gantt-bar-wrap">
          ${planBar}
          ${actualBar}
        </div>
      </div>`;
    }).join('');

    body.innerHTML = `
      <div style="position:relative;">
        ${rowsHtml}
        ${todayOffset >= 0 && todayOffset < period.days
          ? `<div class="gantt-today-line" style="left:${todayLeft}px"></div>` : ''}
      </div>`;
  },

  _buildBgCells(period, todayStr) {
    let html = '';
    const cur = new Date(period.start);
    while (cur <= period.end) {
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
    return html;
  },

  _buildBar(period, startStr, endStr, cls) {
    if (!startStr || !endStr) return '';
    const start = parseDate(startStr);
    const end = parseDate(endStr);
    if (!start || !end || start > period.end || end < period.start) return '';

    const s = start < period.start ? period.start : start;
    const e = end > period.end ? period.end : end;

    const left = Math.round((s - period.start) / 86400000) * DAY_PX;
    const width = Math.round((e - s) / 86400000 + 1) * DAY_PX;
    if (width <= 0) return '';

    // バー内には常時ラベルを表示しない。ホバー時のカスタムツールチップで日付を表示する
    const tooltip = shortDate(startStr) + ' 〜 ' + shortDate(endStr);
    return `<div class="gantt-bar ${cls}" style="left:${left}px;width:${width}px;" data-tooltip="${escapeHtml(tooltip)}"></div>`;
  },

  /** スクロール同期リスナー（初期化時に一度だけ呼ぶ） */
  initScrollSync() {
    const tBody = document.getElementById('wbs-table-body');
    const gBody = document.getElementById('wbs-gantt-body');
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
      tBody.scrollTop = gBody.scrollTop;
      gHeader.scrollLeft = gBody.scrollLeft;
      syncing = false;
      // 横スクロール位置を記憶
      localStorage.setItem('wbs_gantt_scroll_x', String(Math.round(gBody.scrollLeft)));
    });

    // テーブルクリック（委譲: wbs-table-body の中身は書き換わるが div 要素は固定）
    EventHandlers.bindTableBodyEvents(tBody);

    // ガントチャートの初期スクロール位置（記憶を復元 or 今日を中央に）
    this._restoreOrCenterToday(gBody);
  },

  /** ガントチャートの横スクロール: 保存値を復元、なければ今日を中央に */
  _restoreOrCenterToday(gBody) {
    const saved = localStorage.getItem('wbs_gantt_scroll_x');
    if (saved !== null) {
      gBody.scrollLeft = Number(saved);
      return;
    }
    this.scrollToToday(gBody);
  },

  /** 今日の日付をガントチャートの中央に表示（「今日へ」ボタン用） */
  scrollToToday(gBody) {
    const period = calcDisplayPeriod();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayOffset = Math.round((today - period.start) / 86400000);
    requestAnimationFrame(() => {
      const center = todayOffset * DAY_PX - gBody.clientWidth / 2 + DAY_PX / 2;
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

    // キーボードショートカット
    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'Tab') { e.preventDefault(); this.indentTask(e.shiftKey ? -1 : 1); }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (State.selectedId) this.deleteTask(State.selectedId);
      }
    });

    // テーマ変更メッセージを受信
    window.addEventListener('message', e => {
      if (e.data && e.data.type === 'theme-change') {
        document.documentElement.setAttribute('data-theme', e.data.theme);
      }
    });
  },

  /** テーブルボディへのイベント委譲（クローン後に再バインド） */
  bindTableBodyEvents(tbody) {
    tbody.addEventListener('click', e => {
      const row = e.target.closest('[data-task-id]');
      if (!row) return;
      const taskId = Number(row.dataset.taskId);

      // 削除ボタン
      const delBtn = e.target.closest('[data-action="delete"]');
      if (delBtn) { this.deleteTask(taskId); return; }

      // 選択
      State.selectedId = taskId;
      document.querySelectorAll('.wbs-row').forEach(r => r.classList.remove('is-selected'));
      row.classList.add('is-selected');

      // セル編集
      const cell = e.target.closest('[data-field]');
      if (cell) this.startEditing(taskId, cell.dataset.field, cell);
    });
  },

  // ---------- タスク追加 ----------
  async addTask() {
    const position = State.tasks.length
      ? State.tasks[State.tasks.length - 1].position + 1
      : 0;

    // 選択中タスクと同じレベルで追加
    const selectedTask = State.tasks.find(t => t.id === State.selectedId);
    const level = selectedTask ? selectedTask.level : 0;

    const id = await _db.addTask({
      title: 'タスク名',
      level,
      position,
      plan_start: '',
      plan_days: 0,
      actual_start: '',
      actual_end: '',
      progress: 0,
      status: 'not_started',
      memo: '',
    });

    State.tasks = await _db.getAllTasks();
    State.selectedId = id;
    Renderer.renderAll();
    TOAST('タスクを追加しました', 'success');
  },

  // ---------- タスク削除 ----------
  async deleteTask(id) {
    if (!confirm('このタスクを削除しますか？')) return;
    await _db.deleteTask(id);
    if (State.selectedId === id) State.selectedId = null;
    State.tasks = await _db.getAllTasks();
    Renderer.renderAll();
    TOAST('タスクを削除しました');
  },

  // ---------- セル編集 ----------
  startEditing(taskId, field, cell) {
    if (!field) return;

    const task = State.tasks.find(t => t.id === taskId);
    if (!task) return;

    // 日付フィールドは DatePicker を使う
    if (field === 'plan_start' || field === 'actual_start' || field === 'actual_end') {
      this._openDatePicker(task, field);
      return;
    }

    // status はカスタムポップアップで
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
      input.min = '0';
      input.max = '9999';
      input.className = 'wbs-cell-input';
      input.value = val === '0' ? '' : val;
    } else if (field === 'progress') {
      input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.max = '100';
      input.className = 'wbs-cell-input';
      input.value = val === '0' ? '0' : val;
    }

    if (!input) return;

    cell.innerHTML = '';
    cell.appendChild(input);
    input.focus();
    if (input.select) input.select();

    // blur または Enter キーで保存（change は登録しない: スピナー/矢印キーのたびに保存されて編集できなくなるため）
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
        // タイトルは Ctrl+Enter で確定（IME 変換確定の Enter と区別するため）
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { _saved = true; Renderer.renderAll(); }
      } else {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { _saved = true; Renderer.renderAll(); }
      }
    });
  },

  // ---------- ステータス選択ポップアップ ----------
  _openStatusPicker(task, cell) {
    // 既存ピッカーを閉じる
    document.getElementById('wbs-status-picker')?.remove();

    const rect = cell.getBoundingClientRect();
    const picker = document.createElement('div');
    picker.id = 'wbs-status-picker';
    picker.className = 'wbs-status-picker';
    picker.style.left = rect.left + 'px';
    picker.style.top = rect.bottom + 'px';

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

    // 外側クリックで閉じる（次のイベントループで登録してクリックの二重発火を防ぐ）
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

  // ---------- DatePicker で日付フィールドを編集 ----------
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

  // ---------- インデント ----------
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

  // ---------- 並び替え ----------
  async moveTask(dir) {
    if (!State.selectedId) return;
    const idx = State.tasks.findIndex(t => t.id === State.selectedId);
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= State.tasks.length) return;

    // position を入れ替え
    const a = State.tasks[idx];
    const b = State.tasks[newIdx];
    [a.position, b.position] = [b.position, a.position];
    await _db.bulkUpdate([a, b]);
    State.tasks = await _db.getAllTasks();
    Renderer.renderAll();
  },

  // ---------- エクスポート ----------
  async exportData() {
    const json = await _db.exportAll();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
    a.download = `wbs_export_${ts}.json`;
    a.click();
    URL.revokeObjectURL(url);
    TOAST('エクスポートしました', 'success');
  },

  // ---------- インポート ----------
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

  // ---------- 祝日設定モーダル ----------
  openHolidayModal() {
    // 既存モーダルがあれば削除
    document.getElementById('holiday-modal')?.remove();

    const customHolidays = loadCustomHolidays();

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

    // 日付ピッカーボタン
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
      // 入力欄をリセット
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
    Renderer.renderAll();
    Renderer.initScrollSync();
    Tooltip.init(document.getElementById('wbs-gantt-body'));
    EventHandlers.bindAll();
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
