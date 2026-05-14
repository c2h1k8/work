// ==================================================
// opener: 環境対応URL開封ラッパー
// ==================================================
// env.ts に依存。Tauri ではネイティブ opener プラグインを使用

import { Env } from './env';

type OpenUrlFn = (url: string) => Promise<void>;

function _getOpenUrl(): OpenUrlFn | null {
  const w = window as Window & { __TAURI__?: { opener?: { openUrl?: OpenUrlFn } } };
  if (w.__TAURI__?.opener?.openUrl) return w.__TAURI__.opener.openUrl;
  return null;
}

/**
 * 外部URLをブラウザ/OSのデフォルトアプリで開く
 */
function open(url: string): Promise<void> {
  if (!url) return Promise.resolve();

  if (Env.isTauri) {
    const openUrl = _getOpenUrl();
    if (openUrl) {
      return openUrl(url).catch(() => {
        window.open(url, '_blank');
      });
    }
  }

  window.open(url, '_blank');
  return Promise.resolve();
}

/**
 * Tauri 環境で <a target="_blank"> のクリックをインターセプトしてネイティブで開く
 * @param root イベント委譲のルート要素
 */
function intercept(root: Document | HTMLElement): void {
  if (!Env.isTauri) return;
  root.addEventListener('click', (e: Event) => {
    const a = (e.target as Element).closest('a[target="_blank"]') as HTMLAnchorElement | null;
    if (a?.href) {
      e.preventDefault();
      void open(a.href);
    }
  });
}

export const Opener = Object.freeze({ open, intercept });
