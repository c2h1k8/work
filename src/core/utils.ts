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

/** URL バリデーション */
export const isValidUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};
