// ==============================
// 定数
// ==============================

/** セクションタイプのラベル */
const TYPE_LABELS = {
  list: 'リスト',
  grid: 'グリッド',
  url_command: 'URLコマンド',
  table: 'テーブル',
};

/** URLコマンド履歴の localStorage キープレフィックス（ブラウザ固有の UI 状態） */
const URL_HISTORY_PREFIX = 'dashboard_url_history_';

/** 旧 localStorage URL 履歴キー（移行用） */
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

// ==============================
// HomeDB - IndexedDB 管理
// ==============================

class HomeDB {
  constructor() {
    this.db = null;
    this.DB_NAME = _instanceId ? `dashboard_db_${_instanceId}` : 'dashboard_db';
    this.DB_VERSION = 1;
  }

  open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('sections')) {
          const ss = db.createObjectStore('sections', { keyPath: 'id', autoIncrement: true });
          ss.createIndex('position', 'position');
        }
        if (!db.objectStoreNames.contains('items')) {
          const is = db.createObjectStore('items', { keyPath: 'id', autoIncrement: true });
          is.createIndex('section_id', 'section_id');
          is.createIndex('position', 'position');
        }
      };
      req.onsuccess = (e) => { this.db = e.target.result; resolve(this); };
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
    return this._getAll('sections').then(ss => ss.sort((a, b) => a.position - b.position));
  }

  addSection(data) { return this._add('sections', data); }
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

  countSections() { return this._count('sections'); }

  // ── Items ─────────────────────────────

  getItemsBySection(sectionId) {
    return this._getAll('items', 'section_id', IDBKeyRange.only(sectionId))
      .then(items => items.sort((a, b) => a.position - b.position));
  }

  addItem(data) { return this._add('items', data); }
  updateItem(data) { return this._put('items', data); }
  deleteItem(id) { return this._delete('items', id); }
}

// ==============================
// State
// ==============================

const State = {
  db: null,
  sections: [],    // position 昇順
  itemsMap: {},    // sectionId → items[]
  settings: {
    open: false,
    view: 'sections',      // 'sections' | 'edit-section'
    editingSectionId: null,
  },
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
      case 'url_command': Renderer.buildUrlCommandSection(section, bd); break;
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
      const icon = item.item_type === 'copy' ? ICONS.copy : ICONS.link;
      const cta = item.item_type === 'copy' ? ICONS.clipboard : ICONS.external;
      row.innerHTML = `
        <span class="row__icon">${icon}</span>
        <span class="row__label">${escapeHtml(item.label || '')}</span>
        ${item.hint ? `<span class="row__hint">${escapeHtml(item.hint)}</span>` : ''}
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
      const card = document.createElement('a');
      card.className = 'sheet-card js-link';
      card.href = 'javascript:void(0);';
      card.dataset.value = item.value || '';
      card.innerHTML = `
        <span class="sheet-card__emoji">${escapeHtml(item.emoji || '🔗')}</span>
        <span class="sheet-card__name">${escapeHtml(item.label || '')}</span>
        ${ICONS.arrow}
      `;
      grid.appendChild(card);
    });
    bd.appendChild(grid);
  },

  buildUrlCommandSection(section, bd) {
    const sectionId = section.id;
    const template = section.command_template || '';
    const form = document.createElement('div');
    form.className = 'url-form';
    form.innerHTML = `
      <input id="url-input-${sectionId}" type="text" class="url-form__input" placeholder="https://..." />
      <button class="url-form__btn js-copy-cmd" data-section-id="${sectionId}" data-template="${escapeAttr(template)}">
        ${ICONS.clipboard}
        コマンドをコピー
      </button>
    `;
    bd.appendChild(form);

    const historyWrap = document.createElement('div');
    historyWrap.className = 'url-history';
    historyWrap.id = `url-history-${sectionId}`;
    bd.appendChild(historyWrap);
    Renderer.renderUrlHistory(sectionId);
  },

  renderUrlHistory(sectionId) {
    const wrap = document.getElementById(`url-history-${sectionId}`);
    if (!wrap) return;
    wrap.innerHTML = '';
    const urls = loadJsonFromStorage(URL_HISTORY_PREFIX + sectionId);
    if (!urls || urls.length === 0) return;

    const hd = document.createElement('p');
    hd.className = 'url-history__hd';
    hd.innerHTML = `${ICONS.clock} 最近使ったURL`;
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
    if (items.length === 0) {
      bd.innerHTML = `<p class="section-empty">行がありません。設定から追加してください。</p>`;
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
        const val = row_data[col.id] || '';
        if (col.type === 'copy') {
          td.className = 'data-table__td--copy js-copy';
          td.dataset.value = val;
          td.innerHTML = `${escapeHtml(val)}<span class="td-copy-icon">${ICONS.clipboardSm}</span>`;
        } else if (col.type === 'link' && val) {
          td.className = 'data-table__td--link';
          const a = document.createElement('a');
          a.className = 'js-link';
          a.href = 'javascript:void(0);';
          a.dataset.value = val;
          a.textContent = val;
          td.appendChild(a);
        } else {
          td.textContent = val;
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    bd.appendChild(wrap);
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
    }
  },

  buildSectionsView() {
    const sections = State.sections;
    let html = `<div class="settings-add-bar">
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
          <option value="grid">グリッド（カード型リンク）</option>
          <option value="url_command">URLコマンドビルダー</option>
          <option value="table">テーブル（自由列）</option>
        </select>
      </div>
      <div class="settings-form-row" id="new-section-cmd-row" hidden>
        <label class="settings-label">コマンドテンプレート（{URL} が URL に置換されます）</label>
        <input class="settings-input" id="new-section-cmd" type="text" placeholder='open -n -a "Google Chrome" --args -incognito {URL}' />
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
    const isUrlCmd = section.type === 'url_command';
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

    if (isUrlCmd) {
      html += `
        <div class="settings-form-row">
          <label class="settings-label">コマンドテンプレート（{URL} が URL に置換されます）</label>
          <input class="settings-input" id="edit-section-cmd" type="text" value="${escapeAttr(section.command_template || '')}" placeholder='open -n -a "Google Chrome" --args -incognito {URL}' />
          <button class="settings-btn settings-btn--primary" style="margin-top:8px" data-action="save-section-cmd" data-section-id="${section.id}">保存</button>
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

    // アイテム一覧（url_command 以外）
    if (!isUrlCmd) {
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
      labelText = `${item.emoji || ''} ${item.label || ''}`.trim();
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
        <div class="settings-form-row settings-form-row--inline">
          <input class="settings-input settings-input--xs" id="item-emoji" type="text" value="${escapeAttr(item?.emoji || '')}" placeholder="🔗" maxlength="4" />
          <input class="settings-input" id="item-label" type="text" value="${escapeAttr(item?.label || '')}" placeholder="カード名" />
          <input class="settings-input" id="item-value" type="url" value="${escapeAttr(item?.value || '')}" placeholder="https://..." />
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
    if (cmdRow) cmdRow.hidden = type !== 'url_command';
  },

  async saveAddSection() {
    const icon = document.getElementById('new-section-icon')?.value.trim() || '📋';
    const title = document.getElementById('new-section-title')?.value.trim();
    const type = document.getElementById('new-section-type')?.value || 'list';
    const cmd = document.getElementById('new-section-cmd')?.value.trim() || '';

    if (!title) { alert('タイトルを入力してください'); return; }

    const maxPos = State.sections.length > 0
      ? Math.max(...State.sections.map(s => s.position)) + 1 : 0;

    const data = {
      title, icon, position: maxPos, type,
      command_template: type === 'url_command' ? cmd : null,
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
    await State.db.updateSection(section);
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
      data.item_type = 'card';
      data.emoji = document.getElementById('item-emoji')?.value.trim() || '🔗';
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
      item.emoji = document.getElementById('item-emoji')?.value.trim() || '🔗';
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

  // ── URL コマンド ──────────────────────

  onCopyCmd(btn) {
    const sectionId = Number(btn.dataset.sectionId);
    const template = btn.dataset.template || '';
    const input = document.getElementById(`url-input-${sectionId}`);
    const url = input?.value.trim() || '';
    navigator.clipboard.writeText(template.replace('{URL}', url));
    if (url && isValidUrl(url)) {
      saveToStorageWithLimit(URL_HISTORY_PREFIX + sectionId, url, 10, isValidUrl);
      Renderer.renderUrlHistory(sectionId);
    }
    showToast('コピーしました');
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

    // データをロード
    State.sections = await db.getAllSections();
    for (const section of State.sections) {
      State.itemsMap[section.id] = await db.getItemsBySection(section.id);
    }

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
      // ダッシュボードのコピー行
      const copyEl = e.target.closest('.js-copy');
      if (copyEl && !copyEl.closest('.home-settings')) {
        navigator.clipboard.writeText(copyEl.dataset.value || '');
        showToast('コピーしました');
        return;
      }
      // ダッシュボードのリンク行
      const linkEl = e.target.closest('.js-link');
      if (linkEl && !linkEl.closest('.home-settings')) {
        const url = linkEl.dataset.value || '';
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

      const eh = EventHandlers;
      switch (action) {
        case 'settings-close':      eh.closeSettings(); break;
        case 'settings-back':       eh.backToSections(); break;
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
        case 'move-item-up':        eh.moveItemUp(itemId, sectionId).catch(console.error); break;
        case 'move-item-down':      eh.moveItemDown(itemId, sectionId).catch(console.error); break;
      }
    });

    // セクションタイプ変更でコマンドフィールドの表示切替
    document.addEventListener('change', (e) => {
      if (e.target.id === 'new-section-type') EventHandlers.onNewSectionTypeChange();
    });
  },
};

window.addEventListener('load', () => {
  App.init().catch(console.error);
});
