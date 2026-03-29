'use strict';

// ==================================================
// アプリ初期化・グローバルイベントハンドラ
// ==================================================

// DOM 構築
document.addEventListener("DOMContentLoaded", async () => {
  const config = await loadTabConfig();
  buildShell(config);
  buildSettingsPanel();
  _initThemeToggle();

  // ナビゲーションショートカット定義（親フレームから iframe へ転送用）
  _navShortcutCategories = [
    {
      name: 'ナビゲーション',
      shortcuts: [
        { keys: ['Ctrl', 'K'], description: '検索バーにフォーカス' },
        { keys: ['Ctrl', '1~9'], description: 'タブ N に切替' },
        { keys: ['Ctrl', ','], description: 'タブ設定 / ページ設定' },
        { keys: ['Ctrl', 'Shift', 'E'], description: '全データ一括バックアップ' },
      ],
    },
  ];

  // 古いアクティビティログをクリーンアップ（90日以上前）
  ActivityDB.cleanup(90).catch(() => {});

  // 前回のアクティブタブを復元（なければデフォルト）
  const savedId = loadFromStorage(STORAGE_KEY_ACTIVE_TAB_ID);
  const visibleConfig = config.filter(t => t.visible);
  const defaultTab = visibleConfig.find(t => TAB_ITEMS.some(ti => ti.label === t.label && ti.isSelected))
    ?? visibleConfig[0];
  const targetId = (savedId && document.getElementById(savedId))
    ? savedId
    : `TAB-${defaultTab?.label}`;
  activateTab(targetId);
});

// ナビゲーションショートカット定義（DOMContentLoaded 内でセット）
let _navShortcutCategories = [];

// グローバルキーボードショートカット
document.addEventListener('keydown', (e) => {
  // ?: ショートカット一覧をアクティブ iframe に転送して表示
  if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
    const tag = document.activeElement?.tagName?.toLowerCase();
    if (!['input', 'textarea', 'select'].includes(tag) && !document.activeElement?.isContentEditable) {
      e.preventDefault();
      const activeFrame = document.querySelector('.tab-frame--active');
      if (activeFrame?.contentWindow) {
        activeFrame.contentWindow.postMessage({
          type: 'show-shortcut-help',
          categories: _navShortcutCategories,
        }, '*');
      }
      return;
    }
  }

  // Escape: タブ設定パネルを閉じる / ショートカット一覧を閉じる（iframe に転送）
  if (e.key === 'Escape') {
    const overlay = document.getElementById('settings-overlay');
    if (overlay && !overlay.hidden) {
      closeSettings();
      return;
    }
    const activeFrame = document.querySelector('.tab-frame--active');
    if (activeFrame?.contentWindow) {
      activeFrame.contentWindow.postMessage({ type: 'hide-shortcut-help' }, '*');
    }
  }

  // Ctrl+K / Cmd+K: グローバル検索にフォーカス
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    const input = document.getElementById('global-search-input');
    if (input) { input.focus(); input.select(); }
    return;
  }

  // Ctrl+1~9: タブ N に切替
  if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '9') {
    e.preventDefault();
    const tabs = document.querySelectorAll('.tab-btn');
    const idx = parseInt(e.key, 10) - 1;
    if (idx < tabs.length) {
      const tabId = tabs[idx].htmlFor;
      activateTab(tabId);
      saveToStorage(STORAGE_KEY_ACTIVE_TAB_ID, tabId);
    }
    return;
  }

  // Ctrl+, : 設定パネル開閉
  if ((e.ctrlKey || e.metaKey) && e.key === ',') {
    e.preventDefault();
    const overlay = document.getElementById('settings-overlay');
    if (overlay && !overlay.hidden) closeSettings();
    else openSettings();
    return;
  }

  // Ctrl+Shift+E: 全データ一括バックアップ
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'E') {
    e.preventDefault();
    if (typeof backupAllData === 'function') backupAllData();
    return;
  }
});

// ==================================================
// ページ間ナビゲーション: iframe からの要求を中継
// ==================================================
window.addEventListener('message', async (e) => {
  const { type, noteTaskId, todoTaskId } = e.data || {};

  // グローバル検索結果の集約
  if (type === 'global-search-result') {
    const { searchId, page, pageSrc: resultPageSrc, results } = e.data;
    _onGlobalSearchResult(searchId, page, resultPageSrc, results || []);
    return;
  }

  if (type !== 'navigate:note' && type !== 'navigate:todo') return;

  const config  = await loadTabConfig();
  const pageSrc = type === 'navigate:note' ? 'pages/note.html' : 'pages/todo.html';
  const tab     = config.find(t => t.visible && t.pageSrc === pageSrc);
  if (!tab) return;

  // タブを切り替え
  const tabId = `TAB-${tab.label}`;
  activateTab(tabId);
  saveToStorage(STORAGE_KEY_ACTIVE_TAB_ID, tabId);

  // 対象 iframe にメッセージを転送
  const iframe = document.getElementById(`frame-${tab.label}`);
  if (!iframe) return;
  const msg     = type === 'navigate:note'
    ? { type: 'navigate:note', noteTaskId }
    : { type: 'navigate:todo', todoTaskId };
  const sendMsg = () => iframe.contentWindow?.postMessage(msg, '*');
  // contentDocument が null の場合（file:// でのセキュリティ制限等）も即時送信する
  // ロード済み iframe では load イベントが再発火しないため、null を完了済み扱いにする
  const doc = iframe.contentDocument;
  if (!doc || doc.readyState === 'complete') {
    sendMsg();
  } else {
    iframe.addEventListener('load', sendMsg, { once: true });
  }
});
