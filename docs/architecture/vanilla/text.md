# text（テキスト処理・変換ツール）アーキテクチャ

## ファイル構成

```
js/text/constants.js   定数
        state.js       状態管理
        regex.js       正規表現テスター
        encode.js      エンコード/デコード
        case.js        ケース変換
        count.js       文字カウント
        format.js      フォーマッタ（JSON/XML/SQL）
        timestamp.js   タイムスタンプ変換
        tsv.js         TSV/CSV 操作
        app.js         エントリポイント
css/text.less + css/text/ パーシャル
src/pages/TextPage.tsx  React 版（feature/react-migration ブランチ）
src/db/text_db.ts       React 版 DB 層
```

## DB

`text_db`（TextDB）version 1 — 現在永続化なし（将来拡張用）

## セクション構成

| セクション | 機能 |
|---|---|
| `regex` | 正規表現テスター（マッチハイライト・グループ表示） |
| `encode` | Base64・URL・HTML エンコード/デコード |
| `case` | camelCase / snake_case / PascalCase 等ケース変換 |
| `count` | 文字数・行数・単語数カウント |
| `format` | JSON / XML / SQL フォーマッタ |
| `timestamp` | Unix タイムスタンプ ↔ 日時変換 |
| `tsv` | TSV/CSV 変換・整形 |

各セクションは初回表示時に遅延初期化。
