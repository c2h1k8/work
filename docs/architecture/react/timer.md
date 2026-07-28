# timer（ポモドーロ）React 版アーキテクチャ

## ファイル構成

```
src/pages/TimerPage.tsx   メインコンポーネント
src/db/timer_db.ts        Dexie.js（timer_db）
```

## 日付フィルタリングの注意点

`getSessionsByDate` / `getSessionsInRange` は `localDate(iso)` ヘルパーでローカル日付を取得して比較する。
`started_at.slice(0, 10)` は UTC 日付になるため JST 0〜9 時の記録が前日扱いになるバグを防ぐため。

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

- **キーボードショートカット（`Space` 開始/停止 / `r` リセット / `Ctrl+←→` プリセット切替）は `useIsActiveTab()` でアクティブタブに限定**。全タブが同時マウントされているため、ガードがないと他ページ表示中もキーを奪う（`Space` は `preventDefault` によりページのスクロールも潰す）。詳細は `@docs/architecture/react/index.md`
- Web Worker ベースのカウントダウン（バックグラウンドタブ対応）
- `file://` 環境では setInterval フォールバック
- タイマー状態: `localStorage('timer_running_state')` に毎秒保存。リロード後に復元
- ウィンドウタイトル更新: `setWindowTitle()` ヘルパー（`TimerPage.tsx` 内）で `document.title` と Tauri の `getCurrentWindow().setTitle()` を同時更新。Tauri ではネイティブウィンドウタイトルに `document.title` が反映されないため
- タスクバー/Dock 表示は **「量＝プログレスバー」「正確な数字＝バッジ」** の役割分担。いずれもタイトル更新と同じ `useEffect` から呼ぶ
  - **プログレスバー** `setTimerProgress(mode, fraction)`（`TimerPage.tsx` 内）: 残り割合（`remaining / total`）を「量」として大きく表示。`mode=null` で消去
    - `getCurrentWindow().setProgressBar({ status, progress })` を呼ぶだけ（Rust コマンド不要）。**Windows=タスクバーボタン背景 / macOS=Dock アイコン**にバーが出る
    - 状態色でモード区別: 作業=`normal`（緑）/ 休憩=`paused`（黄）
    - **毎秒更新してもチカチカしない**（ネイティブ要素が滑らかに伸縮するだけ）
  - **バッジ（数字）** `setTimerBadge({ label, mode })`（`TimerPage.tsx` 内）: 正確な数字を担当。`null` でクリア
    - `label`: **残り1分以上は「分」（切り上げ）、残り1分未満は「秒」に自動切替**（小さいアイコンに MM:SS は判読不能なため）
    - **更新は数字が変わった時だけ**（`lastBadgeKeyRef` でスロットル）→ 通常は1分に1回しか再描画されず**チカチカしない**。最後の1分のみ毎秒更新
    - **macOS**: Dock バッジにテキスト表示。Dock バッジは赤ピル固定で色分け不可のため、**休憩時は `☕` を数字前置**して区別（タイトルバーの ▶/☕ と統一）
    - **Windows**: 32×32 RGBA オーバーレイアイコン（`window.set_overlay_icon()`）。モード色の角丸地（作業=#6366f1 / 休憩=#10b981）に白い数字を**大きく**描画（1桁=scale4 / 2桁=scale3）。リングは廃止（量はバーが担うため、数字を最大化）
    - Tauri コマンド `set_timer_badge(label: Option<String>, mode: Option<String>)` を `src-tauri/src/main.rs` に実装。外部フォント・クレート追加なし（5×7 ビットマップフォントをコード内に定義）
    - JS 側は `window.__TAURI__.core.invoke('set_timer_badge', { label, mode })` で呼び出し
  - クリア処理は**アンマウント時のみの別 `useEffect`** に分離（毎秒の cleanup→再設定によるチカチカを避けるため）

## 一時停止インターバル追跡

- `pauseIntervalsRef`: `{ started_at: number; ended_at: number }[]` 形式で一時停止期間を蓄積（`started_at/ended_at` は `Date.now()` の ms 値）
- `handlePause`: `pauseIntervalsRef.current.push({ started_at: now, ended_at: 0 })`
- `handleStart`（再開時）: 最後の interval の `ended_at` を確定し、`pausedDurRef` を加算
- `doSaveSession`: `ended_at > 0` な interval のみ ISO8601 に変換して `pause_intervals` に保存
- リセット・フェーズ終了・途中終了・スキップ後: `pauseIntervalsRef.current = []`
- `saveTimerState` / ページ復元: `pauseIntervals` キーで `localStorage` に保存・復元

## TodayTimeline（今日 / 昨日のタイムライン）

props: `sessions`, `goalSec`, `historyView`

- `historyView === 'yesterday'` のとき「昨日のタイムライン」、それ以外は「今日のタイムライン」を表示
- セッションごとに `getWorkSegments()` で作業セグメントを算出
- `pause_intervals` がある場合: エンベロープ（斜線パターン `repeating-linear-gradient(-45deg, --c-border)`）で全期間を示し、作業セグメント（タグ色）を重ねる
- `pause_intervals` がない（旧セッション）場合: 全期間を作業色で描画
- 現在時刻マーカー（縦線）を axis 範囲内に表示
- 凡例（一時停止データがある場合のみ）: 作業＝タグ別カラードット、一時停止＝斜線パターンスウォッチ
- `SessionRow` デュレーションバー: 一時停止ありの作業部分もタグ色（`tagCol`）を使用
