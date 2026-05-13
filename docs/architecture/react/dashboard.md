# dashboard React 版アーキテクチャ

## ファイル構成

```
src/pages/DashboardPage.tsx   メインコンポーネント
src/db/dashboard_db.ts        Dexie.js（dashboard_db）
```

## DB スキーマ

Vanilla JS 版と完全互換。詳細スキーマ・セクションタイプ・バインド変数仕様: @docs/architecture/vanilla/dashboard.md

DB 名: `dashboard_db` version 2
ストア: `sections` / `items` / `presets` / `app_config`

## React 版固有

- インスタンスID: `useTabLabel()` フック（`src/contexts/TabContext.ts`）で取得
  - Vanilla 版の `?instance=<id>` URL パラメータの代替
- Markdown: `react-markdown` + `rehype-sanitize`（Vanilla の marked.js + DOMPurify とは異なる）
- DnD: `@dnd-kit/core` + `@dnd-kit/sortable`

## コンポーネント構成

| コンポーネント | 役割 |
|---|---|
| `DashboardPage` | メインコンポーネント（state 管理・DnD・load） |
| `SectionCard` | セクションカード（折りたたみ・左ボーダーホバー・md編集ボタン） |
| `ListSection` | リスト（全幅行・ホバーアイコン・インラインフィルター） |
| `GridSection` | グリッド（横並び sheet-card スタイル） |
| `TableSection` | テーブル（インラインフィルター・列非表示/並び替え・利用回数列） |
| `ColumnManagerPopover` | 列管理ポップオーバー（iOS トグル・DnD 並び替え・仮想列対応・列順リセット） |
| `SortableColRow` | DnD 対応列行（列管理ポップオーバー内） |
| `CommandBuilderSection` | コマンドビルダー（cmd_buttons 複数ボタン対応） |
| `MemoSection` | コンテンツ系セクション |
| `ChecklistSection` | チェックリスト（インライン追加・編集・削除・DnD 並び替え） |
| `SortableChecklistItem` | チェックリスト1行（useSortable・ドラッグハンドル・カスタム checkbox・インライン編集） |
| `MarkdownSection` | Markdown（editing/onToggleEdit props で SectionCard から制御） |
| `IframeSection` | 埋め込み iframe |
| `CountdownSection` | カウントダウン（インライン追加・編集・削除・日付変更） |
| `SectionEditModal` | セクション追加/編集モーダル |
| `ItemManagerModal` | アイテム管理モーダル（スプレッドシートUX。全タイプ統一レイアウト） |
| `TemplateEditModal` | テンプレートアイテム編集サブモーダル（z-[450]。ラベル・ヒント・テンプレート textarea・日付プレースホルダー説明） |
| `SpreadsheetCell` | スプレッドシートセル（未選択/選択/編集の3状態。選択→再クリック or Enter で編集モード。`isCellDirty` で薄い青背景） |
| `SortableEditableRow` | インライン編集テーブル行（useSortable を `<tr>` に適用。SpColDef 列定義・タイプ選択 compact `<Select>`・新規行は琥珀背景・変更行は青ボーダー・`dirtyCellKeys` でセル単位ハイライト） |
| `BindVarPanel` | バインド変数設定パネル（2カラム: 左 `w-96`=変数設定・表示形式横並び・バーラベル、右=プリセット検索＋一覧 or 追加/編集フォーム）。完全コールバック駆動で DB を呼ばない。`formState` prop で右列をフォーム/リスト切替。変数名タグをクリックで選択 → タグ下の編集エリアで名前を変更 |
| `SectionJumpNav` | 固定ジャンプナビ（3件以上で右上に表示） |
| `SortableSettingsRow` | 設定パネル内ドラッグ可能セクション行（アイテム管理ボタン付き） |
| `BindVarModal` | 汎用バインド変数モーダル（`BindVarPanel` を内包）。`title?`・`zIndex?` とデータ/コールバックをすべて props で受け取る。固定高さ `h-[560px]`・幅 `w-[720px]`。`formState` 管理（フォーム表示時はヘッダーに戻るボタン） |
| `DashboardSettingsPanel` | 設定パネル（セクション一覧・追加フォーム） |

## core ユーティリティ使用

- クリップボード: `Clipboard.copy()`（`navigator.clipboard.writeText` 直接使用禁止）
- URL オープン: `Opener.open()`（`window.open` 直接使用禁止）
- エクスポート: `FileSaver.save()`（`<a>` 直接生成禁止）

## SectionEditModal

- `table` / `list` / `grid` タイプ時に「バインド変数を設定」ボタン → `BindVarModal`（z-[500]）でセクション固有バインド変数とプリセットを編集
  - セクション固有の `BindVarModal`: 変数・プリセット変更のたびに `dashboardDB.patchSection()` で即時 DB 保存（共通バインド変数と同じ動作）。ローカル state も並行更新。新規セクション（ID なし）のみ section 保存時に一括保存
- 保存時は全タイプの `*_bind_vars` / `*_presets` を含めて保存（既存データ消失バグ修正済み）
- **タイプ変更制限**: `items` prop（呼び出し元から渡す）でアイテム数を参照。アイテムが1件以上ある場合はタイプ Select を `pointer-events-none opacity-50` で無効化しヒントを表示
- **フッター**: キャンセルボタンなし（右上 × ボタンと重複のため削除）。削除ボタン（左）+ 保存ボタン（右）のみ
- **list フィルターバー**: しきい値入力廃止。トグル（`show_filter: true/false`、デフォルト false=非表示）に変更。`<div className="space-y-2">` でラップしてバインド変数ボタンと視覚的グループ化
- **table 列定義**: ページサイズ入力が列定義より**上**に配置。列行は `SortableColumnRow`（`useSortable`）で DnD 並び替え対応（ドラッグハンドルが行頭セル）。列タイプ Select は `<div className="w-20 shrink-0">` で幅固定
- **ItemManagerModal 一覧タブ**: list・table タイプかつアイテムが1件以上の場合に「使用回数をリセット」ボタンを表示（`dashboardDB.clearUseCounts` 呼び出し）

## DashboardSection 追加フィールド（React版）

| フィールド | 型 | 用途 |
|---|---|---|
| `new_row` | `boolean?` | セクション行頭から開始（`gridColumn: 1 / span N`）。Vanilla JS版の `newRow` と互換読み取りあり |
| `show_filter` | `boolean?` | list: フィルターバー表示（デフォルト false=非表示） |
| `history_limit` | `number?` | command_builder: 履歴保持上限（デフォルト10） |
| `checklist_reset` | `'never'\|'daily'\|'weekly'\|'monthly'\|'yearly'?` | checklist: 自動リセット方式 |

## グリッドアイテム追加機能

- `DashboardItem.new_row`: グリッドアイテムを行頭に配置（`gridColumnStart: 1`）
- アイテム管理モーダルの「追加/編集」タブで「行頭から配置する」チェックボックスから設定

## セクション固有バインド変数の表示形式

- `*_vars_ui_type`（pill / segment / tabs / select）と `*_vars_bar_label` がセクション編集モーダルの SectionVarEditor 内で設定可能
- `SectionPresetBar` コンポーネントが ui_type に応じてピル（独立ボタン）・セグメントコントロール（連結）・タブ・ドロップダウンを切り替えて表示

## UI 操作フロー

- **バインド変数バー（`BindVarBar`）**: セクショングリッド直上に固定表示（Vanilla JS版 `#bind-bar` 相当）。プリセットが0件の場合は非表示。`uiType` に応じてピル（pill・独立ボタン）・`.seg-ctrl`（segment・連結）・タブ（tabs）・`Select`（select）を切り替える。`barLabel` が設定されていれば左端に表示。バー内に設定ボタンは表示しない
- **セクション追加**: 設定パネル下部フッターのインライン入力フォーム（名前 + タイプ Select + 追加ボタン）。追加後に各セクション行の鉛筆ボタンから詳細設定
- **セクション編集/削除**: 設定パネルの各セクション行（`SortableSettingsRow`）の鉛筆/ゴミ箱ボタン
- **行頭トグル**: `SortableSettingsRow` 下部に常時表示。チェックすると `new_row: true` を DB に即時保存（`handleToggleNewRow`）
- **アイテム管理**: 設定パネルの各セクション行にある `ListIcon` ボタン（list/grid/table/command_builder のみ表示。countdown はセクション内インライン操作のみ）。`ItemManagerModal` は `w-[960px] h-[760px]` のインライン編集テーブル一本化レイアウト。ヘッダーにフィルター入力を内蔵。全アイテムがテーブル行として表示され、セル直接編集（`onBlur` で auto-save）・タイプ切替バッジ・削除ボタン・DnD 並び替えに対応。テンプレート行は値列クリックで `TemplateEditModal`（z-[450]）サブモーダルを起動（「確定」で ItemManagerModal のローカル state に反映し、「保存」で一括 DB 書き込み）。フィルター中は追加・DnD を無効化。フッターに「＋ 行を追加」ボタンを配置（フィルター中は非表示）。全タイプ統一レイアウト
- **command_builder のボタン管理**: `items` テーブルに通常アイテムとして保存（`item_type: 'copy'` = コピー / `'link'` = 開く、`value` = テンプレート）。`ItemManagerModal` で他タイプと完全同列。既存 `cmd_buttons` は `load()` で自動1回マイグレーション（`items` へ変換後 `cmd_buttons: []` にリセット）
- **テーブル列管理（`ColumnManagerPopover`）**: ツールバー右端の「列」ボタン → ポータルポップオーバー。iOS トグルで表示/非表示、ドラッグで並び替え。`USE_COUNT_COL`（`id: '__use_count'`）は仮想列（`section.columns` に含まない）として末尾固定・デフォルト非表示。列ヘッダークリックでソート（`__use_count` は `item.use_count` の数値比較）。フッターの「列順をリセット」で `section.columns` の定義順に戻す（localStorage 削除）。「すべて表示」は全 hidden を解除（`__use_count` 含む）
- **list セクションの頻度ソート**: `SectionCard` ヘッダー右端の `ArrowUpDownIcon` ボタン（list タイプのみ表示）。`sortByUsage` state は `SectionCard` で管理し `SectionProps` 経由で `ListSection` に渡す。ON 時はアクセントカラー + `--c-accent-dim` 背景
- **アクティビティログ**: `ActivityLogger.log('dashboard', ...)` でセクション追加/更新/削除、アイテム追加/更新/削除を記録。チェックリスト・カウントダウンのインライン操作も対象
- **メインビューにボタン類は表示しない**（ドット背景グリッドはシンプルにセクションカードのみ）
- **空状態**: 「セクションを追加」ボタンクリックで設定パネルを開く（`setSettingsOpen(true)`）

## デザイン仕様

- **カード**: `bg-[var(--c-bg-2)]`（ページ背景 `--c-bg` と区別）。左ボーダー3px transparent → hover 時 `--c-accent` + 影強化。translateY アニメーションなし。折りたたみ時は `self-start` を付与してグリッド行高に引っ張られないようにする
- **カードヘッダー**: カード本体と同色 `--c-bg-2`（ツートーン廃止）。`border-bottom` のみで区切り。メインボードにドラッグハンドルなし（並び替えは設定パネルのみ）
- **パディング**: `EDGE_TO_EDGE_TYPES = ['list', 'table', 'countdown', 'checklist']` は `p-0`、他は `p-3`
- **ホバー色**: 全セクション内の行ホバーは `--c-accent-dim`（アクセント薄色）を使用。`--c-bg-2` は使わない（カードと同色のため視認できない）
- **グリッドレイアウト**: `repeat(auto-fill, minmax(max(190px, calc(100%/6 - 20px)), 1fr))` で**最大6列**に制限、ドット背景（20px × 20px）
- **幅オプション**: narrow=1 / auto=2 / w3=3 / wide=4 / w5=5 / full=**6**（full は12から6に変更）
- **セクションカード**: 常時 `align-self: start`（展開状態でも隣接カードの高さに引っ張られない）
- **設定パネルのセクション行**: ノートのフィールド行と同様のカードスタイル（`border rounded-xl`、タイプバッジ色付きピル、hover時のみドラッグハンドル・ボタン表示）
- **プルダウン**: `Select` カスタムコンポーネント統一（`src/components/Select.tsx`）。対象: タイプ・幅・アクション種別・列タイプ・チェックリストリセット・プリセット選択
- **設定パネル**: モーダル（640px、max-h 85vh、rounded-2xl）。ノートのフィールド管理と同様のデザイン。ギアボタン固定右下
- **設定パネルヘッダー**: 右端にエクスポート・インポート・閉じるボタンを固定配置
- **設定パネルフッター**: 「セクションを追加」ラベル + 名前入力（`flex-1`）+ タイプ Select（`w-36`）+ 追加ボタン。常時表示
- **セクション一覧先頭の固定ナビ行**: `{x}` + 「共通バインド変数」 + プリセット件数バッジ（0件時は非表示）+ 右矢印。クリックで `BindVarModal` を開く。`DndContext` 外に置くため DnD 対象外
- **`BindVarModal`**: 汎用モーダル。共通バインド変数では z-[400]・DB コールバック、セクション固有では z-[500]・ローカル state コールバックを渡す。`title` prop でタイトルを変更。固定サイズ `w-[780px] h-[760px]`。ヘッダーは常に `{x}` + タイトル固定。プリセット追加/編集フォームのキャンセル/保存ボタンで右列を切替。左列（変数設定）は常時表示
- **`SortableSettingsRow`**: 上段レイアウト = ドラッグハンドル → タイプバッジ（左） → アイコン絵文字 → タイトル → アクションボタン（ノートの `SortableFieldRow` と同順）。下段 = 幅 `Select`（`w-28`）+ `toggle-wrap` カスタムトグルで「行頭」切替。背景色は `--c-surface`（ノートのフィールド行と統一）
- **ジャンプナビ**: 3件以上で固定右上表示、各カードに `id="section-{id}"`

## セクション別デザイン仕様

| セクション | デザインポイント |
|---|---|
| list | 行ホバー `--c-accent-dim` |
| grid | グリッドカード背景 `--c-bg`（カードに対して沈み込み）、ホバー `--c-accent-dim` |
| table | `th` 背景 `--c-bg`・`border-b-2`・uppercase tracking で視覚的に強調。行ホバー `--c-accent-dim` |
| checklist | edge-to-edge。プログレスバー（常時 `--c-success`、完了時カウンターも green）。カスタム角丸正方形 checkbox（18px、checked=緑塗り+白✓ SVG スケールアニメ、未選択ホバーで緑ボーダー）。チェック済みラベルは打ち消し線+opacity-40 |
| countdown | 日数を pill バッジ表示（past=danger-bg、today=success-bg、soon=warning-bg、future=accent-dim）|
| command_builder | 入力履歴を `{value, ts}` 形式で保存（旧 `string[]` は自動マイグレーション）。相対時刻を表示 |

## CountdownSection インライン操作

- **モード切替**: SectionCard ヘッダー右に「暦日/営業日」ボタン。`countdownMode` state は SectionCard で管理し CountdownSection に props で渡す
- **ラベル**: クリックでインライン編集（blur / Enter で保存）
- **日付**: `DatePicker` compact モード（left-aligned）。status カラーなし
- **削除**: hover 時のみ表示される Trash ボタン
- **追加**: カード末尾のボタン → インラインフォーム展開（DatePicker 使用）
- **日数表示**: テキストのみ（ピル背景なし）。「あとN日」(未来)・「今日」(当日)・「N日超過」(過去)。色のみで状態を表現
- **バグ修正**: `new Date("YYYY-MM-DD")` のUTC解釈を回避するため `parseLocalDate()` でローカル時間パース
- **バグ修正**: `countCalendarDays` は `Date.UTC` でローカル年月日を正規化（DST誤差排除）。`countBusinessDaysSimple` は Vanilla JS 版と同ロジック（常に小→大方向に順方向カウントして符号付与）
- **バグ修正**: `isToday` は日付文字列の直接比較で確実に判定
- **行レイアウト**: ラベルと DatePicker が同一行（ラベル: `flex-1 truncate`、日付: `shrink-0 compact`）。ラベル編集中のみ full-width input
- **日付色**: DatePicker compact に `status` prop を渡し（overdue=赤、today=橙）補助的なステータス色を付与
- **設定パネル（ItemManagerModal）**: countdown タイプのアイテム値入力も `DatePicker` に変更
- **CSS**: `date-picker.module.css` の compact モードは `align` prop で中央寄せ／左寄せを切替（`align="left"` で `dp-trigger--align-left` クラス付与）

## セクション固有バインド変数（2段階解決）

Vanilla JS 版と同様の2段階解決。`resolveSectionVars()` → `resolveBindVars()` → `resolveDateVars()`

- `table_bind_vars` / `table_presets`（アクティブプリセット: `localStorage("dashboard_table_active_preset_<sectionId>")`）
- `list_bind_vars` / `list_presets`（`dashboard_list_active_preset_<sectionId>`）
- `grid_bind_vars` / `grid_presets`（`dashboard_grid_active_preset_<sectionId>`）
