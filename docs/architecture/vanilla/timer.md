# timer（ポモドーロ）アーキテクチャ

## ファイル構成

```
js/timer/state.js      状態管理
         renderer.js   描画
         events.js     イベントハンドラ
         app.js        エントリポイント
css/timer.less + css/timer/ パーシャル
src/pages/TimerPage.tsx  React 版（feature/react-migration ブランチ）
src/db/timer_db.ts       React 版 DB 層
```

## DB

`timer_db`（TimerDB）version 1
- `presets` ストア: `work_sec` / `break_sec`
- `sessions` ストア: `task_name` / `tag` / `duration_sec` / `started_at` / `ended_at`

## タイマー実装

- **Web Worker** ベースのカウントダウン（バックグラウンドタブでも正確に動作）
- `file://` 環境では setInterval フォールバック
- タイマー状態を localStorage `timer_running_state` に毎秒保存
- タブ破棄後に `_restoreTimerState()` で復元（ページリロード耐性あり）
