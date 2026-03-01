# CLAUDE.md

Claude Code がこのプロジェクトで作業する際の指針。

## 必須ルール

- **対応を行うたびに README.md と CLAUDE.md を最新状態に最適化すること。**
  - 新機能・ファイル追加 → README のディレクトリ構成・説明を更新
  - 技術スタックの変更 → README の「技術スタック」を更新
  - 新しい規約・パターンの確立 → CLAUDE.md の該当セクションを更新

## プロジェクト概要

個人向け生産性ツール。`index.html` をエントリポイントとしたタブ UI で複数ページを切り替える。詳細は README.md 参照。

## コーディング規約

### JavaScript

- **全ページ Vanilla JS**（Vue.js 2 は削除済み）
- `todo.html` は IndexedDB（`KanbanDB` クラス）でデータ永続化。`localStorage` は使わない
- その他ページの localStorage 操作は `js/base/local_storage.js` の `saveToStorage` / `loadFromStorage` / `saveToStorageWithLimit` / `loadJsonFromStorage` を使う
- `js/base/common.js` の共通ユーティリティを活用する
- コメントは日本語で記載する
- `todo.js` のアーキテクチャ: `KanbanDB` / `State` / `Migration` / `Backup` / `Renderer` / `DragDrop` / `EventHandlers` / `Toast` / `App` の単一ファイル構成
- `DatePicker` は `js/base/date_picker.js` に分離された再利用可能部品。CSS は `css/base/date_picker.{less,css}`
- `todo.js` のグローバルヘルパー: `getColumnKeys()` / `sortTasksArray()` / `markDirty()` / `applyFilter()` / `renderFilterLabels()` / `renderTextWithLinks()`
- `State.tasks: {}` はカラムキー → タスク配列の動的マップ（固定配列ではない）
- `State.columns: []` は `{ id, key, name, position }` の配列。`getColumnKeys()` で key 一覧を取得
- `State.sort: { field, dir }` でソート状態を保持。localStorage `kanban_sort` に永続化
- `State.taskLabels: Map<taskId, Set<labelId>>` はフィルター用キャッシュ。`renderBoard()` でリビルド、ラベル追加／削除時にインクリメンタル更新
- `State.filter: { text, labelIds }` でフィルター状態を保持。`applyFilter()` でカードの表示／非表示を制御
- IndexedDB は version 2（`columns` ストアを v2 で追加。`key` / `position` インデックス付き）
- 期限日フィールドはカスタムカレンダー（`js/base/date_picker.js` の `DatePicker`）で選択。`#modal-due` は hidden input
- カラムは動的追加・削除可能。削除時にタスクが残っていればブロック

### CSS / LESS

- スタイルは `.less` で記述し、`npx lessc` でコンパイルして `.css` を生成する
  - 例: `npx lessc css/base/date_picker.less css/base/date_picker.css`
  - `.less` を編集したら必ず同コマンドで対応 `.css` を再生成すること
- 共通スタイルは `css/base/` 配下に配置する
- ページ固有スタイルは `css/<page>.{less,css}` に配置する

### HTML

- `lang="ja"` を指定する
- 外部ライブラリは CDN で読み込む（todo.html のみ SortableJS を使用。Bootstrap・Vue は削除済み）
- `defer` 属性を script タグに付ける

## ファイル配置ルール

| 種別 | 配置先 |
|------|--------|
| 新ページ | ルートに `<name>.html` |
| ページ固有 JS | `js/<name>.js` |
| ページ固有 CSS | `css/<name>.{less,css}` |
| 共通 JS | `js/base/<name>.js` |
| 共通 CSS | `css/base/<name>.{less,css}` |

## タブの追加方法

`js/index.js` の `TAB_ITEMS` 配列に追記する。

```js
{ label: "ラベル名", pageSrc: "page.html", isSelected: false }
```

## 注意事項

- `todo.html` は IndexedDB を使用するため `file://` でも動作する（localStorage 依存なし）
- その他ページは localStorage を使用するため、ローカルファイルアクセスでは制限が生じる場合がある
- LESS ファイルを編集した場合は `npx lessc <src>.less <dst>.css` で必ず CSS を再生成する
- `home.html` にはアカウント情報やスプレッドシートIDが含まれる。Git にコミットする際は注意する
