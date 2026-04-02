// ==================================================
// file_saver: ファイル保存ユーティリティ
// ==================================================
// Tauri 環境ではネイティブ保存ダイアログ + fs API を使用し、
// それ以外の環境では <a> クリックによるダウンロードを使用する。
// 依存: env.js

const FileSaver = (() => {
  /**
   * Tauri のダイアログ・FS API を取得する（iframe 内では親フレームにフォールバック）
   */
  function _getTauriAPIs() {
    const w = window.__TAURI__ ? window : (() => {
      try {
        return window.parent !== window && window.parent.__TAURI__ ? window.parent : null;
      } catch (_) { return null; }
    })();
    if (!w) return null;
    const dialog = w.__TAURI__?.dialog;
    const fs = w.__TAURI__?.fs;
    if (!dialog?.save || !fs?.writeFile) return null;
    return { dialog, fs };
  }

  /**
   * ファイルを保存する
   * @param {string} content - 保存するテキスト内容
   * @param {string} defaultName - デフォルトファイル名
   * @param {Object} [opts] - オプション
   * @param {string} [opts.mimeType='application/json'] - MIMEタイプ
   * @param {Array} [opts.filters] - Tauri用フィルター [{name, extensions}]
   * @returns {Promise<boolean>} 保存成功なら true、キャンセルなら false
   */
  async function save(content, defaultName, opts = {}) {
    if (Env.isTauri) {
      return _saveTauri(content, defaultName, opts);
    }
    return _saveBrowser(content, defaultName, opts);
  }

  /** Tauri 環境: ネイティブ保存ダイアログ + fs.writeFile */
  async function _saveTauri(content, defaultName, opts) {
    const apis = _getTauriAPIs();
    if (!apis) {
      // API が取得できない場合はブラウザフォールバック
      return _saveBrowser(content, defaultName, opts);
    }

    const filters = opts.filters || [{ name: 'JSON', extensions: ['json'] }];
    const path = await apis.dialog.save({
      defaultPath: defaultName,
      filters: filters,
    });
    if (!path) return false; // キャンセル

    const encoder = new TextEncoder();
    await apis.fs.writeFile(path, encoder.encode(content));
    return true;
  }

  /** ブラウザ環境: Blob + <a> クリック */
  function _saveBrowser(content, defaultName, opts) {
    const mimeType = opts.mimeType || 'application/json';
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = defaultName;
    a.click();
    URL.revokeObjectURL(url);
    return Promise.resolve(true);
  }

  return Object.freeze({ save });
})();
