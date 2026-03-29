// ==================================================
// opener: 環境対応URL開封ラッパー
// ==================================================
// Env.js に依存。Tauri ではネイティブ opener プラグインを使用

const Opener = (() => {
  /**
   * 外部URLをブラウザ/OSのデフォルトアプリで開く
   * @param {string} url - 開くURL
   * @returns {Promise<void>}
   */
  function open(url) {
    if (!url) return Promise.resolve();

    // Tauri: ネイティブ opener プラグイン
    if (Env.isTauri && window.__TAURI__?.opener?.openUrl) {
      return window.__TAURI__.opener.openUrl(url);
    }

    // ブラウザ: window.open
    window.open(url, '_blank');
    return Promise.resolve();
  }

  /**
   * Tauri 環境で <a target="_blank"> のクリックをインターセプトしてネイティブで開く
   * @param {Document|HTMLElement} root - イベント委譲のルート要素
   */
  function intercept(root) {
    if (!Env.isTauri) return;
    root.addEventListener('click', (e) => {
      const a = e.target.closest('a[target="_blank"]');
      if (a && a.href) {
        e.preventDefault();
        open(a.href);
      }
    });
  }

  return Object.freeze({ open, intercept });
})();
