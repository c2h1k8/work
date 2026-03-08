# CLAUDE.md

Claude Code がこのプロジェクトで作業する際の指針。

## 必須ルール

- **対応を行うたびに README.md と CLAUDE.md を最新状態に最適化すること。**
  - 新機能・ファイル追加 → README のディレクトリ構成・説明を更新
  - 技術スタックの変更 → README の「技術スタック」を更新
  - 新しい規約・パターンの確立 → CLAUDE.md の該当セクションを更新

## プロジェクト概要

個人向け生産性ツール。`index.html` をエントリポイントとしたタブ UI で複数ページを切り替える。詳細は README.md 参照。

## コーディング規約

### ストレージ使い分け方針

| 種別 | 保存先 | 理由 |
| --- | --- | --- |
| データ本体（タスク・環境設定・ラベルなど） | **IndexedDB** | 他ブラウザへのエクスポート・インポートで共有可能にするため |
| UI 選択状態（最後に選択した環境、開閉状態など） | **localStorage** | ブラウザ固有の操作状態。他ブラウザで共有不要 |
| タブ設定（TAB_CONFIG） | **IndexedDB** (`app_db`) | 他ブラウザとも共有したい設定データのため |

具体例:
- `index.js`: タブ設定（TAB_CONFIG）→ IndexedDB (`app_db`)
- `index.js`: アクティブタブ ID → `localStorage("ACTIVE_TAB_ID")`（ブラウザ固有）
- `sql.js`: 接続環境データ → IndexedDB (`sql_db`)
- `sql.js`: 選択中の接続環境キー → `localStorage("sql_selected_env")`（ブラウザ固有）
- `sql.js`: チューニング詳細の開閉状態 → `localStorage("sql_tune_open")`（ブラウザ固有）
- `dashboard.js`: セクション・アイテムデータ → IndexedDB (`dashboard_db`)
- `dashboard.js`: URL コマンド履歴 → `localStorage("dashboard_url_history_<sectionId>")`（ブラウザ固有）

### JavaScript

- **全ページ Vanilla JS**
- `todo.html` は IndexedDB（`KanbanDB` クラス）でデータ永続化。`localStorage` は使わない
- その他ページの localStorage 操作は `js/base/local_storage.js` の `saveToStorage` / `loadFromStorage` / `saveToStorageWithLimit` / `loadJsonFromStorage` を使う
- `js/base/common.js` の共通ユーティリティを活用する（dashboard.html は不使用）
- コメントは日本語で記載する
- `todo.js` のアーキテクチャ: `KanbanDB` / `State` / `Backup` / `Renderer` / `DragDrop` / `EventHandlers` / `Toast` / `App` の単一ファイル構成
- `DatePicker` は `js/base/date_picker.js` に分離された再利用可能部品。CSS は `css/base/date_picker.{less,css}`。HTML は初回 `DatePicker.open()` 時に自動生成・挿入される（各ページへの HTML 配置不要、ページ側のクリックリスナー登録も不要）
- `LabelManager` は `js/base/label_manager.js` に分離されたラベル管理ダイアログ（共通部品）。CSS は `css/base/label_manager.{less,css}`。HTML は初回 `LabelManager.open()` 時に自動生成・挿入される。API: `LabelManager.open({ title, labels: [{id,name,color}], onAdd, onUpdate, onDelete, onChange })`
- `todo.js` のグローバルヘルパー: `getColumnKeys()` / `sortTasksArray()` / `markDirty()` / `applyFilter()` / `renderFilterLabels()` / `renderTextWithLinks()` / `_resetMdEditor(editor)`
- `State.tasks: {}` はカラムキー → タスク配列の動的マップ（固定配列ではない）
- `State.columns: []` は `{ id, key, name, position }` の配列。`getColumnKeys()` で key 一覧を取得
- `State.sort: { field, dir }` でソート状態を保持。localStorage `kanban_sort` に永続化
- `State.taskLabels: Map<taskId, Set<labelId>>` はフィルター用キャッシュ。`renderBoard()` でリビルド、ラベル追加／削除時にインクリメンタル更新
- `State.filter: { text, labelIds }` でフィルター状態を保持。`applyFilter()` でカードの表示／非表示を制御
- IndexedDB は version 1
- `note_links` スキーマ: `{ id, todo_task_id, note_task_id }`。インデックス: `todo_task_id` / `note_task_id`
- `Renderer.renderNoteLinks(taskId, db)`: モーダルサイドバーの「ノート」セクションを描画
- `_openNoteDB()`: `note_db` を開くモジュールレベルヘルパー（todo.js 内）
- 期限日フィールドはカスタムカレンダー（`js/base/date_picker.js` の `DatePicker`）で選択。`#modal-due` は hidden input
- カラムは動的追加・削除可能。削除時にタスクが残っていればブロック

### CSS / LESS

- **スタイルは必ず `.less` を編集すること。`.css` を直接編集してはいけない**
- `.less` を編集したら `npx lessc <src>.less <dst>.css` で対応 `.css` を必ず再生成する
  - 例: `npx lessc css/base/tab_style.less css/base/tab_style.css`
  - 例: `npx lessc css/todo.less css/todo.css`
- 共通スタイルは `css/base/` 配下に配置する
- ページ固有スタイルは `css/<page>.{less,css}` に配置する

### HTML

- `lang="ja"` を指定する
- 外部ライブラリは CDN で読み込む（todo.html のみ SortableJS を使用。）
- `defer` 属性を script タグに付ける

## ファイル配置ルール

| 種別           | 配置先                       |
| -------------- | ---------------------------- |
| 新ページ       | ルートに `<name>.html`       |
| ページ固有 JS  | `js/<name>.js`               |
| ページ固有 CSS | `css/<name>.{less,css}`      |
| 共通 JS        | `js/base/<name>.js`          |
| 共通 CSS       | `css/base/<name>.{less,css}` |

## タブの追加方法

### 組み込みタブの追加（コード変更）

`js/index.js` の `TAB_ITEMS` 配列に追記する。`isBuiltIn: true` で設定 UI から削除不可になる。

```js
{ label: "ラベル名", pageSrc: "page.html", isSelected: false }
```

### カスタムタブの追加（UI操作）

ナビバーのギアアイコン → 「タブを追加」フォームでタイプとラベルを指定して追加。

- **タイプ「カスタムURL」**: URL 入力欄が表示される。URL を指定してページを追加。
- **タイプ「ダッシュボード」**: `dashboard.html?instance=<id>` を自動生成。独立した IndexedDB（`dashboard_db_<id>`）を使用。

### ダッシュボードタブの「ページを設定」ボタン

設定リストの各ダッシュボードタブ行に「設定」ボタンが表示される。クリックすると：
1. タブ設定パネルが閉じる
2. 対象ダッシュボードタブに切り替わる
3. `postMessage({ type: 'dashboard:open-settings' })` でダッシュボード設定パネルが開く

## タブ設定機能

- **IndexedDB** DB名: `app_db` version 1、ストア: `settings`（keyPath: name）
- TAB_CONFIG は `settings` ストアの `{ name: "tab_config", value: [...] }` として保存
- スキーマ: `{ label, pageSrc, icon, visible, position, isBuiltIn }`
- `AppDB.get(name)` / `AppDB.set(name, value)` → settings ストアの読み書き（index.js 内の静的オブジェクト）
- `loadTabConfig()` / `saveTabConfig(config)` → **async 関数** で読み書き
- `rebuildNav(config)` → visible=true のタブを **position 昇順でソート** してナビを再構築
- `syncViewport(config)` → 新規タブの iframe を追加（既存は再読み込みしない）
- 表示中タブが 1 件のみの場合は非表示にできない
- `getDefaultConfig()` → TAB_ITEMS から初期設定を生成（IndexedDB に未保存の初回用）
- **アイコン変更**: 設定画面の各タブ行の左端アイコンボタンをクリック → SVG アイコンパレット（30種）が展開 → 選択すると即時反映
  - 選択した SVG は生の `<svg>` 文字列として `icon` フィールドに保存（TAB_ITEMS と同形式）
  - `ICON_PALETTE` 配列（`{ id, label, svg }`）で選択肢を管理（`js/index.js`）
  - `_toggleIconPicker(label)` / `_onSelectIcon(btn)` で制御（`_onSelectIcon` は async）
  - 組み込みタブも SVG に変更可能
  - CSS: `.icon-picker__item svg { width: 16px; height: 16px; fill: currentColor; }` で SVG サイズ統一
- **エクスポート/インポート（全体）**: 設定パネル下部「データ管理」セクション
  - `exportAllData()` → tab_config + dashboard_db の全インスタンスデータを JSON ダウンロード
  - `importAllData()` → JSON ファイルを読み込んで全データを復元
  - フォーマット: `{ type: 'app_export', version: 1, tabConfig, dashboards: [{ instanceId, sections, items }] }`
  - `_deleteDashboardInstance(instanceId)` → タブ削除時に共有DBからそのインスタンスのデータを削除

## dashboard.js アーキテクチャ（2026-03現在）

- IndexedDB DB名: `dashboard_db` version **1**（全インスタンス共有の単一DB）
- URLパラメータ `?instance=<id>` で複数ダッシュボードタブを識別（DBは共有）
- `_instanceId = new URLSearchParams(location.search).get('instance') || ''` でファイル冒頭に定義
- `sections` ストアに `instance_id` フィールド（インデックス付き）を持ち、このIDでフィルタリング
- `window.addEventListener('message', ...)` で親フレームからの `dashboard:open-settings` を受信して設定パネルを開く
- `EventHandlers.closeSettings()` は設定パネルを閉じた後、親フレームに `dashboard:settings-closed` を postMessage
- ストア: `sections`（id/instance_id/title/icon/position/type/command_template/**action_mode**/columns/**width**）+ `items`（id/section_id/position/item_type/label/hint/value/emoji/row_data）
- セクションタイプ: `list` | `grid` | `command_builder` | `table`
- アイテムタイプ: `copy` | `link`（list）/ `link` | `copy`（grid、旧 `card` は `link` 互換）/ `row`（table）
- 設定パネル: 右スライドオーバーレイ（`#home-settings`）、ギアボタン（`.home-gear-btn`）で開閉
- 設定ビュー: `'sections'`（一覧）/ `'edit-section'`（セクション編集）/ `'bind-settings'`（共通バインド変数）/ `'edit-preset'`（プリセット編集）→ `State.settings.view` で管理
- テーブルセクションの列定義は `section.columns: [{id, label, type: 'text'|'copy'|'link'}]` で保持
- テーブル行の値は `item.row_data: {[col_id]: string}` で保持
- `command_builder` セクションは `command_template` に `{INPUT}` プレースホルダーを使う。`action_mode: 'copy'`（デフォルト）はクリップボードにコピー、`action_mode: 'open'` はブラウザで URL を開く
- URL コマンド履歴: `localStorage("dashboard_url_history_<sectionId>")`（ブラウザ固有）
- モジュール構成: `HomeDB` / `State` / `Renderer` / `EventHandlers` / `App` の単一ファイル構成
- レイアウト: `max-width: 1440px` + CSS Grid（`auto-fill, minmax(380px, 1fr)`）でセクションカードを複数列配置
- セクションの表示幅: `section.width = 'auto' | 'wide' | 'full'`。カードに `data-width` 属性を付与し CSS でスパン制御（wide=span 2 / full=1/-1 / ≤840px は全幅）。セクション編集画面の「表示幅」セレクターで設定・保存
- `.settings-col-row`: `flex-wrap: nowrap` で通常表示。`:has(input)` セレクターで列編集展開時のみ `flex-wrap: wrap`
- `.data-table`: `width: auto; min-width: 100%` で列が多い時は `.data-table-wrap`（`overflow-x: auto`）で横スクロール
- **エクスポート/インポート**:
  - ダッシュボード設定パネル下部のボタンでこのインスタンスのデータ（sections/items/presets/bindConfig）をJSON出力・読込
  - `HomeDB.exportInstance()` / `HomeDB.importInstance(data, replace)` / `HomeDB.deleteInstance()`
  - フォーマット: `{ type: 'dashboard_export', version: 2, instanceId, sections, items, presets, bindConfig }`
  - インポート時は旧フォーマット（`environments`/`envConfig`）も後方互換で読み込む
- **共通バインド変数**:
  - ストア: `presets`（id/instance_id/name/position/values: {[varName]: string}）+ `app_config`（keyPath: name）
  - `app_config` に `bind_config_{instanceId}` として `{ varNames: string[], uiType: 'select'|'tabs'|'segment' }` を保存
  - `State.presets` / `State.activePresetId` / `State.bindConfig` で管理
  - `resolveBindVars(str)` → 選択中プリセットの値で `{変数名}` を置換（`{INPUT}` はスキップ）
  - 選択中のプリセットID: `localStorage("dashboard_active_preset_{instanceId}")`（ブラウザ固有）
  - バインド変数バー `#bind-bar` をダッシュボード上部に表示（presets が 0 件なら hidden）
  - 設定ビュー「共通バインド変数」→ 変数名定義・UIタイプ切替・プリセット一覧の管理
  - コピー・リンク・コマンドビルダー実行時と表示時（テキスト・コピー型テーブルセル）に変数を解決


## note.js アーキテクチャ（2026-03現在）

- IndexedDB DB名: `note_db` version **1**
- ストア: `tasks`（id/title/created_at/updated_at）+ `fields`（id/name/type/options/position/**width**/**listVisible**）+ `entries`（id/task_id/field_id/label/value/created_at）
- フィールドタイプ: `link` | `text` | `date` | `select` | `label`
- `link`: 複数エントリ可。追加ボタンあり、表示名＋URL
- `text`: 単一エントリ。メモ風インライン textarea（自動保存、debounce 600ms）
- `date`: 単一エントリ。カスタム DatePicker（`js/base/date_picker.js`）で選択。クリッカブルな日付表示エリア
- `select`: 単一エントリ。バッジトグル形式（単一選択・必須。選択済みをクリックしても解除不可）。オプションは文字列配列 `string[]` 形式。色なし。管理は LabelManager（フィールド管理モーダルの「選択肢」ボタン）。フィールドタイプ表示名は「単一選択」
- `label`: バッジトグル形式（チェックボックスなし・保存ボタンなし）。クリックで即時保存。オプションは `{name, color}[]` 形式。色はインラインスタイルで適用。管理は LabelManager（フィールド管理モーダルの「ラベル」ボタン）
- タイプバッジは非表示（フィールド名のみ表示）
- `field.width`: `'auto'`（標準）/ `'wide'`（広幅=span 2）/ `'full'`（全幅=1/-1）。ダッシュボードと同仕様。旧 `'half'` は `'auto'` 扱い
- `field.listVisible`: `true` のフィールドをタスク一覧に値バッジとして表示
- `.note-fields` は CSS Grid（`auto-fill, minmax(380px, 1fr)`）。≤840px は全幅
- `State.allEntries`: 全タスクのエントリキャッシュ（タスク一覧表示用）
- `State.sort`: `{ field, dir }` ソート状態。localStorage `note_sort` に永続化（`"created_at-desc"` 形式）
- `State.listFilter`: `{ [fieldId]: Set }` フィルター状態（select/label 共通で Set 形式）。localStorage `note_filter` に永続化
- `_saveFilter()` / `_loadFilter()`: フィルター状態を localStorage に保存・復元。フィールド ID をキーに JSON シリアライズ
- `EventHandlers._touchTask(db)`: 選択中タスクの `updated_at` を更新し、詳細パネルのメタ情報をインプレース更新。エントリ追加・更新・削除時に呼ぶ
- `EventHandlers._refreshDetailMeta(task)`: 詳細パネルの `.note-detail__meta` をインプレース更新（再レンダリング不要）
- フィールド名変更: フィールド管理モーダルのフィールド名をクリックしてインライン編集可能。`_onEditFieldName(btn, db)` で処理
- `Renderer.renderFilterUI()`: `listVisible=true` な select/label フィールドのフィルター UI を動的生成
- `Renderer._sortTasks()` / `Renderer._filterTasks()`: ソート・フィルター処理
- `Renderer._renderFieldBadge()`: フィールドタイプ別バッジ HTML 生成
- CSS: `note.less` に `:root { --color-card, --color-border, ... }` を追加（DatePicker が参照）
- モジュール構成: `NoteDB` / `State` / `Renderer` / `EventHandlers` / `App`
- エクスポート/インポート: JSON形式（`type: 'note_export'`）
- **TODOとの紐づけ**: `kanban_db` の `note_links` ストアに `{ id, todo_task_id, note_task_id }` 形式で保存。詳細パネル末尾の「紐づきTODO」セクションに表示。`Renderer.renderTodoLinks(noteTaskId)` で描画、`_openKanbanDB()` で cross-DB アクセス
- `_openKanbanDB()`: `kanban_db` を開くモジュールレベルヘルパー（note.js 内）

## 注意事項

- `todo.html` は IndexedDB を使用するため `file://` でも動作する（localStorage 依存なし）
- その他ページは localStorage を使用するため、ローカルファイルアクセスでは制限が生じる場合がある
- LESS ファイルを編集した場合は `npx lessc <src>.less <dst>.css` で必ず CSS を再生成する
- `dashboard.html` にはアカウント情報やスプレッドシートIDが含まれる場合がある。Git にコミットする際は注意する
