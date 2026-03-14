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
    label: "SQL",
    icon: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 3.5c0-.626.292-1.165.7-1.59.406-.422.956-.767 1.579-1.041C4.525.32 6.195 0 8 0c1.805 0 3.475.32 4.722.869.622.274 1.172.62 1.578 1.04.408.426.7.965.7 1.591v9c0 .626-.292 1.165-.7 1.59-.406.422-.956.767-1.579 1.041C11.476 15.68 9.806 16 8 16c-1.805 0-3.475-.32-4.721-.869-.623-.274-1.173-.62-1.579-1.04-.408-.426-.7-.965-.7-1.591Zm1.5 0c0 .133.065.318.258.52.192.202.52.41.98.602C4.7 5.07 6.231 5.5 8 5.5c1.769 0 3.3-.43 4.26-.878.463-.192.79-.4.982-.602.193-.202.258-.387.258-.52 0-.133-.065-.318-.258-.52-.192-.202-.52-.41-.98-.602C11.3 1.93 9.769 1.5 8 1.5c-1.769 0-3.3.43-4.26.878-.463.192-.79.4-.982.602-.193.202-.258.387-.258.52Zm0 4.5c0 .133.065.318.26.52.19.202.52.41.979.602C4.7 9.57 6.231 10 8 10c1.769 0 3.3-.43 4.26-.878.463-.192.79-.4.982-.602.194-.202.258-.387.258-.52V5.724c-.17.1-.353.193-.55.28C11.475 6.68 9.805 7 8 7c-1.805 0-3.475-.32-4.721-.869a6.15 6.15 0 0 1-.55-.281Zm0 2.225V12.5c0 .133.065.318.26.52.19.202.52.41.979.602C4.7 14.07 6.231 14.5 8 14.5c1.769 0 3.3-.43 4.26-.878.463-.192.79-.4.982-.602.194-.202.258-.387.258-.52v-2.275c-.17.1-.353.193-.55.28C11.475 11.18 9.805 11.5 8 11.5c-1.805 0-3.475-.32-4.721-.869a6.15 6.15 0 0 1-.55-.281Z"/></svg>`,
    pageSrc: "sql.html",
    isSelected: false,
  },
  {
    label: "ノート",
    icon: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z"/></svg>`,
    pageSrc: "note.html",
    isSelected: false,
  },
];

// ストレージキー
const STORAGE_KEY_ACTIVE_TAB_ID = "ACTIVE_TAB_ID";

// ==================================================
// ダークモード
// ==================================================
const THEME_KEY = 'mytools_theme';

/** テーマを適用して全 iframe に伝播する */
function _applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  // 全 iframe にテーマを伝播
  document.querySelectorAll('.tab-frame').forEach(iframe => {
    try {
      iframe.contentWindow.postMessage({ type: 'theme-change', theme }, '*');
    } catch(e) {}
  });
}

/** テーマトグルボタンのクリックイベントを初期化する */
function _initThemeToggle() {
  const btn = document.getElementById('theme-toggle-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    _applyTheme(current === 'dark' ? 'light' : 'dark');
  });
}

// ==================================================
// IndexedDB（app_db）: タブ設定の永続化
// ==================================================
const AppDB = {
  DB_NAME: "app_db",
  VERSION: 1,

  _open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(AppDB.DB_NAME, AppDB.VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "name" });
        }
      };
      req.onsuccess = e => resolve(e.target.result);
      req.onerror = e => reject(e.target.error);
    });
  },

  async get(name) {
    const db = await AppDB._open();
    return new Promise((resolve, reject) => {
      const req = db.transaction("settings", "readonly")
        .objectStore("settings").get(name);
      req.onsuccess = () => resolve(req.result?.value ?? null);
      req.onerror = () => reject(req.error);
    });
  },

  async set(name, value) {
    const db = await AppDB._open();
    return new Promise((resolve, reject) => {
      const req = db.transaction("settings", "readwrite")
        .objectStore("settings").put({ name, value });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },
};

// カスタムタブ用ジェネリックアイコン
const GENERIC_ICON = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8Z"/></svg>`;

// ギアアイコンは js/base/icons.js の Icons.gear を使用

// アイコンパレット（設定画面で選択可能な SVG アイコン）
const ICON_PALETTE = [
  { id: "list",          label: "リスト",         svg: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm3.75-1.5a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5h-8.5Zm0 5a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5h-8.5Zm0 5a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5h-8.5ZM3 8a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm-1 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/></svg>` },
  { id: "check-circle",  label: "チェック",       svg: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 16A8 8 0 1 1 8 0a8 8 0 0 1 0 16Zm3.78-9.72a.751.751 0 0 0-.018-1.042.751.751 0 0 0-1.042-.018L6.75 9.19 5.28 7.72a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0l4.5-4.5Z"/></svg>` },
  { id: "pencil",        label: "メモ",           svg: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.25.25 0 0 0-.064.108l-.558 1.953 1.953-.558a.249.249 0 0 0 .108-.064Zm1.238-3.763a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354Z"/></svg>` },
  { id: "pin",           label: "ピン",           svg: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M7.443.905a1.75 1.75 0 0 1 2.217-.152l4.214 3.07a1.75 1.75 0 0 1 .298 2.542l-2.234 2.532a.25.25 0 0 0-.051.247l1.075 3.22a.75.75 0 0 1-.177.773l-.707.707a.75.75 0 0 1-1.06 0l-2.322-2.322a.25.25 0 0 0-.354 0l-3.182 3.182a.75.75 0 1 1-1.06-1.06l3.182-3.183a.25.25 0 0 0 0-.353L4.96 9.59a.75.75 0 0 1 0-1.06l.707-.707a.75.75 0 0 1 .773-.177l3.22 1.075a.25.25 0 0 0 .247-.051l2.532-2.234a.25.25 0 0 0 .015-.364L8.384 2.437a.25.25 0 0 0-.308-.022L6.35 3.605a.75.75 0 0 1-.834-1.247Z"/></svg>` },
  { id: "home",          label: "ホーム",         svg: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.906.664a1.749 1.749 0 0 1 2.187 0l5.25 4.2c.415.332.657.835.657 1.367v7.019A1.75 1.75 0 0 1 13.25 15h-3.5a.75.75 0 0 1-.75-.75V9H7v5.25a.75.75 0 0 1-.75.75h-3.5A1.75 1.75 0 0 1 1 13.25V6.23c0-.531.242-1.034.657-1.366l5.25-4.2Zm1.25 1.171a.25.25 0 0 0-.312 0l-5.25 4.2a.25.25 0 0 0-.094.196v7.019c0 .138.112.25.25.25H5.5V8.25a.75.75 0 0 1 .75-.75h3.5a.75.75 0 0 1 .75.75v5.25h2.75a.25.25 0 0 0 .25-.25V6.23a.25.25 0 0 0-.094-.195Z"/></svg>` },
  { id: "search",        label: "検索",           svg: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z"/></svg>` },
  { id: "database",      label: "データベース",   svg: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 3.5c0-.626.292-1.165.7-1.59.406-.422.956-.767 1.579-1.041C4.525.32 6.195 0 8 0c1.805 0 3.475.32 4.722.869.622.274 1.172.62 1.578 1.04.408.426.7.965.7 1.591v9c0 .626-.292 1.165-.7 1.59-.406.422-.956.767-1.579 1.041C11.476 15.68 9.806 16 8 16c-1.805 0-3.475-.32-4.721-.869-.623-.274-1.173-.62-1.579-1.04-.408-.426-.7-.965-.7-1.591Zm1.5 0c0 .133.065.318.258.52.192.202.52.41.98.602C4.7 5.07 6.231 5.5 8 5.5c1.769 0 3.3-.43 4.26-.878.463-.192.79-.4.982-.602.193-.202.258-.387.258-.52 0-.133-.065-.318-.258-.52-.192-.202-.52-.41-.98-.602C11.3 1.93 9.769 1.5 8 1.5c-1.769 0-3.3.43-4.26.878-.463.192-.79.4-.982.602-.193.202-.258.387-.258.52Zm0 4.5c0 .133.065.318.26.52.19.202.52.41.979.602C4.7 9.57 6.231 10 8 10c1.769 0 3.3-.43 4.26-.878.463-.192.79-.4.982-.602.194-.202.258-.387.258-.52V5.724c-.17.1-.353.193-.55.28C11.475 6.68 9.805 7 8 7c-1.805 0-3.475-.32-4.721-.869a6.15 6.15 0 0 1-.55-.281Zm0 2.225V12.5c0 .133.065.318.26.52.19.202.52.41.979.602C4.7 14.07 6.231 14.5 8 14.5c1.769 0 3.3-.43 4.26-.878.463-.192.79-.4.982-.602.194-.202.258-.387.258-.52v-2.275c-.17.1-.353.193-.55.28C11.475 11.18 9.805 11.5 8 11.5c-1.805 0-3.475-.32-4.721-.869a6.15 6.15 0 0 1-.55-.281Z"/></svg>` },
  { id: "graph",         label: "グラフ",         svg: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 1.75V13.5h13.75a.75.75 0 0 1 0 1.5H.75a.75.75 0 0 1-.75-.75V1.75a.75.75 0 0 1 1.5 0Zm14.28 2.53-5.25 5.25a.75.75 0 0 1-1.06 0L7 7.06 4.28 9.78a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042l3.25-3.25a.75.75 0 0 1 1.06 0L9 7.94l4.72-4.72a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042Z"/></svg>` },
  { id: "star",          label: "スター",         svg: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"/></svg>` },
  { id: "bookmark",      label: "ブックマーク",   svg: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2.75C3 1.784 3.784 1 4.75 1h6.5c.966 0 1.75.784 1.75 1.75v11.5a.75.75 0 0 1-1.227.579L8 11.722l-3.773 3.107A.75.75 0 0 1 3 14.25Zm1.75-1.25a.25.25 0 0 0-.25.25v8.91l3.023-2.489a.75.75 0 0 1 .954 0l3.023 2.49V2.75a.25.25 0 0 0-.25-.25Z"/></svg>` },
  { id: "calendar",      label: "カレンダー",     svg: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.75 0a.75.75 0 0 1 .75.75V2h5V.75a.75.75 0 0 1 1.5 0V2h1.25c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 13.25 16H2.75A1.75 1.75 0 0 1 1 14.25V3.75C1 2.784 1.784 2 2.75 2H4V.75A.75.75 0 0 1 4.75 0ZM2.5 7.5v6.75c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25V7.5Zm10.75-4H2.75a.25.25 0 0 0-.25.25V6h11V3.75a.25.25 0 0 0-.25-.25Z"/></svg>` },
  { id: "light-bulb",    label: "アイデア",       svg: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5c-2.363 0-4 1.69-4 3.75 0 .984.424 1.625.984 2.304l.214.253c.223.264.47.556.673.848.284.411.537.896.621 1.49a.75.75 0 0 1-1.484.211c-.04-.282-.163-.547-.37-.847a8.456 8.456 0 0 0-.542-.68c-.084-.1-.173-.205-.268-.32C3.201 7.75 2.5 6.766 2.5 5.25 2.5 2.31 4.863 0 8 0s5.5 2.31 5.5 5.25c0 1.516-.701 2.5-1.328 3.259-.095.115-.184.22-.268.319-.207.245-.383.453-.541.681-.208.3-.33.565-.37.847a.751.751 0 0 1-1.485-.212c.084-.593.337-1.078.621-1.489.203-.292.45-.584.673-.848.075-.088.147-.173.213-.253.561-.679.985-1.32.985-2.304 0-2.06-1.637-3.75-4-3.75ZM5.75 12h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5ZM6 15.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-3.5a.25.25 0 0 1-.25-.25Z"/></svg>` },
  { id: "globe",         label: "地球",           svg: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM5.78 8.75a9.64 9.64 0 0 0 1.363 4.177c.255.426.542.832.857 1.215.245-.296.551-.705.857-1.215A9.64 9.64 0 0 0 10.22 8.75Zm4.44-1.5a9.64 9.64 0 0 0-1.363-4.177c-.307-.51-.612-.919-.857-1.215a9.927 9.927 0 0 0-.857 1.215A9.64 9.64 0 0 0 5.78 7.25Zm-5.944 1.5H1.543a6.507 6.507 0 0 0 4.666 5.5c-.361-.84-.617-1.724-.785-2.65a10.998 10.998 0 0 1-.128-2.85Zm-2.733-1.5h2.76c.09-1.013.284-1.972.568-2.869A10.48 10.48 0 0 1 5.774 2.5a6.507 6.507 0 0 0-4.231 4.25Zm9.39 1.5a10.998 10.998 0 0 1-.128 2.85c-.168.926-.424 1.81-.785 2.65a6.507 6.507 0 0 0 4.666-5.5Zm2.76-1.5A6.507 6.507 0 0 0 10.226 2.5a10.48 10.48 0 0 1 .913 1.881c.284.897.478 1.856.568 2.869Z"/></svg>` },
  { id: "link",          label: "リンク",         svg: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m7.775 3.275 1.25-1.25a3.5 3.5 0 1 1 4.95 4.95l-2.5 2.5a3.5 3.5 0 0 1-4.95 0 .751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018 2 2 0 0 0 2.83 0l2.5-2.5a2.002 2.002 0 0 0-2.83-2.83l-1.25 1.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042Zm-4.69 9.64a2 2 0 0 0 2.83 0l1.25-1.25a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042l-1.25 1.25a3.5 3.5 0 1 1-4.95-4.95l2.5-2.5a3.5 3.5 0 0 1 4.95 0 .751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018 2 2 0 0 0-2.83 0l-2.5 2.5a2.002 2.002 0 0 0 0 2.83Z"/></svg>` },
  { id: "mail",          label: "メール",         svg: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.75 2h12.5c.966 0 1.75.784 1.75 1.75v8.5A1.75 1.75 0 0 1 14.25 14H1.75A1.75 1.75 0 0 1 0 12.25v-8.5C0 2.784.784 2 1.75 2ZM1.5 12.251c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25V5.809L8.38 9.397a.75.75 0 0 1-.76 0L1.5 5.809v6.442Zm13-8.181v-.32a.25.25 0 0 0-.25-.25H1.75a.25.25 0 0 0-.25.25v.32L8 7.88Z"/></svg>` },
  { id: "target",        label: "ターゲット",     svg: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 8a7 7 0 1 1 14 0A7 7 0 0 1 1 8Zm7-8a8 8 0 1 0 0 16A8 8 0 0 0 8 0ZM8 5a3 3 0 1 0 0 6A3 3 0 0 0 8 5Zm-4 3a4 4 0 1 1 8 0 4 4 0 0 1-8 0Z"/></svg>` },
  { id: "comment",       label: "コメント",       svg: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 13.25 12H9.06l-2.573 2.573A1.458 1.458 0 0 1 4 13.543V12H2.75A1.75 1.75 0 0 1 1 10.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h4.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/></svg>` },
  { id: "code",          label: "コード",         svg: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m11.28 3.22 4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734L13.94 8l-3.72-3.72a.749.749 0 0 1 .326-1.275.749.749 0 0 1 .734.215Zm-6.56 0a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042L2.06 8l3.72 3.72a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L.47 8.53a.75.75 0 0 1 0-1.06Z"/></svg>` },
  { id: "file-directory", label: "フォルダ",      svg: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z"/></svg>` },
  { id: "key",           label: "キー",           svg: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.5 0a5.499 5.499 0 1 1-1.288 10.848l-.932.932a.749.749 0 0 1-.53.22H7v.75a.749.749 0 0 1-.22.53l-.5.5a.749.749 0 0 1-.53.22H5v.75a.749.749 0 0 1-.22.53l-.5.5a.749.749 0 0 1-.53.22h-2A1.75 1.75 0 0 1 0 14.25v-2c0-.199.079-.389.22-.53l4.932-4.932A5.5 5.5 0 0 1 10.5 0Zm-4 5.5c-.001.431.069.86.205 1.274a.75.75 0 0 1-.181.768l-5.024 5.024v1.684c0 .138.112.25.25.25h1.68l.5-.5V13a.75.75 0 0 1 .75-.75h.75v-.75a.75.75 0 0 1 .75-.75h.75v-.75a.75.75 0 0 1 .22-.53l1.102-1.102a.75.75 0 0 1 .768-.18A4 4 0 1 0 6.5 5.5Z"/></svg>` },
  { id: "bell",          label: "ベル",           svg: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 16a2 2 0 0 0 1.985-1.75c.017-.137-.097-.25-.235-.25h-3.5c-.138 0-.252.113-.235.25A2 2 0 0 0 8 16ZM3 5a5 5 0 0 1 10 0v2.947c0 .05.015.098.042.139l1.703 2.555A1.519 1.519 0 0 1 13.482 13H2.518a1.516 1.516 0 0 1-1.263-2.36l1.703-2.554A.255.255 0 0 0 3 7.947Zm5-3.5A3.5 3.5 0 0 0 4.5 5v2.947c0 .346-.102.683-.294.97l-1.703 2.556a.017.017 0 0 0-.003.01l.001.006c0 .002.002.004.004.006l.006.004.007.001h10.964l.007-.001.006-.004.004-.006.001-.007a.017.017 0 0 0-.003-.01l-1.703-2.554a1.745 1.745 0 0 1-.294-.97V5A3.5 3.5 0 0 0 8 1.5Z"/></svg>` },
  { id: "gear",          label: "設定",           svg: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0a8.2 8.2 0 0 1 .701.031C9.444.095 9.99.645 10.16 1.29l.288 1.107c.018.066.079.158.212.224.231.114.454.243.668.386.123.082.233.09.299.071l1.103-.303c.644-.176 1.392.021 1.82.63.27.385.506.792.704 1.218.315.675.111 1.422-.364 1.891l-.814.806c-.049.048-.098.147-.088.294.016.257.016.515 0 .772-.01.147.038.246.088.294l.814.806c.475.469.679 1.216.364 1.891a7.977 7.977 0 0 1-.704 1.217c-.428.61-1.176.807-1.82.63l-1.102-.302c-.067-.019-.177-.011-.3.071a5.909 5.909 0 0 1-.668.386c-.133.066-.194.158-.211.224l-.29 1.106c-.168.646-.715 1.196-1.458 1.26a8.006 8.006 0 0 1-1.402 0c-.743-.064-1.289-.614-1.458-1.26l-.289-1.106c-.018-.066-.079-.158-.212-.224a5.738 5.738 0 0 1-.668-.386c-.123-.082-.233-.09-.299-.071l-1.103.303c-.644.176-1.392-.021-1.82-.63a8.12 8.12 0 0 1-.704-1.218c-.315-.675-.111-1.422.363-1.891l.815-.806c.05-.048.098-.147.088-.294a6.214 6.214 0 0 1 0-.772c.01-.147-.038-.246-.088-.294l-.815-.806C.635 6.045.431 5.298.746 4.623a7.92 7.92 0 0 1 .704-1.217c.428-.61 1.176-.807 1.82-.63l1.102.302c.067.019.177.011.3-.071.214-.143.437-.272.668-.386.133-.066.194-.158.211-.224l.29-1.106C6.009.645 6.556.095 7.299.03 7.53.01 7.764 0 8 0Zm-.571 1.525c-.036.003-.108.036-.137.146l-.289 1.105c-.147.561-.549.967-.998 1.189-.173.086-.34.183-.5.29-.417.278-.97.423-1.529.27l-1.103-.303c-.109-.03-.175.016-.195.045-.22.312-.412.644-.573.99-.014.031-.021.11.059.19l.815.806c.411.406.562.957.53 1.456a4.709 4.709 0 0 0 0 .582c.032.499-.119 1.05-.53 1.456l-.815.806c-.081.08-.073.159-.059.19.162.346.353.677.573.989.02.03.085.076.195.046l1.102-.303c.56-.153 1.113-.008 1.53.27.161.107.328.204.501.29.447.222.85.629.997 1.189l.289 1.105c.029.109.101.143.137.146a6.6 6.6 0 0 0 1.142 0c.036-.003.108-.036.137-.146l.289-1.105c.147-.561.549-.967.998-1.189.173-.086.34-.183.5-.29.417-.278.97-.423 1.529-.27l1.103.303c.109.029.175-.016.195-.045.22-.313.411-.644.573-.99.014-.031.021-.11-.059-.19l-.815-.806c-.411-.406-.562-.957-.53-1.456a4.709 4.709 0 0 0 0-.582c-.032-.499.119-1.05.53-1.456l.815-.806c.081-.08.073-.159.059-.19a6.464 6.464 0 0 0-.573-.989c-.02-.03-.085-.076-.195-.046l-1.102.303c-.56.153-1.113.008-1.53-.27a4.44 4.44 0 0 0-.501-.29c-.447-.222-.85-.629-.997-1.189l-.289-1.105c-.029-.11-.101-.143-.137-.146a6.6 6.6 0 0 0-1.142 0ZM11 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM9.5 8a1.5 1.5 0 1 0-3.001.001A1.5 1.5 0 0 0 9.5 8Z"/></svg>` },
  { id: "rocket",        label: "ロケット",       svg: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M14.064 0h.186C15.216 0 16 .784 16 1.75v.186a8.752 8.752 0 0 1-2.564 6.186l-.458.459c-.314.314-.641.616-.979.904v3.207c0 .608-.315 1.172-.833 1.49l-2.774 1.707a.75.75 0 0 1-1.11-.418l-.954-3.102a1.214 1.214 0 0 1-.145-.125L3.754 9.816a1.218 1.218 0 0 1-.124-.145L.528 8.717a.75.75 0 0 1-.418-1.11l1.71-2.774A1.748 1.748 0 0 1 3.31 4h3.204c.288-.338.59-.665.904-.979l.459-.458A8.749 8.749 0 0 1 14.064 0ZM8.938 3.623h-.002l-.458.458c-.76.76-1.437 1.598-2.02 2.5l-1.5 2.317 2.143 2.143 2.317-1.5c.902-.583 1.74-1.26 2.499-2.02l.459-.458a7.25 7.25 0 0 0 2.123-5.127V1.75a.25.25 0 0 0-.25-.25h-.186a7.249 7.249 0 0 0-5.125 2.123ZM3.56 14.56c-.732.732-2.334 1.045-3.005 1.148a.234.234 0 0 1-.201-.064.234.234 0 0 1-.064-.201c.103-.671.416-2.273 1.15-3.003a1.502 1.502 0 0 1 2.12 2.12Z"/></svg>` },
  { id: "heart",         label: "ハート",         svg: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m8 14.25.345.666a.75.75 0 0 1-.69 0l-.008-.004-.018-.01a7.152 7.152 0 0 1-.31-.17 22.055 22.055 0 0 1-3.434-2.414C2.045 10.731 0 8.35 0 5.5 0 2.836 2.086 1 4.25 1 5.797 1 7.153 1.802 8 3.02 8.847 1.802 10.203 1 11.75 1 13.914 1 16 2.836 16 5.5c0 2.85-2.045 5.231-3.885 6.818a22.066 22.066 0 0 1-3.744 2.584l-.018.01-.006.003ZM4.25 2.5c-1.336 0-2.75 1.164-2.75 3 0 2.15 1.58 4.144 3.365 5.682A20.58 20.58 0 0 0 8 13.393a20.58 20.58 0 0 0 3.135-2.211C12.92 9.644 14.5 7.65 14.5 5.5c0-1.836-1.414-3-2.75-3-1.373 0-2.609.986-3.029 2.456a.749.749 0 0 1-1.442 0C6.859 3.486 5.623 2.5 4.25 2.5Z"/></svg>` },
  { id: "clock",         label: "クロック",       svg: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm7-3.25v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.751.751 0 0 1 7 8.25v-3.5a.75.75 0 0 1 1.5 0Z"/></svg>` },
  { id: "person",        label: "人物",           svg: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.561 8.073a6.005 6.005 0 0 1 3.432 5.142.75.75 0 1 1-1.498.07 4.5 4.5 0 0 0-8.99 0 .75.75 0 0 1-1.498-.07 6.004 6.004 0 0 1 3.431-5.142 3.999 3.999 0 1 1 5.123 0ZM10.5 5a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z"/></svg>` },
  { id: "tag",           label: "タグ",           svg: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 2.75C1 1.784 1.784 1 2.75 1h4.586c.464 0 .909.184 1.237.513l6.5 6.5a1.75 1.75 0 0 1 0 2.474l-4.586 4.586a1.75 1.75 0 0 1-2.474 0l-6.5-6.5A1.752 1.752 0 0 1 1 7.336Zm1.5.25v4.586c0 .1.04.196.11.266l6.5 6.5a.25.25 0 0 0 .354 0l4.586-4.586a.25.25 0 0 0 0-.354l-6.5-6.5a.25.25 0 0 0-.177-.073ZM6 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"/></svg>` },
  { id: "file",          label: "ファイル",       svg: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Zm6.75.062V4.25c0 .138.112.25.25.25h2.688Z"/></svg>` },
  { id: "filter",        label: "フィルター",     svg: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M.75 3h14.5a.75.75 0 0 1 0 1.5H.75a.75.75 0 0 1 0-1.5ZM3 7.75A.75.75 0 0 1 3.75 7h8.5a.75.75 0 0 1 0 1.5h-8.5A.75.75 0 0 1 3 7.75Zm3 4a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z"/></svg>` },
  { id: "lock",          label: "ロック",         svg: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4a4 4 0 0 1 8 0v2h.25c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 12.25 15h-8.5A1.75 1.75 0 0 1 2 13.25v-5.5C2 6.784 2.784 6 3.75 6H4Zm8.25 3.5h-8.5a.25.25 0 0 0-.25.25v5.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-5.5a.25.25 0 0 0-.25-.25ZM10.45 4a2.5 2.5 0 0 0-4.9 0v2h4.9Z"/></svg>` },
  { id: "dashboard",     label: "ダッシュボード", svg: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 13.25 15H2.75A1.75 1.75 0 0 1 1 13.25Zm1.5.25v4.5h4.5V3Zm6 0v4.5h4.5V3Zm4.5 6h-4.5v4.5h4.5Zm-6 4.5V9H3v4.5Z"/></svg>` },
  { id: "note",          label: "ノート",         svg: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M0 3.75C0 2.784.784 2 1.75 2h12.5c.966 0 1.75.784 1.75 1.75v9.5A1.75 1.75 0 0 1 14.25 15h-2.5a.75.75 0 0 1 0-1.5h2.5a.25.25 0 0 0 .25-.25v-9.5a.25.25 0 0 0-.25-.25H1.75a.25.25 0 0 0-.25.25v9.5c0 .138.112.25.25.25h2.5a.75.75 0 0 1 0 1.5h-2.5A1.75 1.75 0 0 1 0 13.25ZM4 5.75A.75.75 0 0 1 4.75 5h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 4 5.75Zm0 3A.75.75 0 0 1 4.75 8h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 4 8.75Z"/></svg>` },
];

// ==================================================
// 設定管理
// ==================================================

/** TAB_ITEMS からデフォルト設定を生成する */
function getDefaultConfig() {
  return TAB_ITEMS.map((item, i) => ({
    label: item.label,
    pageSrc: item.pageSrc,
    icon: item.icon,
    visible: true,
    position: i,
    isBuiltIn: true,
  }));
}

/** IndexedDB から設定を読み込む（なければデフォルト）。TAB_ITEMS に追加された組み込みタブを自動追加する */
async function loadTabConfig() {
  let saved = await AppDB.get("tab_config");

  if (!saved || !Array.isArray(saved) || saved.length === 0) {
    return getDefaultConfig();
  }

  // TAB_ITEMS に存在するが保存済み config にない組み込みタブを末尾に追加
  const maxPosition = saved.reduce((m, t) => Math.max(m, t.position ?? 0), 0);
  let offset = 1;
  let added = false;
  for (const item of TAB_ITEMS) {
    if (!saved.some(t => t.pageSrc === item.pageSrc && t.isBuiltIn)) {
      saved.push({
        label: item.label,
        pageSrc: item.pageSrc,
        icon: item.icon,
        visible: true,
        position: maxPosition + offset++,
        isBuiltIn: true,
      });
      added = true;
    }
  }
  if (added) await AppDB.set("tab_config", saved);

  return sortByPosition(saved);
}

/** 設定を IndexedDB に保存する */
async function saveTabConfig(config) {
  await AppDB.set("tab_config", config);
}

// ==================================================
// DOM 構築
// ==================================================
document.addEventListener("DOMContentLoaded", async () => {
  const config = await loadTabConfig();
  buildShell(config);
  buildSettingsPanel();
  _initThemeToggle();

  // 前回のアクティブタブを復元（なければデフォルト）
  const savedId = loadFromStorage(STORAGE_KEY_ACTIVE_TAB_ID);
  const visibleConfig = config.filter(t => t.visible);
  const defaultTab = visibleConfig.find(t => TAB_ITEMS.some(ti => ti.label === t.label && ti.isSelected))
    ?? visibleConfig[0];
  const targetId = (savedId && document.getElementById(savedId))
    ? savedId
    : `TAB-${defaultTab?.label}`;
  activateTab(targetId);
});

/** アプリシェル全体を構築して #app に挿入する */
function buildShell(config) {
  const app = document.getElementById("app");

  const shell = document.createElement("div");
  shell.className = "app-shell";

  shell.appendChild(buildHeader(config));
  shell.appendChild(buildViewport(config));

  app.appendChild(shell);
}

/** ヘッダー（ブランド + タブナビ + 設定ボタン）を生成する */
function buildHeader(config) {
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

  // タブナビ（visible=true のタブのみ）
  const tabsNav = document.createElement("nav");
  tabsNav.className = "top-nav__tabs";
  tabsNav.setAttribute("role", "tablist");
  tabsNav.setAttribute("aria-label", "メインナビゲーション");

  config.filter(t => t.visible).forEach(({ label, icon }) => {
    _createTabElements(label, icon).forEach(el => tabsNav.appendChild(el));
  });

  // アクションボタン群（右端）
  const actions = document.createElement("div");
  actions.className = "top-nav__actions";

  // ダークモードトグルボタン
  const themeBtn = document.createElement("button");
  themeBtn.className = "nav-icon-btn";
  themeBtn.id = "theme-toggle-btn";
  themeBtn.title = "ダークモード切替";
  themeBtn.setAttribute("aria-label", "テーマ切替");
  themeBtn.innerHTML = `
    <svg class="icon-moon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
    <svg class="icon-sun" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42M12 5a7 7 0 1 0 0 14A7 7 0 0 0 12 5z"/></svg>
  `;

  // ギアアイコンボタン
  const settingsBtn = document.createElement("button");
  settingsBtn.className = "nav-icon-btn";
  settingsBtn.setAttribute("aria-label", "タブ設定");
  settingsBtn.innerHTML = Icons.gear;
  settingsBtn.addEventListener("click", openSettings);

  actions.appendChild(themeBtn);
  actions.appendChild(settingsBtn);

  inner.appendChild(brand);
  inner.appendChild(tabsNav);
  inner.appendChild(actions);
  header.appendChild(inner);
  return header;
}

/** ラジオ入力 + ラベル（タブボタン）要素を生成して返す */
function _createTabElements(label, icon) {
  const radio = document.createElement("input");
  radio.type = "radio";
  radio.name = "TAB";
  radio.id = `TAB-${label}`;
  radio.className = "tab-switch";
  radio.addEventListener("change", () => {
    activateTab(radio.id);
    saveToStorage(STORAGE_KEY_ACTIVE_TAB_ID, radio.id);
  });

  const btn = document.createElement("label");
  btn.htmlFor = radio.id;
  btn.className = "tab-btn";
  btn.setAttribute("role", "tab");
  btn.innerHTML = `${icon}<span>${label}</span>`;

  return [radio, btn];
}

/** コンテンツエリア（全 iframe）を生成する */
function buildViewport(config) {
  const viewport = document.createElement("main");
  viewport.className = "tab-viewport";
  viewport.setAttribute("role", "main");

  config.forEach(({ label, pageSrc }) => {
    viewport.appendChild(_createIframe(label, pageSrc));
  });

  return viewport;
}

/** iframe 要素を生成して返す */
function _createIframe(label, pageSrc) {
  const frame = document.createElement("iframe");
  frame.src = pageSrc;
  frame.id = `frame-${label}`;
  frame.className = "tab-frame";
  frame.title = label;
  frame.setAttribute("role", "tabpanel");
  return frame;
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

// ==================================================
// ナビ再構築（設定変更後に呼ぶ）
// ==================================================

/** visible=true のタブのみ .top-nav__tabs を再構築する */
function rebuildNav(config) {
  const tabsNav = document.querySelector(".top-nav__tabs");
  if (!tabsNav) return;

  tabsNav.innerHTML = "";

  // position 順でソートしてから反映（これがないと順序変更が即時反映されない）
  sortByPosition(config.filter(t => t.visible))
    .forEach(({ label, icon }) => {
      _createTabElements(label, icon).forEach(el => tabsNav.appendChild(el));
    });

  // 現在アクティブなタブが非表示になった場合は先頭の visible タブに切り替え
  const savedId = loadFromStorage(STORAGE_KEY_ACTIVE_TAB_ID);
  const visibleIds = sortByPosition(config.filter(t => t.visible))
    .map(t => `TAB-${t.label}`);
  const activeId = (savedId && visibleIds.includes(savedId)) ? savedId : visibleIds[0];
  if (activeId) {
    activateTab(activeId);
    saveToStorage(STORAGE_KEY_ACTIVE_TAB_ID, activeId);
  }
}

/** 新規タブの iframe を viewport に追加する（既存 iframe は変えない） */
function syncViewport(config) {
  const viewport = document.querySelector(".tab-viewport");
  if (!viewport) return;

  config.forEach(({ label, pageSrc }) => {
    if (!document.getElementById(`frame-${label}`)) {
      viewport.appendChild(_createIframe(label, pageSrc));
    }
  });
}

// ==================================================
// データ管理（エクスポート/インポート）
// ==================================================

/** dashboard_db（共有DB）から指定インスタンスのデータを全削除 */
async function _deleteDashboardInstance(instanceId) {
  const db = await new Promise((resolve) => {
    const req = indexedDB.open('dashboard_db');
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = () => resolve(null);
    // DBが存在しない場合（oldVersion===0）は作成しない
    req.onupgradeneeded = (e) => { if (e.oldVersion === 0) e.target.transaction.abort(); };
  });
  if (!db || !db.objectStoreNames.contains('sections')) {
    if (db) db.close();
    return;
  }
  try {
    const os = db.transaction('sections').objectStore('sections');
    const sections = await new Promise((res) => {
      if (os.indexNames.contains('instance_id')) {
        const req = os.index('instance_id').getAll(IDBKeyRange.only(instanceId));
        req.onsuccess = () => res(req.result);
        req.onerror = () => res([]);
      } else {
        const req = os.getAll();
        req.onsuccess = () => res(req.result.filter(s => s.instance_id === instanceId));
        req.onerror = () => res([]);
      }
    });
    for (const section of sections) {
      const items = await new Promise((res) => {
        const req = db.transaction('items').objectStore('items')
          .index('section_id').getAll(IDBKeyRange.only(section.id));
        req.onsuccess = () => res(req.result);
        req.onerror = () => res([]);
      });
      await new Promise((res, rej) => {
        const tx = db.transaction(['sections', 'items'], 'readwrite');
        tx.objectStore('sections').delete(section.id);
        items.forEach(item => tx.objectStore('items').delete(item.id));
        tx.oncomplete = res;
        tx.onerror = () => rej(tx.error);
      });
    }
  } finally {
    db.close();
  }
}

/** 全データ（タブ設定 + 全ダッシュボード）をJSONファイルにエクスポート */
async function exportAllData() {
  const tabConfig = await AppDB.get("tab_config") || getDefaultConfig();

  let dashboards = [];
  try {
    const db = await new Promise((resolve) => {
      const req = indexedDB.open('dashboard_db');
      req.onsuccess = e => resolve(e.target.result);
      req.onerror = () => resolve(null);
      req.onupgradeneeded = (e) => { if (e.oldVersion === 0) e.target.transaction.abort(); };
    });
    if (db && db.objectStoreNames.contains('sections')) {
      const _getAll = (storeName) => new Promise((res) => {
        if (!db.objectStoreNames.contains(storeName)) { res([]); return; }
        const req = db.transaction(storeName).objectStore(storeName).getAll();
        req.onsuccess = () => res(req.result);
        req.onerror = () => res([]);
      });
      const [sections, items, presets, appConfigs] = await Promise.all([
        _getAll('sections'), _getAll('items'), _getAll('presets'), _getAll('app_config'),
      ]);
      db.close();

      // instance_id ごとにグループ化
      const instanceMap = {};
      sections.forEach(s => {
        const id = s.instance_id ?? '';
        if (!instanceMap[id]) instanceMap[id] = { sections: [], items: [], presets: [], bindConfig: null };
        instanceMap[id].sections.push(s);
      });
      items.forEach(item => {
        const section = sections.find(s => s.id === item.section_id);
        if (section) {
          const id = section.instance_id ?? '';
          if (instanceMap[id]) instanceMap[id].items.push(item);
        }
      });
      presets.forEach(p => {
        const id = p.instance_id ?? '';
        if (instanceMap[id]) instanceMap[id].presets.push(p);
      });
      // app_config から bind_config_{instanceId} を取り出す
      appConfigs.forEach(cfg => {
        const match = cfg.name?.match(/^bind_config_(.*)$/);
        if (match && instanceMap[match[1]]) instanceMap[match[1]].bindConfig = cfg.value;
      });
      dashboards = Object.entries(instanceMap).map(([instanceId, data]) => ({ instanceId, ...data }));
    }
  } catch (e) {
    console.warn('dashboard_db export error:', e);
  }

  const exportData = {
    type: 'app_export',
    version: 2,
    exportedAt: new Date().toISOString(),
    tabConfig,
    dashboards,
  };
  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const _now = new Date(), _p = n => String(n).padStart(2, '0');
  const _ts = `${_now.getFullYear()}${_p(_now.getMonth()+1)}${_p(_now.getDate())}_${_p(_now.getHours())}${_p(_now.getMinutes())}${_p(_now.getSeconds())}`;
  a.download = `mytools_export_${_ts}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** JSONファイルから全データ（タブ設定 + 全ダッシュボード）をインポート */
async function importAllData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    let data;
    try { data = JSON.parse(await file.text()); } catch { alert('JSONの解析に失敗しました'); return; }
    if (data.type !== 'app_export') {
      alert('アプリのエクスポートファイルではありません\n（ダッシュボード単体のエクスポートは各ダッシュボードの設定からインポートしてください）');
      return;
    }
    if (!confirm('現在の全設定・全ダッシュボードデータを削除してインポートしますか？\nこの操作は元に戻せません。')) return;

    try {
      // タブ設定を復元
      if (data.tabConfig) await saveTabConfig(data.tabConfig);

      // dashboard_db を開いて全インスタンスデータを復元
      if (data.dashboards && data.dashboards.length > 0) {
        const db = await new Promise((resolve, reject) => {
          const req = indexedDB.open('dashboard_db', 2);
          req.onsuccess = e => resolve(e.target.result);
          req.onerror = () => reject(req.error);
          req.onupgradeneeded = (ev) => {
            const idb = ev.target.result;
            if (!idb.objectStoreNames.contains('sections')) {
              const ss = idb.createObjectStore('sections', { keyPath: 'id', autoIncrement: true });
              ss.createIndex('position', 'position');
              ss.createIndex('instance_id', 'instance_id');
              const is = idb.createObjectStore('items', { keyPath: 'id', autoIncrement: true });
              is.createIndex('section_id', 'section_id');
              is.createIndex('position', 'position');
            }
            if (!idb.objectStoreNames.contains('app_config')) {
              idb.createObjectStore('app_config', { keyPath: 'name' });
            }
            if (!idb.objectStoreNames.contains('presets')) {
              const ps = idb.createObjectStore('presets', { keyPath: 'id', autoIncrement: true });
              ps.createIndex('instance_id', 'instance_id');
              ps.createIndex('position', 'position');
            }
          };
        });

        // 既存データを全削除（sections/items/presets/app_config すべてクリア）
        await new Promise((res, rej) => {
          const stores = ['sections', 'items', 'presets', 'app_config'];
          const tx = db.transaction(stores, 'readwrite');
          stores.forEach(s => tx.objectStore(s).clear());
          tx.oncomplete = res;
          tx.onerror = () => rej(tx.error);
        });

        // インスタンスごとにインポート
        for (const dashboard of data.dashboards) {
          const { instanceId, sections = [], items = [], presets = [], bindConfig } = dashboard;
          const idMap = {};
          for (const section of sections) {
            const oldId = section.id;
            const newSection = { ...section, instance_id: instanceId };
            delete newSection.id;
            const newId = await new Promise((res, rej) => {
              const req = db.transaction('sections', 'readwrite').objectStore('sections').add(newSection);
              req.onsuccess = () => res(req.result);
              req.onerror = () => rej(req.error);
            });
            if (oldId !== undefined) idMap[oldId] = newId;
          }
          for (const item of items) {
            const newItem = { ...item };
            delete newItem.id;
            if (idMap[newItem.section_id] !== undefined) {
              newItem.section_id = idMap[newItem.section_id];
              await new Promise((res, rej) => {
                const req = db.transaction('items', 'readwrite').objectStore('items').add(newItem);
                req.onsuccess = () => res();
                req.onerror = () => rej(req.error);
              });
            }
          }
          // presets を復元（version 2 以降のみ存在）
          for (const preset of presets) {
            const newPreset = { ...preset, instance_id: instanceId };
            delete newPreset.id;
            await new Promise((res, rej) => {
              const req = db.transaction('presets', 'readwrite').objectStore('presets').add(newPreset);
              req.onsuccess = () => res();
              req.onerror = () => rej(req.error);
            });
          }
          // bindConfig を復元（version 2 以降のみ存在）
          if (bindConfig) {
            await new Promise((res, rej) => {
              const req = db.transaction('app_config', 'readwrite').objectStore('app_config')
                .put({ name: `bind_config_${instanceId}`, value: bindConfig });
              req.onsuccess = () => res();
              req.onerror = () => rej(req.error);
            });
          }
        }
        db.close();
      }

      // UI を更新
      const config = await loadTabConfig();
      rebuildNav(config);
      renderSettingsList(config);
      syncViewport(config);
      alert('インポートが完了しました。各ダッシュボードタブを再読み込みすると変更が反映されます。');
    } catch (err) {
      console.error(err);
      alert('インポートに失敗しました: ' + err.message);
    }
  };
  input.click();
}

// ==================================================
// 設定パネル
// ==================================================

/** 設定パネルのオーバーレイ DOM を生成して #app に追加する */
function buildSettingsPanel() {
  const overlay = document.createElement("div");
  overlay.id = "settings-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="settings-backdrop"></div>
    <div class="settings-dialog" role="dialog" aria-label="タブ設定" aria-modal="true">
      <div class="settings-header">
        <h2>タブ設定</h2>
        <button class="settings-close-btn" aria-label="閉じる">×</button>
      </div>
      <div class="settings-body">
        <ul class="settings-list" id="settings-list"></ul>
        <div class="settings-add-form">
          <h3>タブを追加</h3>
          <input id="new-tab-label" type="text" placeholder="ラベル名">
          <select id="new-tab-type" class="cs-target kn-select--sm">
            <option value="url">カスタムURL</option>
            <option value="dashboard">ダッシュボード</option>
          </select>
          <input id="new-tab-url" type="text" placeholder="URL（例: mypage.html）">
          <button class="settings-add-btn">追加</button>
        </div>
        <div class="settings-io-form">
          <h3>データ管理</h3>
          <div class="settings-io-btns">
            <button class="settings-io-export-btn">${Icons.export} エクスポート</button>
            <button class="settings-io-import-btn">${Icons.import} インポート</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // バックドロップクリックで閉じる
  overlay.querySelector(".settings-backdrop").addEventListener("click", closeSettings);
  // 閉じるボタン
  overlay.querySelector(".settings-close-btn").addEventListener("click", closeSettings);
  // 追加ボタン
  overlay.querySelector(".settings-add-btn").addEventListener("click", addTabFromForm);
  // タイプ選択変更：url 以外は URL 入力欄を非表示
  overlay.querySelector("#new-tab-type").addEventListener("change", (e) => {
    const urlInput = document.getElementById("new-tab-url");
    if (urlInput) urlInput.hidden = e.target.value !== "url";
  });
  // データ管理ボタン
  overlay.querySelector(".settings-io-export-btn").addEventListener("click", exportAllData);
  overlay.querySelector(".settings-io-import-btn").addEventListener("click", importAllData);
  // リスト内のボタンはイベント委譲
  overlay.querySelector("#settings-list").addEventListener("click", _onSettingsListClick);

  document.getElementById("app").appendChild(overlay);
  // カスタムセレクトに置き換え
  CustomSelect.replaceAll(overlay);
}

/** 設定リスト内のクリックを処理する（イベント委譲） */
function _onSettingsListClick(e) {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;
  const label = btn.closest("[data-label]")?.dataset.label;

  switch (action) {
    case "settings-toggle":       toggleTabVisible(label).catch(console.error); break;
    case "settings-move-up":      moveTab(label, "up").catch(console.error); break;
    case "settings-move-down":    moveTab(label, "down").catch(console.error); break;
    case "settings-delete":       deleteTab(label).catch(console.error); break;
    case "settings-rename":       renameTab(label).catch(console.error); break;
    case "settings-pick-icon":       _toggleIconPicker(label); break;
    case "settings-select-icon":     _onSelectIcon(btn).catch(console.error); break;
    case "settings-configure-page":  configureHomePage(label).catch(console.error); break;
  }
}

/** 設定パネル内のリストを再描画する */
function renderSettingsList(config) {
  const list = document.getElementById("settings-list");
  if (!list) return;

  list.innerHTML = "";
  const sorted = sortByPosition(config);

  sorted.forEach((tab, idx) => {
    const isFirst = idx === 0;
    const isLast = idx === sorted.length - 1;

    const li = document.createElement("li");
    li.className = "settings-item";
    li.dataset.label = tab.label;

    // ダッシュボードタブか判定（設定ボタン表示用）
    const isHomePage = tab.pageSrc === "dashboard.html" || tab.pageSrc?.startsWith("dashboard.html?");

    // メインの行
    const row = document.createElement("div");
    row.className = "settings-item__row";
    row.innerHTML = `
      <button class="settings-icon-btn" data-action="settings-pick-icon" data-label="${tab.label}" aria-label="アイコンを変更" title="アイコンを変更"></button>
      <button class="settings-move-btn" data-action="settings-move-up"   data-label="${tab.label}" ${isFirst ? "disabled" : ""} aria-label="上に移動">↑</button>
      <button class="settings-move-btn" data-action="settings-move-down" data-label="${tab.label}" ${isLast  ? "disabled" : ""} aria-label="下に移動">↓</button>
      <label class="settings-item__toggle">
        <input type="checkbox" data-action="settings-toggle" data-label="${tab.label}" ${tab.visible ? "checked" : ""}>
        <span>${tab.label}</span>
        ${tab.isBuiltIn ? "" : '<span class="settings-item__custom-badge">カスタム</span>'}
      </label>
      ${isHomePage ? `<button class="settings-configure-btn" data-action="settings-configure-page" data-label="${tab.label}" title="ページを設定">設定</button>` : ""}
      ${tab.isBuiltIn ? "" : `<button class="settings-rename-btn" data-action="settings-rename" data-label="${tab.label}" aria-label="${tab.label}の名前を変更" title="名前変更">✎</button>`}
      ${tab.isBuiltIn ? "" : `<button class="settings-delete-btn" data-action="settings-delete" data-label="${tab.label}" aria-label="${tab.label}を削除">削除</button>`}
    `;
    // アイコンプレビューを設定（innerHTML でそのまま挿入）
    row.querySelector(".settings-icon-btn").innerHTML = tab.icon;

    // アイコンピッカー（初期は非表示）
    const picker = document.createElement("div");
    picker.className = "settings-item__picker";
    picker.hidden = true;

    const grid = document.createElement("div");
    grid.className = "icon-picker__grid";
    ICON_PALETTE.forEach(({ id, label: iconLabel, svg }) => {
      const iconBtn = document.createElement("button");
      iconBtn.className = "icon-picker__item";
      iconBtn.dataset.action = "settings-select-icon";
      iconBtn.dataset.label = tab.label;
      iconBtn.dataset.iconId = id;
      iconBtn.title = iconLabel;
      iconBtn.innerHTML = svg;
      grid.appendChild(iconBtn);
    });

    picker.appendChild(grid);
    li.appendChild(row);
    li.appendChild(picker);
    list.appendChild(li);
  });
}

/** アイコンピッカーのトグル（同一タブなら閉じ、別タブなら前を閉じて開く） */
function _toggleIconPicker(label) {
  const list = document.getElementById("settings-list");
  if (!list) return;

  const item = list.querySelector(`.settings-item[data-label="${CSS.escape(label)}"]`);
  if (!item) return;
  const targetPicker = item.querySelector(".settings-item__picker");
  if (!targetPicker) return;

  const isOpening = targetPicker.hidden;

  // すべてのピッカーを閉じる
  list.querySelectorAll(".settings-item__picker").forEach(p => { p.hidden = true; });

  // 対象が閉じていた場合のみ開く
  if (isOpening) targetPicker.hidden = false;
}

/** アイコン選択時の処理 */
async function _onSelectIcon(btn) {
  const label  = btn.dataset.label;
  const iconId = btn.dataset.iconId;
  if (!label || !iconId) return;

  const icon = ICON_PALETTE.find(i => i.id === iconId);
  if (!icon) return;

  const config = await loadTabConfig();
  const tab = config.find(t => t.label === label);
  if (!tab) return;

  tab.icon = icon.svg;
  await saveTabConfig(config);
  rebuildNav(config);
  renderSettingsList(config);  // 再描画でピッカーも閉じる
}

/** 設定モーダルを開く */
async function openSettings() {
  const overlay = document.getElementById("settings-overlay");
  if (!overlay) return;
  renderSettingsList(await loadTabConfig());
  overlay.hidden = false;
}

/** 設定モーダルを閉じる */
function closeSettings() {
  const overlay = document.getElementById("settings-overlay");
  if (overlay) overlay.hidden = true;
}

/** タブの表示フラグを反転する */
async function toggleTabVisible(label) {
  const config = await loadTabConfig();
  const tab = config.find(t => t.label === label);
  if (!tab) return;

  // 表示中が1件だけの場合は非表示にしない
  const visibleCount = config.filter(t => t.visible).length;
  if (tab.visible && visibleCount <= 1) return;

  tab.visible = !tab.visible;
  await saveTabConfig(config);
  rebuildNav(config);
  renderSettingsList(config);
}

/** タブの順序を変更する（dir: 'up' | 'down'）*/
async function moveTab(label, dir) {
  const config = await loadTabConfig();
  const sorted = sortByPosition(config);
  const idx = sorted.findIndex(t => t.label === label);
  if (idx < 0) return;

  const swapIdx = dir === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= sorted.length) return;

  // position を入れ替え
  const tmpPos = sorted[idx].position;
  sorted[idx].position = sorted[swapIdx].position;
  sorted[swapIdx].position = tmpPos;

  // config 配列に反映
  sorted.forEach(tab => {
    const orig = config.find(t => t.label === tab.label);
    if (orig) orig.position = tab.position;
  });

  await saveTabConfig(config);
  rebuildNav(config);
  renderSettingsList(config);
}

/** カスタムタブを削除する（組み込みタブは削除不可）*/
async function deleteTab(label) {
  const config = await loadTabConfig();
  const tab = config.find(t => t.label === label);
  if (!tab || tab.isBuiltIn) return;
  if (!confirm(`「${label}」タブを削除しますか？\nこの操作は元に戻せません。`)) return;

  const newConfig = config.filter(t => t.label !== label);
  // position を連番に詰め直す
  sortByPosition(newConfig)
    .forEach((t, i) => { const c = newConfig.find(x => x.label === t.label); if (c) c.position = i; });

  await saveTabConfig(newConfig);

  // ダッシュボードタブの場合は共有DBからそのインスタンスのデータを削除する
  if (tab.pageSrc?.startsWith("dashboard.html")) {
    const instanceId = new URLSearchParams(tab.pageSrc.split("?")[1] || "").get("instance") || "";
    _deleteDashboardInstance(instanceId).catch(console.error);
  }

  // iframe は再読み込み防止のため DOM から削除しない
  rebuildNav(newConfig);
  renderSettingsList(newConfig);
}

/** カスタムタブのラベル名を変更する */
async function renameTab(oldLabel) {
  const newLabel = prompt(`「${oldLabel}」の新しいラベル名を入力してください`, oldLabel);
  if (!newLabel || newLabel.trim() === "") return;
  const trimmed = newLabel.trim();
  if (trimmed === oldLabel) return;

  const config = await loadTabConfig();
  if (config.find(t => t.label === trimmed)) {
    alert("同じラベル名のタブが既に存在します");
    return;
  }
  const tab = config.find(t => t.label === oldLabel);
  if (!tab || tab.isBuiltIn) return;

  tab.label = trimmed;
  await saveTabConfig(config);

  // iframe を再読み込みせずに id と title だけ更新する
  const oldFrame = document.getElementById(`frame-${oldLabel}`);
  if (oldFrame) {
    oldFrame.id = `frame-${trimmed}`;
    oldFrame.title = trimmed;
  }

  // アクティブタブ ID が旧ラベルを指していれば更新する
  const savedId = loadFromStorage(STORAGE_KEY_ACTIVE_TAB_ID);
  if (savedId === `TAB-${oldLabel}`) {
    saveToStorage(STORAGE_KEY_ACTIVE_TAB_ID, `TAB-${trimmed}`);
  }

  rebuildNav(config);
  renderSettingsList(config);
}

/** フォームからカスタムタブを追加する */
async function addTabFromForm() {
  const labelInput = document.getElementById("new-tab-label");
  const urlInput   = document.getElementById("new-tab-url");
  const tabType    = document.getElementById("new-tab-type")?.value || "url";
  const label      = labelInput?.value.trim();

  // ダッシュボードタイプは instance パラメータ付きの dashboard.html を生成
  const pageSrc = tabType === "dashboard"
    ? `dashboard.html?instance=${Date.now().toString(36)}`
    : urlInput?.value.trim();

  if (!label) {
    alert("ラベル名を入力してください");
    return;
  }
  if (tabType === "url" && !pageSrc) {
    alert("URL を入力してください");
    return;
  }

  const config = await loadTabConfig();
  if (config.find(t => t.label === label)) {
    alert("同じラベル名のタブが既に存在します");
    return;
  }

  const maxPos = config.length > 0 ? Math.max(...config.map(t => t.position)) : -1;
  config.push({
    label,
    pageSrc,
    icon: GENERIC_ICON,
    visible: true,
    position: maxPos + 1,
    isBuiltIn: false,
  });

  await saveTabConfig(config);
  syncViewport(config);
  rebuildNav(config);
  renderSettingsList(config);

  // フォームをクリア
  if (labelInput) labelInput.value = "";
  if (urlInput) { urlInput.value = ""; urlInput.hidden = false; }
  const typeSelect = document.getElementById("new-tab-type");
  if (typeSelect) {
    typeSelect.value = "url";
    // CustomSelect の表示も更新（render() を呼ばないと UI が「ダッシュボード」のまま残る）
    typeSelect._csInst?.render();
  }
}

/** ホームタブのページ設定パネルを開く */
async function configureHomePage(label) {
  // タブ設定パネルを閉じてからタブを切り替え
  closeSettings();
  const tabId = `TAB-${label}`;
  activateTab(tabId);
  saveToStorage(STORAGE_KEY_ACTIVE_TAB_ID, tabId);

  const iframe = document.getElementById(`frame-${label}`);
  if (!iframe) return;

  // iframe が読み込み済みなら即送信、そうでなければ load 後に送信
  const sendMsg = () => iframe.contentWindow?.postMessage({ type: 'dashboard:open-settings' }, '*');
  if (iframe.contentDocument?.readyState === 'complete') {
    sendMsg();
  } else {
    iframe.addEventListener('load', sendMsg, { once: true });
  }
}

// ==================================================
// ページ間ナビゲーション: iframe からの要求を中継
// ==================================================
window.addEventListener('message', async (e) => {
  const { type, noteTaskId, todoTaskId } = e.data || {};
  if (type !== 'navigate:note' && type !== 'navigate:todo') return;

  const config  = await loadTabConfig();
  const pageSrc = type === 'navigate:note' ? 'note.html' : 'todo.html';
  const tab     = config.find(t => t.visible && t.pageSrc === pageSrc);
  if (!tab) return;

  // タブを切り替え
  const tabId = `TAB-${tab.label}`;
  activateTab(tabId);
  saveToStorage(STORAGE_KEY_ACTIVE_TAB_ID, tabId);

  // 対象 iframe にメッセージを転送
  const iframe = document.getElementById(`frame-${tab.label}`);
  if (!iframe) return;
  const msg     = type === 'navigate:note'
    ? { type: 'navigate:note', noteTaskId }
    : { type: 'navigate:todo', todoTaskId };
  const sendMsg = () => iframe.contentWindow?.postMessage(msg, '*');
  if (iframe.contentDocument?.readyState === 'complete') {
    sendMsg();
  } else {
    iframe.addEventListener('load', sendMsg, { once: true });
  }
});
