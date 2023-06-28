const STORAGE_KEY_ACTIVE_TAB_ID = "ACTIVE_TAB_ID";
document.addEventListener("DOMContentLoaded", () => {
  // 初期表示タブ設定
  const currentTab = document.getElementById(
    localStorage.getItem(STORAGE_KEY_ACTIVE_TAB_ID)
  );
  if (currentTab) {
    currentTab.checked = true;
  }
  // タブ切り替え時イベント登録
  const radioes = document.querySelectorAll("input[type='radio'][name='TAB']");
  for (const radio of radioes) {
    radio.addEventListener("change", (e) => {
      localStorage.setItem(STORAGE_KEY_ACTIVE_TAB_ID, e.target.id);
    });
  }
});
