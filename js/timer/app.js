'use strict';

// ==================================================
// 定型作業タイマー — アプリケーション初期化
// デフォルトプリセット定義、init()、DOMContentLoaded
// ==================================================

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

  // ツールチップ初期化
  Tooltip.init(document.body);

  // ショートカットキー一覧登録
  ShortcutHelp.register([
    { name: 'ショートカット', shortcuts: [
      { keys: ['Space'], description: 'タイマー開始/停止' },
      { keys: ['R'], description: 'タイマーリセット' },
      { keys: ['Ctrl', '←'], description: '前のプリセット' },
      { keys: ['Ctrl', '→'], description: '次のプリセット' },
      { keys: ['Escape'], description: 'モーダルを閉じる' },
      { keys: ['?'], description: 'ショートカット一覧' },
    ]}
  ]);

  // イベント設定
  setupEvents();

  // 初期描画
  renderPresets();
  renderLog();
  resetTimer();
  updateControlUI();
}

document.addEventListener('DOMContentLoaded', init);
