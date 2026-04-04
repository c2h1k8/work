# タイマー通知デバッグ手順（Windows アプリ）

## DevTools の開き方

本番ビルドは DevTools が無効のため、このバージョン（v1.0.14）から `devtools` 機能を有効にした。
アプリを起動後、タイマーページの **iframe 内を右クリック →「要素を検証」** で DevTools が開く。

> `Ctrl+Shift+I` は動作しない。右クリックメニューから開くこと。

DevTools が開いたら **Console タブ** を選択する。

---

## Step 1: 環境確認

```javascript
console.log('isTauri:', Env.isTauri);
console.log('window.__TAURI__:', !!window.__TAURI__);
console.log('parent.__TAURI__:', !!window.parent.__TAURI__);
console.log('notif API:', window.parent.__TAURI__?.notification);
```

確認ポイント:
- `isTauri: true` になっているか
- `notif API` に `sendNotification` 等のメソッドが表示されるか（`undefined` でないか）

---

## Step 2: 手動で通知を送信

```javascript
window.parent.__TAURI__.notification.sendNotification({ title: 'テスト', body: 'テスト通知' });
```

通知が届いたかどうかを確認する。

---

## Step 3: 権限確認

```javascript
window.parent.__TAURI__.notification.isPermissionGranted().then(r => console.log('permission granted:', r));
```

- `true` → OS側で権限あり
- `false` → OS側で権限なし → 下記「Windows 通知設定の確認」へ

---

## Step 4: Step 1 で `notif API: undefined` だった場合

`core.invoke` で直接叩いてみる:

```javascript
window.parent.__TAURI__.core.invoke('plugin:notification|notify', {
  notification: { title: 'テスト', body: 'core.invoke テスト' }
}).then(() => console.log('OK')).catch(e => console.error('NG:', e));
```

エラー内容をメモしておく。

---

## Windows 通知設定の確認

DevTools が使えない場合でも以下を確認できる。

1. **Windows の通知設定を開く**
   `設定 → システム → 通知` （または検索バーで「通知」）

2. **アプリ一覧に MyTools が表示されているか確認**
   - 表示されている → 通知がオンになっているか確認
   - 表示されていない → アプリを一度起動してタイマーを動かすと登録される場合がある

3. **集中モード（フォーカスアシスト）が有効になっていないか確認**
   タスクバー右下の通知センターアイコンから確認できる。

---

## 結果の共有

上記コマンドの出力結果、または Windows 通知設定の状態を Claude に共有してください。
