# wbs（ガントチャート）アーキテクチャ

## ファイル構成

```
js/wbs/constants.js   定数・営業日計算ユーティリティ
       state.js       状態管理
       renderer.js    描画（ガント含む）
       events.js      イベントハンドラ
       app.js         エントリポイント
css/wbs.less + css/wbs/ パーシャル
src/pages/WbsPage.tsx  React 版（feature/react-migration ブランチ）
src/db/wbs_db.ts       React 版 DB 層
```

## DB

`wbs_db`（WbsDB）version 1
- `tasks` ストア: `level` / `position` / `plan_start` / `plan_days` / `actual_start` / `actual_end` / `progress` / `status` / `memo`

## 営業日計算（constants.js）

- `addBusinessDays(date, days)` — 営業日を加算
- `countBusinessDays(start, end)` — 営業日数をカウント
- `isNonWorkingDay(date)` — 非営業日（土日・祝日・カスタム）判定
- `getJapaneseHolidays(year)` — 日本の祝日一覧取得

## ガント表示

- `DAY_PX = 22` — 1日あたりのピクセル幅
- 予定バー（上段）と実績バー（下段）を並列表示
- 横スクロール位置を localStorage に記憶

## DnD（SortableJS）

グループ移動時は選択タスク + 全子孫を一括 splice。
