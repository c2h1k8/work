# sql React 版アーキテクチャ

## ファイル構成

```
src/pages/SqlPage.tsx   メインコンポーネント
src/db/sql_db.ts        Dexie.js（sql_db）
```

## DB スキーマ

Vanilla JS 版と完全互換。詳細: @docs/architecture/vanilla/sql.md

DB 名: `sql_db` version 2
ストア: `envs` / `table_memos`

## タブ構成

| タブ | 機能 |
|---|---|
| **接続・設定** | 接続環境 CRUD + JSON エクスポート/インポート・セッション設定コピー・バインド変数生成・Ctrl+Enter で接続コマンドコピー |
| **実行計画 & チューニング** | 実行計画テキスト解析（左ペイン）+ チューニングガイド（右ペイン）を左右分割表示 |
| **テーブル定義メモ** | カラム一覧・テーブル間リレーション自動検出・テーブル比較モーダル・CREATE TABLE SQL パース・JSON エクスポート/インポート |

## localStorage キー

| キー | 値 |
|---|---|
| `sql_active_tab` | `'setup'` \| `'analyze'` \| `'memo'` |
| `sql_selected_env` | 選択中接続環境 ID |
| `sql_params` | バインド変数パラメータ |
| `sql_tune_tab` | チューニングガイド選択タブ |
| `sql_tune_groups` | チューニングガイドグループ展開状態 |
| `sql_memo_view` | テーブル定義メモビューモード |
| `sql_sqlplus_opts` | SQL\*Plus オプション |
| `sql_sqlplus_extra` | SQL\*Plus 追加設定 |

## アクティビティログ

`activityDB.add({ page: 'sql', action, target_type, target_id: String(id), summary, created_at: new Date().toISOString() })`
