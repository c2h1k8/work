'use strict';

// ==================================================
// ダークモード（テーマ切替）
// ==================================================

/** テーマを適用して全 iframe に伝播する */
function _applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  // 全 iframe にテーマを伝播
  document.querySelectorAll('.tab-frame').forEach(iframe => {
    try {
      iframe.contentWindow.postMessage({ type: 'theme-change', theme }, '*');
    } catch(e) {}
  });
}

/** テーマトグルボタンのクリックイベントを初期化する */
function _initThemeToggle() {
  const btn = document.getElementById('theme-toggle-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    _applyTheme(current === 'dark' ? 'light' : 'dark');
  });
}
