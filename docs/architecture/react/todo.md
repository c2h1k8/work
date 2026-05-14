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
- アクティビティログ: `ActivityLogger.log('todo', action, 'task', id, summary)` — `disabledPages` チェック込み（直接 `activityDB.add()` は使わない）

### ページ間ナビゲーション

- `tab_store` の `pendingTodoId` / `pendingNoteId` で仲介
- `TaskModal` 内のノートリンクチップクリック → `tabConfig.find(t => t.pageSrc === 'pages/note.html')?.label` でラベルを取得 → `setActiveTab(noteLabel)` + `setPendingNoteId(noteId)`
  - **注意**: `setActiveTab('NOTE')` のようなラベルのハードコードは禁止（ユーザーがタブをリネームすると壊れる）
- `TodoPage` で `pendingTodoId` を監視 → `kanbanDB.getTask(id)` → `openTask(task)` でモーダルを開く
- 依存関係・タスク関係・依存チップのタイトルクリック → `setPendingTodoId(t.id!)` で対象タスクのモーダルを開く
- ノートリンクチップタイトルは `<button>` で実装（`<span>` は不可）

### ピッカー UI（Picker 共通コンポーネント）

- `<Picker>` (`src/components/Picker.tsx`) を使用（`TaskPicker`/`NotePicker` は廃止）
- `picker` state: `{ type: PickerType; x: number; y: number; items: PickerItem[] } | null`
- `openPicker(e, type)` は async: タスク一覧・ノート一覧を取得してから state にセット
