# wbs（ガントチャート）React 版アーキテクチャ

## ファイル構成

```
src/pages/WbsPage.tsx   メインコンポーネント
src/db/wbs_db.ts        Dexie.js（wbs_db）
```

## DB スキーマ

Vanilla JS 版と完全互換。営業日計算・ガント表示の詳細: @docs/architecture/vanilla/wbs.md

DB 名: `wbs_db` version 1
ストア: `tasks`（`level` / `position` / `plan_start` / `plan_days` / `actual_start` / `actual_end` / `progress` / `status` / `memo`）

## React 版固有

- DnD: `@dnd-kit/core` + `@dnd-kit/sortable`（Vanilla の SortableJS とは異なる）
- グループ移動時は選択タスク + 全子孫を一括移動
- 横スクロール位置: `localStorage('wbs_scroll')` に記憶
