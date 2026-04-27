# Vanilla JS コーディング規約

全ページ Vanilla JS。コメントは日本語。

## コアユーティリティ（禁止事項厳守）

| モジュール | API | 禁止 |
|---|---|---|
| `js/core/utils.js` | `escapeHtml` / `sortByPosition` / `getString` / `isValidUrl` | — |
| `js/core/env.js` | `Env.type` / `Env.isTauri` / `Env.isLocalhost` / `Env.isFile` | — |
| `js/core/clipboard.js` | `Clipboard.copy(text)` → Promise | `navigator.clipboard.writeText` 直接使用禁止 |
| `js/core/opener.js` | `Opener.open(url)` / `Opener.intercept(root)` | `window.open` 直接使用禁止 |
| `js/core/file_saver.js` | `FileSaver.save(content, defaultName, opts?)` | Blob+`<a>.click()` 直接書き禁止 |
| `js/core/notify.js` | `Notify.send(title, body)` / `requestPermission()` / `getPermission()` | `Notification` API 直接使用禁止 |
| `js/core/icons.js` | `Icons.<name>` | JS 生成 HTML に SVG 直書き禁止。新アイコンは icons.js に追記してから使う |

## コンポーネント

- **Toast**（全ページ）: `Toast.success(msg)` / `Toast.error(msg)` — 各ページに `const showSuccess = (msg) => Toast.success(msg);` ラッパーを定義
- **ShortcutHelp**（全ページ）: `ShortcutHelp.register(categories)` で登録。z-index: 500
- **DatePicker**: `DatePicker.open(cur, onSelect, onClear)` — 自己挿入型（HTML 配置不要）
- **LabelManager**: `LabelManager.open({ title, labels: [{id,name,color}], onAdd, onUpdate, onDelete, onChange })` — 自己挿入型
- **BindVarModal**: `BindVarModal.open({...})` / `BindVarModal.close()` — 自己挿入型
- **CustomSelect**: `CustomSelect.replaceAll(container)` — `cs-target` クラス付き `<select>` を一括置換。`<option data-color="#hex">` で色反映。動的生成時は `innerHTML` 設定後に `replaceAll` を呼ぶ
- **Tooltip**: `Tooltip.init(container, selector?)` — `data-tooltip` 属性が対象

## JS 読み込み順

```
utils.js → [env.js → clipboard.js / notify.js / opener.js / file_saver.js] → icons.js
→ components/* → activity_db.js → activity_logger.js → <page>_db.js → js/<page>/*.js
```

## 分割ページのモジュール順

| ページ | モジュール順 |
|---|---|
| todo | `state → backup → renderer → dragdrop → app` |
| dashboard | `constants → state → renderer → events → app` |
| note | `state → renderer → events → app` |
| sql / wbs | `constants → state → renderer → events → app` |
| timer | `state → renderer → events → app` |
| ops | `constants → state → log_viewer → cron → http_status → ports → app` |
| text | `constants → state → regex → encode → case → count → format → timestamp → tsv → app` |
| index | `constants → db → theme → shell → search → backup → settings → activity_log → app` |
