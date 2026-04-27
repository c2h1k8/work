# snippet / diff_tool アーキテクチャ

## snippet

**ファイル**: `js/snippet.js`（未分割単一ファイル）、`css/snippet.{less,css}`
**React 版**: `src/pages/SnippetPage.tsx`、`src/db/snippet_db.ts`

**DB**: `snippet_db`（SnippetDB）version 1
- `snippets` ストア: `title` / `language` / `tags` / `content` / `created_at` / `updated_at`

**機能**: 言語・タグで整理、検索・フィルタ、ワンクリックコピー、シンタックスハイライト（highlight.js）、エクスポート/インポート

## diff_tool

**ファイル**: `js/diff_tool.js`（未分割単一ファイル）、`css/diff_tool.{less,css}`
**React 版**: `src/pages/DiffToolPage.tsx`（永続化なし）

**機能**: 左右テキストの差分をハイライト表示。行単位/文字単位切替・空白無視・空行無視・タブ無視・折りたたみ表示。
Web Worker で差分計算を非同期処理。永続化なし。
