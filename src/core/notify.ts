// ==================================================
// notify: 環境対応通知ラッパー
// ==================================================
// env.ts に依存。file:// では通知非対応、Tauri ではネイティブ通知を使用

import { Env } from './env';

export type NotifyPermission = 'granted' | 'denied' | 'default' | 'unsupported';

interface TauriNotificationApi {
  isPermissionGranted: () => Promise<boolean>;
  requestPermission: () => Promise<string>;
  sendNotification: (opts: { title: string; body: string }) => void;
}

function _getNotifApi(): TauriNotificationApi | null {
  const w = window as Window & { __TAURI__?: { notification?: TauriNotificationApi } };
  if (w.__TAURI__?.notification) return w.__TAURI__.notification;
  return null;
}

/** 現在の通知許可状態を返す */
function getPermission(): NotifyPermission {
  if (Env.isTauri) {
    return _getNotifApi() ? 'granted' : 'unsupported';
  }
  if (Env.isFile || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission as NotifyPermission;
}

/** 通知許可をリクエストする */
async function requestPermission(): Promise<NotifyPermission> {
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

  try {
    const result = await Notification.requestPermission();
    return result as NotifyPermission;
  } catch {
    return 'unsupported';
  }
}

/**
 * 通知を送信する
 * @param title 通知タイトル
 * @param body 通知本文
 * @param opts オプション（tag, icon, requireInteraction など）
 */
function send(title: string, body: string, opts: NotificationOptions = {}): void {
  if (getPermission() !== 'granted') return;

  if (Env.isTauri) {
    const api = _getNotifApi();
    if (api) {
      try { api.sendNotification({ title, body }); } catch { /* 無視 */ }
    }
    return;
  }

  new Notification(title, { body, ...opts });
}

export const Notify = Object.freeze({ getPermission, requestPermission, send });
