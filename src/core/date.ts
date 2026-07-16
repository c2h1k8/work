// ==================================================
// date — 日付フォーマット共通ユーティリティ
// ==================================================
// 各ページに散在していた padStart(2, '0') ベースのフォーマットを集約。
// ダッシュボードのトークン形式（YYYY/MM/DD 等の任意フォーマット）は
// core/dashboard_resolve.ts の formatDate を参照。

/** 2桁ゼロ埋め */
export const pad2 = (n: number): string => String(n).padStart(2, '0');

/** ローカル日付を YYYY-MM-DD 形式に（Date#toISOString の UTC ずれを回避） */
export function toLocalYmd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** エクスポートファイル名等に使う YYYYMMDD 形式 */
export function ymdCompact(d: Date = new Date()): string {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}

/** ISO 文字列を YYYY/MM/DD HH:mm 表示に */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
