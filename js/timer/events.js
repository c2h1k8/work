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
  // 一時停止中の場合、現在の一時停止時間も累積に含めて保存する
  let pausedDurationSec = State.pausedDurationSec;
  if (!State.running && State.pauseStartedAt !== null) {
    pausedDurationSec += Math.floor((Date.now() - State.pauseStartedAt) / 1000);
  }
  saveToStorage(TIMER_RUNNING_STATE_KEY, JSON.stringify({
    activePresetId: State.activePresetId,
    mode: State.mode,
    remaining: State.remaining,
    total: State.total,
    running: State.running,
    taskName: State.taskName,
    tag: State.tag,
    sessionStartTime: State.sessionStartTime,
    pausedDurationSec,
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
    State.pausedDurationSec = data.pausedDurationSec || 0;
    State.pauseStartedAt = null;

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
    // 一時停止中だった（保存時に現在の停止時間も累積済みなので、新たな停止開始時刻をセット）
    State.remaining = data.remaining;
    State.pausedDurationSec = data.pausedDurationSec || 0;
    State.pauseStartedAt = Date.now();
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
  State.pausedDurationSec = 0;
  State.pauseStartedAt = null;
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

  // ユーザー操作のタイミングでAudioContextを事前resume（Tauri/WKWebView対応）
  warmUpAudio();

  State.running = true;
  if (State.mode === 'work' && !State.sessionStartTime) {
    // 初回開始: セッション開始時刻をセットし、一時停止時間をリセット
    State.sessionStartTime = new Date().toISOString();
    State.pausedDurationSec = 0;
    State.pauseStartedAt = null;
  } else if (State.pauseStartedAt !== null) {
    // 一時停止からの再開: 停止していた時間を累積して停止時刻をクリア
    State.pausedDurationSec += Math.floor((Date.now() - State.pauseStartedAt) / 1000);
    State.pauseStartedAt = null;
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
  // 一時停止開始時刻を記録（再開時に停止時間を累積するため）
  State.pauseStartedAt = Date.now();
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
  State.pausedDurationSec = 0;
  State.pauseStartedAt = null;
  updateTimerUI();
  updateControlUI();
  document.title = '定型作業タイマー';
  _saveTimerState();
}

/** 作業を途中で終了してセッションを記録 */
async function endTimer() {
  // 先にタイマーを停止してワーカーとの競合を防ぐ
  stopTimer();
  if (State.mode === 'work' && State.sessionStartTime) {
    // タスク名・タグを最新の入力値で更新してから保存
    State.taskName = document.getElementById('timer-task-name').value.trim();
    State.tag      = document.getElementById('timer-tag').value.trim();
    // 明示的な終了なので最小時間を 1 秒に下げる
    const saved = await saveSession({ minDuration: 1 });
    if (saved) showSuccess('作業を終了して記録しました');
  }
  State.mode = 'work';
  const preset = getActivePreset();
  if (preset) {
    State.remaining = preset.work_sec;
    State.total     = preset.work_sec;
  }
  State.sessionStartTime = null;
  State.pausedDurationSec = 0;
  State.pauseStartedAt = null;
  updateTimerUI();
  updateControlUI();
  document.title = '定型作業タイマー';
  _clearTimerState();
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
  State.pausedDurationSec = 0;
  State.pauseStartedAt = null;
  updateTimerUI();
  updateControlUI();
  _saveTimerState();
}

/**
 * 作業セッションをDBに保存
 * @param {object} [opts]
 * @param {number} [opts.minDuration=5] - 保存する最小秒数。明示的終了時は 1 を渡す
 * @returns {Promise<boolean>} 保存できた場合 true
 */
async function saveSession({ minDuration = 5 } = {}) {
  if (!State.sessionStartTime) return false;
  const endTime = new Date().toISOString();
  const startTime = State.sessionStartTime;
  const wallSec = Math.round((new Date(endTime) - new Date(startTime)) / 1000);
  // 一時停止していた時間を除いた実作業時間
  const durationSec = Math.max(0, wallSec - State.pausedDurationSec);
  if (durationSec < minDuration) return false;

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
    // 表示中の期間に含まれる場合はリストに追加
    if (_isInCurrentView(startTime.slice(0, 10))) {
      State.sessions.push(saved);
    }
    // ストリーク・今日の合計を再計算
    const allSessions = await State.db.getAllSessions();
    _updateAnalyticsState(allSessions);
    renderLog();
    return true;
  } catch (err) {
    console.error('セッション保存エラー:', err);
    showError('記録の保存に失敗しました');
    return false;
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
// セッション読み込み・分析集計
// ==================================================

/**
 * 指定日付が現在の表示期間に含まれるか判定する
 * @param {string} dateStr - YYYY-MM-DD
 */
function _isInCurrentView(dateStr) {
  const today = toDateStr(new Date());
  const now   = new Date();

  if (State.historyView === 'today') return dateStr === today;

  if (State.historyView === 'week') {
    const dow = now.getDay() || 7;
    const mon = new Date(now);
    mon.setDate(now.getDate() - (dow - 1));
    return dateStr >= toDateStr(mon) && dateStr <= today;
  }

  if (State.historyView === 'month') {
    const from = toDateStr(new Date(now.getFullYear(), now.getMonth(), 1));
    return dateStr >= from && dateStr <= today;
  }

  if (State.historyView === 'last-month') {
    const from = toDateStr(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const to   = toDateStr(new Date(now.getFullYear(), now.getMonth(), 0));
    return dateStr >= from && dateStr <= to;
  }

  if (State.historyView === 'custom') {
    return !!(State.customFrom && State.customTo &&
      dateStr >= State.customFrom && dateStr <= State.customTo);
  }

  return false;
}

/**
 * 連続達成日数を計算する
 * @param {Array}  sessions  - 全セッション配列
 * @param {number} goalSec   - 1日の目標秒数（0 = 記録があれば達成とみなす）
 */
function _computeStreak(sessions, goalSec) {
  // 日別に合計秒数を集計
  const byDate = {};
  sessions.forEach(s => {
    const d = s.started_at.slice(0, 10);
    byDate[d] = (byDate[d] || 0) + s.duration_sec;
  });

  const threshold = goalSec > 0 ? goalSec : 1; // 1秒でも記録があれば達成
  const cur       = new Date();
  const todayStr  = toDateStr(cur);

  // 今日が未達の場合は昨日から遡る（今日はまだ進行中の可能性があるため）
  if ((byDate[todayStr] || 0) < threshold) {
    cur.setDate(cur.getDate() - 1);
  }

  let streak = 0;
  while (streak < 1000) { // 無限ループ防止
    const d = toDateStr(cur);
    if ((byDate[d] || 0) >= threshold) {
      streak++;
      cur.setDate(cur.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

/**
 * 全セッションから分析用 State を更新する
 * @param {Array} allSessions
 */
function _updateAnalyticsState(allSessions) {
  const today = toDateStr(new Date());
  State.streakDays = _computeStreak(allSessions, State.dailyGoalSec);
  State.todayTotalSec = allSessions
    .filter(s => s.started_at.slice(0, 10) === today)
    .reduce((sum, s) => sum + (s.duration_sec || 0), 0);
}

/** 表示期間のセッションを読み込む */
async function loadSessions() {
  const today = toDateStr(new Date());
  const now   = new Date();

  if (State.historyView === 'today') {
    State.sessions = await State.db.getSessionsByDate(today);
  } else if (State.historyView === 'week') {
    const dow = now.getDay() || 7;
    const mon = new Date(now);
    mon.setDate(now.getDate() - (dow - 1));
    State.sessions = await State.db.getSessionsInRange(toDateStr(mon), today);
  } else if (State.historyView === 'month') {
    const from = toDateStr(new Date(now.getFullYear(), now.getMonth(), 1));
    State.sessions = await State.db.getSessionsInRange(from, today);
  } else if (State.historyView === 'last-month') {
    const from = toDateStr(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const to   = toDateStr(new Date(now.getFullYear(), now.getMonth(), 0));
    State.sessions = await State.db.getSessionsInRange(from, to);
  } else if (State.historyView === 'custom') {
    if (State.customFrom && State.customTo) {
      State.sessions = await State.db.getSessionsInRange(State.customFrom, State.customTo);
    } else {
      State.sessions = [];
    }
  }

  // ストリーク・今日の合計を全セッションから計算、オートコンプリート用キャッシュを更新
  const allSessions = await State.db.getAllSessions();
  _updateAnalyticsState(allSessions);

  // タグ候補セット（全ユニークタグ）
  State._allTagSet = new Set(allSessions.map(s => s.tag).filter(Boolean));

  // タスク名候補（直近5件・ユニーク）
  const seen = new Set();
  State._recentTasks = allSessions
    .filter(s => s.task_name && s.task_name !== '（未設定）')
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .map(s => s.task_name)
    .filter(t => !seen.has(t) && seen.add(t))
    .slice(0, 5);
}

// ==================================================
// エクスポート/インポート（JSON）
// ==================================================

async function exportData() {
  try {
    const data = await State.db.exportAll();
    const json = JSON.stringify(data, null, 2);
    const saved = await FileSaver.save(json, `timer_${new Date().toISOString().slice(0, 10)}.json`);
    if (saved) showSuccess('エクスポートしました');
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
// CSV エクスポート
// ==================================================

/** 全セッションを CSV 形式でエクスポートする */
async function exportCSV() {
  try {
    const all = await State.db.getAllSessions();
    if (!all.length) { showError('エクスポートするデータがありません'); return; }

    const header = ['id', 'task_name', 'tag', 'duration_sec', 'duration_min', 'started_at', 'ended_at', 'notes'];
    const rows = all
      .sort((a, b) => a.started_at.localeCompare(b.started_at))
      .map(s => [
        s.id,
        `"${(s.task_name || '').replace(/"/g, '""')}"`,
        `"${(s.tag       || '').replace(/"/g, '""')}"`,
        s.duration_sec || 0,
        Math.round((s.duration_sec || 0) / 60),
        s.started_at || '',
        s.ended_at   || '',
        `"${(s.notes || '').replace(/"/g, '""')}"`,
      ].join(','));

    // UTF-8 BOM を付与して Excel でも文字化けしないようにする
    const bom  = '\uFEFF';
    const csv  = bom + [header.join(','), ...rows].join('\n');
    const name = `timer_sessions_${toDateStr(new Date())}.csv`;
    const saved = await FileSaver.save(csv, name, { mimeType: 'text/csv' });
    if (saved) showSuccess(`${all.length}件のセッションをエクスポートしました`);
  } catch (err) {
    console.error(err);
    showError('CSVエクスポートに失敗しました');
  }
}

// ==================================================
// タグオートコンプリート
// ==================================================

/**
 * 過去セッションのタグから候補を返す（大文字小文字無視、最大8件）
 * @param {string} query
 * @returns {string[]}
 */
function _getTagCandidates(query) {
  if (!State.db) return [];
  // State.sessions は表示期間のみのため、全セッションを使いたい
  // キャッシュとして State._allTagSet を利用する
  if (!State._allTagSet) return [];
  const q = query.toLowerCase();
  return [...State._allTagSet]
    .filter(t => t && t.toLowerCase().includes(q))
    .sort((a, b) => a.localeCompare(b, 'ja'))
    .slice(0, 8);
}

/**
 * 直近タスク名の候補を返す（最大5件）
 * @param {string} query - 空文字の場合は全件返す
 * @returns {string[]}
 */
function _getTaskCandidates(query) {
  if (!State._recentTasks || !State._recentTasks.length) return [];
  if (!query) return State._recentTasks;
  const q = query.toLowerCase();
  return State._recentTasks.filter(t => t.toLowerCase().includes(q));
}

/** タスク名オートコンプリートのセットアップ */
function _setupTaskAutocomplete() {
  const input       = document.getElementById('timer-task-name');
  const suggestions = document.getElementById('task-suggestions');
  if (!input || !suggestions) return;

  let activeIdx = -1;

  function _showSuggestions(candidates) {
    if (!candidates.length) { suggestions.hidden = true; return; }
    activeIdx = -1;
    suggestions.innerHTML = candidates.map(t =>
      `<li class="tag-suggestions__item" data-task="${escapeHtml(t)}">${escapeHtml(t)}</li>`
    ).join('');
    suggestions.hidden = false;
  }

  function _selectTask(task) {
    input.value = task;
    suggestions.hidden = true;
    activeIdx = -1;
    input.focus();
  }

  input.addEventListener('input', () => {
    _showSuggestions(_getTaskCandidates(input.value.trim()));
  });

  input.addEventListener('focus', () => {
    _showSuggestions(_getTaskCandidates(input.value.trim()));
  });

  input.addEventListener('keydown', e => {
    if (suggestions.hidden) return;
    const items = [...suggestions.querySelectorAll('.tag-suggestions__item')];
    if (!items.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIdx = Math.min(activeIdx + 1, items.length - 1);
      items.forEach((el, i) => el.classList.toggle('tag-suggestions__item--active', i === activeIdx));
      if (activeIdx >= 0) input.value = items[activeIdx].dataset.task;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIdx = Math.max(activeIdx - 1, -1);
      items.forEach((el, i) => el.classList.toggle('tag-suggestions__item--active', i === activeIdx));
      if (activeIdx >= 0) input.value = items[activeIdx].dataset.task;
    } else if (e.key === 'Enter' && !e.isComposing) {
      if (activeIdx >= 0) { e.preventDefault(); _selectTask(items[activeIdx].dataset.task); }
    } else if (e.key === 'Escape') {
      suggestions.hidden = true;
      activeIdx = -1;
    }
  });

  suggestions.addEventListener('mousedown', e => {
    const item = e.target.closest('.tag-suggestions__item');
    if (!item) return;
    e.preventDefault();
    _selectTask(item.dataset.task);
  });

  input.addEventListener('blur', () => {
    setTimeout(() => { suggestions.hidden = true; activeIdx = -1; }, 150);
  });
}

/** タグオートコンプリートのセットアップ */
function _setupTagAutocomplete() {
  const input       = document.getElementById('timer-tag');
  const suggestions = document.getElementById('tag-suggestions');
  if (!input || !suggestions) return;

  let activeIdx = -1;

  // 候補リストを描画する（タグ名 + 色ドット）
  function _showSuggestions(candidates) {
    if (!candidates.length) { suggestions.hidden = true; return; }
    activeIdx = -1;
    suggestions.innerHTML = candidates.map(t => {
      const color = _tagColor(t);
      return `<li class="tag-suggestions__item" data-tag="${escapeHtml(t)}">
        <span class="suggestions__dot" style="background:${color}"></span>${escapeHtml(t)}
      </li>`;
    }).join('');
    suggestions.hidden = false;
  }

  // 候補を選択して入力欄に反映する
  function _selectTag(tag) {
    input.value = tag;
    suggestions.hidden = true;
    activeIdx = -1;
    input.focus();
  }

  // 入力イベント: 候補を絞り込む
  input.addEventListener('input', () => {
    const q = input.value.trim();
    if (!q) { suggestions.hidden = true; return; }
    _showSuggestions(_getTagCandidates(q));
  });

  // フォーカス時: 既存値があれば候補を表示
  input.addEventListener('focus', () => {
    const q = input.value.trim();
    if (q) _showSuggestions(_getTagCandidates(q));
  });

  // キーボード操作: ↑↓で選択、Enterで確定、Escapeで閉じる
  input.addEventListener('keydown', e => {
    if (suggestions.hidden) return;
    const items = [...suggestions.querySelectorAll('.tag-suggestions__item')];
    if (!items.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIdx = Math.min(activeIdx + 1, items.length - 1);
      items.forEach((el, i) => el.classList.toggle('tag-suggestions__item--active', i === activeIdx));
      if (activeIdx >= 0) input.value = items[activeIdx].dataset.tag;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIdx = Math.max(activeIdx - 1, -1);
      items.forEach((el, i) => el.classList.toggle('tag-suggestions__item--active', i === activeIdx));
      if (activeIdx >= 0) input.value = items[activeIdx].dataset.tag;
    } else if (e.key === 'Enter' && !e.isComposing) {
      if (activeIdx >= 0) {
        e.preventDefault();
        _selectTag(items[activeIdx].dataset.tag);
      }
    } else if (e.key === 'Escape') {
      suggestions.hidden = true;
      activeIdx = -1;
    }
  });

  // クリックで選択
  suggestions.addEventListener('mousedown', e => {
    const item = e.target.closest('.tag-suggestions__item');
    if (!item) return;
    e.preventDefault(); // blur を防ぐ
    _selectTag(item.dataset.tag);
  });

  // フォーカスアウトで閉じる
  input.addEventListener('blur', () => {
    // mousedown の preventDefault により blur 前にクリック処理が走るため少し遅延
    setTimeout(() => { suggestions.hidden = true; activeIdx = -1; }, 150);
  });
}

// ==================================================
// イベントリスナー登録
// ==================================================

function setupEvents() {
  // タイマー操作ボタン
  document.getElementById('start-pause-btn').addEventListener('click', () => {
    State.running ? pauseTimer() : startTimer();
  });

  document.getElementById('end-btn').addEventListener('click', () => endTimer());
  document.getElementById('skip-btn').addEventListener('click', () => skipPhase());
  document.getElementById('reset-btn').addEventListener('click', () => {
    if (State.running) pauseTimer();
    State.mode  = 'work';
    State.sessionStartTime = null;
    resetTimer();
    updateControlUI();
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

    // カスタム期間入力の表示/非表示
    const customRange = document.getElementById('custom-range');
    if (customRange) customRange.hidden = State.historyView !== 'custom';

    if (State.historyView !== 'custom') {
      await loadSessions();
      renderLog();
    }
  });

  // カスタム期間: 開始日 DatePicker
  document.getElementById('custom-from-btn')?.addEventListener('click', () => {
    DatePicker.open(State.customFrom || '', (dateStr) => {
      State.customFrom = dateStr;
      saveToStorage(TIMER_CUSTOM_FROM_KEY, dateStr);
      const lbl = document.getElementById('custom-from-label');
      if (lbl) lbl.textContent = dateStr;
    }, async () => {
      State.customFrom = '';
      saveToStorage(TIMER_CUSTOM_FROM_KEY, '');
      const lbl = document.getElementById('custom-from-label');
      if (lbl) lbl.textContent = '開始日';
      // 日付クリア後はセッションをリセットして再描画
      await loadSessions();
      renderLog();
    });
  });

  // カスタム期間: 終了日 DatePicker
  document.getElementById('custom-to-btn')?.addEventListener('click', () => {
    DatePicker.open(State.customTo || '', (dateStr) => {
      State.customTo = dateStr;
      saveToStorage(TIMER_CUSTOM_TO_KEY, dateStr);
      const lbl = document.getElementById('custom-to-label');
      if (lbl) lbl.textContent = dateStr;
    }, async () => {
      State.customTo = '';
      saveToStorage(TIMER_CUSTOM_TO_KEY, '');
      const lbl = document.getElementById('custom-to-label');
      if (lbl) lbl.textContent = '終了日';
      // 日付クリア後はセッションをリセットして再描画
      await loadSessions();
      renderLog();
    });
  });

  // カスタム期間 適用ボタン
  document.getElementById('custom-apply-btn')?.addEventListener('click', async () => {
    const from = State.customFrom;
    const to   = State.customTo;
    if (!from || !to) { showError('開始日と終了日を選択してください'); return; }
    if (from > to)    { showError('開始日は終了日より前を指定してください'); return; }
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
      // ストリーク・今日合計を再計算
      const allSessions = await State.db.getAllSessions();
      _updateAnalyticsState(allSessions);
      renderLog();
    } catch (err) {
      console.error(err);
      showError('削除に失敗しました');
    }
  });

  // 目標時間セレクト（goal-stats 内のイベント委譲）
  document.getElementById('goal-stats').addEventListener('change', async e => {
    const sel = e.target.closest('#goal-select');
    if (!sel) return;
    State.dailyGoalSec = Number(sel.value);
    saveToStorage(TIMER_DAILY_GOAL_KEY, String(State.dailyGoalSec));
    // ストリーク再計算して再描画
    const allSessions = await State.db.getAllSessions();
    _updateAnalyticsState(allSessions);
    renderLog();
  });

  // タスク名・タグ入力オートコンプリート
  _setupTaskAutocomplete();
  _setupTagAutocomplete();

  // エクスポート/インポート（JSON）
  document.getElementById('export-btn').addEventListener('click', exportData);
  document.getElementById('import-btn').addEventListener('click', importData);

  // CSV エクスポート
  document.getElementById('csv-export-btn')?.addEventListener('click', exportCSV);

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
      updateControlUI();
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
