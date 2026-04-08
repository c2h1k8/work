'use strict';

// ==================================================
// 定型作業タイマー — 描画
// タイマーUI、操作ボタン、プリセット一覧、ログ、
// プリセットモーダルの描画を担当
// ==================================================

// ==================================================
// タグカラー（タグ名のハッシュから決定論的に色を決定）
// ==================================================

/** タグに使用するカラーパレット */
const TAG_PALETTE = [
  '#6366f1', // indigo
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
  '#3b82f6', // blue
  '#84cc16', // lime
];

/**
 * タグ名からパレット色を返す（同じ名前は常に同じ色）
 * @param {string} tag
 * @returns {string} CSS color string
 */
function _tagColor(tag) {
  if (!tag) return TAG_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = (Math.imul(31, hash) + tag.charCodeAt(i)) | 0;
  }
  return TAG_PALETTE[Math.abs(hash) % TAG_PALETTE.length];
}

// ==================================================
// タイマー UI 更新
// ==================================================

/** タイマー表示（数字＋円形プログレス）を更新 */
function updateTimerUI() {
  const display = document.getElementById('timer-display');
  const badge   = document.getElementById('timer-mode-badge');
  const circle  = document.getElementById('timer-ring-progress');

  if (display) display.textContent = fmtMMSS(State.remaining);
  if (badge) {
    badge.textContent  = State.mode === 'work' ? '作業中' : '休憩中';
    badge.className    = `timer-mode-badge timer-mode-badge--${State.mode}`;
  }

  // 円形プログレスバー
  if (circle) {
    const radius = 90;
    const circumference = 2 * Math.PI * radius;
    const progress = State.total > 0 ? State.remaining / State.total : 1;
    circle.style.strokeDasharray  = circumference;
    circle.style.strokeDashoffset = circumference * (1 - progress);
    circle.style.stroke = State.mode === 'work' ? 'var(--c-accent)' : 'var(--c-success)';
  }

  // ページタイトル
  if (State.running) {
    document.title = `${State.mode === 'work' ? '▶' : '☕'} ${fmtMMSS(State.remaining)} 定型作業タイマー`;
  }
}

/** 操作ボタンのUIを更新 */
function updateControlUI() {
  const startPauseBtn = document.getElementById('start-pause-btn');
  if (!startPauseBtn) return;

  if (State.running) {
    startPauseBtn.innerHTML = `
      <svg viewBox="0 0 16 16" fill="currentColor" width="18" height="18"><path d="M6 3.5a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-1 0V4a.5.5 0 0 1 .5-.5ZM10 3.5a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-1 0V4a.5.5 0 0 1 .5-.5Z"/></svg>
      一時停止`;
    startPauseBtn.classList.remove('btn--primary');
    startPauseBtn.classList.add('btn--secondary');
  } else {
    startPauseBtn.innerHTML = `
      <svg viewBox="0 0 16 16" fill="currentColor" width="18" height="18"><path d="m11.596 8.697-6.363 3.692c-.54.313-1.233-.066-1.233-.697V4.308c0-.63.692-1.01 1.233-.696l6.363 3.692a.802.802 0 0 1 0 1.393z"/></svg>
      開始`;
    startPauseBtn.classList.remove('btn--secondary');
    startPauseBtn.classList.add('btn--primary');
  }
}

// ==================================================
// プリセット UI
// ==================================================

/** プリセット一覧を描画 */
function renderPresets() {
  const el = document.getElementById('preset-list');
  if (!el) return;

  if (!State.presets.length) {
    el.innerHTML = '<p class="preset-empty">プリセットがありません。追加してください。</p>';
    return;
  }

  el.innerHTML = State.presets.map(p => {
    const active = p.id === State.activePresetId ? ' preset-card--active' : '';
    return `<div class="preset-card${active}" data-id="${p.id}">
      <div class="preset-card__name">${escapeHtml(p.name)}</div>
      <div class="preset-card__times">
        <span class="preset-card__work">作業 ${fmtDuration(p.work_sec)}</span>
        <span class="preset-card__sep">/</span>
        <span class="preset-card__break">休憩 ${fmtDuration(p.break_sec)}</span>
      </div>
      <div class="preset-card__actions">
        <button class="preset-edit-btn icon-btn" data-id="${p.id}" title="編集">${Icons.edit}</button>
        <button class="preset-delete-btn icon-btn" data-id="${p.id}" title="削除">${Icons.close}</button>
      </div>
    </div>`;
  }).join('');
}

/** プリセット追加/編集モーダルを開く */
function openPresetModal(id = null) {
  State.editingPresetId = id;
  const modal    = document.getElementById('preset-modal');
  const titleEl  = document.getElementById('preset-modal-title');
  const nameIn   = document.getElementById('preset-name');
  const workIn   = document.getElementById('preset-work-min');
  const breakIn  = document.getElementById('preset-break-min');

  if (id) {
    const p = State.presets.find(x => x.id === id);
    if (!p) return;
    titleEl.textContent   = 'プリセットを編集';
    nameIn.value          = p.name;
    workIn.value          = Math.round(p.work_sec / 60);
    breakIn.value         = Math.round(p.break_sec / 60);
  } else {
    titleEl.textContent   = 'プリセットを追加';
    nameIn.value          = '';
    workIn.value          = '25';
    breakIn.value         = '5';
  }

  modal.hidden = false;
  nameIn.focus();
}

/** プリセットモーダルを閉じる */
function closePresetModal() {
  document.getElementById('preset-modal').hidden = true;
  State.editingPresetId = null;
}

// ==================================================
// ログ UI（メイン）
// ==================================================

/** ログセクション全体を描画（各サブレンダラーに委譲） */
function renderLog() {
  const logTotal = document.getElementById('log-total');
  if (!document.getElementById('log-list')) return;

  const totalSec = State.sessions.reduce((sum, s) => sum + (s.duration_sec || 0), 0);
  if (logTotal) logTotal.textContent = `合計: ${fmtDuration(totalSec)}`;

  _renderGoalStats();
  _renderDailyChart();
  _renderTagChart();
  _renderTaskChart();
  _renderWeekdayChart();
  _renderLogList();

  // 動的生成された data-tooltip 要素のツールチップを再初期化
  Tooltip.init(document.body);
}

// ==================================================
// 目標・ストリーク
// ==================================================

/** 目標達成率・連続達成日数・目標設定セレクトを描画 */
function _renderGoalStats() {
  const el = document.getElementById('goal-stats');
  if (!el) return;

  const goalSec  = State.dailyGoalSec;
  const todaySec = State.todayTotalSec;
  const streak   = State.streakDays;
  const pct      = goalSec > 0 ? Math.min(100, Math.round(todaySec / goalSec * 100)) : 0;

  const goalOptions = [
    { value: 0,       label: '設定しない' },
    { value: 3600,    label: '1時間' },
    { value: 7200,    label: '2時間' },
    { value: 10800,   label: '3時間' },
    { value: 14400,   label: '4時間' },
    { value: 21600,   label: '6時間' },
    { value: 28800,   label: '8時間' },
  ];

  const progressHtml = goalSec > 0 ? `
    <div class="goal-stats__item goal-stats__item--progress">
      <div class="goal-stats__prog-wrap">
        <div class="goal-stats__prog-bar" style="width:${pct}%"></div>
      </div>
      <div class="goal-stats__prog-labels">
        <span class="goal-stats__prog-current">${fmtDuration(todaySec)}</span>
        <span class="goal-stats__prog-goal">/ ${fmtDuration(goalSec)}</span>
        <span class="goal-stats__prog-pct">${pct}%</span>
      </div>
    </div>
  ` : `
    <div class="goal-stats__item goal-stats__item--today">
      <span class="goal-stats__today-val">${fmtDuration(todaySec)}</span>
      <span class="goal-stats__today-label">今日の作業時間</span>
    </div>
  `;

  el.innerHTML = `
    <div class="goal-stats__row">
      <div class="goal-stats__item goal-stats__item--streak">
        <span class="goal-stats__streak-num">${streak}</span>
        <span class="goal-stats__streak-unit">日連続</span>
        <span class="goal-stats__streak-icon">🔥</span>
      </div>
      ${progressHtml}
      <div class="goal-stats__set">
        <span class="goal-stats__set-label">目標</span>
        <select id="goal-select" class="cs-target kn-select--sm">
          ${goalOptions.map(o => `<option value="${o.value}"${goalSec === o.value ? ' selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}
        </select>
      </div>
    </div>
  `;

  // CustomSelect で置換
  CustomSelect.replaceAll(el);
}

// ==================================================
// 日別推移グラフ（縦棒）
// ==================================================

/**
 * 表示期間の日付リストを生成する
 * @returns {string[]} YYYY-MM-DD 形式の日付配列
 */
function _getDateList() {
  const today = toDateStr(new Date());
  const now   = new Date();

  if (State.historyView === 'today') return [];

  if (State.historyView === 'week') {
    const dow = now.getDay() || 7; // 月=1..日=7
    const list = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() - (dow - 1) + i);
      list.push(toDateStr(d));
    }
    return list;
  }

  if (State.historyView === 'month') {
    const list = [];
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    while (toDateStr(d) <= today) {
      list.push(toDateStr(d));
      d.setDate(d.getDate() + 1);
    }
    return list;
  }

  if (State.historyView === 'last-month') {
    const list = [];
    const d    = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end  = new Date(now.getFullYear(), now.getMonth(), 0); // 先月末日
    while (d <= end) {
      list.push(toDateStr(d));
      d.setDate(d.getDate() + 1);
    }
    return list;
  }

  if (State.historyView === 'custom' && State.customFrom && State.customTo) {
    const list = [];
    const d    = new Date(State.customFrom);
    const end  = new Date(State.customTo);
    while (d <= end) {
      list.push(toDateStr(d));
      d.setDate(d.getDate() + 1);
    }
    return list;
  }

  return [];
}

/**
 * 日付ラベルを生成する（棒グラフ下に表示）
 * @param {string} dateStr - YYYY-MM-DD
 * @param {number} total   - 全体の日数
 * @returns {string}
 */
function _formatDayLabel(dateStr, total) {
  const d   = new Date(dateStr);
  const day = d.getDate();
  if (total <= 7) {
    return ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  }
  if (total <= 31) {
    // 月ビュー: 1, 5, 10, 15, 20, 25 のみ表示
    return (day === 1 || day % 5 === 0) ? String(day) : '';
  }
  // カスタム長期: 月初のみ月名を表示
  return day === 1 ? `${d.getMonth() + 1}月` : '';
}

/** 日別推移グラフを描画 */
function _renderDailyChart() {
  const el = document.getElementById('daily-chart');
  if (!el) return;

  const dateList = _getDateList();
  if (!dateList.length) { el.hidden = true; return; }

  // 日別集計
  const byDate = {};
  State.sessions.forEach(s => {
    const d = s.started_at.slice(0, 10);
    byDate[d] = (byDate[d] || 0) + s.duration_sec;
  });

  const maxSec  = Math.max(...dateList.map(d => byDate[d] || 0), 1);
  const today   = toDateStr(new Date());

  // アクティブな日数（1秒以上記録がある日）で平均を計算
  const activeDays   = dateList.filter(d => byDate[d] > 0).length;
  const totalSec     = State.sessions.reduce((s, x) => s + x.duration_sec, 0);
  const avgSec       = activeDays > 0 ? Math.round(totalSec / activeDays) : 0;

  el.hidden = false;
  el.innerHTML = `
    <div class="daily-chart__title">日別推移</div>
    <div class="daily-chart__bars">
      ${dateList.map(d => {
        const sec  = byDate[d] || 0;
        const pct  = maxSec > 0 ? Math.round(sec / maxSec * 100) : 0;
        const isToday = d === today;
        const label   = _formatDayLabel(d, dateList.length);
        const tip     = sec > 0 ? `${fmtDuration(sec)}（${d}）` : d;
        return `<div class="daily-chart__col${isToday ? ' daily-chart__col--today' : ''}">
          <div class="daily-chart__bar-wrap">
            <div class="daily-chart__bar${sec === 0 ? ' daily-chart__bar--empty' : ''}"
              style="height:${Math.max(pct, sec > 0 ? 4 : 0)}%"
              data-tooltip="${tip}"></div>
          </div>
          <span class="daily-chart__label">${label}</span>
        </div>`;
      }).join('')}
    </div>
    ${avgSec > 0 ? `<div class="daily-chart__avg">記録がある日の平均: ${fmtDuration(avgSec)}/日</div>` : ''}
  `;
}

// ==================================================
// タグ別集計チャート
// ==================================================

/** タグ別集計を描画 */
function _renderTagChart() {
  const el = document.getElementById('tag-chart');
  if (!el) return;

  const tagMap = {};
  State.sessions.forEach(s => {
    const key = s.tag || '（なし）';
    tagMap[key] = (tagMap[key] || 0) + s.duration_sec;
  });
  const entries = Object.entries(tagMap).sort((a, b) => b[1] - a[1]);
  const maxSec  = entries.length ? entries[0][1] : 1;

  if (!entries.length || (entries.length === 1 && entries[0][0] === '（なし）')) {
    el.hidden = true;
    return;
  }

  el.hidden = false;
  el.innerHTML = `
    <div class="tag-chart__title">タグ別集計</div>
    ${entries.map(([tag, sec]) => {
      const color = _tagColor(tag);
      return `<div class="tag-chart__row">
        <span class="tag-chart__label">
          <span class="tag-chart__dot" style="background:${color}"></span>${escapeHtml(tag)}
        </span>
        <div class="tag-chart__bar-wrap">
          <div class="tag-chart__bar" style="width:${Math.round(sec / maxSec * 100)}%;background:${color}"></div>
        </div>
        <span class="tag-chart__val">${fmtDuration(sec)}</span>
      </div>`;
    }).join('')}
  `;
}

// ==================================================
// タスク別集計チャート
// ==================================================

/** タスク名別集計を描画 */
function _renderTaskChart() {
  const el = document.getElementById('task-chart');
  if (!el) return;

  const taskMap = {};
  State.sessions.forEach(s => {
    const key = s.task_name || '（未設定）';
    taskMap[key] = (taskMap[key] || 0) + s.duration_sec;
  });
  // 上位10件まで表示
  const entries = Object.entries(taskMap).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const maxSec  = entries.length ? entries[0][1] : 1;

  if (!entries.length || (entries.length === 1 && entries[0][0] === '（未設定）')) {
    el.hidden = true;
    return;
  }

  el.hidden = false;
  el.innerHTML = `
    <div class="tag-chart__title">タスク別集計</div>
    ${entries.map(([task, sec]) => `
      <div class="tag-chart__row">
        <span class="tag-chart__label">${escapeHtml(task)}</span>
        <div class="tag-chart__bar-wrap">
          <div class="tag-chart__bar tag-chart__bar--task" style="width:${Math.round(sec / maxSec * 100)}%"></div>
        </div>
        <span class="tag-chart__val">${fmtDuration(sec)}</span>
      </div>
    `).join('')}
  `;
}

// ==================================================
// 曜日別パターンチャート
// ==================================================

/** 曜日別の平均作業時間を描画 */
function _renderWeekdayChart() {
  const el = document.getElementById('weekday-chart');
  if (!el) return;

  // today ビューでは非表示
  if (State.historyView === 'today') { el.hidden = true; return; }

  const DAY_NAMES   = ['日', '月', '火', '水', '木', '金', '土'];
  const totalByDow  = [0, 0, 0, 0, 0, 0, 0]; // 曜日ごとの合計秒
  const countByDow  = [0, 0, 0, 0, 0, 0, 0]; // 曜日ごとの記録日数

  // 期間内の日付ごとに集計
  const dateList = _getDateList();
  const byDate   = {};
  State.sessions.forEach(s => {
    const d = s.started_at.slice(0, 10);
    byDate[d] = (byDate[d] || 0) + s.duration_sec;
  });

  dateList.forEach(d => {
    if (byDate[d]) {
      const dow = new Date(d).getDay();
      totalByDow[dow] += byDate[d];
      countByDow[dow]++;
    }
  });

  const avgByDow = totalByDow.map((total, i) =>
    countByDow[i] > 0 ? Math.round(total / countByDow[i]) : 0
  );
  const maxAvg = Math.max(...avgByDow, 1);
  const hasData = avgByDow.some(v => v > 0);

  if (!hasData) { el.hidden = true; return; }

  el.hidden = false;
  el.innerHTML = `
    <div class="tag-chart__title">曜日別平均</div>
    ${DAY_NAMES.map((day, i) => {
      const avg = avgByDow[i];
      const pct = Math.round(avg / maxAvg * 100);
      return `<div class="tag-chart__row">
        <span class="tag-chart__label">${day}曜</span>
        <div class="tag-chart__bar-wrap">
          <div class="tag-chart__bar tag-chart__bar--weekday" style="width:${pct}%"></div>
        </div>
        <span class="tag-chart__val">${avg > 0 ? fmtDuration(avg) : '—'}</span>
      </div>`;
    }).join('')}
  `;
}

// ==================================================
// セッション一覧
// ==================================================

/** セッション一覧を描画（複数日表示時は日付区切りを挿入） */
function _renderLogList() {
  const logList = document.getElementById('log-list');
  if (!logList) return;

  const sorted = [...State.sessions].sort((a, b) => b.started_at.localeCompare(a.started_at));
  if (!sorted.length) {
    logList.innerHTML = '<div class="log-empty">この期間のセッションはありません</div>';
    return;
  }

  const showDateSep = State.historyView !== 'today';
  const DAY_NAMES   = ['日', '月', '火', '水', '木', '金', '土'];
  let lastDate = '';

  logList.innerHTML = sorted.map(s => {
    const dateStr = s.started_at.slice(0, 10);
    let sep = '';
    if (showDateSep && dateStr !== lastDate) {
      lastDate = dateStr;
      const dow = DAY_NAMES[new Date(dateStr).getDay()];
      sep = `<div class="log-date-sep">${dateStr}（${dow}）</div>`;
    }
    const tagHtml = s.tag ? (() => {
      const c = _tagColor(s.tag);
      return `<span class="log-item__tag" style="background:${c}1a;color:${c}">${escapeHtml(s.tag)}</span>`;
    })() : '';
    return `${sep}<div class="log-item" data-id="${s.id}">
      <div class="log-item__main">
        <span class="log-item__task">${escapeHtml(s.task_name)}</span>
        ${tagHtml}
      </div>
      <div class="log-item__meta">
        <span class="log-item__time">${fmtDuration(s.duration_sec)}</span>
        <span class="log-item__start">${toHHMM(s.started_at)}</span>
        <button class="log-delete-btn icon-btn" data-id="${s.id}" title="削除">${Icons.close}</button>
      </div>
    </div>`;
  }).join('');
}
