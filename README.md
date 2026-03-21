# work

個人向け生産性ツール集。タブ UI でTODO管理・ホームダッシュボード・SQLリファレンスを切り替えて使用する。

## 概要

| ページ            | 説明                                                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `index.html`      | タブナビゲーションのエントリポイント                                                                                         |
| `todo.html`       | Kanban形式のTODO管理ボード（動的カラム追加削除・ソート・カスタムカレンダー・ラベルフィルター・タスク紐づけ・エクスポート／インポート付き） |
| `dashboard.html`  | カスタマイズ可能なホームダッシュボード（設定画面からセクション・アイテムを自由に作成。list/grid/table/command_builder/markdown/iframe/countdown/formatter でバインド変数プリセット対応） |
| `sql.html`        | Oracle SQL\*Plusコマンド・チューニングリファレンス（接続環境管理・SQL整形・実行計画ガイド検索・テーブル定義メモをIndexedDBで管理） |
| `note.html`       | ノート管理（設計書・テストケース・エビデンス等のリンクや備考を可変フィールドで管理。フィールド幅 narrow/auto/wide/full・DatePicker対応。リンク表示名コピー・ドロップダウンフィールド対応） |
| `wbs.html`        | WBS管理（タスク名・予定/実績の開始日・日数・終了日（自動算出）・進捗・ステータス。土日/祝日/カスタム休業日を考慮した営業日計算。ガントチャート表示） |
| `timer.html`      | 定型作業タイマー（ポモドーロ等のプリセット選択・作業/休憩フェーズ管理・セッションログ記録。タグ別集計で工数振り返りに対応） |
| `snippet.html`    | コードスニペット管理（言語・タグで整理、検索・フィルタ。ワンクリックコピー・シンタックスハイライト（highlight.js）・エクスポート/インポート対応） |
| `diff_tool.html`  | 差分比較ツール（左右のテキストをペーストするだけでdiffをハイライト表示。行単位/文字単位切替・空白無視・折りたたみ表示。永続化なし） |
| `ops.html`        | 運用インフラツール（ログビューア・cron式エディタ・HTTPステータスコード辞典・ポート番号リファレンス・サブネット計算機 の5ツールをタブで統合） |

## 技術スタック

- **フロントエンド**: Vanilla JS（全ページ統一）
- **スタイル**: LESS → CSS（手動コンパイル）。デザイントークンは `css/core/tokens.less` に一元管理
- **デザインシステム**: インディゴ/バイオレット系カラーパレット。ライト/ダークモード対応（`[data-theme]` 属性）
- **外部ライブラリ**: SortableJS（todo.html のみ、CDN）、marked.js + DOMPurify（dashboard.html の Markdown セクション、CDN）、highlight.js（snippet.html のシンタックスハイライト、CDN）
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
├── timer.html          # 定型作業タイマー
├── snippet.html        # コードスニペット管理
├── diff_tool.html      # 差分比較ツール
├── ops.html            # 運用ツール（ログビューア等）
├── js/
│   ├── core/                  # 基盤ユーティリティ
│   │   ├── utils.js           # escapeHtml / sortByPosition / getString / isValidUrl
│   │   ├── icons.js           # JS生成HTML用 SVGアイコン定数
│   │   └── local_storage.js   # localStorage ユーティリティ
│   ├── components/            # 再利用可能UIコンポーネント
│   │   ├── toast.js           # トースト通知（Toast.show）
│   │   ├── tooltip.js         # カスタムツールチップ（Tooltip.init）
│   │   ├── date_picker.js     # カスタムカレンダー部品（DatePicker.open）
│   │   ├── label_manager.js   # ラベル管理ダイアログ（LabelManager.open）
│   │   ├── label_filter.js    # ラベルフィルタードロップダウン
│   │   ├── custom_select.js   # カスタム select コンポーネント（CustomSelect.replaceAll）
│   │   └── bind_var_modal.js  # バインド変数管理モーダル（BindVarModal.open）
│   ├── db/                    # IndexedDB 操作クラス
│   │   ├── kanban_db.js       # KanbanDB（todo.html 用）
│   │   ├── note_db.js         # NoteDB（note.html 用）
│   │   ├── dashboard_db.js    # DashboardDB（dashboard.html 用）
│   │   ├── sql_db.js          # SqlDB（sql.html 用）
│   │   ├── wbs_db.js          # WbsDB（wbs.html 用）
│   │   ├── timer_db.js        # TimerDB（timer.html 用）
│   │   ├── snippet_db.js      # SnippetDB（snippet.html 用）
│   │   └── ops_db.js          # OpsDB（ops.html 用: ポート番号カスタム登録）
│   ├── todo/                  # TODO管理（分割）
│   │   ├── state.js           # State + グローバルヘルパー
│   │   ├── backup.js          # エクスポート/インポート
│   │   ├── renderer.js        # DOM 描画
│   │   ├── dragdrop.js        # ドラッグ&ドロップ
│   │   └── app.js             # EventHandlers + App
│   ├── dashboard/             # ダッシュボード（分割）
│   │   ├── constants.js       # 定数・ユーティリティ
│   │   ├── state.js           # State + 変数解決
│   │   ├── renderer.js        # DOM 描画
│   │   ├── events.js          # EventHandlers
│   │   └── app.js             # App
│   ├── note/                  # ノート管理（分割）
│   │   ├── state.js           # State + ヘルパー
│   │   ├── renderer.js        # DOM 描画
│   │   ├── events.js          # EventHandlers
│   │   └── app.js             # App
│   ├── index.js               # タブ生成・切り替え・テーマ管理
│   ├── sql.js                 # SQL コマンド生成
│   ├── wbs.js                 # WBS・ガントチャート
│   ├── timer.js               # 定型作業タイマー
│   ├── snippet.js             # コードスニペット管理
│   ├── diff_tool.js           # 差分比較ツール
│   └── ops.js                 # 運用インフラツール（ログビューア/cron/HTTPステータス/ポート番号/サブネット）
└── css/
    ├── core/                  # 基盤スタイル
    │   ├── tokens.{less,css}  # デザイントークン ★
    │   ├── ui.{less,css}      # 共通 UI（btn 等）+ カラーエイリアス ★
    │   └── tab_style.{less,css} # タブ UI・ナビゲーション
    ├── components/            # コンポーネントスタイル
    │   ├── checklist.{less,css}     # チェックリスト（共通）
    │   ├── toast / tooltip / date_picker / label_manager /
    │   ├── label_filter / custom_select / bind_var_modal
    │   └── (各 {less,css} ペア)
    ├── todo.less → css/todo/_*.less  # パーシャル分割
    ├── dashboard.less → css/dashboard/_*.less
    ├── note.less → css/note/_*.less
    ├── sql.{less,css}
    ├── wbs.{less,css}
    ├── timer.{less,css}
    ├── snippet.{less,css}
    ├── diff_tool.{less,css}
    └── ops.{less,css}
```

## 使い方

ローカルサーバーまたはブラウザで `index.html` を開く（localStorage を使用するためファイル直接開きでは一部機能が制限される場合あり）。

### ローカルサーバーでの起動（推奨）

**iframeセクション**など一部機能は `file://` では動作しないため、ローカルサーバーでの起動を推奨。ポート番号: `52700`。

| OS | 起動 | 停止 |
|----|------|------|
| Windows | `start_server.bat` をダブルクリック | `stop_server.bat` をダブルクリック |
| Mac | `start_server.command` をダブルクリック | `stop_server.command` をダブルクリック |

- サーバーはバックグラウンドで起動（ウィンドウなし）し、既存のブラウザで新しいタブが開く
- 起動済みのときは再起動せずそのままブラウザを開く
- Python3 → Python → Node.js の順で自動検出。見つからない場合はインストール先 URL を表示
- Mac の `.command` ファイルは初回のみ右クリック→「開く」が必要（Gatekeeper の警告を回避）

### タブ構成

ナビバー右端のギアアイコンから設定パネルを開き、タブの表示/非表示・順序変更・カスタムタブの追加削除ができる。設定は IndexedDB（`app_db`）に保存され、リロード後も維持される。

- **組み込みタブ**（TODO / ダッシュボード / SQL / ノート / WBS / タイマー / スニペット / 差分比較）: 非表示のみ可能、削除不可
- **カスタムタブ「カスタムURL」**: ラベル名と URL を指定して追加。表示/非表示切り替え・削除が可能
- **カスタムタブ「ダッシュボード」**: 独立した IndexedDB インスタンスを持つダッシュボードを複数追加可能

コードで組み込みタブを追加する場合は `js/index.js` の `TAB_ITEMS` 配列に追記する。

### LESS のコンパイル

`.less` ファイルを編集後、対応する `.css` へコンパイルして反映する。

```bash
npx lessc css/core/tokens.less css/core/tokens.css
npx lessc css/todo.less css/todo.css
# ... 各ファイルに対して同様に実行
```
