// ローカルストレージのキー: URLのリスト
const STORAGE_KEY_URLS = "STORAGE_KEY_URLS";

// ページのロード時に実行される処理
window.addEventListener("load", () => {
  // URL選択ボックスの生成
  createSelectBox(STORAGE_KEY_URLS, "url-wrap", "url");
  // イベント登録
  document
    .getElementById("open-chrome")
    .addEventListener("mouseup", (event) => {
      const url = document.getElementById("url").value;

      // ボタンにパラメータを設定
      event.target.dataset.params = JSON.stringify({
        URL: url,
      });

      // URLの保存と選択ボックスの更
      saveToStorageWithLimit(STORAGE_KEY_URLS, url, 10, isValidUrl);
      createSelectBox(STORAGE_KEY_URLS, "url-wrap", "url");
    });
});

/**
 * 指定されたURLが有効なURLかどうかを検証する
 * @param {string} url - 検証するURL
 * @returns {boolean} - 有効なURLならtrue、無効ならfalse
 */
const isValidUrl = (url) => {
  try {
    new URL(url); // URLとして解析できるかチェック
    return true;
  } catch {
    return false; // 無効なURLの場合はfalseを返します
  }
};
