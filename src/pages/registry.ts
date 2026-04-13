// ==================================================
// ページレジストリ: pageSrc → React コンポーネントのマッピング
// ==================================================
// Phase 4 で実装済みページを登録し、App.tsx の TabContent から参照する。
// まだ移行されていないページは undefined を返す（プレースホルダー表示）。

import { lazy } from 'react';

// lazy import でコード分割（必要なページだけ読み込む）
const DiffToolPage = lazy(() => import('./DiffToolPage').then((m) => ({ default: m.DiffToolPage })));
const TextPage     = lazy(() => import('./TextPage').then((m) => ({ default: m.TextPage })));
const OpsPage      = lazy(() => import('./OpsPage').then((m) => ({ default: m.OpsPage })));
const SnippetPage  = lazy(() => import('./SnippetPage').then((m) => ({ default: m.SnippetPage })));
const TimerPage    = lazy(() => import('./TimerPage').then((m) => ({ default: m.TimerPage })));
const SqlPage      = lazy(() => import('./SqlPage').then((m) => ({ default: m.SqlPage })));

/** pageSrc → React コンポーネント のマップ */
export const PAGE_REGISTRY: Record<string, React.LazyExoticComponent<() => React.ReactElement>> = {
  'pages/diff_tool.html': DiffToolPage,
  'pages/text.html':      TextPage,
  'pages/ops.html':       OpsPage,
  'pages/snippet.html':   SnippetPage,
  'pages/timer.html':     TimerPage,
  'pages/sql.html':       SqlPage,
};
