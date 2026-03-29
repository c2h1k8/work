
const App = {
  async init() {
    const db = new DashboardDB();
    await db.open();
    State.db = db;

    // セクション・アイテムをロード
    State.sections = await db.getAllSections();
    for (const section of State.sections) {
      State.itemsMap[section.id] = await db.getItemsBySection(section.id);
    }

    // 共通バインド変数をロード
    const bindConfig = await db.getAppConfig("bind_config");
    if (bindConfig) State.bindConfig = bindConfig;
    State.presets = await db.getAllPresets();
    const savedPresetId = parseInt(localStorage.getItem(ACTIVE_PRESET_KEY));
    if (savedPresetId && State.presets.some((p) => p.id === savedPresetId)) {
      State.activePresetId = savedPresetId;
    }

    // Tauri: <a target="_blank"> をネイティブで開く
    Opener.intercept(document);

    Renderer.renderEnvBar();
    Renderer.renderDashboard();
    Renderer.renderJumpNav();
    App.bindEvents();
  },

  bindEvents() {
    // ギアボタン
    document.getElementById("home-gear-btn").addEventListener("click", () => {
      EventHandlers.openSettings();
    });

    // キーボードショートカット
    document.addEventListener("keydown", (e) => {
      // Escape: 入力中ならフォーカスを外す / アイテム管理モーダルを閉じる
      if (e.key === "Escape") {
        const isInInput = ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName) || e.target.isContentEditable;
        if (isInInput && !e.isComposing) { e.target.blur(); return; }
        const modal = document.getElementById("item-manager-modal");
        if (modal && !modal.hidden) {
          EventHandlers.closeItemManager();
          return;
        }
      }

      // Ctrl+, : 設定パネル開閉
      if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        const settings = document.getElementById("home-settings");
        if (settings && !settings.hidden) {
          EventHandlers.closeSettings();
        } else {
          EventHandlers.openSettings();
        }
        return;
      }
    });

    // ショートカットキー一覧登録
    ShortcutHelp.register([
      { name: "ショートカット", shortcuts: [
        { keys: ["Ctrl", ","], description: "設定パネル開閉" },
        { keys: ["Escape"], description: "モーダルを閉じる" },
      ]}
    ]);

    // 親フレームからのメッセージを受信
    window.addEventListener("message", (e) => {
      // 設定パネル開封要求（タブ設定の「ページを設定」ボタン用）
      if (e.data?.type === "dashboard:open-settings") {
        EventHandlers.openSettings();
      }
      // Ctrl+, : 設定パネル開閉（親フレームから転送）
      if (e.data?.type === "toggle-page-settings") {
        parent.postMessage({ type: "page-settings-handled" }, "*");
        const settings = document.getElementById("home-settings");
        if (settings && !settings.hidden) {
          EventHandlers.closeSettings();
        } else {
          EventHandlers.openSettings();
        }
      }
      // テーマ変更を受け取る
      if (e.data?.type === "theme-change") {
        document.documentElement.setAttribute("data-theme", e.data.theme);
        localStorage.setItem("mytools_theme", e.data.theme);
      }
    });

    // 全クリック（イベント委譲）
    document.addEventListener("click", (e) => {
      // ダッシュボードのコピー行（共通バインド変数を解決してコピー）
      const copyEl = e.target.closest(".js-copy");
      if (copyEl && !copyEl.closest(".home-settings")) {
        // テーブルセクション内のセルはセクションIDを取得してテーブル独自変数も解決
        const card = copyEl.closest(".card[data-section-id]");
        const secId = card ? Number(card.dataset.sectionId) : null;
        const rawVal = copyEl.dataset.value || "";
        const resolved = resolveBindVars(secId ? resolveTableVars(rawVal, secId) : rawVal);
        Clipboard.copy(resolved);
        showSuccess("コピーしました");
        return;
      }
      // ダッシュボードのリンク行（共通バインド変数を解決してリンクを開く）
      const linkEl = e.target.closest(".js-link");
      if (linkEl && !linkEl.closest(".home-settings")) {
        const card = linkEl.closest(".card[data-section-id]");
        const secId = card ? Number(card.dataset.sectionId) : null;
        const rawVal = linkEl.dataset.value || "";
        const url = resolveBindVars(secId ? resolveTableVars(rawVal, secId) : rawVal);
        if (url) Opener.open(url);
        return;
      }
      // ダッシュボードのテンプレートカード（日付変数・バインド変数を解決してコピー）
      const templateEl = e.target.closest(".js-template");
      if (templateEl && !templateEl.closest(".home-settings")) {
        const tplCard = templateEl.closest(".card[data-section-id]");
        const tplSecId = tplCard ? Number(tplCard.dataset.sectionId) : null;
        const rawTplVal = templateEl.dataset.value || "";
        const resolved = resolveDateVars(
          resolveBindVars(tplSecId ? resolveSectionVars(rawTplVal, tplSecId) : rawTplVal),
        );
        Clipboard.copy(resolved);
        showSuccess("コピーしました");
        return;
      }
      // URLコマンドコピーボタン
      const cmdBtn = e.target.closest(".js-copy-cmd");
      if (cmdBtn) {
        EventHandlers.onCopyCmd(cmdBtn);
        return;
      }

      // 設定パネルのアクション
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      const sectionId = btn.dataset.sectionId
        ? Number(btn.dataset.sectionId)
        : null;
      const itemId = btn.dataset.itemId ? Number(btn.dataset.itemId) : null;
      const colId = btn.dataset.colId || null;
      const presetId = btn.dataset.presetId
        ? Number(btn.dataset.presetId)
        : null;

      const eh = EventHandlers;
      switch (action) {
        case "settings-close":
          eh.closeSettings();
          break;
        case "settings-back":
          eh.backInSettings();
          break;
        case "toggle-collapse":
          eh.toggleSectionCollapse(sectionId);
          break;
        case "sort-table-col":
          eh.sortTableCol(sectionId, colId);
          break;
        case "table-goto-page": {
          const page = parseInt(btn.dataset.page, 10);
          if (!isNaN(page)) {
            State.tablePageState[sectionId] = page;
            const sec = State.sections.find((s) => s.id === sectionId);
            const itms = State.itemsMap[sectionId] || [];
            const card = document.querySelector(
              `.card[data-section-id="${sectionId}"]`,
            );
            if (card && sec) {
              const bd = card.querySelector(".card__bd");
              if (bd) {
                bd.innerHTML = "";
                Renderer.buildTableSection(sec, itms, bd);
              }
            }
          }
          break;
        }
        case "save-section-memo":
          eh.saveSectionMemo(sectionId).catch(console.error);
          break;
        case "save-section-checklist":
          eh.saveSectionChecklist(sectionId).catch(console.error);
          break;
        case "toggle-md-edit":
          eh.toggleMarkdownEdit(sectionId);
          break;
        case "save-markdown-body":
          eh.saveMarkdownBody(sectionId).catch(console.error);
          break;
        case "cancel-md-edit":
          eh.toggleMarkdownEdit(sectionId);
          break;
        case "toggle-countdown-mode":
          eh.toggleCountdownMode(sectionId).catch(console.error);
          break;
        case "edit-countdown-date":
          eh.editCountdownDate(itemId, sectionId).catch(console.error);
          break;
        case "edit-countdown-label":
          eh.editCountdownLabel(btn);
          break;
        case "delete-countdown-item":
          eh.deleteCountdownItem(itemId, sectionId).catch(console.error);
          break;
        case "toggle-countdown-add":
          eh.toggleCountdownAdd(sectionId);
          break;
        case "save-countdown-add":
          eh.saveCountdownAdd(sectionId).catch(console.error);
          break;
        case "cancel-countdown-add":
          eh.cancelCountdownAdd(sectionId);
          break;
        case "open-countdown-date":
          eh.openCountdownDatePicker(btn);
          break;
        case "toggle-jump-nav":
          eh.toggleJumpNav();
          break;
        case "jump-to-section":
          eh.jumpToSection(sectionId);
          break;
        case "show-add-section":
          eh.showAddSectionForm();
          break;
        case "cancel-add-section":
          eh.hideAddSectionForm();
          break;
        case "save-add-section":
          eh.saveAddSection().catch(console.error);
          break;
        case "edit-section":
          eh.editSection(sectionId);
          break;
        case "delete-section":
          eh.deleteSection(sectionId).catch(console.error);
          break;
        case "move-section-up":
          eh.moveSectionUp(sectionId).catch(console.error);
          break;
        case "move-section-down":
          eh.moveSectionDown(sectionId).catch(console.error);
          break;
        case "save-section-meta":
          eh.saveSectionMeta(sectionId).catch(console.error);
          break;
        case "show-add-cmd-button":
          eh.toggleAddCmdButtonForm(true);
          break;
        case "cancel-add-cmd-button":
          eh.toggleAddCmdButtonForm(false);
          break;
        case "save-add-cmd-button":
          eh.saveAddCmdButton(sectionId).catch(console.error);
          break;
        case "edit-cmd-button":
          eh.editCmdButton(sectionId, btn.dataset.btnId);
          break;
        case "save-edit-cmd-button":
          eh.saveEditCmdButton(sectionId, btn.dataset.btnId).catch(console.error);
          break;
        case "cancel-edit-cmd-button":
          eh.cancelEditCmdButton(btn.dataset.btnId);
          break;
        case "delete-cmd-button":
          eh.deleteCmdButton(sectionId, btn.dataset.btnId).catch(console.error);
          break;
        case "move-cmd-button-up":
          eh.moveCmdButtonUp(sectionId, btn.dataset.btnId).catch(console.error);
          break;
        case "move-cmd-button-down":
          eh.moveCmdButtonDown(sectionId, btn.dataset.btnId).catch(console.error);
          break;
        case "show-add-column":
          eh.toggleAddColumnForm(true);
          break;
        case "cancel-add-column":
          eh.toggleAddColumnForm(false);
          break;
        case "save-add-column":
          eh.saveAddColumn(sectionId).catch(console.error);
          break;
        case "edit-column":
          eh.editColumn(sectionId, colId);
          break;
        case "save-edit-column":
          eh.saveEditColumn(sectionId, colId).catch(console.error);
          break;
        case "cancel-edit-column":
          Renderer.renderSettingsView();
          break;
        case "delete-column":
          eh.deleteColumn(sectionId, colId).catch(console.error);
          break;
        case "move-col-up":
          eh.moveColumnUp(sectionId, colId).catch(console.error);
          break;
        case "move-col-down":
          eh.moveColumnDown(sectionId, colId).catch(console.error);
          break;
        case "show-add-item":
          eh.toggleAddItemForm(true);
          break;
        case "cancel-add-item":
          eh.toggleAddItemForm(false);
          break;
        case "save-add-item":
          eh.saveAddItem(sectionId).catch(console.error);
          break;
        case "edit-item":
          eh.editItem(itemId, sectionId);
          break;
        case "save-edit-item":
          eh.saveEditItem(itemId, sectionId).catch(console.error);
          break;
        case "cancel-edit-item":
          eh.cancelEditItem(itemId, sectionId);
          break;
        case "delete-item":
          eh.deleteItem(itemId, sectionId).catch(console.error);
          break;
        case "move-item-up":
          eh.moveItemUp(itemId, sectionId).catch(console.error);
          break;
        case "move-item-down":
          eh.moveItemDown(itemId, sectionId).catch(console.error);
          break;
        // アイテム管理モーダル
        case "open-item-mgr":
          eh.openItemManager(sectionId);
          break;
        case "close-item-mgr":
          eh.closeItemManager();
          break;
        case "item-mgr-tab":
          eh.switchItemMgrTab(btn.dataset.tab);
          break;
        case "save-add-item-mgr":
          eh.saveAddItemInManager(sectionId).catch(console.error);
          break;
        case "edit-item-mgr":
          eh.editItemInManager(itemId, sectionId);
          break;
        case "save-edit-item-mgr":
          eh.saveEditItemInManager(itemId, sectionId).catch(console.error);
          break;
        case "cancel-edit-item-mgr":
          eh.cancelEditItemInManager(sectionId);
          break;
        case "delete-item-mgr":
          eh.deleteItemInManager(itemId, sectionId).catch(console.error);
          break;
        case "move-item-up-mgr":
          eh.moveItemUpInManager(itemId, sectionId).catch(console.error);
          break;
        case "move-item-down-mgr":
          eh.moveItemDownInManager(itemId, sectionId).catch(console.error);
          break;
        case "save-bulk-items":
          eh.saveBulkItems(sectionId).catch(console.error);
          break;
        case "toggle-table-col-menu":
          eh.toggleTableColMenu(sectionId);
          break;
        case "export-data":
          eh.exportData();
          break;
        case "import-data":
          eh.importData();
          break;
        case "open-bind-var-modal":
          eh.openBindVarModal();
          break;
        case "open-table-bind-var-modal":
          eh.openTableBindVarModal(sectionId);
          break;
        case "open-list-bind-var-modal":
          eh.openListBindVarModal(sectionId);
          break;
        case "open-grid-bind-var-modal":
          eh.openGridBindVarModal(sectionId);
          break;
        case "switch-preset":
          eh.switchPreset(presetId);
          break;
        case "switch-table-preset":
          eh.switchTablePreset(sectionId, presetId);
          break;
        case "switch-list-preset":
          eh.switchListPreset(sectionId, presetId);
          break;
        case "switch-grid-preset":
          eh.switchGridPreset(sectionId, presetId);
          break;
      }
    });

    // テーブル列メニューの外クリックで閉じる
    document.addEventListener("click", (e) => {
      if (
        !e.target.closest(".data-table-col-toggle-wrap") &&
        !e.target.closest(".data-table-col-menu")
      ) {
        document.querySelectorAll(".data-table-col-menu").forEach((m) => {
          m.hidden = true;
        });
      }
      // ジャンプナビ外クリックで閉じる
      if (!e.target.closest("#section-nav")) {
        const menu = document.getElementById("section-nav-menu");
        if (menu) menu.hidden = true;
      }
    });

    // change イベント（テーブル列の表示切替 + セクションタイプ変更 + チェックリスト）
    document.addEventListener("change", (e) => {
      if (e.target.matches(".data-table-col-menu input[type=checkbox]")) {
        EventHandlers.onTableColVisibilityChange(e.target);
        return;
      }
      if (e.target.matches(".checklist-cb")) {
        EventHandlers.onChecklistChange(e.target);
        return;
      }
      if (e.target.id === "new-section-type")
        EventHandlers.onNewSectionTypeChange();
      if (e.target.id === "item-type") EventHandlers.onItemTypeChange();
      if (e.target.id === "mgr-item-type") EventHandlers.onMgrItemTypeChange();
    });

  },
};

window.addEventListener("load", () => {
  App.init().catch(console.error);
});
