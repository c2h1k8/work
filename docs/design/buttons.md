# ボタンデザインガイドライン

定義ファイル: `src/styles/components/button.css`

---

## 基本ルール

- **すべての汎用ボタンは `.btn` を基底クラスとして使う**
- インライン Tailwind でのボタンスタイル定義は禁止（`px-3 py-1.5 rounded bg-[var(--c-accent)]` 等）
- バリアントとサイズは BEM 的なモディファイアで組み合わせる

```html
<button class="btn btn--primary btn--sm">保存</button>
```

---

## バリアント

### `btn--primary` — 主アクション

アクセントカラー塗りつぶし。ホバーで浮き上がるシャドウ。

**使う場面:**
- そのコンテキストで最重要な1つのアクション（保存・追加・確定・変換・解析）

**ルール:**
- 1つのフォーム・ツールバー・モーダルに **1つまで**
- 「保存」「追加」など肯定的な操作にのみ使う

```html
<button class="btn btn--primary btn--sm">保存</button>
<button class="btn btn--primary btn--sm">タスク追加</button>
```

---

### `btn--secondary` — 次点アクション

サーフェス背景＋ボーダー。primary より目立たせたくないが ghost より強調したい場合。

**使う場面:**
- primary と並べるが同格にはしたくないアクション（エクスポート・プレビュー等）
- primary が存在する画面での「実行するが主操作ではない」ボタン

```html
<button class="btn btn--primary btn--sm">保存</button>
<button class="btn btn--secondary btn--sm">プレビュー</button>
```

---

### `btn--ghost` — 補助アクション

背景なし・ボーダーなし。ホバーで背景が薄く出る。

**使う場面:**
- キャンセル・閉じる（primary の対になる操作）
- 編集・コピー・エクスポートなどの補助操作
- ツールバー内で primary と並ぶ低優先アクション

**破壊的な行インライン削除:**  
`btn--ghost` に `text-red-400 hover:text-red-300` を追加する（`btn--danger` は使わない）

```html
<!-- モーダルフッター -->
<button class="btn btn--ghost btn--sm">キャンセル</button>
<button class="btn btn--primary btn--sm">保存</button>

<!-- 行内アクション -->
<button class="btn btn--ghost btn--sm">編集</button>
<button class="btn btn--ghost btn--sm text-red-400 hover:text-red-300">削除</button>
```

---

### `btn--danger` — 破壊的操作の確認

赤系の背景＋ボーダー。ホバーで赤く塗りつぶし。

**使う場面:**
- 確認ダイアログ・モーダル内の「削除する」「リセットする」ボタン
- 取り消しできない操作の最終確認にのみ使う

**使わない場面:**
- 行内の削除ボタン（→ `btn--ghost text-red-400` を使う）
- キャンセルボタン（→ `btn--ghost` を使う）

```html
<!-- 確認ダイアログ -->
<button class="btn btn--ghost btn--sm">キャンセル</button>
<button class="btn btn--danger btn--sm">削除する</button>
```

---

### `btn--icon` — アイコンのみ

ボーダー付き正方形。ツールバーでアイコン単体を操作ボタンとして置く場合。

**ルール:**
- `title` 属性または `aria-label` で操作名を必ず付ける
- テキストラベルなしのアイコンにのみ使う

```html
<button class="btn btn--icon btn--sm" title="編集">
  <PencilIcon />
</button>
<button class="btn btn--icon btn--sm" title="削除">
  <TrashIcon />
</button>
```

---

## サイズ

| クラス | padding | font-size | 使う場面 |
|---|---|---|---|
| (なし) | 6px 14px | 13px | ページレベルの大きな CTA（現状ほぼ未使用） |
| `btn--sm` | 4px 10px | 12px | **ツールバー・モーダル・カード内（実質標準）** |

> ツールバーやモーダル内では **常に `--sm` を付ける**。デフォルトサイズは全画面的なCTAのみ。

---

## よくある組み合わせパターン

### モーダル・フォームフッター

```html
<div class="flex justify-end gap-2">
  <button class="btn btn--ghost btn--sm">キャンセル</button>
  <button class="btn btn--primary btn--sm">保存</button>
</div>
```

### ツールバー（主操作＋補助）

```html
<button class="btn btn--primary btn--sm">追加</button>
<button class="btn btn--ghost btn--sm">エクスポート</button>
```

### 行内アクション

```html
<button class="btn btn--ghost btn--sm">編集</button>
<button class="btn btn--ghost btn--sm text-red-400 hover:text-red-300">削除</button>
```

### アイコンツールバー

```html
<button class="btn btn--icon btn--sm" title="設定"><SettingsIcon /></button>
<button class="btn btn--icon btn--sm" title="更新"><RefreshIcon /></button>
```

### 削除確認ダイアログ

```html
<button class="btn btn--ghost">キャンセル</button>
<button class="btn btn--danger">削除する</button>
```

---

## `.btn` を使わない特殊ボタン

以下は用途が特定されておりグローバルスタイルで管理する。

| クラス | 定義場所 | 用途 |
|---|---|---|
| `.tab-btn` / `.tab-btn--active` | `globals.css` | ページ内セクションのタブ切り替え |
| `.nav-icon-btn` | `globals.css` | ナビゲーションヘッダーのアイコンボタン |
| Segmented Control | Tailwind インライン | モード切り替え（複数選択肢の排他選択） |
| トグルピル | Tailwind インライン | 月・曜日等の複数選択ボタン群 |
| コンポーネント専用 | CSS Modules | DatePicker・LabelManager 等の内部ボタン |

---

## 禁止事項

```html
<!-- NG: インライン Tailwind でのボタン定義 -->
<button class="px-3 py-1.5 rounded bg-[var(--c-accent)] text-white text-sm">保存</button>

<!-- OK -->
<button class="btn btn--primary btn--sm">保存</button>
```

```html
<!-- NG: primary を1画面に複数置く -->
<button class="btn btn--primary btn--sm">保存</button>
<button class="btn btn--primary btn--sm">削除</button>

<!-- OK: 削除は danger または ghost+red -->
<button class="btn btn--ghost btn--sm text-red-400 hover:text-red-300">削除</button>
<button class="btn btn--primary btn--sm">保存</button>
```
