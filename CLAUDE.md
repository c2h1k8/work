# CLAUDE.md

Claude Code がこのプロジェクトで作業する際の指針。

## 必須ルール

- **対応を行うたびに、変更があったページの仕様ファイルを最新状態に更新すること。**
  - Vanilla JS 版の作業 → `@docs/architecture/vanilla/<page>.md` を更新
  - React 版の作業 → `@docs/architecture/react/<page>.md` を更新
  - コーディング規約の変更 → `@docs/coding/react.md` または `@docs/coding/vanilla-js.md` を更新
  - **CLAUDE.md 自体の変更が必要な場合（プロジェクト構造変更・ブランチ追加等）はその限りではない**
  - README.md はディレクトリ構成・技術スタック変更時のみ更新する

## プロジェクト概要

個人向け生産性ツール。`index.html` をエントリポイントとしたタブ UI で複数ページを切り替える。詳細は README.md 参照。

| ブランチ | 内容 |
|---|---|
| `main` | Vanilla JS 版（安定版） |
| `feature/react-migration` | React + TypeScript + Tailwind v4 への全面移行済みブランチ |

## 作業時に読むべきファイル

> **重要**: ページ固有の作業を行う場合、以下のファイルを必ず読んでから着手すること。

### Vanilla JS 版（main ブランチ）の場合

コーディング規約（コアユーティリティ禁止事項・コンポーネント一覧・読み込み順）:
→ `@docs/coding/vanilla-js.md` を読むこと

ページ別の詳細仕様:
| ページ | 読むべきファイル |
|---|---|
| index（タブナビ） | `@docs/architecture/vanilla/index.md` |
| todo（Kanban） | `@docs/architecture/vanilla/todo.md` |
| dashboard | `@docs/architecture/vanilla/dashboard.md` |
| note | `@docs/architecture/vanilla/note.md` |
| sql | `@docs/architecture/vanilla/sql.md` |
| wbs（ガントチャート） | `@docs/architecture/vanilla/wbs.md` |
| timer（ポモドーロ） | `@docs/architecture/vanilla/timer.md` |
| ops | `@docs/architecture/vanilla/ops.md` |
| text | `@docs/architecture/vanilla/text.md` |
| snippet / diff_tool | `@docs/architecture/vanilla/snippet.md` |

### React 版（feature/react-migration ブランチ）の場合

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

### CSS / LESS（Vanilla JS 版）

- **`.less` を編集すること。`.css` を直接編集してはいけない**
- 編集後は `npx lessc <src>.less <dst>.css` で再生成する
- `.less` ファイルを追加・削除した場合は `.github/workflows/release.yml` の「Build CSS from LESS」ステップも更新

### デザインシステム

- トークン: `--c-*`（色）/ `--shadow-*`（影）/ `--radius-*`（角丸）/ `--space-*`（余白）/ `--t`（transition）
- **ハードコード禁止**: 必ず `var(--c-*)` を使う（ダークモード対応のため）
- **LESS 色関数禁止**: `darken()` / `lighten()` 等は使えない。`var(--c-bg-2)` 等で代替
- ボタンデザインガイド: `@docs/design/buttons.md` を参照
- **テーマ初期化スクリプト**（全 HTML の `<head>` 先頭に必須）:
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

### HTML（Vanilla JS 版）

- `lang="ja"` を指定する
- 外部ライブラリは `vendor/` フォルダにローカル配置（CDN 不使用）
- `defer` 属性を script タグに付ける

## ファイル配置ルール

### Vanilla JS 版（main）

| 種別 | 配置先 |
|---|---|
| 新ページ | `pages/<name>.html`（index.html のみルート） |
| ページ固有 JS | `js/<name>.js` または `js/<name>/`（分割時） |
| ページ固有 CSS | `css/<name>.{less,css}` + `css/<name>/`（パーシャル） |
| DB 層 | `js/db/<name>_db.js` |
| コアユーティリティ | `js/core/<name>.js` |
| UI コンポーネント | `js/components/<name>.js` + `css/components/<name>.{less,css}` |

### React 版（feature/react-migration）

| 種別 | 配置先 |
|---|---|
| 新ページコンポーネント | `src/pages/<Name>Page.tsx` |
| ページ登録 | `src/pages/registry.ts` の `PAGE_REGISTRY` に追加 |
| DB 層 | `src/db/<name>_db.ts` |

## DB 層（共通）

Vanilla JS 版（`js/db/`）と React 版（`src/db/`）で DB 名・バージョン・スキーマは完全互換。

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

- **マルチ環境対応**: `file://` / localhost / Tauri の 3 形態で動作。環境差異は `js/core/env.js` 系で吸収
- **キャッシュバスティング**: release.yml でビルド時に `?v=<タグ名>` を全 HTML の CSS/JS 参照へ自動付与
- `dashboard.html` にアカウント情報が含まれる場合あり。Git コミット前に確認する
