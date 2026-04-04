// ==================================================
// notify: 環境対応通知ラッパー
// ==================================================
// Env.js に依存。file:// では通知非対応、Tauri ではネイティブ通知を使用

const Notify = (() => {
  // Tauri notification プラグイン API の参照を取得（iframe 内では親フレームからも取得を試みる）
  function _getNotifApi() {
    if (window.__TAURI__?.notification) return window.__TAURI__.notification;
    try {
      if (window.parent !== window && window.parent.__TAURI__?.notification) {
        return window.parent.__TAURI__.notification;
      }
    } catch (_) { /* cross-origin の場合は無視 */ }
    return null;
  }

  /**
   * 現在の通知許可状態を返す
   * @returns {'granted'|'denied'|'default'|'unsupported'}
   */
  function getPermission() {
    // Tauri: プラグイン API が取得できれば granted 扱い（OS レベルで許可管理）
    if (Env.isTauri) {
      return _getNotifApi() ? 'granted' : 'unsupported';
    }

    // file:// では通知 API が使えない
    if (Env.isFile || !('Notification' in window)) {
      return 'unsupported';
    }

    return Notification.permission;
  }

  /**
   * 通知許可をリクエストする
   * @returns {Promise<'granted'|'denied'|'default'|'unsupported'>}
   */
  async function requestPermission() {
    if (Env.isTauri) {
      const api = _getNotifApi();
      if (!api) return 'unsupported';
      try {
        const granted = await api.isPermissionGranted();
        if (granted) return 'granted';
        const result = await api.requestPermission();
        return result === 'granted' ? 'granted' : 'denied';
      } catch {
        return 'unsupported';
      }
    }

    const current = getPermission();
    if (current === 'unsupported' || current === 'granted' || current === 'denied') {
      return current;
    }

    // localhost: Web Notifications API
    try {
      const result = await Notification.requestPermission();
      return result;
    } catch {
      return 'unsupported';
    }
  }

  /**
   * 通知を送信する
   * @param {string} title - 通知タイトル
   * @param {string} body - 通知本文
   * @param {Object} [opts] - オプション（tag, icon, requireInteraction など）
   */
  function send(title, body, opts = {}) {
    const perm = getPermission();
    if (perm !== 'granted') return;

    // Tauri: ネイティブ通知（高レベル API 経由）
    if (Env.isTauri) {
      const api = _getNotifApi();
      if (api) {
        // sendNotification は void を返すため catch 不要
        try { api.sendNotification({ title, body }); } catch (_) {}
      }
      return;
    }

    // localhost: Web Notification
    new Notification(title, { body, ...opts });
  }

  return Object.freeze({ getPermission, requestPermission, send });
})();
