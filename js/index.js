// ==================================================
// タブの定義（ label / icon / pageSrc / isSelected ）
// ==================================================
const TAB_ITEMS = [
  {
    label: "TODO",
    icon: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.75 1h10.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 13.25 15H2.75A1.75 1.75 0 0 1 1 13.25V2.75C1 1.784 1.784 1 2.75 1Zm0 1.5a.25.25 0 0 0-.25.25v10.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25V2.75a.25.25 0 0 0-.25-.25ZM4 6.75A.75.75 0 0 1 4.75 6h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 4 6.75Zm0 3A.75.75 0 0 1 4.75 9h4.5a.75.75 0 0 1 0 1.5h-4.5A.75.75 0 0 1 4 9.75ZM4 4.25a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 4 4.25Z"/></svg>`,
    pageSrc: "todo.html",
    isSelected: true,
  },
  {
    label: "HOME",
    icon: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.906.664a1.749 1.749 0 0 1 2.187 0l5.25 4.2c.415.332.657.835.657 1.367v7.019A1.75 1.75 0 0 1 13.25 15h-3.5a.75.75 0 0 1-.75-.75V9H7v5.25a.75.75 0 0 1-.75.75h-3.5A1.75 1.75 0 0 1 1 13.25V6.23c0-.531.242-1.034.657-1.366l5.25-4.2Zm1.25 1.171a.25.25 0 0 0-.312 0l-5.25 4.2a.25.25 0 0 0-.094.196v7.019c0 .138.112.25.25.25H5.5V8.25a.75.75 0 0 1 .75-.75h3.5a.75.75 0 0 1 .75.75v5.25h2.75a.25.25 0 0 0 .25-.25V6.23a.25.25 0 0 0-.094-.195Z"/></svg>`,
    pageSrc: "home.html",
    isSelected: false,
  },
  {
    label: "SQL",
    icon: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 3.5c0-.626.292-1.165.7-1.59.406-.422.956-.767 1.579-1.041C4.525.32 6.195 0 8 0c1.805 0 3.475.32 4.722.869.622.274 1.172.62 1.578 1.04.408.426.7.965.7 1.591v9c0 .626-.292 1.165-.7 1.59-.406.422-.956.767-1.579 1.041C11.476 15.68 9.806 16 8 16c-1.805 0-3.475-.32-4.721-.869-.623-.274-1.173-.62-1.579-1.04-.408-.426-.7-.965-.7-1.591Zm1.5 0c0 .133.065.318.258.52.192.202.52.41.98.602C4.7 5.07 6.231 5.5 8 5.5c1.769 0 3.3-.43 4.26-.878.463-.192.79-.4.982-.602.193-.202.258-.387.258-.52 0-.133-.065-.318-.258-.52-.192-.202-.52-.41-.98-.602C11.3 1.93 9.769 1.5 8 1.5c-1.769 0-3.3.43-4.26.878-.463.192-.79.4-.982.602-.193.202-.258.387-.258.52Zm0 4.5c0 .133.065.318.26.52.19.202.52.41.979.602C4.7 9.57 6.231 10 8 10c1.769 0 3.3-.43 4.26-.878.463-.192.79-.4.982-.602.194-.202.258-.387.258-.52V5.724c-.17.1-.353.193-.55.28C11.475 6.68 9.805 7 8 7c-1.805 0-3.475-.32-4.721-.869a6.15 6.15 0 0 1-.55-.281Zm0 2.225V12.5c0 .133.065.318.26.52.19.202.52.41.979.602C4.7 14.07 6.231 14.5 8 14.5c1.769 0 3.3-.43 4.26-.878.463-.192.79-.4.982-.602.194-.202.258-.387.258-.52v-2.275c-.17.1-.353.193-.55.28C11.475 11.18 9.805 11.5 8 11.5c-1.805 0-3.475-.32-4.721-.869a6.15 6.15 0 0 1-.55-.281Z"/></svg>`,
    pageSrc: "sql.html",
    isSelected: false,
  },
];

// ストレージキー
const STORAGE_KEY_ACTIVE_TAB_ID = "ACTIVE_TAB_ID";

// ==================================================
// DOM 構築
// ==================================================
document.addEventListener("DOMContentLoaded", () => {
  buildShell();

  // 前回のアクティブタブを復元（なければデフォルト）
  const savedId = loadFromStorage(STORAGE_KEY_ACTIVE_TAB_ID);
  const targetId = savedId && document.getElementById(savedId)
    ? savedId
    : `TAB-${TAB_ITEMS.find(t => t.isSelected)?.label ?? TAB_ITEMS[0].label}`;
  activateTab(targetId);
});

/** アプリシェル全体を構築して #app に挿入する */
function buildShell() {
  const app = document.getElementById("app");

  // シェル本体
  const shell = document.createElement("div");
  shell.className = "app-shell";

  shell.appendChild(buildHeader());
  shell.appendChild(buildViewport());

  app.appendChild(shell);
}

/** ヘッダー（ブランド + タブナビ）を生成する */
function buildHeader() {
  const header = document.createElement("header");
  header.className = "top-nav";
  header.setAttribute("role", "banner");

  const inner = document.createElement("div");
  inner.className = "top-nav__inner";

  // ブランドロゴ
  const brand = document.createElement("div");
  brand.className = "top-nav__brand";
  brand.innerHTML = `
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 13.25 15H2.75A1.75 1.75 0 0 1 1 13.25Zm1.5.25v4.5h4.5V3Zm6 0v4.5h4.5V3Zm4.5 6h-4.5v4.5h4.5Zm-6 4.5V9H3v4.5Z"/>
    </svg>
    MyTools
  `;

  // タブナビ
  const tabsNav = document.createElement("nav");
  tabsNav.className = "top-nav__tabs";
  tabsNav.setAttribute("role", "tablist");
  tabsNav.setAttribute("aria-label", "メインナビゲーション");

  TAB_ITEMS.forEach(({ label, icon, pageSrc }) => {
    // 非表示ラジオボタン（状態管理用）
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "TAB";
    radio.id = `TAB-${label}`;
    radio.className = "tab-switch";
    radio.addEventListener("change", () => {
      activateTab(radio.id);
      saveToStorage(STORAGE_KEY_ACTIVE_TAB_ID, radio.id);
    });

    // タブボタン
    const btn = document.createElement("label");
    btn.htmlFor = radio.id;
    btn.className = "tab-btn";
    btn.setAttribute("role", "tab");
    btn.innerHTML = `${icon}<span>${label}</span>`;

    tabsNav.appendChild(radio);
    tabsNav.appendChild(btn);
  });

  inner.appendChild(brand);
  inner.appendChild(tabsNav);
  header.appendChild(inner);
  return header;
}

/** コンテンツエリア（iframe 群）を生成する */
function buildViewport() {
  const viewport = document.createElement("main");
  viewport.className = "tab-viewport";
  viewport.setAttribute("role", "main");

  TAB_ITEMS.forEach(({ label, pageSrc }) => {
    const frame = document.createElement("iframe");
    frame.src = pageSrc;
    frame.id = `frame-${label}`;
    frame.className = "tab-frame";
    frame.title = label;
    frame.setAttribute("role", "tabpanel");
    viewport.appendChild(frame);
  });

  return viewport;
}

// ==================================================
// タブ切り替え
// ==================================================
function activateTab(tabId) {
  // ラジオを更新
  const radio = document.getElementById(tabId);
  if (radio) radio.checked = true;

  // タブボタンのアクティブ状態を更新
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.classList.toggle("tab-btn--active", btn.htmlFor === tabId);
    btn.setAttribute("aria-selected", btn.htmlFor === tabId ? "true" : "false");
  });

  // iframe の表示を切り替え
  const frameName = tabId.replace("TAB-", "");
  document.querySelectorAll(".tab-frame").forEach(frame => {
    frame.classList.toggle("tab-frame--active", frame.id === `frame-${frameName}`);
  });
}
