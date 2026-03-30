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
- `index/`: タブ設定（TAB_CONFIG）→ IndexedDB (`app_db`)
- `index/`: アクティブタブ ID → `localStorage("ACTIVE_TAB_ID")`（ブラウザ固有）
- `sql/`: 接続環境・テーブル定義メモ → IndexedDB (`sql_db`)
- `sql/`: 選択中の接続環境キー → `localStorage("sql_selected_env")`（ブラウザ固有）
- `sql/`: チューニング詳細の開閉状態 → `localStorage("sql_tune_open")`（ブラウザ固有）
- `sql/`: チューニングガイドの選択タブ → `localStorage("sql_tune_tab")`（ブラウザ固有）
- `sql/`: テーブル定義メモパネルの開閉状態 → `localStorage("sql_memo_open")`（ブラウザ固有）
- `dashboard/`: セクション・アイテムデータ → IndexedDB (`dashboard_db`)
- `dashboard/`: URL コマンド履歴 → `localStorage("dashboard_url_history_<sectionId>")`（ブラウザ固有）
- `ops/`: アクティブセクション → `localStorage("ops_active_section")`（ブラウザ固有）
- `ops/`: cron TZ 切替 → `localStorage("ops_cron_tz")`（ブラウザ固有）
- `ops/`: ポートフィルタータブ → `localStorage("ops_ports_filter")`（ブラウザ固有）
- `ops/`: HTTP スターフィルター → `localStorage("ops_http_star_only")`（ブラウザ固有）
- `ops/`: HTTP アコーディオン開閉 → `localStorage("ops_http_open_cats")`（ブラウザ固有）
- `text/`: アクティブセクション → `localStorage("text_active_section")`（ブラウザ固有）
- `text/`: エンコード方向 → `localStorage("text_encode_dir")`（ブラウザ固有）
- `text/`: TSV 区切り文字 → `localStorage("text_tsv_delimiter")`（ブラウザ固有）
- `text/`: TSV ヘッダー有無 → `localStorage("text_tsv_has_header")`（ブラウザ固有）

### JavaScript

- **全ページ Vanilla JS**
- `todo.html` は IndexedDB（`KanbanDB` クラス）でデータ永続化。`localStorage` は使わない
- その他ページの localStorage 操作は `js/core/local_storage.js` の `saveToStorage` / `loadFromStorage` / `saveToStorageWithLimit` / `loadJsonFromStorage` を使う
- `js/core/utils.js` を全ページで読み込む: `escapeHtml(str)` / `sortByPosition(arr)` / `getString(origin, params)` / `isValidUrl(url)` — HTML エスケープ、position 昇順ソート、テンプレート置換、URL バリデーション
- `js/core/env.js` をクリップボード/通知を使うページで読み込む: `Env.type`（`'file'` / `'localhost'` / `'tauri'`）/ `Env.isTauri` / `Env.isLocalhost` / `Env.isFile` — 実行環境検出。`file://` / localhost / Tauri デスクトップアプリの3形態を判別
- `js/core/clipboard.js` をコピー機能があるページで読み込む（`env.js` に依存）: `Clipboard.copy(text)` → Promise。localhost/Tauri では `navigator.clipboard.writeText`、`file://` では `execCommand('copy')` フォールバック。**`navigator.clipboard.writeText` を直接使わない。必ず `Clipboard.copy` を使うこと**。使用ページ: `sql.html` / `note.html` / `snippet.html` / `diff_tool.html` / `ops.html` / `dashboard.html` / `text.html`
- `js/core/opener.js` を外部URLを開くページで読み込む（`env.js` に依存）: `Opener.open(url)` → Promise。Tauri では `tauri-plugin-opener` でOS既定ブラウザを使用（iframe 内では親フレームの `__TAURI__` にフォールバック）、それ以外は `window.open`。`Opener.intercept(root)` で `<a target="_blank">` をTauri環境でインターセプト。**`window.open` を直接使わない。必ず `Opener.open` を使うこと**。使用ページ: `todo.html` / `note.html` / `dashboard.html`
- `js/core/notify.js` を通知機能があるページで読み込む（`env.js` に依存）: `Notify.send(title, body, opts?)` / `Notify.requestPermission()` / `Notify.getPermission()` — 環境対応通知。`file://` では `'unsupported'`、localhost では Web Notifications API、Tauri ではネイティブ通知。**`Notification` API を直接使わない。必ず `Notify` を使うこと**。使用ページ: `timer.html`
- `js/components/toast.js` を全ページで読み込む: `Toast.show(msg, type?)` / `Toast.success(msg)` / `Toast.error(msg)` — 統一トースト通知（自己挿入型）。CSS は `css/components/toast.{less,css}`。各ページに `showSuccess` / `showError` ラッパーを定義して使用する: `const showSuccess = (msg) => Toast.success(msg);` / `const showError = (msg) => Toast.error(msg);`
- `js/components/tooltip.js` を必要なページで読み込む: `Tooltip.init(container, selector?)` — カスタムツールチップ（自己挿入型・即時表示）。CSS は `css/components/tooltip.{less,css}`。`data-tooltip="テキスト"` 属性を持つ要素が対象。`title` 属性の代わりに使用することでブラウザ固有の遅延を回避できる。現在の使用ページ: `wbs.html` / `timer.html` / `text.html` / `note.html`
- `js/core/icons.js` を全ページで読み込む: JS生成HTML内で使う共通SVGアイコン定数。**JS生成HTMLにSVGを直書きしてはいけない。必ず `Icons.<name>` を使うこと。** 新しいアイコンが必要な場合は `icons.js` に追記してから参照する。主なアイコン: `Icons.export` / `Icons.import` / `Icons.gear` / `Icons.copyFill` / `Icons.edit` / `Icons.close` / `Icons.grip` など
- コメントは日本語で記載する
- `todo/` のアーキテクチャ: `state.js`（State + グローバルヘルパー）/ `backup.js`（Backup）/ `renderer.js`（Renderer）/ `dragdrop.js`（DragDrop）/ `app.js`（EventHandlers + App）。DB層は `js/db/kanban_db.js` の `KanbanDB` クラスに分離
- `DatePicker` は `js/components/date_picker.js` に分離された再利用可能部品。CSS は `css/components/date_picker.{less,css}`。HTML は初回 `DatePicker.open()` 時に自動生成・挿入される（各ページへの HTML 配置不要、ページ側のクリックリスナー登録も不要）
- `LabelManager` は `js/components/label_manager.js` に分離されたラベル管理ダイアログ（共通部品）。CSS は `css/components/label_manager.{less,css}`。HTML は初回 `LabelManager.open()` 時に自動生成・挿入される。API: `LabelManager.open({ title, labels: [{id,name,color}], onAdd, onUpdate, onDelete, onChange })`。重複名チェック（追加・リネーム両方）は LabelManager 内で処理し `Toast.show` で通知（Toast が存在する場合）。Enter キーは `isComposing` チェックで IME 変換中を無視。
- `ShortcutHelp` は `js/components/shortcut_help.js` に分離されたショートカットキー一覧モーダル（共通部品）。CSS は `css/components/shortcut_help.{less,css}`。HTML は初回 `ShortcutHelp.show()` 時に自動生成・挿入（自己挿入型）。API: `ShortcutHelp.register(categories)` でページ固有ショートカットを登録（`[{ name: 'カテゴリ名', shortcuts: [{ keys: ['Ctrl', 'K'], description: '説明' }] }]` 形式）。`?` キーで表示、Escape/オーバーレイで閉じる。Mac では `Ctrl` → `⌘` に自動変換。input/textarea/select/contenteditable にフォーカス中は `?` キーを無視。全ページ（index/todo/note/sql/wbs/timer/snippet/dashboard/diff_tool/ops/text）で読み込む。z-index: 500。親フレームから `register-parent-shortcuts` メッセージでナビゲーションショートカット定義を事前登録（iframe 内で `?` を押した際にも表示される）
- `BindVarModal` は `js/components/bind_var_modal.js` に分離されたバインド変数 + プリセット管理モーダル（共通部品）。CSS は `css/components/bind_var_modal.{less,css}`。HTML は初回 `BindVarModal.open()` 時に自動生成・挿入される。API: `BindVarModal.open({ title, varNames, presets, showBarConfig, uiType, barLabel, onAddVar, onRemoveVar, onSaveBarConfig, onAddPreset, onUpdatePreset, onDeletePreset, onMovePresetUp, onMovePresetDown, onChange })` / `BindVarModal.close()`。2カラムレイアウト（左: 変数定義 + バー設定、右: プリセット一覧/編集）。dashboard.js の共通バインド変数設定・テーブルバインド変数設定で使用。
- `CustomSelect` は `js/components/custom_select.js` に分離されたカスタム select コンポーネント。CSS は `css/components/custom_select.{less,css}`。ネイティブ `<select>` に `cs-target` クラスを付与し `CustomSelect.replaceAll(container)` で一括置換。サイズ: `kn-select--sm` / 幅拡張: `kn-select--grow`。動的生成 HTML の場合は `innerHTML` 設定後に `replaceAll(container)` を呼ぶ。`create()` 後は `selectEl._csInst` にインスタンス参照が保持されるため、オプション変更後は `selectEl._csInst.render()` で表示を更新できる。CSS 変数は `--c-*` トークンを直接参照（ページ固有エイリアス不要）。**`<option data-color="#hex">` を付与すると色が自動反映される。** トリガー（選択中）: `.cs-color-badge`（カラーバッジチップ、色背景＋白文字）。ドロップダウン内アイテム: `.cs-swatch`（11px角丸スクエア、`--cs-swatch-color` CSS変数で色指定、影付き）。選択中アイテムはスウォッチにリングを付与し、既存の選択ドット（`::before`）は非表示（`:has` で制御）。 使用ページ: `index.html` / `pages/todo.html` / `pages/sql.html` / `pages/note.html` / `pages/dashboard.html`
- `js/todo/state.js` のグローバルヘルパー: `getColumnKeys()` / `sortTasksArray()` / `markDirty()` / `applyFilter()` / `renderFilterLabels()` / `renderTextWithLinks()` / `_resetMdEditor(editor)`
- `State.tasks: {}` はカラムキー → タスク配列の動的マップ（固定配列ではない）
- `State.columns: []` は `{ id, key, name, position, done? }` の配列。`getColumnKeys()` で key 一覧を取得
- `columns.done`: `true` の場合は「完了カラム」として扱い、カード上の「期限切れ」ラベル・スタイルを抑制（日付のみ表示）。カラムヘッダーのチェックマークボタンでトグル。`KanbanDB.updateColumn(col)` で永続化
- `State.sort: { field, dir }` でソート状態を保持。localStorage `kanban_sort` に永続化
- `State.taskLabels: Map<taskId, Set<labelId>>` はフィルター用キャッシュ。`renderBoard()` でリビルド、ラベル追加／削除時にインクリメンタル更新
- `State.filter: { text, labelIds }` でフィルター状態を保持。`applyFilter()` でカードの表示／非表示を制御
- `State.templates: []` テンプレートキャッシュ。`App.init()` でロード
- `State.dependencies: Map<taskId, { blocking: Set<taskId>, blockedBy: Set<taskId> }>` 依存関係キャッシュ。`renderBoard()` でリビルド
- IndexedDB は version **2**（version 1 → 2 で templates / archives / dependencies ストアを追加）
- `tasks.checklist`: `[{id, text, done, position}] | null` フィールド（スキーマレス追加）。モーダルにチェックリストセクション。カードに `✓ 完了/全数` バッジ表示
- `tasks.recurring`: `{interval: 'daily'|'weekly'|'monthly', next_date: 'YYYY-MM-DD'} | null` フィールド。完了カラム移動時に次回タスク自動生成。カードに繰り返しバッジ（`Icons.repeat`）
- `columns.wip_limit`: `number (0=制限なし)` フィールド。カラムヘッダーに `現在/上限` 形式で表示。超過時は `.column--wip-exceeded` クラスで赤ハイライト
- `templates` ストア: `{id*, name, title, description, checklist, label_ids, position}`。テンプレート管理モーダル（`#template-modal`）。タスク追加時にピッカー表示（テンプレートが存在する場合）
- `archives` ストア: tasks の全フィールド + `archived_at: ISO8601`。完了カラムヘッダーにアーカイブボタン（一括アーカイブ）。アーカイブ一覧モーダル（`#archive-modal`）で検索・復元・完全削除
- `dependencies` ストア: `{id*, from_task_id, to_task_id}`。`from`=先行（ブロッカー）、`to`=後続（ブロックされる）。モーダルに依存関係セクション。ブロックされているカードにロックアイコン（`Icons.lock`）。循環依存チェック（DFS）
- `_updateWipDisplay(columnKey)`: WIP 超過判定 + DOM 更新ヘルパー。タスク追加・移動・削除時に呼ぶ
- `note_links` スキーマ: `{ id, todo_task_id, note_task_id }`。インデックス: `todo_task_id` / `note_task_id`
- `Renderer.renderNoteLinks(taskId, db)`: モーダルサイドバーの「ノート」セクションを描画
- `_openNoteDB()`: `note_db` を開くモジュールレベルヘルパー（`js/todo/state.js` 内）
- 期限日フィールドはカスタムカレンダー（`js/components/date_picker.js` の `DatePicker`）で選択。`#modal-due` は hidden input
- カラムは動的追加・削除可能。削除時にタスクが残っていればブロック

### CSS / LESS

- **スタイルは必ず `.less` を編集すること。`.css` を直接編集してはいけない**
- `.less` を編集したら `npx lessc <src>.less <dst>.css` で対応 `.css` を必ず再生成する
  - 例: `npx lessc css/index.less css/index.css`
  - 例: `npx lessc css/todo.less css/todo.css`
- 基盤スタイルは `css/core/` 配下に配置する（tokens, ui）
- index.html のスタイルは `css/index.less`（エントリポイント）+ `css/index/` 配下にパーシャル分割（_variables, _shell, _viewport, _settings, _search）
- 分割済みページ CSS: `css/todo/`, `css/dashboard/`, `css/note/`, `css/sql/`, `css/ops/`, `css/text/`, `css/wbs/`, `css/timer/`
- UIコンポーネントスタイルは `css/components/` 配下に配置する
- ページ固有スタイルは `css/<page>.{less,css}` に配置（エントリポイント）。大きいファイルは `css/<page>/` に `_*.less` パーシャルとして分割し `@import` で読み込む
- **`.less` ファイルを追加・削除した場合は `.github/workflows/release.yml` の「Build CSS from LESS」ステップも必ず更新すること**
  - 追加時: `npx lessc <src>.less <dst>.css` を該当ステップに追記する
  - 削除時: 対応する行をステップから削除する
  - 新規ページ HTML を追加した場合は release.yml の ZIP 作成ステップ（`zip -r` コマンド）にも追記する

### デザイン方針

- **UI/UX を最大限に考慮した、洗練されたモダンデザインを追求すること。** 見た目の美しさ・操作の気持ちよさ・情報の整理しやすさを常に意識し、プロダクト品質のUIを目指す。余白・タイポグラフィ・色彩・アニメーション・インタラクションのすべてにおいて妥協しない
- 新機能の追加やUIの変更を行う際は、既存のデザインシステム（トークン・コンポーネント）を活用しつつ、より良い体験になるよう積極的に提案・改善すること

### デザインシステム（2026-03現在）

- **デザイントークン**: `css/core/tokens.less` / `css/core/tokens.css` — 全ページ共通の CSS カスタムプロパティ（色・シャドウ・ラジウス・フォント・スペーシング）
- **共通 UI**: `css/core/ui.less` / `css/core/ui.css` — 全ページ共通のスタイルを定義。`--c-*` トークンを直接参照。共通カラーエイリアス（`--color-card`, `--color-bg`, `--color-border` 等）もここで定義。全ページで `tokens.css` の直後に読み込む
  - **リセット**: `*, *::before, *::after { box-sizing: border-box }` / `[hidden] { display: none !important }` — ページ LESS で重複定義しない。flex/grid コンテナ内での `&[hidden]` も不要
  - **body 基本**: `margin: 0; padding: 0; font-family; font-size: 14px; line-height: 1.5; color; background` — ページ LESS では layout 系（height / overflow / display）のみ上書きする
  - **ボタン**: `.btn` / `.btn--primary` / `.btn--secondary` / `.btn--danger` / `.btn--ghost` / `.btn--ghost-danger` / `.btn--sm` — ページ固有 LESS には記載しない
- **カスタムチェックボックス**: `css/components/checkbox.{less,css}` — `.chk-label` クラス。使用ページ: `diff_tool.html` / `ops.html`
- **カスタムラジオボタン**: `css/components/radio_pill.{less,css}` — `.radio-pill` クラス。使用ページ: `text.html`
- **ダークモード**: `[data-theme="dark"]` を `<html>` に付与することで tokens.css のダーク用変数が有効になる
  - ライトモード時: `icon-moon` 表示、`icon-sun` 非表示
  - ダークモード時: `icon-sun` 表示、`icon-moon` 非表示
- **テーマ切替フロー**:
  1. `index.html` 内インラインスクリプトで `localStorage('mytools_theme')` を読みフラッシュ防止
  2. ナビバーのテーマトグルボタン (`#theme-toggle-btn`) クリックで `_applyTheme()` が呼ばれる
  3. `_applyTheme()` は全 iframe に `postMessage({ type: 'theme-change', theme })` を送信
  4. 各ページ JS は `window.addEventListener('message', ...)` で受け取り `data-theme` を更新
- **トークン命名規則**: `--c-*` （カラー）、`--c-tooltip-*`（ツールチップ専用色）、`--shadow-*`（シャドウ）、`--radius-*`（角丸）、`--t`（トランジション）、`--font`（フォント）、`--space-*`（スペーシング）
- **ページ側エイリアス**: 各ページ LESS の `:root` で `--color-*` を `var(--c-*)` にマッピング（後方互換）。`--radius-*` は tokens.css の値をそのまま使うこと（上書き禁止）
- **ハードコード禁止**: `#fff`, `#fafbff`, `#eaecef` 等の色をページ LESS に直書きしない。`var(--c-surface)`, `var(--c-surface-raised)`, `var(--c-bg-2)` 等のトークンを使うこと（ダークモード対応のため）
- **LESS で CSS 変数をLESS変数に代入した場合**: `darken()`, `lighten()`, `fade()` 等の LESS 色関数は使用不可。`var(--c-bg-2)`, `var(--c-accent-dim)`, `var(--c-border-2)` 等の CSS 変数で代替すること
- **テーマ初期化スクリプト**: 全 HTML ページの `<head>` 先頭（defer なし）に追加必須:
  ```html
  <script>
    (function() {
      var t = localStorage.getItem('mytools_theme') ||
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      document.documentElement.setAttribute('data-theme', t);
    })();
  </script>
  <link rel="stylesheet" href="../css/core/tokens.css" />
  ```
  ※ `index.html`（ルート）では `./css/core/tokens.css`、`pages/` 配下のページでは `../css/core/tokens.css`

### HTML

- `lang="ja"` を指定する
- 外部ライブラリは CDN で読み込む（SortableJS は todo/note/dashboard で使用）
- `defer` 属性を script タグに付ける

## ファイル配置ルール

| 種別               | 配置先                                |
| ------------------ | ------------------------------------- |
| 新ページ           | `pages/<name>.html`（index.html のみルート） |
| ページ固有 JS      | `js/<name>.js` or `js/<name>/` (分割時) |
| ページ固有 CSS     | `css/<name>.{less,css}` (エントリポイント) + `css/<name>/` (パーシャル) |
| DB層 JS            | `js/db/<name>_db.js`                  |
| コアユーティリティ | `js/core/<name>.js`                   |
| UIコンポーネント   | `js/components/<name>.js`             |
| 基盤スタイル       | `css/core/<name>.{less,css}`          |
| コンポーネントCSS  | `css/components/<name>.{less,css}`    |

## DB層ファイル（js/db/）

各ページの IndexedDB 操作クラスを分離。ファイル先頭にスキーマ定義・リレーション図をコメントで記載。

| ファイル                  | クラス    | DB名          | ページ         |
| ------------------------- | --------- | ------------- | -------------- |
| `js/db/kanban_db.js`      | KanbanDB    | kanban_db     | todo.html      |
| `js/db/note_db.js`        | NoteDB      | note_db       | note.html      |
| `js/db/dashboard_db.js`   | DashboardDB | dashboard_db  | dashboard.html |
| `js/db/sql_db.js`         | SqlDB       | sql_db        | sql.html       |
| `js/db/wbs_db.js`         | WbsDB       | wbs_db        | wbs.html       |
| `js/db/timer_db.js`       | TimerDB     | timer_db      | timer.html     |
| `js/db/snippet_db.js`     | SnippetDB   | snippet_db    | snippet.html   |
| `js/db/ops_db.js`         | OpsDB       | ops_db        | ops.html       |
| `js/db/text_db.js`        | TextDB      | tools_db      | text.html      |
| `js/db/app_db.js`         | AppDB       | app_db        | index.html     |
| `js/db/activity_db.js`    | ActivityDB  | activity_db   | 全ページ共通   |

- HTML での読み込み順: `js/core/utils.js` → [`js/core/env.js` → `js/core/clipboard.js` / `js/core/notify.js`（使用ページのみ）] → `js/core/icons.js` → `js/components/*` → `js/db/<name>_db.js` → `js/<name>/*.js`
- DB クラスはページ JS より前に読み込む必要がある（グローバルクラスとして参照するため）
- 分割済みページ（todo/dashboard/note/sql/wbs/timer/ops/text/index）は `js/<name>/` 配下のモジュールを読み込む:
  - todo: state → backup → renderer → dragdrop → app
  - dashboard: constants → state → renderer → events → app
  - note: state → renderer → events → app
  - sql/wbs: constants → state → renderer → events → app
  - timer: state → renderer → events → app
  - ops: constants → state → log_viewer → cron → http_status → ports → app
  - text: constants → state → regex → encode → case → count → format → timestamp → tsv → app
  - index: constants → config → theme → shell → search → backup → settings → activity_log → app（`js/db/app_db.js` / `js/db/activity_db.js` を先に読み込む）
- 未分割ページ（snippet/diff_tool）は `js/<name>.js` の単一ファイル

## グローバル検索

- ナビバーに `#global-search-input` 検索バーを常時表示（`Ctrl+K` / `Cmd+K` でフォーカス）
- 入力 debounce（300ms）後に全 iframe へ `postMessage({ type: 'global-search', query, searchId })` を送信
- 各ページは受信後に自ページの IndexedDB を検索し `parent.postMessage({ type: 'global-search-result', searchId, page, pageSrc, results })` で返信
- 検索対象: `kanban_db.tasks`（title/description）/ `note_db.tasks`（title）+ `entries`（link: label/value、text: value）/ `snippet_db.snippets`（title/description/code）
- index.js が全結果を集約してページ別グループドロップダウンに描画（各グループ最大10件）
- 結果クリック → タブ切替 + `postMessage({ type: 'global-search-focus', targetId })` を送信
- 各ページは focus メッセージを受けてモーダル/詳細を開く
- CSS: `.global-search` / `global-search__input` / `global-search__results` (css/index/_search.less)

## アクティビティログ

- **IndexedDB**: `activity_db` version 1、ストア: `logs`（id/page/action/target_type/target_id/summary/created_at）
- インデックス: `page`、`created_at`、`[page, created_at]`（複合）
- `ActivityLogger.log(page, action, targetType, targetId, summary)`: Fire-and-forget でログ記録（`js/core/activity_logger.js`）
- `ActivityLogger.saveConfig(disabledPages)`: ページ単位の記録オン/オフ設定を保存。`app_db` の `settings` ストアに `activity_log_config` として保存
- `ActivityLogger._loadConfig()`: 起動時に設定をキャッシュ。無効化されたページの `log()` 呼び出しをスキップ
- `ActivityDB.cleanup(days=90)`: 90日以上前のログを自動削除。`App.init()` で呼び出し
- 表示: ナビバーの履歴ボタン（`Icons.history`）→ `ActivityLogModal.show()` でモーダル表示（自己挿入型、`js/index/activity_log.js`）
- CSS: `css/components/activity_log.less` / `css/components/activity_log.css`
- **ページ単位の記録オン/オフ**: 設定画面の「アクティビティログ」セクションでページごとにトグル。デフォルト全ページON。`app_db` の `settings` ストアに `{ name: 'activity_log_config', value: { disabledPages: [...] } }` として保存
- 記録対象ページ:
  - `todo`: タスク追加/削除/移動/完了/アーカイブ/一括アーカイブ/アーカイブ復元
  - `note`: ノート追加/削除
  - `snippet`: スニペット追加/削除/更新
  - `dashboard`: セクション追加/削除/更新、アイテム追加/更新/削除
  - `sql`: 接続環境追加/削除/更新、テーブル定義追加/更新/削除
  - `wbs`: タスク追加/削除/完了/完了から戻し
- 各ページに `js/db/activity_db.js` + `js/core/activity_logger.js` を読み込む（DB クラスより後、ページ固有 JS より前）
- ページ識別子: `'todo'` / `'note'` / `'snippet'` / `'dashboard'` / `'sql'` / `'wbs'`
- アクション種別: `'create'` / `'delete'` / `'archive'` / `'complete'` / `'update'` / `'move'`

## データ一括バックアップ

- 設定パネルの「データ管理 > 全データ一括バックアップ」セクションから実行
- `backupAllData()`: 全 DB（app_db/kanban_db/note_db/sql_db/wbs_db/snippet_db/dashboard_db）を `{ type: 'full_backup', version: 1, timestamp, databases: {...} }` 形式でエクスポート
- `restoreAllData()`: バックアップ JSON を読み込んで全 DB を上書き復元（確認ダイアログ → リロード）
- ファイル名: `mytools_backup_YYYYMMDD_HHmmss.json`
- ボタン名: 「バックアップ」（エクスポート）/ 「復元」（インポート）

## タブの追加方法

### 組み込みタブの追加（コード変更）

`js/index/constants.js` の `TAB_ITEMS` 配列に追記する。`isBuiltIn: true` で設定 UI から削除不可になる。

```js
{ label: "ラベル名", pageSrc: "pages/page.html", isSelected: false }
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
  - `ICON_PALETTE` 配列（`{ id, label, svg }`）で選択肢を管理（`js/index/constants.js`）
  - `_toggleIconPicker(label)` / `_onSelectIcon(btn)` で制御（`_onSelectIcon` は async）
  - 組み込みタブも SVG に変更可能
  - CSS: `.icon-picker__item svg { width: 16px; height: 16px; fill: currentColor; }` で SVG サイズ統一
  - `_deleteDashboardInstance(instanceId)` → タブ削除時に共有DBからそのインスタンスのデータを削除

## dashboard/ アーキテクチャ（2026-03現在）

- ファイル構成: `js/dashboard/constants.js`（定数）/ `state.js`（State + 変数解決）/ `renderer.js`（Renderer）/ `events.js`（EventHandlers）/ `app.js`（App）

- IndexedDB DB名: `dashboard_db` version **2**（全インスタンス共有の単一DB）
- URLパラメータ `?instance=<id>` で複数ダッシュボードタブを識別（DBは共有）
- `_instanceId = new URLSearchParams(location.search).get('instance') || ''` でファイル冒頭に定義
- `sections` ストアに `instance_id` フィールド（インデックス付き）を持ち、このIDでフィルタリング
- `window.addEventListener('message', ...)` で親フレームからの `dashboard:open-settings` を受信して設定パネルを開く
- `EventHandlers.closeSettings()` は設定パネルを閉じた後、親フレームに `dashboard:settings-closed` を postMessage
- ストア: `sections`（id/instance_id/title/icon/position/type/command_template/**action_mode**/**cmd_buttons**/columns/**width**/**page_size**/**table_bind_vars**/**table_presets**/**table_vars_ui_type**/**table_vars_bar_label**/**list_bind_vars**/**list_presets**/**list_vars_ui_type**/**list_vars_bar_label**/**grid_bind_vars**/**grid_presets**/**grid_vars_ui_type**/**grid_vars_bar_label**）+ `items`（id/section_id/position/item_type/label/hint/value/emoji/row_data/**new_row**）
- セクションタイプ: `list` | `grid` | `command_builder` | `table` | `markdown` | `iframe` | `countdown`
- アイテムタイプ: `copy` | `link` | `template`（list）/ `link` | `copy` | `template`（grid、旧 `card` は `link` 互換）/ `row`（table）
- 設定パネル: 右スライドオーバーレイ（`#home-settings`）、ギアボタン（`.home-gear-btn`）で開閉。セクション一覧はドラッグ＆ドロップ（SortableJS）で並び替え可能。`_onReorderSections(evt)` で position を一括更新
- 設定ビュー: `'sections'`（一覧）/ `'edit-section'`（セクション編集）/ `'bind-settings'`（共通バインド変数）/ `'edit-preset'`（プリセット編集）→ `State.settings.view` で管理
- テーブルセクションの列定義は `section.columns: [{id, label, type: 'text'|'copy'|'link'}]` で保持
- テーブル行の値は `item.row_data: {[col_id]: string}` で保持
- `command_builder` セクションは `cmd_buttons: [{id, label, template, action_mode}]` 配列で複数ボタンを管理。各ボタンで `{INPUT}` プレースホルダーを使う。`action_mode: 'copy'`（デフォルト）はクリップボードにコピー、`action_mode: 'open'` はブラウザで URL を開く。`cmd_buttons` が空の場合は旧 `command_template` / `action_mode` にフォールバック（後方互換）。Enter キーで最初のボタンを実行。ボタンは 6 色パレットでインデックス順に色分け（indigo→green→amber→purple→pink→teal）
- URL コマンド履歴: `localStorage("dashboard_url_history_<sectionId>")`（ブラウザ固有）
- **markdown セクション**: `section.body: string` フィールドに Markdown テキストを保存。marked.js + DOMPurify（CDN）でレンダリング。カードヘッダーの編集ボタン（`.card__hd-btn`、`toggle-md-edit` アクション）でカード内インライン編集モードに切替。設定パネルからも `edit-section-body` textarea で編集・保存可能（`save-markdown-body` アクション）。リンクは `target="_blank"`。コードブロックにコピーボタン（`.md-code-copy-btn`）
- **iframe セクション**: `section.url: string`、`section.iframe_height: number（デフォルト 400）` フィールド。sandbox 付き `<iframe>` で表示。ヘッダーに「別タブで開く」リンク。URL でバインド変数解決
- **countdown セクション**: `section.countdown_mode: 'calendar'|'business'` フィールド。items でマイルストーン管理（`label` + `value: YYYY-MM-DD`）。カードヘッダーのトグルボタン（`.card__mode-btn`）でカレンダー日/営業日を切替（`toggle-countdown-mode` アクション）。`Renderer._countBusinessDays(start, end)` で土日除外計算。超過は赤、7日以内は警告色。マイルストーン編集フォームの目標日入力は `DatePicker` カスタムピッカー（`open-countdown-date` アクション + `EventHandlers.openCountdownDatePicker(btn)`）。`dashboard.html` に `date_picker.css` / `date_picker.js` を読み込み済み
- **セクション独自バインド変数（プリセット方式）**: table/list/grid セクションで共通の仕組み。各セクションタイプ毎に変数名・プリセットを保持し `resolveSectionVars(str, sectionId)` で解決（グローバルバインド変数より先に適用）。`resolveTableVars` は後方互換 alias。
  - **テーブル**: `section.table_bind_vars`, `section.table_presets`, `section.table_vars_ui_type`, `section.table_vars_bar_label`。アクティブプリセット: `localStorage("dashboard_table_active_preset_<sectionId>")`
  - **リスト**: `section.list_bind_vars`, `section.list_presets`, `section.list_vars_ui_type`, `section.list_vars_bar_label`。アクティブプリセット: `localStorage("dashboard_list_active_preset_<sectionId>")`。ラベル・ヒントで `{変数名}` を使って置換
  - **グリッド**: `section.grid_bind_vars`, `section.grid_presets`, `section.grid_vars_ui_type`, `section.grid_vars_bar_label`。アクティブプリセット: `localStorage("dashboard_grid_active_preset_<sectionId>")`。カード名で `{変数名}` を使って置換
  - プリセットが存在する場合のみ各セクション上部にプリセットバー（`.table-preset-bar`）を表示
  - 設定画面から `open-list-bind-var-modal` / `open-grid-bind-var-modal` で BindVarModal を開く
  - `switchListPreset(sectionId, presetId)` / `switchGridPreset(sectionId, presetId)` でプリセット切替・再レンダリング
- **アイテム管理モーダル**（全画面でアイテムを管理）: 設定パネルのアイテム一覧ヘッダーの「⤢ 全画面で管理」ボタンで開く。`State.itemMgr: { sectionId, editingId, formTab: 'add'|'bulk' }` で状態管理。2カラム（左: アイテム一覧、右: 追加/編集フォーム or コピー登録フォーム）。`EventHandlers.openItemManager(sectionId)` / `closeItemManager()` / `_refreshItemManager()` で制御。CSS: `.item-mgr`（`dashboard.less`）。z-index: 400（設定パネルの 300 より上）。Esc キーで閉じる。コピー登録タブ（`formTab: 'bulk'`）では Tab 区切りのテキストを貼り付けて一括追加（`saveBulkItems(sectionId)`）。フォーマット: list=`ラベル\tヒント\t値`、grid=`絵文字\tカード名\t値`、table=`列1\t列2\t列3`、countdown=`マイルストーン名\tYYYY-MM-DD`。URL はリンク、それ以外はコピーとして自動判定。`#` で始まる行はコメント。
- モジュール構成: `DashboardDB`（`js/db/dashboard_db.js`）/ `constants.js` / `state.js` / `renderer.js` / `events.js` / `app.js`（`js/dashboard/` 配下に分割）
- レイアウト: `max-width: 1440px` + CSS Grid（`auto-fill, minmax(190px, 1fr)`）でセクションカードを複数列配置
- セクションの表示幅: `section.width = 'narrow' | 'auto' | 'w3' | 'wide' | 'w5' | 'full'`。カードに `data-width` 属性を付与し CSS でスパン制御（narrow=span 1 / auto=span 2 / w3=span 3 / wide=span 4 / w5=span 5 / full=1/-1 / ≤840px で w3以上は全幅）。セクション編集画面の「表示幅」セレクターで設定・保存
- `.settings-col-row`: `flex-wrap: nowrap` で通常表示。`:has(input)` セレクターで列編集展開時のみ `flex-wrap: wrap`
- `.data-table`: `width: auto; min-width: 100%` で列が多い時は `.data-table-wrap`（`overflow-x: auto`）で横スクロール
- **エクスポート/インポート**:
  - ダッシュボード設定パネル下部のボタンでこのインスタンスのデータ（sections/items/presets/bindConfig）をJSON出力・読込
  - `DashboardDB.exportInstance()` / `DashboardDB.importInstance(data, replace)` / `DashboardDB.deleteInstance()`
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
- **テンプレートコピー** (grid の `item_type: 'template'`):
  - `value` フィールドに複数行のテンプレートテキストを保存
  - クリック時に `resolveDateVars(resolveBindVars(value))` で日付変数・バインド変数を解決してコピー
  - 日付プレースホルダー: `{TODAY}` / `{TODAY:Fmt}` / `{NOW}` / `{DATE:±N単位}` / `{DATE:±N単位:Fmt}`
  - 相対指定単位: `d`=日 `w`=週 `M`=月 `y`=年 `h`=時間 `m`=分
  - フォーマットトークン: `YYYY` `MM` `DD` `HH` `mm` `ss` `ddd`（月）`dddd`（月曜日）
  - `resolveDateVars(str)`: テンプレート内の日付変数を解決するユーティリティ関数（`js/dashboard/state.js`）


## note/ アーキテクチャ（2026-03現在）

- ファイル構成: `js/note/state.js`（State + ヘルパー）/ `renderer.js`（Renderer）/ `events.js`（EventHandlers）/ `app.js`（App）

- IndexedDB DB名: `note_db` version **2**
- ストア: `tasks`（id/title/created_at/updated_at）+ `fields`（id/name/type/options/position/**width**/**listVisible**）+ `entries`（id/task_id/field_id/label/value/created_at）+ `note_links`（id/from_task_id/to_task_id）+ `history`（id/task_id/field_id/old_value/new_value/changed_at）
- フィールドタイプ: `link` | `text` | `date` | `select` | `label` | `dropdown` | `note_link`
- `link`: 複数エントリ可。追加ボタンあり、表示名＋URL。表示名が設定されている場合は「表示名をコピー」ボタンも表示（`copy-entry-label`アクション）
- `text`: 単一エントリ。メモ風インライン textarea（自動保存、debounce 600ms）
- `date`: 単一エントリ。カスタム DatePicker（`js/components/date_picker.js`）で選択。クリッカブルな日付表示エリア
- `select`: 単一エントリ。バッジトグル形式（単一ラベル・選択済みを再クリックで解除可能）。オプションは `{name, color}[]` 形式。管理は LabelManager（フィールド管理モーダルの「選択肢」ボタン）。フィールドタイプ表示名は「単一ラベル」
- `dropdown`: 単一エントリ。CustomSelect ドロップダウン形式（空選択可能）。オプションは `{name, color}[]` 形式。管理は LabelManager（「選択肢」ボタン）。`renderDetail` 後に `CustomSelect.replaceAll(content)` で変換。`<option data-color>` を付与することで CustomSelect が自動的に色スウォッチを表示。値は plain string。フィールドタイプ表示名は「ドロップダウン」
- `label`: バッジトグル形式（チェックボックスなし・保存ボタンなし）。クリックで即時保存。オプションは `{name, color}[]` 形式。色はインラインスタイルで適用。管理は LabelManager（フィールド管理モーダルの「ラベル」ボタン）
- タイプバッジは非表示（フィールド名のみ表示）
- `field.width`: `'narrow'`(1/6) / `'auto'`(2/6) / `'w3'`(3/6) / `'wide'`(4/6) / `'w5'`(5/6) / `'full'`(6/6)。ダッシュボードと同仕様。旧 `'half'` は `'auto'` 扱い
- `field.listVisible`: `true` のフィールドをタスク一覧に値バッジとして表示
- `.note-fields` は CSS Grid（`auto-fill, minmax(380px, 1fr)`）。≤840px は全幅
- `State.allEntries`: 全タスクのエントリキャッシュ（タスク一覧表示用）
- `State.sort`: `{ field, dir }` ソート状態。localStorage `note_sort` に永続化（`"created_at-desc"` 形式）
- `State.listFilter`: `{ [fieldId]: Set }` フィルター状態（select/label 共通で Set 形式）。localStorage `note_filter` に永続化
- `_saveFilter()` / `_loadFilter()`: フィルター状態を localStorage に保存・復元。フィールド ID をキーに JSON シリアライズ
- `EventHandlers._touchTask(db)`: 選択中タスクの `updated_at` を更新し、詳細パネルのメタ情報をインプレース更新。エントリ追加・更新・削除時に呼ぶ
- `EventHandlers._refreshDetailMeta(task)`: 詳細パネルの `.note-detail__meta` をインプレース更新（再レンダリング不要）
- フィールド名変更: フィールド管理モーダルのフィールド名をクリックしてインライン編集可能。`_onEditFieldName(btn, db)` で処理
- フィールド並び替え: フィールド管理モーダルでドラッグ＆ドロップ（SortableJS）で並び替え可能。ドラッグハンドル（`Icons.grip`）で操作。`_onReorderFields(evt)` で position を一括更新
- リンクエントリの表示順: リンクタイプのエントリは表示名（label、未設定時は URL）の昇順でソートして表示
- `Renderer.renderFilterUI()`: `listVisible=true` な select/label フィールドのフィルター UI を動的生成
- `Renderer._sortTasks()` / `Renderer._filterTasks()`: ソート・フィルター処理。テキスト検索はタイトルに加え、リンク表示名・URL・テキスト内容も対象
- `Renderer._renderFieldBadge()`: フィールドタイプ別バッジ HTML 生成
- CSS: `note.less` に `:root { --color-card, --color-border, ... }` を追加（DatePicker が参照）
- モジュール構成: `NoteDB`（`js/db/note_db.js`）/ `state.js` / `renderer.js` / `events.js` / `app.js`（`js/note/` 配下に分割）
- エクスポート/インポート: JSON形式（`type: 'note_export'`）
- **TODOとの紐づけ**: `kanban_db` の `note_links` ストアに `{ id, todo_task_id, note_task_id }` 形式で保存。詳細パネルの「TODO」セクションに表示。`Renderer.renderTodoLinks(noteTaskId)` で描画、`_openKanbanDB()` で cross-DB アクセス
- **ノート間リンク**: `note_db` の `note_links` ストアに `{ id, from_task_id, to_task_id }` 形式で保存。詳細パネルの「関連ノート」セクションに双方向表示。`NoteDB.addNoteLink(fromId, toId)` / `deleteNoteLink(id)` / `getNoteLinks(taskId)` で CRUD。重複チェック（A→B, B→A）あり。ノートピッカー（`#note-picker`）で検索・選択。リンク先クリックで遷移
- **関連ノートセクション設定**: `type: 'note_link'` フィールドとして `note_db` の `fields` ストアに保存（`width` / `visible` / `position` を持つ）。フィールド管理モーダルに「関連ノート」行（`note-field-item--builtin`）として表示し、幅・表示・並び順を設定可能。`NoteDB.ensureNoteLinkField()` で既存ユーザー向けマイグレーション
- **変更履歴**: `note_db` の `history` ストアにフィールド値変更を自動記録。`NoteDB.addHistory(record)` / `getHistory(taskId)` / `clearHistory(taskId)` / `trimHistory(taskId, maxCount)` で CRUD。タスクあたり 100 件超で古いレコードから自動削除。詳細パネルのヘッダーに履歴ボタン（`Icons.history`）→ 履歴モーダル（`#history-modal`）でタイムライン表示。日付区切り＋時刻＋フィールド名＋変更内容。「履歴をクリア」ボタンで全削除。特殊 field_id: `'__title__'`（タイトル変更）/ `'__todo_link__'`（TODOリンク追加/削除）/ `'__note_link__'`（関連ノート追加/削除）。追加（old_value空）は「＋ 値」、削除（new_value空）は「－ 値」形式で表示
- `_openKanbanDB()`: `kanban_db` を開くモジュールレベルヘルパー（`js/note/state.js` 内）
- **リアルタイム同期**: `BroadcastChannel('kanban-note-links')` で TODO↔Note 間のリンク変更を通知。todo.js がリンク追加・削除時に送信（`_noteLinksBC`）、note.js が受信して `renderTodoLinks` を再実行
- **Noteページからのリンク追加**: 詳細パネルの「TODO」セクションに「＋ 追加」ボタン。`#todo-picker` ポップアップで TODO タスクを検索・選択して紐づけ
- **TODOセクション設定**: `type: 'todo'` フィールドとして `note_db` の `fields` ストアに保存（`width` / `visible` / `position` を持つ）。フィールド管理モーダルに「TODOリンク」行（`note-field-item--builtin`）として表示し、幅・表示・並び順を設定可能。`NoteDB.ensureTodoField()` で既存ユーザー向けマイグレーション

## sql/ アーキテクチャ（2026-03現在）

- ファイル構成: `js/sql/constants.js`（定数）/ `state.js`（State + トースト + ヘルパー）/ `renderer.js`（DOM描画）/ `events.js`（CRUD・イベント）/ `app.js`（App初期化）

- IndexedDB DB名: `sql_db` version **2**
- ストア: `envs` + `table_memos`
- `table_memos`: id/schema_name/table_name/comment/columns[]/indexes[]/memo/created_at/updated_at
- バインド変数: localStorage（`sql_params`）。選択中環境キー: localStorage（`sql_selected_env`）
- チューニング詳細の開閉状態: localStorage（`sql_tune_open`）。テーブル定義メモの開閉状態: localStorage（`sql_memo_open`）。チューニングガイド選択タブ: localStorage（`sql_tune_tab`）
- モジュール構成: `SqlDB`（`js/db/sql_db.js`）/ `constants.js` / `state.js` / `renderer.js` / `events.js` / `app.js`（`js/sql/` 配下に分割）
- **テーブル定義メモ拡張機能**:
  - **カラム横断検索**: テーブル名・スキーマ名だけでなく、カラム名・型・コメント・インデックス名・メモ本文も検索対象。ヒット箇所を `<mark class="memo-highlight">` でハイライト、カラム/インデックス/メモにヒットした場合は `<details>` を自動展開
  - **カラム一覧ビュー**: `_memoViewMode` (`'table'` | `'column'`) でビュー切替。カラムビューは全テーブルのカラムをフラットなグリッドで横断表示。ツールバーのアイコンボタンで切替
  - **テーブル間リレーション**: `_buildColumnRelations(memos)` で同名カラムを持つテーブルを自動検出。各テーブルの展開詳細に「関連テーブル」セクションを表示
  - **カラムコピー**: カラム定義セクションのタイトル行に「カラム名」「SELECT文」コピーボタンを配置。`Clipboard.copy` を使用
  - **テーブル比較**: 比較モーダル（`#memo-compare-modal`）で 2 テーブルを選択し差分表示。`renderCompareResult(memoA, memoB)` でカラム有無・型・NULL可・PK・コメントを比較。差分は色分け表示（only-a=赤、only-b=青、diff=黄）

## wbs/ アーキテクチャ（2026-03現在）

- ファイル構成: `js/wbs/constants.js`（定数・祝日計算・営業日ユーティリティ）/ `state.js`（State + 日付ユーティリティ + ガントレイアウト + 親子集計）/ `renderer.js`（Renderer）/ `events.js`（EventHandlers）/ `app.js`（App）

- IndexedDB DB名: `wbs_db` version **1**
- ストア: `tasks`（id/title/level/position/plan_start/plan_days/actual_start/actual_end/progress/status/memo）
- ステータス: `not_started` | `in_progress` | `done` | `on_hold`
- `WbsDB.getAllTasks()` → position 昇順で全タスク取得
- `WbsDB.addTask(task)` / `updateTask(task)` / `deleteTask(id)` / `bulkUpdate(tasks)`
- `WbsDB.exportAll()` / `importAll(json)` → JSON バックアップ
- 営業日計算ユーティリティ（`js/wbs/constants.js` 内）:
  - `addBusinessDays(startStr, days, customSet)` → 開始日から N 営業日後の日付
  - `countBusinessDays(startStr, endStr, customSet)` → 区間の営業日数（両端含む）
  - `isNonWorkingDay(date, customSet)` → 土日・祝日・カスタム休業日の判定
  - `getJapaneseHolidays(year)` → 日本の祝日 Set（春分・秋分・振替休日・ハッピーマンデー含む）
- カスタム休業日: `localStorage('wbs_custom_holidays')` に `[{ date:'YYYY-MM-DD', name:string }]` 形式で保存
- ガントチャート:
  - `DAY_PX = 22`（1日の横幅 px）
  - 表示期間は `calcDisplayPeriod()` でタスクの日付から自動計算（前2週・後3週マージン、月初/月末に丸め）
  - 予定バー（上段 `top:8px, h:11px`）と実績バー（下段 `top:21px, h:11px`）を同じ高さで表示
  - バーのホバーは `Tooltip.init()` でカスタムツールチップ表示（`data-tooltip` 属性）
  - 横スクロール位置は `localStorage('wbs_gantt_scroll_x')` に記憶、初回は今日を中央に表示
  - テーブル側と縦スクロール同期。ガントヘッダーと横スクロール同期
- モジュール構成: `WbsDB`（`js/db/wbs_db.js`）/ `constants.js` / `state.js` / `renderer.js` / `events.js` / `app.js`（`js/wbs/` 配下に分割）

## timer/ アーキテクチャ（2026-03現在）

- ファイル構成: `js/timer/state.js`（State + フォーマットヘルパー + 通知音）/ `renderer.js`（描画）/ `events.js`（EventHandlers + タイマー制御）/ `app.js`（App）
- IndexedDB DB名: `timer_db` version **1**
- ストア: `presets`（id/name/work_sec/break_sec/position）+ `sessions`（id/task_name/tag/notes/duration_sec/started_at/ended_at）
- モジュール構成: `TimerDB`（`js/db/timer_db.js`）/ `state.js` / `renderer.js` / `events.js` / `app.js`（`js/timer/` 配下に分割）
- `State.mode`: `'work'` | `'break'` でフェーズ管理
- `State.historyView`: `'today'` | `'week'` で表示期間切替。localStorage `timer_history_view` に永続化
- アクティブプリセットID: localStorage `timer_active_preset` に永続化
- 通知: Web Notifications API + AudioContext ビープ音
- タイマーカウントダウンは Blob インライン Web Worker で実行（バックグラウンドタブでもスロットリングされず正確に発火）。`_createTimerWorker()`（`state.js`）で生成、`setupEvents()`（`events.js`）で `onmessage` を登録。Worker 内も壁時計時間ベース。`file://` 等 Worker 非対応環境では `setInterval` + 壁時計時間フォールバック
- **タイマー状態永続化**: タイマーの実行状態（残り時間・モード・タスク名・タグ等）を localStorage `timer_running_state` に毎秒保存。ブラウザのタブ破棄（Memory Saver）やページリロード時に `_restoreTimerState()` で復元。経過時間は壁時計時間ベースで補正。タイマーが破棄中に完了していた場合は `onPhaseEnd()` を実行
- デフォルトプリセット: ポモドーロ（25/5）/ 短いポモドーロ（15/3）/ 長い集中（50/10）

## ops/ アーキテクチャ（2026-03現在）

- ファイル構成: `js/ops/constants.js`（定数定義）/ `state.js`（State + タブ切替）/ `log_viewer.js`（ログビューア）/ `cron.js`（cron式エディタ）/ `http_status.js`（HTTPステータスコード辞典）/ `ports.js`（ポート番号リファレンス）/ `app.js`（初期化 + イベントバインド）
- IndexedDB DB名: `ops_db` version **1**
- ストア: `ports`（id/port/protocol/service/memo/position）
- セクション: `log-viewer` | `cron` | `http-status` | `ports`
- `switchSection(tool)`: タブ切替 + 遅延初期化（HTTP/ポート/cronは初回表示時に初期化）
- モジュール構成: `OpsDB`（`js/db/ops_db.js`）/ `constants.js` / `state.js` / `log_viewer.js` / `cron.js` / `http_status.js` / `ports.js` / `app.js`（`js/ops/` 配下に分割）

## text/ アーキテクチャ（2026-03現在）

- ファイル構成: `js/text/constants.js`（定数定義）/ `state.js`（State + タブ切替）/ `regex.js`（正規表現テスター）/ `encode.js`（エンコード/デコード）/ `case.js`（ケース変換）/ `count.js`（文字カウント）/ `format.js`（フォーマッタ）/ `timestamp.js`（タイムスタンプ変換）/ `tsv.js`（TSV/CSV変換）/ `app.js`（初期化 + イベントバインド）
- IndexedDB DB名: `text_db` version **1**
- セクション: `regex` | `encode` | `case` | `count` | `format` | `timestamp` | `tsv`
- `switchSection(tool)`: タブ切替 + 遅延初期化
- モジュール構成: `TextDB`（`js/db/text_db.js`）/ `constants.js` / `state.js` / 各ツールモジュール / `app.js`（`js/text/` 配下に分割）

## index/ アーキテクチャ（2026-03現在）

- ファイル構成: `js/index/constants.js`（TAB_ITEMS・ICON_PALETTE）/ `db.js`（AppDB）/ `theme.js`（テーマ切替）/ `shell.js`（シェル・ナビ・ビューポート）/ `search.js`（グローバル検索）/ `backup.js`（一括バックアップ）/ `settings.js`（タブ設定パネル）/ `app.js`（App初期化）
- CSS: `css/index.less`（エントリポイント）+ `css/index/_variables.less` / `_shell.less` / `_viewport.less` / `_settings.less` / `_search.less`（パーシャル）
- **iframe ショートカット転送**: `_attachIframeShortcuts(frame)`（`shell.js`）で各 iframe の `contentDocument` に keydown リスナーを付与。iframe にフォーカスがあっても Ctrl+K / Ctrl+1-9 / Ctrl+Shift+E が親フレーム側で処理され `e.preventDefault()` でブラウザデフォルト動作を抑制。Ctrl+, は転送せずページ側に委譲（ダッシュボード等のページ固有設定パネルを優先するため）。iframe load 時に `register-parent-shortcuts` メッセージでナビゲーションショートカット定義も送信
- **Ctrl+, 設定パネル開閉**: 親フレームにフォーカスがある場合、`postMessage({ type: 'toggle-page-settings' })` をアクティブ iframe に送信。iframe がページ固有設定を処理した場合は `parent.postMessage({ type: 'page-settings-handled' })` で応答。50ms 以内に応答がなければ親のタブ設定パネルを開く。タブ設定パネルは Ctrl+, の再入力で閉じる（ESC では閉じない）。対応ページ: note（フィールド管理）/ dashboard（設定パネル）

## 注意事項

- **マルチ環境対応**: `file://` / localhost / Tauri デスクトップアプリの3形態で動作する。環境差異は `js/core/env.js` / `clipboard.js` / `notify.js` で吸収。`file://` ではクリップボードが `execCommand` フォールバック、通知は非対応
- 全ページ IndexedDB でデータを永続化するため `file://` でも動作する
- localStorage はテーマ・UI状態（選択中タブ・スクロール位置・フィルター等）のみに使用するため、ローカルファイルアクセスでも制限なし
- LESS ファイルを編集した場合は `npx lessc <src>.less <dst>.css` で必ず CSS を再生成する
- `dashboard.html` にはアカウント情報やスプレッドシートIDが含まれる場合がある。Git にコミットする際は注意する
- **キャッシュバスティング**: リリースワークフロー（`release.yml`）で全 HTML ファイルの CSS/JS 参照に `?v=<タグ名>` を自動付与。開発中は手動でブラウザキャッシュクリアが必要
