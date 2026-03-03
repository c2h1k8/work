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

### JavaScript

- **全ページ Vanilla JS**
- `todo.html` は IndexedDB（`KanbanDB` クラス）でデータ永続化。`localStorage` は使わない
- その他ページの localStorage 操作は `js/base/local_storage.js` の `saveToStorage` / `loadFromStorage` / `saveToStorageWithLimit` / `loadJsonFromStorage` を使う
- `js/base/common.js` の共通ユーティリティを活用する
- コメントは日本語で記載する
- `todo.js` のアーキテクチャ: `KanbanDB` / `State` / `Migration` / `Backup` / `Renderer` / `DragDrop` / `EventHandlers` / `Toast` / `App` の単一ファイル構成
- `DatePicker` は `js/base/date_picker.js` に分離された再利用可能部品。CSS は `css/base/date_picker.{less,css}`
- `todo.js` のグローバルヘルパー: `getColumnKeys()` / `sortTasksArray()` / `markDirty()` / `applyFilter()` / `renderFilterLabels()` / `renderTextWithLinks()` / `_resetMdEditor(editor)`
- `State.tasks: {}` はカラムキー → タスク配列の動的マップ（固定配列ではない）
- `State.columns: []` は `{ id, key, name, position }` の配列。`getColumnKeys()` で key 一覧を取得
- `State.sort: { field, dir }` でソート状態を保持。localStorage `kanban_sort` に永続化
- `State.taskLabels: Map<taskId, Set<labelId>>` はフィルター用キャッシュ。`renderBoard()` でリビルド、ラベル追加／削除時にインクリメンタル更新
- `State.filter: { text, labelIds }` でフィルター状態を保持。`applyFilter()` でカードの表示／非表示を制御
- IndexedDB は version 2（`columns` ストアを v2 で追加。`key` / `position` インデックス付き）
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

ナビバーのギアアイコン → 「タブを追加」フォームからラベルと URL を指定して追加。

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
- 旧 localStorage（キー `TAB_CONFIG`）からの自動移行: `loadTabConfig()` が初回に検出し IndexedDB へ移行、localStorage を削除
- **アイコン変更**: 設定画面の各タブ行の左端アイコンボタンをクリック → SVG アイコンパレット（30種）が展開 → 選択すると即時反映
  - 選択した SVG は生の `<svg>` 文字列として `icon` フィールドに保存（TAB_ITEMS と同形式）
  - `ICON_PALETTE` 配列（`{ id, label, svg }`）で選択肢を管理（`js/index.js`）
  - `_toggleIconPicker(label)` / `_onSelectIcon(btn)` で制御（`_onSelectIcon` は async）
  - 組み込みタブも SVG に変更可能
  - CSS: `.icon-picker__item svg { width: 16px; height: 16px; fill: currentColor; }` で SVG サイズ統一

## 注意事項

- `todo.html` は IndexedDB を使用するため `file://` でも動作する（localStorage 依存なし）
- その他ページは localStorage を使用するため、ローカルファイルアクセスでは制限が生じる場合がある
- LESS ファイルを編集した場合は `npx lessc <src>.less <dst>.css` で必ず CSS を再生成する
- `home.html` にはアカウント情報やスプレッドシートIDが含まれる。Git にコミットする際は注意する
