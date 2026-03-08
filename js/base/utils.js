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
