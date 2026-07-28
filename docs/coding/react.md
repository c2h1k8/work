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
| **Markdown** | `<MarkdownBody>` (`src/components/MarkdownBody.tsx`) を使う。`react-markdown` 直接使用禁止。プラグイン: `remark-gfm` + `remark-breaks` + `rehype-sanitize`。シンタックスハイライト: `react-syntax-highlighter`（PrismLight）|
| **アイコン** | `lucide-react` |
| **Toast** | `useToast()` フック（`src/components/Toast.tsx`） |
| **確認ダイアログ** | `confirmDialog()`（`src/components/ConfirmDialog.tsx`）。**native `confirm()` 直接使用禁止** |

## 確認ダイアログ（confirmDialog）

```ts
import { confirmDialog } from '../components/ConfirmDialog';

// Promise<boolean> を返す（OK=true）。呼び出し元は async にする
if (!(await confirmDialog({ message: '削除しますか？', danger: true }))) return;
// カスタムラベル
const replace = await confirmDialog({ message: '…', okLabel: '削除してインポート', cancelLabel: '追記インポート', danger: true });
```

- `ConfirmHost` は `App.tsx` に1つマウント済み（各ページでの設置不要）
- 破壊的操作（削除・上書き・リセット）は `danger: true`（OK ボタンが `btn--danger` になる）
- Enter=OK / Esc・背景クリック=キャンセル。ダイアログ表示中の Esc は capture+stopPropagation で下層のモーダルに漏れない

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

## 共通ユーティリティ（src/core/utils.ts）

| 関数 | 用途 |
|---|---|
| `escapeHtml(str)` | HTML エスケープ |
| `sortByPosition(arr)` | position 昇順ソート |
| `getString(origin, params)` | プレースホルダー置換 |
| `isValidUrl(url)` | URL バリデーション |
| `getTagColor(tag)` | タグ名ハッシュ → 決定論的カラー（16色）|
| `extractExcerpt(text, query)` | 検索クエリ周辺の抜粋テキストを返す（グローバル検索の excerpt 用）|
| `lsGet(k)` / `lsSet(k, v)` / `lsJson<T>(k)` | localStorage ヘルパー（UI 選択状態の保存用。ページ内での再定義禁止）|

`getTagColor` は同じ文字列に対して常に同じ色を返す。スニペット・タイマーで共用。

## 日付フォーマット（src/core/date.ts）

`padStart(2, '0')` の手書きフォーマットは禁止。以下を使う:

| 関数 | 用途 |
|---|---|
| `pad2(n)` | 2桁ゼロ埋め |
| `toLocalYmd(d)` | ローカル日付 → `YYYY-MM-DD`（`toISOString()` の UTC ずれ回避）|
| `ymdCompact(d?)` | エクスポートファイル名等の `YYYYMMDD` |
| `formatDateTime(iso)` | ISO 文字列 → `YYYY/MM/DD HH:mm` 表示 |

ダッシュボードのトークン形式（`{TODAY:YYYY/MM/DD}` 等の任意フォーマット）は `src/core/dashboard_resolve.ts` の `formatDate` を参照。

## ハマりポイント

- **インスタンスID（Dashboard）**: `useTabLabel()` フック（`src/contexts/TabContext.ts`）で取得
- **IME 入力確定検知**: `e.nativeEvent.isComposing`（`e.isComposing` は型エラー）
- **React.Fragment に key を付ける場合**: `import React from 'react'` を明示的に追加
- **型キャスト**: `obj as unknown as Record<string, unknown>` のパターン（直接キャストが型エラーになる場合）
- **document レベルのキーボードショートカット**: **全タブが同時マウントされている**ため、`useIsActiveTab()` で `if (!isActive) return;` のガードが必須（deps にも `isActive` を入れる）。詳細は `@docs/architecture/react/index.md`

## ストレージ方針

Vanilla JS 版と同じ方針。ただし localStorage 操作は直接 `localStorage.getItem/setItem` を使う（ラッパー不要）。
キー名は既存のプレフィックスと互換性を保つ（例: `wbs_collapsed`, `timer_running_state`）。
