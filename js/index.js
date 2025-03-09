// タブの内容設定
const TAB_ITEMS = [
  {
    label: "TODO",
    pageSrc: "todo.html",
    isSelected: true,
  },
  {
    label: "HOME",
    pageSrc: "home.html",
    isSelected: false,
  },
  {
    label: "SQL",
    pageSrc: "sql.html",
    isSelected: false,
  },
];

// ストレージキー: 現在選択されているタブのID
const STORAGE_KEY_ACTIVE_TAB_ID = "ACTIVE_TAB_ID";

// ページが読み込まれた時に実行
document.addEventListener("DOMContentLoaded", () => {
  // タブのコンテンツを生成
  const tabContainer = document.querySelector(".tab-wrap");
  TAB_ITEMS.forEach((tabItem) => {
    createTabContent(tabContainer, tabItem);
  });

  // 初期表示タブ設定
  const activeTabId = loadFromStorage(STORAGE_KEY_ACTIVE_TAB_ID);
  const activeTab = document.getElementById(activeTabId);
  if (activeTab) {
    activeTab.checked = true;
  }

  // タブ切り替えイベントの設定
  const tabRadios = document.querySelectorAll(
    "input[type='radio'][name='TAB']"
  );
  tabRadios.forEach((radio) => {
    radio.addEventListener("change", (event) => {
      saveToStorage(STORAGE_KEY_ACTIVE_TAB_ID, event.target.id);
    });
  });
});

/**
 * タブの内容を生成して指定された親コンテナに追加します。
 *
 * @param {HTMLElement} parentContainer - タブを追加する親要素
 * @param {Object} tabData - タブのデータ
 * @param {string} tabData.label - タブのラベル
 * @param {string} tabData.pageSrc - タブに対応するページのURL
 * @param {boolean} tabData.isSelected - 初期状態でタブが選択されているかどうか
 */
const createTabContent = (parentContainer, { label, pageSrc, isSelected }) => {
  // タブのラジオボタン
  const tabInput = document.createElement("input");
  tabInput.id = `TAB-${label}`;
  tabInput.type = "radio";
  tabInput.name = "TAB";
  tabInput.checked = isSelected;
  tabInput.classList.add("tab-switch");

  // タブのラベル
  const tabLabel = document.createElement("label");
  tabLabel.htmlFor = `TAB-${label}`;
  tabLabel.classList.add("tab-label");
  tabLabel.textContent = label;

  // タブのコンテンツ (iframe)
  const tabIframe = document.createElement("iframe");
  tabIframe.src = pageSrc;
  tabIframe.classList.add("tab-content");

  // タブの要素を親コンテナに追加
  parentContainer.append(tabInput, tabLabel, tabIframe);
};
