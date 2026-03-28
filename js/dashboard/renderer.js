// ==============================
// Renderer
// ==============================

const Renderer = {
  // ── ダッシュボード ────────────────────

  renderDashboard() {
    const board = document.getElementById("home-board");
    board.innerHTML = "";
    State.sections.forEach((section) => {
      const items = State.itemsMap[section.id] || [];
      board.appendChild(Renderer.buildSectionCard(section, items));
    });
    // セクション数が変わる可能性があるのでジャンプナビも更新
    Renderer.renderJumpNav();
  },

  buildSectionCard(section, items) {
    const el = document.createElement("section");
    el.className = "card";
    el.dataset.sectionId = section.id;
    el.dataset.width = section.width || "auto";
    if (section.newRow) el.dataset.newRow = "true";

    const isCollapsed =
      localStorage.getItem(COLLAPSE_PREFIX + section.id) === "1";

    // ヘッダー
    const hd = document.createElement("div");
    hd.className = "card__hd";
    hd.innerHTML = `
      <span class="card__hd-icon">${escapeHtml(section.icon || "📋")}</span>
      <h2 class="card__hd-title">${escapeHtml(section.title)}</h2>
      ${section.type === "markdown" ? `
        <button class="card__hd-btn" data-action="toggle-md-edit" data-section-id="${section.id}" title="編集">
          ${Icons.edit}
        </button>` : ""}
      ${section.type === "countdown" ? `
        <button class="card__mode-btn" data-action="toggle-countdown-mode" data-section-id="${section.id}" title="カレンダー日 / 営業日を切り替え">
          ${section.countdown_mode === "business" ? "営業日" : "カレンダー日"}
        </button>` : ""}
      <button class="card__collapse-btn${isCollapsed ? " is-collapsed" : ""}"
              data-action="toggle-collapse" data-section-id="${section.id}"
              title="${isCollapsed ? "展開" : "折りたたむ"}">
        ${Icons.chevron}
      </button>
    `;
    el.appendChild(hd);

    // ボディ
    const bd = document.createElement("div");
    bd.className = "card__bd";
    if (isCollapsed) bd.hidden = true;
    switch (section.type) {
      case "list":
        Renderer.buildListSection(section, items, bd);
        break;
      case "grid":
        Renderer.buildGridSection(section, items, bd);
        break;
      case "command_builder":
        Renderer.buildCommandBuilderSection(section, bd);
        break;
      case "table":
        Renderer.buildTableSection(section, items, bd);
        break;
      case "memo":
        Renderer.buildMemoSection(section, bd);
        break;
      case "checklist":
        Renderer.buildChecklistSection(section, items, bd);
        break;
      case "markdown":
        Renderer.buildMarkdownSection(section, bd);
        break;
      case "iframe":
        Renderer.buildIframeSection(section, bd);
        break;
      case "countdown":
        Renderer.buildCountdownSection(section, items, bd);
        break;
    }
    el.appendChild(bd);
    return el;
  },

  buildListSection(section, items, bd) {
    if (items.length === 0) {
      bd.innerHTML = `<p class="section-empty">アイテムがありません。設定から追加してください。</p>`;
      return;
    }

    // リスト独自バインド変数プリセットバー（プリセットがある場合のみ表示）
    const listPresets = section.list_presets || [];
    if (listPresets.length > 0) {
      const presetBarEl = document.createElement("div");
      presetBarEl.className = "table-preset-bar";
      presetBarEl.dataset.sectionId = section.id;
      presetBarEl.innerHTML = Renderer.buildListPresetBarInner(section, listPresets);
      // セグメントコントロールのラジオイベントを直接バインド
      presetBarEl.querySelectorAll("input[type=radio]").forEach((radio) => {
        radio.addEventListener("change", () => {
          EventHandlers.switchListPreset(section.id, Number(radio.value));
        });
      });
      // select の change イベントを直接バインド
      const sel = presetBarEl.querySelector(".list-preset-select");
      if (sel) {
        sel.addEventListener("change", () => {
          EventHandlers.switchListPreset(section.id, sel.value ? Number(sel.value) : null);
        });
        CustomSelect.create(sel);
      }
      bd.appendChild(presetBarEl);
    }

    // フィルター入力（filter_limit > 0 かつアイテム数がしきい値を超えた場合に表示）
    const filterLimit = section.filter_limit ?? 5;
    let listFilterInput = null;
    let listFilterCount = null;
    if (filterLimit > 0 && items.length > filterLimit) {
      const filterWrap = document.createElement("div");
      filterWrap.className = "list-filter-wrap";
      listFilterInput = document.createElement("input");
      listFilterInput.type = "text";
      listFilterInput.className = "list-filter";
      listFilterInput.placeholder = "絞り込み...";
      listFilterCount = document.createElement("span");
      listFilterCount.className = "list-filter-count";
      listFilterCount.hidden = true;
      filterWrap.appendChild(listFilterInput);
      filterWrap.appendChild(listFilterCount);
      bd.appendChild(filterWrap);
    }

    // ローカル変数解決（セクション独自 + グローバルバインド変数）
    const localResolve = (v) => resolveBindVars(resolveSectionVars(v, section.id));

    const rowsWrap = document.createElement("div");
    rowsWrap.className = "list-rows";
    items.forEach((item) => {
      const isTemplate = item.item_type === "template";
      const row = document.createElement("a");
      row.className = `row ${item.item_type === "copy" ? "js-copy" : isTemplate ? "js-template" : "js-link"}`;
      row.href = "javascript:void(0);";
      row.dataset.value = item.value || "";
      let cta;
      if (item.item_type === "copy") cta = Icons.clipboard;
      else if (isTemplate) cta = Icons.templateDoc;
      else cta = Icons.external;
      row.innerHTML = `
        <span class="row__label">${escapeHtml(localResolve(item.label || ""))}</span>
        ${item.hint ? `<span class="row__hint">${escapeHtml(localResolve(item.hint))}</span>` : ""}
        <span class="row__cta">${cta}</span>
      `;
      rowsWrap.appendChild(row);
    });
    bd.appendChild(rowsWrap);

    if (listFilterInput) {
      listFilterInput.addEventListener("input", () => {
        const q = listFilterInput.value.trim().toLowerCase();
        let matchCount = 0;
        rowsWrap.querySelectorAll(".row").forEach((row) => {
          // ラベル・ヒント両方をバインド変数解決済みの表示値で検索
          const labelText = (row.querySelector(".row__label")?.textContent || "").toLowerCase();
          const hintText = (row.querySelector(".row__hint")?.textContent || "").toLowerCase();
          const matches = q ? (labelText.includes(q) || hintText.includes(q)) : true;
          row.hidden = !matches;
          if (matches) matchCount++;
        });
        if (q) {
          listFilterCount.textContent = `${matchCount}件一致`;
          listFilterCount.hidden = false;
        } else {
          listFilterCount.hidden = true;
        }
      });
    }
  },

  buildGridSection(section, items, bd) {
    if (items.length === 0) {
      bd.innerHTML = `<p class="section-empty">カードがありません。設定から追加してください。</p>`;
      return;
    }

    // グリッド独自バインド変数プリセットバー（プリセットがある場合のみ表示）
    const gridPresets = section.grid_presets || [];
    if (gridPresets.length > 0) {
      const presetBarEl = document.createElement("div");
      presetBarEl.className = "table-preset-bar";
      presetBarEl.dataset.sectionId = section.id;
      presetBarEl.innerHTML = Renderer.buildGridPresetBarInner(section, gridPresets);
      // セグメントコントロールのラジオイベントを直接バインド
      presetBarEl.querySelectorAll("input[type=radio]").forEach((radio) => {
        radio.addEventListener("change", () => {
          EventHandlers.switchGridPreset(section.id, Number(radio.value));
        });
      });
      // select の change イベントを直接バインド
      const sel = presetBarEl.querySelector(".grid-preset-select");
      if (sel) {
        sel.addEventListener("change", () => {
          EventHandlers.switchGridPreset(section.id, sel.value ? Number(sel.value) : null);
        });
        CustomSelect.create(sel);
      }
      bd.appendChild(presetBarEl);
    }

    // ローカル変数解決（セクション独自 + グローバルバインド変数）
    const localResolve = (v) => resolveBindVars(resolveSectionVars(v, section.id));

    const grid = document.createElement("div");
    grid.className = "sheet-grid";
    items.forEach((item) => {
      const isCopy = item.item_type === "copy";
      const isTemplate = item.item_type === "template";
      const card = document.createElement("a");
      let cardClass = "sheet-card ";
      if (isCopy) cardClass += "js-copy sheet-card--copy";
      else if (isTemplate) cardClass += "js-template sheet-card--template";
      else cardClass += "js-link";
      card.className = cardClass;
      card.href = "javascript:void(0);";
      card.dataset.value = item.value || "";
      if (item.new_row) card.dataset.newRow = "true";
      let arrowIcon;
      if (isCopy)
        arrowIcon = Icons.clipboard.replace(
          "<svg ",
          '<svg class="sheet-card__arrow" ',
        );
      else if (isTemplate)
        arrowIcon = Icons.templateDoc.replace(
          "<svg ",
          '<svg class="sheet-card__arrow" ',
        );
      else arrowIcon = Icons.arrow;
      const defaultEmoji = isCopy ? "📋" : isTemplate ? "📝" : "🔗";
      card.innerHTML = `
        <span class="sheet-card__emoji">${escapeHtml(item.emoji || defaultEmoji)}</span>
        <span class="sheet-card__name">${escapeHtml(localResolve(item.label || ""))}</span>
        ${arrowIcon}
      `;
      grid.appendChild(card);
    });
    bd.appendChild(grid);
  },

  buildCommandBuilderSection(section, bd) {
    const sectionId = section.id;
    // cmd_buttons があればそれを使用、command_template がある場合は後方互換フォールバック
    const cmdButtons =
      section.cmd_buttons?.length > 0
        ? section.cmd_buttons
        : section.command_template
          ? [
              {
                id: "legacy",
                label: section.action_mode === "open" ? "リンク" : "コピー",
                template: section.command_template,
                action_mode: section.action_mode || "copy",
              },
            ]
          : [];
    const form = document.createElement("div");
    form.className = "url-form";
    const buttonsHtml = cmdButtons
      .map(
        (btn, idx) =>
          `<button class="url-form__btn js-copy-cmd"
            data-section-id="${sectionId}"
            data-btn-id="${escapeAttr(String(btn.id))}"
            data-template="${escapeAttr(btn.template || "")}"
            data-action-mode="${btn.action_mode || "copy"}"
            data-btn-index="${idx % 6}">
            ${btn.action_mode === "open" ? Icons.link : Icons.clipboard}
            ${escapeHtml(btn.label || (btn.action_mode === "open" ? "リンク" : "コピー"))}
          </button>`,
      )
      .join("");
    form.innerHTML = `
      <input id="url-input-${sectionId}" type="text" class="url-form__input" placeholder="入力値を入力..." />
      <div class="url-form__btns">${buttonsHtml}</div>
    `;
    // Enter キーで最初のボタンを実行
    const inputEl = form.querySelector(".url-form__input");
    if (inputEl) {
      inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          const firstBtn = form.querySelector(".js-copy-cmd");
          if (firstBtn) EventHandlers.onCopyCmd(firstBtn);
        }
      });
    }
    bd.appendChild(form);

    const historyWrap = document.createElement("div");
    historyWrap.className = "url-history";
    historyWrap.id = `url-history-${sectionId}`;
    bd.appendChild(historyWrap);
    // DOM に追加済みの要素を直接渡すことで getElementById を不要にする
    Renderer.renderCmdHistory(sectionId, historyWrap);
  },

  renderCmdHistory(sectionId, wrap) {
    wrap = wrap || document.getElementById(`url-history-${sectionId}`);
    if (!wrap) return;
    wrap.innerHTML = "";
    const urls = loadJsonFromStorage(CMD_HISTORY_PREFIX + sectionId);
    if (!urls || urls.length === 0) return;

    const hd = document.createElement("p");
    hd.className = "url-history__hd";
    hd.innerHTML = `${Icons.clock} 最近使ったテキスト`;
    wrap.appendChild(hd);

    const list = document.createElement("div");
    list.className = "url-history__list";
    urls.forEach((url, i) => {
      const btn = document.createElement("button");
      btn.className = "url-history__item";
      btn.title = url;
      btn.innerHTML = `
        <span class="url-history__item-num">${i + 1}</span>
        ${Icons.urlLinkIcon}
        <span class="url-history__item-text">${escapeHtml(url)}</span>
        <span class="url-history__item-enter">↵ 選択</span>
      `;
      btn.addEventListener("click", () => {
        const input = document.getElementById(`url-input-${sectionId}`);
        if (input) input.value = url;
      });
      list.appendChild(btn);
    });
    wrap.appendChild(list);
  },

  buildTableSection(section, items, bd) {
    const columns = section.columns || [];
    if (columns.length === 0) {
      bd.innerHTML = `<p class="section-empty">列が設定されていません。設定から列を追加してください。</p>`;
      return;
    }

    // テーブル独自バインド変数プリセットバー（プリセットがある場合のみ表示）
    const tablePresets = section.table_presets || [];
    if (tablePresets.length > 0) {
      const presetBarEl = document.createElement("div");
      presetBarEl.className = "table-preset-bar";
      presetBarEl.dataset.sectionId = section.id;
      presetBarEl.innerHTML = Renderer.buildTablePresetBarInner(section, tablePresets);
      // セグメントコントロールのラジオイベントを直接バインド
      presetBarEl.querySelectorAll("input[type=radio]").forEach((radio) => {
        radio.addEventListener("change", () => {
          EventHandlers.switchTablePreset(section.id, Number(radio.value));
        });
      });
      // select の change イベントを直接バインド
      const sel = presetBarEl.querySelector(".table-preset-select");
      if (sel) {
        sel.addEventListener("change", () => {
          EventHandlers.switchTablePreset(section.id, sel.value ? Number(sel.value) : null);
        });
        CustomSelect.create(sel);
      }
      bd.appendChild(presetBarEl);
    }

    // 非表示列を localStorage から読み込む（ブラウザ固有の UI 状態）
    const hiddenCols = new Set(
      loadJsonFromStorage(TABLE_COL_HIDDEN_PREFIX + section.id) || [],
    );

    // ツールバー（フィルタ入力 + 列切り替えボタン）
    const toolbar = document.createElement("div");
    toolbar.className = "data-table-toolbar";

    const filterInput = document.createElement("input");
    filterInput.type = "text";
    filterInput.className = "data-table-filter";
    filterInput.placeholder = "フィルタ...";
    toolbar.appendChild(filterInput);

    // 列切り替えドロップダウン
    const colToggleWrap = document.createElement("div");
    colToggleWrap.className = "data-table-col-toggle-wrap";

    const colBtn = document.createElement("button");
    colBtn.className = "data-table-col-btn";
    colBtn.dataset.action = "toggle-table-col-menu";
    colBtn.dataset.sectionId = section.id;
    colBtn.innerHTML = `${Icons.columns} 列`;
    colToggleWrap.appendChild(colBtn);

    const colMenu = document.createElement("div");
    colMenu.className = "data-table-col-menu";
    colMenu.id = `table-col-menu-${section.id}`;
    colMenu.hidden = true;
    columns.forEach((col) => {
      const label = document.createElement("label");
      label.className = "data-table-col-menu__item";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !hiddenCols.has(col.id);
      cb.dataset.colId = col.id;
      cb.dataset.sectionId = section.id;
      label.appendChild(cb);
      label.appendChild(document.createTextNode(" " + col.label));
      colMenu.appendChild(label);
    });
    colToggleWrap.appendChild(colMenu);
    toolbar.appendChild(colToggleWrap);
    bd.appendChild(toolbar);

    if (items.length === 0) {
      const empty = document.createElement("p");
      empty.className = "section-empty";
      empty.textContent = "行がありません。設定から追加してください。";
      bd.appendChild(empty);
      return;
    }

    const wrap = document.createElement("div");
    wrap.className = "data-table-wrap";
    const table = document.createElement("table");
    table.className = "data-table";

    // ヘッダー
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    columns.forEach((col) => {
      const th = document.createElement("th");
      const sort = State.tableSortState[section.id];
      const isSorted = sort?.colId === col.id;
      const dir = isSorted ? sort.dir : "";
      th.className = "data-table-th--sortable";
      th.dataset.action = "sort-table-col";
      th.dataset.sectionId = section.id;
      th.dataset.colId = col.id;
      th.innerHTML = `${escapeHtml(col.label)}<span class="sort-icon${isSorted ? ` is-${dir}` : ""}">↕</span>`;
      if (hiddenCols.has(col.id)) th.hidden = true;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // ボディ（ソート＋ページネーション適用）
    const tbody = document.createElement("tbody");
    const sort = State.tableSortState[section.id];
    const sortedItems = sort
      ? [...items].sort((a, b) => {
          const va = ((a.row_data || {})[sort.colId] || "").toLowerCase();
          const vb = ((b.row_data || {})[sort.colId] || "").toLowerCase();
          return sort.dir === "asc"
            ? va.localeCompare(vb, "ja")
            : vb.localeCompare(va, "ja");
        })
      : items;

    // ページネーション
    const pageSize = section.page_size || 0;
    let currentPage = State.tablePageState[section.id] || 0;
    let totalPages = 1;
    if (pageSize > 0) {
      totalPages = Math.max(1, Math.ceil(sortedItems.length / pageSize));
      currentPage = Math.min(currentPage, totalPages - 1);
      State.tablePageState[section.id] = currentPage;
    }

    // 全行をレンダリング（ページネーションは hidden で制御することで、
    // フィルタが全ページのデータを対象にできるようにする）
    sortedItems.forEach((item, index) => {
      const row_data = item.row_data || {};
      const tr = document.createElement("tr");
      // ページネーション: 現在ページ外の行を非表示
      if (pageSize > 0 && Math.floor(index / pageSize) !== currentPage) {
        tr.hidden = true;
      }
      columns.forEach((col) => {
        const td = document.createElement("td");
        td.dataset.colId = col.id;
        if (hiddenCols.has(col.id)) td.hidden = true;
        const val = row_data[col.id] || "";
        // テーブル独自バインド変数を先に解決し、次にグローバルバインド変数を解決
        const resolveVal = (v) => resolveBindVars(resolveTableVars(v, section.id));
        if (col.type === "copy") {
          td.className = "data-table__td--copy js-copy";
          td.dataset.value = val; // コピー時に resolveVal で解決（クリック時）
          td.innerHTML = `${escapeHtml(resolveVal(val))}<span class="td-copy-icon">${Icons.clipboardSm}</span>`;
        } else if (col.type === "link" && val) {
          td.className = "data-table__td--link";
          const a = document.createElement("a");
          a.className = "js-link";
          a.href = "javascript:void(0);";
          a.dataset.value = val; // リンク時に resolveVal で解決（クリック時）
          a.textContent = resolveVal(val);
          td.appendChild(a);
        } else {
          const resolved = resolveVal(val);
          td.textContent = resolved;
          // 値が空の場合はプレースホルダークラスを付与（CSS ::after で — を表示）
          if (!resolved) td.classList.add("data-table__td--empty");
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    bd.appendChild(wrap);

    // ページネーションコントロール
    let pager = null;
    if (pageSize > 0 && totalPages > 1) {
      pager = document.createElement("div");
      pager.className = "data-table-pager";
      const prevBtn = document.createElement("button");
      prevBtn.textContent = "←";
      prevBtn.dataset.action = "table-goto-page";
      prevBtn.dataset.sectionId = section.id;
      prevBtn.dataset.page = currentPage - 1;
      prevBtn.disabled = currentPage === 0;
      const pageInfo = document.createElement("span");
      pageInfo.textContent = `${currentPage + 1} / ${totalPages}`;
      const nextBtn = document.createElement("button");
      nextBtn.textContent = "→";
      nextBtn.dataset.action = "table-goto-page";
      nextBtn.dataset.sectionId = section.id;
      nextBtn.dataset.page = currentPage + 1;
      nextBtn.disabled = currentPage >= totalPages - 1;
      pager.appendChild(prevBtn);
      pager.appendChild(pageInfo);
      pager.appendChild(nextBtn);
      bd.appendChild(pager);
    }

    // 件数表示（フィルタ中のみ表示）
    const filterCount = document.createElement("span");
    filterCount.className = "data-table-filter-count";
    filterCount.hidden = true;
    toolbar.appendChild(filterCount);

    // フィルタ入力イベント（全ページの行を対象にリアルタイムフィルタリング）
    filterInput.addEventListener("input", () => {
      const q = filterInput.value.trim().toLowerCase();
      const rows = Array.from(tbody.querySelectorAll("tr"));
      if (q) {
        // フィルタ中: ページネーション無視で全行から絞り込み（バインド変数解決後の表示値で検索）
        let matchCount = 0;
        rows.forEach((tr) => {
          const matches = Array.from(tr.querySelectorAll("td")).some((td) => {
            // textContent はバインド変数解決済みの表示値
            return td.textContent.toLowerCase().includes(q);
          });
          tr.hidden = !matches;
          if (matches) matchCount++;
        });
        if (pager) pager.hidden = true;
        filterCount.textContent = `${matchCount}件一致`;
        filterCount.hidden = false;
      } else {
        // クリア時: ページネーションを復元
        rows.forEach((tr, index) => {
          if (pageSize > 0) {
            tr.hidden = Math.floor(index / pageSize) !== currentPage;
          } else {
            tr.hidden = false;
          }
        });
        if (pager) pager.hidden = false;
        filterCount.hidden = true;
      }
    });
  },

  // ── 設定パネル ────────────────────────

  renderSettingsView() {
    const { view, editingSectionId } = State.settings;
    const body = document.getElementById("settings-body");
    const titleEl = document.getElementById("settings-title");
    const backBtn = document.getElementById("settings-back-btn");

    if (view === "sections") {
      titleEl.textContent = "ホーム設定";
      backBtn.hidden = true;
      body.innerHTML = Renderer.buildSectionsView();
    } else if (view === "edit-section") {
      const section = State.sections.find((s) => s.id === editingSectionId);
      titleEl.textContent = section
        ? `${section.icon || ""} ${section.title}`
        : "セクション編集";
      backBtn.hidden = false;
      body.innerHTML = Renderer.buildEditSectionView(section);
    }
    // カスタムセレクトに置き換え
    CustomSelect.replaceAll(body);
  },

  buildSectionsView() {
    const sections = State.sections;
    const presetBadge =
      State.presets.length > 0
        ? `<span class="settings-nav-badge">${State.presets.length}</span>`
        : "";
    let html = `<div class="settings-nav-row">
      <button class="settings-nav-btn" data-action="open-bind-var-modal">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M4.22 4.22l2.12 2.12m11.32 11.32 2.12 2.12M2 12h3m14 0h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg>
        共通バインド変数
        ${presetBadge}
        <svg class="settings-nav-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>
    <div class="settings-add-bar">
      <button class="settings-add-btn" data-action="show-add-section">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        セクションを追加
      </button>
    </div>
    <div id="settings-section-list">`;

    sections.forEach((section, idx) => {
      html += `
      <div class="settings-row" data-section-id="${section.id}">
        <span class="settings-row__icon">${escapeHtml(section.icon || "📋")}</span>
        <span class="settings-row__title">${escapeHtml(section.title)}</span>
        <span class="settings-row__badge">${TYPE_LABELS[section.type] || section.type}</span>
        <div class="settings-row__actions">
          <button class="settings-btn" data-action="move-section-up" data-section-id="${section.id}" ${idx === 0 ? "disabled" : ""}>↑</button>
          <button class="settings-btn" data-action="move-section-down" data-section-id="${section.id}" ${idx === sections.length - 1 ? "disabled" : ""}>↓</button>
          <button class="settings-btn settings-btn--primary" data-action="edit-section" data-section-id="${section.id}">編集</button>
          <button class="settings-btn settings-btn--danger" data-action="delete-section" data-section-id="${section.id}">削除</button>
        </div>
      </div>`;
    });

    html += `</div>
    <div class="settings-io-bar">
      <button class="settings-btn settings-io-btn" data-action="export-data">
        ${Icons.export}
        エクスポート
      </button>
      <button class="settings-btn settings-io-btn" data-action="import-data">
        ${Icons.import}
        インポート
      </button>
    </div>
    <div class="settings-form-panel" id="add-section-form" hidden>
      <h3 class="settings-form-title">セクションを追加</h3>
      <div class="settings-form-row settings-form-row--inline">
        <input class="settings-input settings-input--xs" id="new-section-icon" type="text" placeholder="📋" maxlength="4" />
        <input class="settings-input" id="new-section-title" type="text" placeholder="タイトル" />
      </div>
      <div class="settings-form-row">
        <label class="settings-label">タイプ</label>
        <select class="cs-target" id="new-section-type">
          <option value="list">リスト</option>
          <option value="grid">グリッド</option>
          <option value="command_builder">コマンドビルダー</option>
          <option value="table">テーブル</option>
          <option value="memo">メモ</option>
          <option value="checklist">チェックリスト</option>
          <option value="markdown">Markdown</option>
          <option value="iframe">iframe</option>
          <option value="countdown">カウントダウン</option>
        </select>
      </div>
      <div class="settings-form-row" id="new-section-action-row" hidden>
        <label class="settings-label">アクション</label>
        <select class="cs-target" id="new-section-action-mode">
          <option value="copy">コピー</option>
          <option value="open">リンク</option>
        </select>
      </div>
      <div class="settings-form-row" id="new-section-cmd-row" hidden>
        <label class="settings-label">テンプレート（{INPUT} が入力値に置換されます）</label>
        <input class="settings-input" id="new-section-cmd" type="text" placeholder='open "https://www.google.com/search?q={INPUT}"' />
      </div>
      <div class="settings-form-row">
        <label class="settings-label">表示幅</label>
        <select class="cs-target" id="new-section-width">
          <option value="narrow">1/6</option>
          <option value="auto" selected>2/6</option>
          <option value="w3">3/6</option>
          <option value="wide">4/6</option>
          <option value="w5">5/6</option>
          <option value="full">6/6（全幅）</option>
        </select>
      </div>
      <div class="settings-form-row">
        <label class="settings-checkbox-label">
          <input type="checkbox" id="new-section-new-row"> 新しい行から開始する
        </label>
      </div>
      <div class="settings-form-actions">
        <button class="settings-btn settings-btn--primary" data-action="save-add-section">追加</button>
        <button class="settings-btn" data-action="cancel-add-section">キャンセル</button>
      </div>
    </div>`;
    return html;
  },

  buildTablePresetBarInner(section, presets) {
    const uiType = section.table_vars_ui_type || "tabs";
    const activeId = loadJsonFromStorage(TABLE_ACTIVE_PRESET_PREFIX + section.id);
    const labelHtml = section.table_vars_bar_label
      ? `<span class="table-preset-bar__label">${escapeHtml(section.table_vars_bar_label)}</span>`
      : "";

    if (uiType === "tabs") {
      const tabs = presets
        .map(
          (p) =>
            `<button class="bind-tab${p.id === activeId ? " is-active" : ""}"
                 data-action="switch-table-preset" data-section-id="${section.id}" data-preset-id="${p.id}">
              ${escapeHtml(p.name)}
            </button>`,
        )
        .join("");
      return `<div class="table-preset-bar__inner table-preset-bar__inner--tabs">
        ${labelHtml}
        <div class="bind-tabs">${tabs}</div>
      </div>`;
    } else if (uiType === "segment") {
      const items = presets
        .map(
          (p) =>
            `<label class="bind-segment__item">
              <input type="radio" name="table-preset-radio-${section.id}" value="${p.id}" ${p.id === activeId ? "checked" : ""} />
              ${escapeHtml(p.name)}
            </label>`,
        )
        .join("");
      return `<div class="table-preset-bar__inner table-preset-bar__inner--segment">
        ${labelHtml}
        <div class="bind-segment">${items}</div>
      </div>`;
    } else {
      // select（デフォルト）
      const options =
        `<option value="">-- 選択なし --</option>` +
        presets
          .map(
            (p) =>
              `<option value="${p.id}" ${p.id === activeId ? "selected" : ""}>${escapeHtml(p.name)}</option>`,
          )
          .join("");
      return `<div class="table-preset-bar__inner">
        ${labelHtml}
        <select class="cs-target kn-select--grow table-preset-select">${options}</select>
      </div>`;
    }
  },

  buildListPresetBarInner(section, presets) {
    const uiType = section.list_vars_ui_type || "tabs";
    const activeId = loadJsonFromStorage(LIST_ACTIVE_PRESET_PREFIX + section.id);
    const labelHtml = section.list_vars_bar_label
      ? `<span class="table-preset-bar__label">${escapeHtml(section.list_vars_bar_label)}</span>`
      : "";

    if (uiType === "tabs") {
      const tabs = presets
        .map(
          (p) =>
            `<button class="bind-tab${p.id === activeId ? " is-active" : ""}"
                 data-action="switch-list-preset" data-section-id="${section.id}" data-preset-id="${p.id}">
              ${escapeHtml(p.name)}
            </button>`,
        )
        .join("");
      return `<div class="table-preset-bar__inner table-preset-bar__inner--tabs">
        ${labelHtml}
        <div class="bind-tabs">${tabs}</div>
      </div>`;
    } else if (uiType === "segment") {
      const items = presets
        .map(
          (p) =>
            `<label class="bind-segment__item">
              <input type="radio" name="list-preset-radio-${section.id}" value="${p.id}" ${p.id === activeId ? "checked" : ""} />
              ${escapeHtml(p.name)}
            </label>`,
        )
        .join("");
      return `<div class="table-preset-bar__inner table-preset-bar__inner--segment">
        ${labelHtml}
        <div class="bind-segment">${items}</div>
      </div>`;
    } else {
      // select
      const options =
        `<option value="">-- 選択なし --</option>` +
        presets
          .map(
            (p) =>
              `<option value="${p.id}" ${p.id === activeId ? "selected" : ""}>${escapeHtml(p.name)}</option>`,
          )
          .join("");
      return `<div class="table-preset-bar__inner">
        ${labelHtml}
        <select class="cs-target kn-select--grow list-preset-select">${options}</select>
      </div>`;
    }
  },

  buildGridPresetBarInner(section, presets) {
    const uiType = section.grid_vars_ui_type || "tabs";
    const activeId = loadJsonFromStorage(GRID_ACTIVE_PRESET_PREFIX + section.id);
    const labelHtml = section.grid_vars_bar_label
      ? `<span class="table-preset-bar__label">${escapeHtml(section.grid_vars_bar_label)}</span>`
      : "";

    if (uiType === "tabs") {
      const tabs = presets
        .map(
          (p) =>
            `<button class="bind-tab${p.id === activeId ? " is-active" : ""}"
                 data-action="switch-grid-preset" data-section-id="${section.id}" data-preset-id="${p.id}">
              ${escapeHtml(p.name)}
            </button>`,
        )
        .join("");
      return `<div class="table-preset-bar__inner table-preset-bar__inner--tabs">
        ${labelHtml}
        <div class="bind-tabs">${tabs}</div>
      </div>`;
    } else if (uiType === "segment") {
      const items = presets
        .map(
          (p) =>
            `<label class="bind-segment__item">
              <input type="radio" name="grid-preset-radio-${section.id}" value="${p.id}" ${p.id === activeId ? "checked" : ""} />
              ${escapeHtml(p.name)}
            </label>`,
        )
        .join("");
      return `<div class="table-preset-bar__inner table-preset-bar__inner--segment">
        ${labelHtml}
        <div class="bind-segment">${items}</div>
      </div>`;
    } else {
      // select
      const options =
        `<option value="">-- 選択なし --</option>` +
        presets
          .map(
            (p) =>
              `<option value="${p.id}" ${p.id === activeId ? "selected" : ""}>${escapeHtml(p.name)}</option>`,
          )
          .join("");
      return `<div class="table-preset-bar__inner">
        ${labelHtml}
        <select class="cs-target kn-select--grow grid-preset-select">${options}</select>
      </div>`;
    }
  },

  buildEditSectionView(section) {
    if (!section)
      return '<p class="section-empty">セクションが見つかりません</p>';
    const isCmdBuilder = section.type === "command_builder";
    const isTable = section.type === "table";
    const isMemo = section.type === "memo";
    const isChecklist = section.type === "checklist";
    const isMarkdown = section.type === "markdown";
    const isIframe = section.type === "iframe";
    const isCountdown = section.type === "countdown";
    const columns = section.columns || [];
    const items = State.itemsMap[section.id] || [];

    const curWidth = section.width || "auto";
    let html = `<div class="settings-edit-section">
      <div class="settings-subsection">
        <h3 class="settings-subsection-title">セクション設定</h3>
        <div class="settings-form-row settings-form-row--inline">
          <input class="settings-input settings-input--xs" id="edit-section-icon" type="text" value="${escapeAttr(section.icon || "")}" placeholder="📋" maxlength="4" />
          <input class="settings-input" id="edit-section-title" type="text" value="${escapeAttr(section.title || "")}" placeholder="タイトル" />
        </div>
        <div class="settings-form-row">
          <label class="settings-label">表示幅</label>
          <select class="cs-target" id="edit-section-width">
            <option value="narrow" ${curWidth === "narrow" ? "selected" : ""}>1/6</option>
            <option value="auto" ${curWidth === "auto" ? "selected" : ""}>2/6</option>
            <option value="w3" ${curWidth === "w3" ? "selected" : ""}>3/6</option>
            <option value="wide" ${curWidth === "wide" ? "selected" : ""}>4/6</option>
            <option value="w5" ${curWidth === "w5" ? "selected" : ""}>5/6</option>
            <option value="full" ${curWidth === "full" ? "selected" : ""}>6/6（全幅）</option>
          </select>
        </div>
        <div class="settings-form-row">
          <label class="settings-checkbox-label">
            <input type="checkbox" id="edit-section-new-row"${section.newRow ? " checked" : ""}> 新しい行から開始する
          </label>
        </div>
        ${
          section.type === "list"
            ? `
        <div class="settings-form-row">
          <label class="settings-label">絞り込み表示のしきい値（0 で無効、それ以外は指定件数を超えたら絞り込み欄を表示）</label>
          <input class="settings-input settings-input--xs" id="edit-section-filter-limit" type="number" min="0" max="1000" value="${section.filter_limit ?? 5}" />
        </div>`
            : ""
        }
        ${
          isTable
            ? `
        <div class="settings-form-row">
          <label class="settings-label">1ページの表示件数（0 で無制限）</label>
          <input class="settings-input settings-input--xs" id="edit-section-page-size" type="number" min="0" max="1000" value="${section.page_size ?? 0}" />
        </div>`
            : ""
        }
        ${
          isCmdBuilder
            ? `
        <div class="settings-form-row">
          <label class="settings-label">履歴の上限件数（0 で無効）</label>
          <input class="settings-input settings-input--xs" id="edit-section-history-limit" type="number" min="0" max="100" value="${section.history_limit ?? 10}" />
        </div>`
            : ""
        }
        ${
          isIframe
            ? `
        <div class="settings-form-row">
          <label class="settings-label">URL</label>
          <input class="settings-input" id="edit-section-url" type="url" value="${escapeAttr(section.url || "")}" placeholder="https://example.com" />
        </div>
        <div class="settings-form-row">
          <label class="settings-label">高さ（px）</label>
          <input class="settings-input settings-input--xs" id="edit-section-iframe-height" type="number" min="100" step="50" value="${section.iframe_height ?? 400}" />
        </div>`
            : ""
        }
        ${
          isCountdown
            ? `
        <div class="settings-form-row">
          <label class="settings-label">デフォルト表示モード</label>
          <select class="cs-target" id="edit-section-countdown-mode">
            <option value="calendar" ${(section.countdown_mode || "calendar") === "calendar" ? "selected" : ""}>カレンダー日</option>
            <option value="business" ${section.countdown_mode === "business" ? "selected" : ""}>営業日（土日除く）</option>
          </select>
        </div>`
            : ""
        }
        <div class="settings-form-row">
          <button class="settings-btn settings-btn--primary" data-action="save-section-meta" data-section-id="${section.id}">保存</button>
        </div>`;

    if (isMemo) {
      html += `
        <div class="settings-form-row">
          <label class="settings-label">メモ内容（Markdown 対応：**太字** *斜体* \`コード\` - リスト）</label>
          <textarea class="settings-textarea" id="edit-section-memo" rows="10" placeholder="# 見出し&#10;**太字** *斜体* \`コード\`&#10;- リスト項目">${escapeHtml(section.memo_content || "")}</textarea>
        </div>
        <div class="settings-form-row">
          <button class="settings-btn settings-btn--primary" data-action="save-section-memo" data-section-id="${section.id}">保存</button>
        </div>`;
    }

    if (isMarkdown) {
      html += `
        <div class="settings-subsection">
          <h3 class="settings-subsection-title">Markdown 本文</h3>
          <div class="settings-form-row">
            <label class="settings-label">本文（marked.js で HTML に変換されます）</label>
            <textarea class="settings-textarea" id="edit-section-body" rows="12" placeholder="# 見出し&#10;**太字** *斜体* \`コード\`&#10;&#10;- リスト項目&#10;- リスト項目&#10;&#10;[リンク](https://example.com)">${escapeHtml(section.body || "")}</textarea>
          </div>
          <div class="settings-form-row">
            <button class="settings-btn settings-btn--primary" data-action="save-markdown-body" data-section-id="${section.id}">保存</button>
          </div>
        </div>`;
    }

    if (isChecklist) {
      const curReset = section.checklist_reset || "never";
      html += `
        <div class="settings-form-row">
          <label class="settings-label">チェックのリセット</label>
          <select class="cs-target" id="edit-section-checklist-reset">
            <option value="never"   ${curReset === "never" ? "selected" : ""}>リセットしない</option>
            <option value="daily"   ${curReset === "daily" ? "selected" : ""}>毎日（日付が変わったら自動リセット）</option>
            <option value="weekly"  ${curReset === "weekly" ? "selected" : ""}>毎週（週が変わったら自動リセット）</option>
            <option value="monthly" ${curReset === "monthly" ? "selected" : ""}>毎月（月が変わったら自動リセット）</option>
            <option value="yearly"  ${curReset === "yearly" ? "selected" : ""}>毎年（年が変わったら自動リセット）</option>
          </select>
        </div>
        <div class="settings-form-row">
          <button class="settings-btn settings-btn--primary" data-action="save-section-checklist" data-section-id="${section.id}">保存</button>
        </div>`;
    }

    html += `</div>`;

    // コマンドビルダー: ボタン一覧管理サブセクション
    if (isCmdBuilder) {
      const buttons = section.cmd_buttons || [];
      const showMigrationNote = buttons.length === 0 && section.command_template;
      html += `
      <div class="settings-subsection">
        <div class="settings-subsection-hd">
          <h3 class="settings-subsection-title">ボタン</h3>
          <button class="settings-add-btn settings-add-btn--sm" data-action="show-add-cmd-button" data-section-id="${section.id}">＋ 追加</button>
        </div>`;
      if (showMigrationNote) {
        html += `<p class="settings-help">既存のテンプレート設定があります。ボタンを追加すると複数ボタン方式に切り替わります。</p>`;
      } else if (buttons.length === 0) {
        html += `<p class="settings-help">ボタンが未設定です。「＋ 追加」からボタンを作成してください。</p>`;
      }
      html += `<div id="cmd-button-list">`;
      buttons.forEach((btn, idx) => {
        const modeLabel = btn.action_mode === "open" ? "リンク" : "コピー";
        const colorIdx = idx % 6;
        const templateShort =
          (btn.template || "").length > 35
            ? (btn.template || "").substring(0, 35) + "…"
            : btn.template || "";
        html += `
          <div class="settings-cmd-btn-row" id="cmd-btn-row-${escapeAttr(String(btn.id))}" data-btn-id="${escapeAttr(String(btn.id))}">
            <span class="settings-cmd-btn-dot" data-btn-index="${colorIdx}"></span>
            <span class="settings-cmd-btn-label">${escapeHtml(btn.label || "")}</span>
            <span class="settings-cmd-btn-mode">${escapeHtml(modeLabel)}</span>
            <span class="settings-cmd-btn-template" title="${escapeAttr(btn.template || "")}">${escapeHtml(templateShort)}</span>
            <div class="settings-row__actions">
              <button class="settings-btn" data-action="move-cmd-button-up" data-section-id="${section.id}" data-btn-id="${escapeAttr(String(btn.id))}" ${idx === 0 ? "disabled" : ""}>↑</button>
              <button class="settings-btn" data-action="move-cmd-button-down" data-section-id="${section.id}" data-btn-id="${escapeAttr(String(btn.id))}" ${idx === buttons.length - 1 ? "disabled" : ""}>↓</button>
              <button class="settings-btn settings-btn--primary" data-action="edit-cmd-button" data-section-id="${section.id}" data-btn-id="${escapeAttr(String(btn.id))}">編集</button>
              <button class="settings-btn settings-btn--danger" data-action="delete-cmd-button" data-section-id="${section.id}" data-btn-id="${escapeAttr(String(btn.id))}">削除</button>
            </div>
          </div>`;
      });
      html += `</div>
        <div class="settings-form-panel" id="cmd-button-add-form" hidden>
          <div class="settings-form-row">
            <label class="settings-label">ボタン名</label>
            <input class="settings-input" id="new-cmd-btn-label" type="text" placeholder="例：Google検索" />
          </div>
          <div class="settings-form-row settings-form-row--inline">
            <label class="settings-label">アクション</label>
            <select class="cs-target kn-select--sm" id="new-cmd-btn-mode">
              <option value="copy">コピー</option>
              <option value="open">リンク</option>
            </select>
          </div>
          <div class="settings-form-row">
            <label class="settings-label">テンプレート（{INPUT} が入力値に置換されます）</label>
            <input class="settings-input" id="new-cmd-btn-template" type="text" placeholder="https://www.google.com/search?q={INPUT}" />
          </div>
          <div class="settings-form-row settings-form-row--inline">
            <button class="settings-btn settings-btn--primary" data-action="save-add-cmd-button" data-section-id="${section.id}">追加</button>
            <button class="settings-btn" data-action="cancel-add-cmd-button">キャンセル</button>
          </div>
        </div>
      </div>`;
    }

    // テーブル: 列定義エディター
    if (isTable) {
      html += `
      <div class="settings-subsection">
        <div class="settings-subsection-hd">
          <h3 class="settings-subsection-title">列定義</h3>
          <button class="settings-add-btn settings-add-btn--sm" data-action="show-add-column" data-section-id="${section.id}">＋ 列を追加</button>
        </div>
        <div id="column-list">`;
      columns.forEach((col, idx) => {
        const typeLabel =
          col.type === "copy"
            ? "コピー"
            : col.type === "link"
              ? "リンク"
              : "テキスト";
        html += `
          <div class="settings-col-row" id="col-row-${col.id}" data-col-id="${col.id}">
            <span class="settings-col-label">${escapeHtml(col.label)}</span>
            <span class="settings-col-type">${typeLabel}</span>
            <div class="settings-row__actions">
              <button class="settings-btn" data-action="move-col-up" data-section-id="${section.id}" data-col-id="${col.id}" ${idx === 0 ? "disabled" : ""}>↑</button>
              <button class="settings-btn" data-action="move-col-down" data-section-id="${section.id}" data-col-id="${col.id}" ${idx === columns.length - 1 ? "disabled" : ""}>↓</button>
              <button class="settings-btn settings-btn--primary" data-action="edit-column" data-section-id="${section.id}" data-col-id="${col.id}">編集</button>
              <button class="settings-btn settings-btn--danger" data-action="delete-column" data-section-id="${section.id}" data-col-id="${col.id}">削除</button>
            </div>
          </div>`;
      });
      html += `</div>
        <div class="settings-form-panel" id="add-column-form" hidden>
          <div class="settings-form-row settings-form-row--inline">
            <input class="settings-input" id="new-col-label" type="text" placeholder="列名" />
            <select class="cs-target kn-select--sm" id="new-col-type">
              <option value="text">テキスト</option>
              <option value="copy">コピー</option>
              <option value="link">リンク</option>
            </select>
            <button class="settings-btn settings-btn--primary" data-action="save-add-column" data-section-id="${section.id}">追加</button>
            <button class="settings-btn" data-action="cancel-add-column">✕</button>
          </div>
        </div>
      </div>`;

      // テーブル: バインド変数設定ボタン
      html += `
      <div class="settings-subsection">
        <div class="settings-subsection-hd">
          <h3 class="settings-subsection-title">バインド変数 / プリセット</h3>
        </div>
        <p class="settings-help">テーブル内のセル値で <code>{変数名}</code> を使うと、プリセット選択に応じて置換されます。</p>
        <button class="settings-btn settings-btn--primary" data-action="open-table-bind-var-modal" data-section-id="${section.id}">
          バインド変数設定を開く ${ (section.table_bind_vars || []).length > 0 ? `<span class="settings-row__badge" style="margin-left:4px">${section.table_bind_vars.length} 変数</span>` : '' }
        </button>
      </div>`;
    }

    // リスト: バインド変数設定ボタン
    if (section.type === "list") {
      html += `
      <div class="settings-subsection">
        <div class="settings-subsection-hd">
          <h3 class="settings-subsection-title">バインド変数 / プリセット</h3>
        </div>
        <p class="settings-help">ラベル・ヒントで <code>{変数名}</code> を使うと、プリセット選択に応じて置換されます。</p>
        <button class="settings-btn settings-btn--primary" data-action="open-list-bind-var-modal" data-section-id="${section.id}">
          バインド変数設定を開く ${ (section.list_bind_vars || []).length > 0 ? `<span class="settings-row__badge" style="margin-left:4px">${section.list_bind_vars.length} 変数</span>` : '' }
        </button>
      </div>`;
    }

    // グリッド: バインド変数設定ボタン
    if (section.type === "grid") {
      html += `
      <div class="settings-subsection">
        <div class="settings-subsection-hd">
          <h3 class="settings-subsection-title">バインド変数 / プリセット</h3>
        </div>
        <p class="settings-help">カード名で <code>{変数名}</code> を使うと、プリセット選択に応じて置換されます。</p>
        <button class="settings-btn settings-btn--primary" data-action="open-grid-bind-var-modal" data-section-id="${section.id}">
          バインド変数設定を開く ${ (section.grid_bind_vars || []).length > 0 ? `<span class="settings-row__badge" style="margin-left:4px">${section.grid_bind_vars.length} 変数</span>` : '' }
        </button>
      </div>`;
    }

    // アイテム一覧（command_builder・memo・markdown・iframe・formatter 以外）
    if (!isCmdBuilder && !isMemo && !isMarkdown && !isIframe) {
      const label = isTable
        ? "行"
        : section.type === "grid"
          ? "カード"
          : "アイテム";
      html += `
      <div class="settings-subsection">
        <div class="settings-subsection-hd">
          <h3 class="settings-subsection-title">${label}一覧</h3>
          <div style="display:flex;gap:4px;">
            <button class="settings-add-btn settings-add-btn--sm" data-action="open-item-mgr" data-section-id="${section.id}">⤢ 全画面で管理</button>
            <button class="settings-add-btn settings-add-btn--sm" data-action="show-add-item" data-section-id="${section.id}">＋ 追加</button>
          </div>
        </div>
        <div id="item-list">`;
      items.forEach((item, idx) => {
        html += Renderer.buildItemRow(item, idx, items.length, section);
      });
      html += `</div>
        <div class="settings-form-panel" id="add-item-form" hidden>
          ${Renderer.buildItemFields(null, section)}
        </div>
      </div>`;
    }

    html += `
      <div class="settings-delete-section">
        <button class="settings-btn settings-btn--danger settings-btn--full" data-action="delete-section" data-section-id="${section.id}">
          このセクションを削除
        </button>
      </div>
    </div>`;
    return html;
  },

  buildItemRow(item, idx, total, section) {
    const isTable = section.type === "table";
    const columns = section.columns || [];
    let labelText = "";
    if (section.type === "countdown") {
      labelText = `${item.label || "（名前なし）"} — ${item.value || "日付未設定"}`;
    } else if (isTable) {
      const rd = item.row_data || {};
      labelText =
        columns
          .map((c) => rd[c.id] || "")
          .filter((v) => v)
          .join(" | ") || "（空）";
    } else if (section.type === "grid") {
      const typeTag =
        item.item_type === "copy"
          ? "[コピー]"
          : item.item_type === "template"
            ? "[テンプレート]"
            : "[リンク]";
      labelText = `${typeTag} ${item.emoji || ""} ${item.label || ""}`.trim();
    } else {
      const typeTag = item.item_type === "copy" ? "[コピー]" : item.item_type === "template" ? "[テンプレート]" : "[リンク]";
      labelText = `${typeTag} ${item.label || ""}`;
    }
    return `
      <div class="settings-row settings-row--item" id="item-row-${item.id}" data-item-id="${item.id}">
        <span class="settings-row__title settings-row__title--sm">${escapeHtml(labelText)}</span>
        <div class="settings-row__actions">
          <button class="settings-btn" data-action="move-item-up" data-item-id="${item.id}" data-section-id="${section.id}" ${idx === 0 ? "disabled" : ""}>↑</button>
          <button class="settings-btn" data-action="move-item-down" data-item-id="${item.id}" data-section-id="${section.id}" ${idx === total - 1 ? "disabled" : ""}>↓</button>
          <button class="settings-btn settings-btn--primary" data-action="edit-item" data-item-id="${item.id}" data-section-id="${section.id}">編集</button>
          <button class="settings-btn settings-btn--danger" data-action="delete-item" data-item-id="${item.id}" data-section-id="${section.id}">削除</button>
        </div>
      </div>`;
  },

  buildItemFields(item, section) {
    const isEdit = !!item;
    const saveAction = isEdit ? "save-edit-item" : "save-add-item";
    const cancelAction = isEdit ? "cancel-edit-item" : "cancel-add-item";
    const isGrid = section.type === "grid";
    const isTable = section.type === "table";
    const isChecklist = section.type === "checklist";
    const isCountdownSection = section.type === "countdown";
    const columns = section.columns || [];
    let html = "";

    if (isCountdownSection) {
      html += `
        <div class="settings-form-row">
          <label class="settings-label">マイルストーン名</label>
          <input class="settings-input" id="item-label" type="text" value="${escapeAttr(item?.label || "")}" placeholder="例: リリース v2.0" />
        </div>
        <div class="settings-form-row">
          <label class="settings-label">目標日</label>
          <input type="hidden" id="item-value" value="${escapeAttr(item?.value || "")}" />
          <button type="button" class="settings-date-btn${item?.value ? "" : " settings-date-btn--empty"}" data-action="open-countdown-date" data-hidden-id="item-value">
            ${Icons.calendar}
            <span class="settings-date-btn__text">${item?.value || "日付を選択..."}</span>
          </button>
        </div>`;
    } else if (isChecklist) {
      html += `
        <div class="settings-form-row">
          <input class="settings-input" id="item-label" type="text" value="${escapeAttr(item?.label || "")}" placeholder="アイテム名" />
        </div>`;
    } else if (isGrid) {
      const isTemplateItem = item?.item_type === "template";
      html += `
        <div class="settings-form-row">
          <label class="settings-label">アクション</label>
          <select class="cs-target" id="item-type">
            <option value="link" ${!item || item.item_type === "link" || item.item_type === "card" ? "selected" : ""}>リンク</option>
            <option value="copy" ${item?.item_type === "copy" ? "selected" : ""}>コピー</option>
            <option value="template" ${isTemplateItem ? "selected" : ""}>テンプレートコピー</option>
          </select>
        </div>
        <div class="settings-form-row settings-form-row--inline">
          <input class="settings-input settings-input--xs" id="item-emoji" type="text" value="${escapeAttr(item?.emoji || "")}" placeholder="🔗" maxlength="4" />
          <input class="settings-input" id="item-label" type="text" value="${escapeAttr(item?.label || "")}" placeholder="カード名" />
        </div>
        <div class="settings-form-row" id="item-value-row"${isTemplateItem ? " hidden" : ""}>
          <input class="settings-input" id="item-value" type="text" value="${escapeAttr(isTemplateItem ? "" : item?.value || "")}" placeholder="URL またはコピーするテキスト" />
        </div>
        <div class="settings-form-row" id="template-value-row"${isTemplateItem ? "" : " hidden"}>
          <label class="settings-label">テンプレート本文</label>
          <textarea class="settings-textarea" id="item-template-value" rows="8" placeholder="例:&#10;件名: ご連絡 {TODAY:YYYY/MM/DD}&#10;&#10;お世話になっております。&#10;本日 {TODAY:MM月DD日} のご連絡です。">${escapeHtml(isTemplateItem ? item?.value || "" : "")}</textarea>
          <p class="settings-help">日付プレースホルダー:<br>
            <code>{TODAY}</code> 今日 &nbsp;
            <code>{NOW}</code> 現在日時 &nbsp;
            <code>{DATE:+1d}</code> 明日 &nbsp;
            <code>{DATE:-2h}</code> 2時間前 &nbsp;
            <code>{DATE:+30m}</code> 30分後<br>
            単位: d=日 w=週 M=月 y=年 h=時間 m=分<br>
            フォーマット指定例: <code>{TODAY:YYYY年MM月DD日(ddd)}</code> / <code>{DATE:+1d:MM/DD(ddd)}</code><br>
            曜日: <code>ddd</code>=月 <code>dddd</code>=月曜日 &nbsp;
            時刻: <code>HH:mm</code> &nbsp;
            例: <code>{NOW:MM/DD(ddd) HH:mm}</code>
          </p>
        </div>
        <div class="settings-form-row">
          <label class="settings-checkbox-label">
            <input type="checkbox" id="item-new-row"${item?.new_row ? " checked" : ""}> 先頭から配置する（このカードを行の先頭に置く）
          </label>
        </div>`;
    } else if (isTable) {
      columns.forEach((col) => {
        const val = item?.row_data?.[col.id] || "";
        const typeLabel =
          col.type === "copy"
            ? "コピー"
            : col.type === "link"
              ? "リンク"
              : "テキスト";
        html += `
        <div class="settings-form-row">
          <label class="settings-label">${escapeHtml(col.label)} <span class="settings-col-type">${typeLabel}</span></label>
          <input class="settings-input" id="item-col-${col.id}" type="${col.type === "link" ? "url" : "text"}" value="${escapeAttr(val)}" placeholder="${col.type === "link" ? "https://..." : escapeAttr(col.label)}" />
        </div>`;
      });
    } else {
      const isTemplateItem = item?.item_type === "template";
      html += `
        <div class="settings-form-row">
          <label class="settings-label">タイプ</label>
          <select class="cs-target" id="item-type">
            <option value="copy" ${item?.item_type === "copy" ? "selected" : ""}>コピー</option>
            <option value="link" ${item?.item_type === "link" ? "selected" : ""}>リンク</option>
            <option value="template" ${isTemplateItem ? "selected" : ""}>テンプレートコピー</option>
          </select>
        </div>
        <div class="settings-form-row settings-form-row--inline">
          <input class="settings-input" id="item-label" type="text" value="${escapeAttr(item?.label || "")}" placeholder="ラベル" />
          <input class="settings-input settings-input--sm" id="item-hint" type="text" value="${escapeAttr(item?.hint || "")}" placeholder="補助テキスト（省略可）" />
        </div>
        <div class="settings-form-row" id="item-value-row"${isTemplateItem ? " hidden" : ""}>
          <input class="settings-input" id="item-value" type="text" value="${escapeAttr(isTemplateItem ? "" : (item?.value || ""))}" placeholder="コピーするテキスト または URL" />
        </div>
        <div class="settings-form-row" id="template-value-row"${isTemplateItem ? "" : " hidden"}>
          <label class="settings-label">テンプレート本文</label>
          <textarea class="settings-textarea" id="item-template-value" rows="8" placeholder="例:&#10;件名: ご連絡 {TODAY:YYYY/MM/DD}&#10;&#10;お世話になっております。&#10;本日 {TODAY:MM月DD日} のご連絡です。">${escapeHtml(isTemplateItem ? (item?.value || "") : "")}</textarea>
          <p class="settings-help">日付プレースホルダー:<br>
            <code>{TODAY}</code> 今日 &nbsp;
            <code>{NOW}</code> 現在日時 &nbsp;
            <code>{DATE:+1d}</code> 明日 &nbsp;
            <code>{DATE:-2h}</code> 2時間前 &nbsp;
            <code>{DATE:+30m}</code> 30分後<br>
            単位: d=日 w=週 M=月 y=年 h=時間 m=分<br>
            フォーマット指定例: <code>{TODAY:YYYY年MM月DD日(ddd)}</code> / <code>{DATE:+1d:MM/DD(ddd)}</code><br>
            曜日: <code>ddd</code>=月 <code>dddd</code>=月曜日 &nbsp;
            時刻: <code>HH:mm</code> &nbsp;
            例: <code>{NOW:MM/DD(ddd) HH:mm}</code>
          </p>
        </div>`;
    }

    html += `
      <div class="settings-form-actions">
        <button class="settings-btn settings-btn--primary" data-action="${saveAction}" data-section-id="${section.id}"${isEdit ? ` data-item-id="${item.id}"` : ""}>保存</button>
        <button class="settings-btn" data-action="${cancelAction}"${isEdit ? ` data-item-id="${item.id}" data-section-id="${section.id}"` : ""}>キャンセル</button>
      </div>`;
    return html;
  },

  // ── アイテム管理モーダル ────────────────────────────

  /** アイテム管理モーダル全体のHTMLを生成 */
  buildItemManagerHTML(section, items) {
    const label =
      section.type === "table"
        ? "行"
        : section.type === "grid"
          ? "カード"
          : "アイテム";
    const editingId = State.itemMgr.editingId;
    const formTab = State.itemMgr.formTab;

    // 左側: アイテム一覧
    let listHtml = "";
    items.forEach((item, idx) => {
      const isEditing = item.id === editingId;
      const labelText = this._itemMgrLabelText(item, section);
      listHtml += `
        <div class="item-mgr__item${isEditing ? " is-editing" : ""}" data-item-id="${item.id}">
          <span class="item-mgr__item-label" title="${escapeAttr(labelText)}">${escapeHtml(labelText)}</span>
          <div class="item-mgr__item-actions">
            <button class="settings-btn" data-action="move-item-up-mgr" data-item-id="${item.id}" data-section-id="${section.id}" ${idx === 0 ? "disabled" : ""}>↑</button>
            <button class="settings-btn" data-action="move-item-down-mgr" data-item-id="${item.id}" data-section-id="${section.id}" ${idx === items.length - 1 ? "disabled" : ""}>↓</button>
            <button class="settings-btn settings-btn--primary" data-action="edit-item-mgr" data-item-id="${item.id}" data-section-id="${section.id}">編集</button>
            <button class="settings-btn settings-btn--danger" data-action="delete-item-mgr" data-item-id="${item.id}" data-section-id="${section.id}">削除</button>
          </div>
        </div>`;
    });

    const editingItem = editingId
      ? items.find((i) => i.id === editingId)
      : null;
    const rightContent = this._buildItemMgrRight(section, editingItem, formTab);

    return `
      <div class="item-mgr__hd">
        <h2 class="item-mgr__title">${escapeHtml(section.icon || "📋")} ${escapeHtml(section.title)} — ${label}管理</h2>
        <button class="item-mgr__close" data-action="close-item-mgr" title="閉じる">${Icons.close}</button>
      </div>
      <div class="item-mgr__body">
        <div class="item-mgr__left">
          <div class="item-mgr__list-hd">
            <span class="item-mgr__list-title">${label}一覧</span>
            <span class="item-mgr__count">${items.length}件</span>
          </div>
          <div class="item-mgr__list">
            ${listHtml || `<p class="section-empty">まだ${label}がありません</p>`}
          </div>
        </div>
        <div class="item-mgr__right">
          ${rightContent}
        </div>
      </div>`;
  },

  _itemMgrLabelText(item, section) {
    if (section.type === "countdown") {
      return `${item.label || "（名前なし）"} — ${item.value || "日付未設定"}`;
    } else if (section.type === "table") {
      const rd = item.row_data || {};
      const cols = section.columns || [];
      return (
        cols
          .map((c) => rd[c.id] || "")
          .filter((v) => v)
          .join(" | ") || "（空）"
      );
    } else if (section.type === "grid") {
      const typeTag =
        item.item_type === "copy"
          ? "[コピー]"
          : item.item_type === "template"
            ? "[テンプレート]"
            : "[リンク]";
      return `${typeTag} ${item.emoji || ""} ${item.label || ""}`.trim();
    }
    const typeTag =
      item.item_type === "copy"
        ? "[コピー]"
        : item.item_type === "template"
          ? "[テンプレート]"
          : "[リンク]";
    return `${typeTag} ${item.label || ""}`;
  },

  _buildItemMgrRight(section, editingItem, formTab) {
    const isEditing = !!editingItem;
    const label =
      section.type === "table"
        ? "行"
        : section.type === "grid"
          ? "カード"
          : "アイテム";
    const tabAddLabel = isEditing ? `${label}を編集` : `${label}を追加`;
    const tabsHtml = `
      <div class="item-mgr__tabs">
        <button class="item-mgr__tab${formTab !== "bulk" ? " is-active" : ""}" data-action="item-mgr-tab" data-tab="add">${tabAddLabel}</button>
        <button class="item-mgr__tab${formTab === "bulk" ? " is-active" : ""}" data-action="item-mgr-tab" data-tab="bulk">コピー登録</button>
      </div>`;
    const formContent =
      formTab === "bulk"
        ? this._buildBulkForm(section)
        : this._buildItemMgrAddForm(section, editingItem);
    return tabsHtml + `<div class="item-mgr__form">${formContent}</div>`;
  },

  /** アイテム管理モーダル内の追加/編集フォーム（buildItemFields のモーダル版）*/
  _buildItemMgrAddForm(section, item) {
    const isEdit = !!item;
    const saveAction = isEdit ? "save-edit-item-mgr" : "save-add-item-mgr";
    const isGrid = section.type === "grid";
    const isTable = section.type === "table";
    const isChecklist = section.type === "checklist";
    const isCountdownSection = section.type === "countdown";
    const columns = section.columns || [];
    let html = "";

    if (isCountdownSection) {
      html += `
        <div class="settings-form-row">
          <label class="settings-label">マイルストーン名</label>
          <input class="settings-input" id="mgr-item-label" type="text" value="${escapeAttr(item?.label || "")}" placeholder="例: リリース v2.0" />
        </div>
        <div class="settings-form-row">
          <label class="settings-label">目標日</label>
          <input type="hidden" id="mgr-item-value" value="${escapeAttr(item?.value || "")}" />
          <button type="button" class="settings-date-btn${item?.value ? "" : " settings-date-btn--empty"}" data-action="open-countdown-date" data-hidden-id="mgr-item-value">
            ${Icons.calendar}
            <span class="settings-date-btn__text">${item?.value || "日付を選択..."}</span>
          </button>
        </div>`;
    } else if (isChecklist) {
      html += `
        <div class="settings-form-row">
          <input class="settings-input" id="mgr-item-label" type="text" value="${escapeAttr(item?.label || "")}" placeholder="アイテム名" />
        </div>`;
    } else if (isGrid) {
      const isTemplateItem = item?.item_type === "template";
      html += `
        <div class="settings-form-row">
          <label class="settings-label">アクション</label>
          <select class="cs-target" id="mgr-item-type">
            <option value="link" ${!item || item.item_type === "link" || item.item_type === "card" ? "selected" : ""}>リンク</option>
            <option value="copy" ${item?.item_type === "copy" ? "selected" : ""}>コピー</option>
            <option value="template" ${isTemplateItem ? "selected" : ""}>テンプレートコピー</option>
          </select>
        </div>
        <div class="settings-form-row settings-form-row--inline">
          <input class="settings-input settings-input--xs" id="mgr-item-emoji" type="text" value="${escapeAttr(item?.emoji || "")}" placeholder="🔗" maxlength="4" />
          <input class="settings-input" id="mgr-item-label" type="text" value="${escapeAttr(item?.label || "")}" placeholder="カード名" />
        </div>
        <div class="settings-form-row" id="mgr-item-value-row"${isTemplateItem ? " hidden" : ""}>
          <input class="settings-input" id="mgr-item-value" type="text" value="${escapeAttr(isTemplateItem ? "" : item?.value || "")}" placeholder="URL またはコピーするテキスト" />
        </div>
        <div class="settings-form-row" id="mgr-template-value-row"${isTemplateItem ? "" : " hidden"}>
          <label class="settings-label">テンプレート本文</label>
          <textarea class="settings-textarea" id="mgr-item-template-value" rows="8" placeholder="例:&#10;件名: ご連絡 {TODAY:YYYY/MM/DD}&#10;&#10;お世話になっております。">${escapeHtml(isTemplateItem ? item?.value || "" : "")}</textarea>
          <p class="settings-help">日付プレースホルダー: <code>{TODAY}</code> 今日 &nbsp; <code>{NOW}</code> 現在日時 &nbsp; <code>{DATE:+1d}</code> 明日 &nbsp; 単位: d=日 w=週 M=月 y=年 h=時間 m=分<br>
          フォーマット: <code>{TODAY:YYYY年MM月DD日(ddd)}</code> / <code>{NOW:MM/DD HH:mm}</code></p>
        </div>
        <div class="settings-form-row">
          <label class="settings-checkbox-label">
            <input type="checkbox" id="mgr-item-new-row"${item?.new_row ? " checked" : ""}> 先頭から配置する（このカードを行の先頭に置く）
          </label>
        </div>`;
    } else if (isTable) {
      columns.forEach((col) => {
        const val = item?.row_data?.[col.id] || "";
        const typeLabel =
          col.type === "copy"
            ? "コピー"
            : col.type === "link"
              ? "リンク"
              : "テキスト";
        html += `
          <div class="settings-form-row">
            <label class="settings-label">${escapeHtml(col.label)} <span class="settings-col-type">${typeLabel}</span></label>
            <input class="settings-input" id="mgr-item-col-${col.id}" type="${col.type === "link" ? "url" : "text"}" value="${escapeAttr(val)}" placeholder="${col.type === "link" ? "https://..." : escapeAttr(col.label)}" />
          </div>`;
      });
    } else {
      const isTemplateItem = item?.item_type === "template";
      html += `
        <div class="settings-form-row">
          <label class="settings-label">タイプ</label>
          <select class="cs-target" id="mgr-item-type">
            <option value="copy" ${item?.item_type === "copy" ? "selected" : ""}>コピー</option>
            <option value="link" ${item?.item_type === "link" ? "selected" : ""}>リンク</option>
            <option value="template" ${isTemplateItem ? "selected" : ""}>テンプレートコピー</option>
          </select>
        </div>
        <div class="settings-form-row settings-form-row--inline">
          <input class="settings-input" id="mgr-item-label" type="text" value="${escapeAttr(item?.label || "")}" placeholder="ラベル" />
          <input class="settings-input settings-input--sm" id="mgr-item-hint" type="text" value="${escapeAttr(item?.hint || "")}" placeholder="補助テキスト（省略可）" />
        </div>
        <div class="settings-form-row" id="mgr-item-value-row"${isTemplateItem ? " hidden" : ""}>
          <input class="settings-input" id="mgr-item-value" type="text" value="${escapeAttr(isTemplateItem ? "" : item?.value || "")}" placeholder="コピーするテキスト または URL" />
        </div>
        <div class="settings-form-row" id="mgr-template-value-row"${isTemplateItem ? "" : " hidden"}>
          <label class="settings-label">テンプレート本文</label>
          <textarea class="settings-textarea" id="mgr-item-template-value" rows="8" placeholder="例:&#10;件名: ご連絡 {TODAY:YYYY/MM/DD}&#10;&#10;お世話になっております。">${escapeHtml(isTemplateItem ? item?.value || "" : "")}</textarea>
          <p class="settings-help">日付プレースホルダー: <code>{TODAY}</code> 今日 &nbsp; <code>{NOW}</code> 現在日時 &nbsp; <code>{DATE:+1d}</code> 明日 &nbsp; 単位: d=日 w=週 M=月 y=年 h=時間 m=分<br>
          フォーマット: <code>{TODAY:YYYY年MM月DD日(ddd)}</code> / <code>{NOW:MM/DD HH:mm}</code></p>
        </div>`;
    }

    html += `
      <div class="settings-form-actions">
        <button class="settings-btn settings-btn--primary" data-action="${saveAction}" data-section-id="${section.id}"${isEdit ? ` data-item-id="${item.id}"` : ""}>保存</button>
        ${isEdit ? `<button class="settings-btn" data-action="cancel-edit-item-mgr" data-section-id="${section.id}">キャンセル</button>` : ""}
      </div>`;
    return html;
  },

  /** コピー登録（一括インポート）フォームのHTML生成 */
  _buildBulkForm(section) {
    const isTable = section.type === "table";
    const isGrid = section.type === "grid";
    const isChecklist = section.type === "checklist";
    const isCountdown = section.type === "countdown";
    const cols = section.columns || [];
    let hint, placeholder;

    if (isCountdown) {
      hint = `1行に1件のマイルストーンを入力してください。列は <strong>Tab</strong> 区切りです。<br>
        フォーマット: <code>マイルストーン名\tYYYY-MM-DD</code><br>
        <code>#</code> で始まる行はコメントとして無視されます。`;
      placeholder = "リリース v1.0\t2026-04-01\nステージング\t2026-03-31";
    } else if (isChecklist) {
      hint = `1行に1件のアイテム名を入力してください。<br>
        <code>#</code> で始まる行はコメントとして無視されます。`;
      placeholder = "アイテム1\nアイテム2\nアイテム3";
    } else if (isTable) {
      const colNames = cols.map((c) => c.label).join("\t");
      hint = `1行に1件のデータを入力してください。列は <strong>Tab</strong> 区切りです。<br>
        列の順番: <code>${escapeHtml(colNames || "列1\t列2\t列3")}</code><br>
        <code>#</code> で始まる行はコメントとして無視されます。`;
      placeholder = cols.map((c) => c.label).join("\t");
    } else if (isGrid) {
      hint = `1行に1件のデータを入力してください。列は <strong>Tab</strong> 区切りです。<br>
        フォーマット: <code>カード名\t値（URL またはコピーするテキスト）</code><br>
        または: <code>絵文字\tカード名\t値</code>（3列の場合は先頭を絵文字として使用）<br>
        URL の場合はリンク、それ以外はコピーとして登録されます。<br>
        <code>#</code> で始まる行はコメントとして無視されます。`;
      placeholder =
        "カード名\thttps://example.com\n📄\t書類テンプレート\thttps://example.com/doc";
    } else {
      hint = `1行に1件のデータを入力してください。列は <strong>Tab</strong> 区切りです。<br>
        フォーマット: <code>ラベル\tコピーするテキスト（または URL）</code><br>
        または: <code>ラベル\tヒント\tコピーするテキスト（または URL）</code>（3列の場合）<br>
        URL の場合はリンク、それ以外はコピーとして登録されます。<br>
        <code>#</code> で始まる行はコメントとして無視されます。`;
      placeholder =
        "ラベル1\tコピーするテキスト\nラベル2\tヒントテキスト\thttps://example.com";
    }

    return `
      <p class="item-mgr__bulk-hint">${hint}</p>
      <textarea class="item-mgr__bulk-textarea" id="bulk-import-text" placeholder="${escapeAttr(placeholder)}" spellcheck="false"></textarea>
      <div class="settings-form-actions">
        <button class="settings-btn settings-btn--primary" data-action="save-bulk-items" data-section-id="${section.id}">一括追加</button>
      </div>`;
  },

  // ── バインド変数バー ──────────────────────────────

  renderEnvBar() {
    const bar = document.getElementById("bind-bar");
    if (!bar) return;
    const presets = State.presets;
    if (presets.length === 0) {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    const { uiType, barLabel } = State.bindConfig;
    const activeId = State.activePresetId;
    const labelHtml = barLabel
      ? `<span class="bind-bar__label">${escapeHtml(barLabel)}</span>`
      : "";

    if (uiType === "tabs") {
      const tabs = presets
        .map(
          (preset) =>
            `<button class="bind-tab${preset.id === activeId ? " is-active" : ""}"
                 data-action="switch-preset" data-preset-id="${preset.id}">
          ${escapeHtml(preset.name)}
        </button>`,
        )
        .join("");
      bar.innerHTML = `<div class="bind-bar__inner bind-bar__inner--tabs">
        ${labelHtml}
        <div class="bind-tabs">${tabs}</div>
      </div>`;
    } else if (uiType === "segment") {
      const items = presets
        .map(
          (preset) =>
            `<label class="bind-segment__item">
          <input type="radio" name="preset-radio-${_instanceId}" value="${preset.id}" ${preset.id === activeId ? "checked" : ""} />
          ${escapeHtml(preset.name)}
        </label>`,
        )
        .join("");
      bar.innerHTML = `<div class="bind-bar__inner bind-bar__inner--segment">
        ${labelHtml}
        <div class="bind-segment">${items}</div>
      </div>`;
      // セグメントのラジオイベントをバインド（委譲できないため直接）
      bar.querySelectorAll("input[type=radio]").forEach((radio) => {
        radio.addEventListener("change", () => {
          EventHandlers.switchPreset(Number(radio.value));
        });
      });
    } else {
      // select（デフォルト）
      const options =
        `<option value="">-- 選択なし --</option>` +
        presets
          .map(
            (preset) =>
              `<option value="${preset.id}" ${preset.id === activeId ? "selected" : ""}>${escapeHtml(preset.name)}</option>`,
          )
          .join("");
      bar.innerHTML = `<div class="bind-bar__inner">
        ${labelHtml}
        <select class="cs-target kn-select--grow" id="preset-select">${options}</select>
      </div>`;
      const sel = bar.querySelector("#preset-select");
      if (sel) {
        sel.addEventListener("change", () => {
          EventHandlers.switchPreset(sel.value ? Number(sel.value) : null);
        });
        CustomSelect.create(sel);
      }
    }
  },

  // ── Markdown セクション ──────────────────────────────

  buildMarkdownSection(section, bd) {
    const body = section.body || "";
    // 表示エリア
    const displayDiv = document.createElement("div");
    displayDiv.className = "md-body";
    if (body.trim()) {
      const resolved = resolveBindVars(body);
      let rawHtml;
      if (typeof marked !== "undefined") {
        rawHtml = marked.parse(resolved);
      } else {
        rawHtml = escapeHtml(resolved).replace(/\n/g, "<br>");
      }
      const sanitized = typeof DOMPurify !== "undefined"
        ? DOMPurify.sanitize(rawHtml, { ADD_ATTR: ["target", "rel"] })
        : rawHtml;
      displayDiv.innerHTML = sanitized;
      // リンクを新しいタブで開く
      displayDiv.querySelectorAll("a").forEach((a) => {
        a.target = "_blank";
        a.rel = "noopener noreferrer";
      });
      // コードブロックにコピーボタンを追加
      displayDiv.querySelectorAll("pre code").forEach((codeEl) => {
        const pre = codeEl.closest("pre");
        pre.style.position = "relative";
        const copyBtn = document.createElement("button");
        copyBtn.className = "md-code-copy-btn";
        copyBtn.innerHTML = Icons.copyFill;
        copyBtn.title = "コピー";
        copyBtn.addEventListener("click", () => {
          Clipboard.copy(codeEl.textContent).then(() => {
            showToast("コピーしました");
          });
        });
        pre.appendChild(copyBtn);
      });
    } else {
      displayDiv.innerHTML = `<p class="section-empty">コンテンツが空です。ヘッダーの編集ボタン（✎）から追加してください。</p>`;
    }
    bd.appendChild(displayDiv);

    // 編集パネル（hidden）
    const editPanel = document.createElement("div");
    editPanel.className = "md-edit-panel";
    editPanel.hidden = true;
    editPanel.innerHTML = `
      <textarea class="md-edit-textarea" id="md-edit-${section.id}" rows="14">${escapeHtml(body)}</textarea>
      <div class="md-edit-actions">
        <button class="btn btn--primary btn--sm" data-action="save-markdown-body" data-section-id="${section.id}">保存</button>
        <button class="btn btn--sm" data-action="cancel-md-edit" data-section-id="${section.id}">キャンセル</button>
      </div>
    `;
    bd.appendChild(editPanel);
  },

  // ── iframe セクション ────────────────────────────────

  buildIframeSection(section, bd) {
    const url = section.url || "";
    const resolvedUrl = url ? resolveBindVars(url) : "";
    if (!resolvedUrl.trim()) {
      bd.innerHTML = `<p class="section-empty">URLが設定されていません。設定から追加してください。</p>`;
      return;
    }
    const wrap = document.createElement("div");
    wrap.className = "iframe-wrap";

    const externalLink = document.createElement("a");
    externalLink.className = "iframe-external-link";
    externalLink.href = resolvedUrl;
    externalLink.target = "_blank";
    externalLink.rel = "noopener noreferrer";
    externalLink.title = "別タブで開く";
    externalLink.innerHTML = `${Icons.external} 別タブで開く`;
    wrap.appendChild(externalLink);

    const iframe = document.createElement("iframe");
    iframe.src = resolvedUrl;
    iframe.style.height = `${section.iframe_height || 400}px`;
    iframe.className = "section-iframe";
    iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms");
    iframe.setAttribute("loading", "lazy");
    wrap.appendChild(iframe);
    bd.appendChild(wrap);
  },

  // ── カウントダウンセクション ──────────────────────────

  buildCountdownSection(section, items, bd) {
    bd.innerHTML = "";
    const sId = section.id;
    const mode = section.countdown_mode || "calendar";
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // アイテムリスト
    if (items.length === 0) {
      const emptyEl = document.createElement("p");
      emptyEl.className = "section-empty";
      emptyEl.textContent = "マイルストーンがありません。";
      bd.appendChild(emptyEl);
    } else {
      const listEl = document.createElement("div");
      listEl.className = "countdown-list";
      items.forEach((item) => {
        const label = resolveBindVars(item.label || "");
        const dateStr = item.value || "";
        let days = null;
        if (dateStr) {
          const target = new Date(dateStr);
          target.setHours(0, 0, 0, 0);
          if (isNaN(target.getTime())) {
            days = null;
          } else if (mode === "business") {
            days = Renderer._countBusinessDays(today, target);
          } else {
            days = Math.round((target - today) / 86400000);
          }
        }

        const card = document.createElement("div");
        card.className = "countdown-card";
        let daysHtml = "";
        if (days === null) {
          daysHtml = `<span class="countdown-days countdown-days--no-date">-- 日</span>`;
        } else if (days === 0) {
          card.classList.add("countdown-card--today");
          daysHtml = `<span class="countdown-days countdown-days--today">今日！</span>`;
        } else if (days < 0) {
          card.classList.add("countdown-card--overdue");
          daysHtml = `<span class="countdown-days countdown-days--overdue">${Math.abs(days)}日超過</span>`;
        } else if (days <= 7) {
          card.classList.add("countdown-card--warning");
          daysHtml = `<span class="countdown-days countdown-days--warning">あと ${days} 日</span>`;
        } else {
          daysHtml = `<span class="countdown-days">あと ${days} 日</span>`;
        }
        const modeLabel = mode === "business"
          ? `<span class="countdown-mode-badge">営業日</span>` : "";
        card.innerHTML = `
          <div class="countdown-info">
            <button class="countdown-label-btn" data-action="edit-countdown-label"
                    data-item-id="${item.id}" data-section-id="${sId}" title="クリックして編集">
              ${escapeHtml(label)}
            </button>
            <button class="countdown-date-btn${dateStr ? "" : " settings-date-btn--empty"}" data-action="edit-countdown-date"
                    data-item-id="${item.id}" data-section-id="${sId}"
                    title="日付を変更">
              ${dateStr ? escapeHtml(dateStr) : '<span class="countdown-date-btn__placeholder">日付を設定...</span>'}
              ${Icons.edit}
            </button>
          </div>
          <div class="countdown-right">
            ${daysHtml}
            ${modeLabel}
            <button class="countdown-delete-btn" data-action="delete-countdown-item"
                    data-item-id="${item.id}" data-section-id="${sId}" title="削除">
              ${Icons.close}
            </button>
          </div>
        `;
        listEl.appendChild(card);
      });
      bd.appendChild(listEl);
    }

    // インライン追加フォーム
    const addForm = document.createElement("div");
    addForm.className = "countdown-add-form";
    addForm.id = `countdown-add-form-${sId}`;
    addForm.hidden = true;
    addForm.innerHTML = `
      <input class="countdown-add-label" id="countdown-add-label-${sId}"
             type="text" placeholder="マイルストーン名" />
      <input type="hidden" id="countdown-add-date-${sId}" />
      <button type="button" class="settings-date-btn settings-date-btn--empty countdown-add-date-btn"
              data-action="open-countdown-date" data-hidden-id="countdown-add-date-${sId}">
        ${Icons.calendar}
        <span class="settings-date-btn__text">日付を選択...</span>
      </button>
      <div class="countdown-add-form__actions">
        <button class="btn btn--primary btn--sm" data-action="save-countdown-add"
                data-section-id="${sId}">追加</button>
        <button class="btn btn--ghost btn--sm" data-action="cancel-countdown-add"
                data-section-id="${sId}">キャンセル</button>
      </div>
    `;
    bd.appendChild(addForm);

    // 追加ボタン
    const addBtn = document.createElement("button");
    addBtn.className = "countdown-add-btn";
    addBtn.dataset.action = "toggle-countdown-add";
    addBtn.dataset.sectionId = String(sId);
    addBtn.innerHTML = `${Icons.close.replace('close', 'countdown-add-icon')} マイルストーンを追加`;
    // close アイコン流用せず専用の + を使う
    addBtn.innerHTML = `<span class="countdown-add-icon">＋</span> マイルストーンを追加`;
    bd.appendChild(addBtn);
  },

  /** 営業日数計算（土日を除外、start から end まで） */
  _countBusinessDays(start, end) {
    const sign = end >= start ? 1 : -1;
    const from = sign === 1 ? new Date(start) : new Date(end);
    const to = sign === 1 ? new Date(end) : new Date(start);
    let count = 0;
    const cur = new Date(from);
    while (cur < to) {
      const day = cur.getDay();
      if (day !== 0 && day !== 6) count++;
      cur.setDate(cur.getDate() + 1);
    }
    return count * sign;
  },

  // ── メモセクション ────────────────────────────────────

  buildMemoSection(section, bd) {
    const content = section.memo_content || "";
    if (!content.trim()) {
      bd.innerHTML = `<p class="section-empty">メモが空です。設定からテキストを追加してください。</p>`;
      return;
    }
    const div = document.createElement("div");
    div.className = "memo-content";
    div.innerHTML = Renderer._renderMarkdown(content);
    bd.appendChild(div);
  },

  /** シンプルな Markdown レンダリング（行単位処理） */
  _renderMarkdown(text) {
    if (!text) return "";
    const lines = text.split("\n");
    let html = "";
    let inList = false;
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      let line = escapeHtml(raw);
      // 太字・斜体・コード
      line = line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      line = line.replace(/\*(.+?)\*/g, "<em>$1</em>");
      line = line.replace(
        /`(.+?)`/g,
        '<code class="memo-inline-code">$1</code>',
      );
      if (raw.startsWith("- ")) {
        if (!inList) {
          html += '<ul class="memo-list">';
          inList = true;
        }
        html += `<li>${line.slice(2)}</li>`;
      } else {
        if (inList) {
          html += "</ul>";
          inList = false;
        }
        html += raw === "" ? "<br>" : line + "<br>";
      }
    }
    if (inList) html += "</ul>";
    return html;
  },

  // ── チェックリストセクション ────────────────────────────

  buildChecklistSection(section, items, bd) {
    if (items.length === 0) {
      bd.innerHTML = `<p class="section-empty">アイテムがありません。設定から追加してください。</p>`;
      return;
    }

    // 期間リセット（日・週・月・年）
    const reset = section.checklist_reset || "never";
    if (reset !== "never") {
      const dateKey = CHECKLIST_DATE_PREFIX + section.id;
      const now = new Date();
      let periodKey;
      if (reset === "daily") {
        periodKey = now.toISOString().slice(0, 10); // YYYY-MM-DD
      } else if (reset === "weekly") {
        // ISO週: 月曜始まりの週番号 YYYY-Www
        const d = new Date(
          Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()),
        );
        const day = d.getUTCDay() || 7; // 日=7に変換
        d.setUTCDate(d.getUTCDate() + 4 - day); // 木曜に移動
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        const weekNum = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
        periodKey = `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
      } else if (reset === "monthly") {
        periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`; // YYYY-MM
      } else if (reset === "yearly") {
        periodKey = String(now.getFullYear()); // YYYY
      }
      if (localStorage.getItem(dateKey) !== periodKey) {
        localStorage.removeItem(CHECKLIST_STATE_PREFIX + section.id);
        localStorage.setItem(dateKey, periodKey);
      }
    }

    const checked =
      loadJsonFromStorage(CHECKLIST_STATE_PREFIX + section.id) || {};
    const total = items.length;
    const doneCount = items.filter((i) => checked[i.id]).length;

    // 進捗バー
    const progressWrap = document.createElement("div");
    progressWrap.className = "checklist-progress";
    progressWrap.innerHTML = `
      <div class="checklist-progress__bar">
        <div class="checklist-progress__fill" style="width: ${total > 0 ? Math.round((doneCount / total) * 100) : 0}%"></div>
      </div>
      <span class="checklist-progress__text">${doneCount} / ${total}</span>
    `;
    bd.appendChild(progressWrap);

    items.forEach((item) => {
      const isChecked = checked[item.id] === true;
      const row = document.createElement("label");
      row.className = `checklist-item${isChecked ? " is-checked" : ""}`;
      row.innerHTML = `
        <input type="checkbox" class="checklist-cb"
               data-checklist-section-id="${section.id}"
               data-checklist-item-id="${item.id}"
               ${isChecked ? "checked" : ""} />
        <span class="checklist-check-icon">${Icons.checkmark}</span>
        <span class="checklist-label">${escapeHtml(item.label || "")}</span>
      `;
      bd.appendChild(row);
    });
  },

  // ── セクションジャンプナビ ────────────────────────────

  renderJumpNav() {
    const nav = document.getElementById("section-nav");
    if (!nav) return;
    if (State.sections.length < 3) {
      nav.hidden = true;
      return;
    }
    nav.hidden = false;
    const itemsHtml = State.sections
      .map(
        (
          s,
        ) => `<button class="section-nav__item" data-action="jump-to-section" data-section-id="${s.id}">
        <span class="section-nav__item-icon">${escapeHtml(s.icon || "📋")}</span>
        ${escapeHtml(s.title)}
      </button>`,
      )
      .join("");
    nav.innerHTML = `
      <button class="section-nav__toggle" data-action="toggle-jump-nav" title="セクションへジャンプ">
        ${Icons.hamburger}
      </button>
      <div class="section-nav__menu" id="section-nav-menu" hidden>
        ${itemsHtml}
      </div>
    `;
  },
};

// ==============================
