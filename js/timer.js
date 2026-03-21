// ==================================================
// 定型作業タイマー メインスクリプト
// ==================================================

const showToast = (msg, type) => Toast.show(msg, type);

// ローカルストレージキー
const TIMER_ACTIVE_PRESET_KEY = 'timer_active_preset';
const TIMER_HISTORY_VIEW_KEY  = 'timer_history_view';

// タイマー状態
const State = {
  db: null,
  presets: [],
  sessions: [],            // 表示中の期間のセッション
  activePresetId: null,
  mode: 'work',            // 'work' | 'break'
  remaining: 0,            // 残り秒数
  total: 0,                // フェーズの合計秒数（進捗バー用）
  running: false,
  intervalId: null,
  taskName: '',
  tag: '',
  historyView: loadFromStorage(TIMER_HISTORY_VIEW_KEY) || 'today', // 'today' | 'week'
  editingPresetId: null,   // プリセットモーダル: null=新規
  sessionStartTime: null,  // 現在のセッション開始時刻
};

// ==================================================
// 時刻フォーマット
// ==================================================

/** 秒数を MM:SS 形式にフォーマット */
function fmtMMSS(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** 秒数を「1時間23分」形式にフォーマット */
function fmtDuration(sec) {
  if (sec < 60) return `${sec}秒`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}時間${m > 0 ? m + '分' : ''}`;
  return `${m}分`;
}

/** 日付を 'YYYY-MM-DD' 形式にフォーマット */
function toDateStr(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** ISO文字列から 'HH:MM' を取得 */
function toHHMM(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ==================================================
// 通知音（AudioContextで短いビープ）
// ==================================================

let _audioCtx = null;

/** 通知音を1回鳴らす */
function _playBeepOnce(frequency = 880, duration = 0.18, startOffset = 0) {
  try {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = _audioCtx.createOscillator();
    const gain = _audioCtx.createGain();
    osc.connect(gain);
    gain.connect(_audioCtx.destination);
    const t = _audioCtx.currentTime + startOffset;
    osc.frequency.setValueAtTime(frequency, t);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  } catch (_) {
    // AudioContext非対応環境は無視
  }
}

/** 通知音を3回鳴らす（気づきやすくするため） */
function playBeep() {
  _playBeepOnce(880, 0.18, 0.0);
  _playBeepOnce(880, 0.18, 0.3);
  _playBeepOnce(1047, 0.3,  0.6); // 最後だけ高音で締め
}

// ==================================================
// ブラウザ通知（Web Notifications API）
// ==================================================

/** 通知許可を要求する */
async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    showToast('このブラウザは通知に対応していません', 'error');
    return;
  }

  if (Notification.permission === 'granted') {
    showToast('通知はすでに許可されています', 'success');
    _updateNotificationBadge();
    return;
  }

  if (Notification.permission === 'denied') {
    showToast('通知がブロックされています。ブラウザのアドレスバー左のアイコン（🔒）から「通知」を「許可」に変更してください', 'error');
    _updateNotificationBadge();
    return;
  }

  // permission === 'default': ダイアログを表示
  try {
    const result = await Notification.requestPermission();
    _updateNotificationBadge();
    if (result === 'granted') {
      showToast('通知を許可しました', 'success');
      // テスト通知を送って確認
      sendNotification('通知テスト', 'タイマー終了時にこのような通知が届きます');
    } else if (result === 'denied') {
      showToast('通知が拒否されました。ブラウザの設定から許可できます', 'error');
    } else {
      // iframe等でダイアログが出なかった場合（permissionが変わらない）
      showToast('通知ダイアログが表示できませんでした。ブラウザのアドレスバーから直接許可してください', 'error');
    }
  } catch (err) {
    // iframeでブロックされた場合など
    showToast('通知の許可に失敗しました。タイマーを直接開いて許可してください', 'error');
    _updateNotificationBadge();
  }
}

/** 通知許可状態バッジを更新 */
function _updateNotificationBadge() {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  if (!('Notification' in window)) {
    badge.hidden = true;
    return;
  }
  badge.hidden = false;
  if (Notification.permission === 'granted') {
    badge.textContent = '🔔 通知ON';
    badge.className = 'notif-badge notif-badge--on';
  } else if (Notification.permission === 'denied') {
    badge.textContent = '🔕 通知OFF';
    badge.className = 'notif-badge notif-badge--off';
  } else {
    badge.textContent = '🔔 通知を許可';
    badge.className = 'notif-badge notif-badge--pending';
  }
}

/**
 * システム通知を送る
 * @param {string} title - 通知タイトル
 * @param {string} body  - 通知本文
 */
function sendNotification(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const n = new Notification(title, {
    body,
    icon: './favicon.svg',
    tag: 'timer-alert',      // 同じtagで上書きして重複させない
    requireInteraction: true, // ユーザーが閉じるまで通知を維持
  });
}

/** タイマーカードをフラッシュさせてUIで気づかせる */
function flashTimerCard() {
  const card = document.querySelector('.timer-section');
  if (!card) return;
  card.classList.add('timer-section--flash');
  setTimeout(() => card.classList.remove('timer-section--flash'), 2000);
}

// ==================================================
// タイマーロジック
// ==================================================

/** アクティブなプリセットを取得 */
function getActivePreset() {
  return State.presets.find(p => p.id === State.activePresetId) || State.presets[0] || null;
}

/** タイマーをリセット（現在のフェーズの秒数にセット） */
function resetTimer() {
  stopTimer();
  const preset = getActivePreset();
  if (!preset) return;
  State.remaining = State.mode === 'work' ? preset.work_sec : preset.break_sec;
  State.total     = State.remaining;
  State.sessionStartTime = null;
  updateTimerUI();
  document.title = '定型作業タイマー';
}

/** タイマーを開始 */
function startTimer() {
  if (State.running) return;
  if (!getActivePreset()) { showToast('プリセットを選択してください', 'error'); return; }
  if (State.remaining <= 0) resetTimer();

  // 初回開始時: permission が default なら許可ダイアログを出す（denied/granted は何もしない）
  if ('Notification' in window && Notification.permission === 'default') {
    requestNotificationPermission();
  }

  State.running = true;
  if (State.mode === 'work' && !State.sessionStartTime) {
    State.sessionStartTime = new Date().toISOString();
  }
  State.taskName = document.getElementById('timer-task-name').value.trim();
  State.tag      = document.getElementById('timer-tag').value.trim();

  State.intervalId = setInterval(() => {
    State.remaining--;
    updateTimerUI();
    if (State.remaining <= 0) onPhaseEnd();
  }, 1000);

  updateControlUI();
}

/** タイマーを一時停止 */
function pauseTimer() {
  if (!State.running) return;
  stopTimer();
  updateControlUI();
}

/** タイマーを停止（インターバルのみ） */
function stopTimer() {
  if (State.intervalId) {
    clearInterval(State.intervalId);
    State.intervalId = null;
  }
  State.running = false;
}

/** フェーズ終了時の処理 */
async function onPhaseEnd() {
  stopTimer();
  playBeep();
  flashTimerCard();

  if (State.mode === 'work') {
    // 作業セッションを保存
    await saveSession();
    // 休憩モードに切替
    State.mode = 'break';
    const taskLabel = State.taskName ? `「${State.taskName}」` : '';
    showToast('作業完了！休憩しましょう 🎉', 'success');
    sendNotification('⏰ 作業時間終了', `${taskLabel}お疲れ様でした！休憩しましょう。`);
  } else {
    // 作業モードに切替
    State.mode = 'work';
    showToast('休憩終了。作業を再開しましょう！', 'info');
    sendNotification('☕ 休憩終了', '作業を再開しましょう！');
  }

  const preset = getActivePreset();
  if (preset) {
    State.remaining = State.mode === 'work' ? preset.work_sec : preset.break_sec;
    State.total     = State.remaining;
  }
  State.sessionStartTime = null;
  updateTimerUI();
  updateControlUI();
  document.title = '定型作業タイマー';
}

/** 次のフェーズにスキップ */
async function skipPhase() {
  if (State.mode === 'work' && State.sessionStartTime) {
    // 作業セッションを保存（中断）
    await saveSession();
  }
  stopTimer();
  State.mode = State.mode === 'work' ? 'break' : 'work';
  const preset = getActivePreset();
  if (preset) {
    State.remaining = State.mode === 'work' ? preset.work_sec : preset.break_sec;
    State.total     = State.remaining;
  }
  State.sessionStartTime = null;
  updateTimerUI();
  updateControlUI();
}

/** 作業セッションをDBに保存 */
async function saveSession() {
  if (!State.sessionStartTime) return;
  const preset = getActivePreset();
  const endTime = new Date().toISOString();
  const startTime = State.sessionStartTime;
  const durationSec = Math.round((new Date(endTime) - new Date(startTime)) / 1000);
  if (durationSec < 5) return; // 5秒未満は記録しない

  const session = {
    task_name:    State.taskName || '（未設定）',
    tag:          State.tag || '',
    notes:        '',
    duration_sec: durationSec,
    started_at:   startTime,
    ended_at:     endTime,
  };

  try {
    const saved = await State.db.addSession(session);
    // 表示中セッションリストを更新
    const today = toDateStr(new Date());
    if (startTime.slice(0, 10) === today || State.historyView === 'week') {
      State.sessions.push(saved);
    }
    renderLog();
  } catch (err) {
    console.error('セッション保存エラー:', err);
  }
}

// ==================================================
// UI 更新
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

/** プリセットを保存 */
async function savePreset() {
  const name     = document.getElementById('preset-name').value.trim();
  const workMin  = Number(document.getElementById('preset-work-min').value);
  const breakMin = Number(document.getElementById('preset-break-min').value);

  if (!name) { showToast('プリセット名を入力してください', 'error'); return; }
  if (!workMin || workMin < 1)  { showToast('作業時間は1分以上で入力してください', 'error'); return; }
  if (!breakMin || breakMin < 1) { showToast('休憩時間は1分以上で入力してください', 'error'); return; }

  try {
    const preset = {
      name,
      work_sec:  workMin  * 60,
      break_sec: breakMin * 60,
      position:  State.editingPresetId
        ? State.presets.find(x => x.id === State.editingPresetId)?.position ?? Date.now()
        : Date.now(),
    };

    if (State.editingPresetId) {
      preset.id = State.editingPresetId;
      await State.db.updatePreset(preset);
      const idx = State.presets.findIndex(x => x.id === State.editingPresetId);
      State.presets[idx] = preset;
      showToast('プリセットを更新しました', 'success');
      // アクティブプリセットが編集された場合はタイマーをリセット
      if (State.activePresetId === State.editingPresetId && !State.running) {
        resetTimer();
      }
    } else {
      const added = await State.db.addPreset(preset);
      State.presets.push(added);
      if (!State.activePresetId) {
        State.activePresetId = added.id;
        saveToStorage(TIMER_ACTIVE_PRESET_KEY, String(added.id));
        resetTimer();
      }
      showToast('プリセットを追加しました', 'success');
    }

    closePresetModal();
    renderPresets();
  } catch (err) {
    console.error(err);
    showToast('保存に失敗しました', 'error');
  }
}

/** プリセットを削除 */
async function deletePreset(id) {
  const p = State.presets.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`「${p.name}」を削除しますか？`)) return;

  try {
    await State.db.deletePreset(id);
    State.presets = State.presets.filter(x => x.id !== id);
    if (State.activePresetId === id) {
      State.activePresetId = State.presets[0]?.id || null;
      saveToStorage(TIMER_ACTIVE_PRESET_KEY, State.activePresetId ? String(State.activePresetId) : '');
      resetTimer();
    }
    showToast('削除しました', 'success');
    renderPresets();
  } catch (err) {
    console.error(err);
    showToast('削除に失敗しました', 'error');
  }
}

// ==================================================
// ログ UI
// ==================================================

/** 表示期間のセッションを読み込む */
async function loadSessions() {
  const today = toDateStr(new Date());
  if (State.historyView === 'today') {
    State.sessions = await State.db.getSessionsByDate(today);
  } else {
    // 今週の月曜日〜今日
    const now = new Date();
    const dow = now.getDay() || 7; // 日曜=7
    const mon = new Date(now);
    mon.setDate(now.getDate() - (dow - 1));
    State.sessions = await State.db.getSessionsInRange(toDateStr(mon), today);
  }
}

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

// ==================================================
// エクスポート/インポート
// ==================================================

async function exportData() {
  try {
    const data = await State.db.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `timer_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('エクスポートしました', 'success');
  } catch (err) {
    console.error(err);
    showToast('エクスポートに失敗しました', 'error');
  }
}

function importData() {
  const input  = document.createElement('input');
  input.type   = 'file';
  input.accept = '.json';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const text    = await file.text();
      const data    = JSON.parse(text);
      const replace = confirm('既存のデータをすべて削除してインポートしますか？\n「キャンセル」を押すと追記インポートします。');
      await State.db.importAll(data, replace);
      // プリセットを再ロード
      State.presets = await State.db.getPresets();
      if (!State.presets.some(p => p.id === State.activePresetId)) {
        State.activePresetId = State.presets[0]?.id || null;
      }
      await loadSessions();
      renderPresets();
      renderLog();
      resetTimer();
      showToast('インポートしました', 'success');
    } catch (err) {
      console.error(err);
      showToast('インポートに失敗しました', 'error');
    }
  };
  input.click();
}

// ==================================================
// イベント設定
// ==================================================

function setupEvents() {
  // タイマー操作ボタン
  document.getElementById('start-pause-btn').addEventListener('click', () => {
    State.running ? pauseTimer() : startTimer();
  });

  document.getElementById('skip-btn').addEventListener('click', () => skipPhase());
  document.getElementById('reset-btn').addEventListener('click', () => {
    if (State.running) pauseTimer();
    State.mode  = 'work';
    State.sessionStartTime = null;
    resetTimer();
  });

  // プリセット一覧（クリック・編集・削除）
  document.getElementById('preset-list').addEventListener('click', e => {
    const editBtn   = e.target.closest('.preset-edit-btn');
    const deleteBtn = e.target.closest('.preset-delete-btn');
    const card      = e.target.closest('.preset-card');

    if (editBtn) { e.stopPropagation(); openPresetModal(Number(editBtn.dataset.id)); return; }
    if (deleteBtn) { e.stopPropagation(); deletePreset(Number(deleteBtn.dataset.id)); return; }
    if (card) {
      const id = Number(card.dataset.id);
      State.activePresetId = id;
      saveToStorage(TIMER_ACTIVE_PRESET_KEY, String(id));
      if (!State.running) resetTimer();
      renderPresets();
    }
  });

  // プリセット追加ボタン
  document.getElementById('add-preset-btn').addEventListener('click', () => openPresetModal());

  // プリセットモーダル
  document.getElementById('preset-modal-cancel').addEventListener('click', closePresetModal);
  document.getElementById('preset-modal-save').addEventListener('click', savePreset);
  document.getElementById('preset-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closePresetModal();
  });
  document.getElementById('preset-modal').addEventListener('keydown', e => {
    if (e.key === 'Escape') closePresetModal();
  });

  // ログ期間タブ
  document.getElementById('log-tabs').addEventListener('click', async e => {
    const btn = e.target.closest('.log-tab-btn');
    if (!btn) return;
    State.historyView = btn.dataset.view;
    saveToStorage(TIMER_HISTORY_VIEW_KEY, State.historyView);
    document.querySelectorAll('.log-tab-btn').forEach(b => {
      b.classList.toggle('log-tab-btn--active', b.dataset.view === State.historyView);
    });
    await loadSessions();
    renderLog();
  });

  // ログ削除（イベント委譲）
  document.getElementById('log-list').addEventListener('click', async e => {
    const deleteBtn = e.target.closest('.log-delete-btn');
    if (!deleteBtn) return;
    const id = Number(deleteBtn.dataset.id);
    try {
      await State.db.deleteSession(id);
      State.sessions = State.sessions.filter(s => s.id !== id);
      renderLog();
    } catch (err) {
      console.error(err);
      showToast('削除に失敗しました', 'error');
    }
  });

  // エクスポート/インポート
  document.getElementById('export-btn').addEventListener('click', exportData);
  document.getElementById('import-btn').addEventListener('click', importData);

  // テーマ変更
  window.addEventListener('message', e => {
    if (e.data?.type === 'theme-change') {
      document.documentElement.setAttribute('data-theme', e.data.theme);
    }
  });
}

// ==================================================
// デフォルトプリセット
// ==================================================

const DEFAULT_PRESETS = [
  { name: 'ポモドーロ',     work_sec: 25 * 60, break_sec: 5  * 60, position: 1 },
  { name: '短いポモドーロ', work_sec: 15 * 60, break_sec: 3  * 60, position: 2 },
  { name: '長い集中',       work_sec: 50 * 60, break_sec: 10 * 60, position: 3 },
];

/** デフォルトプリセットを初期登録する */
async function ensureDefaultPresets() {
  if (State.presets.length) return;
  for (const p of DEFAULT_PRESETS) {
    const added = await State.db.addPreset(p);
    State.presets.push(added);
  }
}

// ==================================================
// 初期化
// ==================================================

async function init() {
  // DB を開く
  const db = new TimerDB();
  await db.open();
  State.db = db;

  // プリセットを読み込む
  State.presets = await db.getPresets();
  await ensureDefaultPresets();

  // アクティブプリセットを復元
  const savedPresetId = Number(loadFromStorage(TIMER_ACTIVE_PRESET_KEY));
  if (savedPresetId && State.presets.some(p => p.id === savedPresetId)) {
    State.activePresetId = savedPresetId;
  } else {
    State.activePresetId = State.presets[0]?.id || null;
    if (State.activePresetId) saveToStorage(TIMER_ACTIVE_PRESET_KEY, String(State.activePresetId));
  }

  // セッションを読み込む
  await loadSessions();

  // 初期UIセット
  document.querySelectorAll('.log-tab-btn').forEach(b => {
    b.classList.toggle('log-tab-btn--active', b.dataset.view === State.historyView);
  });

  // 通知バッジの初期表示
  _updateNotificationBadge();

  // 通知バッジクリックで許可ダイアログ
  document.getElementById('notif-badge')?.addEventListener('click', async () => {
    await requestNotificationPermission();
  });

  // イベント設定
  setupEvents();

  // 初期描画
  renderPresets();
  renderLog();
  resetTimer();
  updateControlUI();
}

document.addEventListener('DOMContentLoaded', init);
