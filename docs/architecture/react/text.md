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
| `tsv` | TSV/CSV 変換・整形 |

各セクションは初回表示時に遅延初期化。
