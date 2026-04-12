// ==================================================
// file_saver: ファイル保存ユーティリティ
// ==================================================
// Tauri 環境ではネイティブ保存ダイアログ + fs API を使用し、
// それ以外の環境では <a> クリックによるダウンロードを使用する。
// 依存: env.ts

import { Env } from './env';

export interface SaveOptions {
  mimeType?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
}

interface TauriDialogApi {
  save: (opts: { defaultPath: string; filters?: Array<{ name: string; extensions: string[] }> }) => Promise<string | null>;
}

interface TauriFsApi {
  writeTextFile: (path: string, content: string) => Promise<void>;
}

function _getTauriAPIs(): { dialog: TauriDialogApi; fs: TauriFsApi } | null {
  const w = window as Window & {
    __TAURI__?: { dialog?: TauriDialogApi; fs?: TauriFsApi };
  };
  if (!w.__TAURI__) return null;
  const { dialog, fs } = w.__TAURI__;
  if (!dialog?.save || !fs?.writeTextFile) return null;
  return { dialog, fs };
}

/** Tauri 環境: ネイティブ保存ダイアログ + fs.writeFile */
async function _saveTauri(
  content: string,
  defaultName: string,
  opts: SaveOptions,
): Promise<boolean> {
  const apis = _getTauriAPIs();
  if (!apis) return _saveBrowser(content, defaultName, opts);

  const filters = opts.filters ?? [{ name: 'JSON', extensions: ['json'] }];
  const path = await apis.dialog.save({ defaultPath: defaultName, filters });
  if (!path) return false;

  await apis.fs.writeTextFile(path, content);
  return true;
}

/** ブラウザ環境: Blob + <a> クリック */
function _saveBrowser(
  content: string,
  defaultName: string,
  opts: SaveOptions,
): Promise<boolean> {
  const mimeType = opts.mimeType ?? 'application/json';
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = defaultName;
  a.click();
  URL.revokeObjectURL(url);
  return Promise.resolve(true);
}

/**
 * ファイルを保存する
 * @param content 保存するテキスト内容
 * @param defaultName デフォルトファイル名
 * @param opts オプション
 * @returns 保存成功なら true、キャンセルなら false
 */
async function save(
  content: string,
  defaultName: string,
  opts: SaveOptions = {},
): Promise<boolean> {
  if (Env.isTauri) {
    return _saveTauri(content, defaultName, opts);
  }
  return _saveBrowser(content, defaultName, opts);
}

export const FileSaver = Object.freeze({ save });
