// ==============================
// 定数
// ==============================

/** セクションタイプのラベル */
const TYPE_LABELS = {
  list: "リスト",
  grid: "グリッド",
  command_builder: "コマンドビルダー",
  table: "テーブル",
  memo: "メモ",
  checklist: "チェックリスト",
};

/** コマンドビルダー履歴の localStorage キープレフィックス（ブラウザ固有の UI 状態） */
const CMD_HISTORY_PREFIX = "dashboard_url_history_";

/** セクション折りたたみ状態の localStorage キープレフィックス（ブラウザ固有） */
const COLLAPSE_PREFIX = "dashboard_collapsed_";

/** チェックリスト状態の localStorage キープレフィックス（ブラウザ固有） */
const CHECKLIST_STATE_PREFIX = "dashboard_checklist_";

/** チェックリスト最終リセット日の localStorage キープレフィックス（ブラウザ固有） */
const CHECKLIST_DATE_PREFIX = "dashboard_checklist_date_";

/** テーブル列の非表示状態保存用 localStorage キープレフィックス（ブラウザ固有の UI 状態） */
const TABLE_COL_HIDDEN_PREFIX = "dashboard_table_hidden_cols_";

/** テーブルセクション独自バインド変数のアクティブプリセット保存用 localStorage キープレフィックス（ブラウザ固有） */
const TABLE_ACTIVE_PRESET_PREFIX = "dashboard_table_active_preset_";

/** リストセクション独自バインド変数のアクティブプリセット保存用 localStorage キープレフィックス（ブラウザ固有） */
const LIST_ACTIVE_PRESET_PREFIX = "dashboard_list_active_preset_";

/** グリッドセクション独自バインド変数のアクティブプリセット保存用 localStorage キープレフィックス（ブラウザ固有） */
const GRID_ACTIVE_PRESET_PREFIX = "dashboard_grid_active_preset_";

/** 選択中のプリセットID の localStorage キー（ブラウザ固有の UI 状態） */
const ACTIVE_PRESET_KEY_PREFIX = "dashboard_active_preset_";

// SVGアイコンは js/base/icons.js の Icons を使用

// ==============================
// ユーティリティ
// ==============================

// HTML エスケープ / 属性エスケープ: js/base/utils.js の escapeHtml を使用
const escapeAttr = escapeHtml;

/** URL バリデーション */
const isValidUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

// トースト通知: js/base/toast.js の Toast.show() を使用
const showToast = (msg = "コピーしました", type) => Toast.show(msg, type);

// URLパラメータから instance ID を取得（複数ホームタブ対応）
const _instanceId = new URLSearchParams(location.search).get("instance") || "";

/** 選択中のプリセットID を保存する localStorage キー */
const ACTIVE_PRESET_KEY = ACTIVE_PRESET_KEY_PREFIX + _instanceId;

// ==============================
// DashboardDB - IndexedDB 管理（js/db/dashboard_db.js を参照）
// ==============================

// ==============================
// State
// ==============================

const State = {
  db: null,
  sections: [], // position 昇順
  itemsMap: {}, // sectionId → items[]
  presets: [], // position 昇順
  activePresetId: null,
  bindConfig: { varNames: [], uiType: "select" },
  tableSortState: {}, // sectionId → { colId, dir: 'asc' | 'desc' }
  tablePageState: {}, // sectionId → 現在のページ番号（0始まり）
  settings: {
    open: false,
    view: "sections", // 'sections' | 'edit-section'
    editingSectionId: null,
    editingPresetId: null,
    editingTablePresetId: null,
  },
  // アイテム管理モーダルの状態
  itemMgr: {
    sectionId: null,
    editingId: null,
    formTab: "add", // 'add' | 'bulk'
  },
};

// ==============================
// 共通バインド変数の解決
// ==============================

/** 選択中のプリセットのバインド変数を解決する（{変数名} → 値に置換） */
const resolveBindVars = (str) => {
  if (!str) return str || "";
  const preset = State.presets.find((p) => p.id === State.activePresetId);
  if (!preset) return str;
  return str.replace(/\{([^}]+)\}/g, (m, key) => {
    // {INPUT} はコマンドビルダー専用なのでスキップ
    if (key === "INPUT") return m;
    return preset.values && preset.values[key] !== undefined
      ? preset.values[key]
      : m;
  });
};

/** セクション独自バインド変数を解決する（table/list/grid セクションに対応） */
const resolveSectionVars = (str, sectionId) => {
  if (!str) return str || "";
  const section = State.sections.find((s) => s.id === sectionId);
  if (!section) return str;
  let presets, activePrefix;
  if (section.type === "table") {
    presets = section.table_presets || [];
    activePrefix = TABLE_ACTIVE_PRESET_PREFIX;
  } else if (section.type === "list") {
    presets = section.list_presets || [];
    activePrefix = LIST_ACTIVE_PRESET_PREFIX;
  } else if (section.type === "grid") {
    presets = section.grid_presets || [];
    activePrefix = GRID_ACTIVE_PRESET_PREFIX;
  } else {
    return str;
  }
  if (presets.length === 0) return str;
  const activeId = loadJsonFromStorage(activePrefix + sectionId);
  const preset = activeId != null ? presets.find((p) => p.id === activeId) : null;
  if (!preset) return str;
  const vals = preset.values || {};
  if (Object.keys(vals).length === 0) return str;
  return str.replace(/\{([^}]+)\}/g, (m, key) => (key in vals ? vals[key] : m));
};
/** テーブルセクション独自バインド変数を解決する（後方互換 alias） */
const resolveTableVars = (str, sectionId) => resolveSectionVars(str, sectionId);

// ==============================
// テンプレート日付変数の解決
// ==============================

/**
 * テンプレート内の日付プレースホルダーを現在日時で解決する
 *
 * 書式:
 *   {TODAY}                    → 今日の日付 (YYYY/MM/DD)
 *   {TODAY:YYYY年MM月DD日(ddd)} → フォーマット指定（曜日含む）
 *   {NOW}                      → 現在日時 (YYYY/MM/DD HH:mm)
 *   {NOW:HH:mm}                → フォーマット指定
 *   {DATE:+1d}                 → 明日 (YYYY/MM/DD)
 *   {DATE:+1d:MM/DD(ddd)}      → 明日の日付＋曜日
 *   {DATE:-2h:HH:mm}           → 2時間前の時刻
 *   {DATE:+30m:HH:mm}          → 30分後の時刻
 *   単位: d=日 w=週 M=月 y=年 h=時間 m=分
 *
 * フォーマットトークン:
 *   YYYY MM DD HH mm ss
 *   ddd  → 曜日短縮形（日,月,火,水,木,金,土）
 *   dddd → 曜日長形（日曜日〜土曜日）
 */
const resolveDateVars = (str) => {
  if (!str) return str || "";

  const pad = (n) => String(n).padStart(2, "0");
  const DAY_SHORT = ["日", "月", "火", "水", "木", "金", "土"];
  const DAY_LONG = [
    "日曜日",
    "月曜日",
    "火曜日",
    "水曜日",
    "木曜日",
    "金曜日",
    "土曜日",
  ];

  const formatDate = (d, fmt) => {
    // dddd（長形）を先に置換してから ddd（短縮形）を置換する
    return (fmt || "YYYY/MM/DD")
      .replace("dddd", DAY_LONG[d.getDay()])
      .replace("ddd", DAY_SHORT[d.getDay()])
      .replace("YYYY", d.getFullYear())
      .replace("MM", pad(d.getMonth() + 1))
      .replace("DD", pad(d.getDate()))
      .replace("HH", pad(d.getHours()))
      .replace("mm", pad(d.getMinutes()))
      .replace("ss", pad(d.getSeconds()));
  };

  const applyOffset = (date, offset) => {
    // 単位: d=日 w=週 M=月 y=年 h=時間 m=分
    const match = offset.match(/^([+-])(\d+)([dwMyhm])$/);
    if (!match) return date;
    const sign = match[1] === "+" ? 1 : -1;
    const n = parseInt(match[2], 10) * sign;
    const unit = match[3];
    const d = new Date(date);
    if (unit === "d") d.setDate(d.getDate() + n);
    else if (unit === "w") d.setDate(d.getDate() + n * 7);
    else if (unit === "M") d.setMonth(d.getMonth() + n);
    else if (unit === "y") d.setFullYear(d.getFullYear() + n);
    else if (unit === "h") d.setHours(d.getHours() + n);
    else if (unit === "m") d.setMinutes(d.getMinutes() + n);
    return d;
  };

  const now = new Date();
  return str.replace(
    /\{(TODAY|NOW|DATE)(?::([^:}]*))?(?::([^}]*))?\}/g,
    (m, type, arg1, arg2) => {
      if (type === "TODAY") {
        return formatDate(now, arg1 || "YYYY/MM/DD");
      } else if (type === "NOW") {
        return formatDate(now, arg1 || "YYYY/MM/DD HH:mm");
      } else if (type === "DATE") {
        const offset = arg1 || "+0d";
        const fmt = arg2 || "YYYY/MM/DD";
        return formatDate(applyOffset(now, offset), fmt);
      }
      return m;
    },
  );
};

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

    // アイテム一覧（command_builder・memo 以外）
    if (!isCmdBuilder && !isMemo) {
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
    if (isTable) {
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
    const columns = section.columns || [];
    let html = "";

    if (isGrid) {
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
    if (section.type === "table") {
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
    const columns = section.columns || [];
    let html = "";

    if (isGrid) {
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
    const cols = section.columns || [];
    let hint, placeholder;

    if (isTable) {
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
    };
    const newId = await State.db.addSection(data);
    data.id = newId;
    data.instance_id = State.db.instanceId; // updateSection 時に instance_id が消えないよう保持
    State.sections.push(data);
    State.itemsMap[newId] = [];

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
    const msg =
      items.length > 0
        ? `このセクションには ${items.length} 件のアイテムがあります。削除しますか？`
        : "このセクションを削除しますか？";
    if (!confirm(msg)) return;

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
    await State.db.updateSection(section);
    document.getElementById("settings-title").textContent =
      `${section.icon || ""} ${section.title}`;
    Renderer.renderDashboard();
    showToast("保存しました", "success");
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

    if (section.type === "grid") {
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

    if (section.type === "grid") {
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

    if (section.type === "grid") {
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

    if (section.type === "grid") {
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
      showToast("データが入力されていません", "error");
      return;
    }

    const items = State.itemsMap[sectionId] || [];
    let maxPos =
      items.length > 0 ? Math.max(...items.map((i) => i.position)) + 1 : 0;
    const newItems = [];

    for (const line of lines) {
      const cols = line.split("\t");
      const data = { section_id: sectionId, position: maxPos++ };

      if (section.type === "table") {
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

    showToast(`${newItems.length}件を追加しました`, "success");
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
      // position:fixed でカードの overflow:hidden をバイパス
      const btn = document.querySelector(
        `[data-action="toggle-table-col-menu"][data-section-id="${sectionId}"]`,
      );
      if (btn) {
        const rect = btn.getBoundingClientRect();
        menu.style.top = `${rect.bottom + 4}px`;
        menu.style.right = `${window.innerWidth - rect.right}px`;
        menu.style.left = "auto";
      }
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
      if (result) window.open(result, "_blank");
    } else {
      navigator.clipboard.writeText(result);
      showToast("コピーしました", "success");
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
        showToast("インポートしました", "success");
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
    showToast("保存しました", "success");
  },

  // ── チェックリスト設定保存 ───────────────────────────

  async saveSectionChecklist(sectionId) {
    const section = State.sections.find((s) => s.id === sectionId);
    if (!section) return;
    section.checklist_reset =
      document.getElementById("edit-section-checklist-reset")?.value || "never";
    await State.db.updateSection(section);
    Renderer.renderDashboard();
    showToast("保存しました", "success");
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

    // Esc キーでアイテム管理モーダルを閉じる
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        const modal = document.getElementById("item-manager-modal");
        if (modal && !modal.hidden) {
          EventHandlers.closeItemManager();
        }
      }
    });

    // 親フレームからのメッセージを受信
    window.addEventListener("message", (e) => {
      // 設定パネル開封要求（タブ設定の「ページを設定」ボタン用）
      if (e.data?.type === "dashboard:open-settings") {
        EventHandlers.openSettings();
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
        navigator.clipboard.writeText(resolved);
        showToast("コピーしました", "success");
        return;
      }
      // ダッシュボードのリンク行（共通バインド変数を解決してリンクを開く）
      const linkEl = e.target.closest(".js-link");
      if (linkEl && !linkEl.closest(".home-settings")) {
        const card = linkEl.closest(".card[data-section-id]");
        const secId = card ? Number(card.dataset.sectionId) : null;
        const rawVal = linkEl.dataset.value || "";
        const url = resolveBindVars(secId ? resolveTableVars(rawVal, secId) : rawVal);
        if (url) window.open(url, "_blank");
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
        navigator.clipboard.writeText(resolved);
        showToast("コピーしました", "success");
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
      if (!e.target.closest(".data-table-col-toggle-wrap")) {
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
