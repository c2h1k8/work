# todo/ アーキテクチャ詳細

## ファイル構成

`js/todo/`: `state.js`（State + グローバルヘルパー）/ `backup.js`（Backup）/ `renderer.js`（Renderer）/ `dragdrop.js`（DragDrop）/ `app.js`（EventHandlers + App）

DB 層: `js/db/kanban_db.js`（`KanbanDB` クラス）

## IndexedDB スキーマ

DB 名: `kanban_db` version **2**（version 1→2 で templates / archives / dependencies ストアを追加）

| ストア | 主なフィールド |
|---|---|
| `tasks` | id / column_key / title / description / due / position / checklist / recurring |
| `columns` | id / key / name / position / done / wip_limit |
| `labels` | id / name / color / position |
| `task_labels` | id / task_id / label_id |
| `templates` | id / name / title / description / checklist / label_ids / position |
| `archives` | tasks の全フィールド + archived_at: ISO8601 |
| `dependencies` | id / from_task_id / to_task_id |
| `note_links` | id / todo_task_id / note_task_id |

## State

```
State.tasks: {}          // カラムキー → タスク配列の動的マップ
State.columns: []        // { id, key, name, position, done? }
State.sort: { field, dir }  // localStorage "kanban_sort" に永続化
State.filter: { text, labelIds }
State.taskLabels: Map<taskId, Set<labelId>>  // フィルター用キャッシュ
State.templates: []      // App.init() でロード
State.dependencies: Map<taskId, { blocking: Set<taskId>, blockedBy: Set<taskId> }>
```

## グローバルヘルパー（state.js）

`getColumnKeys()` / `sortTasksArray()` / `markDirty()` / `applyFilter()` / `renderFilterLabels()` / `renderTextWithLinks()` / `_resetMdEditor(editor)`

## 主要フィールド詳細

- **`columns.done`**: `true` の場合は「完了カラム」として扱い、カード上の「期限切れ」ラベルを抑制。カラムヘッダーのチェックマークボタンでトグル
- **`columns.wip_limit`**: `number (0=制限なし)`。超過時は `.column--wip-exceeded` で赤ハイライト。`_updateWipDisplay(columnKey)` で更新
- **`tasks.checklist`**: `[{id, text, done, position}] | null`。カードに `✓ 完了/全数` バッジ表示
- **`tasks.recurring`**: `{interval: 'daily'|'weekly'|'monthly', next_date: 'YYYY-MM-DD'} | null`。完了カラム移動時に次回タスク自動生成

## Cross-DB 連携

- `note_links` スキーマ: `{ id, todo_task_id, note_task_id }`（インデックス: `todo_task_id` / `note_task_id`）
- `Renderer.renderNoteLinks(taskId, db)`: モーダルサイドバーの「ノート」セクションを描画
- `_openNoteDB()`: `note_db` を開くモジュールレベルヘルパー（`js/todo/state.js` 内）
- `BroadcastChannel('kanban-note-links')` でリンク変更を note.js に通知（`_noteLinksBC`）

## その他

- 期限日フィールドはカスタムカレンダー（`DatePicker`）で選択。`#modal-due` は hidden input
- `archives`: 完了カラムヘッダーにアーカイブボタン（一括アーカイブ）。`#archive-modal` で検索・復元・完全削除
- `dependencies`: `from`=先行（ブロッカー）、`to`=後続。循環依存チェック（DFS）。ブロックされているカードにロックアイコン（`Icons.lock`）
- カラムは動的追加・削除可能。削除時にタスクが残っていればブロック
