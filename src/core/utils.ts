// ==================================================
// utils: 全ページ共通ユーティリティ
// ==================================================

/** HTML 特殊文字をエスケープ */
export const escapeHtml = (str: unknown): string =>
  String(str ?? '').replace(
    /[&<>"']/g,
    (m) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m] ?? m,
  );

/** position フィールドで昇順ソートした配列のコピーを返す */
export const sortByPosition = <T extends { position: number }>(arr: T[]): T[] =>
  arr.slice().sort((a, b) => a.position - b.position);

/**
 * 文字列内のプレースホルダーを指定されたパラメータで置き換える
 * @param origin 置き換え元の文字列
 * @param params 置き換え対象のパラメータ（JSON 文字列）
 */
export const getString = (origin: string, params?: string): string => {
  if (!params) return origin;
  const jsonParams = JSON.parse(params) as Record<string, string>;
  return Object.keys(jsonParams).reduce(
    (str, key) => str.replaceAll(key, jsonParams[key]),
    origin,
  );
};

/**
 * タグ名のハッシュから決定論的に色を返す（同じ名前は常に同じ色）
 * 16色パレット: 色相を均等にカバーし、隣接色との混同を避けた構成
 */
const _TAG_PALETTE = [
  '#6366f1', // indigo
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
  '#3b82f6', // blue
  '#84cc16', // lime
  '#06b6d4', // cyan
  '#eab308', // yellow
  '#22c55e', // green
  '#a855f7', // purple
  '#f43f5e', // rose
  '#0ea5e9', // sky
];

export function getTagColor(tag: string): string {
  if (!tag) return _TAG_PALETTE[0];
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (Math.imul(31, h) + tag.charCodeAt(i)) | 0;
  return _TAG_PALETTE[Math.abs(h) % _TAG_PALETTE.length];
}

/** 検索クエリ周辺のテキスト抜粋を返す */
export function extractExcerpt(text: string, query: string): string {
  if (!text) return '';
  const q = query.toLowerCase();
  const idx = text.toLowerCase().indexOf(q);
  if (idx === -1) return '';
  const start = Math.max(0, idx - 20);
  return (start > 0 ? '…' : '') + text.slice(start, idx + query.length + 30).replace(/\n/g, ' ');
}

/** URL バリデーション */
export const isValidUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

// ── localStorage ヘルパー（UI 選択状態の保存用） ──────────────
export function lsGet(key: string): string | null { return localStorage.getItem(key); }
export function lsSet(key: string, val: string): void { localStorage.setItem(key, val); }
export function lsJson<T>(key: string): T | null {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) as T : null; } catch { return null; }
}
