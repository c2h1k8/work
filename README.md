# work

個人向け生産性ツール集。React + TypeScript + Tailwind v4 で実装。タブ UI で複数ページを切り替えて使用する。

> バニラ JS 版は git タグ（`react-migration-complete` / `v1.1.0` 以前）で参照可能。

## ページ一覧

| ページコンポーネント | 説明 |
| --- | --- |
| `src/pages/TodoPage.tsx` | Kanban 形式の TODO 管理ボード（動的カラム追加削除・ソート・カスタムカレンダー・ラベルフィルター・タスク紐づけ・エクスポート／インポート付き） |
| `src/pages/DashboardPage.tsx` | カスタマイズ可能なホームダッシュボード（list/grid/table/command_builder/markdown/iframe/countdown でバインド変数プリセット対応。使用頻度順ソート対応） |
| `src/pages/SqlPage.tsx` | Oracle SQL\*Plus ワークフロー支援ツール（接続環境管理・バインド変数生成・実行計画解析・チューニングガイド・テーブル定義メモ） |
| `src/pages/NotePage.tsx` | ノート管理（可変フィールド・DatePicker・ドロップダウン・ノート間リンク・変更履歴対応） |
| `src/pages/WbsPage.tsx` | WBS 管理（予定/実績・営業日計算・ガントチャート表示・DnD による行並び替え） |
| `src/pages/TimerPage.tsx` | 定型作業タイマー（ポモドーロ等のプリセット・セッションログ・集計グラフ・CSV エクスポート対応） |
| `src/pages/SnippetPage.tsx` | コードスニペット管理（言語・タグで整理、検索・フィルタ・シンタックスハイライト・エクスポート/インポート） |
| `src/pages/DiffToolPage.tsx` | 差分比較ツール（行単位/文字単位切替・空白無視・折りたたみ表示。永続化なし） |
| `src/pages/OpsPage.tsx` | 運用インフラツール（ログビューア・cron 式エディタ・HTTP ステータスコード辞典・ポート番号リファレンス・サブネット計算機） |
| `src/pages/TextPage.tsx` | テキスト処理・変換ツール（エンコード・ケース変換・正規表現テスター・文字カウント・タイムスタンプ・TSV/CSV・フォーマッタ） |

## 技術スタック

| カテゴリ | 採用技術 |
|---|---|
| UI フレームワーク | React 19 + TypeScript 5 |
| ビルドツール | Vite 6 |
| スタイル | Tailwind CSS v4 + CSS 変数（ダークモード対応） |
| ルーター | TanStack Router v1 |
| 状態管理 | Zustand v5 |
| DB | Dexie.js v4（IndexedDB） |
| DnD | @dnd-kit/core + @dnd-kit/sortable |
| Markdown | react-markdown + rehype-sanitize |
| シンタックスハイライト | Shiki v4 |
| アイコン | Lucide React |

## ディレクトリ構成

```
work/
├── index.html              # Vite エントリポイント
├── src/
│   ├── App.tsx             # ルートコンポーネント（AppShell）
│   ├── main.tsx            # エントリポイント
│   ├── contexts/
│   │   └── TabContext.ts   # タブラベルを instanceId として提供するコンテキスト
│   ├── components/         # 共通コンポーネント
│   ├── core/               # ユーティリティ（utils.ts 等）
│   ├── db/                 # Dexie.js DB クラス（各ページ対応）
│   │   ├── activity_db.ts  # アクティビティログ
│   │   ├── app_db.ts       # タブ設定（app_db）
│   │   ├── kanban_db.ts    # todo
│   │   ├── dashboard_db.ts # dashboard
│   │   ├── note_db.ts      # note
│   │   ├── sql_db.ts       # sql
│   │   ├── wbs_db.ts       # wbs
│   │   ├── timer_db.ts     # timer
│   │   ├── snippet_db.ts   # snippet
│   │   ├── ops_db.ts       # ops
│   │   └── text_db.ts      # text
│   ├── pages/
│   │   ├── registry.ts     # pageSrc → React コンポーネントのマッピング
│   │   └── （全10ページ）
│   └── stores/             # Zustand ストア
├── docs/
│   ├── architecture/react/ # ページ別アーキテクチャ仕様
│   ├── coding/react.md     # コーディング規約・ハマりポイント
│   └── design/buttons.md   # ボタンデザインガイド
└── src-tauri/              # Tauri デスクトップアプリ設定（Rust）
```

## 使い方

| 形態 | 起動方法 | 特徴 |
|---|---|---|
| **開発サーバー** | `npm run dev` | Vite dev server（ポート: 52700） |
| **本番ビルド配信** | `npm run build` 後に `scripts/start_server.command`（Mac）または `scripts/start_server.bat`（Windows）を実行 | `dist/` を静的サーバーで配信 |
| **デスクトップアプリ** | Tauri ビルド済みアプリを起動 | ネイティブウィンドウ。リリースページからダウンロード |

### タブ構成

ナビバー右端のギアアイコンから設定パネルを開き、タブの表示/非表示・順序変更・カスタムタブの追加削除ができる。設定は IndexedDB（`app_db`）に保存される。

- **組み込みタブ**: 非表示のみ可能、削除不可
- **カスタムタブ「カスタムURL」**: ラベル名と URL を指定して追加
- **カスタムタブ「ダッシュボード」**: 独立した IndexedDB インスタンスを持つダッシュボードを複数追加可能

新しいページを追加する場合は `src/pages/<Name>Page.tsx` を作成し、`src/pages/registry.ts` に `PAGE_REGISTRY` エントリを追加する。

### デスクトップアプリ（Tauri）

```bash
npm install
npx tauri dev        # 開発サーバー + ネイティブウィンドウで起動
npx tauri build      # 配布用バイナリを生成
```

リリース時は GitHub Actions が Mac (ARM64/x64) と Windows (x64) のバイナリを自動ビルドし、リリースページに添付する。
