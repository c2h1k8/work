# React 版コーディング規約（feature/react-migration ブランチ）

## ページの追加方法

1. `src/pages/<Name>Page.tsx` を作成し `export function <Name>Page()` を定義
2. `src/pages/registry.ts` の `PAGE_REGISTRY` に `'pages/<name>.html': <Name>Page` を追加
3. DB が必要な場合は `src/db/<name>_db.ts` に Dexie.js クラスを作成

## 規約一覧

| 項目 | ルール |
|---|---|
| **型** | TypeScript strict モード。コメントは日本語 |
| **スタイル** | Tailwind CSS v4 クラス + CSS 変数（`var(--c-*)`, `var(--shadow-*)` 等） |
| **DB** | Dexie.js。既存 Vanilla JS の DB 名・バージョンと完全互換を保つ |
| **DnD** | `@dnd-kit/core` + `@dnd-kit/sortable`（SortableJS 禁止） |
| **Markdown** | `react-markdown` + `rehype-sanitize`（marked.js 禁止） |
| **アイコン** | `lucide-react` |
| **Toast** | `useToast()` フック（`src/components/Toast.tsx`） |

## CSS 変数

```
var(--c-bg) / var(--c-bg-2) / var(--c-fg) / var(--c-fg-2) / var(--c-fg-3)
var(--c-accent) / var(--c-border)
```

## アクティビティログ

```ts
activityDB.add({
  page, action, target_type,
  target_id: String(id),          // 必ず string 型
  summary,
  created_at: new Date().toISOString()  // ISO8601 文字列
})
```

## ハマりポイント

- **インスタンスID（Dashboard）**: `useTabLabel()` フック（`src/contexts/TabContext.ts`）で取得
- **IME 入力確定検知**: `e.nativeEvent.isComposing`（`e.isComposing` は型エラー）
- **React.Fragment に key を付ける場合**: `import React from 'react'` を明示的に追加
- **型キャスト**: `obj as unknown as Record<string, unknown>` のパターン（直接キャストが型エラーになる場合）

## ストレージ方針

Vanilla JS 版と同じ方針。ただし localStorage 操作は直接 `localStorage.getItem/setItem` を使う（ラッパー不要）。
キー名は既存のプレフィックスと互換性を保つ（例: `wbs_collapsed`, `timer_running_state`）。
