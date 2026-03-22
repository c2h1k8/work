'use strict';

// ==========================================
// WBS レンダリング
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
