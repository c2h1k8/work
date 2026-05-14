# index（タブナビ）アーキテクチャ

## ファイル構成

```
js/index/constants.js   TAB_ITEMS・ICON_PALETTE 定数
         db.js          AppDB クラス（IndexedDB: app_db）
         theme.js       ダークモード切替
         shell.js       タブ UI・iframe 管理
         search.js      グローバル検索（Ctrl+K）
         backup.js      一括バックアップ/リストア
         settings.js    設定パネル
         activity_log.js アクティビティログモーダル
         app.js         エントリポイント
css/index.less + css/index/_variables.less / _shell.less / _viewport.less / _settings.less / _search.less
```

## DB

`app_db`（AppDB）— `settings` ストア。`AppDB.get(name)` / `AppDB.set(name, value)` で KV 操作。
`tab_config` キーにタブ設定を保存。

## タブ管理

- 組み込みタブ追加: `js/index/constants.js` の `TAB_ITEMS` に追記（`isBuiltIn: true` で削除不可）
- アイコン変更: `ICON_PALETTE` 配列。SVG 文字列を `icon` フィールドに保存

## グローバル検索（Ctrl+K）

各 iframe へ `postMessage` で中継 → 結果を集約してドロップダウン表示

## ショートカット転送

iframe フォーカス中も以下は親で処理:
`Ctrl+K` / `Ctrl+1-9` / `Ctrl+[` / `Ctrl+]` / `Ctrl+Shift+E`
`Ctrl+,` はページ側委譲

## ダークモード

`[data-theme="dark"]` を `<html>` に付与。切替は全 iframe に `postMessage({ type: 'theme-change', theme })` で伝播。
