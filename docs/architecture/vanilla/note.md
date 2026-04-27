# note/ アーキテクチャ詳細

## ファイル構成

`js/note/`: `state.js`（State + ヘルパー）/ `renderer.js`（Renderer）/ `events.js`（EventHandlers）/ `app.js`（App）

DB 層: `js/db/note_db.js`（`NoteDB` クラス）

## IndexedDB スキーマ

DB 名: `note_db` version **2**

| ストア | 主なフィールド |
|---|---|
| `tasks` | id / title / created_at / updated_at |
| `fields` | id / name / type / options / position / width / listVisible |
| `entries` | id / task_id / field_id / label / value / created_at |
| `note_links` | id / from_task_id / to_task_id |
| `history` | id / task_id / field_id / old_value / new_value / changed_at |

## フィールドタイプ

| タイプ | 挙動 |
|---|---|
| `link` | 複数エントリ可。表示名＋URL。表示名が設定されている場合は「表示名をコピー」ボタンも表示（`copy-entry-label`） |
| `text` | 単一エントリ。インライン textarea（自動保存、debounce 600ms） |
| `date` | 単一エントリ。DatePicker で選択 |
| `select` | 単一エントリ。バッジトグル形式（単一ラベル・再クリックで解除）。表示名「単一ラベル」 |
| `dropdown` | 単一エントリ。CustomSelect ドロップダウン（空選択可能）。`renderDetail` 後に `CustomSelect.replaceAll` を呼ぶ |
| `label` | バッジトグル（チェックボックスなし）。クリックで即時保存。色はインラインスタイルで適用 |
| `note_link`（builtin） | ノート間リンク。`fields` ストアに保存し width/visible/position を設定可能 |
| `todo`（builtin） | TODOリンク。同上 |

`select` / `dropdown` / `label` のオプションは `{name, color}[]` 形式。管理は LabelManager。

## フィールド幅

`'narrow'`(1/6) / `'auto'`(2/6) / `'w3'`(3/6) / `'wide'`(4/6) / `'w5'`(5/6) / `'full'`(6/6)。旧 `'half'` は `'auto'` 扱い。
`.note-fields` は CSS Grid（`auto-fill, minmax(380px, 1fr)`）。≤840px は全幅。

## State

```
State.allEntries      // 全タスクのエントリキャッシュ（タスク一覧表示用）
State.sort            // { field, dir }。localStorage "note_sort" に永続化（"created_at-desc" 形式）
State.listFilter      // { [fieldId]: Set }。localStorage "note_filter" に永続化
```

## Renderer

- `Renderer.renderFilterUI()`: `listVisible=true` な select/label フィールドのフィルター UI を動的生成
- `Renderer._sortTasks()` / `_filterTasks()`: テキスト検索はタイトル + リンク表示名・URL・テキスト内容も対象
- `Renderer._renderFieldBadge()`: フィールドタイプ別バッジ HTML 生成

## EventHandlers

- `_touchTask(db)`: 選択中タスクの `updated_at` を更新し `.note-detail__meta` をインプレース更新。エントリ追加・更新・削除時に呼ぶ
- `_refreshDetailMeta(task)`: 詳細パネルのメタ情報をインプレース更新（再レンダリング不要）
- `_onEditFieldName(btn, db)`: フィールド名クリックでインライン編集
- `_onReorderFields(evt)`: SortableJS での並び替えで position を一括更新

## Cross-DB 連携

- **TODOリンク**: `kanban_db` の `note_links` ストアに保存。`Renderer.renderTodoLinks(noteTaskId)` で描画。`_openKanbanDB()` で cross-DB アクセス
- **リアルタイム同期**: `BroadcastChannel('kanban-note-links')` で TODO↔Note 間のリンク変更を通知
- **Noteからのリンク追加**: `#todo-picker` ポップアップで TODO タスクを検索・選択
- **組み込みフィールドのマイグレーション**: `NoteDB.ensureNoteLinkField()` / `NoteDB.ensureTodoField()` で既存ユーザー向けに自動追加

## ノート間リンク

`note_db` の `note_links` ストアに `{ id, from_task_id, to_task_id }` 形式で保存。双方向表示。
CRUD: `NoteDB.addNoteLink(fromId, toId)` / `deleteNoteLink(id)` / `getNoteLinks(taskId)`
重複チェック（A→B, B→A）あり。`#note-picker` で検索・選択。

## 変更履歴

`history` ストアにフィールド値変更を自動記録。タスクあたり 100 件超で古いレコードから自動削除。
CRUD: `NoteDB.addHistory(record)` / `getHistory(taskId)` / `clearHistory(taskId)` / `trimHistory(taskId, maxCount)`

特殊 field_id:
- `'__title__'`: タイトル変更
- `'__todo_link__'`: TODOリンク追加/削除
- `'__note_link__'`: 関連ノート追加/削除

表示: 追加（old_value 空）は「＋ 値」、削除（new_value 空）は「－ 値」形式。

## その他

- リンクエントリの表示順: 表示名（未設定時は URL）の昇順でソート
- エクスポート/インポート: JSON 形式（`type: 'note_export'`）
