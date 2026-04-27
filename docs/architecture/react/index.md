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

- `useTabLabel()` — `TabContext.ts` から instanceId を取得（Dashboard の複数インスタンス識別に使用）

## テーマ

- `theme_store.ts` で `localStorage('mytools_theme')` を管理
- `[data-theme="dark"]` を `<html>` に適用
