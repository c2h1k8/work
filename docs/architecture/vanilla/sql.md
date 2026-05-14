# sql アーキテクチャ

## ファイル構成

```
js/sql/constants.js   定数
       state.js       状態管理
       renderer.js    描画
       events.js      イベントハンドラ
       app.js         エントリポイント
css/sql.less + css/sql/ パーシャル
src/pages/SqlPage.tsx  React 版（feature/react-migration ブランチ）
src/db/sql_db.ts       React 版 DB 層
```

## DB

`sql_db`（SqlDB）version **2**
- `envs` ストア: 接続環境（ホスト・ポート・ユーザー・パスワード・DB 名等）
- `table_memos` ストア: テーブル定義メモ（カラム一覧・リレーション・比較用）

## タブ構成（React 版）

| タブ | 機能 |
|---|---|
| **接続・設定** | 接続環境 CRUD + JSON エクスポート/インポート・セッション設定ワンクリックコピー（実行計画/実行結果）・バインド変数（VAR/EXEC 生成）・Ctrl+Enter で接続コマンドコピー |
| **実行計画 & チューニング** | 実行計画テキスト解析（左ペイン）+ チューニングガイド参照（右ペイン）を左右分割で同時表示 |
| **テーブル定義メモ** | カラム一覧ビュー / テーブル間リレーション自動検出 / テーブル比較モーダル / CREATE TABLE SQL パース取り込み / JSON エクスポート/インポート |

## localStorage キー

| キー | 値 |
|---|---|
| `sql_active_tab` | `'setup'` \| `'analyze'` \| `'memo'` |
| `sql_selected_env` | 選択中の接続環境 ID |
| `sql_params` | バインド変数パラメータ |
| `sql_tune_tab` | チューニングガイドの選択タブ |
| `sql_tune_groups` | チューニングガイドのグループ展開状態 |
| `sql_memo_view` | テーブル定義メモのビューモード |
| `sql_sqlplus_opts` | SQL\*Plus オプション |
| `sql_sqlplus_extra` | SQL\*Plus 追加設定 |
