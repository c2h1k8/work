'use strict';

// ==================================================
// 設定パネル（タブ管理 UI）
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
          <h3>全データ一括バックアップ</h3>
          <div class="settings-backup-btns">
            <button class="settings-backup-export-btn">${Icons.export} バックアップ</button>
            <button class="settings-backup-import-btn">${Icons.import} 復元</button>
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
  // 全データ一括バックアップボタン
  overlay.querySelector(".settings-backup-export-btn").addEventListener("click", backupAllData);
  overlay.querySelector(".settings-backup-import-btn").addEventListener("click", restoreAllData);
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
    const isHomePage = tab.pageSrc === "pages/dashboard.html" || tab.pageSrc?.startsWith("pages/dashboard.html?");

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
  if (tab.pageSrc?.startsWith("pages/dashboard.html")) {
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
    Toast.error("同じラベル名のタブが既に存在します");
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
    ? `pages/dashboard.html?instance=${Date.now().toString(36)}`
    : urlInput?.value.trim();

  if (!label) {
    Toast.error("ラベル名を入力してください");
    return;
  }
  if (tabType === "url" && !pageSrc) {
    Toast.error("URL を入力してください");
    return;
  }

  const config = await loadTabConfig();
  if (config.find(t => t.label === label)) {
    Toast.error("同じラベル名のタブが既に存在します");
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
