# ops（運用インフラツール）アーキテクチャ

## ファイル構成

```
js/ops/constants.js    定数
       state.js        状態管理
       log_viewer.js   ログビューア
       cron.js         cron 式エディタ
       http_status.js  HTTP ステータスコード辞典
       ports.js        ポート番号リファレンス
       app.js          エントリポイント
css/ops.less + css/ops/ パーシャル
src/pages/OpsPage.tsx  React 版（feature/react-migration ブランチ）
src/db/ops_db.ts       React 版 DB 層
```

## DB

`ops_db`（OpsDB）version 1
- `ports` ストア: カスタムポートメモ

## セクション構成

| セクション | 機能 |
|---|---|
| `log-viewer` | ログテキスト解析・フィルタ・ハイライト（Web Worker で処理） |
| `cron` | cron 式の視覚的エディタ・次回実行時刻プレビュー |
| `http-status` | HTTP ステータスコード辞典（検索対応） |
| `ports` | ウェルノウンポート辞典 + カスタムメモ |

各セクションは初回表示時に遅延初期化。
