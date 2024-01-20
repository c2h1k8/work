const TAB_CONTENTS = [
  {
    name: "TODO",
    src: "todo.html",
    checked: true,
  },
  {
    name: "HOME",
    src: "home.html",
    checked: false,
  },
  {
    name: "SQL",
    src: "sql.html",
    checked: false,
  },
];
const STORAGE_KEY_ACTIVE_TAB_ID = "ACTIVE_TAB_ID";
document.addEventListener("DOMContentLoaded", () => {
  // タブ要素生成
  const parentContainer = document.getElementsByClassName("tab-wrap")[0];
  TAB_CONTENTS.forEach((x) => {
    createTabContent(parentContainer, x);
  });
  // 初期表示タブ設定
  const currentTab = document.getElementById(
    getStorage(STORAGE_KEY_ACTIVE_TAB_ID)
  );
  if (currentTab) {
    currentTab.checked = true;
  }
  // タブ切り替え時イベント登録
  const radioes = document.querySelectorAll("input[type='radio'][name='TAB']");
  for (const radio of radioes) {
    radio.addEventListener("change", (e) => {
      saveStorage(STORAGE_KEY_ACTIVE_TAB_ID, e.target.id);
    });
  }
});
const createTabContent = (parentContainer, tabContent) => {
  const input = document.createElement("input");
  input.id = `TAB-${tabContent.name}`;
  input.type = "radio";
  input.name = "TAB";
  input.checked = tabContent.checked;
  input.classList.add("tab-switch");
  const label = document.createElement("label");
  label.htmlFor = `TAB-${tabContent.name}`;
  label.classList.add("tab-label");
  label.textContent = tabContent.name;
  const iframe = document.createElement("iframe");
  iframe.src = tabContent.src;
  iframe.classList.add("tab-content");
  parentContainer.appendChild(input);
  parentContainer.appendChild(label);
  parentContainer.appendChild(iframe);
};
