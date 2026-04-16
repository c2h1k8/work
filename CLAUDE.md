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
|---|---|---|
| データ本体（タスク・環境設定・ラベルなど） | **IndexedDB** | エクスポート/インポートで他ブラウザと共有可能にするため |
| UI 選択状態（開閉状態・選択中タブなど） | **localStorage** | ブラウザ固有の操作状態。他ブラウザで共有不要 |
| タブ設定（TAB_CONFIG） | **IndexedDB** (`app_db`) | 他ブラウザとも共有したい設定データのため |

localStorage 操作は `js/core/local_storage.js` の `saveToStorage` / `loadFromStorage` / `saveToStorageWithLimit` / `loadJsonFromStorage` を使う。キー名はページプレフィックス付きで命名する（例: `sql_selected_env`, `timer_history_view`）。

### JavaScript

**全ページ Vanilla JS。コメントは日本語。**

#### コアユーティリティ（禁止事項厳守）

| モジュール | API | 禁止 |
|---|---|---|
| `js/core/utils.js` | `escapeHtml` / `sortByPosition` / `getString` / `isValidUrl` | — |
| `js/core/env.js` | `Env.type` / `Env.isTauri` / `Env.isLocalhost` / `Env.isFile` | — |
| `js/core/clipboard.js` | `Clipboard.copy(text)` → Promise | `navigator.clipboard.writeText` 直接使用禁止 |
| `js/core/opener.js` | `Opener.open(url)` / `Opener.intercept(root)` | `window.open` 直接使用禁止 |
| `js/core/file_saver.js` | `FileSaver.save(content, defaultName, opts?)` | Blob+`<a>.click()` 直接書き禁止 |
| `js/core/notify.js` | `Notify.send(title, body)` / `requestPermission()` / `getPermission()` | `Notification` API 直接使用禁止 |
| `js/core/icons.js` | `Icons.<name>` | JS 生成 HTML に SVG 直書き禁止。新アイコンは icons.js に追記してから使う |

#### コンポーネント

- **Toast**（全ページ）: `Toast.success(msg)` / `Toast.error(msg)` — 各ページに `const showSuccess = (msg) => Toast.success(msg);` ラッパーを定義
- **ShortcutHelp**（全ページ）: `ShortcutHelp.register(categories)` で登録。z-index: 500
- **DatePicker**: `DatePicker.open(cur, onSelect, onClear)` — 自己挿入型（HTML 配置不要）
- **LabelManager**: `LabelManager.open({ title, labels: [{id,name,color}], onAdd, onUpdate, onDelete, onChange })` — 自己挿入型
- **BindVarModal**: `BindVarModal.open({...})` / `BindVarModal.close()` — 自己挿入型
- **CustomSelect**: `CustomSelect.replaceAll(container)` — `cs-target` クラス付き `<select>` を一括置換。`<option data-color="#hex">` で色反映。動的生成時は `innerHTML` 設定後に `replaceAll` を呼ぶ
- **Tooltip**: `Tooltip.init(container, selector?)` — `data-tooltip` 属性が対象

#### JS 読み込み順

```
utils.js → [env.js → clipboard.js / notify.js / opener.js / file_saver.js] → icons.js
→ components/* → activity_db.js → activity_logger.js → <page>_db.js → js/<page>/*.js
```

分割ページのモジュール順:
- todo: `state → backup → renderer → dragdrop → app`
- dashboard: `constants → state → renderer → events → app`
- note: `state → renderer → events → app`
- sql / wbs: `constants → state → renderer → events → app`
- timer: `state → renderer → events → app`
- ops: `constants → state → log_viewer → cron → http_status → ports → app`
- text: `constants → state → regex → encode → case → count → format → timestamp → tsv → app`
- index: `constants → db → theme → shell → search → backup → settings → activity_log → app`

### CSS / LESS

- **スタイルは必ず `.less` を編集すること。`.css` を直接編集してはいけない**
- 編集後は `npx lessc <src>.less <dst>.css` で必ず再生成する
- **`.less` ファイルを追加・削除した場合は `.github/workflows/release.yml` の「Build CSS from LESS」ステップも必ず更新すること**（新規ページ HTML 追加時は ZIP 作成ステップも更新）
- 基盤: `css/core/tokens.{less,css}`（デザイントークン）/ `css/core/ui.{less,css}`（共通 UI・btn バリアント）
- コンポーネント: `css/components/<name>.{less,css}`
- ページ: `css/<page>.less`（エントリポイント）+ `css/<page>/`（パーシャル分割）

### デザインシステム

- **トークン命名**: `--c-*`（色）/ `--shadow-*`（影）/ `--radius-*`（角丸）/ `--space-*`（余白）/ `--t`（transition）
- **共通 UI**: `css/core/ui.less` — リセット / body 基本 / `.btn` バリアント定義済み。ページ LESS に重複定義しない
- **ハードコード禁止**: 色を LESS に直書きしない。必ず `var(--c-*)` トークンを使う（ダークモード対応のため）
- **LESS 色関数禁止**: CSS 変数を LESS 変数に代入して `darken()` / `lighten()` 等は使えない。`var(--c-bg-2)` 等で代替
- **ダークモード**: `[data-theme="dark"]` を `<html>` に付与。切替は全 iframe に `postMessage({ type: 'theme-change', theme })` で伝播
- **テーマ初期化スクリプト**: 全 HTML の `<head>` 先頭（defer なし）に必須:
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
  ※ index.html（ルート）は `./css/core/tokens.css`、`pages/` 配下は `../css/core/tokens.css`

### HTML

- `lang="ja"` を指定する
- 外部ライブラリは `vendor/` フォルダにローカル配置（CDN 不使用）。ライブラリ一覧は README.md 参照
- `defer` 属性を script タグに付ける

## ファイル配置ルール

| 種別 | 配置先 |
|---|---|
| 新ページ | `pages/<name>.html`（index.html のみルート） |
| ページ固有 JS | `js/<name>.js` or `js/<name>/`（分割時） |
| ページ固有 CSS | `css/<name>.{less,css}` + `css/<name>/`（パーシャル） |
| DB 層 | `js/db/<name>_db.js` |
| コアユーティリティ | `js/core/<name>.js` |
| UI コンポーネント | `js/components/<name>.js` + `css/components/<name>.{less,css}` |
| 基盤スタイル | `css/core/<name>.{less,css}` |

## DB 層（js/db/）

各ページの IndexedDB 操作クラスを分離。ファイル先頭にスキーマ定義・リレーション図をコメントで記載。

| ファイル | クラス | DB 名 | ページ |
|---|---|---|---|
| `kanban_db.js` | KanbanDB | kanban_db | todo.html |
| `note_db.js` | NoteDB | note_db | note.html |
| `dashboard_db.js` | DashboardDB | dashboard_db | dashboard.html |
| `sql_db.js` | SqlDB | sql_db | sql.html |
| `wbs_db.js` | WbsDB | wbs_db | wbs.html |
| `timer_db.js` | TimerDB | timer_db | timer.html |
| `snippet_db.js` | SnippetDB | snippet_db | snippet.html |
| `ops_db.js` | OpsDB | ops_db | ops.html |
| `text_db.js` | TextDB | tools_db | text.html |
| `app_db.js` | AppDB | app_db | index.html |
| `activity_db.js` | ActivityDB | activity_db | 全ページ共通 |

## ページ別アーキテクチャ

詳細な実装仕様は `docs/architecture/<page>.md` を参照。

### index（タブナビ）

- `app_db` の `settings` ストアに `tab_config` を保存。`AppDB.get(name)` / `AppDB.set(name, value)`
- 組み込みタブ追加: `js/index/constants.js` の `TAB_ITEMS` に追記（`isBuiltIn: true` で削除不可）
- グローバル検索（Ctrl+K）: 各 iframe へ `postMessage` で中継 → 結果を集約してドロップダウン表示
- ショートカット転送: iframe フォーカス中も Ctrl+K / Ctrl+1-9 / Ctrl+[ / Ctrl+] / Ctrl+Shift+E は親で処理。Ctrl+, はページ側委譲
- アイコン変更: `ICON_PALETTE` 配列（`js/index/constants.js`）。SVG 文字列を `icon` フィールドに保存

### todo（Kanban）

- `kanban_db` version 2。ストア: `tasks` / `columns` / `labels` / `task_labels` / `templates` / `archives` / `dependencies` / `note_links`
- `State.tasks`: カラムキー→タスク配列の動的マップ。`State.columns`: `{ id, key, name, position, done? }`
- **DnD（SortableJS `forceFallback: true`）**: Tauri WKWebView では HTML5 DnD API が使えないためフォールバックを使用。フォールバック時は `.card__title` / `.card__btn` を `filter` 対象にして `preventOnFilter: false` を設定し、クリックイベントがインターセプトされないようにすること。
- **詳細: `docs/architecture/todo.md`**

### dashboard

- `dashboard_db` version 2。`?instance=<id>` で複数タブを識別（DB は共有）
- セクションタイプ: `list` | `grid` | `command_builder` | `table` | `markdown` | `iframe` | `countdown`
- バインド変数: 共通（`resolveBindVars`）＋セクション固有（`resolveSectionVars`）の 2 段階で解決
- **詳細: `docs/architecture/dashboard.md`**

### note

- `note_db` version 2。ストア: `tasks` / `fields` / `entries` / `note_links` / `history`
- フィールドタイプ: `link` | `text` | `date` | `select` | `label` | `dropdown` | `note_link` | `todo`（builtin）
- **詳細: `docs/architecture/note.md`**

### sql

- `sql_db` version 2。ストア: `envs` / `table_memos`
- テーブル定義メモ: カラム横断検索 / カラム一覧ビュー（table/column 切替）/ テーブル間リレーション自動検出 / テーブル比較モーダル

### wbs（ガントチャート）

- `wbs_db` version 1。ストア: `tasks`（level / position / plan_start / plan_days / actual_start / actual_end / progress / status / memo）
- 営業日計算ユーティリティ（constants.js）: `addBusinessDays` / `countBusinessDays` / `isNonWorkingDay` / `getJapaneseHolidays`
- ガント: `DAY_PX = 22`。予定バー（上段）と実績バー（下段）。横スクロール位置を localStorage に記憶
- DnD（SortableJS）: グループ移動時は選択タスク + 全子孫を一括 splice

### timer（ポモドーロ）

- `timer_db` version 1。ストア: `presets`（work_sec/break_sec）/ `sessions`（task_name/tag/duration_sec/started_at/ended_at）
- Web Worker ベースのカウントダウン（バックグラウンドタブ対応）。`file://` は setInterval フォールバック
- タイマー状態を localStorage `timer_running_state` に毎秒保存。タブ破棄後に `_restoreTimerState()` で復元

### ops

- `ops_db` version 1。ストア: `ports`
- セクション: `log-viewer` | `cron` | `http-status` | `ports`。初回表示時に遅延初期化

### text

- `text_db` version 1（永続化なし、将来拡張用）
- セクション: `regex` | `encode` | `case` | `count` | `format` | `timestamp` | `tsv`。初回表示時に遅延初期化

### snippet / diff_tool

- 未分割単一ファイル（`js/snippet.js` / `js/diff_tool.js`）
- snippet: `snippet_db` version 1

## アクティビティログ

- `activity_db`（`logs` ストア）。`ActivityLogger.log(page, action, targetType, targetId, summary)` で fire-and-forget 記録
- 90 日以上前のログを `App.init()` で自動削除（`ActivityDB.cleanup(days=90)`）
- 記録対象ページ: todo / note / snippet / dashboard / sql / wbs
- アクション種別: `'create'` / `'delete'` / `'archive'` / `'complete'` / `'update'` / `'move'`
- 表示: ナビバー履歴ボタン → `ActivityLogModal.show()`（`js/index/activity_log.js`）

## データ一括バックアップ

- 設定パネルの「データ管理」から `backupAllData()` / `restoreAllData()` を実行
- 形式: `{ type: 'full_backup', version: 1, timestamp, databases: {...} }`
- ファイル名: `mytools_backup_YYYYMMDD_HHmmss.json`

## 注意事項

- **マルチ環境対応**: `file://` / localhost / Tauri の 3 形態で動作。環境差異は `js/core/env.js` 系で吸収
- **キャッシュバスティング**: release.yml でビルド時に `?v=<タグ名>` を全 HTML の CSS/JS 参照へ自動付与。開発中はブラウザキャッシュクリアが必要
- LESS 編集後は必ず `npx lessc <src>.less <dst>.css` で再生成する
- `dashboard.html` にアカウント情報が含まれる場合あり。Git コミット前に確認する
