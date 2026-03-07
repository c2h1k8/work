'use strict';

// ── IndexedDB ─────────────────────────────────────────────────
const KnowledgeDB = (() => {
  const DB_NAME = 'knowledge_db';
  const DB_VERSION = 1;
  let _db = null;

  function open() {
    return new Promise((resolve, reject) => {
      if (_db) { resolve(_db); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        // タスクストア
        if (!db.objectStoreNames.contains('tasks')) {
          db.createObjectStore('tasks', { keyPath: 'id', autoIncrement: true });
        }
        // フィールド定義ストア
        if (!db.objectStoreNames.contains('fields')) {
          const fs = db.createObjectStore('fields', { keyPath: 'id', autoIncrement: true });
          fs.createIndex('position', 'position');
        }
        // エントリストア（タスク×フィールドの値）
        if (!db.objectStoreNames.contains('entries')) {
          const es = db.createObjectStore('entries', { keyPath: 'id', autoIncrement: true });
          es.createIndex('task_id', 'task_id');
          es.createIndex('field_id', 'field_id');
        }
      };
      req.onsuccess = e => { _db = e.target.result; resolve(_db); };
      req.onerror = e => reject(e.target.error);
    });
  }

  function _getAll(storeName) {
    return new Promise((resolve, reject) => {
      const req = _db.transaction(storeName).objectStore(storeName).getAll();
      req.onsuccess = e => resolve(e.target.result);
      req.onerror = e => reject(e.target.error);
    });
  }

  function _add(storeName, data) {
    return new Promise((resolve, reject) => {
      const req = _db.transaction(storeName, 'readwrite').objectStore(storeName).add(data);
      req.onsuccess = e => resolve(e.target.result);
      req.onerror = e => reject(e.target.error);
    });
  }

  function _put(storeName, data) {
    return new Promise((resolve, reject) => {
      const req = _db.transaction(storeName, 'readwrite').objectStore(storeName).put(data);
      req.onsuccess = e => resolve(e.target.result);
      req.onerror = e => reject(e.target.error);
    });
  }

  function _delete(storeName, id) {
    return new Promise((resolve, reject) => {
      const req = _db.transaction(storeName, 'readwrite').objectStore(storeName).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = e => reject(e.target.error);
    });
  }

  function _getByIndex(storeName, indexName, value) {
    return new Promise((resolve, reject) => {
      const req = _db.transaction(storeName).objectStore(storeName).index(indexName).getAll(value);
      req.onsuccess = e => resolve(e.target.result);
      req.onerror = e => reject(e.target.error);
    });
  }

  // ── タスク操作 ──────────────────────────────────────────────
  async function getAllTasks() {
    return _getAll('tasks');
  }

  async function addTask(title) {
    const now = Date.now();
    const data = { title, created_at: now, updated_at: now };
    const id = await _add('tasks', data);
    return { id, ...data };
  }

  async function updateTask(task) {
    task.updated_at = Date.now();
    await _put('tasks', task);
    return task;
  }

  async function deleteTask(id) {
    // タスクに紐づくエントリも削除
    const entries = await _getByIndex('entries', 'task_id', id);
    const t = _db.transaction(['tasks', 'entries'], 'readwrite');
    entries.forEach(e => t.objectStore('entries').delete(e.id));
    t.objectStore('tasks').delete(id);
    return new Promise((resolve, reject) => {
      t.oncomplete = () => resolve();
      t.onerror = e => reject(e.target.error);
    });
  }

  // ── フィールド操作 ──────────────────────────────────────────
  async function getAllFields() {
    const fields = await _getAll('fields');
    return fields.sort((a, b) => a.position - b.position);
  }

  async function addField(name, type, options = []) {
    const fields = await getAllFields();
    const position = fields.length > 0 ? Math.max(...fields.map(f => f.position)) + 1 : 0;
    const data = { name, type, options, position, width: 'full', listVisible: false };
    const id = await _add('fields', data);
    return { id, ...data };
  }

  async function updateField(field) {
    await _put('fields', field);
    return field;
  }

  async function deleteField(id) {
    // フィールドに紐づくエントリも削除
    const entries = await _getByIndex('entries', 'field_id', id);
    const t = _db.transaction(['fields', 'entries'], 'readwrite');
    entries.forEach(e => t.objectStore('entries').delete(e.id));
    t.objectStore('fields').delete(id);
    return new Promise((resolve, reject) => {
      t.oncomplete = () => resolve();
      t.onerror = e => reject(e.target.error);
    });
  }

  // 初回起動時にデフォルトフィールドを挿入
  async function initDefaultFields() {
    const existing = await getAllFields();
    if (existing.length > 0) return;
    const defaults = [
      { name: '設計書',         type: 'link',   options: [], width: 'full', listVisible: false },
      { name: 'テストケース',   type: 'link',   options: [], width: 'full', listVisible: false },
      { name: 'ドキュメント',   type: 'link',   options: [], width: 'full', listVisible: false },
      { name: 'エビデンス',     type: 'link',   options: [], width: 'full', listVisible: false },
      { name: 'プルリク',       type: 'link',   options: [], width: 'full', listVisible: false },
      { name: '備考',           type: 'text',   options: [], width: 'full', listVisible: false },
    ];
    for (let i = 0; i < defaults.length; i++) {
      await _add('fields', { ...defaults[i], position: i });
    }
  }

  // ── エントリ操作 ────────────────────────────────────────────
  async function getAllEntries() {
    return _getAll('entries');
  }

  async function getEntriesByTask(taskId) {
    return _getByIndex('entries', 'task_id', taskId);
  }

  async function addEntry(taskId, fieldId, label, value) {
    const data = { task_id: taskId, field_id: fieldId, label, value, created_at: Date.now() };
    const id = await _add('entries', data);
    return { id, ...data };
  }

  async function updateEntry(entry) {
    await _put('entries', entry);
    return entry;
  }

  async function deleteEntry(id) {
    await _delete('entries', id);
  }

  // ── エクスポート/インポート ──────────────────────────────────
  async function exportData() {
    const [tasks, fields, entries] = await Promise.all([
      getAllTasks(), getAllFields(), _getAll('entries'),
    ]);
    return { type: 'knowledge_export', version: 1, tasks, fields, entries };
  }

  async function importData(data) {
    // 全クリア → 再挿入（2トランザクション）
    await new Promise((resolve, reject) => {
      const t = _db.transaction(['tasks', 'fields', 'entries'], 'readwrite');
      t.objectStore('tasks').clear();
      t.objectStore('fields').clear();
      t.objectStore('entries').clear();
      t.oncomplete = () => resolve();
      t.onerror = e => reject(e.target.error);
    });
    await new Promise((resolve, reject) => {
      const t = _db.transaction(['tasks', 'fields', 'entries'], 'readwrite');
      const ts = t.objectStore('tasks');
      const fs = t.objectStore('fields');
      const es = t.objectStore('entries');
      (data.tasks   || []).forEach(item => ts.put(item));
      (data.fields  || []).forEach(item => fs.put(item));
      (data.entries || []).forEach(item => es.put(item));
      t.oncomplete = () => resolve();
      t.onerror = e => reject(e.target.error);
    });
  }

  return {
    open,
    getAllTasks, addTask, updateTask, deleteTask,
    getAllFields, addField, updateField, deleteField, initDefaultFields,
    getAllEntries, getEntriesByTask, addEntry, updateEntry, deleteEntry,
    exportData, importData,
  };
})();

// ── State ──────────────────────────────────────────────────────
const State = {
  tasks: [],           // 全タスク
  fields: [],          // フィールド定義（position昇順）
  selectedTaskId: null,
  entries: [],         // 選択中タスクのエントリ
  allEntries: [],      // 全タスクのエントリ（タスク一覧表示用キャッシュ）
  searchText: '',
  sort: { field: 'created_at', dir: 'desc' }, // ソート状態（localStorage: kn_sort）
  listFilter: {},      // field_id → string（select）or Set（label）
  _labelFilters: [],   // LabelFilter インスタンス（renderFilterUI で管理）
};

// ── フィルター状態の永続化 ──────────────────────────────────────
function _saveFilter() {
  const serialized = {};
  for (const [key, val] of Object.entries(State.listFilter)) {
    if (val instanceof Set && val.size > 0) {
      serialized[key] = { type: 'set', values: [...val] };
    } else if (val) {
      serialized[key] = { type: 'string', value: val };
    }
  }
  localStorage.setItem('kn_filter', JSON.stringify(serialized));
}

function _loadFilter() {
  try {
    const raw = localStorage.getItem('kn_filter');
    if (!raw) return;
    const parsed = JSON.parse(raw);
    for (const [key, entry] of Object.entries(parsed)) {
      const fieldId = Number(key);
      const field = State.fields.find(f => f.id === fieldId);
      if (!field || !field.listVisible) continue;
      if (field.type === 'select' && entry.type === 'string') {
        State.listFilter[key] = entry.value;
      } else if (field.type === 'label' && entry.type === 'set') {
        State.listFilter[key] = new Set(entry.values || []);
      }
    }
  } catch (e) { /* ignore */ }
}

// ── ユーティリティ ──────────────────────────────────────────────
function _esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// 日付文字列（YYYY-MM-DD）を日本語形式（YYYY/MM/DD）に変換
function _formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${y}/${m}/${d}`;
}

function showToast(msg) {
  const el = document.getElementById('kn-toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.hidden = true; }, 2500);
}

// 削除アイコン SVG
const DEL_SVG = `<svg viewBox="0 0 16 16" aria-hidden="true" width="12" height="12" fill="currentColor">
  <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/>
</svg>`;

// ── Renderer ────────────────────────────────────────────────────
const Renderer = {
  // タスクをソートして返す
  _sortTasks(tasks) {
    const { field, dir } = State.sort;
    return [...tasks].sort((a, b) => {
      let va = field === 'title' ? (a.title || '').toLowerCase() : (a[field] ?? 0);
      let vb = field === 'title' ? (b.title || '').toLowerCase() : (b[field] ?? 0);
      if (va < vb) return dir === 'asc' ? -1 : 1;
      if (va > vb) return dir === 'asc' ? 1 : -1;
      return 0;
    });
  },

  // テキスト・フィールドフィルタを適用して返す
  _filterTasks(tasks) {
    let result = tasks;

    // テキスト検索
    if (State.searchText) {
      result = result.filter(t => t.title.includes(State.searchText));
    }

    // フィールドフィルタ
    for (const [fieldIdStr, filterVal] of Object.entries(State.listFilter)) {
      const fieldId = Number(fieldIdStr);
      const field = State.fields.find(f => f.id === fieldId);
      if (!field) continue;

      if (field.type === 'select') {
        if (!filterVal) continue; // 「すべて」= フィルタなし
        result = result.filter(t => {
          const entries = State.allEntries.filter(e => e.task_id === t.id && e.field_id === fieldId);
          return entries.some(e => e.value === filterVal);
        });
      } else if (field.type === 'label') {
        if (!(filterVal instanceof Set) || filterVal.size === 0) continue;
        result = result.filter(t => {
          const entries = State.allEntries.filter(e => e.task_id === t.id && e.field_id === fieldId);
          if (entries.length === 0) return false;
          try {
            const labels = JSON.parse(entries[0].value);
            return [...filterVal].some(v => labels.includes(v));
          } catch { return false; }
        });
      }
    }

    return result;
  },

  // タスク一覧に表示するフィールド値バッジ（1フィールド分）
  _renderFieldBadge(field, entries) {
    const entry = entries[0] || null;
    switch (field.type) {
      case 'select':
        if (!entry || !entry.value) return '';
        return `<span class="kn-task-field-badge kn-task-field-badge--select">${_esc(entry.value)}</span>`;

      case 'label': {
        if (!entry) return '';
        let labelNames = [];
        try { labelNames = JSON.parse(entry.value); } catch { return ''; }
        if (labelNames.length === 0) return '';
        const opts = field.options || [];
        return labelNames.map(name => {
          const opt = opts.find(o => o.name === name);
          const color = opt?.color || '#8957e5';
          return `<span class="kn-task-field-badge kn-task-field-badge--label" style="background:${color}22;color:${color};">${_esc(name)}</span>`;
        }).join('');
      }

      case 'date':
        if (!entry || !entry.value) return '';
        return `<span class="kn-task-field-badge kn-task-field-badge--date">${_esc(_formatDate(entry.value))}</span>`;

      case 'link':
        if (entries.length === 0) return '';
        return `<span class="kn-task-field-badge kn-task-field-badge--link">${_esc(field.name)}: ${entries.length}件</span>`;

      case 'text': {
        if (!entry || !entry.value) return '';
        const truncated = entry.value.length > 20 ? entry.value.slice(0, 20) + '…' : entry.value;
        return `<span class="kn-task-field-badge kn-task-field-badge--text" title="${_esc(entry.value)}">${_esc(truncated)}</span>`;
      }

      default:
        return '';
    }
  },

  // タスクリスト描画
  renderTaskList() {
    const list = document.getElementById('task-list');
    const sorted = this._sortTasks(State.tasks);
    const filtered = this._filterTasks(sorted);
    const visibleFields = State.fields.filter(f => f.listVisible);

    if (filtered.length === 0) {
      list.innerHTML = '<li class="kn-task-list__empty">タスクがありません</li>';
      return;
    }

    list.innerHTML = filtered.map(task => {
      const isSelected = task.id === State.selectedTaskId;

      let fieldsHtml = '';
      if (visibleFields.length > 0) {
        const taskEntries = State.allEntries.filter(e => e.task_id === task.id);
        const badges = visibleFields.map(f => {
          const entries = taskEntries.filter(e => e.field_id === f.id);
          return this._renderFieldBadge(f, entries);
        }).filter(s => s);
        if (badges.length > 0) {
          fieldsHtml = `<div class="kn-task-item__fields">${badges.join('')}</div>`;
        }
      }

      return `<li class="kn-task-item${isSelected ? ' is-selected' : ''}" data-task-id="${task.id}">
        <span class="kn-task-item__title">${_esc(task.title)}</span>
        ${fieldsHtml}
      </li>`;
    }).join('');
  },

  // フィルター UI を再描画（CustomSelect + LabelFilter コンポーネント使用）
  renderFilterUI() {
    const container = document.getElementById('kn-filters');
    const filterFields = State.fields.filter(f => f.listVisible && (f.type === 'select' || f.type === 'label'));

    // 既存の LabelFilter インスタンスをクリーンアップ
    State._labelFilters.forEach(inst => inst.destroy());
    State._labelFilters = [];
    container.innerHTML = '';

    if (filterFields.length === 0) return;

    for (const f of filterFields) {
      const row = document.createElement('div');
      row.className = 'kn-filter-row';

      const labelEl = document.createElement('span');
      labelEl.className = 'kn-filter-label';
      labelEl.textContent = f.name + ':';
      row.appendChild(labelEl);
      container.appendChild(row);

      if (f.type === 'select') {
        // CustomSelect で select を置き換える
        const select = document.createElement('select');
        select.className = 'kn-select kn-select--sm kn-select--grow';
        select.dataset.filterSelect = f.id;

        const allOpt = document.createElement('option');
        allOpt.value = '';
        allOpt.textContent = 'すべて';
        select.appendChild(allOpt);

        for (const o of (f.options || [])) {
          const opt = document.createElement('option');
          opt.value = o;
          opt.textContent = o;
          if (State.listFilter[f.id] === o) opt.selected = true;
          select.appendChild(opt);
        }
        row.appendChild(select);
        CustomSelect.create(select);

      } else if (f.type === 'label') {
        // LabelFilter コンポーネントを使用（カラー付き）
        const opts = f.options || [];
        const activeSet = State.listFilter[f.id] instanceof Set ? State.listFilter[f.id] : new Set();
        const items = opts.map(o => ({ id: o.name, name: o.name, color: o.color }));

        const lfContainer = document.createElement('div');
        row.appendChild(lfContainer);

        const fieldId = f.id;
        const inst = LabelFilter.create(lfContainer, {
          items,
          selected: activeSet,
          label: f.name,
          onChange: selected => {
            State.listFilter[fieldId] = selected;
            _saveFilter();
            Renderer.renderTaskList();
          },
        });
        State._labelFilters.push(inst);
      }
    }
  },

  // 詳細パネル描画
  async renderDetail() {
    const task = State.tasks.find(t => t.id === State.selectedTaskId);
    const empty = document.getElementById('kn-empty');
    const content = document.getElementById('detail-content');

    if (!task) {
      empty.hidden = false;
      content.hidden = true;
      return;
    }
    empty.hidden = true;
    content.hidden = false;

    // フィールドごとにエントリをグループ化
    const entryMap = {};
    State.fields.forEach(f => { entryMap[f.id] = []; });
    State.entries.forEach(e => {
      if (entryMap[e.field_id] !== undefined) entryMap[e.field_id].push(e);
    });

    content.innerHTML = `
      <div class="kn-detail__header">
        <div class="kn-detail__title-row">
          <h2 class="kn-detail__title" id="detail-title" data-action="edit-title" title="クリックして編集">${_esc(task.title)}</h2>
          <button class="kn-icon-btn kn-icon-btn--danger" data-action="delete-task" data-task-id="${task.id}" title="タスクを削除">
            <svg viewBox="0 0 16 16" aria-hidden="true" width="14" height="14" fill="currentColor">
              <path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z"/>
            </svg>
          </button>
        </div>
        <div class="kn-detail__meta">
          作成日: ${new Date(task.created_at).toLocaleString('ja-JP')}
          ${task.updated_at !== task.created_at ? `　更新日: ${new Date(task.updated_at).toLocaleString('ja-JP')}` : ''}
        </div>
      </div>

      <div class="kn-fields" id="detail-fields">
        ${State.fields.map(f => this._renderField(f, entryMap[f.id] || [])).join('')}
      </div>
    `;
  },

  _renderField(field, entries) {
    const entry = entries[0] || null;
    const options = field.options || [];
    const width = field.width || 'full';

    let bodyHtml = '';

    if (field.type === 'link') {
      // リンクは複数可 → 追加ボタンあり
      bodyHtml = `
        <div class="kn-field__entries" id="entries-${field.id}">
          ${entries.map(e => this._renderLinkEntry(e)).join('')}
        </div>
        <button class="kn-add-entry-btn" data-action="add-entry" data-field-id="${field.id}" data-field-type="link">＋ 追加</button>
        <div class="kn-entry-form" id="entry-form-${field.id}" hidden>
          <div class="kn-entry-form__row">
            <input type="text" class="kn-input" placeholder="表示名（省略可）" data-entry-label>
            <input type="url" class="kn-input" placeholder="URL（例: https://...）" data-entry-value>
          </div>
          <div class="kn-entry-form__actions">
            <button class="btn btn--primary btn--sm" data-action="save-entry" data-field-id="${field.id}" data-field-type="link">追加</button>
            <button class="btn btn--secondary btn--sm" data-action="cancel-entry" data-field-id="${field.id}">キャンセル</button>
          </div>
        </div>
      `;
    } else if (field.type === 'text') {
      // テキストはメモ風インライン textarea（単一・自動保存）
      bodyHtml = `<textarea class="kn-memo" data-text-field="${field.id}" data-entry-id="${entry ? entry.id : ''}" rows="3" placeholder="テキストを入力...">${_esc(entry ? entry.value : '')}</textarea>`;
    } else if (field.type === 'date') {
      // 日付はカスタムDatePicker（単一）
      const dateStr = entry ? entry.value : '';
      const displayStr = entry ? _formatDate(entry.value) : '';
      if (displayStr) {
        bodyHtml = `
          <div class="kn-date-display" data-action="open-datepicker" data-field-id="${field.id}" data-entry-id="${entry.id}" data-date-value="${_esc(dateStr)}">
            <svg viewBox="0 0 16 16" aria-hidden="true" width="13" height="13" fill="currentColor" class="kn-date-display__icon">
              <path d="M4.75 0a.75.75 0 0 1 .75.75V2h5V.75a.75.75 0 0 1 1.5 0V2h1.25c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 13.25 16H2.75A1.75 1.75 0 0 1 1 14.25V3.75C1 2.784 1.784 2 2.75 2H4V.75A.75.75 0 0 1 4.75 0ZM2.5 7.5v6.75c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25V7.5Zm10.75-4H2.75a.25.25 0 0 0-.25.25V6h11V3.75a.25.25 0 0 0-.25-.25Z"/>
            </svg>
            <span class="kn-date-text">${_esc(displayStr)}</span>
            <button class="kn-entry__delete" data-action="delete-entry" data-entry-id="${entry.id}" title="クリア">${DEL_SVG}</button>
          </div>
        `;
      } else {
        bodyHtml = `
          <div class="kn-date-display kn-date-display--empty" data-action="open-datepicker" data-field-id="${field.id}" data-entry-id="" data-date-value="">
            <svg viewBox="0 0 16 16" aria-hidden="true" width="13" height="13" fill="currentColor" class="kn-date-display__icon">
              <path d="M4.75 0a.75.75 0 0 1 .75.75V2h5V.75a.75.75 0 0 1 1.5 0V2h1.25c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 13.25 16H2.75A1.75 1.75 0 0 1 1 14.25V3.75C1 2.784 1.784 2 2.75 2H4V.75A.75.75 0 0 1 4.75 0ZM2.5 7.5v6.75c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25V7.5Zm10.75-4H2.75a.25.25 0 0 0-.25.25V6h11V3.75a.25.25 0 0 0-.25-.25Z"/>
            </svg>
            <span class="kn-date-placeholder">日付を選択...</span>
          </div>
        `;
      }
    } else if (field.type === 'select') {
      // 選択はインライン select（単一・自動保存）
      if (options.length === 0) {
        bodyHtml = `<p class="kn-empty-msg kn-empty-msg--inline">選択肢が設定されていません。フィールド管理で追加してください。</p>`;
      } else {
        bodyHtml = `
          <select class="kn-select kn-select--full" data-select-field="${field.id}" data-entry-id="${entry ? entry.id : ''}">
            <option value="">選択してください</option>
            ${options.map(o => `<option value="${_esc(o)}" ${entry && entry.value === o ? 'selected' : ''}>${_esc(o)}</option>`).join('')}
          </select>
        `;
      }
    } else if (field.type === 'label') {
      // ラベルはバッジトグル形式（自動保存）
      bodyHtml = this._renderLabelForm(field, entries);
    }

    return `
      <div class="kn-field" data-field-id="${field.id}" data-width="${width}"${field.newRow ? ' data-new-row="true"' : ''}>
        <div class="kn-field__header">
          <span class="kn-field-label">${_esc(field.name)}</span>
        </div>
        ${bodyHtml}
      </div>
    `;
  },

  // ラベルタイプ：バッジトグル形式（チェックボックスなし、保存ボタンなし、カラー付き）
  _renderLabelForm(field, entries) {
    const opts = field.options || [];
    if (opts.length === 0) {
      return '<p class="kn-empty-msg kn-empty-msg--inline">選択肢が設定されていません。フィールド管理で追加してください。</p>';
    }

    let selectedLabels = [];
    const entryId = entries.length > 0 ? entries[0].id : null;
    if (entryId) {
      try { selectedLabels = JSON.parse(entries[0].value); } catch (e) { selectedLabels = []; }
    }

    return `
      <div class="kn-label-form" data-field-id="${field.id}" data-entry-id="${entryId !== null ? entryId : ''}">
        <div class="kn-label-form__options">
          ${opts.map(opt => {
            const isActive = selectedLabels.includes(opt.name);
            const style = isActive
              ? `background:${opt.color};border-color:${opt.color};color:#fff;`
              : `border-color:${opt.color}66;color:${opt.color};`;
            return `
              <button class="kn-label-tag${isActive ? ' is-active' : ''}"
                      data-action="toggle-label" data-field-id="${field.id}" data-option="${_esc(opt.name)}"
                      style="${style}">
                ${_esc(opt.name)}
              </button>
            `;
          }).join('')}
        </div>
      </div>
    `;
  },

  // リンクエントリの描画（リンクタイプのみ使用）
  _renderLinkEntry(entry) {
    const display = entry.label || entry.value;
    return `<div class="kn-entry" data-entry-id="${entry.id}">
      <a href="${_esc(entry.value)}" target="_blank" rel="noopener noreferrer" class="kn-entry__link">
        <svg viewBox="0 0 16 16" aria-hidden="true" width="11" height="11" fill="currentColor" flex-shrink="0">
          <path d="M3.75 2h3.5a.75.75 0 0 1 0 1.5h-3.5a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-3.5a.75.75 0 0 1 1.5 0v3.5A1.75 1.75 0 0 1 12.25 14h-8.5A1.75 1.75 0 0 1 2 12.25v-8.5C2 2.784 2.784 2 3.75 2Zm6.854-1h4.146a.25.25 0 0 1 .25.25v4.146a.25.25 0 0 1-.427.177L13.03 4.03 9.28 7.78a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042l3.75-3.75-1.543-1.543A.25.25 0 0 1 10.604 1Z"/>
        </svg>
        <span class="kn-entry__link-text">${_esc(display)}</span>
      </a>
      <button class="kn-entry__delete" data-action="delete-entry" data-entry-id="${entry.id}" title="削除">${DEL_SVG}</button>
    </div>`;
  },

  // フィールド管理モーダル描画
  renderFieldModal() {
    const body = document.getElementById('field-modal-body');
    if (State.fields.length === 0) {
      body.innerHTML = '<p class="kn-empty-msg">フィールドがありません。下のフォームから追加してください。</p>';
      return;
    }
    const typeLabels = { link: 'リンク', text: 'テキスト', date: '日付', select: '選択', label: 'ラベル' };
    body.innerHTML = `<ul class="kn-field-list">
      ${State.fields.map((f, i) => {
        const hasSelectOptions = f.type === 'select';
        const hasLabelOptions  = f.type === 'label';
        const options = f.options || [];
        // half は旧データ互換として auto 扱い
        const rawWidth = f.width || 'full';
        const displayWidth = (rawWidth === 'half') ? 'auto' : rawWidth;
        return `
          <li class="kn-field-item" data-field-id="${f.id}">
            <div class="kn-field-item__main">
              <span class="kn-field-item__name kn-field-item__name--editable" data-action="edit-field-name" data-field-id="${f.id}" title="クリックしてフィールド名を変更">${_esc(f.name)}</span>
              <span class="kn-field-item__type" data-type="${f.type}">${typeLabels[f.type] || f.type}</span>
              <select class="kn-select kn-select--sm" data-field-width="${f.id}" title="表示幅">
                <option value="auto" ${displayWidth === 'auto' ? 'selected' : ''}>標準</option>
                <option value="wide" ${displayWidth === 'wide' ? 'selected' : ''}>広幅</option>
                <option value="full" ${displayWidth === 'full' ? 'selected' : ''}>全幅</option>
              </select>
              <label class="kn-field-item__visible" title="新しい行から開始する">
                <input type="checkbox" data-field-new-row="${f.id}"${f.newRow ? ' checked' : ''}>
                行頭開始
              </label>
              <label class="kn-field-item__visible" title="タスク一覧に値を表示する">
                <input type="checkbox" data-field-list-visible="${f.id}"${f.listVisible ? ' checked' : ''}>
                一覧表示
              </label>
              <div class="kn-field-item__actions">
                <button class="kn-icon-btn" data-action="move-field-up" data-field-id="${f.id}" ${i === 0 ? 'disabled' : ''} title="上へ">↑</button>
                <button class="kn-icon-btn" data-action="move-field-down" data-field-id="${f.id}" ${i === State.fields.length - 1 ? 'disabled' : ''} title="下へ">↓</button>
                ${hasSelectOptions ? `
                  <button class="kn-icon-btn" data-action="toggle-field-options" data-field-id="${f.id}" title="選択肢を管理">
                    <svg viewBox="0 0 16 16" aria-hidden="true" width="12" height="12" fill="currentColor">
                      <path d="M0 2.75C0 1.784.784 1 1.75 1h12.5c.966 0 1.75.784 1.75 1.75v2.5A1.75 1.75 0 0 1 14.25 7H1.75A1.75 1.75 0 0 1 0 5.25Zm1.75-.25a.25.25 0 0 0-.25.25v2.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25v-2.5a.25.25 0 0 0-.25-.25ZM0 10.75C0 9.784.784 9 1.75 9h12.5c.966 0 1.75.784 1.75 1.75v2.5A1.75 1.75 0 0 1 14.25 15H1.75A1.75 1.75 0 0 1 0 13.25Zm1.75-.25a.25.25 0 0 0-.25.25v2.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25v-2.5a.25.25 0 0 0-.25-.25Z"/>
                    </svg>
                  </button>
                ` : ''}
                ${hasLabelOptions ? `
                  <button class="btn-manage-labels kn-icon-btn--manage-labels" data-action="open-label-manager" data-field-id="${f.id}" title="ラベルを管理">
                    <svg viewBox="0 0 16 16" aria-hidden="true" width="12" height="12" fill="currentColor">
                      <path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3.879a1.5 1.5 0 0 1 1.06.44l8.5 8.5a1.5 1.5 0 0 1 0 2.12l-3.878 3.879a1.5 1.5 0 0 1-2.122 0l-8.5-8.5A1.5 1.5 0 0 1 1 6.38Zm1.5 0v3.879l8.5 8.5 3.879-3.878-8.5-8.5ZM6 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"/>
                    </svg>
                    ラベル
                  </button>
                ` : ''}
                <button class="kn-icon-btn kn-icon-btn--danger" data-action="delete-field" data-field-id="${f.id}" title="削除">
                  <svg viewBox="0 0 16 16" aria-hidden="true" width="12" height="12" fill="currentColor">
                    <path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z"/>
                  </svg>
                </button>
              </div>
            </div>
            ${hasSelectOptions ? `
              <div class="kn-field-item__options" id="field-options-${f.id}" hidden>
                <div class="kn-option-chips">
                  ${options.length > 0
                    ? options.map(o => `
                        <span class="kn-option-chip">
                          ${_esc(o)}
                          <button class="kn-option-chip__del" data-action="remove-field-option" data-field-id="${f.id}" data-option="${_esc(o)}" title="削除">×</button>
                        </span>
                      `).join('')
                    : '<span class="kn-option-chips__empty">選択肢がありません</span>'
                  }
                </div>
                <div class="kn-option-add-row">
                  <input type="text" class="kn-input kn-input--sm" placeholder="新しい選択肢を入力" data-option-input data-field-id="${f.id}">
                  <button class="btn btn--primary btn--sm" data-action="add-field-option" data-field-id="${f.id}">追加</button>
                </div>
              </div>
            ` : ''}
          </li>
        `;
      }).join('')}
    </ul>`;
  },
};

// ── EventHandlers ───────────────────────────────────────────────
const EventHandlers = {
  _textFieldTimers: {},

  async init(db) {
    // タスクリストのクリック
    document.getElementById('task-list').addEventListener('click', e => {
      const item = e.target.closest('.kn-task-item');
      if (item) this._onSelectTask(item, db).catch(console.error);
    });

    // タスク検索
    document.getElementById('task-search').addEventListener('input', e => {
      State.searchText = e.target.value.trim();
      Renderer.renderTaskList();
    });

    // ソート変更
    document.getElementById('kn-sort').addEventListener('change', e => {
      const [field, dir] = e.target.value.split('-');
      State.sort = { field, dir };
      localStorage.setItem('kn_sort', e.target.value);
      Renderer.renderTaskList();
    });

    // フィルター：select タイプ（CustomSelect が dispatch する change イベントで動作）
    document.getElementById('kn-filters').addEventListener('change', e => {
      const sel = e.target.closest('[data-filter-select]');
      if (!sel) return;
      const fieldId = Number(sel.dataset.filterSelect);
      State.listFilter[fieldId] = sel.value || null;
      _saveFilter();
      Renderer.renderTaskList();
    });

    // ヘッダーアクション（フィールド管理・エクスポート・インポート）
    document.querySelector('.kn-header__actions').addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      switch (btn.dataset.action) {
        case 'manage-fields':
          Renderer.renderFieldModal();
          document.getElementById('field-modal').hidden = false;
          document.getElementById('new-field-options-row').hidden = true;
          document.getElementById('new-field-options').value = '';
          document.getElementById('new-field-type').value = 'link';
          break;
        case 'export': this._onExport(db).catch(console.error); break;
        case 'import': document.getElementById('import-file').click(); break;
      }
    });

    // インポートファイル選択
    document.getElementById('import-file').addEventListener('change', e => {
      this._onImport(e, db).catch(console.error);
    });

    // 新規タスク追加
    document.querySelector('[data-action="add-task"]').addEventListener('click', () => {
      this._onAddTask(db).catch(console.error);
    });

    // 詳細パネルのクリック（イベント委譲）
    document.getElementById('detail-content').addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      this._onDetailAction(btn, db).catch(console.error);
    });

    // テキストフィールドの自動保存（debounce 600ms）
    document.getElementById('detail-content').addEventListener('input', e => {
      if (!e.target.matches('[data-text-field]')) return;
      const fieldId = Number(e.target.dataset.textField);
      const entryId = e.target.dataset.entryId ? Number(e.target.dataset.entryId) : null;
      clearTimeout(this._textFieldTimers[fieldId]);
      this._textFieldTimers[fieldId] = setTimeout(() => {
        this._onSaveTextField(fieldId, entryId, e.target.value, db, e.target).catch(console.error);
      }, 600);
    });

    // 選択フィールドの自動保存
    document.getElementById('detail-content').addEventListener('change', e => {
      if (!e.target.matches('[data-select-field]')) return;
      const fieldId = Number(e.target.dataset.selectField);
      const entryId = e.target.dataset.entryId ? Number(e.target.dataset.entryId) : null;
      this._onSaveSelectField(fieldId, entryId, e.target.value, db, e.target).catch(console.error);
    });

    // フィールド管理モーダルのクリック（イベント委譲）
    document.getElementById('field-modal').addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      this._onFieldModalAction(btn, db).catch(console.error);
    });

    // フィールド幅・一覧表示設定の変更
    document.getElementById('field-modal').addEventListener('change', e => {
      const sel = e.target.closest('[data-field-width]');
      if (sel) {
        const fieldId = Number(sel.dataset.fieldWidth);
        this._onChangeFieldWidth(fieldId, sel.value, db).catch(console.error);
        return;
      }
      const vis = e.target.closest('[data-field-list-visible]');
      if (vis) {
        const fieldId = Number(vis.dataset.fieldListVisible);
        this._onChangeFieldListVisible(fieldId, vis.checked, db).catch(console.error);
        return;
      }
      const nr = e.target.closest('[data-field-new-row]');
      if (nr) {
        const fieldId = Number(nr.dataset.fieldNewRow);
        this._onChangeFieldNewRow(fieldId, nr.checked, db).catch(console.error);
      }
    });

    // フィールド追加フォームのEnterキー
    document.getElementById('new-field-name').addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const addBtn = document.querySelector('#field-modal [data-action="add-field"]');
        if (addBtn) addBtn.click();
      }
    });

    // フィールド管理モーダルでのオプション入力Enterキー
    document.getElementById('field-modal').addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const input = e.target.closest('[data-option-input]');
      if (!input) return;
      const fieldId = input.dataset.fieldId;
      const addBtn = document.querySelector(`[data-action="add-field-option"][data-field-id="${fieldId}"]`);
      if (addBtn) addBtn.click();
    });

    // フィールドタイプ変更でオプション入力欄を切り替え
    document.getElementById('new-field-type').addEventListener('change', e => {
      // label タイプは LabelManager で管理するため、新規作成時は選択肢不要
      const needsOptions = e.target.value === 'select';
      document.getElementById('new-field-options-row').hidden = !needsOptions;
    });
  },

  async _onSelectTask(item, db) {
    const taskId = Number(item.dataset.taskId);
    State.selectedTaskId = taskId;
    State.entries = await db.getEntriesByTask(taskId);
    Renderer.renderTaskList();
    await Renderer.renderDetail();
  },

  async _onAddTask(db) {
    const title = prompt('タスクのタイトルを入力してください');
    if (!title || !title.trim()) return;
    const task = await db.addTask(title.trim());
    State.tasks.push(task);
    State.selectedTaskId = task.id;
    State.entries = [];
    Renderer.renderTaskList();
    await Renderer.renderDetail();
  },

  async _onDetailAction(btn, db) {
    switch (btn.dataset.action) {
      case 'edit-title':       this._onEditTitle(db); break;
      case 'delete-task':      await this._onDeleteTask(db); break;
      case 'add-entry':        this._onShowEntryForm(btn); break;
      case 'cancel-entry':     this._onCancelEntryForm(btn); break;
      case 'save-entry':       await this._onSaveEntry(btn, db); break;
      case 'delete-entry':     await this._onDeleteEntry(btn, db); break;
      case 'open-datepicker':  this._onOpenDatePicker(btn, db); break;
      case 'toggle-label':     await this._onToggleLabel(btn, db); break;
    }
  },

  _onEditTitle(db) {
    const titleEl = document.getElementById('detail-title');
    if (!titleEl) return;
    const task = State.tasks.find(t => t.id === State.selectedTaskId);
    if (!task) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = task.title;
    input.className = 'kn-title-input';
    titleEl.replaceWith(input);
    input.focus();
    input.select();

    const restore = (newTitle) => {
      const h2 = document.createElement('h2');
      h2.className = 'kn-detail__title';
      h2.id = 'detail-title';
      h2.dataset.action = 'edit-title';
      h2.title = 'クリックして編集';
      h2.textContent = newTitle;
      input.replaceWith(h2);
    };

    const save = async () => {
      const newTitle = input.value.trim();
      if (newTitle && newTitle !== task.title) {
        task.title = newTitle;
        await db.updateTask(task).catch(console.error);
        Renderer.renderTaskList();
      }
      restore(task.title);
    };

    input.addEventListener('blur', save);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter')  { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { input.value = task.title; input.blur(); }
    });
  },

  async _onDeleteTask(db) {
    const task = State.tasks.find(t => t.id === State.selectedTaskId);
    if (!task) return;
    if (!confirm(`「${task.title}」を削除しますか？\nこのタスクのすべてのエントリも削除されます。`)) return;
    await db.deleteTask(task.id);
    // allEntries からも削除
    State.allEntries = State.allEntries.filter(e => e.task_id !== task.id);
    State.tasks = State.tasks.filter(t => t.id !== task.id);
    State.selectedTaskId = null;
    State.entries = [];
    Renderer.renderTaskList();
    await Renderer.renderDetail();
  },

  _onShowEntryForm(btn) {
    const fieldId = btn.dataset.fieldId;
    const form = document.getElementById(`entry-form-${fieldId}`);
    if (!form) return;
    btn.hidden = true;
    form.hidden = false;
    const first = form.querySelector('input[type="text"], input[type="url"], textarea, select');
    if (first) first.focus();
  },

  _onCancelEntryForm(btn) {
    const fieldId = btn.dataset.fieldId;
    const form = document.getElementById(`entry-form-${fieldId}`);
    if (!form) return;
    form.hidden = true;
    form.querySelectorAll('input, textarea, select').forEach(el => { el.value = ''; });
    const addBtn = form.parentElement.querySelector('[data-action="add-entry"]');
    if (addBtn) addBtn.hidden = false;
  },

  async _onSaveEntry(btn, db) {
    // リンクタイプのみ使用
    const fieldId = Number(btn.dataset.fieldId);
    const form = document.getElementById(`entry-form-${fieldId}`);
    if (!form) return;

    const label = (form.querySelector('[data-entry-label]')?.value || '').trim();
    const value = (form.querySelector('[data-entry-value]')?.value || '').trim();
    if (!value) { showToast('URLを入力してください'); return; }

    const entry = await db.addEntry(State.selectedTaskId, fieldId, label, value);
    State.entries.push(entry);
    State.allEntries.push(entry);
    await this._touchTask(db);
    await Renderer.renderDetail();
  },

  async _onDeleteEntry(btn, db) {
    const entryId = Number(btn.dataset.entryId);
    await db.deleteEntry(entryId);
    State.entries = State.entries.filter(e => e.id !== entryId);
    State.allEntries = State.allEntries.filter(e => e.id !== entryId);
    await this._touchTask(db);
    await Renderer.renderDetail();
  },

  // テキストフィールドの自動保存
  async _onSaveTextField(fieldId, entryId, value, db, textarea) {
    if (entryId) {
      const entry = State.entries.find(e => e.id === entryId);
      if (entry) {
        entry.value = value;
        await db.updateEntry(entry);
        // allEntries のキャッシュも更新
        const cached = State.allEntries.find(e => e.id === entryId);
        if (cached) cached.value = value;
      }
    } else if (value.trim()) {
      const entry = await db.addEntry(State.selectedTaskId, fieldId, '', value);
      State.entries.push(entry);
      State.allEntries.push(entry);
      if (textarea) textarea.dataset.entryId = entry.id;
    }
    await this._touchTask(db);
  },

  // 選択フィールドの自動保存
  async _onSaveSelectField(fieldId, entryId, value, db, select) {
    if (entryId) {
      if (!value) {
        // 空選択 → エントリ削除
        await db.deleteEntry(entryId);
        State.entries = State.entries.filter(e => e.id !== entryId);
        State.allEntries = State.allEntries.filter(e => e.id !== entryId);
        if (select) select.dataset.entryId = '';
      } else {
        const entry = State.entries.find(e => e.id === entryId);
        if (entry) {
          entry.value = value;
          await db.updateEntry(entry);
          const cached = State.allEntries.find(e => e.id === entryId);
          if (cached) cached.value = value;
        }
      }
    } else if (value) {
      const entry = await db.addEntry(State.selectedTaskId, fieldId, '', value);
      State.entries.push(entry);
      State.allEntries.push(entry);
      if (select) select.dataset.entryId = entry.id;
    }
    await this._touchTask(db);
  },

  // カスタム日付ピッカーを開く
  _onOpenDatePicker(btn, db) {
    const fieldId = Number(btn.dataset.fieldId);
    const entryId = btn.dataset.entryId ? Number(btn.dataset.entryId) : null;
    const currentDate = btn.dataset.dateValue || '';

    DatePicker.open(
      currentDate,
      async (dateStr) => {
        // 日付選択時
        if (entryId) {
          const entry = State.entries.find(e => e.id === entryId);
          if (entry) {
            entry.value = dateStr;
            await db.updateEntry(entry).catch(console.error);
            const cached = State.allEntries.find(e => e.id === entryId);
            if (cached) cached.value = dateStr;
          }
        } else {
          const entry = await db.addEntry(State.selectedTaskId, fieldId, '', dateStr).catch(console.error);
          if (entry) {
            State.entries.push(entry);
            State.allEntries.push(entry);
          }
        }
        await this._touchTask(db).catch(console.error);
        await Renderer.renderDetail().catch(console.error);
      },
      async () => {
        // クリア時
        if (entryId) {
          await db.deleteEntry(entryId).catch(console.error);
          State.entries = State.entries.filter(e => e.id !== entryId);
          State.allEntries = State.allEntries.filter(e => e.id !== entryId);
          await this._touchTask(db).catch(console.error);
          await Renderer.renderDetail().catch(console.error);
        }
      },
    );
  },

  // ラベルのバッジトグル（自動保存）
  async _onToggleLabel(btn, db) {
    const fieldId = Number(btn.dataset.fieldId);
    const optionValue = btn.dataset.option;
    const form = btn.closest('.kn-label-form');
    if (!form) return;

    const entryId = form.dataset.entryId ? Number(form.dataset.entryId) : null;
    const entry = entryId ? State.entries.find(e => e.id === entryId) : null;

    let selectedLabels = [];
    if (entry) {
      try { selectedLabels = JSON.parse(entry.value); } catch (e) { selectedLabels = []; }
    }

    const idx = selectedLabels.indexOf(optionValue);
    if (idx === -1) {
      selectedLabels.push(optionValue);
    } else {
      selectedLabels.splice(idx, 1);
    }

    if (entry) {
      if (selectedLabels.length === 0) {
        await db.deleteEntry(entryId);
        State.entries = State.entries.filter(e => e.id !== entryId);
        State.allEntries = State.allEntries.filter(e => e.id !== entryId);
        form.dataset.entryId = '';
      } else {
        entry.value = JSON.stringify(selectedLabels);
        await db.updateEntry(entry);
        const cached = State.allEntries.find(e => e.id === entryId);
        if (cached) cached.value = entry.value;
      }
    } else if (selectedLabels.length > 0) {
      const newEntry = await db.addEntry(State.selectedTaskId, fieldId, '', JSON.stringify(selectedLabels));
      State.entries.push(newEntry);
      State.allEntries.push(newEntry);
      form.dataset.entryId = newEntry.id;
    }

    // ボタンのスタイルをインプレース更新（再レンダリング不要）
    const isActive = selectedLabels.includes(optionValue);
    btn.classList.toggle('is-active', isActive);
    const field = State.fields.find(f => f.id === fieldId);
    if (field?.type === 'label') {
      const opts = field.options || [];
      const opt = opts.find(o => o.name === optionValue);
      if (opt) {
        btn.style.cssText = isActive
          ? `background:${opt.color};border-color:${opt.color};color:#fff;`
          : `border-color:${opt.color}66;color:${opt.color};`;
      }
    }
    await this._touchTask(db);
  },

  /** ラベルタイプフィールドのラベル管理ダイアログを開く */
  async _onOpenLabelManager(btn, db) {
    const fieldId = Number(btn.dataset.fieldId);
    const field = State.fields.find(f => f.id === fieldId);
    if (!field) return;

    // 選択肢を {id, name, color} 形式に正規化
    const labels = field.options || [].map(o => ({ id: o.name, name: o.name, color: o.color }));

    LabelManager.open({
      title: `${field.name} — ラベル設定`,
      labels,
      onAdd: async (name, color) => {
        const opts = field.options || [];
        if (opts.some(o => o.name === name)) { showToast('同名のラベルがすでに存在します'); throw new Error('duplicate'); }
        opts.push({ name, color });
        field.options = opts;
        await db.updateField(field);
        return { id: name, name, color };
      },
      onUpdate: async (id, newName, newColor) => {
        const opts = field.options || [];
        const opt = opts.find(o => o.name === id);
        if (!opt) return;
        const oldName = opt.name;
        opt.name = newName;
        opt.color = newColor;
        field.options = opts;
        await db.updateField(field);
        // エントリ内の旧ラベル名を新名に更新
        if (oldName !== newName) {
          const affected = [...State.allEntries, ...State.entries].filter(
            e => e.field_id === fieldId
          );
          const seen = new Set();
          for (const entry of affected) {
            if (seen.has(entry.id)) continue;
            seen.add(entry.id);
            try {
              let names = JSON.parse(entry.value);
              const idx = names.indexOf(oldName);
              if (idx !== -1) {
                names[idx] = newName;
                entry.value = JSON.stringify(names);
                await db.updateEntry(entry);
              }
            } catch {}
          }
        }
      },
      onDelete: async (id) => {
        // id = option name
        const opts = field.options || [].filter(o => o.name !== id);
        field.options = opts;
        await db.updateField(field);
        // エントリから削除されたオプションを除去
        const affected = [...State.allEntries, ...State.entries].filter(
          e => e.field_id === fieldId
        );
        const seen = new Set();
        for (const entry of affected) {
          if (seen.has(entry.id)) continue;
          seen.add(entry.id);
          try {
            let names = JSON.parse(entry.value);
            const filtered = names.filter(n => n !== id);
            if (filtered.length !== names.length) {
              entry.value = JSON.stringify(filtered);
              await db.updateEntry(entry);
            }
          } catch {}
        }
        // フィルター状態から除去
        if (State.listFilter[fieldId] instanceof Set) {
          State.listFilter[fieldId].delete(id);
          _saveFilter();
        }
      },
      onChange: async () => {
        State.fields = await db.getAllFields();
        State.allEntries = await db.getAllEntries();
        if (State.selectedTaskId) {
          State.entries = await db.getEntriesByTask(State.selectedTaskId);
          await Renderer.renderDetail();
        }
        Renderer.renderFilterUI();
        Renderer.renderTaskList();
        Renderer.renderFieldModal();
      },
    });
  },

  async _onFieldModalAction(btn, db) {
    switch (btn.dataset.action) {
      case 'close-field-modal':    document.getElementById('field-modal').hidden = true; break;
      case 'add-field':            await this._onAddField(db); break;
      case 'edit-field-name':      await this._onEditFieldName(btn, db); break;
      case 'delete-field':         await this._onDeleteField(btn, db); break;
      case 'move-field-up':        await this._onMoveField(btn, 'up', db); break;
      case 'move-field-down':      await this._onMoveField(btn, 'down', db); break;
      case 'toggle-field-options': this._onToggleFieldOptions(btn); break;
      case 'add-field-option':     await this._onAddFieldOption(btn, db); break;
      case 'remove-field-option':  await this._onRemoveFieldOption(btn, db); break;
      case 'open-label-manager':   await this._onOpenLabelManager(btn, db); break;
    }
  },

  async _onAddField(db) {
    const nameInput = document.getElementById('new-field-name');
    const name = nameInput.value.trim();
    const type = document.getElementById('new-field-type').value;
    if (!name) { showToast('フィールド名を入力してください'); return; }

    let options = [];
    if (type === 'select') {
      const optionsInput = document.getElementById('new-field-options');
      if (optionsInput) {
        options = optionsInput.value.split(',').map(s => s.trim()).filter(s => s.length > 0);
      }
    }
    // label タイプは空で作成→LabelManager で追加

    const field = await db.addField(name, type, options);
    State.fields.push(field);
    nameInput.value = '';
    document.getElementById('new-field-options').value = '';
    document.getElementById('new-field-options-row').hidden = true;
    document.getElementById('new-field-type').value = 'link';
    nameInput.focus();
    Renderer.renderFieldModal();
    if (State.selectedTaskId) await Renderer.renderDetail();
    showToast(`「${name}」を追加しました`);
  },

  async _onDeleteField(btn, db) {
    const fieldId = Number(btn.dataset.fieldId);
    const field = State.fields.find(f => f.id === fieldId);
    if (!field) return;
    if (!confirm(`「${field.name}」フィールドを削除しますか？\nこのフィールドに入力されたすべてのエントリも削除されます。`)) return;
    await db.deleteField(fieldId);
    State.fields = State.fields.filter(f => f.id !== fieldId);
    if (State.selectedTaskId) {
      State.entries = State.entries.filter(e => e.field_id !== fieldId);
    }
    State.allEntries = State.allEntries.filter(e => e.field_id !== fieldId);
    // フィールド削除後はフィルターもクリア
    delete State.listFilter[fieldId];
    _saveFilter();
    Renderer.renderFieldModal();
    Renderer.renderFilterUI();
    Renderer.renderTaskList();
    if (State.selectedTaskId) await Renderer.renderDetail();
    showToast(`「${field.name}」を削除しました`);
  },

  async _onMoveField(btn, dir, db) {
    const fieldId = Number(btn.dataset.fieldId);
    const idx = State.fields.findIndex(f => f.id === fieldId);
    if (idx === -1) return;
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= State.fields.length) return;

    const a = State.fields[idx];
    const b = State.fields[swapIdx];
    [a.position, b.position] = [b.position, a.position];
    await db.updateField(a);
    await db.updateField(b);
    State.fields.sort((x, y) => x.position - y.position);

    Renderer.renderFieldModal();
    if (State.selectedTaskId) await Renderer.renderDetail();
  },

  // フィールド幅の変更（ダッシュボードと同仕様: auto/wide/full）
  async _onChangeFieldWidth(fieldId, width, db) {
    const field = State.fields.find(f => f.id === fieldId);
    if (!field) return;
    field.width = width;
    await db.updateField(field);
    if (State.selectedTaskId) await Renderer.renderDetail();
  },

  // フィールドの「行頭開始」設定変更
  async _onChangeFieldNewRow(fieldId, newRow, db) {
    const field = State.fields.find(f => f.id === fieldId);
    if (!field) return;
    field.newRow = newRow;
    await db.updateField(field);
    if (State.selectedTaskId) await Renderer.renderDetail();
  },

  // フィールドの「一覧表示」設定変更
  async _onChangeFieldListVisible(fieldId, visible, db) {
    const field = State.fields.find(f => f.id === fieldId);
    if (!field) return;
    field.listVisible = visible;
    await db.updateField(field);
    // 非表示にした場合はフィルターもクリア
    if (!visible) { delete State.listFilter[fieldId]; _saveFilter(); }
    Renderer.renderFilterUI();
    Renderer.renderTaskList();
  },

  _onToggleFieldOptions(btn) {
    const fieldId = btn.dataset.fieldId;
    const panel = document.getElementById(`field-options-${fieldId}`);
    if (!panel) return;
    panel.hidden = !panel.hidden;
  },

  async _onEditFieldName(btn, db) {
    const fieldId = Number(btn.dataset.fieldId);
    const field = State.fields.find(f => f.id === fieldId);
    if (!field) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = field.name;
    input.className = 'kn-input kn-input--sm';
    input.style.cssText = 'flex: 1; min-width: 60px;';
    btn.replaceWith(input);
    input.focus();
    input.select();

    let _done = false;
    const save = async (commit) => {
      if (_done) return;
      _done = true;
      const newName = input.value.trim();
      if (commit && newName && newName !== field.name) {
        field.name = newName;
        await db.updateField(field);
        Renderer.renderFilterUI();
        if (State.selectedTaskId) await Renderer.renderDetail();
        showToast(`フィールド名を「${newName}」に変更しました`);
      }
      Renderer.renderFieldModal();
    };

    input.addEventListener('blur', () => save(true).catch(console.error));
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); save(true).catch(console.error); }
      if (e.key === 'Escape') { save(false).catch(console.error); }
    });
  },

  async _onAddFieldOption(btn, db) {
    const fieldId = Number(btn.dataset.fieldId);
    const field = State.fields.find(f => f.id === fieldId);
    if (!field) return;

    const panel = document.getElementById(`field-options-${fieldId}`);
    const input = panel ? panel.querySelector('[data-option-input]') : null;
    if (!input) return;

    const value = input.value.trim();
    if (!value) { showToast('選択肢を入力してください'); return; }

    if (!field.options) field.options = [];
    if (field.options.includes(value)) { showToast('すでに存在する選択肢です'); return; }

    field.options.push(value);
    await db.updateField(field);
    input.value = '';

    Renderer.renderFieldModal();
    const newPanel = document.getElementById(`field-options-${fieldId}`);
    if (newPanel) newPanel.hidden = false;

    Renderer.renderFilterUI(); // select/label の選択肢が増えた場合フィルターも更新
    if (State.selectedTaskId) await Renderer.renderDetail();
    showToast(`「${value}」を追加しました`);
  },

  async _onRemoveFieldOption(btn, db) {
    const fieldId = Number(btn.dataset.fieldId);
    const optionValue = btn.dataset.option;
    const field = State.fields.find(f => f.id === fieldId);
    if (!field || !field.options) return;

    field.options = field.options.filter(o => o !== optionValue);
    await db.updateField(field);

    Renderer.renderFieldModal();
    const newPanel = document.getElementById(`field-options-${fieldId}`);
    if (newPanel) newPanel.hidden = false;

    Renderer.renderFilterUI();
    if (State.selectedTaskId) await Renderer.renderDetail();
    showToast(`「${optionValue}」を削除しました`);
  },

  // タスクの updated_at を更新し、詳細パネルのメタ情報をインプレース更新
  async _touchTask(db) {
    if (!State.selectedTaskId) return;
    const task = State.tasks.find(t => t.id === State.selectedTaskId);
    if (!task) return;
    await db.updateTask(task); // task.updated_at = Date.now() がインプレース更新される
    this._refreshDetailMeta(task);
    Renderer.renderTaskList();
  },

  _refreshDetailMeta(task) {
    const meta = document.querySelector('.kn-detail__meta');
    if (!meta) return;
    let text = `作成日: ${new Date(task.created_at).toLocaleString('ja-JP')}`;
    if (task.updated_at !== task.created_at) {
      text += `\u3000更新日: ${new Date(task.updated_at).toLocaleString('ja-JP')}`;
    }
    meta.textContent = text;
  },

  async _onExport(db) {
    const data = await db.exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `knowledge_export_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('エクスポートしました');
  },

  async _onImport(e, db) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data.type !== 'knowledge_export') throw new Error('不正なファイル形式です');
      if (!confirm('現在のデータをすべて上書きします。よろしいですか？')) return;
      await db.importData(data);
      [State.tasks, State.fields] = await Promise.all([db.getAllTasks(), db.getAllFields()]);
      State.allEntries = await db.getAllEntries();
      State.selectedTaskId = null;
      State.entries = [];
      State.listFilter = {};
      _saveFilter();
      Renderer.renderTaskList();
      Renderer.renderFilterUI();
      await Renderer.renderDetail();
      showToast('インポートしました');
    } catch (err) {
      alert('インポートに失敗しました: ' + err.message);
    }
  },
};

// ── App ──────────────────────────────────────────────────────────
const App = {
  async init() {
    await KnowledgeDB.open();
    await KnowledgeDB.initDefaultFields();
    [State.tasks, State.fields, State.allEntries] = await Promise.all([
      KnowledgeDB.getAllTasks(),
      KnowledgeDB.getAllFields(),
      KnowledgeDB.getAllEntries(),
    ]);

    // フィルター状態を localStorage から復元
    _loadFilter();

    // ソート状態を localStorage から復元
    const savedSort = localStorage.getItem('kn_sort');
    if (savedSort) {
      const [field, dir] = savedSort.split('-');
      State.sort = { field, dir };
      const sortEl = document.getElementById('kn-sort');
      if (sortEl) sortEl.value = savedSort;
    }

    Renderer.renderTaskList();
    Renderer.renderFilterUI();
    await Renderer.renderDetail();
    await EventHandlers.init(KnowledgeDB);

    // CustomSelect: ソートセレクトをカスタム UI に置き換え
    CustomSelect.replaceAll(document.getElementById('kn-sidebar-controls'));
  },
};

document.addEventListener('DOMContentLoaded', () => App.init().catch(console.error));
