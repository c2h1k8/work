# dashboard React 版アーキテクチャ

## ファイル構成

```
src/pages/DashboardPage.tsx   メインコンポーネント
src/db/dashboard_db.ts        Dexie.js（dashboard_db）
```

## DB スキーマ

Vanilla JS 版と完全互換。詳細スキーマ・セクションタイプ・バインド変数仕様: @docs/architecture/vanilla/dashboard.md

DB 名: `dashboard_db` version 2
ストア: `sections` / `items` / `presets` / `app_config`

## React 版固有

- インスタンスID: `useTabLabel()` フック（`src/contexts/TabContext.ts`）で取得
  - Vanilla 版の `?instance=<id>` URL パラメータの代替
- Markdown: `react-markdown` + `rehype-sanitize`（Vanilla の marked.js + DOMPurify とは異なる）
- DnD: `@dnd-kit/core` + `@dnd-kit/sortable`
