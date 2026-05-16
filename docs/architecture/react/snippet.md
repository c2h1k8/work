# snippet / diff_tool React 版アーキテクチャ

## snippet

**ファイル**:
```
src/pages/SnippetPage.tsx   メインコンポーネント
src/db/snippet_db.ts        Dexie.js（snippet_db）
src/styles/pages/snippet.module.css  CSS モジュール（アニメーション・ホバー効果）
```

DB 名: `snippet_db` version 1（Vanilla JS 版と完全互換）
ストア: `snippets`（`title` / `language` / `tags` / `description` / `code` / `created_at` / `updated_at` / `position`）

シンタックスハイライト: Shiki v4（Vanilla の highlight.js とは異なる）。`useThemeStore` と連動してテーマ切替時に自動再ハイライト。

**使用カスタムコンポーネント**:
- `Select` — 言語フィルター（左パネル）・モーダル言語選択
- `ShortcutHelp` — `?` キーでショートカット一覧表示
- `FileSaver` — エクスポート（Tauri 対応）

**グローバル検索**: `searchRegistry.register('snippet', ...)` でタイトル・説明・コードを検索対象に登録。

**キーボードショートカット**: N（新規）/ Enter（コピー）/ Ctrl+F（検索フォーカス）/ ↑↓（一覧移動）/ Escape（モーダルを閉じる）/ ?（ヘルプ表示）

**タグ**: `getTagColor(tag)` でタグ名ハッシュから決定論的に色を割り当て（スキーマ変更なし）。モーダルのタグ入力には既存タグのオートコンプリートあり（↑↓/Tab/Enter で選択）。

**リスト選択状態**: CSS モジュールでモダン inset スタイルを実装。`margin: 2px 6px; border-radius: var(--radius-lg)` で丸いアイテム。選択時は背景 `--c-accent-dim` + タイトル色 `--c-accent`（border-l なし）。フォーカスリングは `:focus-visible` のみ発火（`outline: 2px solid var(--c-accent)`）。SQL・Note と視覚的に統一。

**エクスポート・インポート**: 左パネルフッターにアイコンボタン（`DownloadIcon` / `UploadIcon`）のみ表示。インポートは `<label>` + hidden input で実装。

**日時表示**: 詳細パネルフッターに「更新: YYYY/MM/DD HH:mm」のみ表示。作成日時はツールチップ（title 属性）で補足。

**モーダル**: ヘッダーの X ボタンなし。キャンセルボタン（フッター）+ Escape キー + バックドロップクリックで閉じる。

**フィルタのリセット挙動**:
- **初回ロード時**: `getAllSnippets()` 後、`localStorage` に保存されていた言語フィルタ・タグフィルタが現在のスニペット群に存在しない値を指している場合は自動でリセット（無効なフィルタによる全件非表示を防止）
- **スニペット追加時**: 追加したスニペットが現在の言語フィルタ・タグフィルタに一致しない場合はフィルタをクリアして新規スニペットを表示する

## diff_tool

**ファイル**:
```
src/pages/DiffToolPage.tsx   メインコンポーネント
```

永続化なし。Web Worker で差分計算を非同期処理。
