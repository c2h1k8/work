# work

個人向け生産性ツール集。タブ UI でTODO管理・ホームダッシュボード・SQLリファレンスを切り替えて使用する。

## 概要

| ページ       | 説明                                                                                                                         |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `index.html` | タブナビゲーションのエントリポイント                                                                                         |
| `todo.html`  | Kanban形式のTODO管理ボード（動的カラム追加削除・ソート・カスタムカレンダー・ラベルフィルター・タスク紐づけ・エクスポート／インポート付き） |
| `home.html`  | アカウント情報・スプレッドシートリンク・URLユーティリティ                                                                    |
| `sql.html`   | Oracle SQL\*Plusコマンド・チューニングリファレンス                                                                           |

## 技術スタック

- **フロントエンド**: Vanilla JS（全ページ統一。）
- **スタイル**: LESS → CSS（手動コンパイル）
- **外部ライブラリ**: SortableJS（todo.html のみ、CDN）
- **データ永続化**: IndexedDB（todo.html）/ localStorage（その他ページ）
  - IndexedDB はブラウザネイティブの構造化 DB。`file://` でも動作しインストール不要。
  - todo.html はヘッダーのエクスポート／インポートボタンで JSON バックアップを手動管理できる。
  - IndexedDB スキーマは v5（tasks / comments / labels / task_labels / columns / activities / **task_relations** ストア）。
  - コメントはソフトデリート（`deleted_at` フラグ）で管理。「コメント」タブでは非表示、「すべて」タブでは削除済み表示。

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
│   │   ├── common.js         # 共通ユーティリティ
│   │   └── date_picker.js    # カスタムカレンダー部品（再利用可能）
│   ├── index.js        # タブ生成・切り替えロジック
│   ├── home.js         # ホーム機能
│   ├── todo.js         # Vanilla JS Kanban ロジック（IndexedDB）
│   └── sql.js          # SQL コマンド生成
└── css/
    ├── base/
    │   ├── common.{less,css}          # 共通スタイル
    │   ├── tab_style.{less,css}       # タブ UI
    │   ├── accordion_style.{less,css} # アコーディオン（標準）
    │   ├── accordion_style2.{less,css}# アコーディオン（バリエーション）
    │   ├── radio_style.{less,css}     # ラジオボタン
    │   ├── select_style.{less,css}    # セレクトボックス
    │   └── date_picker.{less,css}     # カスタムカレンダー部品
    ├── todo.{less,css}
    └── sql.{less,css}
```

## 使い方

ローカルサーバーまたはブラウザで `index.html` を開く（localStorage を使用するためファイル直接開きでは一部機能が制限される場合あり）。

### タブ構成

ナビバー右端のギアアイコンから設定パネルを開き、タブの表示/非表示・順序変更・カスタムタブの追加削除ができる。設定は `localStorage` の `TAB_CONFIG` キーに保存され、リロード後も維持される。

- **組み込みタブ**（TODO / HOME / SQL）: 非表示のみ可能、削除不可
- **カスタムタブ**: ラベル名と URL を指定して追加。表示/非表示切り替え・削除が可能

コードで組み込みタブを追加する場合は `js/index.js` の `TAB_ITEMS` 配列に追記する。

### LESS のコンパイル

`.less` ファイルを編集後、対応する `.css` へコンパイルして反映する。
