# sql React 版アーキテクチャ

## ファイル構成

```
src/pages/SqlPage.tsx   メインコンポーネント
src/db/sql_db.ts        Dexie.js（sql_db）
```

## DB スキーマ

Vanilla JS 版と完全互換。詳細: @docs/architecture/vanilla/sql.md

DB 名: `sql_db` version 2
ストア: `envs` / `table_memos`

## タブ構成

| タブ | 機能 |
|---|---|
| **接続・設定** | 接続環境 CRUD（DnD 並び替え）+ JSON エクスポート/インポート・セッション設定コピー・バインド変数生成・Ctrl+Enter で接続コマンドコピー |
| **実行計画 & チューニング** | 実行計画テキスト解析（左ペイン）+ チューニングガイド（右ペイン）を左右分割表示 |
| **テーブル定義メモ** | カラム一覧・テーブル間リレーション自動検出・テーブル比較モーダル・CREATE TABLE SQL パース・JSON エクスポート/インポート |

## UI 仕様

### 接続・設定タブ

- **`Ctrl+Enter` で接続コマンドをコピー**（`EnvSection`）。`useIsActiveTab()` でアクティブタブに限定する（全タブ同時マウントのため。詳細は `@docs/architecture/react/index.md`）
- **SQL\*Plus オプション**: `.toggle-wrap` / `.toggle-input` / `.toggle-track` / `.toggle-thumb` によるトグルスイッチ
- **接続環境一覧**: `@dnd-kit/core` + `@dnd-kit/sortable` による DnD 並び替え（`GripVertical` ハンドル）
  - `SortableEnvItem` コンポーネント（EnvSection 直前に定義）。編集中は accent 色枠でハイライト
  - `handleEnvDragEnd` で `arrayMove` → position を 0,1,2... に振り直し
  - 編集フォームは DnD リストの**外**（リスト下部）に表示。`scrollIntoView` で自動スクロール
  - フォームは角丸カード（`rounded-xl border border-[var(--c-accent)]/40`）＋ accent 色ヘッダー行（「編集中: {key}」or「新規追加」）
- **環境切り替えボタン**: OpsPage/PortsSection と同じ surface-card 型セグメント
  - 外枠: `flex gap-0.5 p-[3px] bg-[var(--c-bg)] border border-[var(--c-border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] self-start flex-wrap`
  - アクティブ: `bg-[var(--c-surface)] text-[var(--c-accent)] font-bold shadow-[var(--shadow-sm)]`
  - 非アクティブ: `text-[var(--c-text-2)] hover:text-[var(--c-text)] hover:bg-[var(--c-bg-2)]`

### バインド変数

- **型定義** (`TYPE_DEFS`): NUMBER は `lenMode: 'none'`（桁数入力不可）
- **「使用」欄**: `.toggle-wrap` トグルスイッチ（ラベルなしコンパクト版）
- **型セレクト**: `<Select>` コンポーネント（`src/components/Select.tsx`）を使用。`TYPE_OPTIONS` 定数（`SelectOption[]`）を渡す
- **DATE 型の値入力**: `<DatePicker className="w-full" placeholder="日付を選択">` コンポーネントを使用（compact なし）
- **グリッド列幅**: `grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]`（`minmax(0,1fr)` で DATE 選択時の幅ズレを防止）
- **削除ボタン**: `.btn btn--ghost btn--sm p-1`

### Select コンポーネント（`src/components/Select.tsx`）

`createPortal` でドロップダウンを `document.body` 直下に描画し、`overflow: hidden` 親での切れを防止。
- `useLayoutEffect` + `getBoundingClientRect()` でトリガー位置を計算し `position: fixed` で表示
- **ドロップダウン幅は常にトリガー幅と同一**（`dropW = rect.width`）。ズレが生じない
- スクロール時は `window.addEventListener('scroll', close, { capture: true })` で自動クローズ
- ESC キーで閉じる（`document.addEventListener('keydown', onKey)`）
- CSS: `src/styles/components/select.module.css` の `.cs-dropdown-portal` クラス（`position: fixed`、`z-index: 2000`）

### 実行計画 & チューニングタブ

- **チューニングガイドカテゴリタブ**: OpsPage PortsSection と同じ「surface カード型」セグメント
  - 外枠: `p-[3px] bg-[var(--c-bg)] border border-[var(--c-border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)]`
  - アクティブ: `bg-[var(--c-surface)] text-[var(--c-accent)] shadow-[var(--shadow-sm)]`
  - バッジ: `bg-[var(--c-accent-dim)] text-[var(--c-accent)]`（アクティブ時）

### テーブル定義メモタブ

- **左サイドバー幅**: 400px（カラム名・テーブル名・検索フィールドの表示改善のため拡大）
- **ビュー切り替え**: `seg-ctrl` でテーブル/カラムの2択（サイドバー上部）
- **選択状態**: 背景色 `bg-[var(--c-accent)]/10` のみ（border-l なし）。テーブルビューは `mx-1.5 my-0.5 rounded-lg`（モダン inset スタイル）。カラムビューは全幅のテーブル形式を維持
- **カラム一覧グリッド**: `grid-cols-[3fr_auto_2fr]`（テーブル.カラム列を型列より広く）
- **テーブル表示の列数**: `<Columns size={9}/>` アイコン + `text-[9px] font-mono` テキストで表示（`mt-1 text-[var(--c-text-3)]` のフレックス行）
- **カラム定義 NN/PK**: Tailwind トグルピルボタン（amber/accent カラー）
- **インデックス定義 UQ**: 同上トグルピルボタン
- **テーブル比較モーダル**:
  - テーブル選択: `<Select>` カスタムコンポーネント（value は `String(id)`）
  - 比較結果: `useMemo` で `idA`/`idB` 変更時に自動再計算（比較ボタンなし）
  - 差異表示: 「状態」列を廃止し、型・NN・PK の差異セルをアンバー背景（`bg-amber-500/15`）でハイライト
  - 片方のみ行: `bg-sky-500/8` で行全体をハイライト
  - `typeDiff` / `nnDiff` / `pkDiff` フラグで各セルのハイライトを独立制御
- **カラム DnD 並び替え**: `SortableColRow` コンポーネント（`useSortable` + `GripVertical` ハンドル）。インデックス文字列（`String(i)`）を DnD ID として使用

### 関連テーブル

- **3グループ表示**: グループごとに見出しと左ボーダー色で視覚的に分離
  - `→` 参照（FK推測）: 現カラムが他テーブルPK → インジゴ（`border-l-[var(--c-accent)]`）
  - `←` 被参照: 現PKが他テーブルカラム → エメラルド（`border-l-emerald-500`）
  - `=` 同名カラム: 双方ともPKでない → アンバー（`border-l-amber-500`）
- **カードデザイン**: チューニングガイドと同じ `border-l-4` 左ボーダー型（`rounded-lg border border-[var(--c-border)] border-l-4 bg-[var(--c-bg-2)]`）
  - カード内: 方向記号 + テーブル名（上段）、カラム名タグ群（下段）
  - `renderCard` / `renderGroup` をIIFE内ローカル関数として定義
- **除外カラム設定**: メモタブ右上ツールバーのギアアイコン（`showExcludeSettings` state）でトグル
  - ツールバー直下にインラインパネルを展開（`全テーブル共通` と明示）
  - `excludeCols` state: `localStorage` の `sql_relation_exclude_cols` に JSON 保存
  - デフォルト: `['created_at','updated_at','deleted_at','created_by','updated_by','deleted_by','created_date','updated_date']`
  - `excludeSet`（useMemo）で小文字 Set を生成し、関連テーブル計算時にスキップ
  - タグ + × ボタンで個別削除、テキスト入力 + Enter/追加ボタンで追加、「デフォルトに戻す」リンク

## グローバル検索

`searchRegistry.register('sql-memo', ...)` でテーブル定義メモを検索対象に登録（`SqlPage` 常時）。テーブル名・スキーマ名・コメント・メモ・カラム名を検索。結果クリックで SQL ページに遷移してメモタブに切替し、`pendingMemoId` → `MemoTab` の `useEffect` で対象テーブルを選択。

## localStorage キー

| キー | 値 |
|---|---|
| `sql_active_tab` | `'setup'` \| `'analyze'` \| `'memo'` |
| `sql_selected_env` | 選択中接続環境 ID |
| `sql_params` | バインド変数パラメータ |
| `sql_tune_tab` | チューニングガイド選択タブ |
| `sql_tune_groups` | チューニングガイドグループ展開状態 |
| `sql_memo_view` | テーブル定義メモビューモード |
| `sql_sqlplus_opts` | SQL\*Plus オプション |
| `sql_sqlplus_extra` | SQL\*Plus 追加設定 |
| `sql_relation_exclude_cols` | 同名カラム検出の除外カラム名リスト（JSON 配列） |

## アクティビティログ

`activityDB.add({ page: 'sql', action, target_type, target_id: String(id), summary, created_at: new Date().toISOString() })`
