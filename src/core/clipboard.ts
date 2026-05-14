// ==================================================
// clipboard: 環境対応クリップボードラッパー
// ==================================================
// env.ts に依存。file:// では execCommand フォールバックを使用

import { Env } from './env';

/**
 * テキストをクリップボードにコピーする
 * @returns Promise<void>
 */
function copy(text: string): Promise<void> {
  // Tauri: ネイティブクリップボード API
  if (Env.isTauri) {
    const cb = (window as Window & { __TAURI__?: { clipboard?: { writeText?: (t: string) => Promise<void> } } }).__TAURI__?.clipboard;
    if (cb?.writeText) return cb.writeText(text);
  }

  // localhost: Clipboard API（安全なコンテキスト）
  if (navigator.clipboard?.writeText) {
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

export const Clipboard = Object.freeze({ copy });
