// ==================================================
// env: 実行環境検出ユーティリティ
// ==================================================
// file:// / localhost(http) / Tauri デスクトップアプリを判別する

const Env = (() => {
  const isTauri = '__TAURI__' in window;
  const isFile = location.protocol === 'file:';
  const isLocalhost = !isTauri && !isFile;
  const type = isTauri ? 'tauri' : isFile ? 'file' : 'localhost';
  return Object.freeze({ type, isTauri, isLocalhost, isFile });
})();
