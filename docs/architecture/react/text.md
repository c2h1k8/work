# text（テキスト処理・変換ツール）React 版アーキテクチャ

## ファイル構成

```
src/pages/TextPage.tsx   メインコンポーネント
src/db/text_db.ts        Dexie.js（text_db）
```

## DB スキーマ

Vanilla JS 版と完全互換。セクション構成の詳細: @docs/architecture/vanilla/text.md

DB 名: `text_db` version 1（現在永続化なし、将来拡張用）

## セクション構成

| セクション | 機能 |
|---|---|
| `regex` | 正規表現テスター（マッチハイライト・グループ表示） |
| `encode` | Base64・URL・HTML エンコード/デコード |
| `case` | camelCase / snake_case / PascalCase 等ケース変換 |
| `count` | 文字数・行数・単語数カウント |
| `format` | JSON / XML / SQL フォーマッタ |
| `timestamp` | Unix タイムスタンプ ↔ 日時変換 |
| `tsv` | TSV/CSV 変換・整形（スプレッドシートUXでセル選択・範囲選択・コピペ対応） |

各セクションは初回表示時に遅延初期化。

## tsv セクション スプレッドシートUX

- **state**: `editCell / selCell / selEnd` はすべて `displayRows` のインデックス基準（`[displayIdx, colIdx]`）。`updateCell` は `dataRowIdx`（ヘッダー込みの `data` インデックス）を受け取る
- **セル選択**: クリック → 選択（青アウトライン）。選択中に再クリック or Enter/F2 → 編集モード。ダブルクリック → 直接編集
- **範囲選択**: Shift+クリック / Shift+矢印キー → `selEnd` を更新。`selRange` は `selCell` と `selEnd` から正規化して計算
- **キーボード（フォーカスモード）**: 矢印キー移動・Tab（右/左）・Enter/F2（編集開始）・Delete/Backspace（セルクリア）・Escape（選択解除）
- **キーボード（編集モード）**: Enter/Esc → 編集確定・元のセルに戻る。Tab/Shift+Tab → 次/前セルへ移動しながら編集モード継続。Esc は `editBeforeRef` で値を復元（リバート）
- **Ctrl+C**: 選択範囲をTSV形式でクリップボードへ
- **Ctrl+V**: クリップボードのTSV/CSVを `selCell` 起点でペースト（タブあり→TSV、なし→CSV として自動判定）。行・列が足りなければ自動拡張
- **行を間に挿入**（`insertRow(dataRowIdx, where)`）: 各行に「＋（下に挿入）」ボタン＋ `Ctrl/Cmd+Enter`＝下・`+Shift`＝上（`handleTableKeyDown`）。選択なしの Ctrl/Cmd+Enter は末尾追加。`data` 配列に空行を splice するだけ（position/DB なし）。挿入行の先頭セルを編集状態に。**ソート/フィルター中は無効**（`canInsert = sortCol < 0 && !q`。表示順と `data` 順が不一致になるため）
- **行の追加/削除**: 末尾追加（`addRow`）・行削除（`deleteRow`）
- **行の移動（並び替え）**: マウス・キーボード両対応
  - **DnD**: 各行先頭のドラッグハンドル（⠿）でドラッグ並び替え。`@dnd-kit` を使い、行は薄いラッパー `SortableTr`（先頭にハンドル列 `tsv-grip-col` を持ち、巨大なセル JSX は `children` として渡す）でラップ。`handleRowDragEnd` で `arrayMove(data, from, to)`（`active.id`/`over.id` は `dataRowIdx`＝`data` 配列インデックス）
  - **キーボード**: `Alt/Option+↑/↓` で選択行を1つ上/下へ（`handleTableKeyDown`）。ヘッダー行（index 0）は動かさない
  - **ソート/フィルター中は無効**（`canInsert` を流用。表示順と `data` 順が不一致になるため。`SortableTr` の `disabled` とハンドラ冒頭でガード）
- **空セル**: `—` で表示（選択・編集は可能）
- **テーブル ↔ textarea の関係**: textarea変更→`data`再パース（一方向）。テーブル編集は`setData`のみ（textarea は更新しない）。エクスポートは常に`data`から生成
