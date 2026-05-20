# timer（ポモドーロ）React 版アーキテクチャ

## ファイル構成

```
src/pages/TimerPage.tsx   メインコンポーネント
src/db/timer_db.ts        Dexie.js（timer_db）
```

## DB スキーマ

DB 名: `timer_db` version 2

| ストア | インデックス |
|---|---|
| `presets` | `++id` |
| `sessions` | `++id, started_at, tag` |

`sessions` フィールド:
- `task_name`, `tag`, `notes`, `duration_sec`, `started_at`, `ended_at`（Vanilla JS 版互換）
- `pause_intervals?: { started_at: string; ended_at: string }[]`（version 2 追加・任意）

`pause_intervals` は一時停止のたびに `{ started_at: ISO8601, ended_at: ISO8601 }` を push する配列。
フィールドがない（古いセッション）場合は一時停止なしとして扱う。

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

## 一時停止インターバル追跡

- `pauseIntervalsRef`: `{ started_at: number; ended_at: number }[]` 形式で一時停止期間を蓄積（`started_at/ended_at` は `Date.now()` の ms 値）
- `handlePause`: `pauseIntervalsRef.current.push({ started_at: now, ended_at: 0 })`
- `handleStart`（再開時）: 最後の interval の `ended_at` を確定し、`pausedDurRef` を加算
- `doSaveSession`: `ended_at > 0` な interval のみ ISO8601 に変換して `pause_intervals` に保存
- リセット・フェーズ終了・途中終了・スキップ後: `pauseIntervalsRef.current = []`
- `saveTimerState` / ページ復元: `pauseIntervals` キーで `localStorage` に保存・復元

## TodayTimeline（今日のタイムライン）

- セッションごとに `getSegments()` で作業/一時停止セグメントを算出
- `pause_intervals` がある場合: 作業セグメント（タグ色・高さ大）と一時停止セグメント（斜線パターン・高さ小）を交互に描画
- `pause_intervals` がない（旧セッション）場合: 全期間を作業色で描画
- 現在時刻マーカー（縦線）を axis 範囲内に表示
- 一時停止データが1件以上あるとき凡例（作業 / 一時停止）を表示
