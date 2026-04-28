# note React 版アーキテクチャ

## ファイル構成

```
src/pages/NotePage.tsx   メインコンポーネント
src/db/note_db.ts        Dexie.js（note_db）
```

## DB スキーマ

Vanilla JS 版と完全互換。詳細スキーマ・フィールドタイプ仕様: @docs/architecture/vanilla/note.md

DB 名: `note_db` version 2
ストア: `tasks` / `fields` / `entries` / `note_links` / `history`

### React 版拡張

- `NoteField.newRow?: boolean` — フィールドを必ず行頭から開始するかどうか
- `NoteHistory.field_id: number | string` — 通常フィールドIDの他に特殊文字列 ID も格納
  - `'__title__'` — タイトル変更履歴
  - `'__todo_link__'` — TODOリンク変更履歴
  - `'__note_link__'` — 関連ノート変更履歴

## コンポーネント構成

| コンポーネント | 役割 |
|---|---|
| `NotePage` | ページルート。タスク一覧・選択状態管理 |
| `FieldView` | フィールド 1 件の表示・編集 |
| `LinkEntry` | `link` 型フィールドの 1 エントリ |
| `FieldModal` | フィールド管理モーダル（CRUD・並び替え・設定） |

## React 版固有

### DnD（フィールド並び替え）
- `@dnd-kit/core` + `@dnd-kit/sortable`（FieldModal 内のフィールドリスト）

### Markdown
- `react-markdown` + `rehype-sanitize`（`text` 型フィールドのプレビュー）

### 日付フィールド
- `<DatePicker compact />` (`src/components/DatePicker.tsx`) を使用
- プロパティ: `value`, `onChange(date)`, `onClear()`, `compact`, `placeholder`

### ラベル色管理
- `<LabelManager>` (`src/components/LabelManager.tsx`) でオプション名・色を編集
- オプションの `id` は `index + 1`（合成 ID）。`reload()` 後に再マップされる
- オプション名変更時: 既存エントリを一括更新（`handleLabelUpdate`）
- オプション削除時: 参照エントリを一括削除（`handleLabelDelete`）

### TODOリンク・関連ノートリンクのナビゲーション
- TODOリンク → `useTabStore(s => s.setActiveTab)('TODO')` でタブ移動
- 関連ノート → `setSelectedTaskId(linkedId)` でノート内ジャンプ

### タスク追加
- `window.prompt()` を廃止。インラインフォーム (`showAddForm` + `addInputRef`) に置き換え
- Enter で確定 / Escape でキャンセル / フォーカスアウトで確定

### 変更履歴の記録
- `recordHistory(field_id, old_value, new_value)` が全フィールド書き込み時に呼ばれる
- `touchTask()` で `tasks.updated_at` も同時更新
- 履歴モーダル: 旧値を打ち消し線で表示 / 空値は「（空）」と表示

### エクスポート
- `FileSaver.save(json, filename, { mimeType: 'application/json' })` を使用（直接ダウンロード禁止）

### ノート削除時のカスケード削除
- `noteDB.deleteTask(id)` に加え、`kanban_db` の `note_links` インデックス (`note_task_id`) も raw IDB API で削除

### フィールドレイアウト
- `newRow: true` のフィールドの直前に `<div className="basis-full h-0" />` を挿入して強制改行
- フィールド名ラベルのスタイル: `text-[10px] font-semibold text-[var(--c-text-3)]`（uppercase なし）

### FieldModal デザイン
- 幅 640px、`rounded-2xl`、backdrop-blur あり
- フィールドリストは `DndContext` + `SortableContext` で DnD 並び替え（`@dnd-kit/sortable`）
- 各行は `SortableFieldRow` コンポーネント：
  - `GripVertical` ドラッグハンドル（ホバーで表示）
  - 型バッジ（型ごとカラーコーディング：`FIELD_TYPE_COLORS`）
  - フィールド名クリックでインライン編集（鉛筆アイコンはホバーで表示）— 特殊フィールドでも名称変更は可能
  - 削除ボタン（`Trash2` アイコン）— 特殊フィールド（`todo`/`note_link`）は非表示
  - 幅選択：`<Select className="toolbar-select">` カスタムセレクト（バー表示: `▮▮▮□□□` など）
  - 一覧・行頭トグル：`.toggle-wrap` CSS クラス（iOS スタイル）
  - 特殊フィールドは「表示」トグルのみ（幅・一覧なし）
  - 選択肢管理：`Tag` アイコン + テキストボタン
- ドラッグ中：`DragOverlay` でゴースト行表示、元位置は透明
- 追加フォーム（フッター）: 入力 + `<Select>` 種類選択（`w-36`）+ 追加ボタン
  - 種類選択から `todo` / `note_link` を除外（手動追加不可）

### フィールド型カラー
| 型 | 色 |
|---|---|
| link | `#3b82f6` (青) |
| text | `#10b981` (エメラルド) |
| date | `#f59e0b` (アンバー) |
| select / dropdown | `#8b5cf6` (バイオレット) |
| label | `#ec4899` (ピンク) |
| todo / note_link | `#6366f1` (インディゴ) |

### フィールド名インライン編集（FieldModal）
- 特殊フィールド（`todo` / `note_link` 型）以外でクリック → インライン input
- `editingNameId` / `editingNameVal` state で管理

## アクティビティログ

```ts
activityDB.add({
  page: 'note',
  action,
  target_type,
  target_id: String(id),
  summary,
  created_at: new Date().toISOString()
})
```
