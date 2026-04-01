// ==================================================
// clipboard: 環境対応クリップボードラッパー
// ==================================================
// Env.js に依存。file:// では execCommand フォールバックを使用

const Clipboard = (() => {
  /**
   * テキストをクリップボードにコピーする
   * @param {string} text - コピーするテキスト
   * @returns {Promise<void>}
   */
  function copy(text) {
    // Tauri: ネイティブクリップボード API（iframe 内では親フレームからも取得を試みる）
    if (Env.isTauri) {
      const cb = window.__TAURI__?.clipboard || ((() => {
        try { return window.parent !== window && window.parent.__TAURI__?.clipboard; } catch (_) { return null; }
      })());
      if (cb?.writeText) return cb.writeText(text);
    }

    // localhost: Clipboard API（安全なコンテキスト）
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }

    // file:// フォールバック: execCommand('copy')
    return new Promise((resolve, reject) => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      try {
        const ok = document.execCommand('copy');
        ok ? resolve() : reject(new Error('execCommand copy failed'));
      } catch (e) {
        reject(e);
      } finally {
        document.body.removeChild(ta);
      }
    });
  }

  return Object.freeze({ copy });
})();
