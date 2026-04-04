# タイマー通知デバッグ手順（Windows アプリ）

アプリを起動し、タイマーページを開いた状態で DevTools を起動する。

**DevTools の開き方**: アプリウィンドウ上で `Ctrl+Shift+I`

DevTools が開いたら **Console タブ** を選択し、以下を順番に実行する。

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
- `false` → OS側で権限なし（Windows の通知設定でアプリがブロックされている可能性）

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

## 結果の共有

上記コマンドの出力結果を Claude に共有してください。
