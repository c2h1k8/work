// ==============================
// 定数
// ==============================

/** セクションタイプのラベル */
const TYPE_LABELS = {
  list: 'リスト',
  grid: 'グリッド',
  command_builder: 'コマンドビルダー',
  table: 'テーブル',
};

/** コマンドビルダー履歴の localStorage キープレフィックス（ブラウザ固有の UI 状態） */
const CMD_HISTORY_PREFIX = 'dashboard_url_history_';

/** テーブル列の非表示状態保存用 localStorage キープレフィックス（ブラウザ固有の UI 状態） */
const TABLE_COL_HIDDEN_PREFIX = 'dashboard_table_hidden_cols_';

/** 選択中の環境ID の localStorage キー（ブラウザ固有の UI 状態） */
const ACTIVE_ENV_KEY_PREFIX = 'dashboard_active_env_';

// ==============================
// SVG アイコン
// ==============================

const ICONS = {
  copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,
  link: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
  clipboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  clipboardSm: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  external: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
  arrow: `<svg class="sheet-card__arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7M17 7H7M17 7v10"/></svg>`,
  clock: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  urlLinkIcon: `<svg class="url-history__item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
  columns: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>`,
};

// ==============================
// ユーティリティ
// ==============================

/** HTML 特殊文字をエスケープ */
const escapeHtml = (str) =>
  String(str ?? '').replace(/[&<>"']/g, (m) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])
  );

/** 属性値をエスケープ（escapeHtml と同じ） */
const escapeAttr = escapeHtml;

/** URL バリデーション */
const isValidUrl = (url) => {
  try { new URL(url); return true; } catch { return false; }
};

/** トーストタイマー */
let _toastTimer = null;

/** トーストを表示 */
const showToast = (msg = 'コピーしました') => {
  const toast = document.getElementById('copy-toast');
  const textEl = toast.querySelector('.toast-text');
  if (textEl) textEl.textContent = msg;
  toast.classList.add('is-visible');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2000);
};

// URLパラメータから instance ID を取得（複数ホームタブ対応）
const _instanceId = new URLSearchParams(location.search).get('instance') || '';

/** 選択中の環境ID を保存する localStorage キー */
const ACTIVE_ENV_KEY = ACTIVE_ENV_KEY_PREFIX + _instanceId;

// ==============================
// HomeDB - IndexedDB 管理
// ==============================

class HomeDB {
  constructor() {
    this.db = null;
    this.DB_NAME = 'dashboard_db';  // 全インスタンス共有の単一DB
    this.DB_VERSION = 4;
    this.instanceId = _instanceId;  // このインスタンスのID
  }

  open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        const tx = e.target.transaction;
        if (e.oldVersion < 1) {
          // sections ストア（instance_id インデックス付き）
          const ss = db.createObjectStore('sections', { keyPath: 'id', autoIncrement: true });
          ss.createIndex('position', 'position');
          ss.createIndex('instance_id', 'instance_id');
          const is = db.createObjectStore('items', { keyPath: 'id', autoIncrement: true });
          is.createIndex('section_id', 'section_id');
          is.createIndex('position', 'position');
        }
        if (e.oldVersion < 4) {
          // 環境バインド変数ストア（instance_id インデックス付き）
          const envStore = db.createObjectStore('environments', { keyPath: 'id', autoIncrement: true });
          envStore.createIndex('instance_id', 'instance_id');
          // アプリ設定ストア（varNames・uiType など）
          db.createObjectStore('app_config', { keyPath: 'name' });
        }
      };
      req.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this);
      };
      req.onerror = () => reject(req.error);
    });
  }

  _get(store, id) {
    return new Promise((resolve, reject) => {
      const req = this.db.transaction(store).objectStore(store).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  _getAll(store, indexName, query) {
    return new Promise((resolve, reject) => {
      const os = this.db.transaction(store).objectStore(store);
      const req = indexName ? os.index(indexName).getAll(query) : os.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  _add(store, data) {
    return new Promise((resolve, reject) => {
      const req = this.db.transaction(store, 'readwrite').objectStore(store).add(data);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  _put(store, data) {
    return new Promise((resolve, reject) => {
      const req = this.db.transaction(store, 'readwrite').objectStore(store).put(data);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  _delete(store, id) {
    return new Promise((resolve, reject) => {
      const req = this.db.transaction(store, 'readwrite').objectStore(store).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  _count(store) {
    return new Promise((resolve, reject) => {
      const req = this.db.transaction(store).objectStore(store).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // ── Sections ──────────────────────────

  getAllSections() {
    return new Promise((resolve, reject) => {
      const os = this.db.transaction('sections').objectStore('sections');
      const req = os.index('instance_id').getAll(IDBKeyRange.only(this.instanceId));
      req.onsuccess = () => resolve(req.result.sort((a, b) => a.position - b.position));
      req.onerror = () => reject(req.error);
    });
  }

  addSection(data) { return this._add('sections', { ...data, instance_id: this.instanceId }); }
  updateSection(data) { return this._put('sections', data); }

  async deleteSection(id) {
    // アイテムもカスケード削除
    const items = await this.getItemsBySection(id);
    const tx = this.db.transaction(['sections', 'items'], 'readwrite');
    tx.objectStore('sections').delete(id);
    items.forEach(item => tx.objectStore('items').delete(item.id));
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  countSections() {
    return new Promise((resolve, reject) => {
      const os = this.db.transaction('sections').objectStore('sections');
      const req = os.index('instance_id').count(IDBKeyRange.only(this.instanceId));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // ── Items ─────────────────────────────

  getItemsBySection(sectionId) {
    return this._getAll('items', 'section_id', IDBKeyRange.only(sectionId))
      .then(items => items.sort((a, b) => a.position - b.position));
  }

  addItem(data) { return this._add('items', data); }
  updateItem(data) { return this._put('items', data); }
  deleteItem(id) { return this._delete('items', id); }

  // ── 環境バインド変数 ──────────────────────────

  getAllEnvironments() {
    return new Promise((resolve, reject) => {
      const os = this.db.transaction('environments').objectStore('environments');
      const req = os.index('instance_id').getAll(IDBKeyRange.only(this.instanceId));
      req.onsuccess = () => resolve(req.result.sort((a, b) => a.position - b.position));
      req.onerror = () => reject(req.error);
    });
  }

  addEnvironment(data) { return this._add('environments', { ...data, instance_id: this.instanceId }); }
  updateEnvironment(data) { return this._put('environments', data); }
  deleteEnvironment(id) { return this._delete('environments', id); }

  // ── アプリ設定 ────────────────────────────

  async getAppConfig(key) {
    try {
      const fullKey = `${key}_${this.instanceId}`;
      const record = await this._get('app_config', fullKey);
      return record?.value ?? null;
    } catch { return null; }
  }

  async setAppConfig(key, value) {
    try {
      const fullKey = `${key}_${this.instanceId}`;
      return await this._put('app_config', { name: fullKey, value });
    } catch { return null; }
  }

  // ── エクスポート/インポート ────────────

  /** このインスタンスのデータをエクスポート */
  async exportInstance() {
    const sections = await this.getAllSections();
    const items = [];
    for (const section of sections) {
      const sectionItems = await this.getItemsBySection(section.id);
      items.push(...sectionItems);
    }
    const environments = await this.getAllEnvironments();
    const envConfig = await this.getAppConfig('env_config');
    return { sections, items, environments, envConfig };
  }

  /** このインスタンスのデータをインポート（replace=true なら既存を全削除してから追加） */
  async importInstance(data, replace = true) {
    if (replace) {
      const existing = await this.getAllSections();
      for (const s of existing) await this.deleteSection(s.id);
      const existingEnvs = await this.getAllEnvironments();
      for (const e of existingEnvs) await this.deleteEnvironment(e.id);
    }
    const idMap = {};
    for (const section of (data.sections || [])) {
      const oldId = section.id;
      const newSection = { ...section, instance_id: this.instanceId };
      delete newSection.id;
      const newId = await this._add('sections', newSection);
      if (oldId !== undefined) idMap[oldId] = newId;
    }
    for (const item of (data.items || [])) {
      const newItem = { ...item };
      delete newItem.id;
      if (idMap[newItem.section_id] !== undefined) {
        newItem.section_id = idMap[newItem.section_id];
        await this._add('items', newItem);
      }
    }
    for (const env of (data.environments || [])) {
      const newEnv = { ...env, instance_id: this.instanceId };
      delete newEnv.id;
      await this._add('environments', newEnv);
    }
    if (data.envConfig) {
      await this.setAppConfig('env_config', data.envConfig);
    }
  }

  /** このインスタンスのデータを全削除（タブ削除時に使用） */
  async deleteInstance() {
    const sections = await this.getAllSections();
    for (const s of sections) await this.deleteSection(s.id);
    const envs = await this.getAllEnvironments();
    for (const e of envs) await this.deleteEnvironment(e.id);
  }
}

// ==============================
// State
// ==============================

const State = {
  db: null,
  sections: [],    // position 昇順
  itemsMap: {},    // sectionId → items[]
  environments: [],  // position 昇順
  activeEnvId: null,
  envConfig: { varNames: ['IP', 'HOST_NAME'], uiType: 'select' },
  settings: {
    open: false,
    view: 'sections',      // 'sections' | 'edit-section' | 'env-settings' | 'edit-env'
    editingSectionId: null,
    editingEnvId: null,
  },
};

// ==============================
// 環境バインド変数の解決
// ==============================

/** 選択中の環境のバインド変数を解決する（{変数名} → 値に置換） */
const resolveEnvVars = (str) => {
  if (!str) return str || '';
  const env = State.environments.find(e => e.id === State.activeEnvId);
  if (!env) return str;
  return str.replace(/\{([^}]+)\}/g, (m, key) => {
    // {INPUT} はコマンドビルダー専用なのでスキップ
    if (key === 'INPUT') return m;
    return (env.values && env.values[key] !== undefined) ? env.values[key] : m;
  });
};

// ==============================
// Renderer
// ==============================

const Renderer = {

  // ── ダッシュボード ────────────────────

  renderDashboard() {
    const board = document.getElementById('home-board');
    board.innerHTML = '';
    State.sections.forEach(section => {
      const items = State.itemsMap[section.id] || [];
      board.appendChild(Renderer.buildSectionCard(section, items));
    });
  },

  buildSectionCard(section, items) {
    const el = document.createElement('section');
    el.className = 'card';
    el.dataset.sectionId = section.id;
    el.dataset.width = section.width || 'auto';

    // ヘッダー
    const hd = document.createElement('div');
    hd.className = 'card__hd';
    hd.innerHTML = `
      <span class="card__hd-icon">${escapeHtml(section.icon || '📋')}</span>
      <h2 class="card__hd-title">${escapeHtml(section.title)}</h2>
    `;
    el.appendChild(hd);

    // ボディ
    const bd = document.createElement('div');
    bd.className = 'card__bd';
    switch (section.type) {
      case 'list':        Renderer.buildListSection(section, items, bd); break;
      case 'grid':        Renderer.buildGridSection(section, items, bd); break;
      case 'command_builder': Renderer.buildCommandBuilderSection(section, bd); break;
      case 'table':       Renderer.buildTableSection(section, items, bd); break;
    }
    el.appendChild(bd);
    return el;
  },

  buildListSection(section, items, bd) {
    if (items.length === 0) {
      bd.innerHTML = `<p class="section-empty">アイテムがありません。設定から追加してください。</p>`;
      return;
    }
    items.forEach(item => {
      const row = document.createElement('a');
      row.className = `row ${item.item_type === 'copy' ? 'js-copy' : 'js-link'}`;
      row.href = 'javascript:void(0);';
      row.dataset.value = item.value || '';
      const cta = item.item_type === 'copy' ? ICONS.clipboard : ICONS.external;
      row.innerHTML = `
        <span class="row__label">${escapeHtml(resolveEnvVars(item.label || ''))}</span>
        ${item.hint ? `<span class="row__hint">${escapeHtml(resolveEnvVars(item.hint))}</span>` : ''}
        <span class="row__cta">${cta}</span>
      `;
      bd.appendChild(row);
    });
  },

  buildGridSection(section, items, bd) {
    if (items.length === 0) {
      bd.innerHTML = `<p class="section-empty">カードがありません。設定から追加してください。</p>`;
      return;
    }
    const grid = document.createElement('div');
    grid.className = 'sheet-grid';
    items.forEach(item => {
      // 'card' は後方互換で 'link' として扱う
      const isCopy = item.item_type === 'copy';
      const card = document.createElement('a');
      card.className = `sheet-card ${isCopy ? 'js-copy sheet-card--copy' : 'js-link'}`;
      card.href = 'javascript:void(0);';
      card.dataset.value = item.value || '';
      card.innerHTML = `
        <span class="sheet-card__emoji">${escapeHtml(item.emoji || (isCopy ? '📋' : '🔗'))}</span>
        <span class="sheet-card__name">${escapeHtml(resolveEnvVars(item.label || ''))}</span>
        ${isCopy ? ICONS.clipboard : ICONS.arrow}
      `;
      grid.appendChild(card);
    });
    bd.appendChild(grid);
  },

  buildCommandBuilderSection(section, bd) {
    const sectionId = section.id;
    const template = section.command_template || '';
    const isOpen = section.action_mode === 'open';
    const form = document.createElement('div');
    form.className = 'url-form';
    form.innerHTML = `
      <input id="url-input-${sectionId}" type="text" class="url-form__input" placeholder="入力値を入力..." />
      <button class="url-form__btn js-copy-cmd" data-section-id="${sectionId}" data-template="${escapeAttr(template)}" data-action-mode="${isOpen ? 'open' : 'copy'}">
        ${isOpen ? ICONS.link : ICONS.clipboard}
        ${isOpen ? 'URLを開く' : 'コマンドをコピー'}
      </button>
    `;
    bd.appendChild(form);

    const historyWrap = document.createElement('div');
    historyWrap.className = 'url-history';
    historyWrap.id = `url-history-${sectionId}`;
    bd.appendChild(historyWrap);
    // DOM に追加済みの要素を直接渡すことで getElementById を不要にする
    Renderer.renderCmdHistory(sectionId, historyWrap);
  },

  renderCmdHistory(sectionId, wrap) {
    wrap = wrap || document.getElementById(`url-history-${sectionId}`);
    if (!wrap) return;
    wrap.innerHTML = '';
    const urls = loadJsonFromStorage(CMD_HISTORY_PREFIX + sectionId);
    if (!urls || urls.length === 0) return;

    const hd = document.createElement('p');
    hd.className = 'url-history__hd';
    hd.innerHTML = `${ICONS.clock} 最近使ったテキスト`;
    wrap.appendChild(hd);

    const list = document.createElement('div');
    list.className = 'url-history__list';
    urls.forEach((url, i) => {
      const btn = document.createElement('button');
      btn.className = 'url-history__item';
      btn.title = url;
      btn.innerHTML = `
        <span class="url-history__item-num">${i + 1}</span>
        ${ICONS.urlLinkIcon}
        <span class="url-history__item-text">${escapeHtml(url)}</span>
        <span class="url-history__item-enter">↵ 選択</span>
      `;
      btn.addEventListener('click', () => {
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

    // 非表示列を localStorage から読み込む（ブラウザ固有の UI 状態）
    const hiddenCols = new Set(loadJsonFromStorage(TABLE_COL_HIDDEN_PREFIX + section.id) || []);

    // ツールバー（フィルタ入力 + 列切り替えボタン）
    const toolbar = document.createElement('div');
    toolbar.className = 'data-table-toolbar';

    const filterInput = document.createElement('input');
    filterInput.type = 'text';
    filterInput.className = 'data-table-filter';
    filterInput.placeholder = 'フィルタ...';
    toolbar.appendChild(filterInput);

    // 列切り替えドロップダウン
    const colToggleWrap = document.createElement('div');
    colToggleWrap.className = 'data-table-col-toggle-wrap';

    const colBtn = document.createElement('button');
    colBtn.className = 'data-table-col-btn';
    colBtn.dataset.action = 'toggle-table-col-menu';
    colBtn.dataset.sectionId = section.id;
    colBtn.innerHTML = `${ICONS.columns} 列`;
    colToggleWrap.appendChild(colBtn);

    const colMenu = document.createElement('div');
    colMenu.className = 'data-table-col-menu';
    colMenu.id = `table-col-menu-${section.id}`;
    colMenu.hidden = true;
    columns.forEach(col => {
      const label = document.createElement('label');
      label.className = 'data-table-col-menu__item';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !hiddenCols.has(col.id);
      cb.dataset.colId = col.id;
      cb.dataset.sectionId = section.id;
      label.appendChild(cb);
      label.appendChild(document.createTextNode(' ' + col.label));
      colMenu.appendChild(label);
    });
    colToggleWrap.appendChild(colMenu);
    toolbar.appendChild(colToggleWrap);
    bd.appendChild(toolbar);

    if (items.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'section-empty';
      empty.textContent = '行がありません。設定から追加してください。';
      bd.appendChild(empty);
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = 'data-table-wrap';
    const table = document.createElement('table');
    table.className = 'data-table';

    // ヘッダー
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    columns.forEach(col => {
      const th = document.createElement('th');
      th.textContent = col.label;
      th.dataset.colId = col.id;
      if (hiddenCols.has(col.id)) th.hidden = true;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // ボディ
    const tbody = document.createElement('tbody');
    items.forEach(item => {
      const row_data = item.row_data || {};
      const tr = document.createElement('tr');
      columns.forEach(col => {
        const td = document.createElement('td');
        td.dataset.colId = col.id;
        if (hiddenCols.has(col.id)) td.hidden = true;
        const val = row_data[col.id] || '';
        if (col.type === 'copy') {
          td.className = 'data-table__td--copy js-copy';
          td.dataset.value = val;  // コピー時に resolveEnvVars で解決
          td.innerHTML = `${escapeHtml(resolveEnvVars(val))}<span class="td-copy-icon">${ICONS.clipboardSm}</span>`;
        } else if (col.type === 'link' && val) {
          td.className = 'data-table__td--link';
          const a = document.createElement('a');
          a.className = 'js-link';
          a.href = 'javascript:void(0);';
          a.dataset.value = val;  // リンク時に resolveEnvVars で解決
          a.textContent = resolveEnvVars(val);
          td.appendChild(a);
        } else {
          td.textContent = resolveEnvVars(val);
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    bd.appendChild(wrap);

    // フィルタ入力イベント（行全体をリアルタイムでフィルタリング）
    filterInput.addEventListener('input', () => {
      const q = filterInput.value.trim().toLowerCase();
      tbody.querySelectorAll('tr').forEach(tr => {
        if (!q) { tr.hidden = false; return; }
        const matches = Array.from(tr.querySelectorAll('td')).some(td => {
          const text = (td.dataset.value || td.textContent || '').toLowerCase();
          return text.includes(q);
        });
        tr.hidden = !matches;
      });
    });
  },

  // ── 設定パネル ────────────────────────

  renderSettingsView() {
    const { view, editingSectionId } = State.settings;
    const body = document.getElementById('settings-body');
    const titleEl = document.getElementById('settings-title');
    const backBtn = document.getElementById('settings-back-btn');

    if (view === 'sections') {
      titleEl.textContent = 'ホーム設定';
      backBtn.hidden = true;
      body.innerHTML = Renderer.buildSectionsView();
    } else if (view === 'edit-section') {
      const section = State.sections.find(s => s.id === editingSectionId);
      titleEl.textContent = section ? `${section.icon || ''} ${section.title}` : 'セクション編集';
      backBtn.hidden = false;
      body.innerHTML = Renderer.buildEditSectionView(section);
    } else if (view === 'env-settings') {
      titleEl.textContent = '環境バインド変数';
      backBtn.hidden = false;
      body.innerHTML = Renderer.buildEnvSettingsView();
    } else if (view === 'edit-env') {
      const env = State.environments.find(e => e.id === State.settings.editingEnvId);
      titleEl.textContent = env ? env.name : '環境編集';
      backBtn.hidden = false;
      body.innerHTML = Renderer.buildEditEnvView(env);
    }
  },

  buildSectionsView() {
    const sections = State.sections;
    const envBadge = State.environments.length > 0
      ? `<span class="settings-nav-badge">${State.environments.length}</span>` : '';
    let html = `<div class="settings-nav-row">
      <button class="settings-nav-btn" data-action="show-env-settings">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M4.22 4.22l2.12 2.12m11.32 11.32 2.12 2.12M2 12h3m14 0h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg>
        環境バインド変数
        ${envBadge}
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
        <span class="settings-row__icon">${escapeHtml(section.icon || '📋')}</span>
        <span class="settings-row__title">${escapeHtml(section.title)}</span>
        <span class="settings-row__badge">${TYPE_LABELS[section.type] || section.type}</span>
        <div class="settings-row__actions">
          <button class="settings-btn" data-action="move-section-up" data-section-id="${section.id}" ${idx === 0 ? 'disabled' : ''}>↑</button>
          <button class="settings-btn" data-action="move-section-down" data-section-id="${section.id}" ${idx === sections.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="settings-btn settings-btn--primary" data-action="edit-section" data-section-id="${section.id}">編集</button>
          <button class="settings-btn settings-btn--danger" data-action="delete-section" data-section-id="${section.id}">削除</button>
        </div>
      </div>`;
    });

    html += `</div>
    <div class="settings-io-bar">
      <button class="settings-btn settings-io-btn" data-action="export-data">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        エクスポート
      </button>
      <button class="settings-btn settings-io-btn" data-action="import-data">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
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
        <select class="settings-select" id="new-section-type">
          <option value="list">リスト（コピー・リンク行）</option>
          <option value="grid">グリッド（カード型）</option>
          <option value="command_builder">コマンドビルダー</option>
          <option value="table">テーブル（自由列）</option>
        </select>
      </div>
      <div class="settings-form-row" id="new-section-action-row" hidden>
        <label class="settings-label">アクション</label>
        <select class="settings-select" id="new-section-action-mode">
          <option value="copy">コマンドをコピー（ターミナル用）</option>
          <option value="open">URLを開く（ブラウザ）</option>
        </select>
      </div>
      <div class="settings-form-row" id="new-section-cmd-row" hidden>
        <label class="settings-label">テンプレート（{INPUT} が入力値に置換されます）</label>
        <input class="settings-input" id="new-section-cmd" type="text" placeholder='open "https://www.google.com/search?q={INPUT}"' />
      </div>
      <div class="settings-form-row">
        <label class="settings-label">表示幅</label>
        <select class="settings-select" id="new-section-width">
          <option value="auto">自動（グリッド列幅）</option>
          <option value="wide">ワイド（2列分）</option>
          <option value="full">全幅</option>
        </select>
      </div>
      <div class="settings-form-actions">
        <button class="settings-btn settings-btn--primary" data-action="save-add-section">追加</button>
        <button class="settings-btn" data-action="cancel-add-section">キャンセル</button>
      </div>
    </div>`;
    return html;
  },

  buildEditSectionView(section) {
    if (!section) return '<p class="section-empty">セクションが見つかりません</p>';
    const isCmdBuilder = section.type === 'command_builder';
    const isTable = section.type === 'table';
    const columns = section.columns || [];
    const items = State.itemsMap[section.id] || [];

    const curWidth = section.width || 'auto';
    let html = `<div class="settings-edit-section">
      <div class="settings-subsection">
        <h3 class="settings-subsection-title">セクション設定</h3>
        <div class="settings-form-row settings-form-row--inline">
          <input class="settings-input settings-input--xs" id="edit-section-icon" type="text" value="${escapeAttr(section.icon || '')}" placeholder="📋" maxlength="4" />
          <input class="settings-input" id="edit-section-title" type="text" value="${escapeAttr(section.title || '')}" placeholder="タイトル" />
        </div>
        <div class="settings-form-row">
          <label class="settings-label">表示幅</label>
          <select class="settings-select" id="edit-section-width">
            <option value="auto" ${curWidth === 'auto' ? 'selected' : ''}>自動（グリッド列幅）</option>
            <option value="wide" ${curWidth === 'wide' ? 'selected' : ''}>ワイド（2列分）</option>
            <option value="full" ${curWidth === 'full' ? 'selected' : ''}>全幅</option>
          </select>
        </div>
        <div class="settings-form-row">
          <button class="settings-btn settings-btn--primary" data-action="save-section-meta" data-section-id="${section.id}">保存</button>
        </div>`;

    if (isCmdBuilder) {
      const curMode = section.action_mode || 'copy';
      html += `
        <div class="settings-form-row">
          <label class="settings-label">アクション</label>
          <select class="settings-select" id="edit-section-action-mode">
            <option value="copy" ${curMode === 'copy' ? 'selected' : ''}>コマンドをコピー（ターミナル用）</option>
            <option value="open" ${curMode === 'open' ? 'selected' : ''}>URLを開く（ブラウザ）</option>
          </select>
        </div>
        <div class="settings-form-row">
          <label class="settings-label">テンプレート（{INPUT} が入力値に置換されます）</label>
          <input class="settings-input" id="edit-section-cmd" type="text" value="${escapeAttr(section.command_template || '')}" placeholder='open "https://www.google.com/search?q={INPUT}"' />
        </div>
        <div class="settings-form-row">
          <label class="settings-label">履歴の上限件数（0 で無効）</label>
          <input class="settings-input settings-input--xs" id="edit-section-history-limit" type="number" min="0" max="100" value="${section.history_limit ?? 10}" />
        </div>
        <div class="settings-form-row">
          <button class="settings-btn settings-btn--primary" data-action="save-section-cmd" data-section-id="${section.id}">保存</button>
        </div>`;
    }
    html += `</div>`;

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
        const typeLabel = col.type === 'copy' ? 'コピー' : col.type === 'link' ? 'リンク' : 'テキスト';
        html += `
          <div class="settings-col-row" id="col-row-${col.id}" data-col-id="${col.id}">
            <span class="settings-col-label">${escapeHtml(col.label)}</span>
            <span class="settings-col-type">${typeLabel}</span>
            <div class="settings-row__actions">
              <button class="settings-btn" data-action="move-col-up" data-section-id="${section.id}" data-col-id="${col.id}" ${idx === 0 ? 'disabled' : ''}>↑</button>
              <button class="settings-btn" data-action="move-col-down" data-section-id="${section.id}" data-col-id="${col.id}" ${idx === columns.length - 1 ? 'disabled' : ''}>↓</button>
              <button class="settings-btn settings-btn--primary" data-action="edit-column" data-section-id="${section.id}" data-col-id="${col.id}">編集</button>
              <button class="settings-btn settings-btn--danger" data-action="delete-column" data-section-id="${section.id}" data-col-id="${col.id}">削除</button>
            </div>
          </div>`;
      });
      html += `</div>
        <div class="settings-form-panel" id="add-column-form" hidden>
          <div class="settings-form-row settings-form-row--inline">
            <input class="settings-input" id="new-col-label" type="text" placeholder="列名" />
            <select class="settings-select settings-select--sm" id="new-col-type">
              <option value="text">テキスト</option>
              <option value="copy">コピー</option>
              <option value="link">リンク</option>
            </select>
            <button class="settings-btn settings-btn--primary" data-action="save-add-column" data-section-id="${section.id}">追加</button>
            <button class="settings-btn" data-action="cancel-add-column">✕</button>
          </div>
        </div>
      </div>`;
    }

    // アイテム一覧（command_builder 以外）
    if (!isCmdBuilder) {
      const label = isTable ? '行' : section.type === 'grid' ? 'カード' : 'アイテム';
      html += `
      <div class="settings-subsection">
        <div class="settings-subsection-hd">
          <h3 class="settings-subsection-title">${label}一覧</h3>
          <button class="settings-add-btn settings-add-btn--sm" data-action="show-add-item" data-section-id="${section.id}">＋ 追加</button>
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
    const isTable = section.type === 'table';
    const columns = section.columns || [];
    let labelText = '';
    if (isTable) {
      const rd = item.row_data || {};
      labelText = columns.map(c => rd[c.id] || '').filter(v => v).join(' | ') || '（空）';
    } else if (section.type === 'grid') {
      const typeTag = item.item_type === 'copy' ? '[コピー]' : '[リンク]';
      labelText = `${typeTag} ${item.emoji || ''} ${item.label || ''}`.trim();
    } else {
      const typeTag = item.item_type === 'copy' ? '[コピー]' : '[リンク]';
      labelText = `${typeTag} ${item.label || ''}`;
    }
    return `
      <div class="settings-row settings-row--item" id="item-row-${item.id}" data-item-id="${item.id}">
        <span class="settings-row__title settings-row__title--sm">${escapeHtml(labelText)}</span>
        <div class="settings-row__actions">
          <button class="settings-btn" data-action="move-item-up" data-item-id="${item.id}" data-section-id="${section.id}" ${idx === 0 ? 'disabled' : ''}>↑</button>
          <button class="settings-btn" data-action="move-item-down" data-item-id="${item.id}" data-section-id="${section.id}" ${idx === total - 1 ? 'disabled' : ''}>↓</button>
          <button class="settings-btn settings-btn--primary" data-action="edit-item" data-item-id="${item.id}" data-section-id="${section.id}">編集</button>
          <button class="settings-btn settings-btn--danger" data-action="delete-item" data-item-id="${item.id}" data-section-id="${section.id}">削除</button>
        </div>
      </div>`;
  },

  buildItemFields(item, section) {
    const isEdit = !!item;
    const saveAction = isEdit ? 'save-edit-item' : 'save-add-item';
    const cancelAction = isEdit ? 'cancel-edit-item' : 'cancel-add-item';
    const isGrid = section.type === 'grid';
    const isTable = section.type === 'table';
    const columns = section.columns || [];
    let html = '';

    if (isGrid) {
      html += `
        <div class="settings-form-row">
          <label class="settings-label">アクション</label>
          <select class="settings-select" id="item-type">
            <option value="link" ${(!item || item.item_type === 'link' || item.item_type === 'card') ? 'selected' : ''}>リンク（クリックで URL を開く）</option>
            <option value="copy" ${item?.item_type === 'copy' ? 'selected' : ''}>コピー（クリックでクリップボードにコピー）</option>
          </select>
        </div>
        <div class="settings-form-row settings-form-row--inline">
          <input class="settings-input settings-input--xs" id="item-emoji" type="text" value="${escapeAttr(item?.emoji || '')}" placeholder="🔗" maxlength="4" />
          <input class="settings-input" id="item-label" type="text" value="${escapeAttr(item?.label || '')}" placeholder="カード名" />
          <input class="settings-input" id="item-value" type="text" value="${escapeAttr(item?.value || '')}" placeholder="URL またはコピーするテキスト" />
        </div>`;
    } else if (isTable) {
      columns.forEach(col => {
        const val = item?.row_data?.[col.id] || '';
        const typeLabel = col.type === 'copy' ? 'コピー' : col.type === 'link' ? 'リンク' : 'テキスト';
        html += `
        <div class="settings-form-row">
          <label class="settings-label">${escapeHtml(col.label)} <span class="settings-col-type">${typeLabel}</span></label>
          <input class="settings-input" id="item-col-${col.id}" type="${col.type === 'link' ? 'url' : 'text'}" value="${escapeAttr(val)}" placeholder="${col.type === 'link' ? 'https://...' : escapeAttr(col.label)}" />
        </div>`;
      });
    } else {
      html += `
        <div class="settings-form-row">
          <label class="settings-label">タイプ</label>
          <select class="settings-select" id="item-type">
            <option value="copy" ${item?.item_type === 'copy' ? 'selected' : ''}>コピー（クリックでクリップボードにコピー）</option>
            <option value="link" ${item?.item_type === 'link' ? 'selected' : ''}>リンク（クリックで URL を開く）</option>
          </select>
        </div>
        <div class="settings-form-row settings-form-row--inline">
          <input class="settings-input" id="item-label" type="text" value="${escapeAttr(item?.label || '')}" placeholder="ラベル" />
          <input class="settings-input settings-input--sm" id="item-hint" type="text" value="${escapeAttr(item?.hint || '')}" placeholder="補助テキスト（省略可）" />
        </div>
        <div class="settings-form-row">
          <input class="settings-input" id="item-value" type="text" value="${escapeAttr(item?.value || '')}" placeholder="コピーするテキスト または URL" />
        </div>`;
    }

    html += `
      <div class="settings-form-actions">
        <button class="settings-btn settings-btn--primary" data-action="${saveAction}" data-section-id="${section.id}"${isEdit ? ` data-item-id="${item.id}"` : ''}>保存</button>
        <button class="settings-btn" data-action="${cancelAction}"${isEdit ? ` data-item-id="${item.id}" data-section-id="${section.id}"` : ''}>キャンセル</button>
      </div>`;
    return html;
  },

  // ── 環境バインド変数 設定ビュー ────────────────

  buildEnvSettingsView() {
    const { varNames, uiType } = State.envConfig;
    const envs = State.environments;

    const varList = varNames.length > 0
      ? varNames.map(name => `
        <div class="settings-row settings-row--sm">
          <code class="env-var-badge">{${escapeHtml(name)}}</code>
          <div class="settings-row__actions">
            <button class="settings-btn settings-btn--danger" data-action="remove-env-var" data-var-name="${escapeAttr(name)}">削除</button>
          </div>
        </div>`).join('')
      : '<p class="section-empty">変数が定義されていません</p>';

    const envList = envs.length > 0
      ? envs.map((env, idx) => `
        <div class="settings-row" data-env-id="${env.id}">
          <span class="settings-row__title">${escapeHtml(env.name)}</span>
          <div class="settings-row__actions">
            <button class="settings-btn" data-action="move-env-up" data-env-id="${env.id}" ${idx === 0 ? 'disabled' : ''}>↑</button>
            <button class="settings-btn" data-action="move-env-down" data-env-id="${env.id}" ${idx === envs.length - 1 ? 'disabled' : ''}>↓</button>
            <button class="settings-btn settings-btn--primary" data-action="edit-env" data-env-id="${env.id}">編集</button>
            <button class="settings-btn settings-btn--danger" data-action="delete-env" data-env-id="${env.id}">削除</button>
          </div>
        </div>`).join('')
      : '<p class="section-empty">環境が登録されていません</p>';

    return `<div class="settings-env-view">
      <div class="settings-subsection">
        <h3 class="settings-subsection-title">バインド変数の定義</h3>
        <p class="settings-help">コマンドや値に {変数名} 形式で埋め込めます。例: <code>{IP}</code>, <code>{HOST_NAME}</code></p>
        <div id="env-var-list">${varList}</div>
        <div class="settings-form-row settings-form-row--inline">
          <input class="settings-input" id="new-var-name" type="text" placeholder="変数名（例: HOST_NAME）" />
          <button class="settings-btn settings-btn--primary" data-action="add-env-var">追加</button>
        </div>
      </div>
      <div class="settings-subsection">
        <h3 class="settings-subsection-title">選択UI</h3>
        <div class="settings-form-row">
          <select class="settings-select" id="env-ui-type">
            <option value="select" ${uiType === 'select' ? 'selected' : ''}>セレクトボックス</option>
            <option value="tabs" ${uiType === 'tabs' ? 'selected' : ''}>タブ</option>
            <option value="segment" ${uiType === 'segment' ? 'selected' : ''}>セグメントコントロール</option>
          </select>
        </div>
        <div class="settings-form-row">
          <button class="settings-btn settings-btn--primary" data-action="save-env-config">保存</button>
        </div>
      </div>
      <div class="settings-subsection">
        <div class="settings-subsection-hd">
          <h3 class="settings-subsection-title">環境一覧</h3>
          <button class="settings-add-btn settings-add-btn--sm" data-action="show-add-env">＋ 追加</button>
        </div>
        <div id="env-list">${envList}</div>
        <div class="settings-form-panel" id="add-env-form" hidden>
          <div class="settings-form-row">
            <input class="settings-input" id="new-env-name" type="text" placeholder="環境名（例: 本番, 開発）" />
          </div>
          <div class="settings-form-actions">
            <button class="settings-btn settings-btn--primary" data-action="save-add-env">追加</button>
            <button class="settings-btn" data-action="cancel-add-env">キャンセル</button>
          </div>
        </div>
      </div>
    </div>`;
  },

  buildEditEnvView(env) {
    if (!env) return '<p class="section-empty">環境が見つかりません</p>';
    const { varNames } = State.envConfig;
    const values = env.values || {};

    const varFields = varNames.length > 0
      ? varNames.map(name => `
        <div class="settings-form-row">
          <label class="settings-label"><code class="env-var-badge">{${escapeHtml(name)}}</code></label>
          <input class="settings-input" id="edit-env-var-${escapeAttr(name)}" type="text"
                 value="${escapeAttr(values[name] || '')}" placeholder="${escapeAttr(name)} の値" />
        </div>`).join('')
      : '<p class="section-empty">変数が定義されていません。「環境バインド変数」設定から追加してください。</p>';

    return `<div class="settings-edit-env">
      <div class="settings-subsection">
        <h3 class="settings-subsection-title">環境名</h3>
        <div class="settings-form-row">
          <input class="settings-input" id="edit-env-name" type="text" value="${escapeAttr(env.name)}" placeholder="環境名" />
        </div>
      </div>
      <div class="settings-subsection">
        <h3 class="settings-subsection-title">バインド変数の値</h3>
        ${varFields}
        <div class="settings-form-row">
          <button class="settings-btn settings-btn--primary" data-action="save-edit-env" data-env-id="${env.id}">保存</button>
        </div>
      </div>
    </div>`;
  },

  // ── 環境バー ──────────────────────────────

  renderEnvBar() {
    const bar = document.getElementById('env-bar');
    if (!bar) return;
    const envs = State.environments;
    if (envs.length === 0) {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    const { uiType } = State.envConfig;
    const activeId = State.activeEnvId;

    if (uiType === 'tabs') {
      const tabs = envs.map(env =>
        `<button class="env-tab${env.id === activeId ? ' is-active' : ''}"
                 data-action="switch-env" data-env-id="${env.id}">
          ${escapeHtml(env.name)}
        </button>`
      ).join('');
      bar.innerHTML = `<div class="env-bar__inner env-bar__inner--tabs">
        <span class="env-bar__label">環境</span>
        <div class="env-tabs">${tabs}</div>
      </div>`;
    } else if (uiType === 'segment') {
      const items = envs.map(env =>
        `<label class="env-segment__item">
          <input type="radio" name="env-radio-${_instanceId}" value="${env.id}" ${env.id === activeId ? 'checked' : ''} />
          ${escapeHtml(env.name)}
        </label>`
      ).join('');
      bar.innerHTML = `<div class="env-bar__inner env-bar__inner--segment">
        <span class="env-bar__label">環境</span>
        <div class="env-segment">${items}</div>
      </div>`;
      // セグメントのラジオイベントをバインド（委譲できないため直接）
      bar.querySelectorAll('input[type=radio]').forEach(radio => {
        radio.addEventListener('change', () => {
          EventHandlers.switchEnv(Number(radio.value));
        });
      });
    } else {
      // select（デフォルト）
      const options = `<option value="">-- 選択なし --</option>` +
        envs.map(env =>
          `<option value="${env.id}" ${env.id === activeId ? 'selected' : ''}>${escapeHtml(env.name)}</option>`
        ).join('');
      bar.innerHTML = `<div class="env-bar__inner">
        <span class="env-bar__label">環境</span>
        <select class="env-bar__select" id="env-select">${options}</select>
      </div>`;
      const sel = bar.querySelector('#env-select');
      if (sel) {
        sel.addEventListener('change', () => {
          EventHandlers.switchEnv(sel.value ? Number(sel.value) : null);
        });
      }
    }
  },
};

// ==============================
// EventHandlers
// ==============================

const EventHandlers = {

  // ── 設定パネル開閉 ────────────────────

  openSettings() {
    State.settings.open = true;
    State.settings.view = 'sections';
    State.settings.editingSectionId = null;
    const panel = document.getElementById('home-settings');
    panel.removeAttribute('hidden');
    panel.offsetWidth; // リフロー強制
    panel.classList.add('is-open');
    Renderer.renderSettingsView();
  },

  closeSettings() {
    const panel = document.getElementById('home-settings');
    panel.classList.remove('is-open');
    panel.addEventListener('transitionend', () => {
      if (!panel.classList.contains('is-open')) panel.setAttribute('hidden', '');
    }, { once: true });
    State.settings.open = false;
    // 親フレームに設定パネルが閉じたことを通知（タブ設定の「ページを設定」ボタン用）
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'dashboard:settings-closed' }, '*');
    }
  },

  backToSections() {
    State.settings.view = 'sections';
    State.settings.editingSectionId = null;
    State.settings.editingEnvId = null;
    Renderer.renderSettingsView();
  },

  backInSettings() {
    const view = State.settings.view;
    if (view === 'edit-env') {
      State.settings.view = 'env-settings';
      State.settings.editingEnvId = null;
    } else {
      State.settings.view = 'sections';
      State.settings.editingSectionId = null;
      State.settings.editingEnvId = null;
    }
    Renderer.renderSettingsView();
  },

  // ── セクション追加 ────────────────────

  showAddSectionForm() {
    const form = document.getElementById('add-section-form');
    const list = document.getElementById('settings-section-list');
    if (form) form.hidden = false;
    if (list) list.hidden = true;
    // 追加ボタンも非表示
    const addBar = document.querySelector('.settings-add-bar');
    if (addBar) addBar.hidden = true;
  },

  hideAddSectionForm() {
    Renderer.renderSettingsView();
  },

  onNewSectionTypeChange() {
    const type = document.getElementById('new-section-type')?.value;
    const cmdRow = document.getElementById('new-section-cmd-row');
    const actionRow = document.getElementById('new-section-action-row');
    const isCmdBuilder = type === 'command_builder';
    if (cmdRow) cmdRow.hidden = !isCmdBuilder;
    if (actionRow) actionRow.hidden = !isCmdBuilder;
  },

  async saveAddSection() {
    const icon = document.getElementById('new-section-icon')?.value.trim() || '📋';
    const title = document.getElementById('new-section-title')?.value.trim();
    const type = document.getElementById('new-section-type')?.value || 'list';
    const cmd = document.getElementById('new-section-cmd')?.value.trim() || '';
    const actionMode = document.getElementById('new-section-action-mode')?.value || 'copy';
    const width = document.getElementById('new-section-width')?.value || 'auto';

    if (!title) { alert('タイトルを入力してください'); return; }

    const maxPos = State.sections.length > 0
      ? Math.max(...State.sections.map(s => s.position)) + 1 : 0;

    const data = {
      title, icon, position: maxPos, type, width,
      command_template: type === 'command_builder' ? cmd : null,
      action_mode: type === 'command_builder' ? actionMode : null,
      columns: type === 'table' ? [] : null,
    };
    const newId = await State.db.addSection(data);
    data.id = newId;
    State.sections.push(data);
    State.itemsMap[newId] = [];

    Renderer.renderDashboard();
    Renderer.renderSettingsView();
  },

  // ── セクション操作 ────────────────────

  editSection(sectionId) {
    State.settings.view = 'edit-section';
    State.settings.editingSectionId = sectionId;
    Renderer.renderSettingsView();
  },

  async deleteSection(sectionId) {
    const items = State.itemsMap[sectionId] || [];
    const msg = items.length > 0
      ? `このセクションには ${items.length} 件のアイテムがあります。削除しますか？`
      : 'このセクションを削除しますか？';
    if (!confirm(msg)) return;

    await State.db.deleteSection(sectionId);
    State.sections = State.sections.filter(s => s.id !== sectionId);
    delete State.itemsMap[sectionId];

    Renderer.renderDashboard();
    if (State.settings.view === 'edit-section' && State.settings.editingSectionId === sectionId) {
      State.settings.view = 'sections';
      State.settings.editingSectionId = null;
    }
    Renderer.renderSettingsView();
  },

  async moveSectionUp(sectionId) {
    const idx = State.sections.findIndex(s => s.id === sectionId);
    if (idx <= 0) return;
    await EventHandlers._swapSectionPos(State.sections[idx], State.sections[idx - 1]);
  },

  async moveSectionDown(sectionId) {
    const idx = State.sections.findIndex(s => s.id === sectionId);
    if (idx >= State.sections.length - 1) return;
    await EventHandlers._swapSectionPos(State.sections[idx], State.sections[idx + 1]);
  },

  async _swapSectionPos(a, b) {
    [a.position, b.position] = [b.position, a.position];
    await Promise.all([State.db.updateSection(a), State.db.updateSection(b)]);
    State.sections.sort((x, y) => x.position - y.position);
    Renderer.renderDashboard();
    Renderer.renderSettingsView();
  },

  async saveSectionMeta(sectionId) {
    const section = State.sections.find(s => s.id === sectionId);
    if (!section) return;
    const icon = document.getElementById('edit-section-icon')?.value.trim();
    const title = document.getElementById('edit-section-title')?.value.trim();
    if (!title) { alert('タイトルを入力してください'); return; }
    section.icon = icon || section.icon;
    section.title = title;
    section.width = document.getElementById('edit-section-width')?.value || 'auto';
    await State.db.updateSection(section);
    document.getElementById('settings-title').textContent = `${section.icon || ''} ${section.title}`;
    Renderer.renderDashboard();
    showToast('保存しました');
  },

  async saveSectionCmd(sectionId) {
    const section = State.sections.find(s => s.id === sectionId);
    if (!section) return;
    section.command_template = document.getElementById('edit-section-cmd')?.value.trim() || '';
    section.action_mode = document.getElementById('edit-section-action-mode')?.value || 'copy';
    const limitVal = parseInt(document.getElementById('edit-section-history-limit')?.value, 10);
    section.history_limit = (!isNaN(limitVal) && limitVal >= 0) ? limitVal : 10;
    await State.db.updateSection(section);

    // 上限が変わった場合に既存履歴をトリム
    const historyKey = CMD_HISTORY_PREFIX + sectionId;
    if (section.history_limit === 0) {
      localStorage.removeItem(historyKey);
    } else {
      const urls = loadJsonFromStorage(historyKey) || [];
      if (urls.length > section.history_limit) {
        localStorage.setItem(historyKey, JSON.stringify(urls.slice(0, section.history_limit)));
      }
    }

    Renderer.renderDashboard();
    showToast('保存しました');
  },

  // ── 列操作（テーブル） ────────────────

  toggleAddColumnForm(show) {
    const form = document.getElementById('add-column-form');
    if (form) form.hidden = !show;
  },

  async saveAddColumn(sectionId) {
    const section = State.sections.find(s => s.id === sectionId);
    if (!section) return;
    const label = document.getElementById('new-col-label')?.value.trim();
    const type = document.getElementById('new-col-type')?.value || 'text';
    if (!label) { alert('列名を入力してください'); return; }

    const cols = section.columns || [];
    cols.push({ id: `col_${Date.now()}`, label, type });
    section.columns = cols;
    await State.db.updateSection(section);
    Renderer.renderDashboard();
    Renderer.renderSettingsView();
  },

  editColumn(sectionId, colId) {
    const section = State.sections.find(s => s.id === sectionId);
    const col = (section?.columns || []).find(c => c.id === colId);
    if (!col) return;
    const row = document.getElementById(`col-row-${colId}`);
    if (!row) return;
    row.innerHTML = `
      <input class="settings-input" id="edit-col-label" type="text" value="${escapeAttr(col.label)}" />
      <select class="settings-select settings-select--sm" id="edit-col-type">
        <option value="text" ${col.type === 'text' ? 'selected' : ''}>テキスト</option>
        <option value="copy" ${col.type === 'copy' ? 'selected' : ''}>コピー</option>
        <option value="link" ${col.type === 'link' ? 'selected' : ''}>リンク</option>
      </select>
      <div class="settings-row__actions">
        <button class="settings-btn settings-btn--primary" data-action="save-edit-column" data-section-id="${sectionId}" data-col-id="${colId}">保存</button>
        <button class="settings-btn" data-action="cancel-edit-column">キャンセル</button>
      </div>`;
  },

  async saveEditColumn(sectionId, colId) {
    const section = State.sections.find(s => s.id === sectionId);
    const col = (section?.columns || []).find(c => c.id === colId);
    if (!col) return;
    const label = document.getElementById('edit-col-label')?.value.trim();
    if (!label) { alert('列名を入力してください'); return; }
    col.label = label;
    col.type = document.getElementById('edit-col-type')?.value || 'text';
    await State.db.updateSection(section);
    Renderer.renderDashboard();
    Renderer.renderSettingsView();
  },

  async deleteColumn(sectionId, colId) {
    if (!confirm('この列を削除しますか？')) return;
    const section = State.sections.find(s => s.id === sectionId);
    if (!section) return;
    section.columns = (section.columns || []).filter(c => c.id !== colId);
    await State.db.updateSection(section);
    Renderer.renderDashboard();
    Renderer.renderSettingsView();
  },

  async moveColumnUp(sectionId, colId) {
    const section = State.sections.find(s => s.id === sectionId);
    if (!section) return;
    const cols = section.columns || [];
    const idx = cols.findIndex(c => c.id === colId);
    if (idx <= 0) return;
    [cols[idx - 1], cols[idx]] = [cols[idx], cols[idx - 1]];
    await State.db.updateSection(section);
    Renderer.renderDashboard();
    Renderer.renderSettingsView();
  },

  async moveColumnDown(sectionId, colId) {
    const section = State.sections.find(s => s.id === sectionId);
    if (!section) return;
    const cols = section.columns || [];
    const idx = cols.findIndex(c => c.id === colId);
    if (idx >= cols.length - 1) return;
    [cols[idx], cols[idx + 1]] = [cols[idx + 1], cols[idx]];
    await State.db.updateSection(section);
    Renderer.renderDashboard();
    Renderer.renderSettingsView();
  },

  // ── アイテム操作 ──────────────────────

  toggleAddItemForm(show) {
    const form = document.getElementById('add-item-form');
    if (form) form.hidden = !show;
  },

  async saveAddItem(sectionId) {
    const section = State.sections.find(s => s.id === sectionId);
    if (!section) return;
    const items = State.itemsMap[sectionId] || [];
    const maxPos = items.length > 0 ? Math.max(...items.map(i => i.position)) + 1 : 0;
    const data = { section_id: sectionId, position: maxPos };

    if (section.type === 'grid') {
      data.item_type = document.getElementById('item-type')?.value || 'link';
      data.emoji = document.getElementById('item-emoji')?.value.trim() || '';
      data.label = document.getElementById('item-label')?.value.trim() || '';
      data.value = document.getElementById('item-value')?.value.trim() || '';
      data.hint = null; data.row_data = null;
    } else if (section.type === 'table') {
      data.item_type = 'row';
      data.label = null; data.hint = null; data.value = null; data.emoji = null;
      const row_data = {};
      (section.columns || []).forEach(col => {
        row_data[col.id] = document.getElementById(`item-col-${col.id}`)?.value.trim() || '';
      });
      data.row_data = row_data;
    } else {
      data.item_type = document.getElementById('item-type')?.value || 'copy';
      data.label = document.getElementById('item-label')?.value.trim() || '';
      data.hint = document.getElementById('item-hint')?.value.trim() || null;
      data.value = document.getElementById('item-value')?.value.trim() || '';
      data.emoji = null; data.row_data = null;
    }

    const newId = await State.db.addItem(data);
    data.id = newId;
    if (!State.itemsMap[sectionId]) State.itemsMap[sectionId] = [];
    State.itemsMap[sectionId].push(data);
    Renderer.renderDashboard();
    Renderer.renderSettingsView();
  },

  editItem(itemId, sectionId) {
    const section = State.sections.find(s => s.id === sectionId);
    const item = (State.itemsMap[sectionId] || []).find(i => i.id === itemId);
    if (!section || !item) return;
    const row = document.getElementById(`item-row-${itemId}`);
    if (!row) return;
    // フォーム表示のため flex を解除
    row.className = 'settings-item-edit-form';
    row.innerHTML = Renderer.buildItemFields(item, section);
  },

  async saveEditItem(itemId, sectionId) {
    const section = State.sections.find(s => s.id === sectionId);
    const item = (State.itemsMap[sectionId] || []).find(i => i.id === itemId);
    if (!section || !item) return;

    if (section.type === 'grid') {
      item.item_type = document.getElementById('item-type')?.value || item.item_type || 'link';
      item.emoji = document.getElementById('item-emoji')?.value.trim() || '';
      item.label = document.getElementById('item-label')?.value.trim() || '';
      item.value = document.getElementById('item-value')?.value.trim() || '';
    } else if (section.type === 'table') {
      const row_data = {};
      (section.columns || []).forEach(col => {
        row_data[col.id] = document.getElementById(`item-col-${col.id}`)?.value.trim() || '';
      });
      item.row_data = row_data;
    } else {
      item.item_type = document.getElementById('item-type')?.value || item.item_type;
      item.label = document.getElementById('item-label')?.value.trim() || '';
      item.hint = document.getElementById('item-hint')?.value.trim() || null;
      item.value = document.getElementById('item-value')?.value.trim() || '';
    }
    await State.db.updateItem(item);
    Renderer.renderDashboard();
    Renderer.renderSettingsView();
  },

  cancelEditItem(itemId, sectionId) {
    Renderer.renderSettingsView();
  },

  async deleteItem(itemId, sectionId) {
    if (!confirm('このアイテムを削除しますか？')) return;
    await State.db.deleteItem(itemId);
    State.itemsMap[sectionId] = (State.itemsMap[sectionId] || []).filter(i => i.id !== itemId);
    Renderer.renderDashboard();
    Renderer.renderSettingsView();
  },

  async moveItemUp(itemId, sectionId) {
    const items = State.itemsMap[sectionId] || [];
    const idx = items.findIndex(i => i.id === itemId);
    if (idx <= 0) return;
    await EventHandlers._swapItemPos(items[idx], items[idx - 1], sectionId);
  },

  async moveItemDown(itemId, sectionId) {
    const items = State.itemsMap[sectionId] || [];
    const idx = items.findIndex(i => i.id === itemId);
    if (idx >= items.length - 1) return;
    await EventHandlers._swapItemPos(items[idx], items[idx + 1], sectionId);
  },

  async _swapItemPos(a, b, sectionId) {
    [a.position, b.position] = [b.position, a.position];
    await Promise.all([State.db.updateItem(a), State.db.updateItem(b)]);
    State.itemsMap[sectionId].sort((x, y) => x.position - y.position);
    Renderer.renderDashboard();
    Renderer.renderSettingsView();
  },

  // ── テーブル列の表示/非表示 ────────────

  toggleTableColMenu(sectionId) {
    const menu = document.getElementById(`table-col-menu-${sectionId}`);
    if (!menu) return;
    const wasHidden = menu.hidden;
    // 全メニューを閉じてから対象を開閉
    document.querySelectorAll('.data-table-col-menu').forEach(m => { m.hidden = true; });
    if (wasHidden) menu.hidden = false;
  },

  onTableColVisibilityChange(cb) {
    const colId = cb.dataset.colId;
    const sectionId = Number(cb.dataset.sectionId);
    const isVisible = cb.checked;

    // カード内の対象列（th / td）を表示/非表示
    const card = document.querySelector(`.card[data-section-id="${sectionId}"]`);
    if (card) {
      card.querySelectorAll(`[data-col-id="${colId}"]`).forEach(el => {
        el.hidden = !isVisible;
      });
    }

    // localStorage に非表示列 ID 配列を保存
    const colMenu = cb.closest('.data-table-col-menu');
    if (!colMenu) return;
    const hiddenCols = Array.from(colMenu.querySelectorAll('input[type=checkbox]'))
      .filter(c => !c.checked)
      .map(c => c.dataset.colId);
    localStorage.setItem(TABLE_COL_HIDDEN_PREFIX + sectionId, JSON.stringify(hiddenCols));
  },

  // ── URL コマンド ──────────────────────

  onCopyCmd(btn) {
    const sectionId = Number(btn.dataset.sectionId);
    const template = btn.dataset.template || '';
    const actionMode = btn.dataset.actionMode || 'copy';
    const input = document.getElementById(`url-input-${sectionId}`);
    const inputVal = input?.value.trim() || '';
    // まず {INPUT} を置換し、次に環境バインド変数を解決
    const result = resolveEnvVars(template.replace('{INPUT}', inputVal));

    if (actionMode === 'open') {
      if (result) window.open(result, '_blank', 'noopener,noreferrer');
    } else {
      navigator.clipboard.writeText(result);
      showToast('コピーしました');
    }

    if (inputVal) {
      const section = State.sections.find(s => s.id === sectionId);
      const limit = section?.history_limit ?? 10;
      if (limit > 0) {
        saveToStorageWithLimit(CMD_HISTORY_PREFIX + sectionId, inputVal, limit);
      }
      Renderer.renderCmdHistory(sectionId);
    }
  },

  // ── エクスポート/インポート ────────────

  exportData() {
    State.db.exportInstance().then(data => {
      const json = JSON.stringify({
        type: 'dashboard_export',
        version: 2,
        exportedAt: new Date().toISOString(),
        instanceId: _instanceId,
        sections: data.sections,
        items: data.items,
        environments: data.environments,
        envConfig: data.envConfig,
      }, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const _now = new Date(), _p = n => String(n).padStart(2, '0');
      const _ts = `${_now.getFullYear()}${_p(_now.getMonth()+1)}${_p(_now.getDate())}_${_p(_now.getHours())}${_p(_now.getMinutes())}${_p(_now.getSeconds())}`;
      a.download = `dashboard_${_instanceId || 'default'}_${_ts}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }).catch(console.error);
  },

  // ── 環境バインド変数 ──────────────────────

  showEnvSettings() {
    State.settings.view = 'env-settings';
    State.settings.editingEnvId = null;
    Renderer.renderSettingsView();
  },

  showAddEnvForm() {
    const form = document.getElementById('add-env-form');
    if (form) form.hidden = false;
  },

  hideAddEnvForm() {
    const form = document.getElementById('add-env-form');
    if (form) form.hidden = true;
  },

  async saveAddEnv() {
    const name = document.getElementById('new-env-name')?.value.trim();
    if (!name) { alert('環境名を入力してください'); return; }
    const maxPos = State.environments.length > 0
      ? Math.max(...State.environments.map(e => e.position)) + 1 : 0;
    const data = { name, position: maxPos, values: {} };
    const newId = await State.db.addEnvironment(data);
    data.id = newId;
    State.environments.push(data);
    Renderer.renderEnvBar();
    Renderer.renderSettingsView();
  },

  editEnv(envId) {
    State.settings.view = 'edit-env';
    State.settings.editingEnvId = envId;
    Renderer.renderSettingsView();
  },

  async saveEditEnv(envId) {
    const env = State.environments.find(e => e.id === envId);
    if (!env) return;
    const name = document.getElementById('edit-env-name')?.value.trim();
    if (!name) { alert('環境名を入力してください'); return; }
    env.name = name;
    const values = {};
    State.envConfig.varNames.forEach(varName => {
      values[varName] = document.getElementById(`edit-env-var-${varName}`)?.value.trim() || '';
    });
    env.values = values;
    await State.db.updateEnvironment(env);
    Renderer.renderEnvBar();
    Renderer.renderDashboard();
    Renderer.renderSettingsView();
    showToast('保存しました');
  },

  async deleteEnv(envId) {
    if (!confirm('この環境を削除しますか？')) return;
    await State.db.deleteEnvironment(envId);
    State.environments = State.environments.filter(e => e.id !== envId);
    if (State.activeEnvId === envId) {
      State.activeEnvId = null;
      localStorage.removeItem(ACTIVE_ENV_KEY);
    }
    Renderer.renderEnvBar();
    Renderer.renderDashboard();
    Renderer.renderSettingsView();
  },

  async moveEnvUp(envId) {
    const idx = State.environments.findIndex(e => e.id === envId);
    if (idx <= 0) return;
    await EventHandlers._swapEnvPos(State.environments[idx], State.environments[idx - 1]);
  },

  async moveEnvDown(envId) {
    const idx = State.environments.findIndex(e => e.id === envId);
    if (idx >= State.environments.length - 1) return;
    await EventHandlers._swapEnvPos(State.environments[idx], State.environments[idx + 1]);
  },

  async _swapEnvPos(a, b) {
    [a.position, b.position] = [b.position, a.position];
    await Promise.all([State.db.updateEnvironment(a), State.db.updateEnvironment(b)]);
    State.environments.sort((x, y) => x.position - y.position);
    Renderer.renderEnvBar();
    Renderer.renderSettingsView();
  },

  async saveEnvConfig() {
    const uiType = document.getElementById('env-ui-type')?.value || 'select';
    State.envConfig = { ...State.envConfig, uiType };
    await State.db.setAppConfig('env_config', State.envConfig);
    Renderer.renderEnvBar();
    Renderer.renderSettingsView();
    showToast('保存しました');
  },

  async addEnvVar() {
    const input = document.getElementById('new-var-name');
    const raw = input?.value.trim() || '';
    // 変数名は英大文字・数字・アンダースコアのみ許容
    const varName = raw.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    if (!varName) { alert('変数名を入力してください'); return; }
    if (State.envConfig.varNames.includes(varName)) { alert('すでに存在する変数名です'); return; }
    State.envConfig.varNames.push(varName);
    await State.db.setAppConfig('env_config', State.envConfig);
    if (input) input.value = '';
    Renderer.renderSettingsView();
    showToast(`{${varName}} を追加しました`);
  },

  async removeEnvVar(varName) {
    if (!confirm(`変数 {${varName}} を削除しますか？`)) return;
    State.envConfig.varNames = State.envConfig.varNames.filter(v => v !== varName);
    await State.db.setAppConfig('env_config', State.envConfig);
    Renderer.renderSettingsView();
  },

  switchEnv(envId) {
    State.activeEnvId = envId || null;
    if (State.activeEnvId) {
      localStorage.setItem(ACTIVE_ENV_KEY, String(State.activeEnvId));
    } else {
      localStorage.removeItem(ACTIVE_ENV_KEY);
    }
    Renderer.renderEnvBar();
    Renderer.renderDashboard();
  },

  // ── インポート ────────────────────────────

  importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      let data;
      try { data = JSON.parse(await file.text()); } catch { alert('JSONの解析に失敗しました'); return; }
      if (data.type !== 'dashboard_export') {
        alert('ダッシュボードのエクスポートファイルではありません');
        return;
      }
      if (!confirm(`現在のデータを削除して「${file.name}」のデータで置き換えますか？`)) return;
      try {
        await State.db.importInstance({ sections: data.sections, items: data.items, environments: data.environments, envConfig: data.envConfig }, true);
        State.sections = await State.db.getAllSections();
        State.itemsMap = {};
        for (const s of State.sections) {
          State.itemsMap[s.id] = await State.db.getItemsBySection(s.id);
        }
        State.environments = await State.db.getAllEnvironments();
        const envConfig = await State.db.getAppConfig('env_config');
        if (envConfig) State.envConfig = envConfig;
        State.activeEnvId = null;
        localStorage.removeItem(ACTIVE_ENV_KEY);
        Renderer.renderEnvBar();
        Renderer.renderDashboard();
        Renderer.renderSettingsView();
        showToast('インポートしました');
      } catch (err) {
        console.error(err);
        alert('インポートに失敗しました');
      }
    };
    input.click();
  },
};

// ==============================
// App - 初期化
// ==============================

const App = {
  async init() {
    const db = new HomeDB();
    await db.open();
    State.db = db;

    // セクション・アイテムをロード
    State.sections = await db.getAllSections();
    for (const section of State.sections) {
      State.itemsMap[section.id] = await db.getItemsBySection(section.id);
    }

    // 環境バインド変数をロード
    const envConfig = await db.getAppConfig('env_config');
    if (envConfig) State.envConfig = envConfig;
    State.environments = await db.getAllEnvironments();
    const savedEnvId = parseInt(localStorage.getItem(ACTIVE_ENV_KEY));
    if (savedEnvId && State.environments.some(e => e.id === savedEnvId)) {
      State.activeEnvId = savedEnvId;
    }

    Renderer.renderEnvBar();
    Renderer.renderDashboard();
    App.bindEvents();
  },

  bindEvents() {
    // ギアボタン
    document.getElementById('home-gear-btn').addEventListener('click', () => {
      EventHandlers.openSettings();
    });

    // 親フレームからの設定パネル開封要求を受信（タブ設定の「ページを設定」ボタン用）
    window.addEventListener('message', (e) => {
      if (e.data?.type === 'dashboard:open-settings') {
        EventHandlers.openSettings();
      }
    });

    // 全クリック（イベント委譲）
    document.addEventListener('click', (e) => {
      // ダッシュボードのコピー行（環境バインド変数を解決してコピー）
      const copyEl = e.target.closest('.js-copy');
      if (copyEl && !copyEl.closest('.home-settings')) {
        navigator.clipboard.writeText(resolveEnvVars(copyEl.dataset.value || ''));
        showToast('コピーしました');
        return;
      }
      // ダッシュボードのリンク行（環境バインド変数を解決してリンクを開く）
      const linkEl = e.target.closest('.js-link');
      if (linkEl && !linkEl.closest('.home-settings')) {
        const url = resolveEnvVars(linkEl.dataset.value || '');
        if (url) window.open(url, '_blank');
        return;
      }
      // URLコマンドコピーボタン
      const cmdBtn = e.target.closest('.js-copy-cmd');
      if (cmdBtn) { EventHandlers.onCopyCmd(cmdBtn); return; }

      // 設定パネルのアクション
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const sectionId = btn.dataset.sectionId ? Number(btn.dataset.sectionId) : null;
      const itemId = btn.dataset.itemId ? Number(btn.dataset.itemId) : null;
      const colId = btn.dataset.colId || null;
      const envId = btn.dataset.envId ? Number(btn.dataset.envId) : null;

      const eh = EventHandlers;
      switch (action) {
        case 'settings-close':      eh.closeSettings(); break;
        case 'settings-back':       eh.backInSettings(); break;
        case 'show-add-section':    eh.showAddSectionForm(); break;
        case 'cancel-add-section':  eh.hideAddSectionForm(); break;
        case 'save-add-section':    eh.saveAddSection().catch(console.error); break;
        case 'edit-section':        eh.editSection(sectionId); break;
        case 'delete-section':      eh.deleteSection(sectionId).catch(console.error); break;
        case 'move-section-up':     eh.moveSectionUp(sectionId).catch(console.error); break;
        case 'move-section-down':   eh.moveSectionDown(sectionId).catch(console.error); break;
        case 'save-section-meta':   eh.saveSectionMeta(sectionId).catch(console.error); break;
        case 'save-section-cmd':    eh.saveSectionCmd(sectionId).catch(console.error); break;
        case 'show-add-column':     eh.toggleAddColumnForm(true); break;
        case 'cancel-add-column':   eh.toggleAddColumnForm(false); break;
        case 'save-add-column':     eh.saveAddColumn(sectionId).catch(console.error); break;
        case 'edit-column':         eh.editColumn(sectionId, colId); break;
        case 'save-edit-column':    eh.saveEditColumn(sectionId, colId).catch(console.error); break;
        case 'cancel-edit-column':  Renderer.renderSettingsView(); break;
        case 'delete-column':       eh.deleteColumn(sectionId, colId).catch(console.error); break;
        case 'move-col-up':         eh.moveColumnUp(sectionId, colId).catch(console.error); break;
        case 'move-col-down':       eh.moveColumnDown(sectionId, colId).catch(console.error); break;
        case 'show-add-item':       eh.toggleAddItemForm(true); break;
        case 'cancel-add-item':     eh.toggleAddItemForm(false); break;
        case 'save-add-item':       eh.saveAddItem(sectionId).catch(console.error); break;
        case 'edit-item':           eh.editItem(itemId, sectionId); break;
        case 'save-edit-item':      eh.saveEditItem(itemId, sectionId).catch(console.error); break;
        case 'cancel-edit-item':    eh.cancelEditItem(itemId, sectionId); break;
        case 'delete-item':         eh.deleteItem(itemId, sectionId).catch(console.error); break;
        case 'move-item-up':            eh.moveItemUp(itemId, sectionId).catch(console.error); break;
        case 'move-item-down':          eh.moveItemDown(itemId, sectionId).catch(console.error); break;
        case 'toggle-table-col-menu':   eh.toggleTableColMenu(sectionId); break;
        case 'export-data':             eh.exportData(); break;
        case 'import-data':             eh.importData(); break;
        case 'show-env-settings':       eh.showEnvSettings(); break;
        case 'show-add-env':            eh.showAddEnvForm(); break;
        case 'cancel-add-env':          eh.hideAddEnvForm(); break;
        case 'save-add-env':            eh.saveAddEnv().catch(console.error); break;
        case 'edit-env':                eh.editEnv(envId); break;
        case 'save-edit-env':           eh.saveEditEnv(envId).catch(console.error); break;
        case 'delete-env':              eh.deleteEnv(envId).catch(console.error); break;
        case 'move-env-up':             eh.moveEnvUp(envId).catch(console.error); break;
        case 'move-env-down':           eh.moveEnvDown(envId).catch(console.error); break;
        case 'save-env-config':         eh.saveEnvConfig().catch(console.error); break;
        case 'add-env-var':             eh.addEnvVar().catch(console.error); break;
        case 'remove-env-var':          eh.removeEnvVar(btn.dataset.varName).catch(console.error); break;
        case 'switch-env':              eh.switchEnv(envId); break;
      }
    });

    // テーブル列メニューの外クリックで閉じる
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.data-table-col-toggle-wrap')) {
        document.querySelectorAll('.data-table-col-menu').forEach(m => { m.hidden = true; });
      }
    });

    // change イベント（テーブル列の表示切替 + セクションタイプ変更）
    document.addEventListener('change', (e) => {
      if (e.target.matches('.data-table-col-menu input[type=checkbox]')) {
        EventHandlers.onTableColVisibilityChange(e.target); return;
      }
      if (e.target.id === 'new-section-type') EventHandlers.onNewSectionTypeChange();
    });
  },
};

window.addEventListener('load', () => {
  App.init().catch(console.error);
});
