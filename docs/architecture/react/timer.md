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
- ウィンドウタイトル更新: `setWindowTitle()` ヘルパー（`TimerPage.tsx` 内）で `document.title` と Tauri の `getCurrentWindow().setTitle()` を同時更新。Tauri ではネイティブウィンドウタイトルに `document.title` が反映されないため
- タイマーバッジ: `setTimerBadge(label)` ヘルパー（`TimerPage.tsx` 内）でタイトル更新と同じ `useEffect` から呼び出す
  - **macOS**: Dock バッジに "MM:SS" テキスト（`app.dock().set_badge()`）
  - **Windows**: タスクバーボタン右下に 32×32 RGBA オーバーレイアイコン（`window.set_overlay_icon()`）。ビットマップフォントで分部分（"25"）を白文字で描画
  - Tauri コマンド `set_timer_badge(label: Option<String>)` を `src-tauri/src/main.rs` に実装
  - 外部フォント・クレート追加なし（5×7 ビットマップフォントをコード内に定義）
  - JS 側は `window.__TAURI__.core.invoke('set_timer_badge', { label })` で呼び出し
