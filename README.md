# work

個人向け生産性ツール集。タブ UI でTODO管理・ホームダッシュボード・SQLリファレンスを切り替えて使用する。

## 概要

| ページ            | 説明                                                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `index.html`      | タブナビゲーションのエントリポイント                                                                                         |
| `todo.html`       | Kanban形式のTODO管理ボード（動的カラム追加削除・ソート・カスタムカレンダー・ラベルフィルター・タスク紐づけ・エクスポート／インポート付き） |
| `dashboard.html`  | カスタマイズ可能なホームダッシュボード（設定画面からセクション・アイテムを自由に作成。list/grid/table/command_builder でバインド変数プリセット対応） |
| `sql.html`        | Oracle SQL\*Plusコマンド・チューニングリファレンス（接続環境をIndexedDBで管理）                                              |
| `note.html`       | ノート管理（設計書・テストケース・エビデンス等のリンクや備考を可変フィールドで管理。フィールド幅 narrow/auto/wide/full・DatePicker対応。リンク表示名コピー・ドロップダウンフィールド対応） |
| `wbs.html`        | WBS管理（タスク名・予定/実績の開始日・日数・終了日（自動算出）・進捗・ステータス。土日/祝日/カスタム休業日を考慮した営業日計算。ガントチャート表示） |

## 技術スタック

- **フロントエンド**: Vanilla JS（全ページ統一）
- **スタイル**: LESS → CSS（手動コンパイル）。デザイントークンは `css/base/tokens.less` に一元管理
- **デザインシステム**: インディゴ/バイオレット系カラーパレット。ライト/ダークモード対応（`[data-theme]` 属性）
- **外部ライブラリ**: SortableJS（todo.html のみ、CDN）
- **データ永続化**: IndexedDB（全ページ）/ localStorage（UI状態・テーマ設定）
  - IndexedDB はブラウザネイティブの構造化 DB。`file://` でも動作しインストール不要。
  - todo.html はヘッダーのエクスポート／インポートボタンで JSON バックアップを手動管理できる。

## ディレクトリ構成

```
work/
├── index.html          # エントリポイント（タブ UI）
├── dashboard.html      # カスタムダッシュボード
├── todo.html           # TODO管理
├── sql.html            # SQLリファレンス
├── note.html           # ノート管理
├── wbs.html            # WBS管理（ガントチャート付き）
├── js/
│   ├── base/
│   │   ├── local_storage.js   # localStorage ユーティリティ
│   │   ├── common.js          # 共通ユーティリティ（dashboard.html を除く全ページで使用）
│   │   ├── utils.js           # escapeHtml / sortByPosition（全ページ共通）
│   │   ├── icons.js           # JS生成HTML用 SVGアイコン定数（全ページ共通）
│   │   ├── toast.js           # トースト通知（Toast.show）
│   │   ├── tooltip.js         # カスタムツールチップ（Tooltip.init）
│   │   ├── date_picker.js     # カスタムカレンダー部品（DatePicker.open）
│   │   ├── label_manager.js   # ラベル管理ダイアログ（LabelManager.open）
│   │   ├── label_filter.js    # ラベルフィルタードロップダウン
│   │   ├── custom_select.js   # カスタム select コンポーネント（CustomSelect.replaceAll）
│   │   └── bind_var_modal.js  # バインド変数 + プリセット管理モーダル（BindVarModal.open）
│   ├── db/
│   │   ├── kanban_db.js       # KanbanDB（todo.html 用、kanban_db）
│   │   ├── note_db.js         # NoteDB（note.html 用、note_db）
│   │   ├── dashboard_db.js    # DashboardDB（dashboard.html 用、dashboard_db）
│   │   ├── sql_db.js          # SqlDB（sql.html 用、sql_db）
│   │   └── wbs_db.js          # WbsDB（wbs.html 用、wbs_db）
│   ├── index.js        # タブ生成・切り替えロジック・テーマ管理（IndexedDB: app_db）
│   ├── dashboard.js    # カスタムダッシュボード（IndexedDB: dashboard_db）
│   ├── todo.js         # Kanban ロジック（IndexedDB: kanban_db）
│   ├── sql.js          # SQL コマンド生成（IndexedDB: sql_db）
│   ├── note.js         # ノート管理（IndexedDB: note_db）
│   └── wbs.js          # WBS・ガントチャート（IndexedDB: wbs_db）
└── css/
    ├── base/
    │   ├── tokens.{less,css}          # デザイントークン（カラー・シャドウ・ラジウス等）★
    │   ├── ui.{less,css}              # 共通 UI コンポーネント（btn/badge 等）★
    │   ├── tab_style.{less,css}       # タブ UI・ナビゲーション
    │   ├── toast.{less,css}           # トースト通知
    │   ├── tooltip.{less,css}         # カスタムツールチップ
    │   ├── date_picker.{less,css}     # カスタムカレンダー部品
    │   ├── label_manager.{less,css}   # ラベル管理ダイアログ
    │   ├── label_filter.{less,css}    # ラベルフィルタードロップダウン
    │   ├── custom_select.{less,css}   # カスタム select コンポーネント
    │   └── bind_var_modal.{less,css}  # バインド変数 + プリセット管理モーダル
    ├── dashboard.{less,css}
    ├── todo.{less,css}
    ├── sql.{less,css}
    ├── note.{less,css}
    └── wbs.{less,css}
```

## 使い方

ローカルサーバーまたはブラウザで `index.html` を開く（localStorage を使用するためファイル直接開きでは一部機能が制限される場合あり）。

### タブ構成

ナビバー右端のギアアイコンから設定パネルを開き、タブの表示/非表示・順序変更・カスタムタブの追加削除ができる。設定は IndexedDB（`app_db`）に保存され、リロード後も維持される。

- **組み込みタブ**（TODO / ダッシュボード / SQL / ノート / WBS）: 非表示のみ可能、削除不可
- **カスタムタブ「カスタムURL」**: ラベル名と URL を指定して追加。表示/非表示切り替え・削除が可能
- **カスタムタブ「ダッシュボード」**: 独立した IndexedDB インスタンスを持つダッシュボードを複数追加可能

コードで組み込みタブを追加する場合は `js/index.js` の `TAB_ITEMS` 配列に追記する。

### LESS のコンパイル

`.less` ファイルを編集後、対応する `.css` へコンパイルして反映する。

```bash
npx lessc css/base/tokens.less css/base/tokens.css
npx lessc css/todo.less css/todo.css
# ... 各ファイルに対して同様に実行
```
