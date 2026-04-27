# ops（運用インフラツール）React 版アーキテクチャ

## ファイル構成

```
src/pages/OpsPage.tsx   メインコンポーネント
src/db/ops_db.ts        Dexie.js（ops_db）
```

## DB スキーマ

Vanilla JS 版と完全互換。セクション構成の詳細: @docs/architecture/vanilla/ops.md

DB 名: `ops_db` version 1
ストア: `ports`（カスタムポートメモ）

## セクション構成

| セクション | 機能 |
|---|---|
| `log-viewer` | ログテキスト解析・フィルタ・ハイライト（Web Worker） |
| `cron` | cron 式の視覚的エディタ・次回実行時刻プレビュー |
| `http-status` | HTTP ステータスコード辞典（検索対応） |
| `ports` | ウェルノウンポート辞典 + カスタムメモ |

各セクションは初回表示時に遅延初期化。
