'use strict';

// ==================================================
// シェル構築・ナビゲーション・タブ切り替え
// ==================================================

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

  // グローバル検索バー
  const searchWrap = document.createElement("div");
  searchWrap.className = "global-search";
  searchWrap.id = "global-search-wrap";
  const isMac = (() => {
    const p = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
    if (p) return /mac/i.test(p);
    return /Macintosh|Mac OS X/i.test(navigator.userAgent);
  })();
  searchWrap.innerHTML = `
    <svg class="global-search__icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z"/></svg>
    <input class="global-search__input" id="global-search-input" type="text" placeholder="検索 (${isMac ? '⌘' : 'Ctrl'}+K)" autocomplete="off" aria-label="全ページを検索">
    <span class="global-search__kbd">${isMac ? '⌘K' : 'Ctrl+K'}</span>
    <div class="global-search__results" id="global-search-results" hidden></div>
  `;
  _initGlobalSearch(searchWrap);

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

  // アクティビティログボタン
  const activityBtn = document.createElement("button");
  activityBtn.className = "nav-icon-btn";
  activityBtn.id = "activity-log-btn";
  activityBtn.setAttribute("aria-label", "アクティビティログ");
  activityBtn.title = "アクティビティログ";
  activityBtn.innerHTML = Icons.history;
  activityBtn.addEventListener("click", () => ActivityLogModal.show());

  // ギアアイコンボタン
  const settingsBtn = document.createElement("button");
  settingsBtn.className = "nav-icon-btn";
  settingsBtn.setAttribute("aria-label", "タブ設定");
  settingsBtn.innerHTML = Icons.gear;
  settingsBtn.addEventListener("click", openSettings);

  actions.appendChild(searchWrap);
  actions.appendChild(themeBtn);
  actions.appendChild(activityBtn);
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
  _attachIframeShortcuts(frame);
  return frame;
}

/**
 * iframe 内のキーイベントを親フレームのナビゲーションショートカットにバインドする。
 * iframe にフォーカスがあると親の keydown が発火しないため、
 * contentDocument に直接リスナーを付けて補完する。
 */
function _attachIframeShortcuts(frame) {
  frame.addEventListener('load', () => {
    try {
      const doc = frame.contentDocument;
      if (!doc) return;

      doc.addEventListener('keydown', (e) => {
        // Ctrl+K / Cmd+K: グローバル検索にフォーカス
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
          e.preventDefault();
          const input = document.getElementById('global-search-input');
          if (input) { input.focus(); input.select(); }
          return;
        }
        // Ctrl+1~9: タブ N に切替
        if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '9') {
          e.preventDefault();
          const tabs = document.querySelectorAll('.tab-btn');
          const idx = parseInt(e.key, 10) - 1;
          if (idx < tabs.length) {
            const tabId = tabs[idx].htmlFor;
            activateTab(tabId);
            saveToStorage(STORAGE_KEY_ACTIVE_TAB_ID, tabId);
          }
          return;
        }
        // Ctrl+[ / Ctrl+]: 前後のタブに切替
        if ((e.ctrlKey || e.metaKey) && (e.key === '[' || e.key === ']')) {
          e.preventDefault();
          _switchTabRelative(e.key === ']' ? 1 : -1);
          return;
        }
        // Ctrl+Shift+E: 全データ一括バックアップ
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'E') {
          e.preventDefault();
          if (typeof backupAllData === 'function') backupAllData();
          return;
        }
      });

      // ナビゲーションショートカット定義を iframe に送信（?キーの一覧表示用）
      if (typeof _navShortcutCategories !== 'undefined' && _navShortcutCategories.length) {
        frame.contentWindow.postMessage({
          type: 'register-parent-shortcuts',
          categories: _navShortcutCategories,
        }, '*');
      }
    } catch (_) {
      // cross-origin iframe（カスタムURLタブ等）の場合は無視
    }
  });
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

  // アクティブ iframe にフォーカスを移す（ページ固有ショートカットを即座に有効化）
  const activeFrame = document.getElementById(`frame-${frameName}`);
  if (activeFrame) activeFrame.focus();
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

/** 現在のタブから相対位置 delta で切替（循環） */
function _switchTabRelative(delta) {
  const tabs = Array.from(document.querySelectorAll('.tab-btn'));
  if (tabs.length === 0) return;
  const currentIdx = tabs.findIndex(btn => btn.classList.contains('tab-btn--active'));
  const nextIdx = (currentIdx + delta + tabs.length) % tabs.length;
  const tabId = tabs[nextIdx].htmlFor;
  activateTab(tabId);
  saveToStorage(STORAGE_KEY_ACTIVE_TAB_ID, tabId);
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
