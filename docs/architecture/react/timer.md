# timer（ポモドーロ）React 版アーキテクチャ

## ファイル構成

```
src/pages/TimerPage.tsx   メインコンポーネント
src/db/timer_db.ts        Dexie.js（timer_db）
```

## DB スキーマ

Vanilla JS 版と完全互換。詳細: @docs/architecture/vanilla/timer.md

DB 名: `timer_db` version 1
ストア: `presets`（`work_sec` / `break_sec`）/ `sessions`（`task_name` / `tag` / `duration_sec` / `started_at` / `ended_at`）

## React 版固有

- Web Worker ベースのカウントダウン（バックグラウンドタブ対応）
- `file://` 環境では setInterval フォールバック
- タイマー状態: `localStorage('timer_running_state')` に毎秒保存。リロード後に復元
