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

    // テキスト検索（タイトル + リンク表示名・URL + テキスト内容）
    if (State.searchText) {
      const q = State.searchText.toLowerCase();
      result = result.filter(t => {
        if (t.title.toLowerCase().includes(q)) return true;
        // エントリ検索（link: 表示名・URL、text: 内容）
        return State.allEntries.some(e => {
          if (e.task_id !== t.id) return false;
          const f = State.fields.find(ff => ff.id === e.field_id);
          if (!f) return false;
          if (f.type === 'link') {
            return (e.label && e.label.toLowerCase().includes(q)) ||
                   (e.value && e.value.toLowerCase().includes(q));
          }
          if (f.type === 'text') {
            return e.value && e.value.toLowerCase().includes(q);
          }
          return false;
        });
      });
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
          <div class="note-detail__title-actions">
            <button class="note-icon-btn" data-action="open-history" title="変更履歴">${Icons.history}</button>
            <button class="note-icon-btn note-icon-btn--danger" data-action="delete-task" data-task-id="${task.id}" title="タスクを削除">
              <svg viewBox="0 0 16 16" aria-hidden="true" width="14" height="14" fill="currentColor">
                <path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z"/>
              </svg>
            </button>
          </div>
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
              <div class="note-todo-section" id="note-todo-links-section" data-width="${f.width || 'full'}"${f.newRow ? ' data-new-row="true"' : ''}>
                <div class="note-todo-section__header">
                  <span class="note-field-label">TODO</span>
                  <button class="note-add-entry-btn" data-action="open-todo-picker">＋ 追加</button>
                </div>
                <div id="note-todo-links" class="note-todo-links"></div>
              </div>`;
          }
          if (f.type === 'note_link') {
            if (f.visible === false) return '';
            return `
              <div class="note-todo-section note-note-links-section" data-width="${f.width || 'full'}"${f.newRow ? ' data-new-row="true"' : ''}>
                <div class="note-todo-section__header">
                  <span class="note-field-label">${Icons.noteLink} 関連ノート</span>
                  <button class="note-add-entry-btn" data-action="open-note-picker">＋ 追加</button>
                </div>
                <div id="note-note-links" class="note-todo-links"></div>
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
    // 関連ノートリンクを非同期で描画
    this.renderNoteLinks(task.id).catch(() => {});
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

  /** 関連ノートリンクを描画 */
  async renderNoteLinks(taskId) {
    const container = document.getElementById('note-note-links');
    if (!container) return;
    container.innerHTML = '';

    const links = await NoteDB.getNoteLinks(taskId);
    if (links.length === 0) return;

    // タスクIDマップを構築（State.tasks から）
    const taskMap = new Map(State.tasks.map(t => [t.id, t]));

    container.innerHTML = links.map(link => {
      // 双方向: 自分と相手のIDを判定
      const linkedId = link.from_task_id === taskId ? link.to_task_id : link.from_task_id;
      const linkedTask = taskMap.get(linkedId);
      const title = linkedTask ? _esc(linkedTask.title) : `(ID: ${linkedId})`;
      return `
        <div class="note-todo-chip">
          <button class="note-todo-chip__title" type="button" data-action="go-to-note" data-note-task-id="${linkedId}" title="ノートを開く: ${title}">${Icons.noteLink} ${title}</button>
          <button class="note-icon-btn" data-action="remove-note-link" data-link-id="${link.id}" title="リンクを解除">×</button>
        </div>
      `;
    }).join('');
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
    const typeLabels = { link: 'リンク', text: 'テキスト', date: '日付', select: '単一ラベル', label: 'ラベル', dropdown: 'ドロップダウン', todo: 'TODOリンク', note_link: '関連ノート' };
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
                <label class="note-field-item__visible" title="新しい行から開始する">
                  <input type="checkbox" data-field-new-row="${f.id}"${f.newRow ? ' checked' : ''}>
                  行頭開始
                </label>
                <label class="note-field-item__visible" title="詳細パネルにTODOセクションを表示する">
                  <input type="checkbox" data-field-visible="${f.id}"${f.visible !== false ? ' checked' : ''}>
                  表示
                </label>
                <div class="note-field-item__actions">${moveButtons}</div>
              </div>
            </li>`;
        }

        // 関連ノートフィールド専用行（削除・名前編集不可）
        if (f.type === 'note_link') {
          return `
            <li class="note-field-item note-field-item--builtin" data-field-id="${f.id}">
              <div class="note-field-item__main">
                <span class="note-field-item__name">関連ノート</span>
                <span class="note-field-item__type" data-type="note_link">関連ノート</span>
                ${widthSelect}
                <label class="note-field-item__visible" title="新しい行から開始する">
                  <input type="checkbox" data-field-new-row="${f.id}"${f.newRow ? ' checked' : ''}>
                  行頭開始
                </label>
                <label class="note-field-item__visible" title="詳細パネルに関連ノートセクションを表示する">
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
