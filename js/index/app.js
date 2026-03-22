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

  // ショートカットキー登録（ナビゲーション共通）
  if (typeof ShortcutHelp !== 'undefined') {
    ShortcutHelp.register([
      {
        name: 'ナビゲーション',
        shortcuts: [
          { keys: ['Ctrl', 'K'], description: '検索バーにフォーカス' },
        ],
      },
    ]);
  }

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

// Ctrl+K / Cmd+K でグローバル検索にフォーカス
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    const input = document.getElementById('global-search-input');
    if (input) {
      input.focus();
      input.select();
    }
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
