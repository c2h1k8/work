# todo（Kanban）React 版アーキテクチャ

## ファイル構成

```
src/pages/TodoPage.tsx   メインコンポーネント
src/db/kanban_db.ts      Dexie.js（kanban_db）
```

## DB スキーマ

Vanilla JS 版と完全互換。詳細スキーマ: @docs/architecture/vanilla/todo.md

DB 名: `kanban_db` version 2
ストア: `tasks` / `columns` / `labels` / `task_labels` / `templates` / `archives` / `dependencies` / `note_links`

## React 版固有

- DnD: `@dnd-kit/core` + `@dnd-kit/sortable`（Vanilla の SortableJS とは異なる）
- アクティビティログ: `activityDB.add({ page: 'todo', action, target_type, target_id: String(id), summary, created_at: new Date().toISOString() })`
