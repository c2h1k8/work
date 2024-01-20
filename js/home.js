const STORAGE_KEY_URLS = "STORAGE_KEY_URLS";
window.addEventListener("load", () => {
  createSelect(STORAGE_KEY_URLS, "url-wrap", "url");
  // イベント登録
  document.getElementById("open-chrome").addEventListener("mouseup", (e) => {
    const url = document.getElementById("url").value;
    e.target.dataset.params = JSON.stringify({
      URL: url,
    });
    saveStorages(STORAGE_KEY_URLS, url, 2, validUrl);
    createSelect(STORAGE_KEY_URLS, "url-wrap", "url");
  });
});

const validUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};
