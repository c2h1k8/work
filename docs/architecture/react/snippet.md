# snippet / diff_tool React 版アーキテクチャ

## snippet

**ファイル**:
```
src/pages/SnippetPage.tsx   メインコンポーネント
src/db/snippet_db.ts        Dexie.js（snippet_db）
```

DB 名: `snippet_db` version 1（Vanilla JS 版と完全互換）
ストア: `snippets`（`title` / `language` / `tags` / `content` / `created_at` / `updated_at`）

シンタックスハイライト: Shiki v4（Vanilla の highlight.js とは異なる）

## diff_tool

**ファイル**:
```
src/pages/DiffToolPage.tsx   メインコンポーネント
```

永続化なし。Web Worker で差分計算を非同期処理。
