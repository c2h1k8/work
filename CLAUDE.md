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

- Vanilla JS（インデックス・ホーム・SQL）と Vue.js 2（TODO）を使い分ける
- `js/base/local_storage.js` の `saveToStorage` / `loadFromStorage` / `saveToStorageWithLimit` / `loadJsonFromStorage` を localStorage 操作に使う
- `js/base/common.js` の共通ユーティリティを活用する
- コメントは日本語で記載する

### CSS / LESS

- スタイルは `.less` で記述し、`.css` にコンパイルして使用する
- 共通スタイルは `css/base/` 配下に配置する
- ページ固有スタイルは `css/<page>.{less,css}` に配置する

### HTML

- `lang="ja"` を指定する
- 外部ライブラリは CDN で読み込む（todo.html のみ Bootstrap / Vue / Draggable を使用）
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

- localStorage を使用するため、ローカルファイルアクセスでは制限が生じる場合がある
- LESS ファイルを編集した場合は必ず対応する CSS にコンパイルして反映する
- `home.html` にはアカウント情報やスプレッドシートIDが含まれる。Git にコミットする際は注意する
