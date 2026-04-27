# note React 版アーキテクチャ

## ファイル構成

```
src/pages/NotePage.tsx   メインコンポーネント
src/db/note_db.ts        Dexie.js（note_db）
```

## DB スキーマ

Vanilla JS 版と完全互換。詳細スキーマ・フィールドタイプ仕様: @docs/architecture/vanilla/note.md

DB 名: `note_db` version 2
ストア: `tasks` / `fields` / `entries` / `note_links` / `history`

## React 版固有

- DnD: `@dnd-kit/core` + `@dnd-kit/sortable`（フィールド並び替え）
- Markdown: `react-markdown` + `rehype-sanitize`
- アクティビティログ: `activityDB.add({ page: 'note', action, target_type, target_id: String(id), summary, created_at: new Date().toISOString() })`
