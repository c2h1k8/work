# index（タブナビ）React 版アーキテクチャ

## ファイル構成

```
src/App.tsx                    ルートコンポーネント（AppShell）
src/main.tsx                   エントリポイント
src/contexts/TabContext.ts      タブラベル（instanceId）を提供するコンテキスト
src/stores/tab_store.ts        Zustand: タブ設定
src/stores/theme_store.ts      Zustand: テーマ
src/db/app_db.ts               Dexie.js（app_db）
src/components/layout/         AppShell レイアウト部品
```

## DB

`app_db`（AppDB）— Vanilla JS 版と完全互換。`tab_config` キーにタブ設定を保存。

## フック

- `useTabLabel()` — `TabContext.ts` からタブラベルを取得

## グローバルオーバーレイ（App.tsx）

`SettingsPanel` / `ActivityLogModal` / `ShortcutHelp` / `ToastContainer` に加えて
`ConfirmHost`（`src/components/ConfirmDialog.tsx`）をマウント。
各所の確認ダイアログは native `confirm()` ではなく `confirmDialog()`（Promise ベース）を使う
— 詳細は `@docs/coding/react.md` 参照。

## ページルックアップ（App.tsx）

`PAGE_REGISTRY[tab.pageSrc.split('?')[0]]` でクエリ文字列を除去してルックアップ。
`pages/dashboard.html?instance=...` として保存されたタブも正しく表示できる。

## ダッシュボードタブ追加（SettingsPanel.tsx）

ダッシュボードタブ追加時の `pageSrc` は `pages/dashboard.html?instance=${crypto.randomUUID()}`。
`instanceId` は `pageSrc` の `?instance=` クエリ文字列から取得（Vanilla JS との互換性のため）。
`?instance=` がない場合は `""` → Vanilla JS 版のデフォルトと一致。

## アクティビティログ設定（SettingsPanel.tsx）

`ACTIVITY_PAGES` 定数で管理対象ページを定義（todo / note / snippet / wbs / dashboard / sql）。
設定は `appDB.get('activity_log_config')` → `{ disabledPages: string[] }` に永続化。
各ページは `ActivityLogger.log()` 経由で記録 — `disabledPages` に含まれるページは自動スキップ。
直接 `activityDB.add()` を呼ぶと設定が無視されるため禁止。

## グローバル検索（GlobalSearch.tsx / search_store.ts）

`searchRegistry.register(key, handler)` で各ページがハンドラを登録。全タブは hidden でも mount 済みのため、ページ未訪問でもハンドラは有効。

| ページ | ハンドラキー | 種別 | 内容 |
|---|---|---|---|
| Todo | `'todo'` | コンテンツ | タスク名・説明文 |
| Note | `'note'` | コンテンツ | ノート一覧 |
| Snippet | `'snippet'` | コンテンツ | スニペット一覧 |
| SQL | `'sql-nav'` | ナビゲーション | サブタブ名（接続・設定 / 実行計画 / テーブルメモ） |
| SQL | `'sql-memo'` | コンテンツ | テーブル定義メモ |
| テキスト処理 | `'text-nav'` | ナビゲーション | サブタブ名（正規表現 / エンコード / ケース変換 / … 全7件） |
| Ops | `'ops-nav'` | ナビゲーション | セクション名（ログビューア / cron / HTTP / ポート番号） |
| WBS | `'wbs'` | コンテンツ | タスク名・メモ |
| タイマー | `'timer-presets'` | コンテンツ | プリセット名・作業/休憩時間 |

ナビゲーション結果の `onSelect`: タブ切り替え + `localStorage` 更新 + 状態 setter 呼び出し。
コンテンツ結果: DB 直接検索（ページ state 非依存）。

## TopNav タブ overflow（TopNav.tsx）

タブが表示幅を超えた場合、超過分を「もっと見る」ボタン（`tab-more-btn`）にまとめる。

- `ResizeObserver` で `top-nav__tabs`（`overflow: hidden`）の幅を監視
- 各タブボタンの `offsetLeft + offsetWidth > containerWidth - MORE_BTN_WIDTH(72px)` で超過判定
- 超過タブは `visibility: hidden; pointer-events: none; position: absolute`（DOM 上は残して幅測定に使う）
- アクティブタブは常に表示エリアに置く（超過する場合は末尾の表示タブと swap）
- 「もっと見る」ドロップダウンは外クリック・Escape で閉じる
- アクティブタブがドロップダウン内にある場合、ボタンの下ボーダーがアクセント色になる

## テーマ

- `theme_store.ts` で `localStorage('mytools_theme')` を管理
- `[data-theme="dark"]` を `<html>` に適用
