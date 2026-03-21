// ==================================================
// utils: 全ページ共通ユーティリティ
// ==================================================

/** HTML 特殊文字をエスケープ */
const escapeHtml = (str) =>
  String(str ?? '').replace(/[&<>"']/g, (m) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])
  );

/** position フィールドで昇順ソートした配列のコピーを返す */
const sortByPosition = (arr) => arr.slice().sort((a, b) => a.position - b.position);

/**
 * 文字列内のプレースホルダーを指定されたパラメータで置き換える
 * @param {string} origin - 置き換え元の文字列
 * @param {string} params - 置き換え対象のパラメータ（JSON文字列）
 * @returns {string} - 置き換え後の文字列
 */
const getString = (origin, params) => {
  if (!params) return origin;
  const jsonParams = JSON.parse(params);
  return Object.keys(jsonParams).reduce(
    (str, key) => str.replaceAll(key, jsonParams[key]),
    origin
  );
};

/** URL バリデーション */
const isValidUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};
