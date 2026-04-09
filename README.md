# work

個人向け生産性ツール集。タブ UI でTODO管理・ホームダッシュボード・SQLリファレンスを切り替えて使用する。

## 概要

| ページ                   | 説明                                                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `index.html`             | タブナビゲーションのエントリポイント                                                                                         |
| `pages/todo.html`        | Kanban形式のTODO管理ボード（動的カラム追加削除・ソート・カスタムカレンダー・ラベルフィルター・タスク紐づけ・エクスポート／インポート付き） |
| `pages/dashboard.html`   | カスタマイズ可能なホームダッシュボード（設定画面からセクション・アイテムを自由に作成。list/grid/table/command_builder/markdown/iframe/countdown でバインド変数プリセット対応。使用頻度順ソート対応） |
| `pages/sql.html`         | Oracle SQL\*Plusコマンド・チューニングリファレンス（接続環境管理・SQL整形・実行計画ガイド検索・テーブル定義メモをIndexedDBで管理。カラム横断検索・カラム一覧ビュー・テーブル間リレーション自動検出・カラムコピー・テーブル比較対応） |
| `pages/note.html`        | ノート管理（設計書・テストケース・エビデンス等のリンクや備考を可変フィールドで管理。フィールド幅 narrow/auto/wide/full・DatePicker対応。リンク表示名コピー・ドロップダウンフィールド・ノート間リンク・変更履歴対応） |
| `pages/wbs.html`         | WBS管理（タスク名・予定/実績の開始日・日数・終了日（自動算出）・進捗・ステータス。土日/祝日/カスタム休業日を考慮した営業日計算。ガントチャート表示。DnDによる行の並び替え・親移動時は子孫も一括移動） |
| `pages/timer.html`       | 定型作業タイマー（ポモドーロ等のプリセット選択・作業/休憩フェーズ管理・セッションログ記録。今日/今週/今月/先月/カスタム期間の切替、日別推移・タグ別・タスク別・曜日別集計グラフ、1日の目標時間と達成率・連続達成ストリーク、CSV エクスポート対応） |
| `pages/snippet.html`     | コードスニペット管理（言語・タグで整理、検索・フィルタ。ワンクリックコピー・シンタックスハイライト（highlight.js）・エクスポート/インポート対応） |
| `pages/diff_tool.html`   | 差分比較ツール（左右のテキストをペーストするだけでdiffをハイライト表示。行単位/文字単位切替・空白無視・空行無視・タブ無視・折りたたみ表示。永続化なし） |
| `pages/ops.html`         | 運用インフラツール（ログビューア・cron式エディタ・HTTPステータスコード辞典・ポート番号リファレンス・サブネット計算機 の5ツールをタブで統合） |
| `pages/text.html`        | テキスト処理・変換ツール（エンコード・ケース変換・正規表現テスター・文字カウント・タイムスタンプ・TSV/CSV・フォーマッタ の7ツールをタブで統合） |

## 技術スタック

- **フロントエンド**: Vanilla JS（全ページ統一）
- **スタイル**: LESS → CSS（手動コンパイル）。デザイントークンは `css/core/tokens.less` に一元管理
- **デザインシステム**: インディゴ/バイオレット系カラーパレット。ライト/ダークモード対応（`[data-theme]` 属性）
- **外部ライブラリ**: `vendor/` フォルダにローカル配置（CDN 不使用）

  | ファイル | ライブラリ | 用途 |
  |---|---|---|
  | `vendor/sortable.min.js` | SortableJS 1.15.2 | todo / note / dashboard / wbs の DnD |
  | `vendor/marked.min.js` | marked（最新） | dashboard の Markdown レンダリング |
  | `vendor/marked4.min.js` | marked v4 | todo の Markdown |
  | `vendor/dompurify.min.js` | DOMPurify（最新） | dashboard の XSS サニタイズ |
  | `vendor/highlight.min.js` | highlight.js 11.10.0 | snippet のシンタックスハイライト |
  | `vendor/highlight-github.min.css` | highlight.js ライトテーマ | snippet |
  | `vendor/highlight-github-dark.min.css` | highlight.js ダークテーマ | snippet |
- **データ永続化**: IndexedDB（全ページ）/ localStorage（UI状態・テーマ設定）
  - IndexedDB はブラウザネイティブの構造化 DB。`file://` でも動作しインストール不要。
  - todo.html はヘッダーのエクスポート／インポートボタンで JSON バックアップを手動管理できる。
- **マルチ環境対応**: `file://` / `localhost` / Tauri デスクトップアプリの3形態で動作。環境検出（`js/core/env.js`）で差異を吸収し、クリップボード（`js/core/clipboard.js`）・通知（`js/core/notify.js`）・URL開封（`js/core/opener.js`）・ファイル保存（`js/core/file_saver.js`）を環境に応じて切り替え。

## ディレクトリ構成

```
work/
├── index.html              # エントリポイント（タブ UI）
├── src-tauri/              # Tauri デスクトップアプリ設定（Rust）
│   ├── tauri.conf.json     # アプリ設定（ウィンドウサイズ・バンドル等）
│   ├── src/main.rs         # Rust エントリポイント
│   ├── icons/              # アプリアイコン（.icns/.ico/.png）
│   └── capabilities/       # セキュリティ権限定義
├── pages/                  # 各ページ HTML（iframe で読み込み）
│   ├── todo.html           # TODO管理
│   ├── dashboard.html      # カスタムダッシュボード
│   ├── sql.html            # SQLリファレンス
│   ├── note.html           # ノート管理
│   ├── wbs.html            # WBS管理（ガントチャート付き）
│   ├── timer.html          # 定型作業タイマー
│   ├── snippet.html        # コードスニペット管理
│   ├── diff_tool.html      # 差分比較ツール
│   ├── ops.html            # 運用ツール（ログビューア等）
│   └── text.html           # テキスト処理・変換ツール
├── js/
│   ├── core/                  # 基盤ユーティリティ
│   │   ├── utils.js           # escapeHtml / sortByPosition / getString / isValidUrl
│   │   ├── env.js             # 環境検出（Env.type / isTauri / isLocalhost / isFile）
│   │   ├── clipboard.js       # 環境対応クリップボード（Clipboard.copy）
│   │   ├── notify.js          # 環境対応通知（Notify.send / requestPermission / getPermission）
│   │   ├── opener.js          # 環境対応URL開封（Opener.open / intercept）
│   │   ├── file_saver.js      # 環境対応ファイル保存（FileSaver.save）
│   │   ├── icons.js           # JS生成HTML用 SVGアイコン定数
│   │   ├── local_storage.js   # localStorage ユーティリティ
│   │   └── activity_logger.js # アクティビティログ記録（ActivityLogger.log）
│   ├── components/            # 再利用可能UIコンポーネント
│   │   ├── toast.js           # トースト通知（Toast.show）
│   │   ├── tooltip.js         # カスタムツールチップ（Tooltip.init）
│   │   ├── date_picker.js     # カスタムカレンダー部品（DatePicker.open）
│   │   ├── label_manager.js   # ラベル管理ダイアログ（LabelManager.open）
│   │   ├── label_filter.js    # ラベルフィルタードロップダウン
│   │   ├── custom_select.js   # カスタム select コンポーネント（CustomSelect.replaceAll）
│   │   ├── bind_var_modal.js  # バインド変数管理モーダル（BindVarModal.open）
│   │   └── shortcut_help.js   # ショートカットキー一覧モーダル（ShortcutHelp.register/show）
│   ├── db/                    # IndexedDB 操作クラス
│   │   ├── kanban_db.js       # KanbanDB（todo 用）
│   │   ├── note_db.js         # NoteDB（note 用）
│   │   ├── dashboard_db.js    # DashboardDB（dashboard 用）
│   │   ├── sql_db.js          # SqlDB（sql 用）
│   │   ├── wbs_db.js          # WbsDB（wbs 用）
│   │   ├── timer_db.js        # TimerDB（timer 用）
│   │   ├── snippet_db.js      # SnippetDB（snippet 用）
│   │   ├── ops_db.js          # OpsDB（ops 用）
│   │   ├── text_db.js         # TextDB（text 用）
│   │   └── activity_db.js     # ActivityDB（アクティビティログ共通）
│   ├── index/                 # タブナビゲーション（分割）
│   │   ├── constants.js       # TAB_ITEMS・ICON_PALETTE
│   │   ├── db.js              # AppDB
│   │   ├── theme.js           # テーマ切替
│   │   ├── shell.js           # シェル・ナビ・ビューポート
│   │   ├── search.js          # グローバル検索
│   │   ├── backup.js          # 一括バックアップ
│   │   ├── settings.js        # タブ設定パネル
│   │   ├── activity_log.js    # アクティビティログモーダル（ActivityLogModal）
│   │   └── app.js             # App 初期化
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
│   ├── sql/                   # SQL Toolkit（分割）
│   │   ├── constants.js       # 定数（デフォルト環境・オプション・型定義・実行計画ガイド・SVGアイコン）
│   │   ├── state.js           # State + ヘルパー
│   │   ├── renderer.js        # DOM 描画
│   │   ├── events.js          # CRUD操作・エクスポート/インポート
│   │   └── app.js             # App 初期化
│   ├── wbs/                   # WBS・ガントチャート（分割）
│   │   ├── constants.js       # 定数・祝日計算・営業日ユーティリティ
│   │   ├── state.js           # State + ガントレイアウト + 親子集計
│   │   ├── renderer.js        # DOM 描画
│   │   ├── events.js          # EventHandlers
│   │   └── app.js             # App
│   ├── timer/                 # 定型作業タイマー（分割）
│   │   ├── state.js           # State + フォーマットヘルパー + 通知音
│   │   ├── renderer.js        # DOM 描画
│   │   ├── events.js          # EventHandlers + タイマー制御
│   │   └── app.js             # App
│   ├── ops/                   # 運用インフラツール（分割）
│   │   ├── constants.js       # 定数定義（ログレベル/HTTP/ポート等）
│   │   ├── state.js           # State + タブ切替
│   │   ├── log_viewer.js      # ログビューア
│   │   ├── cron.js            # cron式エディタ
│   │   ├── http_status.js     # HTTPステータスコード辞典
│   │   ├── ports.js           # ポート番号リファレンス
│   │   └── app.js             # 初期化 + イベントバインド
│   ├── text/                  # テキスト処理・変換ツール（分割）
│   │   ├── constants.js       # 定数定義
│   │   ├── state.js           # State + タブ切替
│   │   ├── regex.js           # 正規表現テスター
│   │   ├── encode.js          # エンコード/デコード
│   │   ├── case.js            # ケース変換
│   │   ├── count.js           # 文字カウント
│   │   ├── format.js          # フォーマッタ（JSON/XML）
│   │   ├── timestamp.js       # タイムスタンプ変換
│   │   ├── tsv.js             # TSV/CSV 変換
│   │   └── app.js             # 初期化 + イベントバインド
│   ├── snippet.js             # コードスニペット管理（未分割）
│   └── diff_tool.js           # 差分比較ツール（未分割）
└── css/
    ├── core/                  # 基盤スタイル
    │   ├── tokens.{less,css}  # デザイントークン
    │   └── ui.{less,css}      # 共通 UI（btn 等）+ カラーエイリアス
    ├── components/            # コンポーネントスタイル
    │   ├── checkbox.{less,css}        # カスタムチェックボックス（.chk-label）
    │   ├── radio_pill.{less,css}      # カスタムラジオボタン（.radio-pill）
    │   ├── checklist.{less,css}       # チェックリスト
    │   ├── toast / tooltip / date_picker / label_manager /
    │   ├── label_filter / custom_select / bind_var_modal / shortcut_help
    │   └── (各 {less,css} ペア)
    ├── index.less + css/index/        # タブUI・ナビ・設定・検索（パーシャル分割）
    ├── todo.less + css/todo/          # パーシャル分割
    ├── dashboard.less + css/dashboard/
    ├── note.less + css/note/
    ├── sql.less + css/sql/            # パーシャル分割
    ├── ops.less + css/ops/            # パーシャル分割
    ├── text.less + css/text/          # パーシャル分割
    ├── wbs.less + css/wbs/            # パーシャル分割
    ├── timer.less + css/timer/        # パーシャル分割
    ├── snippet.{less,css}
    └── diff_tool.{less,css}
```

## 使い方

3つの利用形態に対応。

| 形態 | 起動方法 | 特徴 |
|---|---|---|
| **file://** | `index.html` をブラウザで直接開く | インストール不要。クリップボードは `execCommand` フォールバック、通知非対応 |
| **localhost** | ローカルサーバーで起動 | 全機能利用可。Web Worker / 通知 / Clipboard API が使える |
| **デスクトップアプリ** | Tauri ビルド済みアプリを起動 | ネイティブウィンドウ。CORS制約なし。リリースページからダウンロード |

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

コードで組み込みタブを追加する場合は `js/index/constants.js` の `TAB_ITEMS` 配列に追記する。

### デスクトップアプリ（Tauri）

Rust ツールチェーンが必要。開発時:

```bash
npm install
npx tauri dev        # 開発サーバー + ネイティブウィンドウで起動
npx tauri build      # 配布用バイナリを生成（src-tauri/target/release/bundle/）
```

リリース時は GitHub Actions が Mac (ARM64/x64) と Windows (x64) のバイナリを自動ビルドし、リリースページに添付する。

### LESS のコンパイル

`.less` ファイルを編集後、対応する `.css` へコンパイルして反映する。

```bash
npx lessc css/core/tokens.less css/core/tokens.css
npx lessc css/todo.less css/todo.css
# ... 各ファイルに対して同様に実行
```
