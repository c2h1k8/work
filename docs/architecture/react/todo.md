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

### 説明エリア（GitHub 方式）

- 「説明」ラベルなし。タイトル直下に直接 Markdown プレビューを表示（GitHub 方式）
- 非編集時: `✏️ 編集` ボタンがプレビューエリア右上に絶対配置（`.desc-edit-btn`）
- 編集ボタンクリック → `descEditing=true` / `descSubTab='write'` / textarea に autoFocus
- 編集/プレビュータブ切替時: `descTextareaRef` で textarea に明示フォーカス（`useEffect` 監視）
- 編集ツールバー（`desc-editor__tabs`）は `position: sticky; top: 0` でスクロール追従
- プレビュー内チェックボックスは `onCheckboxChange` で直接トグル（編集モード不要）

### モーダルレイアウト

- `modal__main`: `display: flex; flex-direction: column; overflow: hidden`（フレックスカラム）
- 説明エリア（`.desc-area`）: `flex-shrink: 0; max-height: 35%`。内部スクロールあり。説明が長くても他セクションが隠れない
- チェックリストセクション（`.modal__section.modal__section--checklist`）: `max-height: 25%; overflow-y: auto`。超えたら内部スクロール
- アクティビティセクション（`.modal__section--grow`）: `flex: 1; min-height: 180px; overflow: hidden`。残り全高を占有（最低180px保証）
- `modal__comments`: `flex: 1; overflow-y: auto` で内部スクロール
- セクション区切り: `border-top` ＋ `padding: 20px 20px 24px` で区別
- セクションラベル: `font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: muted`
- `timeline-header`: `position: sticky; top: 0` でスクロール時に固定

### Markdown レンダリング

説明・コメントは `<MarkdownBody>` (`src/components/MarkdownBody.tsx`) で描画。

| 機能 | 詳細 |
|---|---|
| プラグイン | `remark-gfm`（GFM）+ `remark-breaks`（1改行→`<br>`）+ `rehype-sanitize` |
| シンタックスハイライト | `react-syntax-highlighter`（PrismLight ビルド）。言語指定例: ` ```java ` |
| 対応言語 | js/ts/jsx/tsx, python, java, bash/sh, json, css, sql, yaml, html/xml, go, rust, kotlin, swift, markdown |
| リンク | `Opener.open()` 経由で外部ブラウザ起動（Tauri 対応） |
| チェックボックス | `onCheckboxChange(index, checked)` prop でトグル処理を注入 |
| テーマ切替 | `data-theme` 属性の MutationObserver 監視で自動切替（ライト: oneLight / ダーク: oneDark） |
| CSS | `src/styles/components/MarkdownBody.module.css`（B案スタイル: 14px / GitHub 近似） |

### ページ間ナビゲーション

- `tab_store` の `pendingTodoId` / `pendingNoteId` で仲介
- `TaskModal` 内のノートリンクチップクリック → `tabConfig.find(t => t.pageSrc === 'pages/note.html')?.label` でラベルを取得 → `setActiveTab(noteLabel)` + `setPendingNoteId(noteId)`
  - **注意**: `setActiveTab('NOTE')` のようなラベルのハードコードは禁止（ユーザーがタブをリネームすると壊れる）
- `TodoPage` で `pendingTodoId` を監視 → `kanbanDB.getTask(id)` → `openTask(task)` でモーダルを開く
- 依存関係・タスク関係・依存チップのタイトルクリック → `setPendingTodoId(t.id!)` で対象タスクのモーダルを開く
- ノートリンクチップタイトルは `<button>` で実装（`<span>` は不可）

### キーボードショートカット

`<ShortcutHelp categories={TODO_SHORTCUTS} />` を配置。`?` キーで一覧表示。

| キー | 動作 |
|---|---|
| `N` | 先頭カラムに新規タスク追加（`firstColAddRef` 経由で "+" ボタンをクリック） |
| `F` | 検索入力にフォーカス（`filterInputRef`） |
| `Ctrl+Shift+A` | 完了カラムを一括アーカイブ（`archiveDoneColumns`） |
| `Escape` | モーダルを閉じる（各モーダル内で個別ハンドリング） |

- `KanbanColumnView` の "+" ボタンに `addBtnRef?: React.RefObject<HTMLButtonElement | null>` prop を追加
- 最初のカラム（`idx === 0`）にのみ `addBtnRef={firstColAddRef}` を渡す

### ピッカー UI（Picker 共通コンポーネント）

- `<Picker>` (`src/components/Picker.tsx`) を使用（`TaskPicker`/`NotePicker` は廃止）
- `picker` state: `{ type: PickerType; x: number; y: number; items: PickerItem[] } | null`
- `openPicker(e, type)` は async: タスク一覧・ノート一覧を取得してから state にセット
