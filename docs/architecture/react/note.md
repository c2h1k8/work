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

### リンクフィールド追加フォーム
- 編集フォームと同一スタイル: 左アクセントボーダー（`border-l-2 border-[var(--c-accent)]`）+ アンダーラインインプット + `Tag`/`ExternalLink` アイコンプレフィックス + `Check`/`X` アイコンボタン
- Enter で追加 / Escape でキャンセル（`setShowForm(false)` + フォームリセット）

### リンクエントリ表示（`LinkEntry`）
- `showSubline?: boolean`（`NoteField.showSubline`）で制御。デフォルト `true`（後方互換）
- **showSubline=true**: メイン行 = ラベル（常に固定）。サブライン = `hostname`（ドメイン）、ラベルコピーホバー → サブラインにラベル名、URLコピーホバー → サブラインにフル URL（どちらもアクセントカラー）
- **showSubline=false**: サブラインなし。URLコピーホバー時のみメイン行がラベルから URL に切替。ラベルコピーホバーは演出なし（ラベルがメイン行に常時表示のため）
- ドメイン抽出: `new URL()` 失敗時 → `https://` 補完を試みる → それでも失敗なら `entry.value` をそのまま使用
- FieldModal: `link` 型のフィールド行に「サブライン」トグル（`.toggle-wrap`）を表示

### Markdown
- `react-markdown` + `rehype-sanitize`（`text` 型フィールドのプレビュー）

### 日付フィールド
- `<DatePicker>` (`src/components/DatePicker.tsx`) を使用（`compact` なし・通常サイズ）
- プロパティ: `value`, `onChange(date)`, `onClear()`, `placeholder`
- compact モードはトリガー背景が transparent でカードと区別できないため使わない

### ラベル色管理
- `<LabelManager>` (`src/components/LabelManager.tsx`) でオプション名・色を編集
- オプションの `id` は `index + 1`（合成 ID）。`reload()` 後に再マップされる
- オプション名変更時: 既存エントリを一括更新（`handleLabelUpdate`）
- オプション削除時: 参照エントリを一括削除（`handleLabelDelete`）

### アクティビティ・履歴の記録ルール（リンク操作）

| 操作 | 操作元側 | 相手側 |
|---|---|---|
| TODO詳細 → ノート紐づけ **追加** | `kanbanDB.addActivity(todoId, 'note_link_add', ...)` | `noteDB.addHistory({ task_id: noteId, field_id: '__todo_link__', old: '', new: todoTitle })` |
| TODO詳細 → ノート紐づけ **解除** | `kanbanDB.addActivity(todoId, 'note_link_remove', ...)` | `noteDB.addHistory({ task_id: noteId, field_id: '__todo_link__', old: todoTitle, new: '' })` |
| ノート詳細 → TODOリンク **追加** | `onRecordHistory(HIST_TODO, '', todoTitle)` | `kanbanDB.addActivity(todoId, 'note_link_add', { noteTaskId, title: noteTitle })` |
| ノート詳細 → TODOリンク **解除** | `onRecordHistory(HIST_TODO, todoTitle, '')` | `kanbanDB.addActivity(todoId, 'note_link_remove', { noteTaskId, title: noteTitle })` |
| ノート詳細 → 関連ノート **追加** | `onRecordHistory(HIST_NOTE, '', linkedTitle)` | `noteDB.addHistory({ task_id: linkedId, field_id: '__note_link__', old: '', new: currentNoteTitle })` |
| ノート詳細 → 関連ノート **解除** | `onRecordHistory(HIST_NOTE, linkedTitle, '')` | `noteDB.addHistory({ task_id: linkedId, field_id: '__note_link__', old: currentNoteTitle, new: '' })` |

### TODOリンク・関連ノートリンクのナビゲーション
- TODOリンク → `setActiveTab('TODO')` + `setPendingTodoId(taskId)` でタブ移動 & タスクモーダルを開く
- 関連ノート → `setSelectedTaskId(linkedId)` でノート内ジャンプ
- `pendingNoteId`（`tab_store`）を監視し、非 null になったら `setSelectedTaskId` してリセット
- ページ間ナビゲーションは `tab_store` の `pendingNoteId` / `pendingTodoId` で仲介
  - TODO 詳細のノートリンクチップクリック → `tabConfig.find(t => t.pageSrc === 'pages/note.html')?.label` でタブラベルを取得してから `setActiveTab(noteLabel)` + `setPendingNoteId(noteId)`（ラベルのハードコード禁止）
  - Note の TODO リンクボタンクリック → `setActiveTab('TODO')` + `setPendingTodoId(taskId)`

### ピッカー UI（TODO / 関連ノート追加）
- 共通コンポーネント `<Picker>` (`src/components/Picker.tsx`) を使用
- `＋ 追加` ボタンクリック時に `getBoundingClientRect()` で位置を取得してフローティング表示
- `PickerItem[]` 形式（`{ id, label, sublabel? }`）でアイテムを渡す
- 画面下端に収まらない場合は上方向に開く（`useLayoutEffect` で判定）
- Escape キー・背景クリックで閉じる
- TODO ピッカー: kanban_db からタスク取得、既リンク済み ID を除外
- ノートピッカー: `allTasks` を使用、現在のノートと既リンク済みを除外

### タスク追加
- `window.prompt()` を廃止。インラインフォーム (`showAddForm` + `addInputRef`) に置き換え
- Enter で確定 / Escape でキャンセル / フォーカスアウトで確定

### ツールバー構成
- 詳細ヘッダーボタン: 変更履歴 / 削除（2つのみ）
- ⋮メニューは廃止。エクスポート・インポートはサイドバーフッターに移動

### グローバル検索

`searchRegistry.register('note', ...)` でタスクを検索対象に登録。タイトル・`text` 型フィールド・`link` 型フィールド（ラベル・URL）を検索。結果クリックで Note ページに遷移し該当タスクを選択。

- 検索マッチ後、タイトル前方一致 → タイトル部分一致 → フィールドマッチ の優先順で並び替え（新旧問わず関連度順）
- 上位 20 件を返す（ID 昇順 + `.slice(0, 10)` では新しいノートが埋もれるため）

### タスクリスト（左サイドバー）
- **選択状態**: 背景色 `bg-[var(--c-accent)]/10` のみ（border-l なし）。`mx-1.5 my-0.5 rounded-lg` のモダン inset スタイル
- **コンテナ**: `flex-1 overflow-auto py-1`（上下に 4px の余白）
- **キーボードナビゲーション**: `tabIndex={0}` + `onKeyDown`。↑↓ で前後ノートに移動、Enter で選択
- **フォーカスリング**: `outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-accent)]`（マウスクリックでは発火しない）

### サイドバー構成
- **検索行**: アイコン付きフルwidth 検索入力（`Search` アイコン）
- **ソート・行数行**: `<Select>` カスタムコンポーネント（`SORT_OPTIONS`）+ 行数トグル（1行/2行/全）を同行に並べる
- **フィルター行**: `listVisible` なフィールドがある場合のみ表示
- **フッター（通常時）**: 左にアイコンボタン群（フィールド管理 `Settings2` / エクスポート `Download` / インポート `Upload`）、右に「ノート追加」primary ボタン（1行レイアウト）
- **フッター（追加フォーム展開時）**: インライン入力 + 追加/取消ボタン

### ドロップダウンフィールドのUI
- `<Select>` コンポーネント（`src/components/Select.tsx`）を使用したカスタムドロップダウン
- 先頭に「（未選択）`value: ''`」オプションを追加。選択すると `saveDropdown('')` で空値保存
- `select`（単一ラベル）はバッジトグル形式のまま。両者は視覚的に区別される

### テキストフィールド
- シンプルな `<textarea>`（Markdownプレビューなし）
- テキスト値は `textVal` state（controlled）で管理。タスク切り替え時に `entry0Id` 依存の useEffect で同期
- 保存: 600ms debounce（`saveText`）
- 履歴記録: フォーカスアウト時のみ。`textFocusValRef` にフォーカス時の値を保持し、blur 時に差分があれば `onRecordHistory` を呼ぶ
- 自動高さ調整: `textareaRef` + useEffect で `scrollHeight` に基づいて高さを設定。`resize-none overflow-hidden min-h-[72px]`
- Markdown対応が必要になった場合は別途フィールド定義する方針

### 変更履歴の記録
- `recordHistory(field_id, old_value, new_value)` が全フィールド書き込み時に呼ばれる
- `touchTask()` で `tasks.updated_at` も同時更新
- `label` 型はデルタ記録: 追加 `("", optName)` / 削除 `(optName, "")` — JSON配列は保存しない
- 履歴モーダル（タイムライン形式）:
  - 日付単位でグループ化（日付ヘッダー: `toLocaleDateString('ja-JP', { weekday: 'short' ... })`）
  - 各行: 時刻（tabular-nums 固定幅）+ フィールド名バッジ（`--c-accent-dim`/`--c-accent`）+ 変更内容
  - 追加（old空・new非空）→ `--c-success` で「＋ {new_value}」（1行）
  - 削除（old非空・new空）→ `red-400` で「－ {old_value}」（1行）
  - 変更 → 旧値（打ち消し線・グレー）→ 新値（太字）

### エクスポート
- `FileSaver.save(json, filename, { mimeType: 'application/json' })` を使用（直接ダウンロード禁止）

### ノート削除時のカスケード削除
- `noteDB.deleteTask(id)` に加え、`kanban_db` の `note_links` インデックス (`note_task_id`) も raw IDB API で削除

### フィールドレイアウト
- コンテナは `grid grid-cols-6 gap-4 items-start`（CSS Grid 6列、`items-start` で高さ連動を防止）
- `COL_SPAN` マップで幅を `col-span-N` に変換（narrow=1 / auto=2 / w3=3 / wide=4 / w5=5 / full=6）
- `newRow: true` のフィールドは `col-start-1` を付与して行頭強制（breakEl 不要）
- 各フィールドはカード形式: `bg-[var(--c-surface)] border border-[var(--c-border)] rounded-xl px-4 py-3 shadow-sm`、ホバー・フォーカスで `border-[var(--c-border-2)]`
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
ActivityLogger.log('note', action, 'note', id, summary)
```

`disabledPages` チェック込み。直接 `activityDB.add()` は使わない。
