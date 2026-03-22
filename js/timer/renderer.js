'use strict';

// ==================================================
// 定型作業タイマー — 描画
// タイマーUI、操作ボタン、プリセット一覧、ログ、
// プリセットモーダルの描画を担当
// ==================================================

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
// ログ UI
// ==================================================

/** ログセクションを描画 */
function renderLog() {
  const logList  = document.getElementById('log-list');
  const logTotal = document.getElementById('log-total');
  const tagChart = document.getElementById('tag-chart');
  if (!logList) return;

  // 合計時間
  const totalSec = State.sessions.reduce((sum, s) => sum + (s.duration_sec || 0), 0);
  if (logTotal) logTotal.textContent = `合計: ${fmtDuration(totalSec)}`;

  // セッション一覧（新しい順）
  const sorted = [...State.sessions].sort((a, b) => b.started_at.localeCompare(a.started_at));
  if (!sorted.length) {
    logList.innerHTML = '<div class="log-empty">この期間のセッションはありません</div>';
  } else {
    logList.innerHTML = sorted.map(s => `
      <div class="log-item" data-id="${s.id}">
        <div class="log-item__main">
          <span class="log-item__task">${escapeHtml(s.task_name)}</span>
          ${s.tag ? `<span class="log-item__tag">${escapeHtml(s.tag)}</span>` : ''}
        </div>
        <div class="log-item__meta">
          <span class="log-item__time">${fmtDuration(s.duration_sec)}</span>
          <span class="log-item__start">${toHHMM(s.started_at)}</span>
          <button class="log-delete-btn icon-btn" data-id="${s.id}" title="削除">${Icons.close}</button>
        </div>
      </div>
    `).join('');
  }

  // タグ別集計
  if (tagChart) {
    const tagMap = {};
    State.sessions.forEach(s => {
      const key = s.tag || '（なし）';
      tagMap[key] = (tagMap[key] || 0) + s.duration_sec;
    });
    const entries = Object.entries(tagMap).sort((a, b) => b[1] - a[1]);
    const maxSec  = entries.length ? entries[0][1] : 1;

    if (!entries.length) {
      tagChart.innerHTML = '';
      tagChart.hidden = true;
    } else {
      tagChart.hidden = false;
      tagChart.innerHTML = `
        <div class="tag-chart__title">タグ別集計</div>
        ${entries.map(([tag, sec]) => `
          <div class="tag-chart__row">
            <span class="tag-chart__label">${escapeHtml(tag)}</span>
            <div class="tag-chart__bar-wrap">
              <div class="tag-chart__bar" style="width:${Math.round(sec / maxSec * 100)}%"></div>
            </div>
            <span class="tag-chart__val">${fmtDuration(sec)}</span>
          </div>
        `).join('')}
      `;
    }
  }
}
