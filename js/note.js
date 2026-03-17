'use strict';

// NoteDB モジュールは js/db/note_db.js を参照

// ── kanban_db アクセスヘルパー ──────────────────────────────────
// ※ onupgradeneeded で中断: 未初期化DBを空で作成しない（KanbanDB.open() に初期化を委譲）
async function _openKanbanDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('kanban_db');
    req.onupgradeneeded = (e) => { e.target.transaction.abort(); };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

// ── TODOピッカー ヘルパー ────────────────────────────────────────
function _renderTodoPickerList(tasks) {
  const list = document.getElementById('todo-picker-list');
  if (!list) return;
  list.innerHTML = '';
  if (tasks.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'task-picker__empty';
    empty.textContent = '選択可能なTODOタスクがありません';
    list.appendChild(empty);
    return;
  }
  for (const t of tasks) {
    const item = document.createElement('li');
    item.className = 'task-picker__item';
    item.dataset.action = 'select-todo-task';
    item.dataset.taskId = t.id;
    const titleEl = document.createElement('span');
    titleEl.className = 'task-picker__item-title';
    titleEl.textContent = t.title;
    item.appendChild(titleEl);
    list.appendChild(item);
  }
}

function _closeTodoPicker() {
  const picker = document.getElementById('todo-picker');
  if (picker) picker.setAttribute('hidden', '');
  State._todoPickerCandidates = null;
}

// ── State ──────────────────────────────────────────────────────
const State = {
  tasks: [],           // 全タスク
  fields: [],          // フィールド定義（position昇順）
  selectedTaskId: null,
  entries: [],         // 選択中タスクのエントリ
  allEntries: [],      // 全タスクのエントリ（タスク一覧表示用キャッシュ）
  searchText: '',
  sort: { field: 'created_at', dir: 'desc' }, // ソート状態（localStorage: note_sort）
  listFilter: {},      // field_id → Set（select/label/dropdown 共通）
  titleLines: 1,       // タイトル表示行数: 1 | 2 | 0（制限なし）. localStorage: note_title_lines
  _filterPopoverOpen: false, // フィルターポップオーバーの開閉状態
  _labelFilters: [],        // LabelFilter インスタンス（後方互換用）
  _todoPickerCandidates: null, // TODOピッカー候補キャッシュ
};

// ── フィルター状態の永続化 ──────────────────────────────────────
function _saveFilter() {
  const serialized = {};
  for (const [key, val] of Object.entries(State.listFilter)) {
    if (val instanceof Set && val.size > 0) {
      serialized[key] = { type: 'set', values: [...val] };
    }
  }
  localStorage.setItem('note_filter', JSON.stringify(serialized));
}

function _loadFilter() {
  try {
    const raw = localStorage.getItem('note_filter');
    if (!raw) return;
    const parsed = JSON.parse(raw);
    for (const [key, entry] of Object.entries(parsed)) {
      const fieldId = Number(key);
      const field = State.fields.find(f => f.id === fieldId);
      if (!field || !field.listVisible) continue;
      if ((field.type === 'select' || field.type === 'label' || field.type === 'dropdown') && entry.type === 'set') {
        State.listFilter[key] = new Set(entry.values || []);
      }
    }
  } catch (e) { /* ignore */ }
}

// ── ユーティリティ ──────────────────────────────────────────────
// HTML エスケープ: js/base/utils.js の escapeHtml を使用
const _esc = escapeHtml;

// 日付文字列（YYYY-MM-DD）を日本語形式（YYYY/MM/DD）に変換
function _formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${y}/${m}/${d}`;
}

// トースト通知: js/base/toast.js の Toast.show() を使用
const showToast = (msg, type) => Toast.show(msg, type);

// 削除アイコン SVG


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

      if (field.type === 'select' || field.type === 'dropdown') {
        if (!(filterVal instanceof Set) || filterVal.size === 0) continue;
        result = result.filter(t => {
          const entries = State.allEntries.filter(e => e.task_id === t.id && e.field_id === fieldId);
          return entries.some(e => filterVal.has(e.value));
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
      case 'dropdown': {
        if (!entry || !entry.value) return '';
        const selectOpts = field.options || [];
        const selectOpt = selectOpts.find(o => o.name === entry.value);
        const selectColor = selectOpt ? selectOpt.color : null;
        if (selectColor) {
          return `<span class="note-task-field-badge note-task-field-badge--label" style="background:${selectColor}22;color:${selectColor};">${_esc(entry.value)}</span>`;
        }
        return `<span class="note-task-field-badge note-task-field-badge--select">${_esc(entry.value)}</span>`;
      }

      case 'label': {
        if (!entry) return '';
        let labelNames = [];
        try { labelNames = JSON.parse(entry.value); } catch { return ''; }
        if (labelNames.length === 0) return '';
        const opts = field.options || [];
        return labelNames.map(name => {
          const opt = opts.find(o => o.name === name);
          const color = opt?.color || '#8957e5';
          return `<span class="note-task-field-badge note-task-field-badge--label" style="background:${color}22;color:${color};">${_esc(name)}</span>`;
        }).join('');
      }

      case 'date':
        if (!entry || !entry.value) return '';
        return `<span class="note-task-field-badge note-task-field-badge--date">${_esc(_formatDate(entry.value))}</span>`;

      case 'link':
        if (entries.length === 0) return '';
        return `<span class="note-task-field-badge note-task-field-badge--link">${_esc(field.name)}: ${entries.length}件</span>`;

      case 'text': {
        if (!entry || !entry.value) return '';
        const truncated = entry.value.length > 20 ? entry.value.slice(0, 20) + '…' : entry.value;
        return `<span class="note-task-field-badge note-task-field-badge--text" title="${_esc(entry.value)}">${_esc(truncated)}</span>`;
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
      list.innerHTML = '<li class="note-task-list__empty">タスクがありません</li>';
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
          fieldsHtml = `<div class="note-task-item__fields">${badges.join('')}</div>`;
        }
      }

      const linesClass = State.titleLines > 0 ? ` note-task-item__title--lines-${State.titleLines}` : '';
      const titleTooltip = State.titleLines > 0 ? ` data-tooltip="${_esc(task.title)}"` : '';
      return `<li class="note-task-item${isSelected ? ' is-selected' : ''}" data-task-id="${task.id}">
        <span class="note-task-item__title${linesClass}"${titleTooltip}>${_esc(task.title)}</span>
        ${fieldsHtml}
      </li>`;
    }).join('');

    // タイトルが省略されている場合のカスタムツールチップを初期化
    if (State.titleLines > 0) Tooltip.init(list, '.note-task-item__title');
  },

  // フィルター UI を再描画（ポップオーバー方式）
  renderFilterUI() {
    const container = document.getElementById('note-filters');
    State._labelFilters.forEach(inst => inst.destroy());
    State._labelFilters = [];
    container.innerHTML = '';

    const filterFields = State.fields.filter(f => f.listVisible && (f.type === 'select' || f.type === 'label' || f.type === 'dropdown'));
    if (filterFields.length === 0) return;

    // アクティブなフィルター数
    const totalActive = Object.values(State.listFilter)
      .reduce((sum, s) => sum + (s instanceof Set ? s.size : 0), 0);

    // ── フィルターバー（ボタン + アクティブチップ）──
    const bar = document.createElement('div');
    bar.className = 'note-filter-bar';

    const filterBtn = document.createElement('button');
    filterBtn.className = 'note-filter-btn' + (State._filterPopoverOpen ? ' is-open' : '');
    filterBtn.dataset.action = 'toggle-filter-popover';
    filterBtn.innerHTML = `
      <svg viewBox="0 0 16 16" aria-hidden="true" width="11" height="11" fill="currentColor">
        <path d="M.75 3h14.5a.75.75 0 0 0 0-1.5H.75a.75.75 0 0 0 0 1.5ZM3 7.75A.75.75 0 0 1 3.75 7h8.5a.75.75 0 0 1 0 1.5h-8.5A.75.75 0 0 1 3 7.75Zm3 4a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z"/>
      </svg>
      フィルター
      ${totalActive > 0 ? `<span class="note-filter-btn__badge">${totalActive}</span>` : ''}
    `;
    bar.appendChild(filterBtn);
    container.appendChild(bar);

    // ── アクティブチップ ──
    if (totalActive > 0) {
      const chipsBar = document.createElement('div');
      chipsBar.className = 'note-filter-active-chips';
      for (const f of filterFields) {
        const set = State.listFilter[f.id];
        if (!(set instanceof Set) || set.size === 0) continue;
        for (const val of set) {
          const chip = document.createElement('span');
          chip.className = 'note-filter-active-chip';
          const opt = (f.options || []).find(o => o.name === val);
          if (opt?.color) chip.style.cssText = `background:${opt.color}22;color:${opt.color};border-color:${opt.color}55`;
          const textSpan = document.createElement('span');
          textSpan.className = 'note-filter-active-chip__text';
          textSpan.textContent = val;
          const removeBtn = document.createElement('button');
          removeBtn.className = 'note-filter-active-chip__remove';
          removeBtn.dataset.action = 'clear-active-filter';
          removeBtn.dataset.fieldId = f.id;
          removeBtn.dataset.value = val;
          removeBtn.setAttribute('aria-label', 'フィルター解除');
          removeBtn.textContent = '×';
          chip.appendChild(textSpan);
          chip.appendChild(removeBtn);
          chipsBar.appendChild(chip);
        }
      }
      container.appendChild(chipsBar);
    }

    // ── ポップオーバーパネル ──
    const popover = document.createElement('div');
    popover.className = 'note-filter-popover';
    popover.id = 'note-filter-popover';
    popover.hidden = !State._filterPopoverOpen;

    for (const f of filterFields) {
      const section = document.createElement('div');
      section.className = 'note-filter-popover__section';

      const label = document.createElement('div');
      label.className = 'note-filter-popover__label';
      label.textContent = f.name;
      section.appendChild(label);

      const chips = document.createElement('div');
      chips.className = 'note-filter-chips';
      const activeSet = State.listFilter[f.id] instanceof Set ? State.listFilter[f.id] : new Set();

      for (const opt of (f.options || [])) {
        const isActive = activeSet.has(opt.name);
        const chip = document.createElement('button');
        chip.className = 'note-filter-chip' + (isActive ? ' is-active' : '');
        chip.dataset.action = 'toggle-filter-chip';
        chip.dataset.fieldId = f.id;
        chip.dataset.value = opt.name;
        chip.textContent = opt.name;
        if (opt.color) {
          chip.style.cssText = isActive
            ? `background:${opt.color};color:#fff;border-color:${opt.color}`
            : `background:${opt.color}22;color:${opt.color};border-color:${opt.color}55`;
        }
        chips.appendChild(chip);
      }
      section.appendChild(chips);
      popover.appendChild(section);
    }
    container.appendChild(popover);
  },

  // 詳細パネル描画
  async renderDetail() {
    const task = State.tasks.find(t => t.id === State.selectedTaskId);
    const empty = document.getElementById('note-empty');
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
      <div class="note-detail__header">
        <div class="note-detail__title-row">
          <h2 class="note-detail__title" id="detail-title" data-action="edit-title" title="クリックして編集">${_esc(task.title)}</h2>
          <button class="note-icon-btn note-icon-btn--danger" data-action="delete-task" data-task-id="${task.id}" title="タスクを削除">
            <svg viewBox="0 0 16 16" aria-hidden="true" width="14" height="14" fill="currentColor">
              <path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z"/>
            </svg>
          </button>
        </div>
        <div class="note-detail__meta">
          作成日: ${new Date(task.created_at).toLocaleString('ja-JP')}
          ${task.updated_at !== task.created_at ? `　更新日: ${new Date(task.updated_at).toLocaleString('ja-JP')}` : ''}
        </div>
      </div>

      <div class="note-fields" id="detail-fields">
        ${State.fields.map(f => {
          if (f.type === 'todo') {
            if (f.visible === false) return '';
            return `
              <div class="note-todo-section" id="note-todo-links-section" data-width="${f.width || 'full'}">
                <div class="note-todo-section__header">
                  <span class="note-field-label">TODO</span>
                  <button class="note-add-entry-btn" data-action="open-todo-picker">＋ 追加</button>
                </div>
                <div id="note-todo-links" class="note-todo-links"></div>
              </div>`;
          }
          return this._renderField(f, entryMap[f.id] || []);
        }).join('')}
      </div>
    `;

    // ドロップダウンフィールドを CustomSelect に変換（色スウォッチは custom_select.js が自動処理）
    CustomSelect.replaceAll(content);

    // TODOリンクを非同期で描画（kanban_db が存在しない場合は無視）
    this.renderTodoLinks(task.id).catch(() => {});
  },

  /** 紐づきTODOタスクを描画 */
  async renderTodoLinks(knTaskId) {
    const container = document.getElementById('note-todo-links');
    if (!container) return;
    container.innerHTML = '';

    try {
      const kanbanDb = await _openKanbanDB();

      // note_links ストアから note_task_id で検索
      const links = await new Promise((resolve) => {
        try {
          const req = kanbanDb.transaction('note_links')
            .objectStore('note_links')
            .index('note_task_id')
            .getAll(knTaskId);
          req.onsuccess = e => resolve(e.target.result);
          req.onerror   = () => resolve([]);
        } catch (e) { resolve([]); } // ストアが存在しない場合
      });

      if (links.length === 0) { kanbanDb.close(); return; }

      // TODOタスクのタイトルを取得
      const todoTasks = await new Promise((resolve, reject) => {
        const req = kanbanDb.transaction('tasks').objectStore('tasks').getAll();
        req.onsuccess = e => resolve(e.target.result);
        req.onerror   = e => reject(e.target.error);
      });
      kanbanDb.close();

      const taskMap = new Map(todoTasks.map(t => [t.id, t]));

      container.innerHTML = links.map(link => {
        const task  = taskMap.get(link.todo_task_id);
        const title = task ? _esc(task.title) : `(ID: ${link.todo_task_id})`;
        return `
          <div class="note-todo-chip">
            <button class="note-todo-chip__title" type="button" data-action="open-todo-task" data-todo-task-id="${link.todo_task_id}" title="${task ? 'TODOで開く: ' + _esc(task.title) : ''}">${title}</button>
            <button class="note-icon-btn" data-action="remove-todo-link" data-link-id="${link.id}" title="紐づきを解除">×</button>
          </div>
        `;
      }).join('');
    } catch (e) { /* kanban_db が存在しない場合は無視 */ }
  },

  _renderField(field, entries) {
    const entry = entries[0] || null;
    const options = field.options || [];
    const width = field.width || 'full';

    let bodyHtml = '';

    if (field.type === 'link') {
      // リンクは複数可 → 追加ボタンあり
      bodyHtml = `
        <div class="note-field__entries" id="entries-${field.id}">
          ${entries.map(e => this._renderLinkEntry(e)).join('')}
        </div>
        <button class="note-add-entry-btn" data-action="add-entry" data-field-id="${field.id}" data-field-type="link">＋ 追加</button>
        <div class="note-entry-form" id="entry-form-${field.id}" hidden>
          <div class="note-entry-form__row">
            <input type="text" class="note-input" placeholder="表示名（省略可）" data-entry-label>
            <input type="url" class="note-input" placeholder="URL（例: https://...）" data-entry-value>
          </div>
          <div class="note-entry-form__actions">
            <button class="btn btn--primary btn--sm" data-action="save-entry" data-field-id="${field.id}" data-field-type="link">追加</button>
            <button class="btn btn--secondary btn--sm" data-action="cancel-entry" data-field-id="${field.id}">キャンセル</button>
          </div>
        </div>
      `;
    } else if (field.type === 'text') {
      // テキストはメモ風インライン textarea（単一・自動保存）
      bodyHtml = `<textarea class="note-memo" data-text-field="${field.id}" data-entry-id="${entry ? entry.id : ''}" rows="3" placeholder="テキストを入力...">${_esc(entry ? entry.value : '')}</textarea>`;
    } else if (field.type === 'date') {
      // 日付はカスタムDatePicker（単一）
      const dateStr = entry ? entry.value : '';
      const displayStr = entry ? _formatDate(entry.value) : '';
      if (displayStr) {
        bodyHtml = `
          <div class="note-date-display" data-action="open-datepicker" data-field-id="${field.id}" data-entry-id="${entry.id}" data-date-value="${_esc(dateStr)}">
            <svg viewBox="0 0 16 16" aria-hidden="true" width="13" height="13" fill="currentColor" class="note-date-display__icon">
              <path d="M4.75 0a.75.75 0 0 1 .75.75V2h5V.75a.75.75 0 0 1 1.5 0V2h1.25c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 13.25 16H2.75A1.75 1.75 0 0 1 1 14.25V3.75C1 2.784 1.784 2 2.75 2H4V.75A.75.75 0 0 1 4.75 0ZM2.5 7.5v6.75c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25V7.5Zm10.75-4H2.75a.25.25 0 0 0-.25.25V6h11V3.75a.25.25 0 0 0-.25-.25Z"/>
            </svg>
            <span class="note-date-text">${_esc(displayStr)}</span>
            <button class="note-entry__delete" data-action="delete-entry" data-entry-id="${entry.id}" title="クリア">${Icons.close}</button>
          </div>
        `;
      } else {
        bodyHtml = `
          <div class="note-date-display note-date-display--empty" data-action="open-datepicker" data-field-id="${field.id}" data-entry-id="" data-date-value="">
            <svg viewBox="0 0 16 16" aria-hidden="true" width="13" height="13" fill="currentColor" class="note-date-display__icon">
              <path d="M4.75 0a.75.75 0 0 1 .75.75V2h5V.75a.75.75 0 0 1 1.5 0V2h1.25c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 13.25 16H2.75A1.75 1.75 0 0 1 1 14.25V3.75C1 2.784 1.784 2 2.75 2H4V.75A.75.75 0 0 1 4.75 0ZM2.5 7.5v6.75c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25V7.5Zm10.75-4H2.75a.25.25 0 0 0-.25.25V6h11V3.75a.25.25 0 0 0-.25-.25Z"/>
            </svg>
            <span class="note-date-placeholder">日付を選択...</span>
          </div>
        `;
      }
    } else if (field.type === 'select') {
      // 単一選択ラベル UI（バッジトグル、必ず1つ選択）
      bodyHtml = this._renderSelectForm(field, entries);
    } else if (field.type === 'label') {
      // ラベルはバッジトグル形式（自動保存）
      bodyHtml = this._renderLabelForm(field, entries);
    } else if (field.type === 'dropdown') {
      // ドロップダウン選択（CustomSelect 使用）
      const opts = field.options || [];
      if (opts.length === 0) {
        bodyHtml = '<p class="note-empty-msg note-empty-msg--inline">選択肢が設定されていません。フィールド管理で追加してください。</p>';
      } else {
        const currentValue = entries.length > 0 ? entries[0].value : '';
        const entryId = entries.length > 0 ? entries[0].id : '';
        bodyHtml = `
          <select class="cs-target kn-select--sm note-dropdown-field"
                  data-dropdown-field="${field.id}"
                  data-entry-id="${entryId}">
            <option value="">（未選択）</option>
            ${opts.map(opt => `<option value="${_esc(opt.name)}" data-color="${_esc(opt.color || '')}"${opt.name === currentValue ? ' selected' : ''}>${_esc(opt.name)}</option>`).join('')}
          </select>
        `;
      }
    }

    return `
      <div class="note-field" data-field-id="${field.id}" data-width="${width}"${field.newRow ? ' data-new-row="true"' : ''}>
        <div class="note-field__header">
          <span class="note-field-label">${_esc(field.name)}</span>
        </div>
        ${bodyHtml}
      </div>
    `;
  },

  // ラベルタイプ：バッジトグル形式（チェックボックスなし、保存ボタンなし、カラー付き）
  _renderLabelForm(field, entries) {
    const opts = field.options || [];
    if (opts.length === 0) {
      return '<p class="note-empty-msg note-empty-msg--inline">選択肢が設定されていません。フィールド管理で追加してください。</p>';
    }

    let selectedLabels = [];
    const entryId = entries.length > 0 ? entries[0].id : null;
    if (entryId) {
      try { selectedLabels = JSON.parse(entries[0].value); } catch (e) { selectedLabels = []; }
    }

    return `
      <div class="note-label-form" data-field-id="${field.id}" data-entry-id="${entryId !== null ? entryId : ''}">
        <div class="note-label-form__options">
          ${opts.map(opt => {
            const isActive = selectedLabels.includes(opt.name);
            const style = isActive
              ? `background:${opt.color};border-color:${opt.color};color:#fff;`
              : `border-color:${opt.color}66;color:${opt.color};`;
            return `
              <button class="note-label-tag${isActive ? ' is-active' : ''}"
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

  // selectタイプ：単一選択バッジ形式（必ず1つ選択、色付き）
  _renderSelectForm(field, entries) {
    const rawOpts = field.options || [];
    if (rawOpts.length === 0) {
      return '<p class="note-empty-msg note-empty-msg--inline">選択肢が設定されていません。フィールド管理で追加してください。</p>';
    }

    const currentValue = entries.length > 0 ? entries[0].value : null;
    const entryId = entries.length > 0 ? entries[0].id : null;
    const opts = rawOpts;

    return `
      <div class="note-select-form" data-field-id="${field.id}" data-entry-id="${entryId !== null ? entryId : ''}">
        <div class="note-select-form__options">
          ${opts.map(opt => {
            const isActive = opt.name === currentValue;
            const style = opt.color
              ? isActive
                ? `background:${opt.color};border-color:${opt.color};color:#fff;`
                : `border-color:${opt.color}66;color:${opt.color};`
              : '';
            return `
              <button class="note-select-tag${isActive ? ' is-active' : ''}"
                      data-action="toggle-select" data-field-id="${field.id}" data-option="${_esc(opt.name)}"
                      ${style ? `style="${style}"` : ''}>
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
    // 表示名が設定されている場合のみ表示名コピーボタンを表示
    const labelCopyBtn = entry.label
      ? `<button class="note-entry__action" data-action="copy-entry-label" data-entry-id="${entry.id}" data-label="${_esc(entry.label)}" title="表示名をコピー">${Icons.copyFill}</button>`
      : '';
    return `<div class="note-entry" data-entry-id="${entry.id}">
      <a href="${_esc(entry.value)}" target="_blank" rel="noopener noreferrer" class="note-entry__link">
        <svg viewBox="0 0 16 16" aria-hidden="true" width="11" height="11" fill="currentColor" flex-shrink="0">
          <path d="M3.75 2h3.5a.75.75 0 0 1 0 1.5h-3.5a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-3.5a.75.75 0 0 1 1.5 0v3.5A1.75 1.75 0 0 1 12.25 14h-8.5A1.75 1.75 0 0 1 2 12.25v-8.5C2 2.784 2.784 2 3.75 2Zm6.854-1h4.146a.25.25 0 0 1 .25.25v4.146a.25.25 0 0 1-.427.177L13.03 4.03 9.28 7.78a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042l3.75-3.75-1.543-1.543A.25.25 0 0 1 10.604 1Z"/>
        </svg>
        <span class="note-entry__link-text">${_esc(display)}</span>
      </a>
      <div class="note-entry__actions">
        ${labelCopyBtn}
        <button class="note-entry__action" data-action="copy-entry-url" data-entry-id="${entry.id}" data-url="${_esc(entry.value)}" title="URLをコピー">${Icons.copyFill}</button>
        <button class="note-entry__action" data-action="edit-entry" data-entry-id="${entry.id}" title="編集">${Icons.edit}</button>
        <button class="note-entry__action note-entry__action--delete" data-action="delete-entry" data-entry-id="${entry.id}" title="削除">${Icons.close}</button>
      </div>
    </div>`;
  },

  // フィールド管理モーダル描画
  renderFieldModal() {
    const body = document.getElementById('field-modal-body');
    if (State.fields.length === 0) {
      body.innerHTML = '<p class="note-empty-msg">フィールドがありません。下のフォームから追加してください。</p>';
      return;
    }
    const typeLabels = { link: 'リンク', text: 'テキスト', date: '日付', select: '単一ラベル', label: 'ラベル', dropdown: 'ドロップダウン', todo: 'TODOリンク' };
    body.innerHTML = `<ul class="note-field-list">
      ${State.fields.map((f, i) => {
        const displayWidth = f.width || 'full';
        const widthSelect = `
          <select class="cs-target kn-select--sm" data-field-width="${f.id}" title="表示幅">
            <option value="narrow" ${displayWidth === 'narrow' ? 'selected' : ''}>1/6</option>
            <option value="auto"   ${displayWidth === 'auto'   ? 'selected' : ''}>2/6</option>
            <option value="w3"     ${displayWidth === 'w3'     ? 'selected' : ''}>3/6</option>
            <option value="wide"   ${displayWidth === 'wide'   ? 'selected' : ''}>4/6</option>
            <option value="w5"     ${displayWidth === 'w5'     ? 'selected' : ''}>5/6</option>
            <option value="full"   ${displayWidth === 'full'   ? 'selected' : ''}>6/6（全幅）</option>
          </select>`;
        const moveButtons = `
          <button class="note-icon-btn" data-action="move-field-up"   data-field-id="${f.id}" ${i === 0 ? 'disabled' : ''} title="上へ">↑</button>
          <button class="note-icon-btn" data-action="move-field-down" data-field-id="${f.id}" ${i === State.fields.length - 1 ? 'disabled' : ''} title="下へ">↓</button>`;

        // TODOフィールド専用行（削除・名前編集不可）
        if (f.type === 'todo') {
          return `
            <li class="note-field-item note-field-item--builtin" data-field-id="${f.id}">
              <div class="note-field-item__main">
                <span class="note-field-item__name">TODO</span>
                <span class="note-field-item__type" data-type="todo">TODOリンク</span>
                ${widthSelect}
                <label class="note-field-item__visible" title="詳細パネルにTODOセクションを表示する">
                  <input type="checkbox" data-field-visible="${f.id}"${f.visible !== false ? ' checked' : ''}>
                  表示
                </label>
                <div class="note-field-item__actions">${moveButtons}</div>
              </div>
            </li>`;
        }

        // 通常フィールド
        const hasSelectOptions = false; // LabelManager で管理するため展開パネル不要
        const hasLabelOptions  = f.type === 'label' || f.type === 'select' || f.type === 'dropdown';
        const options = f.options || [];
        return `
          <li class="note-field-item" data-field-id="${f.id}">
            <div class="note-field-item__main">
              <span class="note-field-item__name note-field-item__name--editable" data-action="edit-field-name" data-field-id="${f.id}" title="クリックしてフィールド名を変更">${_esc(f.name)}</span>
              <span class="note-field-item__type" data-type="${f.type}">${typeLabels[f.type] || f.type}</span>
              ${widthSelect}
              <label class="note-field-item__visible" title="新しい行から開始する">
                <input type="checkbox" data-field-new-row="${f.id}"${f.newRow ? ' checked' : ''}>
                行頭開始
              </label>
              <label class="note-field-item__visible" title="タスク一覧に値を表示する">
                <input type="checkbox" data-field-list-visible="${f.id}"${f.listVisible ? ' checked' : ''}>
                一覧表示
              </label>
              <div class="note-field-item__actions">
                ${moveButtons}
                ${hasSelectOptions ? `
                  <button class="note-icon-btn" data-action="toggle-field-options" data-field-id="${f.id}" title="選択肢を管理">
                    <svg viewBox="0 0 16 16" aria-hidden="true" width="12" height="12" fill="currentColor">
                      <path d="M0 2.75C0 1.784.784 1 1.75 1h12.5c.966 0 1.75.784 1.75 1.75v2.5A1.75 1.75 0 0 1 14.25 7H1.75A1.75 1.75 0 0 1 0 5.25Zm1.75-.25a.25.25 0 0 0-.25.25v2.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25v-2.5a.25.25 0 0 0-.25-.25ZM0 10.75C0 9.784.784 9 1.75 9h12.5c.966 0 1.75.784 1.75 1.75v2.5A1.75 1.75 0 0 1 14.25 15H1.75A1.75 1.75 0 0 1 0 13.25Zm1.75-.25a.25.25 0 0 0-.25.25v2.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25v-2.5a.25.25 0 0 0-.25-.25Z"/>
                    </svg>
                  </button>
                ` : ''}
                ${hasLabelOptions ? `
                  <button class="btn-manage-labels note-icon-btn--manage-labels" data-action="open-label-manager" data-field-id="${f.id}" title="${f.type === 'select' ? '選択肢を管理' : 'ラベルを管理'}">
                    <svg viewBox="0 0 16 16" aria-hidden="true" width="12" height="12" fill="currentColor">
                      <path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3.879a1.5 1.5 0 0 1 1.06.44l8.5 8.5a1.5 1.5 0 0 1 0 2.12l-3.878 3.879a1.5 1.5 0 0 1-2.122 0l-8.5-8.5A1.5 1.5 0 0 1 1 6.38Zm1.5 0v3.879l8.5 8.5 3.879-3.878-8.5-8.5ZM6 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"/>
                    </svg>
                    ${(f.type === 'select' || f.type === 'dropdown') ? '選択肢' : 'ラベル'}
                  </button>
                ` : ''}
                <button class="note-icon-btn note-icon-btn--danger" data-action="delete-field" data-field-id="${f.id}" title="削除">
                  <svg viewBox="0 0 16 16" aria-hidden="true" width="12" height="12" fill="currentColor">
                    <path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z"/>
                  </svg>
                </button>
              </div>
            </div>
            ${hasSelectOptions ? `
              <div class="note-field-item__options" id="field-options-${f.id}" hidden>
                <div class="note-option-chips">
                  ${options.length > 0
                    ? options.map(o => `
                        <span class="note-option-chip">
                          ${_esc(o)}
                          <button class="note-option-chip__del" data-action="remove-field-option" data-field-id="${f.id}" data-option="${_esc(o)}" title="削除">×</button>
                        </span>
                      `).join('')
                    : '<span class="note-option-chips__empty">選択肢がありません</span>'
                  }
                </div>
                <div class="note-option-add-row">
                  <input type="text" class="note-input note-input--sm" placeholder="新しい選択肢を入力" data-option-input data-field-id="${f.id}">
                  <button class="btn btn--primary btn--sm" data-action="add-field-option" data-field-id="${f.id}">追加</button>
                </div>
              </div>
            ` : ''}
          </li>
        `;
      }).join('')}
    </ul>`;
    // カスタムセレクトに置き換え
    CustomSelect.replaceAll(body);
  },
};

// ── EventHandlers ───────────────────────────────────────────────
const EventHandlers = {
  _textFieldTimers: {},

  async init(db) {
    // タスクリストのクリック
    document.getElementById('task-list').addEventListener('click', e => {
      const item = e.target.closest('.note-task-item');
      if (item) this._onSelectTask(item, db).catch(console.error);
    });

    // タスク検索
    document.getElementById('task-search').addEventListener('input', e => {
      State.searchText = e.target.value.trim();
      Renderer.renderTaskList();
    });

    // ソート変更
    document.getElementById('note-sort').addEventListener('change', e => {
      const [field, dir] = e.target.value.split('-');
      State.sort = { field, dir };
      localStorage.setItem('note_sort', e.target.value);
      Renderer.renderTaskList();
    });

    // タイトル行数ボタン
    document.getElementById('title-lines-group').addEventListener('click', e => {
      const btn = e.target.closest('.note-title-lines-btn');
      if (!btn) return;
      State.titleLines = Number(btn.dataset.lines);
      localStorage.setItem('note_title_lines', State.titleLines);
      document.querySelectorAll('.note-title-lines-btn').forEach(b => {
        b.classList.toggle('is-active', b === btn);
      });
      Renderer.renderTaskList();
    });

    // サイドバーコントロール：フィルターポップオーバー操作（イベント委譲）
    document.getElementById('note-sidebar-controls').addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      switch (btn.dataset.action) {
        case 'toggle-filter-popover':
          State._filterPopoverOpen = !State._filterPopoverOpen;
          Renderer.renderFilterUI();
          break;
        case 'toggle-filter-chip': {
          const fieldId = Number(btn.dataset.fieldId);
          const value = btn.dataset.value;
          if (!(State.listFilter[fieldId] instanceof Set)) State.listFilter[fieldId] = new Set();
          const set = State.listFilter[fieldId];
          if (set.has(value)) {
            set.delete(value);
            if (set.size === 0) delete State.listFilter[fieldId];
          } else {
            set.add(value);
          }
          _saveFilter();
          State._filterPopoverOpen = true; // ポップオーバーを維持
          Renderer.renderFilterUI();
          Renderer.renderTaskList();
          break;
        }
        case 'clear-active-filter': {
          const fieldId = Number(btn.dataset.fieldId);
          const value = btn.dataset.value;
          const set = State.listFilter[fieldId];
          if (set instanceof Set) {
            set.delete(value);
            if (set.size === 0) delete State.listFilter[fieldId];
            _saveFilter();
            Renderer.renderFilterUI();
            Renderer.renderTaskList();
          }
          break;
        }
      }
    });

    // フィルターポップオーバー外クリックで閉じる
    document.addEventListener('click', e => {
      if (!State._filterPopoverOpen) return;
      // DOM再構築後にe.targetが削除されている場合は外クリックとして扱わない
      if (!document.contains(e.target)) return;
      const controls = document.getElementById('note-sidebar-controls');
      if (controls && !controls.contains(e.target)) {
        State._filterPopoverOpen = false;
        const popover = document.getElementById('note-filter-popover');
        if (popover) popover.hidden = true;
        const filterBtn = document.querySelector('.note-filter-btn');
        if (filterBtn) filterBtn.classList.remove('is-open');
      }
    });

    // ヘッダーアクション（フィールド管理・エクスポート・インポート）
    document.querySelector('.note-header__actions').addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      switch (btn.dataset.action) {
        case 'manage-fields':
          Renderer.renderFieldModal();
          document.getElementById('field-modal').hidden = false;
          document.getElementById('new-field-options-row').hidden = true;
          document.getElementById('new-field-options').value = '';
          document.getElementById('new-field-type').value = 'link';
          if (document.getElementById('new-field-type')._csInst) {
            document.getElementById('new-field-type')._csInst.render();
          }
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

    // ドロップダウンフィールドの変更保存
    document.getElementById('detail-content').addEventListener('change', e => {
      const sel = e.target.closest('[data-dropdown-field]');
      if (!sel) return;
      const fieldId = Number(sel.dataset.dropdownField);
      const entryId = sel.dataset.entryId ? Number(sel.dataset.entryId) : null;
      this._onSaveDropdownField(fieldId, entryId, sel.value, sel, db).catch(console.error);
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

    // フィールド管理モーダルのクリック（イベント委譲）
    document.getElementById('field-modal').addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      this._onFieldModalAction(btn, db).catch(console.error);
    });

    // フィールド幅・一覧表示設定の変更
    document.getElementById('field-modal').addEventListener('change', e => {
      // TODOフィールドの表示切替（data-field-visible）
      const fv = e.target.closest('[data-field-visible]');
      if (fv) {
        const fieldId = Number(fv.dataset.fieldVisible);
        const field = State.fields.find(f => f.id === fieldId);
        if (!field) return;
        field.visible = fv.checked;
        db.updateField(field).catch(console.error);
        if (State.selectedTaskId) Renderer.renderDetail().catch(console.error);
        return;
      }
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

    // フィールド追加フォームのEnterキー（IME変換中は無視）
    document.getElementById('new-field-name').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.isComposing) {
        const addBtn = document.querySelector('#field-modal [data-action="add-field"]');
        if (addBtn) addBtn.click();
      }
    });

    // フィールド管理モーダルでのオプション入力Enterキー（IME変換中は無視）
    document.getElementById('field-modal').addEventListener('keydown', e => {
      if (e.key !== 'Enter' || e.isComposing) return;
      const input = e.target.closest('[data-option-input]');
      if (!input) return;
      const fieldId = input.dataset.fieldId;
      const addBtn = document.querySelector(`[data-action="add-field-option"][data-field-id="${fieldId}"]`);
      if (addBtn) addBtn.click();
    });

    // 全タイプで初期選択肢入力不要（選択肢は LabelManager で管理）
    document.getElementById('new-field-type').addEventListener('change', () => {
      document.getElementById('new-field-options-row').hidden = true;
    });

    // TODOピッカーの検索入力
    document.getElementById('todo-picker-input').addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      const candidates = (State._todoPickerCandidates || []).filter(
        t => t.title.toLowerCase().includes(q),
      );
      _renderTodoPickerList(candidates);
    });

    // TODOピッカーのアイテムクリック
    document.getElementById('todo-picker-list').addEventListener('click', e => {
      const item = e.target.closest('[data-action="select-todo-task"]');
      if (item) this._onSelectTodoTask(item).catch(console.error);
    });

    // TODOピッカーの外クリックで閉じる
    document.addEventListener('click', e => {
      const picker = document.getElementById('todo-picker');
      if (picker && !picker.hidden && !picker.contains(e.target)) {
        const addBtn = e.target.closest('[data-action="open-todo-picker"]');
        if (!addBtn) _closeTodoPicker();
      }
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
      case 'copy-entry-url':   await this._onCopyEntryUrl(btn); break;
      case 'copy-entry-label': await this._onCopyEntryLabel(btn); break;
      case 'edit-entry':       this._onEditEntry(btn); break;
      case 'save-edit-entry':  await this._onSaveEditEntry(btn, db); break;
      case 'cancel-edit-entry': await Renderer.renderDetail(); break;
      case 'open-datepicker':  this._onOpenDatePicker(btn, db); break;
      case 'toggle-select':    await this._onToggleSelect(btn, db); break;
      case 'toggle-label':     await this._onToggleLabel(btn, db); break;
      case 'remove-todo-link': await this._onRemoveTodoLink(btn); break;
      case 'open-todo-task':   this._onOpenTodoTask(btn); break;
      case 'open-todo-picker': await this._onOpenTodoPicker(btn); break;
      case 'select-todo-task': await this._onSelectTodoTask(btn); break;
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
    input.className = 'note-title-input';
    titleEl.replaceWith(input);
    input.focus();
    input.select();

    const restore = (newTitle) => {
      const h2 = document.createElement('h2');
      h2.className = 'note-detail__title';
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
    // kanban_db の note_links（note_task_id 参照）をカスケード削除
    _openKanbanDB().then(kanbanDb => {
      return new Promise((resolve) => {
        try {
          const req = kanbanDb.transaction('note_links')
            .objectStore('note_links')
            .index('note_task_id')
            .getAll(task.id);
          req.onsuccess = e => {
            const links = e.target.result || [];
            if (links.length === 0) { resolve(); return; }
            const tx = kanbanDb.transaction('note_links', 'readwrite');
            links.forEach(l => tx.objectStore('note_links').delete(l.id));
            tx.oncomplete = resolve;
            tx.onerror    = resolve; // エラーでも処理継続
          };
          req.onerror = () => resolve();
        } catch { resolve(); }
      });
    }).catch(() => {});
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
    if (!value) { showToast('URLを入力してください', 'error'); return; }

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

  // リンクURLをクリップボードにコピー
  async _onCopyEntryUrl(btn) {
    const url = btn.dataset.url;
    try {
      await navigator.clipboard.writeText(url);
      showToast('URLをコピーしました', 'success');
    } catch {
      showToast('コピーに失敗しました', 'error');
    }
  },

  // リンク表示名をクリップボードにコピー
  async _onCopyEntryLabel(btn) {
    const label = btn.dataset.label;
    try {
      await navigator.clipboard.writeText(label);
      showToast('表示名をコピーしました', 'success');
    } catch {
      showToast('コピーに失敗しました', 'error');
    }
  },

  // リンクエントリのインライン編集フォームを表示
  _onEditEntry(btn) {
    const entryId = Number(btn.dataset.entryId);
    const entry = State.entries.find(e => e.id === entryId);
    if (!entry) return;
    const entryEl = btn.closest('.note-entry');
    if (!entryEl) return;
    entryEl.innerHTML = `
      <div class="note-entry-inline-edit">
        <div class="note-entry-form__row">
          <input type="text" class="note-input" placeholder="表示名（省略可）" data-edit-label value="${_esc(entry.label || '')}">
          <input type="url" class="note-input" placeholder="URL" data-edit-value value="${_esc(entry.value || '')}">
        </div>
        <div class="note-entry-form__actions">
          <button class="btn btn--primary btn--sm" data-action="save-edit-entry" data-entry-id="${entry.id}">保存</button>
          <button class="btn btn--secondary btn--sm" data-action="cancel-edit-entry">キャンセル</button>
        </div>
      </div>`;
    entryEl.querySelector('[data-edit-label]').focus();
  },

  // リンクエントリの編集を保存
  async _onSaveEditEntry(btn, db) {
    const entryId = Number(btn.dataset.entryId);
    const entryEl = btn.closest('.note-entry');
    if (!entryEl) return;
    const label = (entryEl.querySelector('[data-edit-label]')?.value || '').trim();
    const value = (entryEl.querySelector('[data-edit-value]')?.value || '').trim();
    if (!value) { showToast('URLを入力してください', 'error'); return; }
    const entry = State.entries.find(e => e.id === entryId);
    if (!entry) return;
    entry.label = label;
    entry.value = value;
    await db.updateEntry(entry);
    const cached = State.allEntries.find(e => e.id === entryId);
    if (cached) { cached.label = label; cached.value = value; }
    await this._touchTask(db);
    await Renderer.renderDetail();
  },

  // ドロップダウンフィールドの選択保存
  async _onSaveDropdownField(fieldId, entryId, value, selectEl, db) {
    if (value === '') {
      // 空選択 → エントリ削除
      if (entryId) {
        await db.deleteEntry(entryId);
        State.entries    = State.entries.filter(e => e.id !== entryId);
        State.allEntries = State.allEntries.filter(e => e.id !== entryId);
        selectEl.dataset.entryId = '';
      }
    } else if (entryId) {
      const entry = State.entries.find(e => e.id === entryId);
      if (entry) {
        entry.value = value;
        await db.updateEntry(entry);
        const cached = State.allEntries.find(e => e.id === entryId);
        if (cached) cached.value = value;
      }
    } else {
      const entry = await db.addEntry(State.selectedTaskId, fieldId, '', value);
      State.entries.push(entry);
      State.allEntries.push(entry);
      selectEl.dataset.entryId = entry.id;
    }
    await this._touchTask(db);
    Renderer.renderTaskList();
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

  // 単一ラベルフィールドのバッジトグル（同じ値を再クリックで解除可能）
  async _onToggleSelect(btn, db) {
    const fieldId = Number(btn.dataset.fieldId);
    const optionValue = btn.dataset.option;
    const form = btn.closest('.note-select-form');
    if (!form) return;

    const entryId = form.dataset.entryId ? Number(form.dataset.entryId) : null;
    const entry = entryId ? State.entries.find(e => e.id === entryId) : null;
    const currentValue = entry ? entry.value : null;

    // 選択中と同じ値をクリック → 選択解除（エントリ削除）
    if (optionValue === currentValue) {
      if (entry) {
        await db.deleteEntry(entry.id);
        State.entries    = State.entries.filter(e => e.id !== entry.id);
        State.allEntries = State.allEntries.filter(e => e.id !== entry.id);
        form.dataset.entryId = '';
      }
      // 解除後は全ボタンを非選択スタイルに戻す（色は維持）
      const selectField = State.fields.find(f => f.id === fieldId);
      const rawOpts = selectField ? (selectField.options || []) : [];
      form.querySelectorAll('[data-action="toggle-select"]').forEach(b => {
        b.classList.remove('is-active');
        const optDef = rawOpts.find(o => o.name === b.dataset.option);
        b.style.cssText = (optDef && optDef.color)
          ? `border-color:${optDef.color}66;color:${optDef.color};`
          : '';
      });
      await this._touchTask(db);
      return;
    }

    if (entry) {
      entry.value = optionValue;
      await db.updateEntry(entry);
      const cached = State.allEntries.find(e => e.id === entryId);
      if (cached) cached.value = optionValue;
    } else {
      const newEntry = await db.addEntry(State.selectedTaskId, fieldId, '', optionValue);
      State.entries.push(newEntry);
      State.allEntries.push(newEntry);
      form.dataset.entryId = newEntry.id;
    }

    // ボタンスタイルをインプレース更新（再レンダリング不要）
    const selectField = State.fields.find(f => f.id === fieldId);
    const rawSelectOpts = selectField ? (selectField.options || []) : [];
    const selectOptsNorm = rawSelectOpts.map(o => typeof o === 'string' ? { name: o, color: '' } : o);
    form.querySelectorAll('[data-action="toggle-select"]').forEach(b => {
      const isActive = b.dataset.option === optionValue;
      b.classList.toggle('is-active', isActive);
      const optDef = selectOptsNorm.find(o => o.name === b.dataset.option);
      if (optDef && optDef.color) {
        b.style.cssText = isActive
          ? `background:${optDef.color};border-color:${optDef.color};color:#fff;`
          : `border-color:${optDef.color}66;color:${optDef.color};`;
      } else {
        b.style.cssText = '';
      }
    });
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
    const form = btn.closest('.note-label-form');
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

  /** ラベル・単一選択タイプフィールドの選択肢管理ダイアログを開く */
  async _onOpenLabelManager(btn, db) {
    const fieldId = Number(btn.dataset.fieldId);
    const field = State.fields.find(f => f.id === fieldId);
    if (!field) return;

    const isSelect = field.type === 'select' || field.type === 'dropdown';

    const rawOpts = field.options || [];
    const labels = rawOpts.map(o => ({ id: o.name, name: o.name, color: o.color }));

    LabelManager.open({
      title: `${field.name} — ${isSelect ? '選択肢' : 'ラベル'}設定`,
      labels,
      onAdd: async (name, color) => {
        const opts = field.options || [];
        if (opts.some(o => o.name === name)) {
          showToast('同名の選択肢がすでに存在します', 'error'); throw new Error('duplicate');
        }
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
        // エントリ内の旧値を新名に更新
        if (oldName !== newName) {
          const affected = [...State.allEntries, ...State.entries].filter(e => e.field_id === fieldId);
          const seen = new Set();
          for (const entry of affected) {
            if (seen.has(entry.id)) continue;
            seen.add(entry.id);
            if (isSelect) {
              // select: plain string 値
              if (entry.value === oldName) {
                entry.value = newName;
                await db.updateEntry(entry);
              }
            } else {
              // label: JSON string[] 値
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
        }
      },
      onDelete: async (id) => {
        const opts = field.options || [];
        field.options = opts.filter(o => o.name !== id);
        await db.updateField(field);
        // エントリの後処理
        const affected = [...State.allEntries, ...State.entries].filter(e => e.field_id === fieldId);
        const seen = new Set();
        for (const entry of affected) {
          if (seen.has(entry.id)) continue;
          seen.add(entry.id);
          if (isSelect) {
            // select: 削除された値のエントリを除去
            if (entry.value === id) {
              await db.deleteEntry(entry.id);
              State.entries    = State.entries.filter(e => e.id !== entry.id);
              State.allEntries = State.allEntries.filter(e => e.id !== entry.id);
            }
          } else {
            // label: JSON 配列から削除されたオプションを除去
            try {
              let names = JSON.parse(entry.value);
              const filtered = names.filter(n => n !== id);
              if (filtered.length !== names.length) {
                entry.value = JSON.stringify(filtered);
                await db.updateEntry(entry);
              }
            } catch {}
          }
        }
        // フィルター状態から除去
        if (State.listFilter[fieldId] instanceof Set) {
          State.listFilter[fieldId].delete(id);
          _saveFilter();
        }
      },
      onReorder: async (newLabels) => {
        // ラベル/選択肢の並び順を DB に保存し、詳細パネルを即時更新
        field.options = newLabels.map(l => ({ name: l.name, color: l.color }));
        await db.updateField(field);
        if (State.selectedTaskId) {
          await Renderer.renderDetail();
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
      case 'open-label-manager':   await this._onOpenLabelManager(btn, db); break;
    }
  },

  async _onAddField(db) {
    const nameInput = document.getElementById('new-field-name');
    const name = nameInput.value.trim();
    const type = document.getElementById('new-field-type').value;
    if (!name) { showToast('フィールド名を入力してください', 'error'); return; }

    // 選択肢は LabelManager で管理するため、新規作成時はすべて空で作成
    const options = [];

    const field = await db.addField(name, type, options);
    State.fields.push(field);
    nameInput.value = '';
    document.getElementById('new-field-options').value = '';
    document.getElementById('new-field-options-row').hidden = true;
    document.getElementById('new-field-type').value = 'link';
    nameInput.focus();
    Renderer.renderFieldModal();
    if (State.selectedTaskId) await Renderer.renderDetail();
    showToast(`「${name}」を追加しました`, 'success');
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
    showToast(`「${field.name}」を削除しました`, 'success');
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
    State.fields = sortByPosition(State.fields);

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
    input.className = 'note-input note-input--sm';
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
        showToast(`フィールド名を「${newName}」に変更しました`, 'success');
      }
      Renderer.renderFieldModal();
    };

    input.addEventListener('blur', () => save(true).catch(console.error));
    input.addEventListener('keydown', e => {
      // IME 変換中の Enter は無視（変換確定後の Enter のみ保存）
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); save(true).catch(console.error); }
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
    if (!value) { showToast('選択肢を入力してください', 'error'); return; }

    if (!field.options) field.options = [];
    if (field.options.includes(value)) { showToast('すでに存在する選択肢です', 'error'); return; }

    field.options.push(value);
    await db.updateField(field);
    input.value = '';

    Renderer.renderFieldModal();
    const newPanel = document.getElementById(`field-options-${fieldId}`);
    if (newPanel) newPanel.hidden = false;

    Renderer.renderFilterUI(); // select/label の選択肢が増えた場合フィルターも更新
    if (State.selectedTaskId) await Renderer.renderDetail();
    showToast(`「${value}」を追加しました`, 'success');
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
    showToast(`「${optionValue}」を削除しました`, 'success');
  },

  /** TODOとの紐づけを解除 */
  async _onRemoveTodoLink(btn) {
    const linkId = Number(btn.dataset.linkId);
    try {
      const kanbanDb = await _openKanbanDB();
      await new Promise((resolve, reject) => {
        const req = kanbanDb.transaction('note_links', 'readwrite')
          .objectStore('note_links')
          .delete(linkId);
        req.onsuccess = resolve;
        req.onerror   = e => reject(e.target.error);
      });
      kanbanDb.close();
      await Renderer.renderTodoLinks(State.selectedTaskId);
    } catch (e) {
      showToast('紐づき解除に失敗しました', 'error');
    }
  },

  /** TODOタスクピッカーを開く */
  async _onOpenTodoPicker(btn) {
    if (!State.selectedTaskId) return;

    // 既存リンクを除外
    let existingLinks = [];
    try {
      const kanbanDb = await _openKanbanDB();
      existingLinks = await new Promise((resolve) => {
        try {
          const req = kanbanDb.transaction('note_links')
            .objectStore('note_links')
            .index('note_task_id')
            .getAll(State.selectedTaskId);
          req.onsuccess = e => resolve(e.target.result);
          req.onerror   = () => resolve([]);
        } catch (e) { resolve([]); }
      });
      kanbanDb.close();
    } catch (e) {}

    const excludeIds = new Set(existingLinks.map(l => l.todo_task_id));

    // kanban_db からタスク一覧を取得
    let todoTasks = [];
    try {
      const kanbanDb = await _openKanbanDB();
      todoTasks = await new Promise((resolve, reject) => {
        const req = kanbanDb.transaction('tasks').objectStore('tasks').getAll();
        req.onsuccess = e => resolve(e.target.result);
        req.onerror   = e => reject(e.target.error);
      });
      kanbanDb.close();
    } catch (e) {
      showToast('TODOデータを取得できませんでした', 'error');
      return;
    }

    State._todoPickerCandidates = todoTasks.filter(t => !excludeIds.has(t.id));

    const picker = document.getElementById('todo-picker');
    const input  = document.getElementById('todo-picker-input');
    input.value  = '';
    _renderTodoPickerList(State._todoPickerCandidates);

    const rect = btn.getBoundingClientRect();
    picker.style.top  = (rect.bottom + 4) + 'px';
    picker.style.left = rect.left + 'px';
    picker.removeAttribute('hidden');
    input.focus();
  },

  /** TODOタスクを選択して紐づけ */
  async _onSelectTodoTask(btn) {
    const todoTaskId = parseInt(btn.dataset.taskId, 10);
    const noteTaskId = State.selectedTaskId;
    if (!todoTaskId || !noteTaskId) return;

    try {
      const kanbanDb = await _openKanbanDB();
      await new Promise((resolve, reject) => {
        const record = { todo_task_id: todoTaskId, note_task_id: noteTaskId };
        const tx  = kanbanDb.transaction('note_links', 'readwrite');
        const req = tx.objectStore('note_links').add(record);
        req.onsuccess = resolve;
        req.onerror   = e => reject(e.target.error);
      });
      kanbanDb.close();
    } catch (e) {
      showToast('紐づけに失敗しました', 'error');
      return;
    }

    _closeTodoPicker();
    await Renderer.renderTodoLinks(noteTaskId);
  },

  /** TODOページでタスクを開く（親フレームにナビゲーション要求を送信） */
  _onOpenTodoTask(btn) {
    const todoTaskId = parseInt(btn.dataset.todoTaskId, 10);
    parent.postMessage({ type: 'navigate:todo', todoTaskId }, '*');
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
    const meta = document.querySelector('.note-detail__meta');
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
    a.download = `note_export_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('エクスポートしました', 'success');
  },

  async _onImport(e, db) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data.type !== 'note_export') throw new Error('不正なファイル形式です');
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
      showToast('インポートしました', 'success');
    } catch (err) {
      alert('インポートに失敗しました: ' + err.message);
    }
  },
};

// ── App ──────────────────────────────────────────────────────────
const App = {
  async init() {
    await NoteDB.open();
    await NoteDB.initDefaultFields();
    await NoteDB.ensureTodoField();
    [State.tasks, State.fields, State.allEntries] = await Promise.all([
      NoteDB.getAllTasks(),
      NoteDB.getAllFields(),
      NoteDB.getAllEntries(),
    ]);

    // フィルター状態を localStorage から復元
    _loadFilter();

    // タイトル行数を localStorage から復元
    const savedLines = localStorage.getItem('note_title_lines');
    if (savedLines !== null) State.titleLines = Number(savedLines);
    document.querySelectorAll('.note-title-lines-btn').forEach(btn => {
      btn.classList.toggle('is-active', Number(btn.dataset.lines) === State.titleLines);
    });

    // ソート状態を localStorage から復元
    const savedSort = localStorage.getItem('note_sort');
    if (savedSort) {
      const [field, dir] = savedSort.split('-');
      State.sort = { field, dir };
      const sortEl = document.getElementById('note-sort');
      if (sortEl) sortEl.value = savedSort;
    }

    Renderer.renderTaskList();
    Renderer.renderFilterUI();
    await Renderer.renderDetail();
    await EventHandlers.init(NoteDB);

    // 親フレームからの navigate:note 指示を受信してタスクを選択・表示
    window.addEventListener('message', async (e) => {
      const { type, noteTaskId } = e.data || {};
      if (type !== 'navigate:note' || !noteTaskId) return;
      let task = State.tasks.find(t => t.id === noteTaskId);
      if (!task) {
        // キャッシュが古い可能性があるため DB から再取得
        State.tasks = await NoteDB.getAllTasks();
        task = State.tasks.find(t => t.id === noteTaskId);
      }
      if (!task) return;
      State.selectedTaskId = noteTaskId;
      State.entries = await NoteDB.getEntriesByTask(noteTaskId);
      Renderer.renderTaskList();
      await Renderer.renderDetail();
      document.querySelector(`[data-task-id="${noteTaskId}"]`)?.scrollIntoView({ block: 'nearest' });
    });

    // BroadcastChannel: TODOページからのノートリンク変更通知を受け取る
    try {
      new BroadcastChannel('kanban-note-links').addEventListener('message', async (e) => {
        if (e.data.type === 'note-link-changed' && e.data.noteTaskId === State.selectedTaskId) {
          await Renderer.renderTodoLinks(State.selectedTaskId);
        }
      });
    } catch (e) { /* BroadcastChannel 非対応環境では無視 */ }

    // CustomSelect: ソートセレクトとフィールド追加フォームのタイプセレクトをカスタム UI に置き換え
    CustomSelect.replaceAll(document.getElementById('note-sidebar-controls'));
    CustomSelect.replaceAll(document.querySelector('.note-modal__ft'));
  },
};

document.addEventListener('DOMContentLoaded', () => App.init().catch(console.error));

// テーマ変更を受け取る（親フレームからの postMessage）
window.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'theme-change') {
    document.documentElement.setAttribute('data-theme', e.data.theme);
    localStorage.setItem('mytools_theme', e.data.theme);
  }
});
