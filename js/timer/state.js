'use strict';

// ==================================================
// 定型作業タイマー — 状態管理・ユーティリティ
// State オブジェクト、定数、フォーマットヘルパー、通知音
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
