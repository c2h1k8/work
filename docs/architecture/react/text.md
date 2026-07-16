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
- **アクティブセルへのスクロール追従**: 矢印/Tab 移動・範囲選択でアクティブセル（範囲選択時は端の `selEnd`）が画面外へ出たら、スクロールコンテナ（`tableRef` = `.tsv-table-wrap`）を**縦横スクロールして常に可視域に入れる**（Excel/Sheets 相当。多列CSV/TSVでマウス横スクロール不要に）。`useLayoutEffect([selCell, selEnd])` で対象セルを `[data-cell="{行}-{列}"]` から引き、`getBoundingClientRect` 差分で**必要な分だけ**動かす（見えている間は動かさない）。sticky ヘッダー（`.tsv-table th` は `position:sticky; top:0`）の高さと余白（`MARGIN=8px`）を考慮するため `scrollIntoView` は使わない（ヘッダー背後に隠れる／必要以上に飛ぶのを回避）
- **列検索（列名でジャンプ）**: 検索バーに、行フィルター（値検索 `search`）とは別枠で**列名で目的の列へジャンプ**するコンボボックスを配置（`maxCols > 1` のときのみ）。候補ラベルは `headers` があればヘッダー名、無い/空セルは `列 N`。入力に部分一致する列を `colMatches`（元の列 index を保持）で表示。↑↓ で候補移動・Enter/クリックで `jumpToColumn(colIdx)` → **現在行（なければ先頭行）のそのセルを選択** → 上記スクロール追従で可視域へ。確定後は入力クリア＋テーブルへフォーカス（キーボード操作継続）。Esc は入力クリア→未入力時は閉じる。候補クリックを blur より先に拾うため `onMouseDown preventDefault` ＋ blur は120ms遅延で閉じる
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
- **行の再レンダリング最適化**: 行は `TsvRow`（`React.memo`）に分離。コールバック props は `tsvHandlersRef` 経由の identity 不変ラッパー（実体は毎レンダー最新に差し替え）、選択状態は行ごとの派生値（`selectedCol` / `editingCol` / `rowRange`）で渡し、`editValue` は編集中の行にのみ `cellValue` を渡す。`updateCell` / `insertRow` は**変更行以外の配列 identity を保持**する（全行 deep copy しない）。これにより選択移動・編集中のキー入力で全行が再描画されない（大きな CSV/TSV 対策）。IME 関連の refs（`isComposingRef` / `imeEscRef` / `cellInputRef`）は props で渡す
