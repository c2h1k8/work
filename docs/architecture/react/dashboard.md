# dashboard React 版アーキテクチャ

## ファイル構成

```
src/pages/DashboardPage.tsx              メインコンポーネント（ページシェル・load・セクションDnD）
src/pages/dashboard/shared.ts            定数・型（localStorage プレフィックス・Select オプション・TYPE_LABELS 等）
src/pages/dashboard/sections.tsx         セクションコンポーネント群（SectionCard・List/Grid/Table/…Section）
src/pages/dashboard/SectionEditModal.tsx セクション追加/編集モーダル
src/pages/dashboard/ItemManagerModal.tsx アイテム管理モーダル（スプレッドシートUX）
src/pages/dashboard/settings.tsx         設定パネル・バインド変数UI（DashboardSettingsPanel・BindVarModal 等）
src/core/dashboard_resolve.ts            バインド変数解決ロジック（純関数・ユニットテスト付き）
src/db/dashboard_db.ts                   Dexie.js（dashboard_db）
```

- バインド変数解決（`resolveDateVars` / `resolveColumnRefs` / `resolveBindVars` / `resolveSectionVars` / `resolveAll`）と
  日数計算（`countCalendarDays` / `countBusinessDaysSimple`）・`getResetPeriodKey` は `src/core/dashboard_resolve.ts` に分離。
  `src/core/dashboard_resolve.test.ts` でユニットテスト済み
- ショートカット一覧: `?` キーで `ShortcutHelp`（`DASHBOARD_SHORTCUTS`）を表示（他ページと同仕様）

## DB スキーマ

Vanilla JS 版と完全互換。詳細スキーマ・セクションタイプ・バインド変数仕様: @docs/architecture/vanilla/dashboard.md

DB 名: `dashboard_db` version 2
ストア: `sections` / `items` / `presets` / `app_config`

## React 版固有

- インスタンスID: `useTabLabel()` フック（`src/contexts/TabContext.ts`）で取得
  - Vanilla 版の `?instance=<id>` URL パラメータの代替
- Markdown: `MarkdownBody` コンポーネント（`remark-gfm` / `remark-breaks` / Prism シンタックスハイライト。Todo ページと統一）
- DnD: `@dnd-kit/core` + `@dnd-kit/sortable`

## コンポーネント構成

| コンポーネント | 役割 |
|---|---|
| `DashboardPage` | メインコンポーネント（state 管理・DnD・load） |
| `SectionCard` | セクションカード（折りたたみ・左ボーダーホバー・md編集ボタン） |
| `ListSection` | リスト（全幅行・ホバーアイコン・インラインフィルター） |
| `GridSection` | グリッド（横並び sheet-card スタイル） |
| `TableSection` | テーブル（クエリフィルター・保存ビュー・列非表示/並び替え・利用回数列） |
| `TableQueryInput` | クエリ検索ボックス（確定条件のチップ表示・列名＋演算子オートコンプリート・構文ヘルプ・portal表示） |
| `FilterChipView` | 確定した1条件を表すチップ（クリック＝編集 / `×`＝削除） |
| `ViewSwitcher` | 保存ビュー切替（適用/新規保存/更新/削除・現在条件との差分で更新ボタン表示） |
| `ColumnManagerPopover` | 列管理ポップオーバー（iOS トグル・DnD 並び替え・仮想列対応・列順リセット） |
| `SortableColRow` | DnD 対応列行（列管理ポップオーバー内） |
| `CommandBuilderSection` | コマンドビルダー（cmd_buttons 複数ボタン対応） |
| `MemoSection` | テキストメモ（auto-grow textarea・max-h-[480px]・Note ページ準拠） |
| `ChecklistSection` | チェックリスト（インライン追加・編集・削除・DnD 並び替え） |
| `SortableChecklistItem` | チェックリスト1行（useSortable・ドラッグハンドル・カスタム checkbox・インライン編集） |
| `MarkdownSection` | Markdown（editing/onToggleEdit props で SectionCard から制御。表示は `MarkdownBody`・編集は auto-grow textarea） |
| `IframeSection` | 埋め込み iframe |
| `CountdownSection` | カウントダウン（インライン追加・編集・削除・日付変更） |
| `SectionEditModal` | セクション追加/編集モーダル |
| `ItemManagerModal` | アイテム管理モーダル（スプレッドシートUX。全タイプ統一レイアウト） |
| `TemplateEditModal` | テンプレートアイテム編集サブモーダル（z-[450]。ラベル・ヒント・テンプレート textarea・日付プレースホルダー説明） |
| `SpreadsheetCell` | スプレッドシートセル（未選択/選択/編集の3状態。選択→再クリック or Enter/ダブルクリック で編集モード。Tab/Shift+Tab で次/前セルへ移動しながら編集モード継続。`isCellDirty` で薄い青背景） |
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
| `table_views` | `TableView[]?` | table: 保存ビュー（クエリ＋ソート＋列表示/順）。IndexedDB に保存し export/import で共有可 |
| `history_limit` | `number?` | command_builder: 履歴保持上限（デフォルト10） |
| `cmd_placeholder` | `string?` | command_builder: 入力欄のプレースホルダー（未設定時は `"入力値 {INPUT}"`） |
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
- **テーブルのソート状態を記憶**: `sortState`（`{ colId, dir }`）は `localStorage("dashboard_table_sort_<sectionId>")`（`TABLE_SORT_PREFIX`）に保存し、再表示時に復元。`toggleSort` で asc → desc → 解除（null）と循環し、解除時はキーを削除。列非表示/列順/アクティブプリセットと同じ section.id 別 localStorage パターン
- **テーブルのクエリフィルター**（`TableQueryInput` + `src/core/table_filter.ts`）: テキスト1本で複数列フィルタを実現。マッチ対象は `item.row_data` の**生値**（バインド変数解決前）。型推定は一切しない（列型は text/copy/link のみ）
  - **構文**: `API`（全列あいまい）／`列名:値`（列指定・含む）／スペース＝AND／`OR`／`( )` グループ化／先頭 `-` で否定／`"列 名":値`（スペース入り列名はクォート）
  - **テキスト演算子**: `:`含む / `=`完全一致 / `^=`前方一致 / `$=`後方一致 / `~/正規表現/` / `:empty` / `:!empty`
  - **オートコンプリート**: 入力中フラグメントから列名候補を提示 → 列名確定後は演算子メニュー（含む/完全一致/前方/後方/正規表現/空/空でない）を提示。`OR` キーワードも候補化。↑↓選択・Enter/Tab確定・Escで閉じる。`SectionCard` が `overflow-hidden` のため候補・ヘルプは **portal** で表示
  - **確定条件のチップ表示**（`FilterChipView`）: 確定済みの条件は**ラベル（チップ）**として描画し、input 要素には**未確定の 1 term だけ**を保持する。長いクエリ文字列が入力欄を埋めて末尾しか見えなくなる問題を解消
    - **クエリ文字列が single source of truth**。チップは `splitTopLevelTerms(query)`（トップレベルの AND 単位に分割。クォート内・括弧内のスペースでは切らず `A OR B` は 1 要素に結合）＋ `describeTerm(raw, columns)` による**派生ビュー**。`TableView` / localStorage / `parseTableQuery` の仕様は不変
    - **チップ表示**: `列ラベル + 演算子 + 値`（例 `環境 : 本番`）。`:empty` / `:!empty` は `は 空` / `は 空でない` に日本語化。全列あいまいは `SearchIcon` ＋値のみ、`OR`/括弧を含む式はモノスペースでそのまま表示。**否定（先頭 `-`）は `BanIcon` ＋ danger 配色**
    - **確定は Enter（と blur）のみ。スペースでは確定しない**。理由: ①値にスペースを含めたいときに書けなくなる（`担当:田中 太郎` が打った瞬間に分断される） ②**日本語入力の変換スペースと衝突する**（`compositionend` と `change` の発火順はブラウザ/IME 依存でガードしきれない。Enter なら `e.nativeEvent.isComposing` 1つで確実） ③打鍵数は変わらない
      - **`isBalanced()` で括弧・クォートが閉じている場合のみ**確定する（`(A OR ` や `"担当 ` の途中では確定しない）。確定時は `splitTopLevelTerms` を通すので、入力中テキストに複数 term が含まれていれば複数チップに分かれる
      - 補完候補は **`QuerySugg.complete === true` のものだけ**自動確定（`:empty` / `:!empty`）。`OR ` のように**末尾が空白でも term として未完成**な候補で確定してしまわないようにフラグで明示する
    - **操作**: チップ本体クリック＝入力欄に戻して編集（入力中テキストがあれば先にチップ化して退避）／`×`＝削除／空入力で `Backspace`＝直前チップを入力欄に戻す（キーボードのみで編集可）。チップは `<button>` 2つ構成なので Tab でも到達できる
    - **折りたたみ**: チップが `CHIP_COLLAPSE_LIMIT`(=3) を超えたら先頭3件＋`+N` バッジに集約。クリックで全展開／「折りたたむ」で復帰
    - 右端の `×` は**全条件クリア**（チップ＋入力中テキスト）
  - **構文ヘルプ**: ボックス右の `?`（`HelpCircleIcon`）で早見表ポップオーバー
  - パースエラー（括弧未閉じ・不正な正規表現等）は枠を danger 色にしヒント表示。既存の表示は壊さない（マッチ false で返すのみ）
  - クエリ文字列は UI 選択状態として `localStorage("dashboard_table_query_<sectionId>")`（`TABLE_QUERY_PREFIX`）に保存
- **保存ビュー**（`ViewSwitcher`・`TableView`）: クエリ＋ソート＋列表示/順をまとめて名前付き保存しワンクリック切替
  - **ビュー定義（データ本体）→ IndexedDB**（`section.table_views`、`dashboardDB.patchSection` で保存・export/import で共有可）。**アクティブビューID（UI状態）→ localStorage**（`dashboard_table_active_view_<sectionId>`・`TABLE_ACTIVE_VIEW_PREFIX`）
  - 「フィルターなし」で解除（クエリのみクリア・列/ソートは保持）。適用時はクエリ/ソート/列表示/列順を一括復元し各 localStorage も同期
  - 現在の条件がアクティブビューと差分（`viewDirty`）のとき、その行に「更新」ボタン（`SaveIcon`）を表示。差分判定は `hiddenCols` をソートして正規化比較
  - **並び替え**（`SortableViewRow` + `reorderViews`）: **配列 `section.table_views` の順がそのまま表示順**。マウス＝行ホバーで出るグリップを DnD（`@dnd-kit`・`PointerSensor` distance 5・列管理ポップオーバーと同じ構成）、キーボード＝行にフォーカスして **`Alt+↑/↓`**（`ItemManagerModal` の行移動と同じキーバインド）の両経路。並び替え後は `dashboardDB.patchSection` で即保存し、`Alt+↑/↓` では `data-view-id` を辿って移動後の行へフォーカスを追従させる（連打で連続移動できる）
  - 削除ボタンは `opacity-0 group-hover/vw:opacity-100` に加え `focus-visible:opacity-100`（キーボード操作時にも見える）
- **TSV コピー/ペースト**（`ItemManagerModal`）: セル選択範囲を Ctrl/Cmd+C で TSV コピー（`handleCopy`）、Ctrl/Cmd+V で貼り付け。貼り付けロジックは `applyTsvText(text, startRow, startCol)` に共通化。貼り付け先が末尾を超えると新規行を自動追加。**注意**: 列の `setValue` は `row_data` など入れ子オブジェクトを返すため、複数列を貼る際は「累積中の `item` に `setValue` を順次適用」する（毎回元 `item` から作って浅くマージすると後続列が `row_data` ごと上書きし先頭列が消えるバグになる）
  - **非編集時**: コンテナ `onKeyDown`（`handleTableKeyDown`）が Ctrl/Cmd+V を捕まえ `navigator.clipboard.readText()` → `applyTsvText`（選択セル基点）
  - **編集中**: コンテナ `onPaste`（`handleTablePaste`）が input/textarea から bubble する paste を捕まえる。タブ/改行を含む（=複数セル相当）場合のみ `preventDefault` → 編集を抜けて `applyTsvText`（編集セル基点）。単一値はネイティブのセル内貼り付けに任せる。**これで「1列目（行挿入・新規行・Tab 移動で自動的に編集モードに入る）の貼り付けが TSV 展開されず単一セルに入る」現象を解消**
- **行を間に挿入**（`ItemManagerModal` / `handleInsertRow(refRowIdx, where)`）: マウスとキーボードの両経路を用意
  - **マウス**: 各行ホバーで削除ボタンの隣に「＋（この行の下に挿入）」を表示（`SortableEditableRow` の `onInsert`/`canInsert` props）
  - **キーボード**: `Ctrl/Cmd+Enter`＝選択行の下、`Ctrl/Cmd+Shift+Enter`＝上に挿入（`handleTableKeyDown`）。選択セルがなければ末尾に追加
  - 挿入は対象 index に空行を splice → **全行 position 振り直し＋既存行を dirty マーク**（DnD `handleDragEnd` と同方式で並び順を保存）。挿入行の先頭セルを自動で編集状態に
  - **フィルター中は無効**（`canInsert={!isFiltering}`・`handleInsertRow` 冒頭でガード）。追加/DnD と同方針
  - 末尾列（アクション列）は 挿入/複製/削除 3ボタン分の幅 `w-20`（th/td 一致）
- **列検索（列名でジャンプ）**（`ItemManagerModal`）: ヘッダーの行フィルター（値検索）とは別に、**列名で目的の列へジャンプ**するコンボボックスを用意（列が多いTSV/CSVで見たい列へ素早く到達する用途）。列が2列以上のときのみ表示（`colDefs.length > 1`）。入力に部分一致する列名候補を `colMatches`（元の `colDefs` index を保持）でドロップダウン表示。↑↓ で候補移動・Enter/クリックで確定 → `jumpToColumn(colIdx)` が**現在行（なければ先頭行）のそのセルを選択** → 上記スクロール追従で可視域へ。確定後は入力をクリアしテーブルへフォーカスを戻す（キーボード操作継続）。Esc は入力クリア→未入力時は閉じる。候補クリックを blur より先に拾うため `onMouseDown preventDefault` ＋ blur は120ms遅延で閉じる
- **アクティブセルへのスクロール追従**（`ItemManagerModal`）: 矢印/Tab 移動・範囲選択でアクティブセル（範囲選択時は端の `selEnd`）が画面外へ出たら、コンテナ（`tableContainerRef`）を**縦横スクロールして常に可視域に入れる**（Excel/Sheets 相当。列数が多く横オーバーフローするCSV/TSVでマウス横スクロール不要に）。実装は `useLayoutEffect([selCell, selEnd])` で対象セルを `[data-cell="{行}-{列}"]` から引き、`getBoundingClientRect` 差分で**必要な分だけ**動かす（見えている間は動かさない）。sticky ヘッダー（`thead`）の高さと余白（`MARGIN=8px`）を考慮するため `scrollIntoView` は使わない（ヘッダー背後に隠れる／必要以上に飛ぶのを回避）。固定列はないため横は単純比較
- **行の移動**: マウス＝DnD、キーボード＝`Alt+↑/↓`（`handleTableKeyDown`）の両経路。position 振り直し → 既存行 dirty マーク。**フィルター中・未保存の新規行があるときは無効**（両経路とも同条件）
  - **複数行まとめて移動**: 範囲選択（Shift+クリック / Shift+↑↓）で複数行にまたがる選択中は、`Alt+↑/↓` が選択行ブロック（`selRange.r1..r2`）をまとめて1行ずつ移動。移動後も選択範囲を追従維持するので連打で連続移動できる。DnD も範囲内の行をドラッグすると**ブロック全体**を移動（範囲内へのドロップは無視。挿入位置はブロック除去後の index に補正）。単一選択時は従来どおり1行移動
  - フッターヒントに `⌥/Alt+↑↓ で行移動（範囲選択で複数行）` を表示
- **範囲クリア（Delete/Backspace）**: 選択範囲（`selRange`）内の全セルを一括クリア（Excel 相当）。テンプレート等の特殊セルは対象外。`setValue` は「累積中の item に順次適用」（TSV 貼り付けと同方式で `row_data` の上書き防止）。変更行のみ新オブジェクトに差し替え、dirty マーク
- **複数行の一括削除**: `Shift+Delete`＝選択範囲の行をまとめて削除（確認ダイアログに行数表示）。マウスは複数行の範囲選択中に**範囲内の行のゴミ箱ボタン**でブロック削除（DnD ブロック移動と同方針）。DB 反映済みの削除は Undo 不可のため履歴クリア
- **行複製**: `Ctrl/Cmd+D`＝選択行を直下に複製（範囲選択でブロックごと複製・複製後はそのブロックを選択）。マウスは行ホバーの `CopyPlusIcon` ボタン（範囲選択中は範囲内の行でブロック複製）。複製行は新規行（琥珀背景・temp id）扱い。**フィルター中は無効**（挿入と同方針）。アクション列は挿入/複製/削除の3ボタンで幅 `w-20`（th/td 一致）
- **Undo/Redo**: `Ctrl/Cmd+Z`＝元に戻す、`Ctrl/Cmd+Shift+Z` / `Ctrl/Cmd+Y`＝やり直し。ローカル state（`localItems`/`dirtyIds`/`newIds`/`dirtyCells`）のスナップショット履歴（`UNDO_LIMIT=100`）
  - **対象**: セル編集・TSV貼り付け・範囲クリア・行移動（Alt/DnD）・行挿入/追加/複製・タイプ変更・テンプレート確定
  - **履歴クリア**: 行削除（DB 即時反映のため）と一括保存（新規行の id 振り直しのため）
  - セル編集は `SpreadsheetCell` が確定時に1回だけ `onCellChange` を呼ぶ仕様のため「1編集=1ステップ」。編集中の入力欄では native の undo が効く（テーブルの Ctrl+Z は非編集時のみ）
- **行の再レンダリング最適化**: `SortableEditableRow` は `React.memo`。コールバック props は `rowHandlersRef` 経由の identity 不変ラッパー（実体は毎レンダー差し替え）、`selRange` は行が範囲内のときのみ渡す、`dirtyCellKeys` は共有 `EMPTY_KEY_SET` でフォールバック。これにより選択移動・フィルター入力時に全行再描画されない
- **list セクションの頻度ソート**: `SectionCard` ヘッダー右端の `ArrowUpDownIcon` ボタン（list タイプのみ表示）。`sortByUsage` state は `SectionCard` で管理し `SectionProps` 経由で `ListSection` に渡す。ON 時はアクセントカラー + `--c-accent-dim` 背景
- **アクティビティログ**: `ActivityLogger.log('dashboard', ...)` でセクション追加/更新/削除、アイテム追加/更新/削除を記録。チェックリスト・カウントダウンのインライン操作も対象
- **メインビューにボタン類は表示しない**（ドット背景グリッドはシンプルにセクションカードのみ）。ただし `section.show_add_btn === true` のセクション（list/grid/table）はヘッダに `PlusIcon` ボタンを表示 → `ItemManagerModal` を開く
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
- **ヘッダ追加ボタン表示トグル（セクション単位）**: `section.show_add_btn?: boolean`（IndexedDB）で管理。デフォルト `false`。`SortableSettingsRow` 下段に `toggle-wrap`「追加ボタン」トグルを表示（list/grid/table のみ）。`SectionEditModal` 各タイプの設定欄にも同トグルを追加。変更は `dashboardDB.patchSection()` で即時保存 → `setSections` で楽観的更新
- **ジャンプナビ**: 3件以上で固定右上表示、各カードに `id="section-{id}"`

## セクション別デザイン仕様

| セクション | デザインポイント |
|---|---|
| list | 行ホバー `--c-accent-dim` |
| grid | グリッドカード背景 `--c-bg`（カードに対して沈み込み）、ホバー `--c-accent-dim` |
| table | `th` 背景 `--c-bg`・`border-b-2`・uppercase tracking で視覚的に強調。行ホバー `--c-accent-dim`。**列型の視覚化**: `th` に型アイコンを常時表示（copy=CopyIcon・link=ExternalLinkIcon）。`td` は型ごとにカーソル制御（text=cursor-text・copy/link=cursor-pointer）。link セル: テキスト右に ExternalLinkIcon 常時表示。copy セル: ホバー時に右端へ CopyIcon フェードイン（`group/copy`）。`<tr>` に cursor-pointer は付与しない |
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

## 列値バインド（table 専用・行依存）

同じ行の**他列の生値**をセルテンプレートに埋め込む機能。`resolveColumnRefs(str, item, columns)`。

- **構文**: `{@列名}`（label 優先 → なければ列 id でマッチ）。スペース入りの列名は `{@"列 名"}`
- **解決順**: テーブルセルは `resolveColumnRefs`（行依存・**先頭**）→ `resolveSectionVars` → `resolveBindVars` → `resolveDateVars`。`TableSection` の `resolve(s, item)` は item 必須に変更（cell 表示・`handleCellClick` の両方で item を渡す）
- **再帰しない（1パスのみ）**: 参照先に `{VAR}` が入っていれば後段のバインド変数解決が引き継ぐ。循環参照（A→B→A）でも無限ループしない。未定義の `{@…}` はそのまま残す（タイプミスの可視化）
- **スコープ**: 列の概念がある table のみ（list/grid は対象外）
- **UI ヒント**: `SectionEditModal` の table 列定義の下に `{@列名}` の使い方を表示
