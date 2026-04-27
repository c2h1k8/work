# dashboard/ アーキテクチャ詳細

## ファイル構成

`js/dashboard/`: `constants.js`（定数）/ `state.js`（State + 変数解決）/ `renderer.js`（Renderer）/ `events.js`（EventHandlers）/ `app.js`（App）

## IndexedDB スキーマ

DB 名: `dashboard_db` version **2**（全インスタンス共有の単一 DB）

| ストア | 主なフィールド |
|---|---|
| `sections` | id / instance_id / title / icon / position / type / command_template / action_mode / cmd_buttons / columns / width / page_size / table_bind_vars / table_presets / table_vars_ui_type / table_vars_bar_label / list_bind_vars / list_presets / list_vars_ui_type / list_vars_bar_label / grid_bind_vars / grid_presets / grid_vars_ui_type / grid_vars_bar_label / body / url / iframe_height / countdown_mode |
| `items` | id / section_id / position / item_type / label / hint / value / emoji / row_data / new_row / use_count |
| `presets` | id / instance_id / name / position / values: {[varName]: string} |
| `app_config` | keyPath: name（`bind_config_{instanceId}` として varNames / uiType を保存） |

## マルチインスタンス

- URL パラメータ `?instance=<id>` で複数ダッシュボードタブを識別（DB は共有）
- `_instanceId = new URLSearchParams(location.search).get('instance') || ''` でファイル冒頭に定義
- `sections` に `instance_id` フィールド（インデックス付き）を持ちフィルタリング

## セクションタイプと アイテムタイプ

| セクションタイプ | アイテムタイプ |
|---|---|
| `list` | `copy` / `link` / `template` |
| `grid` | `link` / `copy` / `template`（旧 `card` は `link` 互換） |
| `table` | `row` |
| `command_builder` | — |
| `markdown` | — |
| `iframe` | — |
| `countdown` | （`label` + `value: YYYY-MM-DD`） |

## バインド変数（2段階解決）

1. **セクション固有バインド変数** `resolveSectionVars(str, sectionId)` が先に適用
   - table: `section.table_bind_vars` / `table_presets` / `table_vars_ui_type` / `table_vars_bar_label`
   - list: `section.list_bind_vars` / `list_presets` / ...
   - grid: `section.grid_bind_vars` / `grid_presets` / ...
   - アクティブプリセット: `localStorage("dashboard_table_active_preset_<sectionId>")` 等
2. **共通バインド変数** `resolveBindVars(str)` が後に適用
   - 選択中プリセット ID: `localStorage("dashboard_active_preset_{instanceId}")`
   - `{INPUT}` はスキップ

プリセットが存在する場合のみプリセットバー（`.table-preset-bar`）を表示。

## テンプレートコピー（grid の `item_type: 'template'`）

クリック時に `resolveDateVars(resolveBindVars(value))` で解決してコピー。

日付プレースホルダー: `{TODAY}` / `{TODAY:Fmt}` / `{NOW}` / `{DATE:±N単位}` / `{DATE:±N単位:Fmt}`
相対指定単位: `d`=日 `w`=週 `M`=月 `y`=年 `h`=時間 `m`=分
フォーマットトークン: `YYYY` `MM` `DD` `HH` `mm` `ss` `ddd`（月）`dddd`（月曜日）

## セクション別補足

**markdown**: `section.body: string` に Markdown を保存。marked.js + DOMPurify でレンダリング。カードヘッダー編集ボタン（`toggle-md-edit`）でインライン編集。コードブロックにコピーボタン（`.md-code-copy-btn`）

**iframe**: `section.url` / `section.iframe_height`（デフォルト 400）。sandbox 付き。URL でバインド変数解決

**countdown**: `section.countdown_mode: 'calendar'|'business'`。`Renderer._countBusinessDays()` で土日除外。超過=赤、7日以内=警告色。目標日入力は `DatePicker`

**command_builder**: `cmd_buttons: [{id, label, template, action_mode}]` 配列で複数ボタン管理。`action_mode: 'copy'` / `'open'`。`cmd_buttons` が空なら旧 `command_template` にフォールバック。Enter で最初のボタン実行。ボタンは 6 色パレットで色分け（indigo→green→amber→purple→pink→teal）

## 設定パネル

- 右スライドオーバーレイ（`#home-settings`）。`State.settings.view` で管理
- ビュー: `'sections'`（一覧）/ `'edit-section'`（編集）/ `'bind-settings'`（共通バインド）/ `'edit-preset'`（プリセット編集）
- `EventHandlers.closeSettings()` 後に親フレームへ `dashboard:settings-closed` を postMessage
- Ctrl+, 受信（`toggle-page-settings`）で設定パネル開閉。処理後 `page-settings-handled` を返信

## アイテム管理モーダル

全画面管理（z-index: 400）。`State.itemMgr: { sectionId, editingId, formTab: 'add'|'bulk' }` で管理。
コピー登録タブ（`formTab: 'bulk'`）は Tab 区切りテキストを貼り付けて一括追加。
- list: `ラベル\tヒント\t値`
- grid: `絵文字\tカード名\t値`
- table: `列1\t列2\t列3`
- countdown: `マイルストーン名\tYYYY-MM-DD`

URL はリンク、それ以外はコピーとして自動判定。`#` で始まる行はコメント。

## レイアウト

`max-width: 1440px` + CSS Grid（`auto-fill, minmax(190px, 1fr)`）。
セクション幅: `section.width = 'narrow'|'auto'|'w3'|'wide'|'w5'|'full'`（`data-width` 属性で CSS スパン制御）

## エクスポート/インポート

`DashboardDB.exportInstance()` / `importInstance(data, replace)` / `deleteInstance()`
フォーマット: `{ type: 'dashboard_export', version: 2, instanceId, sections, items, presets, bindConfig }`
旧フォーマット（`environments`/`envConfig`）も後方互換で読み込む。

## 使用頻度ソート

list/table セクションのみ対象（grid は対象外）。`use_count` を IndexedDB に記録。
`DashboardDB.incrementUseCount(itemId)` / `clearUseCounts(sectionId)`
ソート状態: `localStorage(SORT_BY_USAGE_PREFIX + sectionId)`
