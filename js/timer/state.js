'use strict';

// ==================================================
// 定型作業タイマー — 状態管理・ユーティリティ
// State オブジェクト、定数、フォーマットヘルパー、通知音
// ==================================================

const showToast = (msg, type) => Toast.show(msg, type);
const showSuccess = (msg) => Toast.success(msg);
const showError = (msg) => Toast.error(msg);

// ローカルストレージキー
const TIMER_ACTIVE_PRESET_KEY  = 'timer_active_preset';
const TIMER_HISTORY_VIEW_KEY   = 'timer_history_view';
const TIMER_RUNNING_STATE_KEY  = 'timer_running_state';
const TIMER_DAILY_GOAL_KEY     = 'timer_daily_goal';
const TIMER_CUSTOM_FROM_KEY    = 'timer_custom_from';
const TIMER_CUSTOM_TO_KEY      = 'timer_custom_to';

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
  intervalId: null,          // フォールバック用 setInterval ID
  worker: null,              // Web Worker インスタンス
  taskName: '',
  tag: '',
  historyView: loadFromStorage(TIMER_HISTORY_VIEW_KEY) || 'today', // 'today' | 'week' | 'month' | 'last-month' | 'custom'
  editingPresetId: null,   // プリセットモーダル: null=新規
  sessionStartTime: null,  // 現在のセッション開始時刻
  // 分析機能
  dailyGoalSec:  Number(loadFromStorage(TIMER_DAILY_GOAL_KEY))  || 0,   // 1日の目標秒数（0=未設定）
  customFrom:    loadFromStorage(TIMER_CUSTOM_FROM_KEY) || '',           // カスタム期間 開始日 YYYY-MM-DD
  customTo:      loadFromStorage(TIMER_CUSTOM_TO_KEY)   || '',           // カスタム期間 終了日 YYYY-MM-DD
  streakDays:    0,                                                       // 連続達成日数
  todayTotalSec: 0,                                                       // 今日の合計作業秒数（目標達成率用）
};

// ==================================================
// Web Worker（Blob インライン生成）
// バックグラウンドタブでもスロットリングされずに正確に動作
// ==================================================

/** タイマー用 Worker を生成。file:// 等で Worker 非対応なら null を返す */
function _createTimerWorker() {
  try {
    const code = `
      let iid = null;
      let startedAt = 0;
      let startRemaining = 0;
      self.onmessage = function(e) {
        if (e.data.cmd === 'start') {
          if (iid) clearInterval(iid);
          startedAt = Date.now();
          startRemaining = e.data.remaining;
          iid = setInterval(function() {
            var elapsed = Math.floor((Date.now() - startedAt) / 1000);
            var rem = Math.max(0, startRemaining - elapsed);
            self.postMessage({ remaining: rem });
            if (rem <= 0) { clearInterval(iid); iid = null; }
          }, 1000);
        } else if (e.data.cmd === 'stop') {
          if (iid) { clearInterval(iid); iid = null; }
        }
      };
    `;
    const blob = new Blob([code], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const w = new Worker(url);
    URL.revokeObjectURL(url);
    return w;
  } catch (_) {
    // file:// や Worker 非対応環境
    return null;
  }
}

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

/**
 * AudioContextを初期化・resumeする（ユーザー操作のタイミングで呼ぶとTauri/WKWebViewでも音が鳴る）
 * startTimer() から呼び出してコンテキストを事前ウォームアップする
 */
async function warmUpAudio() {
  try {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (_audioCtx.state === 'suspended') await _audioCtx.resume();
  } catch (_) {
    // AudioContext非対応環境は無視
  }
}

/** 通知音を3回鳴らす（気づきやすくするため） */
async function playBeep() {
  try {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    // Tauri/WKWebView では suspended のままになるため、明示的に resume する
    if (_audioCtx.state === 'suspended') await _audioCtx.resume();
  } catch (_) {
    // AudioContext非対応環境は無視
  }
  _playBeepOnce(880, 0.18, 0.0);
  _playBeepOnce(880, 0.18, 0.3);
  _playBeepOnce(1047, 0.3,  0.6); // 最後だけ高音で締め
}
