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
      // TODO/関連ノートフィールドの表示切替（data-field-visible）
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

    // ノートピッカーの検索入力
    document.getElementById('note-picker-input').addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      const candidates = (State._notePickerCandidates || []).filter(
        t => t.title.toLowerCase().includes(q),
      );
      _renderNotePickerList(candidates);
    });

    // ノートピッカーのアイテムクリック
    document.getElementById('note-picker-list').addEventListener('click', e => {
      const item = e.target.closest('[data-action="select-note-link"]');
      if (item) this._onSelectNoteLink(item).catch(console.error);
    });

    // ノートピッカーの外クリックで閉じる
    document.addEventListener('click', e => {
      const picker = document.getElementById('note-picker');
      if (picker && !picker.hidden && !picker.contains(e.target)) {
        const addBtn = e.target.closest('[data-action="open-note-picker"]');
        if (!addBtn) _closeNotePicker();
      }
    });

    // 変更履歴モーダルのクリック（イベント委譲）
    document.getElementById('history-modal').addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      this._onDetailAction(btn, db).catch(console.error);
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
    // アクティビティログに記録
    ActivityLogger.log('note', 'create', 'note', task.id, `ノート「${task.title}」を追加`);
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
      case 'open-note-picker': await this._onOpenNotePicker(btn); break;
      case 'go-to-note':       await this._onGoToNote(btn, db); break;
      case 'remove-note-link': await this._onRemoveNoteLink(btn); break;
      case 'select-note-link': await this._onSelectNoteLink(btn); break;
      case 'open-history':     await this._onOpenHistory(); break;
      case 'close-history-modal': document.getElementById('history-modal').hidden = true; break;
      case 'clear-history':    await this._onClearHistory(); break;
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
        const oldTitle = task.title;
        task.title = newTitle;
        await db.updateTask(task).catch(console.error);
        // タイトル変更を履歴に記録
        await this._recordHistory(task.id, '__title__', oldTitle, newTitle);
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
    // アクティビティログに記録（削除前に情報保持）
    ActivityLogger.log('note', 'delete', 'note', task.id, `ノート「${task.title}」を削除`);
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
    if (!value) { showError('URLを入力してください'); return; }

    const entry = await db.addEntry(State.selectedTaskId, fieldId, label, value);
    State.entries.push(entry);
    State.allEntries.push(entry);
    // 履歴: リンク追加
    await this._recordHistory(State.selectedTaskId, fieldId, '', label ? `${label} (${value})` : value);
    await this._touchTask(db);
    await Renderer.renderDetail();
  },

  async _onDeleteEntry(btn, db) {
    const entryId = Number(btn.dataset.entryId);
    const entry = State.entries.find(e => e.id === entryId);
    if (entry) {
      const oldVal = entry.label ? `${entry.label} (${entry.value})` : (entry.value || '');
      await this._recordHistory(State.selectedTaskId, entry.field_id, oldVal, '');
    }
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
      await Clipboard.copy(url);
      showSuccess('URLをコピーしました');
    } catch {
      showError('コピーに失敗しました');
    }
  },

  // リンク表示名をクリップボードにコピー
  async _onCopyEntryLabel(btn) {
    const label = btn.dataset.label;
    try {
      await Clipboard.copy(label);
      showSuccess('表示名をコピーしました');
    } catch {
      showError('コピーに失敗しました');
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
    if (!value) { showError('URLを入力してください'); return; }
    const entry = State.entries.find(e => e.id === entryId);
    if (!entry) return;
    const oldVal = entry.label ? `${entry.label} (${entry.value})` : (entry.value || '');
    const newVal = label ? `${label} (${value})` : value;
    entry.label = label;
    entry.value = value;
    await db.updateEntry(entry);
    const cached = State.allEntries.find(e => e.id === entryId);
    if (cached) { cached.label = label; cached.value = value; }
    await this._recordHistory(State.selectedTaskId, entry.field_id, oldVal, newVal);
    await this._touchTask(db);
    await Renderer.renderDetail();
  },

  // ドロップダウンフィールドの選択保存
  async _onSaveDropdownField(fieldId, entryId, value, selectEl, db) {
    const oldEntry = entryId ? State.entries.find(e => e.id === entryId) : null;
    const oldValue = oldEntry ? oldEntry.value : '';
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
    await this._recordHistory(State.selectedTaskId, fieldId, oldValue, value);
    await this._touchTask(db);
    Renderer.renderTaskList();
  },

  // テキストフィールドの自動保存
  async _onSaveTextField(fieldId, entryId, value, db, textarea) {
    const oldEntry = entryId ? State.entries.find(e => e.id === entryId) : null;
    const oldValue = oldEntry ? oldEntry.value : '';
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
    await this._recordHistory(State.selectedTaskId, fieldId, oldValue, value);
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
        await this._recordHistory(State.selectedTaskId, fieldId, currentValue, '');
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
    await this._recordHistory(State.selectedTaskId, fieldId, currentValue || '', optionValue);

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
        await this._recordHistory(State.selectedTaskId, fieldId, currentDate, dateStr).catch(console.error);
        await this._touchTask(db).catch(console.error);
        await Renderer.renderDetail().catch(console.error);
      },
      async () => {
        // クリア時
        if (entryId) {
          await this._recordHistory(State.selectedTaskId, fieldId, currentDate, '').catch(console.error);
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
    const oldLabels = [...selectedLabels];

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

    // 履歴記録
    await this._recordHistory(State.selectedTaskId, fieldId, oldLabels.join(', '), selectedLabels.join(', '));

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
          showError('同名の選択肢がすでに存在します'); throw new Error('duplicate');
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
        // ラベル/選択肢の並び順を DB に保存し、全UIを即時更新
        field.options = newLabels.map(l => ({ name: l.name, color: l.color }));
        await db.updateField(field);
        if (State.selectedTaskId) {
          await Renderer.renderDetail();
        }
        Renderer.renderFilterUI();
        Renderer.renderTaskList();
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
    if (!name) { showError('フィールド名を入力してください'); return; }

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
    showSuccess(`「${name}」を追加しました`);
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
    showSuccess(`「${field.name}」を削除しました`);
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

  // ドラッグ＆ドロップによるフィールド並び替え
  async _onReorderFields(evt) {
    const db = await NoteDB.open();
    const items = evt.from.querySelectorAll('.note-field-item');
    const updates = [];
    items.forEach((li, i) => {
      const fieldId = Number(li.dataset.fieldId);
      const field = State.fields.find(f => f.id === fieldId);
      if (field && field.position !== i) {
        field.position = i;
        updates.push(db.updateField(field));
      }
    });
    if (updates.length) {
      await Promise.all(updates);
      State.fields = sortByPosition(State.fields);
      if (State.selectedTaskId) await Renderer.renderDetail();
    }
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
        showSuccess(`フィールド名を「${newName}」に変更しました`);
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
    if (!value) { showError('選択肢を入力してください'); return; }

    if (!field.options) field.options = [];
    if (field.options.includes(value)) { showError('すでに存在する選択肢です'); return; }

    field.options.push(value);
    await db.updateField(field);
    input.value = '';

    Renderer.renderFieldModal();
    const newPanel = document.getElementById(`field-options-${fieldId}`);
    if (newPanel) newPanel.hidden = false;

    Renderer.renderFilterUI(); // select/label の選択肢が増えた場合フィルターも更新
    if (State.selectedTaskId) await Renderer.renderDetail();
    showSuccess(`「${value}」を追加しました`);
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
    showSuccess(`「${optionValue}」を削除しました`);
  },

  /** TODOとの紐づけを解除 */
  async _onRemoveTodoLink(btn) {
    const linkId = Number(btn.dataset.linkId);
    try {
      const kanbanDb = await _openKanbanDB();
      // 削除前にリンク先タスク名を取得（履歴用）
      const linkRecord = await new Promise((resolve) => {
        const req = kanbanDb.transaction('note_links').objectStore('note_links').get(linkId);
        req.onsuccess = e => resolve(e.target.result);
        req.onerror = () => resolve(null);
      });
      let todoTitle = '';
      if (linkRecord) {
        const todoTask = await new Promise((resolve) => {
          const req = kanbanDb.transaction('tasks').objectStore('tasks').get(linkRecord.todo_task_id);
          req.onsuccess = e => resolve(e.target.result);
          req.onerror = () => resolve(null);
        });
        todoTitle = todoTask ? todoTask.title : `ID: ${linkRecord.todo_task_id}`;
      }
      await new Promise((resolve, reject) => {
        const req = kanbanDb.transaction('note_links', 'readwrite')
          .objectStore('note_links')
          .delete(linkId);
        req.onsuccess = resolve;
        req.onerror   = e => reject(e.target.error);
      });
      kanbanDb.close();
      // 履歴に記録
      if (todoTitle) {
        await this._recordHistory(State.selectedTaskId, '__todo_link__', todoTitle, '');
      }
      await Renderer.renderTodoLinks(State.selectedTaskId);
    } catch (e) {
      showError('紐づき解除に失敗しました');
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
      showError('TODOデータを取得できませんでした');
      return;
    }

    State._todoPickerCandidates = todoTasks.filter(t => !excludeIds.has(t.id));

    const picker = document.getElementById('todo-picker');
    const input  = document.getElementById('todo-picker-input');
    input.value  = '';
    _renderTodoPickerList(State._todoPickerCandidates);

    const rect = btn.getBoundingClientRect();
    // ビューポート内に収まるよう位置を補正
    const tPickerW = 260, tPickerH = 280;
    let tTop = rect.bottom + 4;
    let tLeft = rect.left;
    if (tTop + tPickerH > window.innerHeight) tTop = Math.max(4, rect.top - tPickerH - 4);
    if (tLeft + tPickerW > window.innerWidth) tLeft = Math.max(4, window.innerWidth - tPickerW - 4);
    picker.style.top  = tTop + 'px';
    picker.style.left = tLeft + 'px';
    picker.removeAttribute('hidden');
    input.focus();
  },

  /** TODOタスクを選択して紐づけ */
  async _onSelectTodoTask(btn) {
    const todoTaskId = parseInt(btn.dataset.taskId, 10);
    const noteTaskId = State.selectedTaskId;
    if (!todoTaskId || !noteTaskId) return;

    let todoTitle = '';
    try {
      const kanbanDb = await _openKanbanDB();
      // リンク先タスク名を取得（履歴用）
      const todoTask = await new Promise((resolve) => {
        const req = kanbanDb.transaction('tasks').objectStore('tasks').get(todoTaskId);
        req.onsuccess = e => resolve(e.target.result);
        req.onerror = () => resolve(null);
      });
      todoTitle = todoTask ? todoTask.title : `ID: ${todoTaskId}`;
      await new Promise((resolve, reject) => {
        const record = { todo_task_id: todoTaskId, note_task_id: noteTaskId };
        const tx  = kanbanDb.transaction('note_links', 'readwrite');
        const req = tx.objectStore('note_links').add(record);
        req.onsuccess = resolve;
        req.onerror   = e => reject(e.target.error);
      });
      kanbanDb.close();
    } catch (e) {
      showError('紐づけに失敗しました');
      return;
    }

    // 履歴に記録
    await this._recordHistory(noteTaskId, '__todo_link__', '', todoTitle);
    _closeTodoPicker();
    await Renderer.renderTodoLinks(noteTaskId);
  },

  /** TODOページでタスクを開く（親フレームにナビゲーション要求を送信） */
  _onOpenTodoTask(btn) {
    const todoTaskId = parseInt(btn.dataset.todoTaskId, 10);
    parent.postMessage({ type: 'navigate:todo', todoTaskId }, '*');
  },

  // ── ノート間リンク ─────────────────────────────────────────────
  /** ノートピッカーを開く */
  async _onOpenNotePicker(btn) {
    if (!State.selectedTaskId) return;

    // 既存リンクを取得して除外リストを作成
    const existingLinks = await NoteDB.getNoteLinks(State.selectedTaskId);
    const excludeIds = new Set();
    excludeIds.add(State.selectedTaskId); // 自分自身を除外
    existingLinks.forEach(l => {
      excludeIds.add(l.from_task_id);
      excludeIds.add(l.to_task_id);
    });

    State._notePickerCandidates = State.tasks.filter(t => !excludeIds.has(t.id));

    const picker = document.getElementById('note-picker');
    const input  = document.getElementById('note-picker-input');
    input.value  = '';
    _renderNotePickerList(State._notePickerCandidates);

    const rect = btn.getBoundingClientRect();
    // ビューポート内に収まるよう位置を補正
    const pickerW = 260, pickerH = 280;
    let top = rect.bottom + 4;
    let left = rect.left;
    if (top + pickerH > window.innerHeight) top = Math.max(4, rect.top - pickerH - 4);
    if (left + pickerW > window.innerWidth) left = Math.max(4, window.innerWidth - pickerW - 4);
    picker.style.top  = top + 'px';
    picker.style.left = left + 'px';
    picker.removeAttribute('hidden');
    input.focus();
  },

  /** ノートリンクを追加 */
  async _onSelectNoteLink(btn) {
    const targetId = parseInt(btn.dataset.taskId, 10);
    const currentId = State.selectedTaskId;
    if (!targetId || !currentId) return;

    const link = await NoteDB.addNoteLink(currentId, targetId);
    if (!link) {
      showError('このノートは既にリンクされています');
      return;
    }
    // 履歴に記録
    const targetTask = State.tasks.find(t => t.id === targetId);
    const targetTitle = targetTask ? targetTask.title : `ID: ${targetId}`;
    await this._recordHistory(currentId, '__note_link__', '', targetTitle);
    _closeNotePicker();
    await Renderer.renderNoteLinks(currentId);
  },

  /** 関連ノートに遷移 */
  async _onGoToNote(btn, db) {
    const noteTaskId = parseInt(btn.dataset.noteTaskId, 10);
    if (!noteTaskId) return;
    const task = State.tasks.find(t => t.id === noteTaskId);
    if (!task) return;
    State.selectedTaskId = noteTaskId;
    State.entries = await db.getEntriesByTask(noteTaskId);
    Renderer.renderTaskList();
    await Renderer.renderDetail();
    document.querySelector(`[data-task-id="${noteTaskId}"]`)?.scrollIntoView({ block: 'nearest' });
  },

  /** ノートリンクを解除 */
  async _onRemoveNoteLink(btn) {
    const linkId = Number(btn.dataset.linkId);
    // 削除前にリンク先タスク名を取得（履歴用）
    const links = await NoteDB.getNoteLinks(State.selectedTaskId);
    const targetLink = links.find(l => l.id === linkId);
    let targetTitle = '';
    if (targetLink) {
      const linkedId = targetLink.from_task_id === State.selectedTaskId ? targetLink.to_task_id : targetLink.from_task_id;
      const linkedTask = State.tasks.find(t => t.id === linkedId);
      targetTitle = linkedTask ? linkedTask.title : `ID: ${linkedId}`;
    }
    await NoteDB.deleteNoteLink(linkId);
    // 履歴に記録
    if (targetTitle) {
      await this._recordHistory(State.selectedTaskId, '__note_link__', targetTitle, '');
    }
    await Renderer.renderNoteLinks(State.selectedTaskId);
  },

  // ── 変更履歴 ──────────────────────────────────────────────────
  /** 変更履歴を記録 */
  async _recordHistory(taskId, fieldId, oldValue, newValue) {
    if (oldValue === newValue) return;
    await NoteDB.addHistory({
      task_id: taskId,
      field_id: fieldId,
      old_value: oldValue || '',
      new_value: newValue || '',
    });
  },

  /** 変更履歴モーダルを開く */
  async _onOpenHistory() {
    if (!State.selectedTaskId) return;
    const history = await NoteDB.getHistory(State.selectedTaskId);
    const body = document.getElementById('history-modal-body');

    if (history.length === 0) {
      body.innerHTML = '<p class="note-empty-msg">変更履歴はありません</p>';
      document.getElementById('history-modal').hidden = false;
      return;
    }

    // フィールド名マップ（特殊フィールド含む）
    const fieldMap = new Map(State.fields.map(f => [f.id, f.name]));
    const specialFieldNames = { '__title__': 'タイトル', '__todo_link__': 'TODOリンク', '__note_link__': '関連ノート' };

    // 日付ごとにグループ化
    const groups = new Map();
    for (const h of history) {
      const dateKey = new Date(h.changed_at).toLocaleDateString('ja-JP');
      if (!groups.has(dateKey)) groups.set(dateKey, []);
      groups.get(dateKey).push(h);
    }

    let html = '<div class="note-history-timeline">';
    for (const [date, items] of groups) {
      html += `<div class="note-history-date">${_esc(date)}</div>`;
      for (const h of items) {
        const time = new Date(h.changed_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
        const fieldName = specialFieldNames[h.field_id]
          ? specialFieldNames[h.field_id]
          : fieldMap.has(h.field_id) ? _esc(fieldMap.get(h.field_id)) : '<span class="note-history-deleted">（削除済み）</span>';
        const _truncEsc = (v) => _esc(v.length > 80 ? v.slice(0, 80) + '…' : v);

        // 追加/削除（old_value か new_value の片方のみ）は ＋/－ 形式で表示
        let changeHtml;
        if (!h.old_value && h.new_value) {
          changeHtml = `<span class="note-history-item__add">＋ ${_truncEsc(h.new_value)}</span>`;
        } else if (h.old_value && !h.new_value) {
          changeHtml = `<span class="note-history-item__remove">－ ${_truncEsc(h.old_value)}</span>`;
        } else {
          const oldVal = h.old_value ? _truncEsc(h.old_value) : '<span class="note-history-empty">（空）</span>';
          const newVal = h.new_value ? _truncEsc(h.new_value) : '<span class="note-history-empty">（空）</span>';
          changeHtml = `
            <span class="note-history-item__old">${oldVal}</span>
            <span class="note-history-item__arrow">→</span>
            <span class="note-history-item__new">${newVal}</span>`;
        }
        html += `
          <div class="note-history-item">
            <span class="note-history-item__time">${time}</span>
            <span class="note-history-item__field">${fieldName}</span>
            <div class="note-history-item__change">${changeHtml}</div>
          </div>`;
      }
    }
    html += '</div>';

    body.innerHTML = html;
    document.getElementById('history-modal').hidden = false;
  },

  /** 履歴をクリア */
  async _onClearHistory() {
    if (!State.selectedTaskId) return;
    if (!confirm('この操作は元に戻せません。変更履歴をすべて削除しますか？')) return;
    await NoteDB.clearHistory(State.selectedTaskId);
    document.getElementById('history-modal').hidden = true;
    showSuccess('変更履歴をクリアしました');
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
    showSuccess('エクスポートしました');
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
      showSuccess('インポートしました');
    } catch (err) {
      alert('インポートに失敗しました: ' + err.message);
    }
  },
};

// ── App ──────────────────────────────────────────────────────────
