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

## 親子集計ロジック（calcAggregatedValues）の注意点

- `actual_end`: 進行中（`isOngoing`）の子タスクでも今日付を代入しない。一件でも `actual_end` 未入力の子がある場合は親も空白
- `plan_start` / `plan_end`: 全子タスクに `plan_start` と `plan_days` が揃っている場合のみ集計。1件でも欠ければ空白

## キーボードショートカット

- DatePicker が開いている間は `[role="dialog"][aria-label="日付を選択"]` の DOM 存在チェックで WBS ショートカットを無効化（Ctrl+↑↓ でタスク移動が誤作動しないよう保護）
