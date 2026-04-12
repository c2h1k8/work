// ==================================================
// env: 実行環境検出ユーティリティ
// ==================================================
// file:// / localhost(http) / Tauri デスクトップアプリを判別する

export type EnvType = 'tauri' | 'file' | 'localhost';

function detectEnv(): {
  type: EnvType;
  isTauri: boolean;
  isLocalhost: boolean;
  isFile: boolean;
} {
  // SPA 化により iframe 内チェックは不要になったが、念のため残す
  const hasTauri = '__TAURI__' in window;
  const isTauri = hasTauri;
  const isFile = location.protocol === 'file:';
  const isLocalhost = !isTauri && !isFile;
  const type: EnvType = isTauri ? 'tauri' : isFile ? 'file' : 'localhost';
  return Object.freeze({ type, isTauri, isLocalhost, isFile });
}

export const Env = detectEnv();
