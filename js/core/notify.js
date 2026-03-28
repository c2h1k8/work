// ==================================================
// notify: 環境対応通知ラッパー
// ==================================================
// Env.js に依存。file:// では通知非対応、Tauri ではネイティブ通知に拡張可能

const Notify = (() => {
  /**
   * 現在の通知許可状態を返す
   * @returns {'granted'|'denied'|'default'|'unsupported'}
   */
  function getPermission() {
    // Tauri: ネイティブ通知
    if (Env.isTauri) {
      // Tauri 通知プラグインが利用可能な場合
      if (window.__TAURI__?.notification?.isPermissionGranted) {
        return 'granted'; // Tauri は OS レベルで許可管理
      }
      return 'unsupported';
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
    if (Env.isTauri && window.__TAURI__?.notification?.sendNotification) {
      window.__TAURI__.notification.sendNotification({ title, body });
      return;
    }

    // localhost: Web Notification
    new Notification(title, { body, ...opts });
  }

  return Object.freeze({ getPermission, requestPermission, send });
})();
