// EventHandlers
// ==============================

const EventHandlers = {
  // ── 設定パネル開閉 ────────────────────

  openSettings() {
    State.settings.open = true;
    State.settings.view = "sections";
    State.settings.editingSectionId = null;
    const panel = document.getElementById("home-settings");
    panel.removeAttribute("hidden");
    panel.offsetWidth; // リフロー強制
    panel.classList.add("is-open");
    Renderer.renderSettingsView();
  },

  closeSettings() {
    const panel = document.getElementById("home-settings");
    panel.classList.remove("is-open");
    panel.addEventListener(
      "transitionend",
      () => {
        if (!panel.classList.contains("is-open"))
          panel.setAttribute("hidden", "");
      },
      { once: true },
    );
    State.settings.open = false;
    // 親フレームに設定パネルが閉じたことを通知（タブ設定の「ページを設定」ボタン用）
    if (window.parent !== window) {
      window.parent.postMessage({ type: "dashboard:settings-closed" }, "*");
    }
  },

  backToSections() {
    State.settings.view = "sections";
    State.settings.editingSectionId = null;
    State.settings.editingPresetId = null;
    Renderer.renderSettingsView();
  },

  backInSettings() {
    State.settings.view = "sections";
    State.settings.editingSectionId = null;
    Renderer.renderSettingsView();
  },

  // ── セクション追加 ────────────────────

  showAddSectionForm() {
    const form = document.getElementById("add-section-form");
    const list = document.getElementById("settings-section-list");
    if (form) form.hidden = false;
    if (list) list.hidden = true;
    // 追加ボタンも非表示
    const addBar = document.querySelector(".settings-add-bar");
    if (addBar) addBar.hidden = true;
  },

  hideAddSectionForm() {
    Renderer.renderSettingsView();
  },

  onNewSectionTypeChange() {
    const type = document.getElementById("new-section-type")?.value;
    const cmdRow = document.getElementById("new-section-cmd-row");
    const actionRow = document.getElementById("new-section-action-row");
    const isCmdBuilder = type === "command_builder";
    if (cmdRow) cmdRow.hidden = !isCmdBuilder;
    if (actionRow) actionRow.hidden = !isCmdBuilder;
  },

  // グリッドアイテムフォームのアクションタイプ変更時（link/copy/template の切り替え）
  onItemTypeChange() {
    const type = document.getElementById("item-type")?.value;
    const valueRow = document.getElementById("item-value-row");
    const templateRow = document.getElementById("template-value-row");
    if (!valueRow || !templateRow) return;
    const isTemplate = type === "template";
    valueRow.hidden = isTemplate;
    templateRow.hidden = !isTemplate;
  },

  async saveAddSection() {
    const icon =
      document.getElementById("new-section-icon")?.value.trim() || "📋";
    const title = document.getElementById("new-section-title")?.value.trim();
    const type = document.getElementById("new-section-type")?.value || "list";
    const cmd = document.getElementById("new-section-cmd")?.value.trim() || "";
    const actionMode =
      document.getElementById("new-section-action-mode")?.value || "copy";
    const width = document.getElementById("new-section-width")?.value || "auto";
    const newRow =
      document.getElementById("new-section-new-row")?.checked || false;

    if (!title) {
      alert("タイトルを入力してください");
      return;
    }

    const maxPos =
      State.sections.length > 0
        ? Math.max(...State.sections.map((s) => s.position)) + 1
        : 0;

    const data = {
      title,
      icon,
      position: maxPos,
      type,
      width,
      newRow,
      command_template: type === "command_builder" ? cmd : null,
      action_mode: type === "command_builder" ? actionMode : null,
      columns: type === "table" ? [] : null,
      memo_content: type === "memo" ? "" : null,
      checklist_reset: type === "checklist" ? "never" : null,
      body: type === "markdown" ? "" : null,
      url: type === "iframe" ? "" : null,
      iframe_height: type === "iframe" ? 400 : null,
      countdown_mode: type === "countdown" ? "calendar" : null,
    };
    const newId = await State.db.addSection(data);
    data.id = newId;
    data.instance_id = State.db.instanceId; // updateSection 時に instance_id が消えないよう保持
    State.sections.push(data);
    State.itemsMap[newId] = [];
    // アクティビティログに記録
    ActivityLogger.log('dashboard', 'create', 'section', newId, `セクション「${title}」を追加`);

    Renderer.renderDashboard();
    Renderer.renderSettingsView();
  },

  // ── セクション操作 ────────────────────

  editSection(sectionId) {
    State.settings.view = "edit-section";
    State.settings.editingSectionId = sectionId;
    Renderer.renderSettingsView();
  },

  async deleteSection(sectionId) {
    const items = State.itemsMap[sectionId] || [];
    const section = State.sections.find(s => s.id === sectionId);
    const msg =
      items.length > 0
        ? `このセクションには ${items.length} 件のアイテムがあります。削除しますか？`
        : "このセクションを削除しますか？";
    if (!confirm(msg)) return;
    // アクティビティログに記録（削除前に情報保持）
    if (section) ActivityLogger.log('dashboard', 'delete', 'section', sectionId, `セクション「${section.title}」を削除`);

    await State.db.deleteSection(sectionId);
    State.sections = State.sections.filter((s) => s.id !== sectionId);
    delete State.itemsMap[sectionId];

    Renderer.renderDashboard();
    if (
      State.settings.view === "edit-section" &&
      State.settings.editingSectionId === sectionId
    ) {
      State.settings.view = "sections";
      State.settings.editingSectionId = null;
    }
    Renderer.renderSettingsView();
  },

  async moveSectionUp(sectionId) {
    const idx = State.sections.findIndex((s) => s.id === sectionId);
    if (idx <= 0) return;
    await EventHandlers._swapSectionPos(
      State.sections[idx],
      State.sections[idx - 1],
    );
  },

  async moveSectionDown(sectionId) {
    const idx = State.sections.findIndex((s) => s.id === sectionId);
    if (idx >= State.sections.length - 1) return;
    await EventHandlers._swapSectionPos(
      State.sections[idx],
      State.sections[idx + 1],
    );
  },

  async _swapSectionPos(a, b) {
    [a.position, b.position] = [b.position, a.position];
    await Promise.all([State.db.updateSection(a), State.db.updateSection(b)]);
    State.sections = sortByPosition(State.sections);
    Renderer.renderDashboard();
    Renderer.renderSettingsView();
  },

  // ドラッグ＆ドロップによるセクション並び替え
  async _onReorderSections(evt) {
    const items = evt.from.querySelectorAll(".settings-row");
    const updates = [];
    items.forEach((row, i) => {
      const sectionId = Number(row.dataset.sectionId);
      const section = State.sections.find((s) => s.id === sectionId);
      if (section && section.position !== i) {
        section.position = i;
        updates.push(State.db.updateSection(section));
      }
    });
    if (updates.length) {
      await Promise.all(updates);
      State.sections = sortByPosition(State.sections);
      Renderer.renderDashboard();
    }
  },

  async saveSectionMeta(sectionId) {
    const section = State.sections.find((s) => s.id === sectionId);
    if (!section) return;
    const icon = document.getElementById("edit-section-icon")?.value.trim();
    const title = document.getElementById("edit-section-title")?.value.trim();
    if (!title) {
      alert("タイトルを入力してください");
      return;
    }
    section.icon = icon || section.icon;
    section.title = title;
    section.width =
      document.getElementById("edit-section-width")?.value || "auto";
    section.newRow =
      document.getElementById("edit-section-new-row")?.checked || false;
    if (section.type === "list") {
      const limitVal = parseInt(
        document.getElementById("edit-section-filter-limit")?.value,
        10,
      );
      section.filter_limit = !isNaN(limitVal) && limitVal >= 0 ? limitVal : 5;
    }
    if (section.type === "table") {
      const pageSizeVal = parseInt(
        document.getElementById("edit-section-page-size")?.value,
        10,
      );
      section.page_size =
        !isNaN(pageSizeVal) && pageSizeVal >= 0 ? pageSizeVal : 0;
      // 件数変更時はページを先頭にリセット
      State.tablePageState[section.id] = 0;
    }
    if (section.type === "command_builder") {
      const limitVal = parseInt(
        document.getElementById("edit-section-history-limit")?.value,
        10,
      );
      section.history_limit = !isNaN(limitVal) && limitVal >= 0 ? limitVal : 10;
      // 上限が変わった場合に既存履歴をトリム
      const historyKey = CMD_HISTORY_PREFIX + section.id;
      if (section.history_limit === 0) {
        localStorage.removeItem(historyKey);
      } else {
        const urls = loadJsonFromStorage(historyKey) || [];
        if (urls.length > section.history_limit) {
          localStorage.setItem(
            historyKey,
            JSON.stringify(urls.slice(0, section.history_limit)),
          );
        }
      }
    }
    if (section.type === "iframe") {
      section.url = document.getElementById("edit-section-url")?.value.trim() || "";
      const heightVal = parseInt(document.getElementById("edit-section-iframe-height")?.value, 10);
      section.iframe_height = !isNaN(heightVal) && heightVal >= 100 ? heightVal : 400;
    }
    if (section.type === "countdown") {
      section.countdown_mode = document.getElementById("edit-section-countdown-mode")?.value || "calendar";
    }
    await State.db.updateSection(section);
    document.getElementById("settings-title").textContent =
      `${section.icon || ""} ${section.title}`;
    Renderer.renderDashboard();
    // アクティビティログに記録
    ActivityLogger.log('dashboard', 'update', 'section', sectionId, `セクション「${section.title}」を更新`);
    showSuccess("保存しました");
  },

  // ── コマンドビルダーボタン管理 ────────────────

  toggleAddCmdButtonForm(show) {
    const form = document.getElementById("cmd-button-add-form");
    if (form) form.hidden = !show;
  },

  async saveAddCmdButton(sectionId) {
    const section = State.sections.find((s) => s.id === sectionId);
    if (!section) return;
    const label = document.getElementById("new-cmd-btn-label")?.value.trim();
    const template =
      document.getElementById("new-cmd-btn-template")?.value.trim() || "";
    const action_mode =
      document.getElementById("new-cmd-btn-mode")?.value || "copy";
    if (!label) {
      alert("ボタン名を入力してください");
      return;
    }
    const buttons = section.cmd_buttons ? [...section.cmd_buttons] : [];
    buttons.push({ id: `btn_${Date.now()}`, label, template, action_mode });
    section.cmd_buttons = buttons;
    await State.db.updateSection(section);
    Renderer.renderDashboard();
    Renderer.renderSettingsView();
  },

  editCmdButton(sectionId, btnId) {
    const section = State.sections.find((s) => s.id === sectionId);
    const btn = (section?.cmd_buttons || []).find(
      (b) => String(b.id) === btnId,
    );
    if (!btn) return;
    const row = document.getElementById(`cmd-btn-row-${btnId}`);
    if (!row) return;
    // 既に開いている場合は閉じる
    if (row.dataset.editing === "true") {
      row.dataset.editing = "";
      row.querySelector(".cmd-btn-edit-form")?.remove();
      return;
    }
    row.dataset.editing = "true";
    const panel = document.createElement("div");
    panel.className = "settings-form-panel cmd-btn-edit-form";
    panel.innerHTML = `
      <div class="settings-form-row">
        <label class="settings-label">ボタン名</label>
        <input class="settings-input" id="edit-cmd-btn-label-${btnId}" type="text" value="${escapeAttr(btn.label || "")}" />
      </div>
      <div class="settings-form-row">
        <label class="settings-label">アクション</label>
        <select class="cs-target kn-select--sm" id="edit-cmd-btn-mode-${btnId}">
          <option value="copy" ${btn.action_mode !== "open" ? "selected" : ""}>コピー</option>
          <option value="open" ${btn.action_mode === "open" ? "selected" : ""}>リンク</option>
        </select>
      </div>
      <div class="settings-form-row">
        <label class="settings-label">テンプレート</label>
        <input class="settings-input" id="edit-cmd-btn-template-${btnId}" type="text" value="${escapeAttr(btn.template || "")}" />
      </div>
      <div class="settings-form-row settings-form-row--inline">
        <button class="settings-btn settings-btn--primary" data-action="save-edit-cmd-button" data-section-id="${sectionId}" data-btn-id="${escapeAttr(btnId)}">保存</button>
        <button class="settings-btn" data-action="cancel-edit-cmd-button" data-btn-id="${escapeAttr(btnId)}">キャンセル</button>
      </div>
    `;
    row.appendChild(panel);
    CustomSelect.replaceAll(panel);
  },

  async saveEditCmdButton(sectionId, btnId) {
    const section = State.sections.find((s) => s.id === sectionId);
    const btn = (section?.cmd_buttons || []).find(
      (b) => String(b.id) === btnId,
    );
    if (!btn) return;
    btn.label =
      document.getElementById(`edit-cmd-btn-label-${btnId}`)?.value.trim() ||
      btn.label;
    btn.template =
      document.getElementById(`edit-cmd-btn-template-${btnId}`)?.value.trim() ||
      "";
    btn.action_mode =
      document.getElementById(`edit-cmd-btn-mode-${btnId}`)?.value || "copy";
    await State.db.updateSection(section);
    Renderer.renderDashboard();
    Renderer.renderSettingsView();
  },

  cancelEditCmdButton(btnId) {
    const row = document.getElementById(`cmd-btn-row-${btnId}`);
    if (!row) return;
    row.dataset.editing = "";
    row.querySelector(".cmd-btn-edit-form")?.remove();
  },

  async deleteCmdButton(sectionId, btnId) {
    if (!confirm("このボタンを削除しますか？")) return;
    const section = State.sections.find((s) => s.id === sectionId);
    if (!section) return;
    section.cmd_buttons = (section.cmd_buttons || []).filter(
      (b) => String(b.id) !== btnId,
    );
    await State.db.updateSection(section);
    Renderer.renderDashboard();
    Renderer.renderSettingsView();
  },

  async moveCmdButtonUp(sectionId, btnId) {
    const section = State.sections.find((s) => s.id === sectionId);
    if (!section) return;
    const btns = section.cmd_buttons || [];
    const idx = btns.findIndex((b) => String(b.id) === btnId);
    if (idx <= 0) return;
    [btns[idx - 1], btns[idx]] = [btns[idx], btns[idx - 1]];
    await State.db.updateSection(section);
    Renderer.renderDashboard();
    Renderer.renderSettingsView();
  },

  async moveCmdButtonDown(sectionId, btnId) {
    const section = State.sections.find((s) => s.id === sectionId);
    if (!section) return;
    const btns = section.cmd_buttons || [];
    const idx = btns.findIndex((b) => String(b.id) === btnId);
    if (idx >= btns.length - 1) return;
    [btns[idx], btns[idx + 1]] = [btns[idx + 1], btns[idx]];
    await State.db.updateSection(section);
    Renderer.renderDashboard();
    Renderer.renderSettingsView();
  },

  // ── 列操作（テーブル） ────────────────

  toggleAddColumnForm(show) {
    const form = document.getElementById("add-column-form");
    if (form) form.hidden = !show;
  },

  async saveAddColumn(sectionId) {
    const section = State.sections.find((s) => s.id === sectionId);
    if (!section) return;
    const label = document.getElementById("new-col-label")?.value.trim();
    const type = document.getElementById("new-col-type")?.value || "text";
    if (!label) {
      alert("列名を入力してください");
      return;
    }

    const cols = section.columns || [];
    cols.push({ id: `col_${Date.now()}`, label, type });
    section.columns = cols;
    await State.db.updateSection(section);
    Renderer.renderDashboard();
    Renderer.renderSettingsView();
  },

  editColumn(sectionId, colId) {
    const section = State.sections.find((s) => s.id === sectionId);
    const col = (section?.columns || []).find((c) => c.id === colId);
    if (!col) return;
    const row = document.getElementById(`col-row-${colId}`);
    if (!row) return;
    row.innerHTML = `
      <input class="settings-input" id="edit-col-label" type="text" value="${escapeAttr(col.label)}" />
      <select class="cs-target kn-select--sm" id="edit-col-type">
        <option value="text" ${col.type === "text" ? "selected" : ""}>テキスト</option>
        <option value="copy" ${col.type === "copy" ? "selected" : ""}>コピー</option>
        <option value="link" ${col.type === "link" ? "selected" : ""}>リンク</option>
      </select>
      <div class="settings-row__actions">
        <button class="settings-btn settings-btn--primary" data-action="save-edit-column" data-section-id="${sectionId}" data-col-id="${colId}">保存</button>
        <button class="settings-btn" data-action="cancel-edit-column">キャンセル</button>
      </div>`;
    // cs-target を CustomSelect に置き換え
    CustomSelect.replaceAll(row);
  },

  async saveEditColumn(sectionId, colId) {
    const section = State.sections.find((s) => s.id === sectionId);
    const col = (section?.columns || []).find((c) => c.id === colId);
    if (!col) return;
    const label = document.getElementById("edit-col-label")?.value.trim();
    if (!label) {
      alert("列名を入力してください");
      return;
    }
    col.label = label;
    col.type = document.getElementById("edit-col-type")?.value || "text";
    await State.db.updateSection(section);
    Renderer.renderDashboard();
    Renderer.renderSettingsView();
  },

  async deleteColumn(sectionId, colId) {
    if (!confirm("この列を削除しますか？")) return;
    const section = State.sections.find((s) => s.id === sectionId);
    if (!section) return;
    section.columns = (section.columns || []).filter((c) => c.id !== colId);
    await State.db.updateSection(section);
    Renderer.renderDashboard();
    Renderer.renderSettingsView();
  },

  async moveColumnUp(sectionId, colId) {
    const section = State.sections.find((s) => s.id === sectionId);
    if (!section) return;
    const cols = section.columns || [];
    const idx = cols.findIndex((c) => c.id === colId);
    if (idx <= 0) return;
    [cols[idx - 1], cols[idx]] = [cols[idx], cols[idx - 1]];
    await State.db.updateSection(section);
    Renderer.renderDashboard();
    Renderer.renderSettingsView();
  },

  async moveColumnDown(sectionId, colId) {
    const section = State.sections.find((s) => s.id === sectionId);
    if (!section) return;
    const cols = section.columns || [];
    const idx = cols.findIndex((c) => c.id === colId);
    if (idx >= cols.length - 1) return;
    [cols[idx], cols[idx + 1]] = [cols[idx + 1], cols[idx]];
    await State.db.updateSection(section);
    Renderer.renderDashboard();
    Renderer.renderSettingsView();
  },

  // ── アイテム操作 ──────────────────────

  toggleAddItemForm(show) {
    const form = document.getElementById("add-item-form");
    if (form) form.hidden = !show;
  },

  async saveAddItem(sectionId) {
    const section = State.sections.find((s) => s.id === sectionId);
    if (!section) return;
    const items = State.itemsMap[sectionId] || [];
    const maxPos =
      items.length > 0 ? Math.max(...items.map((i) => i.position)) + 1 : 0;
    const data = { section_id: sectionId, position: maxPos };

    if (section.type === "countdown") {
      data.label = document.getElementById("item-label")?.value.trim() || "";
      data.value = document.getElementById("item-value")?.value.trim() || "";
      data.item_type = "milestone";
      data.hint = null;
      data.emoji = null;
      data.row_data = null;
    } else if (section.type === "checklist") {
      data.item_type = "item";
      data.label = document.getElementById("item-label")?.value.trim() || "";
      data.hint = null;
      data.value = null;
      data.emoji = null;
      data.row_data = null;
    } else if (section.type === "grid") {
      data.item_type = document.getElementById("item-type")?.value || "link";
      data.emoji = document.getElementById("item-emoji")?.value.trim() || "";
      data.label = document.getElementById("item-label")?.value.trim() || "";
      // テンプレートの場合は textarea から取得
      if (data.item_type === "template") {
        data.value =
          document.getElementById("item-template-value")?.value.trim() || "";
      } else {
        data.value = document.getElementById("item-value")?.value.trim() || "";
      }
      data.new_row = document.getElementById("item-new-row")?.checked || false;
      data.hint = null;
      data.row_data = null;
    } else if (section.type === "table") {
      data.item_type = "row";
      data.label = null;
      data.hint = null;
      data.value = null;
      data.emoji = null;
      const row_data = {};
      (section.columns || []).forEach((col) => {
        row_data[col.id] =
          document.getElementById(`item-col-${col.id}`)?.value.trim() || "";
      });
      data.row_data = row_data;
    } else {
      data.item_type = document.getElementById("item-type")?.value || "copy";
      data.label = document.getElementById("item-label")?.value.trim() || "";
      data.hint = document.getElementById("item-hint")?.value.trim() || null;
      // テンプレートの場合は textarea から取得
      if (data.item_type === "template") {
        data.value = document.getElementById("item-template-value")?.value.trim() || "";
      } else {
        data.value = document.getElementById("item-value")?.value.trim() || "";
      }
      data.emoji = null;
      data.row_data = null;
    }

    const newId = await State.db.addItem(data);
    data.id = newId;
    if (!State.itemsMap[sectionId]) State.itemsMap[sectionId] = [];
    State.itemsMap[sectionId].push(data);
    // アクティビティログに記録
    const _secTitle = section?.title || '';
    ActivityLogger.log('dashboard', 'create', 'item', newId, `「${_secTitle}」にアイテムを追加`);
    Renderer.renderDashboard();
    Renderer.renderSettingsView();
  },

  editItem(itemId, sectionId) {
    const section = State.sections.find((s) => s.id === sectionId);
    const item = (State.itemsMap[sectionId] || []).find((i) => i.id === itemId);
    if (!section || !item) return;
    const row = document.getElementById(`item-row-${itemId}`);
    if (!row) return;
    // フォーム表示のため flex を解除
    row.className = "settings-item-edit-form";
    row.innerHTML = Renderer.buildItemFields(item, section);
    // cs-target を CustomSelect に置き換え
    CustomSelect.replaceAll(row);
  },

  async saveEditItem(itemId, sectionId) {
    const section = State.sections.find((s) => s.id === sectionId);
    const item = (State.itemsMap[sectionId] || []).find((i) => i.id === itemId);
    if (!section || !item) return;

    if (section.type === "countdown") {
      item.label = document.getElementById("item-label")?.value.trim() || "";
      item.value = document.getElementById("item-value")?.value.trim() || "";
    } else if (section.type === "checklist") {
      item.label = document.getElementById("item-label")?.value.trim() || "";
    } else if (section.type === "grid") {
      item.item_type =
        document.getElementById("item-type")?.value || item.item_type || "link";
      item.emoji = document.getElementById("item-emoji")?.value.trim() || "";
      item.label = document.getElementById("item-label")?.value.trim() || "";
      // テンプレートの場合は textarea から取得
      if (item.item_type === "template") {
        item.value =
          document.getElementById("item-template-value")?.value.trim() || "";
      } else {
        item.value = document.getElementById("item-value")?.value.trim() || "";
      }
      item.new_row = document.getElementById("item-new-row")?.checked || false;
    } else if (section.type === "table") {
      const row_data = {};
      (section.columns || []).forEach((col) => {
        row_data[col.id] =
          document.getElementById(`item-col-${col.id}`)?.value.trim() || "";
      });
      item.row_data = row_data;
    } else {
      item.item_type =
        document.getElementById("item-type")?.value || item.item_type;
      item.label = document.getElementById("item-label")?.value.trim() || "";
      item.hint = document.getElementById("item-hint")?.value.trim() || null;
      // テンプレートの場合は textarea から取得
      if (item.item_type === "template") {
        item.value = document.getElementById("item-template-value")?.value.trim() || "";
      } else {
        item.value = document.getElementById("item-value")?.value.trim() || "";
      }
    }
    await State.db.updateItem(item);
    // アクティビティログに記録
    const _secForEdit = State.sections.find(s => s.id === sectionId);
    ActivityLogger.log('dashboard', 'update', 'item', itemId, `「${_secForEdit?.title || ''}」のアイテムを更新`);
    Renderer.renderDashboard();
    Renderer.renderSettingsView();
  },

  cancelEditItem(itemId, sectionId) {
    Renderer.renderSettingsView();
  },

  // ── アイテム管理モーダル ────────────────────────────

  /** アイテム管理モーダルを開く */
  openItemManager(sectionId) {
    const section = State.sections.find((s) => s.id === sectionId);
    if (!section) return;
    State.itemMgr.sectionId = sectionId;
    State.itemMgr.editingId = null;
    State.itemMgr.formTab = "add";

    let modal = document.getElementById("item-manager-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "item-manager-modal";
      modal.className = "item-mgr";
      modal.innerHTML =
        '<div class="item-mgr__backdrop" data-action="close-item-mgr"></div>' +
        '<div class="item-mgr__dialog" id="item-mgr-dialog"></div>';
      document.body.appendChild(modal);
    }
    modal.removeAttribute("hidden");
    document.body.style.overflow = "hidden";
    this._refreshItemManager();
  },

  /** アイテム管理モーダルを閉じる */
  closeItemManager() {
    const modal = document.getElementById("item-manager-modal");
    if (modal) modal.hidden = true;
    document.body.style.overflow = "";
    State.itemMgr.sectionId = null;
    State.itemMgr.editingId = null;
  },

  /** アイテム管理モーダルの内容を再描画 */
  _refreshItemManager() {
    const sectionId = State.itemMgr.sectionId;
    const section = State.sections.find((s) => s.id === sectionId);
    if (!section) return;
    const items = State.itemsMap[sectionId] || [];
    const dialog = document.getElementById("item-mgr-dialog");
    if (!dialog) return;
    dialog.innerHTML = Renderer.buildItemManagerHTML(section, items);
    CustomSelect.replaceAll(dialog);
    // コピー登録テキストエリアで Tab キーをタブ文字として入力できるようにする
    const bulkTextarea = dialog.querySelector("#bulk-import-text");
    if (bulkTextarea) {
      bulkTextarea.addEventListener("keydown", (e) => {
        if (e.key === "Tab") {
          e.preventDefault();
          const start = bulkTextarea.selectionStart;
          const end = bulkTextarea.selectionEnd;
          bulkTextarea.value =
            bulkTextarea.value.substring(0, start) +
            "\t" +
            bulkTextarea.value.substring(end);
          bulkTextarea.selectionStart = bulkTextarea.selectionEnd = start + 1;
        }
      });
    }
  },

  /** アイテム管理モーダルのタブ切替 */
  switchItemMgrTab(tab) {
    State.itemMgr.formTab = tab;
    if (tab !== "add") State.itemMgr.editingId = null;
    this._refreshItemManager();
  },

  /** アイテム管理モーダルで編集モードに入る */
  editItemInManager(itemId, sectionId) {
    State.itemMgr.editingId = itemId;
    State.itemMgr.formTab = "add";
    this._refreshItemManager();
  },

  /** アイテム管理モーダルで編集をキャンセル */
  cancelEditItemInManager(sectionId) {
    State.itemMgr.editingId = null;
    this._refreshItemManager();
  },

  /** アイテム管理モーダルでアイテムを追加 */
  async saveAddItemInManager(sectionId) {
    const section = State.sections.find((s) => s.id === sectionId);
    if (!section) return;
    const items = State.itemsMap[sectionId] || [];
    const maxPos =
      items.length > 0 ? Math.max(...items.map((i) => i.position)) + 1 : 0;
    const data = { section_id: sectionId, position: maxPos };

    if (section.type === "countdown") {
      data.item_type = "milestone";
      data.label = document.getElementById("mgr-item-label")?.value.trim() || "";
      data.value = document.getElementById("mgr-item-value")?.value.trim() || "";
      data.hint = null;
      data.emoji = null;
      data.row_data = null;
    } else if (section.type === "checklist") {
      data.item_type = "item";
      data.label =
        document.getElementById("mgr-item-label")?.value.trim() || "";
      data.hint = null;
      data.value = null;
      data.emoji = null;
      data.row_data = null;
    } else if (section.type === "grid") {
      data.item_type =
        document.getElementById("mgr-item-type")?.value || "link";
      data.emoji =
        document.getElementById("mgr-item-emoji")?.value.trim() || "";
      data.label =
        document.getElementById("mgr-item-label")?.value.trim() || "";
      data.value =
        data.item_type === "template"
          ? document
              .getElementById("mgr-item-template-value")
              ?.value.trim() || ""
          : document.getElementById("mgr-item-value")?.value.trim() || "";
      data.new_row =
        document.getElementById("mgr-item-new-row")?.checked || false;
      data.hint = null;
      data.row_data = null;
    } else if (section.type === "table") {
      data.item_type = "row";
      data.label = null;
      data.hint = null;
      data.value = null;
      data.emoji = null;
      const row_data = {};
      (section.columns || []).forEach((col) => {
        row_data[col.id] =
          document
            .getElementById(`mgr-item-col-${col.id}`)
            ?.value.trim() || "";
      });
      data.row_data = row_data;
    } else {
      data.item_type =
        document.getElementById("mgr-item-type")?.value || "copy";
      data.label =
        document.getElementById("mgr-item-label")?.value.trim() || "";
      data.hint =
        document.getElementById("mgr-item-hint")?.value.trim() || null;
      data.value =
        data.item_type === "template"
          ? document
              .getElementById("mgr-item-template-value")
              ?.value.trim() || ""
          : document.getElementById("mgr-item-value")?.value.trim() || "";
      data.emoji = null;
      data.row_data = null;
    }

    const newId = await State.db.addItem(data);
    data.id = newId;
    if (!State.itemsMap[sectionId]) State.itemsMap[sectionId] = [];
    State.itemsMap[sectionId].push(data);
    // アクティビティログに記録
    ActivityLogger.log('dashboard', 'create', 'item', newId, `「${section?.title || ''}」にアイテムを追加`);
    Renderer.renderDashboard();
    this._refreshItemManager();
    if (
      State.settings.open &&
      State.settings.view === "edit-section" &&
      State.settings.editingSectionId === sectionId
    ) {
      Renderer.renderSettingsView();
    }
  },

  /** アイテム管理モーダルでアイテムを保存（編集） */
  async saveEditItemInManager(itemId, sectionId) {
    const section = State.sections.find((s) => s.id === sectionId);
    const item = (State.itemsMap[sectionId] || []).find(
      (i) => i.id === itemId,
    );
    if (!section || !item) return;

    if (section.type === "countdown") {
      item.label = document.getElementById("mgr-item-label")?.value.trim() || "";
      item.value = document.getElementById("mgr-item-value")?.value.trim() || "";
    } else if (section.type === "checklist") {
      item.label =
        document.getElementById("mgr-item-label")?.value.trim() || "";
    } else if (section.type === "grid") {
      item.item_type =
        document.getElementById("mgr-item-type")?.value ||
        item.item_type ||
        "link";
      item.emoji =
        document.getElementById("mgr-item-emoji")?.value.trim() || "";
      item.label =
        document.getElementById("mgr-item-label")?.value.trim() || "";
      item.value =
        item.item_type === "template"
          ? document
              .getElementById("mgr-item-template-value")
              ?.value.trim() || ""
          : document.getElementById("mgr-item-value")?.value.trim() || "";
      item.new_row =
        document.getElementById("mgr-item-new-row")?.checked || false;
    } else if (section.type === "table") {
      const row_data = {};
      (section.columns || []).forEach((col) => {
        row_data[col.id] =
          document
            .getElementById(`mgr-item-col-${col.id}`)
            ?.value.trim() || "";
      });
      item.row_data = row_data;
    } else {
      item.item_type =
        document.getElementById("mgr-item-type")?.value || item.item_type;
      item.label =
        document.getElementById("mgr-item-label")?.value.trim() || "";
      item.hint =
        document.getElementById("mgr-item-hint")?.value.trim() || null;
      item.value =
        item.item_type === "template"
          ? document
              .getElementById("mgr-item-template-value")
              ?.value.trim() || ""
          : document.getElementById("mgr-item-value")?.value.trim() || "";
    }

    await State.db.updateItem(item);
    // アクティビティログに記録
    ActivityLogger.log('dashboard', 'update', 'item', itemId, `「${section?.title || ''}」のアイテムを更新`);
    State.itemMgr.editingId = null;
    Renderer.renderDashboard();
    this._refreshItemManager();
    if (
      State.settings.open &&
      State.settings.view === "edit-section" &&
      State.settings.editingSectionId === sectionId
    ) {
      Renderer.renderSettingsView();
    }
  },

  /** アイテム管理モーダルでアイテムを削除 */
  async deleteItemInManager(itemId, sectionId) {
    if (!confirm("このアイテムを削除しますか？")) return;
    // アクティビティログに記録（削除前に情報保持）
    const _secForMgrDel = State.sections.find(s => s.id === sectionId);
    ActivityLogger.log('dashboard', 'delete', 'item', itemId, `「${_secForMgrDel?.title || ''}」のアイテムを削除`);
    await State.db.deleteItem(itemId);
    State.itemsMap[sectionId] = (State.itemsMap[sectionId] || []).filter(
      (i) => i.id !== itemId,
    );
    if (State.itemMgr.editingId === itemId) State.itemMgr.editingId = null;
    Renderer.renderDashboard();
    this._refreshItemManager();
    if (
      State.settings.open &&
      State.settings.view === "edit-section" &&
      State.settings.editingSectionId === sectionId
    ) {
      Renderer.renderSettingsView();
    }
  },

  /** アイテム管理モーダルでアイテムを上に移動 */
  async moveItemUpInManager(itemId, sectionId) {
    const items = State.itemsMap[sectionId] || [];
    const idx = items.findIndex((i) => i.id === itemId);
    if (idx <= 0) return;
    await EventHandlers._swapItemPosInMgr(
      items[idx],
      items[idx - 1],
      sectionId,
    );
  },

  /** アイテム管理モーダルでアイテムを下に移動 */
  async moveItemDownInManager(itemId, sectionId) {
    const items = State.itemsMap[sectionId] || [];
    const idx = items.findIndex((i) => i.id === itemId);
    if (idx >= items.length - 1) return;
    await EventHandlers._swapItemPosInMgr(
      items[idx],
      items[idx + 1],
      sectionId,
    );
  },

  async _swapItemPosInMgr(a, b, sectionId) {
    [a.position, b.position] = [b.position, a.position];
    await Promise.all([State.db.updateItem(a), State.db.updateItem(b)]);
    State.itemsMap[sectionId] = sortByPosition(State.itemsMap[sectionId]);
    Renderer.renderDashboard();
    this._refreshItemManager();
    if (
      State.settings.open &&
      State.settings.view === "edit-section" &&
      State.settings.editingSectionId === sectionId
    ) {
      Renderer.renderSettingsView();
    }
  },

  /** コピー登録（一括インポート）処理 */
  async saveBulkItems(sectionId) {
    const section = State.sections.find((s) => s.id === sectionId);
    if (!section) return;
    const text = document.getElementById("bulk-import-text")?.value || "";
    const lines = text
      .split("\n")
      .filter((l) => l.trim() && !l.trim().startsWith("#"));

    if (lines.length === 0) {
      showError("データが入力されていません");
      return;
    }

    const items = State.itemsMap[sectionId] || [];
    let maxPos =
      items.length > 0 ? Math.max(...items.map((i) => i.position)) + 1 : 0;
    const newItems = [];

    for (const line of lines) {
      const cols = line.split("\t");
      const data = { section_id: sectionId, position: maxPos++ };

      if (section.type === "countdown") {
        data.item_type = "milestone";
        data.label = cols[0].trim();
        data.value = (cols[1] || "").trim();
        data.hint = null;
        data.emoji = null;
        data.row_data = null;
      } else if (section.type === "checklist") {
        data.item_type = "item";
        data.label = cols[0].trim();
        data.hint = null;
        data.value = null;
        data.emoji = null;
        data.row_data = null;
      } else if (section.type === "table") {
        data.item_type = "row";
        data.label = null;
        data.hint = null;
        data.value = null;
        data.emoji = null;
        const row_data = {};
        (section.columns || []).forEach((col, i) => {
          row_data[col.id] = (cols[i] || "").trim();
        });
        data.row_data = row_data;
      } else if (section.type === "grid") {
        let emoji = "",
          label = "",
          value = "";
        if (cols.length >= 3) {
          emoji = cols[0].trim();
          label = cols[1].trim();
          value = cols[2].trim();
        } else if (cols.length === 2) {
          label = cols[0].trim();
          value = cols[1].trim();
        } else {
          label = cols[0].trim();
        }
        data.item_type = value && isValidUrl(value) ? "link" : "copy";
        data.emoji = emoji;
        data.label = label;
        data.value = value;
        data.new_row = false;
        data.hint = null;
        data.row_data = null;
      } else {
        // list
        let label = "",
          hint = null,
          value = "";
        if (cols.length >= 3) {
          label = cols[0].trim();
          hint = cols[1].trim() || null;
          value = cols[2].trim();
        } else if (cols.length === 2) {
          label = cols[0].trim();
          value = cols[1].trim();
        } else {
          label = cols[0].trim();
        }
        data.item_type = value && isValidUrl(value) ? "link" : "copy";
        data.label = label;
        data.hint = hint;
        data.value = value;
        data.emoji = null;
        data.row_data = null;
      }

      const newId = await State.db.addItem(data);
      data.id = newId;
      newItems.push(data);
    }

    if (!State.itemsMap[sectionId]) State.itemsMap[sectionId] = [];
    State.itemsMap[sectionId].push(...newItems);

    showSuccess(`${newItems.length}件を追加しました`);
    Renderer.renderDashboard();
    State.itemMgr.formTab = "add";
    this._refreshItemManager();
    if (
      State.settings.open &&
      State.settings.view === "edit-section" &&
      State.settings.editingSectionId === sectionId
    ) {
      Renderer.renderSettingsView();
    }
  },

  /** アイテム管理モーダル内のアイテムタイプ変更（link/copy/template の切り替え） */
  onMgrItemTypeChange() {
    const type = document.getElementById("mgr-item-type")?.value;
    const valueRow = document.getElementById("mgr-item-value-row");
    const templateRow = document.getElementById("mgr-template-value-row");
    if (!valueRow || !templateRow) return;
    const isTemplate = type === "template";
    valueRow.hidden = isTemplate;
    templateRow.hidden = !isTemplate;
  },

  async deleteItem(itemId, sectionId) {
    if (!confirm("このアイテムを削除しますか？")) return;
    // アクティビティログに記録（削除前に情報保持）
    const _secForDel = State.sections.find(s => s.id === sectionId);
    ActivityLogger.log('dashboard', 'delete', 'item', itemId, `「${_secForDel?.title || ''}」のアイテムを削除`);
    await State.db.deleteItem(itemId);
    State.itemsMap[sectionId] = (State.itemsMap[sectionId] || []).filter(
      (i) => i.id !== itemId,
    );
    Renderer.renderDashboard();
    Renderer.renderSettingsView();
  },

  async moveItemUp(itemId, sectionId) {
    const items = State.itemsMap[sectionId] || [];
    const idx = items.findIndex((i) => i.id === itemId);
    if (idx <= 0) return;
    await EventHandlers._swapItemPos(items[idx], items[idx - 1], sectionId);
  },

  async moveItemDown(itemId, sectionId) {
    const items = State.itemsMap[sectionId] || [];
    const idx = items.findIndex((i) => i.id === itemId);
    if (idx >= items.length - 1) return;
    await EventHandlers._swapItemPos(items[idx], items[idx + 1], sectionId);
  },

  async _swapItemPos(a, b, sectionId) {
    [a.position, b.position] = [b.position, a.position];
    await Promise.all([State.db.updateItem(a), State.db.updateItem(b)]);
    State.itemsMap[sectionId] = sortByPosition(State.itemsMap[sectionId]);
    Renderer.renderDashboard();
    Renderer.renderSettingsView();
  },

  // ── テーブル列の表示/非表示 ────────────

  toggleTableColMenu(sectionId) {
    const menu = document.getElementById(`table-col-menu-${sectionId}`);
    if (!menu) return;
    const wasHidden = menu.hidden;
    // 全メニューを閉じてから対象を開閉
    document.querySelectorAll(".data-table-col-menu").forEach((m) => {
      m.hidden = true;
    });
    if (wasHidden) {
      const btn = document.querySelector(
        `[data-action="toggle-table-col-menu"][data-section-id="${sectionId}"]`,
      );
      if (btn) {
        const rect = btn.getBoundingClientRect();
        menu.style.top = `${rect.bottom + 4}px`;
        menu.style.right = `${window.innerWidth - rect.right}px`;
        menu.style.left = "auto";
      }
      // body に移動して card の overflow:hidden + transform の影響を回避
      document.body.appendChild(menu);
      menu.hidden = false;
    }
  },

  onTableColVisibilityChange(cb) {
    const colId = cb.dataset.colId;
    const sectionId = Number(cb.dataset.sectionId);
    const isVisible = cb.checked;

    // カード内の対象列（th / td）を表示/非表示
    const card = document.querySelector(
      `.card[data-section-id="${sectionId}"]`,
    );
    if (card) {
      card.querySelectorAll(`[data-col-id="${colId}"]`).forEach((el) => {
        el.hidden = !isVisible;
      });
    }

    // localStorage に非表示列 ID 配列を保存
    const colMenu = cb.closest(".data-table-col-menu");
    if (!colMenu) return;
    const hiddenCols = Array.from(
      colMenu.querySelectorAll("input[type=checkbox]"),
    )
      .filter((c) => !c.checked)
      .map((c) => c.dataset.colId);
    localStorage.setItem(
      TABLE_COL_HIDDEN_PREFIX + sectionId,
      JSON.stringify(hiddenCols),
    );
  },

  // ── URL コマンド ──────────────────────

  onCopyCmd(btn) {
    const sectionId = Number(btn.dataset.sectionId);
    const template = btn.dataset.template || "";
    const actionMode = btn.dataset.actionMode || "copy";
    const input = document.getElementById(`url-input-${sectionId}`);
    const inputVal = input?.value.trim() || "";
    // まず {INPUT} を置換し、次に共通バインド変数を解決
    const result = resolveBindVars(template.replace("{INPUT}", inputVal));

    if (actionMode === "open") {
      if (result) Opener.open(result);
    } else {
      Clipboard.copy(result);
      showSuccess("コピーしました");
    }

    if (inputVal) {
      const section = State.sections.find((s) => s.id === sectionId);
      const limit = section?.history_limit ?? 10;
      if (limit > 0) {
        saveToStorageWithLimit(CMD_HISTORY_PREFIX + sectionId, inputVal, limit);
      }
      Renderer.renderCmdHistory(sectionId);
    }
  },

  // ── エクスポート/インポート ────────────

  exportData() {
    State.db
      .exportInstance()
      .then((data) => {
        const json = JSON.stringify(
          {
            type: "dashboard_export",
            version: 2,
            exportedAt: new Date().toISOString(),
            instanceId: _instanceId,
            sections: data.sections,
            items: data.items,
            presets: data.presets,
            bindConfig: data.bindConfig,
          },
          null,
          2,
        );
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const _now = new Date(),
          _p = (n) => String(n).padStart(2, "0");
        const _ts = `${_now.getFullYear()}${_p(_now.getMonth() + 1)}${_p(_now.getDate())}_${_p(_now.getHours())}${_p(_now.getMinutes())}${_p(_now.getSeconds())}`;
        a.download = `dashboard_${_instanceId || "default"}_${_ts}.json`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(console.error);
  },

  // ── 共通バインド変数モーダルを開く ─────────────────────────────

  openBindVarModal() {
    BindVarModal.open({
      title: '共通バインド変数設定',
      varNames: [...State.bindConfig.varNames],
      presets: State.presets.map(p => ({ ...p, values: { ...(p.values || {}) } })),
      showBarConfig: true,
      uiType: State.bindConfig.uiType || 'tabs',
      barLabel: State.bindConfig.barLabel || '',
      onAddVar: async (varName) => {
        State.bindConfig.varNames.push(varName);
        await State.db.setAppConfig('bind_config', State.bindConfig);
      },
      onRemoveVar: async (varName) => {
        State.bindConfig.varNames = State.bindConfig.varNames.filter(v => v !== varName);
        await State.db.setAppConfig('bind_config', State.bindConfig);
      },
      onSaveBarConfig: async ({ uiType, barLabel }) => {
        State.bindConfig = { ...State.bindConfig, uiType, barLabel };
        await State.db.setAppConfig('bind_config', State.bindConfig);
      },
      onAddPreset: async (name) => {
        const maxPos = State.presets.length > 0
          ? Math.max(...State.presets.map(p => p.position)) + 1 : 0;
        const data = { name, position: maxPos, values: {} };
        const newId = await State.db.addPreset(data);
        data.id = newId;
        data.instance_id = State.db.instanceId; // updatePreset 時に instance_id が消えないよう保持
        State.presets.push(data);
        return { ...data };
      },
      onUpdatePreset: async (preset) => {
        const existing = State.presets.find(p => p.id === preset.id);
        if (existing) { existing.name = preset.name; existing.values = preset.values; }
        await State.db.updatePreset(preset);
      },
      onDeletePreset: async (id) => {
        await State.db.deletePreset(id);
        State.presets = State.presets.filter(p => p.id !== id);
        if (State.activePresetId === id) {
          State.activePresetId = null;
          localStorage.removeItem(ACTIVE_PRESET_KEY);
        }
      },
      onMovePresetUp: async (presetId) => {
        const idx = State.presets.findIndex(p => p.id === presetId);
        if (idx <= 0) return;
        const a = State.presets[idx], b = State.presets[idx - 1];
        [a.position, b.position] = [b.position, a.position];
        await Promise.all([State.db.updatePreset(a), State.db.updatePreset(b)]);
        State.presets = sortByPosition(State.presets);
      },
      onMovePresetDown: async (presetId) => {
        const idx = State.presets.findIndex(p => p.id === presetId);
        if (idx >= State.presets.length - 1) return;
        const a = State.presets[idx], b = State.presets[idx + 1];
        [a.position, b.position] = [b.position, a.position];
        await Promise.all([State.db.updatePreset(a), State.db.updatePreset(b)]);
        State.presets = sortByPosition(State.presets);
      },
      onChange: () => {
        Renderer.renderEnvBar();
        Renderer.renderDashboard();
      },
    });
  },

  // ── テーブルバインド変数モーダルを開く ─────────────────────────

  openTableBindVarModal(sectionId) {
    const section = State.sections.find(s => s.id === sectionId);
    if (!section) return;
    BindVarModal.open({
      title: `${section.icon || ''} ${section.title} — バインド変数設定`,
      varNames: [...(section.table_bind_vars || [])],
      presets: (section.table_presets || []).map(p => ({ ...p, values: { ...(p.values || {}) } })),
      showBarConfig: true,
      uiType: section.table_vars_ui_type || 'tabs',
      barLabel: section.table_vars_bar_label || '',
      onAddVar: async (varName) => {
        if (!section.table_bind_vars) section.table_bind_vars = [];
        section.table_bind_vars.push(varName);
        await State.db.updateSection(section);
      },
      onRemoveVar: async (varName) => {
        section.table_bind_vars = (section.table_bind_vars || []).filter(v => v !== varName);
        await State.db.updateSection(section);
      },
      onSaveBarConfig: async ({ uiType, barLabel }) => {
        section.table_vars_ui_type = uiType;
        section.table_vars_bar_label = barLabel;
        await State.db.updateSection(section);
      },
      onAddPreset: async (name) => {
        if (!section.table_presets) section.table_presets = [];
        const newPreset = { id: Date.now(), name, values: {} };
        section.table_presets.push(newPreset);
        await State.db.updateSection(section);
        return { ...newPreset };
      },
      onUpdatePreset: async (preset) => {
        const p = (section.table_presets || []).find(p => p.id === preset.id);
        if (p) { p.name = preset.name; p.values = preset.values; }
        await State.db.updateSection(section);
      },
      onDeletePreset: async (id) => {
        section.table_presets = (section.table_presets || []).filter(p => p.id !== id);
        const activeKey = TABLE_ACTIVE_PRESET_PREFIX + sectionId;
        const activeId = loadJsonFromStorage(activeKey);
        if (activeId === id) localStorage.removeItem(activeKey);
        await State.db.updateSection(section);
      },
      onMovePresetUp: async (presetId) => {
        const presets = section.table_presets || [];
        const idx = presets.findIndex(p => p.id === presetId);
        if (idx <= 0) return;
        [presets[idx - 1], presets[idx]] = [presets[idx], presets[idx - 1]];
        await State.db.updateSection(section);
      },
      onMovePresetDown: async (presetId) => {
        const presets = section.table_presets || [];
        const idx = presets.findIndex(p => p.id === presetId);
        if (idx < 0 || idx >= presets.length - 1) return;
        [presets[idx], presets[idx + 1]] = [presets[idx + 1], presets[idx]];
        await State.db.updateSection(section);
      },
      onChange: () => {
        Renderer.renderDashboard();
      },
    });
  },

  // ── リストバインド変数モーダルを開く ─────────────────────────
  openListBindVarModal(sectionId) {
    const section = State.sections.find(s => s.id === sectionId);
    if (!section) return;
    BindVarModal.open({
      title: `${section.icon || ''} ${section.title} — バインド変数設定`,
      varNames: [...(section.list_bind_vars || [])],
      presets: (section.list_presets || []).map(p => ({ ...p, values: { ...(p.values || {}) } })),
      showBarConfig: true,
      uiType: section.list_vars_ui_type || 'tabs',
      barLabel: section.list_vars_bar_label || '',
      onAddVar: async (varName) => {
        if (!section.list_bind_vars) section.list_bind_vars = [];
        section.list_bind_vars.push(varName);
        await State.db.updateSection(section);
      },
      onRemoveVar: async (varName) => {
        section.list_bind_vars = (section.list_bind_vars || []).filter(v => v !== varName);
        await State.db.updateSection(section);
      },
      onSaveBarConfig: async ({ uiType, barLabel }) => {
        section.list_vars_ui_type = uiType;
        section.list_vars_bar_label = barLabel;
        await State.db.updateSection(section);
      },
      onAddPreset: async (name) => {
        if (!section.list_presets) section.list_presets = [];
        const newPreset = { id: Date.now(), name, values: {} };
        section.list_presets.push(newPreset);
        await State.db.updateSection(section);
        return { ...newPreset };
      },
      onUpdatePreset: async (preset) => {
        const p = (section.list_presets || []).find(p => p.id === preset.id);
        if (p) { p.name = preset.name; p.values = preset.values; }
        await State.db.updateSection(section);
      },
      onDeletePreset: async (id) => {
        section.list_presets = (section.list_presets || []).filter(p => p.id !== id);
        const activeKey = LIST_ACTIVE_PRESET_PREFIX + sectionId;
        const activeId = loadJsonFromStorage(activeKey);
        if (activeId === id) localStorage.removeItem(activeKey);
        await State.db.updateSection(section);
      },
      onMovePresetUp: async (presetId) => {
        const presets = section.list_presets || [];
        const idx = presets.findIndex(p => p.id === presetId);
        if (idx <= 0) return;
        [presets[idx - 1], presets[idx]] = [presets[idx], presets[idx - 1]];
        await State.db.updateSection(section);
      },
      onMovePresetDown: async (presetId) => {
        const presets = section.list_presets || [];
        const idx = presets.findIndex(p => p.id === presetId);
        if (idx < 0 || idx >= presets.length - 1) return;
        [presets[idx], presets[idx + 1]] = [presets[idx + 1], presets[idx]];
        await State.db.updateSection(section);
      },
      onChange: () => {
        Renderer.renderDashboard();
      },
    });
  },

  // ── グリッドバインド変数モーダルを開く ─────────────────────────
  openGridBindVarModal(sectionId) {
    const section = State.sections.find(s => s.id === sectionId);
    if (!section) return;
    BindVarModal.open({
      title: `${section.icon || ''} ${section.title} — バインド変数設定`,
      varNames: [...(section.grid_bind_vars || [])],
      presets: (section.grid_presets || []).map(p => ({ ...p, values: { ...(p.values || {}) } })),
      showBarConfig: true,
      uiType: section.grid_vars_ui_type || 'tabs',
      barLabel: section.grid_vars_bar_label || '',
      onAddVar: async (varName) => {
        if (!section.grid_bind_vars) section.grid_bind_vars = [];
        section.grid_bind_vars.push(varName);
        await State.db.updateSection(section);
      },
      onRemoveVar: async (varName) => {
        section.grid_bind_vars = (section.grid_bind_vars || []).filter(v => v !== varName);
        await State.db.updateSection(section);
      },
      onSaveBarConfig: async ({ uiType, barLabel }) => {
        section.grid_vars_ui_type = uiType;
        section.grid_vars_bar_label = barLabel;
        await State.db.updateSection(section);
      },
      onAddPreset: async (name) => {
        if (!section.grid_presets) section.grid_presets = [];
        const newPreset = { id: Date.now(), name, values: {} };
        section.grid_presets.push(newPreset);
        await State.db.updateSection(section);
        return { ...newPreset };
      },
      onUpdatePreset: async (preset) => {
        const p = (section.grid_presets || []).find(p => p.id === preset.id);
        if (p) { p.name = preset.name; p.values = preset.values; }
        await State.db.updateSection(section);
      },
      onDeletePreset: async (id) => {
        section.grid_presets = (section.grid_presets || []).filter(p => p.id !== id);
        const activeKey = GRID_ACTIVE_PRESET_PREFIX + sectionId;
        const activeId = loadJsonFromStorage(activeKey);
        if (activeId === id) localStorage.removeItem(activeKey);
        await State.db.updateSection(section);
      },
      onMovePresetUp: async (presetId) => {
        const presets = section.grid_presets || [];
        const idx = presets.findIndex(p => p.id === presetId);
        if (idx <= 0) return;
        [presets[idx - 1], presets[idx]] = [presets[idx], presets[idx - 1]];
        await State.db.updateSection(section);
      },
      onMovePresetDown: async (presetId) => {
        const presets = section.grid_presets || [];
        const idx = presets.findIndex(p => p.id === presetId);
        if (idx < 0 || idx >= presets.length - 1) return;
        [presets[idx], presets[idx + 1]] = [presets[idx + 1], presets[idx]];
        await State.db.updateSection(section);
      },
      onChange: () => {
        Renderer.renderDashboard();
      },
    });
  },

  switchPreset(presetId) {
    State.activePresetId = presetId || null;
    if (State.activePresetId) {
      localStorage.setItem(ACTIVE_PRESET_KEY, String(State.activePresetId));
    } else {
      localStorage.removeItem(ACTIVE_PRESET_KEY);
    }
    Renderer.renderEnvBar();
    Renderer.renderDashboard();
  },

  switchTablePreset(sectionId, presetId) {
    if (presetId) {
      saveToStorage(TABLE_ACTIVE_PRESET_PREFIX + sectionId, presetId);
    } else {
      localStorage.removeItem(TABLE_ACTIVE_PRESET_PREFIX + sectionId);
    }
    // テーブルカードのみ再レンダリング
    const section = State.sections.find((s) => s.id === sectionId);
    const items = State.itemsMap[sectionId] || [];
    const card = document.querySelector(`.card[data-section-id="${sectionId}"]`);
    if (card && section) {
      const bd = card.querySelector(".card__bd");
      if (bd) {
        bd.innerHTML = "";
        Renderer.buildTableSection(section, items, bd);
      }
    }
    // プリセットバーの is-active を更新（tabs の場合）
    const bar = card?.querySelector(".table-preset-bar");
    if (bar) {
      bar.querySelectorAll(".bind-tab").forEach((btn) => {
        btn.classList.toggle("is-active", Number(btn.dataset.presetId) === presetId);
      });
    }
  },

  switchListPreset(sectionId, presetId) {
    if (presetId) {
      saveToStorage(LIST_ACTIVE_PRESET_PREFIX + sectionId, presetId);
    } else {
      localStorage.removeItem(LIST_ACTIVE_PRESET_PREFIX + sectionId);
    }
    // リストカードのみ再レンダリング
    const section = State.sections.find((s) => s.id === sectionId);
    const items = State.itemsMap[sectionId] || [];
    const card = document.querySelector(`.card[data-section-id="${sectionId}"]`);
    if (card && section) {
      const bd = card.querySelector(".card__bd");
      if (bd) {
        bd.innerHTML = "";
        Renderer.buildListSection(section, items, bd);
      }
    }
  },

  switchGridPreset(sectionId, presetId) {
    if (presetId) {
      saveToStorage(GRID_ACTIVE_PRESET_PREFIX + sectionId, presetId);
    } else {
      localStorage.removeItem(GRID_ACTIVE_PRESET_PREFIX + sectionId);
    }
    // グリッドカードのみ再レンダリング
    const section = State.sections.find((s) => s.id === sectionId);
    const items = State.itemsMap[sectionId] || [];
    const card = document.querySelector(`.card[data-section-id="${sectionId}"]`);
    if (card && section) {
      const bd = card.querySelector(".card__bd");
      if (bd) {
        bd.innerHTML = "";
        Renderer.buildGridSection(section, items, bd);
      }
    }
  },

  // ── インポート ────────────────────────────

  importData() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      let data;
      try {
        data = JSON.parse(await file.text());
      } catch {
        alert("JSONの解析に失敗しました");
        return;
      }
      if (data.type !== "dashboard_export") {
        alert("ダッシュボードのエクスポートファイルではありません");
        return;
      }
      if (
        !confirm(
          `現在のデータを削除して「${file.name}」のデータで置き換えますか？`,
        )
      )
        return;
      try {
        await State.db.importInstance(
          {
            sections: data.sections,
            items: data.items,
            presets: data.presets,
            bindConfig: data.bindConfig,
          },
          true,
        );
        State.sections = await State.db.getAllSections();
        State.itemsMap = {};
        for (const s of State.sections) {
          State.itemsMap[s.id] = await State.db.getItemsBySection(s.id);
        }
        State.presets = await State.db.getAllPresets();
        const bindConfig = await State.db.getAppConfig("bind_config");
        if (bindConfig) State.bindConfig = bindConfig;
        State.activePresetId = null;
        localStorage.removeItem(ACTIVE_PRESET_KEY);
        Renderer.renderEnvBar();
        Renderer.renderDashboard();
        Renderer.renderSettingsView();
        showSuccess("インポートしました");
      } catch (err) {
        console.error(err);
        alert("インポートに失敗しました");
      }
    };
    input.click();
  },

  // ── 折りたたみ ────────────────────────────────────────

  toggleSectionCollapse(sectionId) {
    const card = document.querySelector(
      `.card[data-section-id="${sectionId}"]`,
    );
    const bd = card?.querySelector(".card__bd");
    if (!bd) return;
    const nowCollapsed = bd.hidden;
    bd.hidden = !nowCollapsed;
    localStorage.setItem(
      COLLAPSE_PREFIX + sectionId,
      !nowCollapsed ? "1" : "0",
    );
    const btn = card.querySelector(".card__collapse-btn");
    if (btn) {
      btn.classList.toggle("is-collapsed", !nowCollapsed);
      btn.title = !nowCollapsed ? "展開" : "折りたたむ";
    }
  },

  // ── チェックリスト ────────────────────────────────────

  onChecklistChange(cb) {
    const sectionId = Number(cb.dataset.checklistSectionId);
    const itemId = Number(cb.dataset.checklistItemId);
    const isChecked = cb.checked;
    const key = CHECKLIST_STATE_PREFIX + sectionId;
    const state = loadJsonFromStorage(key) || {};
    if (isChecked) {
      state[itemId] = true;
    } else {
      delete state[itemId];
    }
    localStorage.setItem(key, JSON.stringify(state));
    // 行に is-checked クラスを付け外し
    const row = cb.closest(".checklist-item");
    if (row) row.classList.toggle("is-checked", isChecked);
    // 進捗バーを更新
    const card = document.querySelector(
      `.card[data-section-id="${sectionId}"]`,
    );
    const items = State.itemsMap[sectionId] || [];
    const total = items.length;
    const doneCount = items.filter((i) => state[i.id]).length;
    const fill = card?.querySelector(".checklist-progress__fill");
    const text = card?.querySelector(".checklist-progress__text");
    if (fill)
      fill.style.width = `${total > 0 ? Math.round((doneCount / total) * 100) : 0}%`;
    if (text) text.textContent = `${doneCount} / ${total}`;
  },

  // ── メモ保存 ──────────────────────────────────────────

  async saveSectionMemo(sectionId) {
    const section = State.sections.find((s) => s.id === sectionId);
    if (!section) return;
    section.memo_content =
      document.getElementById("edit-section-memo")?.value || "";
    await State.db.updateSection(section);
    Renderer.renderDashboard();
    showSuccess("保存しました");
  },

  // ── チェックリスト設定保存 ───────────────────────────

  async saveSectionChecklist(sectionId) {
    const section = State.sections.find((s) => s.id === sectionId);
    if (!section) return;
    section.checklist_reset =
      document.getElementById("edit-section-checklist-reset")?.value || "never";
    await State.db.updateSection(section);
    Renderer.renderDashboard();
    showSuccess("保存しました");
  },

  // ── テーブルソート ────────────────────────────────────

  sortTableCol(sectionId, colId) {
    const cur = State.tableSortState[sectionId];
    if (cur && cur.colId === colId) {
      State.tableSortState[sectionId] = {
        colId,
        dir: cur.dir === "asc" ? "desc" : "asc",
      };
    } else {
      State.tableSortState[sectionId] = { colId, dir: "asc" };
    }
    // ソート変更時はページを先頭に戻す
    State.tablePageState[sectionId] = 0;
    // このセクションのカードボディのみ再描画
    const section = State.sections.find((s) => s.id === sectionId);
    const items = State.itemsMap[sectionId] || [];
    const card = document.querySelector(
      `.card[data-section-id="${sectionId}"]`,
    );
    if (!card || !section) return;
    const bd = card.querySelector(".card__bd");
    if (!bd) return;
    bd.innerHTML = "";
    Renderer.buildTableSection(section, items, bd);
  },

  // ── 使用頻度順ソート ─────────────────────────────────

  toggleSortByUsage(sectionId) {
    const key = SORT_BY_USAGE_PREFIX + sectionId;
    const current = localStorage.getItem(key) === "1";
    if (current) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, "1");
    }
    // カード全体を再描画（ヘッダーボタン状態 + ボディ並び順を更新）
    const section = State.sections.find((s) => s.id === sectionId);
    const items = State.itemsMap[sectionId] || [];
    const card = document.querySelector(`.card[data-section-id="${sectionId}"]`);
    if (!card || !section) return;
    const newCard = Renderer.buildSectionCard(section, items);
    card.replaceWith(newCard);
  },

  async clearUseCounts(sectionId) {
    await State.db.clearUseCounts(sectionId);
    const items = State.itemsMap[sectionId] || [];
    items.forEach((item) => { item.use_count = 0; });
    // カードを再描画
    const section = State.sections.find((s) => s.id === sectionId);
    const card = document.querySelector(`.card[data-section-id="${sectionId}"]`);
    if (card && section) {
      const newCard = Renderer.buildSectionCard(section, items);
      card.replaceWith(newCard);
    }
    showSuccess("使用回数をリセットしました");
  },

  // ── Markdown 編集 ─────────────────────────────────────

  toggleMarkdownEdit(sectionId) {
    const card = document.querySelector(`.card[data-section-id="${sectionId}"]`);
    if (!card) return;
    const display = card.querySelector(".md-body");
    const editPanel = card.querySelector(".md-edit-panel");
    if (!display || !editPanel) return;
    const isEditing = !editPanel.hidden;
    display.hidden = !isEditing;
    editPanel.hidden = isEditing;
    // 編集ボタンのタイトルを更新
    const editBtn = card.querySelector("[data-action='toggle-md-edit']");
    if (editBtn) editBtn.title = !isEditing ? "プレビューに戻る" : "編集";
  },

  async saveMarkdownBody(sectionId) {
    const section = State.sections.find((s) => s.id === sectionId);
    if (!section) return;
    // 設定パネルからの保存
    const settingsBody = document.getElementById("edit-section-body");
    // カード内の編集パネルからの保存
    const cardTextarea = document.getElementById(`md-edit-${sectionId}`);
    section.body = (settingsBody || cardTextarea)?.value ?? section.body ?? "";
    await State.db.updateSection(section);
    Renderer.renderDashboard();
    showSuccess("保存しました");
  },

  // ── カウントダウン カード上操作 ───────────────────────────

  /** カード上でラベルをインライン編集 */
  editCountdownLabel(btn) {
    const itemId    = Number(btn.dataset.itemId);
    const sectionId = Number(btn.dataset.sectionId);

    const input = document.createElement("input");
    input.type = "text";
    input.className = "countdown-label-input";
    input.value = btn.textContent.trim();
    btn.replaceWith(input);
    input.focus();
    input.select();

    const _redraw = () => {
      const section = State.sections.find((s) => s.id === sectionId);
      if (!section) return;
      const card = document.querySelector(`.card[data-section-id="${sectionId}"]`);
      if (!card) return;
      const bd = card.querySelector(".card__bd");
      if (bd) Renderer.buildCountdownSection(section, State.itemsMap[sectionId] || [], bd);
    };

    const save = async () => {
      const newLabel = input.value.trim();
      if (!newLabel) { _redraw(); return; }
      const item = (State.itemsMap[sectionId] || []).find((i) => i.id === itemId);
      if (!item) return;
      item.label = newLabel;
      await State.db.updateItem(item);
      _redraw();
    };

    input.addEventListener("blur", save);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); input.blur(); }
      if (e.key === "Escape") {
        input.removeEventListener("blur", save);
        _redraw();
      }
    });
  },

  /** カード上でマイルストーンを削除 */
  async deleteCountdownItem(itemId, sectionId) {
    const section = State.sections.find((s) => s.id === sectionId);
    if (!section) return;
    await State.db.deleteItem(itemId);
    State.itemsMap[sectionId] = (State.itemsMap[sectionId] || []).filter((i) => i.id !== itemId);
    const card = document.querySelector(`.card[data-section-id="${sectionId}"]`);
    if (!card) return;
    const bd = card.querySelector(".card__bd");
    if (bd) Renderer.buildCountdownSection(section, State.itemsMap[sectionId], bd);
  },

  /** インライン追加フォームの表示切替 */
  toggleCountdownAdd(sectionId) {
    const form = document.getElementById(`countdown-add-form-${sectionId}`);
    if (!form) return;
    if (!form.hidden) { form.hidden = true; return; }

    // フォームをリセットして表示
    const labelInput = document.getElementById(`countdown-add-label-${sectionId}`);
    const dateInput  = document.getElementById(`countdown-add-date-${sectionId}`);
    const dateBtn    = form.querySelector(".countdown-add-date-btn");
    if (labelInput) { labelInput.value = ""; }
    if (dateInput)  { dateInput.value  = ""; }
    if (dateBtn) {
      const span = dateBtn.querySelector(".settings-date-btn__text");
      if (span) span.textContent = "日付を選択...";
      dateBtn.classList.add("settings-date-btn--empty");
    }
    form.hidden = false;
    if (labelInput) labelInput.focus();
  },

  /** インライン追加フォームからマイルストーンを保存 */
  async saveCountdownAdd(sectionId) {
    const section = State.sections.find((s) => s.id === sectionId);
    if (!section) return;
    const labelInput = document.getElementById(`countdown-add-label-${sectionId}`);
    const dateInput  = document.getElementById(`countdown-add-date-${sectionId}`);
    const label = labelInput?.value.trim() || "";
    if (!label) { showError("マイルストーン名を入力してください"); labelInput?.focus(); return; }

    const items = State.itemsMap[sectionId] || [];
    const maxPos = items.length > 0 ? Math.max(...items.map((i) => i.position)) + 1 : 0;
    const data = { section_id: sectionId, item_type: "milestone", label, value: dateInput?.value || "", position: maxPos };
    const newId = await State.db.addItem(data);
    data.id = newId;
    State.itemsMap[sectionId] = [...items, data];

    const card = document.querySelector(`.card[data-section-id="${sectionId}"]`);
    if (!card) return;
    const bd = card.querySelector(".card__bd");
    if (bd) Renderer.buildCountdownSection(section, State.itemsMap[sectionId], bd);
  },

  /** インライン追加フォームをキャンセル */
  cancelCountdownAdd(sectionId) {
    const form = document.getElementById(`countdown-add-form-${sectionId}`);
    if (form) form.hidden = true;
  },

  // ── カウントダウン モード切替 ──────────────────────────

  async toggleCountdownMode(sectionId) {
    const section = State.sections.find((s) => s.id === sectionId);
    if (!section) return;
    section.countdown_mode = section.countdown_mode === "business" ? "calendar" : "business";
    await State.db.updateSection(section);
    // カードボディのみ再描画
    const items = State.itemsMap[sectionId] || [];
    const card = document.querySelector(`.card[data-section-id="${sectionId}"]`);
    if (!card) return;
    const bd = card.querySelector(".card__bd");
    if (!bd) return;
    bd.innerHTML = "";
    Renderer.buildCountdownSection(section, items, bd);
    // モードボタンのテキストを更新
    const modeBtn = card.querySelector(".card__mode-btn");
    if (modeBtn) modeBtn.textContent = section.countdown_mode === "business" ? "営業日" : "カレンダー日";
  },

  // ── カウントダウン カード上インライン日付編集 ──────────

  async editCountdownDate(itemId, sectionId) {
    const section = State.sections.find((s) => s.id === sectionId);
    const items = State.itemsMap[sectionId] || [];
    const item = items.find((i) => i.id === itemId);
    if (!section || !item) return;

    const _redraw = () => {
      const card = document.querySelector(`.card[data-section-id="${sectionId}"]`);
      if (!card) return;
      const bd = card.querySelector(".card__bd");
      if (bd) Renderer.buildCountdownSection(section, State.itemsMap[sectionId] || [], bd);
    };

    DatePicker.open(
      item.value || "",
      async (dateStr) => {
        item.value = dateStr;
        await State.db.updateItem(item);
        _redraw();
      },
      async () => {
        item.value = "";
        await State.db.updateItem(item);
        _redraw();
      }
    );
  },

  // ── カウントダウン 設定フォーム内日付ピッカー ──────────

  openCountdownDatePicker(btn) {
    const hiddenId = btn.dataset.hiddenId;
    const hiddenInput = document.getElementById(hiddenId);
    const displaySpan = btn.querySelector(".settings-date-btn__text");
    const current = hiddenInput?.value || "";
    DatePicker.open(
      current,
      (dateStr) => {
        if (hiddenInput) hiddenInput.value = dateStr;
        if (displaySpan) displaySpan.textContent = dateStr;
        btn.classList.remove("settings-date-btn--empty");
      },
      () => {
        if (hiddenInput) hiddenInput.value = "";
        if (displaySpan) displaySpan.textContent = "日付を選択...";
        btn.classList.add("settings-date-btn--empty");
      }
    );
  },

  // ── ジャンプナビ ──────────────────────────────────────

  toggleJumpNav() {
    const menu = document.getElementById("section-nav-menu");
    if (menu) menu.hidden = !menu.hidden;
  },

  jumpToSection(sectionId) {
    const card = document.querySelector(
      `.card[data-section-id="${sectionId}"]`,
    );
    if (!card) return;
    // 折りたたまれていたら展開
    const bd = card.querySelector(".card__bd");
    if (bd && bd.hidden) EventHandlers.toggleSectionCollapse(sectionId);
    card.scrollIntoView({ behavior: "smooth", block: "start" });
    const menu = document.getElementById("section-nav-menu");
    if (menu) menu.hidden = true;
  },
};

// ==============================
// App - 初期化
// ==============================
