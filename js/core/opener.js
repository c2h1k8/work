// ==================================================
// opener: 環境対応URL開封ラッパー
// ==================================================
// Env.js に依存。Tauri ではネイティブ opener プラグインを使用

const Opener = (() => {
  /**
   * Tauri opener プラグインの参照を取得する。
   * iframe 内では自身の window に __TAURI__ がない場合があるため、
   * 親フレームからも取得を試みる。
   */
  function _getOpenUrl() {
    // 自ウィンドウ
    if (window.__TAURI__?.opener?.openUrl) {
      return window.__TAURI__.opener.openUrl;
    }
    // 親フレーム（iframe 内の場合）
    try {
      if (window.parent !== window && window.parent.__TAURI__?.opener?.openUrl) {
        return window.parent.__TAURI__.opener.openUrl;
      }
    } catch (_) { /* cross-origin の場合は無視 */ }
    return null;
  }

  /**
   * 外部URLをブラウザ/OSのデフォルトアプリで開く
   * @param {string} url - 開くURL
   * @returns {Promise<void>}
   */
  function open(url) {
    if (!url) return Promise.resolve();

    // Tauri: ネイティブ opener プラグイン
    if (Env.isTauri) {
      const openUrl = _getOpenUrl();
      if (openUrl) {
        return openUrl(url).catch(() => {
          // フォールバック: プラグイン失敗時は window.open
          window.open(url, '_blank');
        });
      }
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
