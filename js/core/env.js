// ==================================================
// env: 実行環境検出ユーティリティ
// ==================================================
// file:// / localhost(http) / Tauri デスクトップアプリを判別する

const Env = (() => {
  // iframe 内では __TAURI__ が注入されない場合があるため親フレームも確認
  let hasTauri = '__TAURI__' in window;
  if (!hasTauri) {
    try {
      if (window.parent !== window && '__TAURI__' in window.parent) {
        hasTauri = true;
      }
    } catch (_) { /* cross-origin の場合は無視 */ }
  }
  const isTauri = hasTauri;
  const isFile = location.protocol === 'file:';
  const isLocalhost = !isTauri && !isFile;
  const type = isTauri ? 'tauri' : isFile ? 'file' : 'localhost';
  return Object.freeze({ type, isTauri, isLocalhost, isFile });
})();
