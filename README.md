# work

個人向け生産性ツール集。タブ UI でTODO管理・ホームダッシュボード・SQLリファレンスを切り替えて使用する。

## 概要

| ページ | 説明 |
|--------|------|
| `index.html` | タブナビゲーションのエントリポイント |
| `todo.html` | Kanban形式のTODO管理ボード |
| `home.html` | アカウント情報・スプレッドシートリンク・URLユーティリティ |
| `sql.html` | Oracle SQL*Plusコマンド・チューニングリファレンス |

## 技術スタック

- **フロントエンド**: Vanilla JS / Vue.js 2（todo.html のみ）
- **スタイル**: LESS → CSS（手動コンパイル）
- **外部ライブラリ**: Bootstrap 5、SortableJS、Vue.Draggable（todo.html のみ）
- **データ永続化**: localStorage

## ディレクトリ構成

```
work/
├── index.html          # エントリポイント（タブ UI）
├── home.html           # ホームダッシュボード
├── todo.html           # TODO管理
├── sql.html            # SQLリファレンス
├── js/
│   ├── base/
│   │   ├── local_storage.js  # localStorage ユーティリティ
│   │   └── common.js         # 共通ユーティリティ
│   ├── index.js        # タブ生成・切り替えロジック
│   ├── home.js         # ホーム機能
│   ├── todo.js         # Vue.js TODO ロジック
│   └── sql.js          # SQL コマンド生成
└── css/
    ├── base/
    │   ├── common.{less,css}          # 共通スタイル
    │   ├── tab_style.{less,css}       # タブ UI
    │   ├── accordion_style.{less,css} # アコーディオン（標準）
    │   ├── accordion_style2.{less,css}# アコーディオン（バリエーション）
    │   ├── radio_style.{less,css}     # ラジオボタン
    │   └── select_style.{less,css}    # セレクトボックス
    ├── todo.{less,css}
    └── sql.{less,css}
```

## 使い方

ローカルサーバーまたはブラウザで `index.html` を開く（localStorage を使用するためファイル直接開きでは一部機能が制限される場合あり）。

### タブ構成

`js/index.js` の `TAB_ITEMS` 配列でタブの追加・順序変更が可能。

```js
const TAB_ITEMS = [
  { label: "TODO", pageSrc: "todo.html", isSelected: true },
  { label: "HOME", pageSrc: "home.html", isSelected: false },
  { label: "SQL",  pageSrc: "sql.html",  isSelected: false },
];
```

### LESS のコンパイル

`.less` ファイルを編集後、対応する `.css` へコンパイルして反映する。
