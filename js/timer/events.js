'use strict';

// ==================================================
// 定型作業タイマー — イベントハンドラ
// タイマー制御、通知、プリセットCRUD、エクスポート/インポート、
// イベントリスナー登録
// ==================================================

// ==================================================
// ブラウザ通知（Web Notifications API）
// ==================================================

/** 通知許可を要求する */
async function requestNotificationPermission() {
  const perm = Notify.getPermission();

  if (perm === 'unsupported') {
    showError('この環境は通知に対応していません');
    return;
  }
  if (perm === 'granted') {
    showSuccess('通知はすでに許可されています');
    _updateNotificationBadge();
    return;
  }
  if (perm === 'denied') {
    showError('通知がブロックされています。ブラウザのアドレスバー左のアイコン（🔒）から「通知」を「許可」に変更してください');
    _updateNotificationBadge();
    return;
  }

  // permission === 'default': ダイアログを表示
  const result = await Notify.requestPermission();
  _updateNotificationBadge();
  if (result === 'granted') {
    showSuccess('通知を許可しました');
    // テスト通知を送って確認
    sendNotification('通知テスト', 'タイマー終了時にこのような通知が届きます');
  } else if (result === 'denied') {
    showError('通知が拒否されました。ブラウザの設定から許可できます');
  } else if (result === 'unsupported') {
    showError('通知の許可に失敗しました。タイマーを直接開いて許可してください');
  } else {
    // iframe等でダイアログが出なかった場合（permissionが変わらない）
    showError('通知ダイアログが表示できませんでした。ブラウザのアドレスバーから直接許可してください');
  }
}

/** 通知許可状態バッジを更新 */
function _updateNotificationBadge() {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  const perm = Notify.getPermission();
  if (perm === 'unsupported') {
    badge.hidden = true;
    return;
  }
  badge.hidden = false;
  if (perm === 'granted') {
    badge.textContent = '🔔 通知ON';
    badge.className = 'notif-badge notif-badge--on';
  } else if (perm === 'denied') {
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
  Notify.send(title, body, {
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
// タイマー状態永続化（タブ破棄・リロード時の復元用）
// ==================================================

/** タイマーの実行状態を localStorage に保存する */
function _saveTimerState() {
  saveToStorage(TIMER_RUNNING_STATE_KEY, JSON.stringify({
    activePresetId: State.activePresetId,
    mode: State.mode,
    remaining: State.remaining,
    total: State.total,
    running: State.running,
    taskName: State.taskName,
    tag: State.tag,
    sessionStartTime: State.sessionStartTime,
    savedAt: Date.now(),
  }));
}

/** 保存済みタイマー状態をクリアする */
function _clearTimerState() {
  localStorage.removeItem(TIMER_RUNNING_STATE_KEY);
}

/**
 * タイマーの実行状態を localStorage から復元する。
 * タブ破棄からの復帰時に呼ばれる。復元した場合は true を返す。
 */
function _restoreTimerState() {
  const raw = loadFromStorage(TIMER_RUNNING_STATE_KEY);
  if (!raw) return false;
  _clearTimerState();

  let data;
  try { data = JSON.parse(raw); } catch (_) { return false; }
  if (!data?.savedAt) return false;

  // プリセットが変わっていたら復元しない
  if (data.activePresetId !== State.activePresetId) return false;

  // 完全にリセットされた状態（remaining === total で停止中）なら復元不要
  if (!data.running && data.remaining === data.total) return false;

  State.mode = data.mode || 'work';
  State.total = data.total || 0;
  State.sessionStartTime = data.sessionStartTime || null;
  State.taskName = data.taskName || '';
  State.tag = data.tag || '';

  // UI にタスク名・タグを反映
  const taskInput = document.getElementById('timer-task-name');
  const tagInput = document.getElementById('timer-tag');
  if (taskInput) taskInput.value = State.taskName;
  if (tagInput) tagInput.value = State.tag;

  if (data.running) {
    // 経過時間を計算して残り時間を補正
    const elapsed = Math.floor((Date.now() - data.savedAt) / 1000);
    State.remaining = Math.max(0, data.remaining - elapsed);

    if (State.remaining > 0) {
      updateTimerUI();
      startTimer();
    } else {
      // タイマーが完了していた → フェーズ終了処理
      State.remaining = 0;
      updateTimerUI();
      onPhaseEnd();
    }
  } else {
    // 一時停止中だった
    State.remaining = data.remaining;
    updateTimerUI();
    updateControlUI();
  }

  return true;
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
  _clearTimerState();
}

/** タイマーを開始 */
function startTimer() {
  if (State.running) return;
  if (!getActivePreset()) { showError('プリセットを選択してください'); return; }
  if (State.remaining <= 0) resetTimer();

  // 初回開始時: permission が default なら許可ダイアログを出す（denied/granted は何もしない）
  if (Notify.getPermission() === 'default') {
    requestNotificationPermission();
  }

  State.running = true;
  if (State.mode === 'work' && !State.sessionStartTime) {
    State.sessionStartTime = new Date().toISOString();
  }
  State.taskName = document.getElementById('timer-task-name').value.trim();
  State.tag      = document.getElementById('timer-tag').value.trim();

  // Worker が使える場合はバックグラウンドでも正確にカウントダウン
  if (State.worker) {
    State.worker.postMessage({ cmd: 'start', remaining: State.remaining });
  } else {
    // フォールバック: 壁時計時間ベースの setInterval
    const startedAt = Date.now();
    const startRemaining = State.remaining;
    State.intervalId = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      State.remaining = Math.max(0, startRemaining - elapsed);
      updateTimerUI();
      _saveTimerState();
      if (State.remaining <= 0) onPhaseEnd();
    }, 1000);
  }

  updateControlUI();
  _saveTimerState();
}

/** タイマーを一時停止 */
function pauseTimer() {
  if (!State.running) return;
  stopTimer();
  updateControlUI();
  _saveTimerState();
}

/** タイマーを停止 */
function stopTimer() {
  if (State.worker) {
    State.worker.postMessage({ cmd: 'stop' });
  }
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
    showSuccess('作業完了！休憩しましょう 🎉');
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
  _saveTimerState();
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
  _saveTimerState();
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
// プリセット CRUD
// ==================================================

/** プリセットを保存 */
async function savePreset() {
  const name     = document.getElementById('preset-name').value.trim();
  const workMin  = Number(document.getElementById('preset-work-min').value);
  const breakMin = Number(document.getElementById('preset-break-min').value);

  if (!name) { showError('プリセット名を入力してください'); return; }
  if (!workMin || workMin < 1)  { showError('作業時間は1分以上で入力してください'); return; }
  if (!breakMin || breakMin < 1) { showError('休憩時間は1分以上で入力してください'); return; }

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
      showSuccess('プリセットを更新しました');
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
      showSuccess('プリセットを追加しました');
    }

    closePresetModal();
    renderPresets();
  } catch (err) {
    console.error(err);
    showError('保存に失敗しました');
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
    showSuccess('削除しました');
    renderPresets();
  } catch (err) {
    console.error(err);
    showError('削除に失敗しました');
  }
}

// ==================================================
// セッション読み込み
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
    showSuccess('エクスポートしました');
  } catch (err) {
    console.error(err);
    showError('エクスポートに失敗しました');
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
      showSuccess('インポートしました');
    } catch (err) {
      console.error(err);
      showError('インポートに失敗しました');
    }
  };
  input.click();
}

// ==================================================
// イベントリスナー登録
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
      showError('削除に失敗しました');
    }
  });

  // エクスポート/インポート
  document.getElementById('export-btn').addEventListener('click', exportData);
  document.getElementById('import-btn').addEventListener('click', importData);

  // Web Worker の初期化（バックグラウンドでも正確にカウントダウン）
  State.worker = _createTimerWorker();
  if (State.worker) {
    State.worker.onmessage = (e) => {
      if (!State.running) return;
      State.remaining = e.data.remaining;
      updateTimerUI();
      _saveTimerState();
      if (State.remaining <= 0) onPhaseEnd();
    };
  }

  // キーボードショートカット
  document.addEventListener('keydown', e => {
    const isInInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable;
    // Escape: 入力中ならフォーカスを外す
    if (e.key === 'Escape' && isInInput && !e.isComposing) { e.target.blur(); return; }
    // モーダルが開いている場合はスキップ
    const presetModal = document.getElementById('preset-modal');
    if (presetModal && !presetModal.hidden) return;
    if (isInInput) return;

    // Space: タイマー開始/停止
    if (e.key === ' ') {
      e.preventDefault();
      State.running ? pauseTimer() : startTimer();
      return;
    }
    // R: タイマーリセット
    if (e.key === 'r' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      if (State.running) pauseTimer();
      State.mode = 'work';
      State.sessionStartTime = null;
      resetTimer();
      return;
    }
    // Ctrl+→ / Ctrl+←: 次/前のプリセット切替
    if ((e.ctrlKey || e.metaKey) && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      e.preventDefault();
      const idx = State.presets.findIndex(p => p.id === State.activePresetId);
      const next = e.key === 'ArrowRight' ? idx + 1 : idx - 1;
      if (next >= 0 && next < State.presets.length) {
        State.activePresetId = State.presets[next].id;
        saveToStorage(TIMER_ACTIVE_PRESET_KEY, String(State.activePresetId));
        if (!State.running) resetTimer();
        renderPresets();
      }
      return;
    }
  });

  // ページ非表示・アンロード時にタイマー状態を保存（タブ破棄対策）
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (State.running || State.remaining !== State.total)) {
      _saveTimerState();
    }
  });
  window.addEventListener('beforeunload', () => {
    if (State.running || State.remaining !== State.total) {
      _saveTimerState();
    }
  });

  // テーマ変更
  window.addEventListener('message', e => {
    if (e.data?.type === 'theme-change') {
      document.documentElement.setAttribute('data-theme', e.data.theme);
    }
  });
}
