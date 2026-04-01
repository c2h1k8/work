// ==================================================
// notify: 環境対応通知ラッパー
// ==================================================
// Env.js に依存。file:// では通知非対応、Tauri ではネイティブ通知を使用

const Notify = (() => {
  // Tauri プラグイン invoke ヘルパー（iframe 内では親フレームからも取得を試みる）
  function _getInvoke() {
    if (window.__TAURI__?.core?.invoke) return window.__TAURI__.core.invoke;
    try {
      if (window.parent !== window && window.parent.__TAURI__?.core?.invoke) {
        return window.parent.__TAURI__.core.invoke;
      }
    } catch (_) { /* cross-origin の場合は無視 */ }
    return null;
  }

  function _invoke(cmd, args) {
    const invoke = _getInvoke();
    if (!invoke) return Promise.reject(new Error('Tauri invoke not available'));
    return invoke(`plugin:notification|${cmd}`, args);
  }

  /**
   * 現在の通知許可状態を返す
   * @returns {'granted'|'denied'|'default'|'unsupported'}
   */
  function getPermission() {
    // Tauri: プラグインが登録されていれば granted 扱い（OS レベルで許可管理）
    if (Env.isTauri) {
      return _getInvoke() ? 'granted' : 'unsupported';
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
      try {
        const result = await _invoke('is_permission_granted');
        if (result) return 'granted';
        await _invoke('request_permission');
        return 'granted';
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

    // Tauri: ネイティブ通知
    if (Env.isTauri) {
      _invoke('notify', { notification: { title, body } }).catch(() => {});
      return;
    }

    // localhost: Web Notification
    new Notification(title, { body, ...opts });
  }

  return Object.freeze({ getPermission, requestPermission, send });
})();
