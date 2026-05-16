# CLAUDE.md

Claude Code がこのプロジェクトで作業する際の指針。

## 必須ルール

- **対応を行うたびに、変更があったページの仕様ファイルを最新状態に更新すること。**
  - React 版の作業 → `@docs/architecture/react/<page>.md` を更新
  - コーディング規約の変更 → `@docs/coding/react.md` を更新
  - **CLAUDE.md 自体の変更が必要な場合（プロジェクト構造変更等）はその限りではない**
  - README.md はディレクトリ構成・技術スタック変更時のみ更新する

## プロジェクト概要

個人向け生産性ツール。React + TypeScript + Tailwind v4 で実装。`index.html` をエントリポイントとしたタブ UI で複数ページを切り替える。詳細は README.md 参照。

> バニラ JS 版は git タグ（v1.1.0 以前）で参照可能。

## 作業時に読むべきファイル

> **重要**: ページ固有の作業を行う場合、以下のファイルを必ず読んでから着手すること。

コーディング規約（型・DnD・Markdown・IME 検知等のハマりポイント）:
→ `@docs/coding/react.md` を読むこと

ページ別の詳細仕様:
| ページ | 読むべきファイル |
|---|---|
| index（AppShell） | `@docs/architecture/react/index.md` |
| todo（Kanban） | `@docs/architecture/react/todo.md` |
| dashboard | `@docs/architecture/react/dashboard.md` |
| note | `@docs/architecture/react/note.md` |
| sql | `@docs/architecture/react/sql.md` |
| wbs（ガントチャート） | `@docs/architecture/react/wbs.md` |
| timer（ポモドーロ） | `@docs/architecture/react/timer.md` |
| ops | `@docs/architecture/react/ops.md` |
| text | `@docs/architecture/react/text.md` |
| snippet / diff_tool | `@docs/architecture/react/snippet.md` |

## コーディング規約（共通サマリー）

### ストレージ使い分け方針

| 種別 | 保存先 |
|---|---|
| データ本体（タスク・環境設定・ラベルなど） | **IndexedDB** |
| UI 選択状態（開閉状態・選択中タブなど） | **localStorage** |
| タブ設定（TAB_CONFIG） | **IndexedDB** (`app_db`) |

### デザインシステム

- トークン: `--c-*`（色）/ `--shadow-*`（影）/ `--radius-*`（角丸）/ `--space-*`（余白）/ `--t`（transition）
- **ハードコード禁止**: 必ず `var(--c-*)` を使う（ダークモード対応のため）
- ボタンデザインガイド: `@docs/design/buttons.md` を参照

## ファイル配置ルール

| 種別 | 配置先 |
|---|---|
| 新ページコンポーネント | `src/pages/<Name>Page.tsx` |
| ページ登録 | `src/pages/registry.ts` の `PAGE_REGISTRY` に追加 |
| DB 層 | `src/db/<name>_db.ts` |

## DB 層

| クラス | DB 名 | ページ |
|---|---|---|
| KanbanDB | kanban_db | todo |
| NoteDB | note_db | note |
| DashboardDB | dashboard_db | dashboard |
| SqlDB | sql_db | sql |
| WbsDB | wbs_db | wbs |
| TimerDB | timer_db | timer |
| SnippetDB | snippet_db | snippet |
| OpsDB | ops_db | ops |
| TextDB | tools_db | text |
| AppDB | app_db | index |
| ActivityDB | activity_db | 全ページ共通 |

## アクティビティログ（共通仕様）

`activityDB.add({ page, action, target_type, target_id: String(id), summary, created_at: new Date().toISOString() })`

- `target_id` は **必ず string 型**（`String(id)` で変換）
- `created_at` は **ISO8601 文字列**（`new Date().toISOString()`）
- 90 日以上前のログは `App.init()` で自動削除

## 注意事項

- **マルチ環境対応**: `file://` / localhost / Tauri の 3 形態で動作
- `dashboard` にアカウント情報が含まれる場合あり。Git コミット前に確認する
