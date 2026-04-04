
// ==================================================
// EventHandlers: data-action 委譲
// ==================================================
const EventHandlers = {
  init(db) {
    // ボード全体への委譲
    document.getElementById('board').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      this._dispatch(btn.dataset.action, btn, db);
    });

    // モーダルへの委譲
    document.getElementById('task-modal').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      this._dispatch(btn.dataset.action, btn, db);
    });

    // カラムタイトルのダブルクリックでリネーム
    document.getElementById('board').addEventListener('dblclick', (e) => {
      const titleEl = e.target.closest('.column__title[data-action="rename-column"]');
      if (!titleEl) return;
      this._onRenameColumn(titleEl, db);
    });

    // カードタイトルクリックで詳細を開く
    document.getElementById('board').addEventListener('click', (e) => {
      const title = e.target.closest('.card__title');
      if (!title) return;
      const card = title.closest('.card[data-id]');
      if (!card) return;
      const taskId = parseInt(card.dataset.id, 10);
      if (!taskId) return;
      Renderer.renderModal(taskId, db);
    });


    // ヘッダー（バックアップ操作・テンプレート・アーカイブ）
    document.querySelector('.app-header').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      if (btn.dataset.action === 'export-backup') Backup.export(db);
      else if (btn.dataset.action === 'import-backup') Backup.import(db);
      else this._dispatch(btn.dataset.action, btn, db);
    });

    // モーダルフィールドの変更イベント
    document.getElementById('modal-column').addEventListener('change', (e) => {
      this._onColumnChange(e, db);
    });
    document.getElementById('modal-title').addEventListener('blur', (e) => {
      this._onTitleBlur(e, db);
    });
    // Enter でタイトルを確定（blur 経由で保存）。IME 変換中は無視
    document.getElementById('modal-title').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); e.target.blur(); }
    });
    document.getElementById('modal-description').addEventListener('blur', (e) => {
      this._onDescriptionBlur(e, db);
    });

    // ソート選択変更
    document.getElementById('sort-select').addEventListener('change', (e) => {
      const [field = '', dir = 'asc'] = e.target.value.split(':');
      State.sort = { field, dir };
      localStorage.setItem('kanban_sort', JSON.stringify(State.sort));
      for (const col of State.columns) {
        Renderer.renderColumn(col.key, State.tasks[col.key] || [], db);
      }
      for (const s of State.sortables) s.destroy();
      DragDrop.init(db);
    });

    // キーボード操作
    document.addEventListener('keydown', (e) => this._onKeydown(e, db));

    // フィルターテキスト入力
    document.getElementById('filter-text').addEventListener('input', (e) => {
      State.filter.text = e.target.value;
      saveFilterState();
      applyFilter();
    });

    // ラベルフィルター（LabelFilter コンポーネント）
    State._labelFilterInst = LabelFilter.create(
      document.getElementById('filter-label-dropdown'),
      {
        items:    State.labels.map(l => ({ id: l.id, name: l.name, color: l.color })),
        selected: State.filter.labelIds,
        label:    'ラベル',
        onChange: selected => {
          State.filter.labelIds = selected;
          saveFilterState();
          applyFilter();
        },
      }
    );
    // タスクピッカー・依存ピッカー・テンプレートピッカー外クリックで閉じる
    document.addEventListener('click', (e) => {
      const picker = document.getElementById('task-picker');
      if (picker && !picker.hidden && !picker.contains(e.target)) {
        this._closeTaskPicker();
      }
      const notePicker = document.getElementById('note-picker');
      if (notePicker && !notePicker.hidden && !notePicker.contains(e.target)) {
        this._closeNotePicker();
      }
      const depPicker = document.getElementById('dep-picker');
      if (depPicker && !depPicker.hidden && !depPicker.contains(e.target) &&
          !e.target.closest('[data-action="pick-dep-blocker"]') &&
          !e.target.closest('[data-action="pick-dep-blocked"]')) {
        this._closeDepPicker();
      }
      const tplPicker = document.getElementById('template-picker');
      if (tplPicker && !tplPicker.hidden && !tplPicker.contains(e.target) &&
          !e.target.closest('[data-action="add-task"]')) {
        tplPicker.setAttribute('hidden', '');
        State._templatePickerColumn = null;
      }
    });

    // 繰り返し設定トグル
    document.getElementById('modal-recurring-toggle')?.addEventListener('change', (e) => {
      this._onRecurringToggle(e, db);
    });
    document.getElementById('modal-recurring-interval')?.addEventListener('change', (e) => {
      this._onRecurringIntervalChange(e, db);
    });

    // チェックリスト新規追加入力（Enter で確定）
    document.getElementById('checklist-new-input')?.addEventListener('keydown', (e) => {
      if (e.isComposing) return;
      if (e.key === 'Enter') { e.preventDefault(); this._onAddChecklistItem(db); }
    });

    // 依存ピッカー検索入力
    document.getElementById('dep-picker-input')?.addEventListener('input', (e) => {
      this._filterDepPickerList(e.target.value);
    });

    // 依存ピッカーリストクリック委譲
    document.getElementById('dep-picker-list')?.addEventListener('click', (e) => {
      const item = e.target.closest('[data-action="select-dep-task"]');
      if (!item) return;
      this._onSelectDepTask(item, db).catch(console.error);
    });

    // テンプレートピッカーのクリック委譲
    document.getElementById('template-picker')?.addEventListener('click', (e) => {
      const item = e.target.closest('[data-action]');
      if (!item) return;
      this._dispatch(item.dataset.action, item, db);
    });

    // インライン追加フォームのキーイベント
    document.getElementById('board').addEventListener('keydown', (e) => {
      const input = e.target.closest('.column__add-input');
      if (!input) return;
      if (e.isComposing) return;
      const form = input.closest('.column__add-form');
      const column = form?.dataset.column;
      if (!column) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        const confirmBtn = form.querySelector('[data-action="confirm-add-task"]');
        if (confirmBtn) this._dispatch('confirm-add-task', confirmBtn, db);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this._hideAddForm(column);
      }
    });

    // アーカイブ検索入力
    document.getElementById('archive-search-input')?.addEventListener('input', (e) => {
      this._onArchiveSearch(e.target.value, db);
    });

    // テンプレートモーダルのイベント委譲
    document.getElementById('template-modal')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      this._dispatch(btn.dataset.action, btn, db);
    });

    // アーカイブモーダルのイベント委譲
    document.getElementById('archive-modal')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      this._dispatch(btn.dataset.action, btn, db);
    });

    // タスクピッカー検索入力
    document.getElementById('task-picker-input').addEventListener('input', (e) => {
      this._filterTaskPickerList(e.target.value);
    });

    // タスクピッカーのリストクリック委譲
    document.getElementById('task-picker-list').addEventListener('click', (e) => {
      const item = e.target.closest('[data-action="select-relation-task"]');
      if (!item) return;
      this._onSelectRelationTask(item, db);
    });

    // ノートピッカー検索入力
    document.getElementById('note-picker-input').addEventListener('input', (e) => {
      this._filterNotePickerList(e.target.value);
    });

    // ノートピッカーのリストクリック委譲
    document.getElementById('note-picker-list').addEventListener('click', (e) => {
      const item = e.target.closest('[data-action="select-note-task"]');
      if (!item) return;
      this._onSelectNoteTask(item, db).catch(console.error);
    });

    // 期限フィルター
    document.getElementById('filter-due').addEventListener('change', (e) => {
      State.filter.due = e.target.value;
      saveFilterState();
      applyFilter();
    });

    // フィルタークリアボタン
    document.getElementById('filter-clear').addEventListener('click', () => {
      State.filter.text = '';
      State.filter.labelIds = new Set();
      State.filter.due = '';
      document.getElementById('filter-text').value = '';
      document.getElementById('filter-due').value = '';
      saveFilterState();
      renderFilterLabels();
      applyFilter();
    });
  },

  _dispatch(action, btn, db) {
    switch (action) {
      case 'add-task':          this._onAddTask(btn, db);        break;
      case 'open-task':         this._onOpenTask(btn, db);       break;
      case 'delete-task':       this._onDeleteTask(btn, db);     break;
      case 'archive-task':      this._onArchiveTask(btn, db).catch(console.error); break;
      case 'close-modal':       this._closeModal();               break;
      case 'add-comment':          this._onAddComment(db);              break;
      case 'delete-comment':       this._onDeleteComment(btn, db);      break;
      case 'edit-comment':         this._onEditComment(btn, db);        break;
      case 'save-comment-edit':    this._onSaveCommentEdit(btn, db);    break;
      case 'cancel-comment-edit':  this._onCancelCommentEdit(db);       break;
      case 'open-label-manager': this._onManageLabels(db);       break;
      case 'remove-label':      this._onRemoveLabel(btn, db);    break;
      case 'edit-title':        this._onEditTitle();             break;
      case 'edit-description':  this._onEditDescription();       break;
      case 'pick-label':        this._onPickLabel(btn, db);      break;
      case 'add-column':          this._onAddColumn(db);               break;
      case 'delete-column':       this._onDeleteColumn(btn, db);       break;
      case 'toggle-done-column':  this._onToggleDoneColumn(btn, db);   break;
      case 'archive-column':      this._onArchiveColumn(btn, db).catch(console.error); break;
      case 'rename-column':       /* ダブルクリックで処理 */           break;
      case 'open-datepicker':   this._onOpenDatepicker(db);           break;
      case 'timeline-filter':    this._onTimelineFilter(btn, db);  break;
      case 'toggle-time-format': this._onToggleTimeFormat();        break;
      case 'md-tab':             this._onMdTab(btn);                break;
      case 'pick-parent':        this._onPickRelation('parent', btn, db); break;
      case 'pick-child':         this._onPickRelation('child',  btn, db); break;
      case 'pick-related':       this._onPickRelation('related', btn, db); break;
      case 'remove-relation':    this._onRemoveRelation(btn, db);   break;
      case 'open-related-task':  this._onOpenRelatedTask(btn, db);  break;
      case 'select-relation-task': this._onSelectRelationTask(btn, db); break;
      case 'pick-note-task':   this._onPickNoteTask(btn, db).catch(console.error); break;
      case 'select-note-task': this._onSelectNoteTask(btn, db).catch(console.error); break;
      case 'remove-note-link': this._onRemoveNoteLink(btn, db).catch(console.error); break;
      case 'open-note-task':   this._onOpenNoteTask(btn); break;
      // 依存関係
      case 'pick-dep-blocker':  this._onPickDep('blocker', btn, db).catch(console.error); break;
      case 'pick-dep-blocked':  this._onPickDep('blocked', btn, db).catch(console.error); break;
      case 'select-dep-task':   this._onSelectDepTask(btn, db).catch(console.error); break;
      case 'remove-dependency': this._onRemoveDependency(btn, db).catch(console.error); break;
      // テンプレート
      case 'open-template-modal':  this._onOpenTemplateModal(db).catch(console.error); break;
      case 'close-template-modal': this._closeTemplateModal(); break;
      case 'new-template':         this._onNewTemplate(db).catch(console.error); break;
      case 'select-template-item': this._onSelectTemplateItem(btn, db).catch(console.error); break;
      case 'delete-template-item': this._onDeleteTemplateItem(btn, db).catch(console.error); break;
      case 'save-as-template':     this._onSaveAsTemplate(db).catch(console.error); break;
      case 'use-template':         this._onUseTemplate(btn, db).catch(console.error); break;
      case 'skip-template':        this._onSkipTemplate(btn, db).catch(console.error); break;
      case 'confirm-add-task':     this._onConfirmAddTask(btn, db).catch(console.error); break;
      case 'cancel-add-task':      this._onCancelAddTask(btn); break;
      // アーカイブ
      case 'open-archive-modal':  this._onOpenArchiveModal(db).catch(console.error); break;
      case 'close-archive-modal': this._closeArchiveModal(); break;
      case 'restore-archive':     this._onRestoreArchive(btn, db).catch(console.error); break;
      case 'delete-archive':      this._onDeleteArchive(btn, db).catch(console.error); break;
    }
  },

  /** タスク追加（インラインフォームを表示） */
  async _onAddTask(btn, db) {
    const column = btn.dataset.column;

    // テンプレートが存在する場合はテンプレート選択ポップアップを表示
    if (State.templates.length > 0) {
      State._templatePickerColumn = column;
      this._showTemplatePicker(btn);
      return;
    }

    this._showAddForm(column);
  },

  /** インライン追加フォームを表示 */
  _showAddForm(column, templateData) {
    // 他のカラムのフォームを閉じる
    document.querySelectorAll('.column__add-form:not([hidden])').forEach(f => {
      f.setAttribute('hidden', '');
      const col = f.dataset.column;
      const btn = document.querySelector(`.column__add-btn[data-column="${col}"]`);
      if (btn) btn.removeAttribute('hidden');
    });

    const form  = document.querySelector(`.column__add-form[data-column="${column}"]`);
    const addBtn = document.querySelector(`.column__add-btn[data-column="${column}"]`);
    if (!form) return;

    // テンプレートデータを保持
    if (templateData) {
      form._templateData = templateData;
    } else {
      delete form._templateData;
    }

    form.removeAttribute('hidden');
    if (addBtn) addBtn.setAttribute('hidden', '');

    const input = form.querySelector('.column__add-input');
    input.value = templateData?.title || '';
    input.focus();
  },

  /** インライン追加フォームを非表示 */
  _hideAddForm(column) {
    const form = document.querySelector(`.column__add-form[data-column="${column}"]`);
    const addBtn = document.querySelector(`.column__add-btn[data-column="${column}"]`);
    if (form) {
      form.setAttribute('hidden', '');
      delete form._templateData;
    }
    if (addBtn) addBtn.removeAttribute('hidden');
  },

  /** インラインフォームの確定 */
  async _onConfirmAddTask(btn, db) {
    const column = btn.dataset.column;
    const form = document.querySelector(`.column__add-form[data-column="${column}"]`);
    if (!form) return;
    const input = form.querySelector('.column__add-input');
    const title = input.value.trim();
    if (!title) {
      input.focus();
      return;
    }

    const templateData = form._templateData || {};
    const data = { ...templateData, title };
    const labelIds = templateData.label_ids || [];

    this._hideAddForm(column);
    const task = await this._createTaskInColumn(column, data, db);

    // テンプレートのラベルを付与
    if (labelIds.length > 0) {
      for (const labelId of labelIds) {
        await db.addTaskLabel(task.id, labelId).catch(() => {});
        if (!State.taskLabels.has(task.id)) State.taskLabels.set(task.id, new Set());
        State.taskLabels.get(task.id).add(labelId);
      }
    }
  },

  /** インラインフォームのキャンセル */
  _onCancelAddTask(btn) {
    const column = btn.dataset.column;
    this._hideAddForm(column);
  },

  /** テンプレート選択ポップアップを表示 */
  _showTemplatePicker(btn) {
    const picker = document.getElementById('template-picker');
    const list   = document.getElementById('template-picker-list');
    if (!picker || !list) return;

    list.innerHTML = '';

    // スキップ項目
    const skipItem = document.createElement('li');
    skipItem.className = 'template-picker__item template-picker__item--skip';
    skipItem.dataset.action = 'skip-template';
    skipItem.textContent = '（空白で作成）';
    list.appendChild(skipItem);

    // テンプレート一覧
    for (const tpl of State.templates) {
      const item = document.createElement('li');
      item.className = 'template-picker__item';
      item.dataset.action = 'use-template';
      item.dataset.templateId = tpl.id;
      item.textContent = tpl.name;
      list.appendChild(item);
    }

    // 一旦非表示のまま高さを取得してからボタンの上に配置
    picker.style.visibility = 'hidden';
    picker.removeAttribute('hidden');
    const pickerH = picker.offsetHeight;
    picker.style.visibility = '';

    const rect = btn.getBoundingClientRect();
    const top = Math.max(4, rect.top - pickerH - 4);
    picker.style.top  = top + 'px';
    picker.style.left = rect.left + 'px';
  },

  /** テンプレートを使用してタスク作成（インラインフォームを表示） */
  async _onUseTemplate(btn, db) {
    const tplId  = parseInt(btn.dataset.templateId, 10);
    const column = State._templatePickerColumn;
    if (!column) return;
    const tpl = State.templates.find(t => t.id === tplId);
    if (!tpl) return;
    document.getElementById('template-picker').setAttribute('hidden', '');
    State._templatePickerColumn = null;

    // チェックリストの done をリセット
    const checklist = (tpl.checklist || []).map(c => ({ ...c, done: false }));
    const templateData = {
      title:       tpl.title       || '',
      description: tpl.description || '',
      checklist,
      label_ids:   tpl.label_ids || [],
    };
    this._showAddForm(column, templateData);
  },

  /** テンプレートをスキップして空白タスクを作成（インラインフォームを表示） */
  async _onSkipTemplate(btn, db) {
    const column = State._templatePickerColumn;
    document.getElementById('template-picker').setAttribute('hidden', '');
    State._templatePickerColumn = null;
    if (!column) return;
    this._showAddForm(column);
  },

  /** 指定カラムにタスクを作成してモーダルを開く共通処理 */
  async _createTaskInColumn(column, data, db) {
    const colTasks = State.tasks[column] || [];
    const lastPos  = colTasks.length > 0 ? colTasks[colTasks.length - 1].position + 1000 : 1000;
    const task     = await db.addTask({ column, position: lastPos, ...data });
    if (!State.tasks[column]) State.tasks[column] = [];
    State.tasks[column].push(task);

    // DOM に追加
    const body = document.querySelector(`[data-column-body="${column}"]`);
    const card = Renderer.createCard(task, db);
    body.appendChild(card);
    Renderer.updateCount(column);

    markDirty();
    applyFilter();
    // 新規作成アクティビティを記録（作成日時の記録）
    try { await db.addActivity(task.id, 'task_create', {}); } catch (e) { console.error('活動履歴の記録に失敗:', e); }
    // アクティビティログに記録
    ActivityLogger.log('todo', 'create', 'task', task.id, `タスク「${task.title || '(無題)'}」を追加`);
    // すぐモーダルを開く
    await Renderer.renderModal(task.id, db);
    return task;
  },

  /** タスク詳細を開く */
  async _onOpenTask(btn, db) {
    const card   = btn.closest('.card');
    const taskId = parseInt(card?.dataset.id, 10);
    if (!taskId) return;
    await Renderer.renderModal(taskId, db);
  },

  /** タスク個別アーカイブ（カードのボタンからもモーダルのボタンからも呼ばれる） */
  async _onArchiveTask(btn, db) {
    const card   = btn.closest('.card');
    const taskId = card ? parseInt(card.dataset.id, 10) : State.currentTaskId;
    if (!taskId) return;

    // タスク情報を取得
    let task = null;
    let column = null;
    for (const [col, tasks] of Object.entries(State.tasks)) {
      const t = tasks.find(t => t.id === taskId);
      if (t) { task = t; column = col; break; }
    }
    if (!task) return;

    // アーカイブ前にアクティビティを記録
    try { await db.addActivity(taskId, 'archive', {}); } catch {}

    await db.archiveTask(taskId);
    if (column) State.tasks[column] = (State.tasks[column] || []).filter(t => t.id !== taskId);
    _updateWipDisplay(column);
    Renderer.renderColumn(column, State.tasks[column] || [], db);
    applyFilter();
    markDirty();
    // アクティビティログに記録
    ActivityLogger.log('todo', 'archive', 'task', taskId, `タスク「${task.title || '(無題)'}」をアーカイブ`);

    // モーダルが開いていれば閉じる
    const modal = document.getElementById('task-modal');
    if (modal?.classList.contains('is-open')) {
      modal.classList.remove('is-open');
      modal.addEventListener('transitionend', () => modal.setAttribute('hidden', ''), { once: true });
      State.currentTaskId = null;
    }

    Toast.success(`「${task.title}」をアーカイブしました`);
  },

  /** タスク削除（カードのボタンからもモーダルの削除ボタンからも呼ばれる） */
  async _onDeleteTask(btn, db) {
    const card   = btn.closest('.card');
    const taskId = card ? parseInt(card.dataset.id, 10) : State.currentTaskId;
    if (!taskId) return;
    if (!confirm('このタスクを削除しますか？')) return;

    // 削除前にタスク情報を取得（アクティビティログ用）
    let deletedTitle = '';
    for (const tasks of Object.values(State.tasks)) {
      const t = tasks.find(t => t.id === taskId);
      if (t) { deletedTitle = t.title || '(無題)'; break; }
    }

    // 削除前に関係タスクを取得（アクティビティ記録用）
    const { parent, children, related } = await db.getRelationsByTask(taskId).catch(() => ({ parent: null, children: [], related: [] }));

    // column を特定（カードから or State.tasks から検索）
    let column = card?.closest('[data-column-body]')?.dataset.columnBody;
    if (!column) {
      for (const [col, tasks] of Object.entries(State.tasks)) {
        if (tasks.some(t => t.id === taskId)) { column = col; break; }
      }
    }

    await db.deleteTask(taskId);
    if (column) State.tasks[column] = (State.tasks[column] || []).filter(t => t.id !== taskId);
    markDirty();
    // アクティビティログに記録
    ActivityLogger.log('todo', 'delete', 'task', taskId, `タスク「${deletedTitle}」を削除`);

    // 関連付けられていたタスクへ紐づけ解除アクティビティを記録
    const activityPromises = [];
    if (parent) {
      // 削除タスクは親の子だったので、親タスク側は「子タスクの紐づけを解除」
      activityPromises.push(db.addActivity(parent.task.id, 'relation_remove', { role: 'child' }).catch(() => {}));
    }
    for (const c of children) {
      // 削除タスクは子の親だったので、子タスク側は「親タスクの紐づけを解除」
      activityPromises.push(db.addActivity(c.task.id, 'relation_remove', { role: 'parent' }).catch(() => {}));
    }
    for (const r of related) {
      activityPromises.push(db.addActivity(r.task.id, 'relation_remove', { role: 'related' }).catch(() => {}));
    }
    await Promise.all(activityPromises);

    // パネルが開いていれば閉じる
    if (document.getElementById('task-modal').classList.contains('is-open')) this._closeModal();

    // カードを DOM から削除
    const cardEl = document.querySelector(`.card[data-id="${taskId}"]`);
    if (cardEl) cardEl.remove();
    if (column) Renderer.updateCount(column);
    applyFilter();
  },

  /** パネルをスライドアウトして閉じる */
  _closeModal() {
    const modal = document.getElementById('task-modal');
    modal.classList.remove('is-open');
    // トランジション完了後に hidden を設定
    modal.querySelector('.modal__dialog').addEventListener('transitionend', () => {
      if (!modal.classList.contains('is-open')) {
        modal.setAttribute('hidden', '');
      }
    }, { once: true });
    State.currentTaskId = null;
    document.getElementById('modal-comment-input').value = '';
    // コメントエディタを write タブにリセット
    _resetMdEditor(document.getElementById('comment-editor'));
    // タスクピッカーを閉じる
    this._closeTaskPicker();
  },

  /** タイムラインフィルタータブ切替 */
  async _onTimelineFilter(btn, db) {
    const filter = btn.dataset.filter;
    if (State.timelineFilter === filter) return;
    State.timelineFilter = filter;

    // タブのアクティブ状態を更新
    document.querySelectorAll('.timeline-tab').forEach(t => {
      t.classList.toggle('is-active', t.dataset.filter === filter);
    });

    if (State.currentTaskId) {
      await Renderer.renderComments(State.currentTaskId, db);
    }
  },

  /** タイムライン時刻形式トグル（相対 ↔ 絶対） */
  _onToggleTimeFormat() {
    State.timeAbsolute = !State.timeAbsolute;

    // トグルボタンのアクティブ状態と tooltip を更新
    document.querySelectorAll('[data-action="toggle-time-format"]').forEach(btn => {
      btn.classList.toggle('is-active', State.timeAbsolute);
      btn.title = State.timeAbsolute ? '相対時刻で表示' : '絶対時刻で表示';
    });

    // [data-time] 要素をインプレース更新（再レンダリング不要）
    document.querySelectorAll('#modal-comments [data-time]').forEach(el => {
      const iso = el.dataset.time;
      el.textContent = State.timeAbsolute
        ? new Date(iso).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
        : Renderer._relativeTime(iso);
      el.title = State.timeAbsolute ? Renderer._relativeTime(iso) : new Date(iso).toLocaleString('ja-JP');
    });
  },

  /** コメント追加 */
  async _onAddComment(db) {
    const input = document.getElementById('modal-comment-input');
    const body  = input.value.trim();
    if (!body || !State.currentTaskId) return;

    await db.addComment(State.currentTaskId, body);
    // コメントキャッシュを更新
    await this._refreshCommentCache(State.currentTaskId, db);
    markDirty();
    input.value = '';
    // コメントエディタを write タブにリセット
    _resetMdEditor(document.getElementById('comment-editor'));
    await Renderer.renderComments(State.currentTaskId, db);
  },

  /** コメント削除（ソフトデリート） */
  async _onDeleteComment(btn, db) {
    const commentId = parseInt(btn.dataset.commentId, 10);
    if (!commentId) return;
    if (!confirm('このコメントを削除しますか？')) return;

    const deletedAt = new Date().toISOString();
    await db.updateComment(commentId, { deleted_at: deletedAt });

    // 削除履歴を記録
    try {
      await db.addActivity(State.currentTaskId, 'comment_delete', {});
      // 「すべて」タブ表示中はすでに renderComments で再描画するので追加呼び出し不要
    } catch (e) { console.error('活動履歴の記録に失敗:', e); }

    // コメントキャッシュを更新
    await this._refreshCommentCache(State.currentTaskId, db);
    markDirty();
    await Renderer.renderComments(State.currentTaskId, db);
  },

  /** コメントをインライン編集モードに切り替え */
  _onEditComment(btn, db) {
    const commentId = parseInt(btn.dataset.commentId, 10);
    if (!commentId) return;
    const item = btn.closest('.comment-item');
    if (!item) return;
    const originalBody = item.dataset.commentBody || '';

    const body = item.querySelector('.comment-item__body');
    body.innerHTML = '';

    // md-editor ラッパー（記述/プレビュータブ付き）
    const editorId = 'comment-edit-editor';
    const editorEl = document.createElement('div');
    editorEl.className = 'md-editor';
    editorEl.id = editorId;

    const tabs = document.createElement('div');
    tabs.className = 'md-editor__tabs';

    const writeTab = document.createElement('button');
    writeTab.type = 'button';
    writeTab.className = 'md-editor__tab is-active';
    writeTab.dataset.action = 'md-tab';
    writeTab.dataset.target = editorId;
    writeTab.dataset.tab = 'write';
    writeTab.textContent = '記述';

    const previewTab = document.createElement('button');
    previewTab.type = 'button';
    previewTab.className = 'md-editor__tab';
    previewTab.dataset.action = 'md-tab';
    previewTab.dataset.target = editorId;
    previewTab.dataset.tab = 'preview';
    previewTab.textContent = 'プレビュー';

    tabs.appendChild(writeTab);
    tabs.appendChild(previewTab);

    const textarea = document.createElement('textarea');
    textarea.className = 'comment-item__edit-textarea';
    textarea.value = originalBody;

    const previewDiv = document.createElement('div');
    previewDiv.className = 'md-editor__preview md-body';
    previewDiv.hidden = true;

    editorEl.appendChild(tabs);
    editorEl.appendChild(textarea);
    editorEl.appendChild(previewDiv);

    const editActions = document.createElement('div');
    editActions.className = 'comment-item__edit-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'comment-item__edit-cancel';
    cancelBtn.dataset.action = 'cancel-comment-edit';
    cancelBtn.textContent = 'キャンセル';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'comment-item__edit-save';
    saveBtn.dataset.action    = 'save-comment-edit';
    saveBtn.dataset.commentId = commentId;
    saveBtn.textContent = '保存';

    editActions.appendChild(cancelBtn);
    editActions.appendChild(saveBtn);
    body.appendChild(editorEl);
    body.appendChild(editActions);
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  },

  /** コメント編集を保存 */
  async _onSaveCommentEdit(btn, db) {
    const commentId = parseInt(btn.dataset.commentId, 10);
    if (!commentId) return;
    const body = btn.closest('.comment-item__body');
    const textarea = body ? body.querySelector('textarea') : null;
    if (!textarea) return;
    const newBody = textarea.value.trim();
    if (!newBody) return;
    // 変更がなければ何もしない
    const item = btn.closest('.comment-item');
    const originalBody = (item?.dataset.commentBody || '').trim();
    if (newBody === originalBody) {
      await Renderer.renderComments(State.currentTaskId, db);
      return;
    }
    await db.updateComment(commentId, { body: newBody });
    // コメント編集を活動履歴に記録
    try {
      await db.addActivity(State.currentTaskId, 'comment_edit', {});
    } catch (e) { console.error('活動履歴の記録に失敗:', e); }
    await this._refreshCommentCache(State.currentTaskId, db);
    markDirty();
    await Renderer.renderComments(State.currentTaskId, db);
  },

  /** コメント編集をキャンセル */
  async _onCancelCommentEdit(db) {
    await Renderer.renderComments(State.currentTaskId, db);
  },

  /** 指定タスクのコメントキャッシュを再取得（削除済みは除外） */
  async _refreshCommentCache(taskId, db) {
    const cs = await db.getCommentsByTask(taskId);
    State.comments.set(taskId, cs.filter(c => !c.deleted_at).map(c => c.body));
  },

  /** ラベル管理ダイアログを開く（LabelManager 共通部品） */
  async _onManageLabels(db) {
    LabelManager.open({
      title: 'ラベル設定',
      labels: [...State.labels],
      onAdd: async (name, color) => {
        const label = await db.addLabel(name, color);
        State.labels.push(label);
        return label;
      },
      onUpdate: async (id, name, color) => {
        await db.updateLabel(id, name, color);
        const label = State.labels.find(l => l.id === id);
        if (label) { label.name = name; label.color = color; }
      },
      onDelete: async (id) => {
        // 削除前に影響タスクを収集してアクティビティ記録
        const label = State.labels.find(l => l.id === id);
        const affectedTaskIds = [];
        for (const [taskId, labelIds] of State.taskLabels) {
          if (labelIds.has(id)) affectedTaskIds.push(taskId);
        }
        await db.deleteLabel(id);
        for (const taskId of affectedTaskIds) {
          try { await db.addActivity(taskId, 'label_remove', { name: label?.name, color: label?.color }); } catch {}
        }
        State.labels = State.labels.filter(l => l.id !== id);
        for (const [, ids] of State.taskLabels) ids.delete(id);
        State.filter.labelIds.delete(id);
      },
      onReorder: (newLabels) => {
        // 並び順を localStorage に保存し、State に反映
        State.labels = newLabels.slice();
        localStorage.setItem('kanban_label_order', JSON.stringify(newLabels.map(l => l.id)));
        renderFilterLabels();
        // モーダルが開いていればラベル一覧を即時更新
        if (State.currentTaskId) {
          Renderer.renderModalLabels(State.currentTaskId, db).catch(console.error);
        }
      },
      onChange: async () => {
        markDirty();
        renderFilterLabels();
        applyFilter();
        if (State.currentTaskId) {
          await Renderer.renderModalLabels(State.currentTaskId, db);
          await Renderer.refreshCard(State.currentTaskId, db);
        }
      },
    });
  },

  /** ラベル削除（タスクから切り離すのみ） */
  async _onRemoveLabel(btn, db) {
    const labelId = parseInt(btn.dataset.labelId, 10);
    if (!labelId || !State.currentTaskId) return;
    const taskId = State.currentTaskId; // レースコンディション防止
    const label = State.labels.find(l => l.id === labelId);

    await db.removeTaskLabel(taskId, labelId);
    // taskLabels キャッシュ更新
    const labelsForTask = State.taskLabels.get(taskId);
    if (labelsForTask) labelsForTask.delete(labelId);
    markDirty();
    await Renderer.renderModalLabels(taskId, db);
    await Renderer.refreshCard(taskId, db);
    // 作業履歴（非同期、失敗してもUIに影響しない）
    if (label) {
      try {
        await db.addActivity(taskId, 'label_remove', { name: label.name, color: label.color });
        if (State.timelineFilter === 'all') await Renderer.renderComments(taskId, db);
      } catch (e) { console.error('活動履歴の記録に失敗:', e); }
    }
  },

  /** 既存ラベルをピッカーからタスクに追加 */
  async _onPickLabel(btn, db) {
    const labelId = parseInt(btn.dataset.labelId, 10);
    if (!labelId || !State.currentTaskId) return;
    const taskId = State.currentTaskId; // レースコンディション防止
    const label = State.labels.find(l => l.id === labelId);

    await db.addTaskLabel(taskId, labelId);
    // taskLabels キャッシュ更新
    if (!State.taskLabels.has(taskId)) State.taskLabels.set(taskId, new Set());
    State.taskLabels.get(taskId).add(labelId);
    markDirty();
    await Renderer.renderModalLabels(taskId, db);
    await Renderer.refreshCard(taskId, db);
    // 作業履歴（非同期、失敗してもUIに影響しない）
    if (label) {
      try {
        await db.addActivity(taskId, 'label_add', { name: label.name, color: label.color });
        if (State.timelineFilter === 'all') await Renderer.renderComments(taskId, db);
      } catch (e) { console.error('活動履歴の記録に失敗:', e); }
    }
  },

  /** カラム変更 */
  async _onColumnChange(e, db) {
    if (!State.currentTaskId) return;
    const taskId = State.currentTaskId; // レースコンディション防止
    const newCol   = e.target.value;
    const allTasks = await db.getAllTasks();
    const task     = allTasks.find(t => t.id === taskId);
    if (!task) return;
    const oldCol = task.column;
    if (oldCol === newCol) return;

    // 完了カラムへ移動しようとしている場合、先行タスクが完了しているか確認
    const toColDef = State.columns.find(c => c.key === newCol);
    if (toColDef?.done) {
      const deps = State.dependencies.get(taskId);
      if (deps && deps.blockedBy.size > 0) {
        const doneKeys = new Set(State.columns.filter(c => c.done).map(c => c.key));
        const hasBlocker = [...deps.blockedBy].some(blockerId => {
          const bt = Object.values(State.tasks).flat().find(t => t.id === blockerId);
          return !bt || !doneKeys.has(bt.column);
        });
        if (hasBlocker) {
          Toast.error('先行タスクが完了していないため移動できません');
          e.target.value = oldCol;
          if (e.target._csInst) e.target._csInst.render();
          return;
        }
      }
    }

    // 新カラムの末尾 position
    const newColTasks = State.tasks[newCol] || [];
    const lastPos     = newColTasks.length > 0 ? newColTasks[newColTasks.length - 1].position + 1000 : 1000;
    const updated     = await db.updateTask(taskId, { column: newCol, position: lastPos });

    // State キャッシュ更新
    State.tasks[oldCol] = (State.tasks[oldCol] || []).filter(t => t.id !== taskId);
    if (!State.tasks[newCol]) State.tasks[newCol] = [];
    State.tasks[newCol].push(updated);

    // DOM 更新
    const oldDone = State.columns.find(c => c.key === oldCol)?.done;
    const newDone = State.columns.find(c => c.key === newCol)?.done;
    if (oldDone !== newDone) {
      // done ステータスが変わる場合は期限切れ表示が変わるため両カラムを再描画
      Renderer.renderColumn(oldCol, State.tasks[oldCol] || [], db);
      Renderer.renderColumn(newCol, State.tasks[newCol] || [], db);
      // 後続タスク（このタスクに blockedBy されている）のロックアイコンを更新
      const movedDeps = State.dependencies.get(taskId);
      if (movedDeps && movedDeps.blocking.size > 0) {
        const allTasks = Object.values(State.tasks).flat();
        const colsToRefresh = new Set();
        for (const blockedId of movedDeps.blocking) {
          const bt = allTasks.find(t => t.id === blockedId);
          if (bt && bt.column !== oldCol && bt.column !== newCol) {
            colsToRefresh.add(bt.column);
          }
        }
        for (const col of colsToRefresh) {
          Renderer.renderColumn(col, State.tasks[col] || [], db);
        }
      }
    } else {
      const newBody = document.querySelector(`[data-column-body="${newCol}"]`);
      const card    = document.querySelector(`.card[data-id="${taskId}"]`);
      if (card && newBody) newBody.appendChild(card);
    }
    markDirty();
    Renderer.updateCount(oldCol);
    Renderer.updateCount(newCol);
    applyFilter();
    // 作業履歴（非同期、失敗してもUIに影響しない）
    try {
      const oldColName = State.columns.find(c => c.key === oldCol)?.name ?? oldCol;
      const newColName = State.columns.find(c => c.key === newCol)?.name ?? newCol;
      await db.addActivity(taskId, 'column_change', { from: oldColName, to: newColName });
      if (State.timelineFilter === 'all') await Renderer.renderComments(taskId, db);
    } catch (e) { console.error('活動履歴の記録に失敗:', e); }
    // カラム移動をアクティビティログに記録
    const newDone2 = State.columns.find(c => c.key === newCol)?.done;
    const taskTitle2 = updated.title || '(無題)';
    if (newDone2) {
      ActivityLogger.log('todo', 'complete', 'task', taskId, `タスク「${taskTitle2}」を完了`);
    } else {
      const oldColName2 = State.columns.find(c => c.key === oldCol)?.name ?? oldCol;
      const newColName2 = State.columns.find(c => c.key === newCol)?.name ?? newCol;
      ActivityLogger.log('todo', 'move', 'task', taskId, `タスク「${taskTitle2}」を移動（${oldColName2} → ${newColName2}）`);
    }
    // 完了カラムへ移動した場合、繰り返しタスクを自動生成
    if (newDone2 && updated.recurring) {
      await _handleRecurringOnDone(updated, db);
    }
  },

  /** カレンダーを開いて期限日を選択 */
  _onOpenDatepicker(db) {
    const dueHidden = document.getElementById('modal-due');
    DatePicker.open(
      dueHidden.value,
      async (dateStr) => this._saveDueDate(dateStr, db),
      async ()        => this._saveDueDate('', db),
    );
  },

  /** 期限日を DB に保存して表示を更新 */
  async _saveDueDate(dateStr, db) {
    if (!State.currentTaskId) return;
    const taskId = State.currentTaskId; // レースコンディション防止
    const dueHidden  = document.getElementById('modal-due');
    const dueText    = document.getElementById('modal-due-text');
    const dueDisplay = document.getElementById('modal-due-display');

    const oldDue = dueHidden.value;
    dueHidden.value = dateStr;
    if (dateStr) {
      const [y, m, d] = dateStr.split('-');
      dueText.textContent = `${y}/${m}/${d}`;
      dueDisplay.className = 'modal__date-display';
      const { cls } = Renderer._getDueInfo(dateStr);
      if (cls === 'card__due--overdue') dueDisplay.classList.add('modal__date-display--overdue');
      if (cls === 'card__due--today')   dueDisplay.classList.add('modal__date-display--today');
    } else {
      dueText.textContent = '日付を選択...';
      dueDisplay.className = 'modal__date-display';
    }

    await db.updateTask(taskId, { due_date: dateStr });
    markDirty();

    // タスクキャッシュ更新 + 再描画
    for (const col of getColumnKeys()) {
      const idx = (State.tasks[col] || []).findIndex(t => t.id === taskId);
      if (idx !== -1) {
        State.tasks[col][idx].due_date = dateStr;
        // ソートが期限日順の場合はカラム再描画で並び順を更新
        if (State.sort.field === 'due_date') {
          await Renderer.renderColumn(col, State.tasks[col], db);
          applyFilter();
        } else {
          await Renderer.refreshCard(taskId, db);
        }
        break;
      }
    }
    // 作業履歴（非同期、失敗してもUIに影響しない）
    if (oldDue !== dateStr) {
      try {
        let actType = 'due_change';
        if (!oldDue && dateStr)  actType = 'due_add';
        if (oldDue  && !dateStr) actType = 'due_remove';
        await db.addActivity(taskId, actType, { from: oldDue, to: dateStr });
        if (State.timelineFilter === 'all') await Renderer.renderComments(taskId, db);
      } catch (e) { console.error('活動履歴の記録に失敗:', e); }
    }
  },

  /** タイトル blur 時に保存して表示モードに戻す */
  async _onTitleBlur(e, db) {
    if (!State.currentTaskId) return;
    const taskId = State.currentTaskId; // レースコンディション防止
    const title    = e.target.value.trim() || '(無題)';
    const oldTitle = document.getElementById('modal-title-text').textContent;
    await db.updateTask(taskId, { title });

    // 表示モードに切り替え
    const titleText = document.getElementById('modal-title-text');
    const titleBtn  = document.querySelector('[data-action="edit-title"]');
    titleText.textContent = title;
    e.target.setAttribute('hidden', '');
    titleText.removeAttribute('hidden');
    if (titleBtn) titleBtn.removeAttribute('hidden');

    markDirty();
    // キャッシュ・カード更新
    for (const col of getColumnKeys()) {
      const idx = (State.tasks[col] || []).findIndex(t => t.id === taskId);
      if (idx !== -1) { State.tasks[col][idx].title = title; break; }
    }
    await Renderer.refreshCard(taskId, db);
    // 作業履歴（非同期、失敗してもUIに影響しない）
    if (oldTitle !== title) {
      try {
        await db.addActivity(taskId, 'title_change', { to: title });
        if (State.timelineFilter === 'all') await Renderer.renderComments(taskId, db);
      } catch (e) { console.error('活動履歴の記録に失敗:', e); }
    }
  },

  /** 説明 blur 時に保存して表示モードに戻す */
  async _onDescriptionBlur(e, db) {
    if (!State.currentTaskId) return;
    // desc-editor 内（タブボタン等）へのフォーカス移動は無視する
    const descEditor = document.getElementById('desc-editor');
    if (descEditor && e.relatedTarget && descEditor.contains(e.relatedTarget)) return;
    const taskId = State.currentTaskId; // レースコンディション防止
    const description = e.target.value;
    await db.updateTask(taskId, { description });

    markDirty();

    // 表示モードに切り替え（マークダウンレンダリング＋チェックボックス有効化）
    const descView = document.getElementById('modal-description-view');
    const descBtn  = document.querySelector('[data-action="edit-description"]');
    let descText     = description;
    const renderDescView = () => {
      renderMarkdown(descView, descText, async (index, checked) => {
        descText = toggleCheckboxInMarkdown(descText, index, checked);
        await db.updateTask(taskId, { description: descText });
        e.target.value = descText;
        markDirty();
        renderDescView();
      });
    };
    renderDescView();
    // 編集エリアを隠してwrite タブをリセット
    _resetMdEditor(descEditor);
    descEditor.setAttribute('hidden', '');
    descView.removeAttribute('hidden');
    if (descBtn) descBtn.removeAttribute('hidden');
    // 作業履歴（非同期、失敗してもUIに影響しない）
    if (description !== State._descriptionBeforeEdit) {
      try {
        await db.addActivity(taskId, 'description_change', {});
        if (State.timelineFilter === 'all') await Renderer.renderComments(taskId, db);
      } catch (e) { console.error('活動履歴の記録に失敗:', e); }
    }
    State._descriptionBeforeEdit = null;
  },

  /** タイトル編集モードに切り替え */
  _onEditTitle() {
    const titleText  = document.getElementById('modal-title-text');
    const titleInput = document.getElementById('modal-title');
    const titleBtn   = document.querySelector('[data-action="edit-title"]');
    titleInput.value = titleText.textContent;
    titleText.setAttribute('hidden', '');
    titleInput.removeAttribute('hidden');
    if (titleBtn) titleBtn.setAttribute('hidden', '');
    titleInput.focus();
    titleInput.select();
  },

  /** 説明編集モードに切り替え */
  _onEditDescription() {
    const descView   = document.getElementById('modal-description-view');
    const descEditor = document.getElementById('desc-editor');
    const descBtn    = document.querySelector('[data-action="edit-description"]');
    // 編集開始時の元テキストを保存（変更なし判定用）
    State._descriptionBeforeEdit = document.getElementById('modal-description').value;
    descView.setAttribute('hidden', '');
    descEditor.removeAttribute('hidden');
    if (descBtn) descBtn.setAttribute('hidden', '');
    // write タブをアクティブにしてからフォーカス
    _resetMdEditor(descEditor);
    document.getElementById('modal-description').focus();
  },

  /** md-editor の write/preview タブ切替 */
  _onMdTab(btn) {
    const editorId = btn.dataset.target;
    const editor   = document.getElementById(editorId);
    if (!editor) return;
    const tab      = btn.dataset.tab;
    const textarea = editor.querySelector('textarea');
    const preview  = editor.querySelector('.md-editor__preview');

    editor.querySelectorAll('.md-editor__tab').forEach(t => t.classList.remove('is-active'));
    btn.classList.add('is-active');

    if (tab === 'preview') {
      renderMarkdown(preview, textarea.value || '');
      preview.removeAttribute('hidden');
      preview.tabIndex = 0;
      preview.focus();  // blur の relatedTarget が preview になるよう先にフォーカス移動
      textarea.setAttribute('hidden', '');
    } else {
      preview.setAttribute('hidden', '');
      preview.tabIndex = -1;
      textarea.removeAttribute('hidden');
      textarea.focus();
    }
  },

  /** キーボード操作 */
  _onKeydown(e, db) {
    const modal = document.getElementById('task-modal');
    const isInInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable;

    if (modal.classList.contains('is-open')) {
      // Esc でモーダルを閉じる（カレンダーが開いていれば先に閉じる）
      if (e.key === 'Escape') {
        const dp = document.getElementById('date-picker');
        if (!dp.hasAttribute('hidden')) {
          DatePicker.close();
          return;
        }
        this._closeModal();
        return;
      }
      // Tab: md-editor の write/preview タブを切り替え
      if (e.key === 'Tab') {
        const active = document.activeElement;
        let editorId = null;
        if (active === document.getElementById('modal-description')) {
          editorId = 'desc-editor';
        } else if (active === document.getElementById('modal-comment-input')) {
          editorId = 'comment-editor';
        } else if (active.classList.contains('md-editor__preview') || active.classList.contains('comment-item__edit-textarea')) {
          editorId = active.closest('.md-editor')?.id;
        }
        if (editorId) {
          e.preventDefault();
          const editor  = document.getElementById(editorId);
          const nextTab = [...editor.querySelectorAll('.md-editor__tab')].find(t => !t.classList.contains('is-active'));
          if (nextTab) this._onMdTab(nextTab);
          return;
        }
      }
      // Ctrl+Enter: コメント投稿または説明保存またはコメント編集保存
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        const active = document.activeElement;
        if (active === document.getElementById('modal-comment-input')) {
          e.preventDefault();
          this._onAddComment(db);
        } else if (active === document.getElementById('modal-description')) {
          e.preventDefault();
          active.blur(); // blur イベント → _onDescriptionBlur で保存+表示切替
        } else if (active.classList.contains('comment-item__edit-textarea')) {
          e.preventDefault();
          const saveBtn = active.closest('.comment-item__body')?.querySelector('[data-action="save-comment-edit"]');
          if (saveBtn) this._onSaveCommentEdit(saveBtn, db);
        }
      }
      return;
    }

    // ── モーダルが閉じている時のショートカット ──

    // Escape: フィルタ入力からフォーカスを外す
    if (e.key === 'Escape' && isInInput && !e.isComposing) {
      e.target.blur();
      return;
    }

    // N: 最初のカラムにインライン追加フォームを表示
    if (e.key === 'n' && !isInInput && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const firstCol = getColumnKeys()[0];
      if (firstCol) this._showAddForm(firstCol);
      return;
    }

    // F: フィルタ入力にフォーカス
    if (e.key === 'f' && !isInInput && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      document.getElementById('filter-text')?.focus();
      return;
    }

    // Ctrl+Shift+A: 完了カラムを一括アーカイブ
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'A') {
      e.preventDefault();
      const doneCol = State.columns.find(c => c.done);
      if (doneCol && State.tasks[doneCol.key]?.length > 0) {
        this._onArchiveColumn({ dataset: { columnKey: doneCol.key } }, db).catch(console.error);
      }
      return;
    }
  },

  /** 完了カラムフラグのトグル（期限切れ表示を抑制） */
  async _onToggleDoneColumn(btn, db) {
    const key = btn.dataset.columnKey;
    const col = State.columns.find(c => c.key === key);
    if (!col) return;
    col.done = !col.done;
    await db.updateColumn(col);
    // ヘッダーボタンを更新
    btn.classList.toggle('is-active', col.done);
    btn.setAttribute('aria-label', col.done ? `${col.name}: 完了カラム（クリックで解除）` : `${col.name}: 完了カラムに設定`);
    btn.setAttribute('data-tooltip', col.done ? '完了カラム（期限切れ非表示）' : '完了カラムに設定');
    // アーカイブボタンの表示切替
    const section = document.querySelector(`[data-column="${key}"]`);
    if (section) {
      const archiveBtn = section.querySelector('.column__archive-btn');
      if (archiveBtn) archiveBtn.classList.toggle('hidden-btn', !col.done);
    }
    // カードを再描画して期限表示を更新し、アクティブなフィルターを再適用
    Renderer.renderColumn(key, State.tasks[key] ?? [], db);
    applyFilter();
    markDirty();
  },

  /** カラム名インライン編集（+ WIP上限設定） */
  _onRenameColumn(titleEl, db) {
    if (titleEl.querySelector('input')) return; // 既に編集中
    const colId  = parseInt(titleEl.dataset.columnId, 10);
    const colKey = titleEl.dataset.columnKey;
    const col    = State.columns.find(c => c.id === colId);
    if (!col) return;

    const originalName = col.name;
    const originalWip  = col.wip_limit || 0;

    // 名前入力
    const nameInput = document.createElement('input');
    nameInput.type      = 'text';
    nameInput.value     = originalName;
    nameInput.className = 'column__title-input';
    nameInput.placeholder = 'カラム名';

    // WIP上限入力
    const wipInput = document.createElement('input');
    wipInput.type      = 'number';
    wipInput.value     = originalWip || '';
    wipInput.className = 'column__wip-input';
    wipInput.placeholder = 'WIP上限';
    wipInput.min       = '0';

    titleEl.textContent = '';
    titleEl.appendChild(nameInput);
    titleEl.appendChild(wipInput);
    nameInput.focus();
    nameInput.select();

    let settled = false;

    const restore = (newName) => {
      if (settled) return;
      settled = true;
      titleEl.textContent = newName;
      titleEl.dataset.action    = 'rename-column';
      titleEl.dataset.columnId  = col.id;
      titleEl.dataset.columnKey = colKey;
      titleEl.setAttribute('data-tooltip', 'ダブルクリックで名前変更・WIP上限設定');
    };

    const save = async () => {
      if (settled) return;
      const newName = nameInput.value.trim();
      const newWip  = parseInt(wipInput.value, 10) || 0;
      if (!newName) {
        restore(originalName);
        return;
      }
      col.name      = newName;
      col.wip_limit = newWip;
      await db.updateColumn(col);
      // モーダルのカラム選択肢も更新
      Renderer.renderModalColumnSelect();
      restore(newName);
      // WIP表示を更新
      _updateWipDisplay(colKey);
      // 完了カラムボタンの aria-label も更新
      const section = document.querySelector(`[data-column="${colKey}"]`);
      if (section) {
        const doneBtn = section.querySelector('.column__done-btn');
        if (doneBtn) {
          doneBtn.setAttribute('aria-label', col.done ? `${newName}: 完了カラム（クリックで解除）` : `${newName}: 完了カラムに設定`);
          doneBtn.setAttribute('data-tooltip', col.done ? '完了カラム（期限切れ非表示）' : '完了カラムに設定');
        }
        const delBtn = section.querySelector('.column__delete-btn');
        if (delBtn) delBtn.setAttribute('aria-label', `${newName} を削除`);
      }
      markDirty();
      if (newName !== originalName) Toast.success(`カラム名を「${newName}」に変更しました`);
    };

    nameInput.addEventListener('keydown', (e) => {
      if (e.isComposing) return;
      if (e.key === 'Enter')  { e.preventDefault(); wipInput.focus(); wipInput.select(); }
      if (e.key === 'Escape') { e.preventDefault(); restore(originalName); }
    });
    wipInput.addEventListener('keydown', (e) => {
      if (e.isComposing) return;
      if (e.key === 'Enter')  { e.preventDefault(); save(); }
      if (e.key === 'Escape') { e.preventDefault(); restore(originalName); }
    });
    nameInput.addEventListener('blur', (e) => {
      // WIP input にフォーカスが移った場合は保存しない
      if (e.relatedTarget === wipInput) return;
      save();
    });
    wipInput.addEventListener('blur', () => save());
  },

  /** カラム追加 */
  async _onAddColumn(db) {
    const name = prompt('新しいカラム名を入力:');
    if (!name?.trim()) return;
    const key      = 'col_' + Date.now();
    const position = Math.max(...State.columns.map(c => c.position), -1) + 1;
    const col      = await db.addColumn(name.trim(), key, position);
    State.columns.push(col);
    State.tasks[key] = [];
    Renderer.renderBoardColumns(db);
    await Renderer.renderBoard(db);
    for (const s of State.sortables) s.destroy();
    DragDrop.init(db);
    markDirty();
  },

  /** カラム削除（タスクが残っていればブロック） */
  async _onDeleteColumn(btn, db) {
    const colId  = parseInt(btn.dataset.columnId, 10);
    const colKey = btn.dataset.columnKey;
    if ((State.tasks[colKey] || []).length > 0) {
      Toast.error('タスクを先に移動または削除してください');
      return;
    }
    const colName = State.columns.find(c => c.id === colId)?.name || '';
    if (!confirm(`カラム「${colName}」を削除しますか？`)) return;
    await db.deleteColumn(colId);
    State.columns = State.columns.filter(c => c.id !== colId);
    delete State.tasks[colKey];
    Renderer.renderBoardColumns(db);
    await Renderer.renderBoard(db);
    for (const s of State.sortables) s.destroy();
    DragDrop.init(db);
    markDirty();
  },

  // ---- タスク関係操作 ----

  /** タスクピッカーを開く（role: 'parent' | 'child' | 'related'） */
  async _onPickRelation(role, btn, db) {
    if (!State.currentTaskId) return;
    const taskId = State.currentTaskId;

    // 既紐づきタスクのIDセットを取得（除外用）
    const { parent, children, related } = await db.getRelationsByTask(taskId).catch(() => ({ parent: null, children: [], related: [] }));
    const excludeIds = new Set([taskId]);
    if (parent)   excludeIds.add(parent.task.id);
    for (const c of children) excludeIds.add(c.task.id);
    for (const r of related)  excludeIds.add(r.task.id);

    // 選択可能なタスク一覧
    const allTasks = await db.getAllTasks();
    State._pickerRole      = role;
    State._pickerCandidates = allTasks.filter(t => !excludeIds.has(t.id));

    // ピッカーを表示
    const picker = document.getElementById('task-picker');
    const input  = document.getElementById('task-picker-input');
    input.value  = '';
    this._renderTaskPickerList(State._pickerCandidates);

    // ボタンのすぐ下に配置（position:fixed なのでビューポート座標をそのまま使う）
    const rect   = btn.getBoundingClientRect();
    const pickerW = 260;
    const left    = Math.min(rect.left, window.innerWidth - pickerW - 8);
    picker.style.top  = (rect.bottom + 4) + 'px';
    picker.style.left = Math.max(8, left) + 'px';
    picker.removeAttribute('hidden');
    input.focus();
  },

  /** タスクピッカーのリスト描画 */
  _renderTaskPickerList(tasks) {
    const list = document.getElementById('task-picker-list');
    list.innerHTML = '';
    if (tasks.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'task-picker__empty';
      empty.textContent = '選択可能なタスクがありません';
      list.appendChild(empty);
      return;
    }
    for (const t of tasks) {
      const col  = State.columns.find(c => c.key === t.column);
      const item = document.createElement('li');
      item.className = 'task-picker__item';
      item.dataset.action = 'select-relation-task';
      item.dataset.taskId = t.id;

      const titleEl = document.createElement('span');
      titleEl.className = 'task-picker__item-title';
      titleEl.textContent = t.title;

      const colEl = document.createElement('span');
      colEl.className = 'task-picker__item-column';
      colEl.textContent = col?.name ?? t.column;

      item.appendChild(titleEl);
      item.appendChild(colEl);
      list.appendChild(item);
    }
  },

  /** 検索テキストでピッカーリストを絞り込む */
  _filterTaskPickerList(text) {
    const q = text.toLowerCase();
    const candidates = (State._pickerCandidates || []).filter(t =>
      t.title.toLowerCase().includes(q) ||
      (State.columns.find(c => c.key === t.column)?.name ?? t.column).toLowerCase().includes(q)
    );
    this._renderTaskPickerList(candidates);
  },

  /** タスク選択確定 */
  async _onSelectRelationTask(btn, db) {
    const relatedId = parseInt(btn.dataset.taskId, 10);
    const taskId    = State.currentTaskId;
    const role      = State._pickerRole;
    if (!relatedId || !taskId || !role) return;

    const relatedTask = (State._pickerCandidates || []).find(t => t.id === relatedId);

    try {
      if (role === 'parent') {
        // 既存の親関係があれば先に削除
        const { parent } = await db.getRelationsByTask(taskId).catch(() => ({ parent: null }));
        if (parent) await db.deleteRelation(parent.relationId).catch(() => {});
        await db.addRelation(relatedId, taskId, 'child'); // relatedId=親, taskId=子
      } else if (role === 'child') {
        await db.addRelation(taskId, relatedId, 'child'); // taskId=親, relatedId=子
      } else {
        await db.addRelation(taskId, relatedId, 'related');
      }

      // アクティビティ記録（操作した側・関連付けられた側の両方に記録）
      if (relatedTask) {
        const actRole = role === 'parent' ? 'parent' : role === 'child' ? 'child' : 'related';
        await db.addActivity(taskId, 'relation_add', { role: actRole, with_title: relatedTask.title }).catch(() => {});
        const oppositeRole = { parent: 'child', child: 'parent', related: 'related' }[actRole];
        const currentTask = Object.values(State.tasks).flat().find(t => t.id === taskId);
        await db.addActivity(relatedId, 'relation_add', { role: oppositeRole, with_title: currentTask?.title ?? '' }).catch(() => {});
      }

      markDirty();
    } catch (e) {
      console.error('関係追加に失敗:', e);
    }

    this._closeTaskPicker();
    await Renderer.renderRelations(taskId, db);

    if (State.timelineFilter === 'all') {
      await Renderer.renderComments(taskId, db);
    }
  },

  /** 関係を削除 */
  async _onRemoveRelation(btn, db) {
    const relationId    = parseInt(btn.dataset.relationId, 10);
    const role          = btn.dataset.role;
    const taskId        = State.currentTaskId;
    const relatedTaskId = parseInt(btn.dataset.relatedTaskId, 10);
    if (!relationId || !taskId) return;

    try {
      await db.deleteRelation(relationId);
      await db.addActivity(taskId, 'relation_remove', { role: role || 'related' }).catch(() => {});
      // 関連付けられた側にもアクティビティを記録
      if (relatedTaskId) {
        const oppositeRole = { parent: 'child', child: 'parent', related: 'related' }[role] ?? 'related';
        await db.addActivity(relatedTaskId, 'relation_remove', { role: oppositeRole }).catch(() => {});
      }
      markDirty();
    } catch (e) {
      console.error('関係削除に失敗:', e);
    }

    await Renderer.renderRelations(taskId, db);
    if (State.timelineFilter === 'all') {
      await Renderer.renderComments(taskId, db);
    }
  },

  /** 関連タスクのモーダルを開く */
  async _onOpenRelatedTask(btn, db) {
    const taskId = parseInt(btn.dataset.taskId, 10);
    if (!taskId) return;
    this._closeTaskPicker();
    await Renderer.renderModal(taskId, db);
  },

  /** タスクピッカーを閉じる */
  _closeTaskPicker() {
    const picker = document.getElementById('task-picker');
    if (picker) picker.setAttribute('hidden', '');
    State._pickerRole       = null;
    State._pickerCandidates = null;
  },

  // ---- ノート紐づけ操作 ----

  /** ノートピッカーを開く */
  async _onPickNoteTask(btn, db) {
    if (!State.currentTaskId) return;

    // 既存リンクを除外
    const existingLinks = await db.getNoteLinksByTodo(State.currentTaskId).catch(() => []);
    const excludeIds = new Set(existingLinks.map(l => l.note_task_id));

    // note_db からタスク一覧を取得
    let noteTasks = [];
    try {
      const noteDb = await _openNoteDB();
      noteTasks = await new Promise((resolve, reject) => {
        const req = noteDb.transaction('tasks').objectStore('tasks').getAll();
        req.onsuccess = e => resolve(e.target.result);
        req.onerror   = e => reject(e.target.error);
      });
      noteDb.close();
    } catch (e) {
      Toast.error('ノートDBを開けませんでした');
      return;
    }

    State._notePickerCandidates = noteTasks.filter(t => !excludeIds.has(t.id));

    const picker = document.getElementById('note-picker');
    const input  = document.getElementById('note-picker-input');
    input.value  = '';
    this._renderNotePickerList(State._notePickerCandidates);

    const rect = btn.getBoundingClientRect();
    picker.style.top  = (rect.bottom + 4) + 'px';
    picker.style.left = rect.left + 'px';
    picker.removeAttribute('hidden');
    input.focus();
  },

  /** ノートピッカーのリストを描画 */
  _renderNotePickerList(tasks) {
    const list = document.getElementById('note-picker-list');
    list.innerHTML = '';
    if (tasks.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'task-picker__empty';
      empty.textContent = '選択可能なノートがありません';
      list.appendChild(empty);
      return;
    }
    for (const t of tasks) {
      const item = document.createElement('li');
      item.className = 'task-picker__item';
      item.dataset.action = 'select-note-task';
      item.dataset.taskId = t.id;

      const titleEl = document.createElement('span');
      titleEl.className = 'task-picker__item-title';
      titleEl.textContent = t.title;

      item.appendChild(titleEl);
      list.appendChild(item);
    }
  },

  /** ノートピッカーの検索フィルター */
  _filterNotePickerList(query) {
    const q = query.toLowerCase();
    const candidates = (State._notePickerCandidates || []).filter(
      t => t.title.toLowerCase().includes(q),
    );
    this._renderNotePickerList(candidates);
  },

  /** ノートピッカーを閉じる */
  _closeNotePicker() {
    const picker = document.getElementById('note-picker');
    if (picker) picker.setAttribute('hidden', '');
    State._notePickerCandidates = null;
  },

  /** ノートタスクを選択して紐づけ */
  async _onSelectNoteTask(btn, db) {
    const noteTaskId = parseInt(btn.dataset.taskId, 10);
    const todoTaskId = State.currentTaskId;
    if (!todoTaskId || !noteTaskId) return;

    await db.addNoteLink(todoTaskId, noteTaskId);
    this._closeNotePicker();
    await Renderer.renderNoteLinks(todoTaskId, db);
    markDirty();
    // ノートページにリンク変更を通知
    _noteLinksBC?.postMessage({ type: 'note-link-changed', noteTaskId });
  },

  /** ノート紐づけを解除 */
  async _onRemoveNoteLink(btn, db) {
    const linkId    = parseInt(btn.dataset.linkId, 10);
    const noteTaskId = parseInt(btn.dataset.noteTaskId, 10);
    await db.deleteNoteLink(linkId);
    await Renderer.renderNoteLinks(State.currentTaskId, db);
    markDirty();
    // ノートページにリンク変更を通知
    if (noteTaskId) _noteLinksBC?.postMessage({ type: 'note-link-changed', noteTaskId });
  },

  /** ノートページでタスクを開く（親フレームにナビゲーション要求を送信） */
  _onOpenNoteTask(btn) {
    const noteTaskId = parseInt(btn.dataset.noteTaskId, 10);
    parent.postMessage({ type: 'navigate:note', noteTaskId }, '*');
  },

  // ---- 繰り返し設定 ----

  /** 繰り返しトグルを変更 */
  async _onRecurringToggle(e, db) {
    if (!State.currentTaskId) return;
    const taskId  = State.currentTaskId;
    const enabled = e.target.checked;
    const interval     = document.getElementById('modal-recurring-interval');
    const intervalWrap = document.getElementById('modal-recurring-interval-wrap');
    if (enabled) {
      intervalWrap?.removeAttribute('hidden');
      // 次回日付: 期限日があればそれを使用、なければ今日
      const dueHidden = document.getElementById('modal-due');
      const nextDate  = dueHidden?.value || new Date().toISOString().slice(0, 10);
      const rec = { interval: interval?.value || 'weekly', next_date: nextDate };
      await db.updateTask(taskId, { recurring: rec });
      // キャッシュ更新
      for (const col of getColumnKeys()) {
        const t = (State.tasks[col] || []).find(t => t.id === taskId);
        if (t) { t.recurring = rec; break; }
      }
    } else {
      intervalWrap?.setAttribute('hidden', '');
      await db.updateTask(taskId, { recurring: null });
      for (const col of getColumnKeys()) {
        const t = (State.tasks[col] || []).find(t => t.id === taskId);
        if (t) { t.recurring = null; break; }
      }
    }
    markDirty();
    await Renderer.refreshCard(taskId, db);
  },

  /** 繰り返しインターバル変更 */
  async _onRecurringIntervalChange(e, db) {
    if (!State.currentTaskId) return;
    const taskId   = State.currentTaskId;
    const interval = e.target.value;
    for (const col of getColumnKeys()) {
      const t = (State.tasks[col] || []).find(t => t.id === taskId);
      if (t && t.recurring) {
        t.recurring.interval = interval;
        await db.updateTask(taskId, { recurring: t.recurring });
        break;
      }
    }
    markDirty();
  },

  // ---- チェックリスト ----

  /** チェックリスト項目を追加 */
  async _onAddChecklistItem(db) {
    const input  = document.getElementById('checklist-new-input');
    const text   = input?.value.trim();
    if (!text || !State.currentTaskId) return;
    const taskId = State.currentTaskId;

    for (const col of getColumnKeys()) {
      const t = (State.tasks[col] || []).find(t => t.id === taskId);
      if (t) {
        const checklist = t.checklist || [];
        const newItem   = { id: Date.now(), text, done: false, position: checklist.length };
        checklist.push(newItem);
        t.checklist = checklist;
        await db.updateTask(taskId, { checklist });
        try { await db.addActivity(taskId, 'checklist_add', { text }); } catch {}
        if (State.timelineFilter === 'all') Renderer.renderComments(taskId, db).catch(() => {});
        markDirty();
        Renderer.renderChecklist(t);
        await Renderer.refreshCard(taskId, db);
        break;
      }
    }

    if (input) { input.value = ''; input.focus(); }
  },

  // ---- 依存関係 ----

  /** 依存ピッカーを開く */
  async _onPickDep(mode, btn, db) {
    if (!State.currentTaskId) return;
    const taskId = State.currentTaskId;

    // 既存依存のIDセット
    const deps = State.dependencies.get(taskId) || { blocking: new Set(), blockedBy: new Set() };
    const excludeIds = new Set([taskId, ...deps.blocking, ...deps.blockedBy]);

    const allTasks = Object.values(State.tasks).flat();
    State._pickerDepMode       = mode;
    State._depPickerCandidates = allTasks.filter(t => !excludeIds.has(t.id));

    const picker = document.getElementById('dep-picker');
    const input  = document.getElementById('dep-picker-input');
    if (!picker || !input) return;
    input.value = '';
    this._renderDepPickerList(State._depPickerCandidates);

    const rect    = btn.getBoundingClientRect();
    const pickerW = 260;
    const left    = Math.min(rect.left, window.innerWidth - pickerW - 8);
    picker.style.top  = (rect.bottom + 4) + 'px';
    picker.style.left = Math.max(8, left) + 'px';
    picker.removeAttribute('hidden');
    input.focus();
  },

  /** 依存ピッカーのリスト描画 */
  _renderDepPickerList(tasks) {
    const list = document.getElementById('dep-picker-list');
    if (!list) return;
    list.innerHTML = '';
    if (tasks.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'task-picker__empty';
      empty.textContent = '選択可能なタスクがありません';
      list.appendChild(empty);
      return;
    }
    for (const t of tasks) {
      const col  = State.columns.find(c => c.key === t.column);
      const item = document.createElement('li');
      item.className = 'task-picker__item';
      item.dataset.action = 'select-dep-task';
      item.dataset.taskId = t.id;

      const titleEl = document.createElement('span');
      titleEl.className = 'task-picker__item-title';
      titleEl.textContent = t.title;

      const colEl = document.createElement('span');
      colEl.className = 'task-picker__item-column';
      colEl.textContent = col?.name ?? t.column;

      item.appendChild(titleEl);
      item.appendChild(colEl);
      list.appendChild(item);
    }
  },

  /** 依存ピッカーの検索フィルター */
  _filterDepPickerList(text) {
    const q = text.toLowerCase();
    const candidates = (State._depPickerCandidates || []).filter(t =>
      t.title.toLowerCase().includes(q) ||
      (State.columns.find(c => c.key === t.column)?.name ?? t.column).toLowerCase().includes(q),
    );
    this._renderDepPickerList(candidates);
  },

  /** 依存タスクを選択（循環依存チェック付き） */
  async _onSelectDepTask(btn, db) {
    const selectedId = parseInt(btn.dataset.taskId, 10);
    const taskId     = State.currentTaskId;
    const mode       = State._pickerDepMode;
    if (!selectedId || !taskId || !mode) return;

    // 循環依存チェック: DFS で selectedId から taskId に到達できるか
    const fromId = mode === 'blocker' ? selectedId : taskId;
    const toId   = mode === 'blocker' ? taskId     : selectedId;

    const hasCycle = (() => {
      // fromId → toId の方向で fromId の後続を辿って toId が既に到達できないか確認
      // つまり toId → fromId が既に存在するか（fromId が toId の後続にあるか）
      const visited = new Set();
      const stack   = [toId];
      while (stack.length) {
        const cur = stack.pop();
        if (cur === fromId) return true;
        if (visited.has(cur)) continue;
        visited.add(cur);
        const d = State.dependencies.get(cur);
        if (d) for (const id of d.blocking) stack.push(id);
      }
      return false;
    })();

    if (hasCycle) {
      Toast.error('循環依存になるため追加できません');
      return;
    }

    try {
      await db.addDependency(fromId, toId);
      // State.dependencies を更新
      if (!State.dependencies.has(fromId)) State.dependencies.set(fromId, { blocking: new Set(), blockedBy: new Set() });
      if (!State.dependencies.has(toId))   State.dependencies.set(toId,   { blocking: new Set(), blockedBy: new Set() });
      State.dependencies.get(fromId).blocking.add(toId);
      State.dependencies.get(toId).blockedBy.add(fromId);
      // アクティビティ記録（先行タスク側・後続タスク側）
      const allTasks = Object.values(State.tasks).flat();
      const fromTask = allTasks.find(t => t.id === fromId);
      const toTask   = allTasks.find(t => t.id === toId);
      try { await db.addActivity(fromId, 'dep_add', { relation: 'blocking', taskTitle: toTask?.title ?? '' }); } catch {}
      try { await db.addActivity(toId,   'dep_add', { relation: 'blockedBy', taskTitle: fromTask?.title ?? '' }); } catch {}
      if (State.timelineFilter === 'all') Renderer.renderComments(taskId, db).catch(() => {});
      markDirty();
    } catch (e) {
      console.error('依存関係の追加に失敗:', e);
    }

    this._closeDepPicker();
    await Renderer.renderDependencies(taskId, db);
    // ブロックされているカードにロックアイコンを表示
    await Renderer.refreshCard(selectedId, db);
    await Renderer.refreshCard(taskId, db);
  },

  /** 依存ピッカーを閉じる */
  _closeDepPicker() {
    const picker = document.getElementById('dep-picker');
    if (picker) picker.setAttribute('hidden', '');
    State._pickerDepMode       = null;
    State._depPickerCandidates = null;
  },

  /** 依存関係を削除 */
  async _onRemoveDependency(btn, db) {
    const fromId = parseInt(btn.dataset.depFromId, 10);
    const toId   = parseInt(btn.dataset.depToId,   10);
    if (!fromId || !toId) return;

    try {
      // DB から削除（from_task_id + to_task_id で特定）
      const allDeps = await db.getAllDependencies();
      const dep = allDeps.find(d => d.from_task_id === fromId && d.to_task_id === toId);
      if (dep) await db.deleteDependency(dep.id);

      // State キャッシュを更新
      State.dependencies.get(fromId)?.blocking.delete(toId);
      State.dependencies.get(toId)?.blockedBy.delete(fromId);
      // アクティビティ記録
      const allTasks = Object.values(State.tasks).flat();
      const fromTask = allTasks.find(t => t.id === fromId);
      const toTask   = allTasks.find(t => t.id === toId);
      try { await db.addActivity(fromId, 'dep_remove', { relation: 'blocking', taskTitle: toTask?.title ?? '' }); } catch {}
      try { await db.addActivity(toId,   'dep_remove', { relation: 'blockedBy', taskTitle: fromTask?.title ?? '' }); } catch {}
      if (State.currentTaskId && State.timelineFilter === 'all') Renderer.renderComments(State.currentTaskId, db).catch(() => {});
      markDirty();
    } catch (e) {
      console.error('依存関係の削除に失敗:', e);
    }

    if (State.currentTaskId) await Renderer.renderDependencies(State.currentTaskId, db);
    // 関連カードを再描画（ロックアイコン更新）
    Renderer.refreshCard(fromId, db).catch(() => {});
    Renderer.refreshCard(toId,   db).catch(() => {});
  },

  // ---- アーカイブ ----

  /** 完了カラム内の全タスクをアーカイブ */
  async _onArchiveColumn(btn, db) {
    const colKey = btn.dataset.columnKey;
    if (!colKey) return;
    const tasks = State.tasks[colKey] || [];
    if (tasks.length === 0) {
      Toast.show('アーカイブするタスクがありません');
      return;
    }
    if (!confirm(`「${State.columns.find(c => c.key === colKey)?.name ?? colKey}」の ${tasks.length} 件をアーカイブしますか？`)) return;

    // アーカイブ前にアクティビティを記録（archiveTask がタスクを削除する前に記録）
    for (const task of tasks) {
      try { await db.addActivity(task.id, 'archive', {}); } catch {}
    }
    await db.archiveAllInColumn(colKey);
    State.tasks[colKey] = [];
    Renderer.renderColumn(colKey, [], db);
    markDirty();
    // アクティビティログに記録
    const colName = State.columns.find(c => c.key === colKey)?.name ?? colKey;
    ActivityLogger.log('todo', 'archive', 'task', colKey, `「${colName}」の${tasks.length}件をアーカイブ`);
    Toast.success(`${tasks.length} 件をアーカイブしました`);
  },

  // ---- テンプレート管理モーダル ----

  /** テンプレート管理モーダルを開く */
  async _onOpenTemplateModal(db) {
    State.templates = sortByPosition(await db.getTemplates());
    const modal = document.getElementById('template-modal');
    if (!modal) return;
    modal.removeAttribute('hidden');
    this._renderTemplateList();
    this._renderTemplateForm(null);
  },

  /** テンプレートモーダルを閉じる */
  _closeTemplateModal() {
    const modal = document.getElementById('template-modal');
    if (modal) modal.setAttribute('hidden', '');
    State._editingTemplateId = null;
  },

  /** テンプレート一覧を描画 */
  _renderTemplateList() {
    const list = document.getElementById('template-list');
    if (!list) return;
    list.innerHTML = '';
    if (State.templates.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'template-list__empty';
      empty.textContent = 'テンプレートがありません';
      list.appendChild(empty);
      return;
    }
    for (const tpl of State.templates) {
      const item = document.createElement('li');
      item.className = 'template-list__item' + (tpl.id === State._editingTemplateId ? ' is-active' : '');
      item.dataset.action     = 'select-template-item';
      item.dataset.templateId = tpl.id;

      const name = document.createElement('span');
      name.className = 'template-list__name';
      name.textContent = tpl.name;

      const del = document.createElement('button');
      del.className = 'template-list__del btn btn--ghost btn--sm';
      del.dataset.action     = 'delete-template-item';
      del.dataset.templateId = tpl.id;
      del.textContent = '削除';

      item.appendChild(name);
      item.appendChild(del);
      list.appendChild(item);
    }
  },

  /** テンプレート編集フォームを描画 */
  _renderTemplateForm(tpl) {
    const col = document.getElementById('template-form-col');
    if (!col) return;

    if (!tpl) {
      col.innerHTML = '<p class="template-form__empty">左のリストからテンプレートを選択するか、「新規作成」をクリックしてください。</p>';
      return;
    }

    col.innerHTML = `
      <div class="template-form">
        <div class="template-form__row">
          <label class="template-form__label">テンプレート名</label>
          <input type="text" id="tpl-name" class="template-form__input" value="${escapeHtml(tpl.name || '')}" placeholder="テンプレート名を入力" />
        </div>
        <div class="template-form__row">
          <label class="template-form__label">タイトル（初期値）</label>
          <input type="text" id="tpl-title" class="template-form__input" value="${escapeHtml(tpl.title || '')}" placeholder="空白でも可" />
        </div>
        <div class="template-form__row">
          <label class="template-form__label">説明（初期値）</label>
          <textarea id="tpl-description" class="template-form__textarea" rows="4" placeholder="空白でも可">${escapeHtml(tpl.description || '')}</textarea>
        </div>
        <div class="template-form__row">
          <label class="template-form__label">チェックリスト（初期項目）</label>
          <div id="tpl-checklist-items" class="template-checklist-items"></div>
          <input type="text" id="tpl-checklist-new" class="template-form__input" placeholder="+ 項目を追加（Enter で確定）" />
        </div>
        <div class="template-form__actions">
          <button class="btn btn--primary btn--sm" id="tpl-save-btn">保存</button>
        </div>
      </div>
    `;

    // チェックリスト項目を描画
    this._renderTplChecklist(tpl.checklist || []);

    // 新規チェックリスト項目の追加
    document.getElementById('tpl-checklist-new')?.addEventListener('keydown', (e) => {
      if (e.isComposing) return;
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const inp   = document.getElementById('tpl-checklist-new');
      const text  = inp?.value.trim();
      if (!text) return;
      const items = tpl.checklist || [];
      items.push({ id: Date.now(), text, done: false, position: items.length });
      tpl.checklist = items;
      this._renderTplChecklist(items);
      if (inp) inp.value = '';
    });

    // 保存ボタン
    document.getElementById('tpl-save-btn')?.addEventListener('click', async () => {
      const name  = document.getElementById('tpl-name')?.value.trim();
      if (!name) { Toast.error('テンプレート名を入力してください'); return; }
      const updTpl = {
        ...tpl,
        name,
        title:       document.getElementById('tpl-title')?.value || '',
        description: document.getElementById('tpl-description')?.value || '',
        checklist:   tpl.checklist || [],
      };
      if (updTpl.id) {
        await _dbRef.updateTemplate(updTpl);
        const idx = State.templates.findIndex(t => t.id === updTpl.id);
        if (idx !== -1) State.templates[idx] = updTpl;
      } else {
        const saved = await _dbRef.addTemplate({ ...updTpl, position: State.templates.length });
        State.templates.push(saved);
        State._editingTemplateId = saved.id;
      }
      this._renderTemplateList();
      Toast.success('テンプレートを保存しました');
    });
  },

  /** テンプレートのチェックリスト項目を描画（管理モーダル内） */
  _renderTplChecklist(items) {
    const container = document.getElementById('tpl-checklist-items');
    if (!container) return;
    container.innerHTML = '';
    for (const item of items) {
      const row = document.createElement('div');
      row.className = 'template-checklist-item';

      const text = document.createElement('span');
      text.className = 'template-checklist-item__text';
      text.textContent = item.text;

      const del = document.createElement('button');
      del.className = 'template-checklist-item__del btn btn--ghost btn--sm';
      del.textContent = '×';
      del.addEventListener('click', () => {
        const tpl = State.templates.find(t => t.id === State._editingTemplateId);
        if (tpl) {
          tpl.checklist = (tpl.checklist || []).filter(c => c.id !== item.id);
          this._renderTplChecklist(tpl.checklist);
        } else {
          // 新規テンプレートの場合は直接削除
          items.splice(items.indexOf(item), 1);
          this._renderTplChecklist(items);
        }
      });

      row.appendChild(text);
      row.appendChild(del);
      container.appendChild(row);
    }
  },

  /** テンプレート項目を選択して編集フォームを表示 */
  async _onSelectTemplateItem(btn, db) {
    const tplId = parseInt(btn.dataset.templateId, 10);
    const tpl   = State.templates.find(t => t.id === tplId);
    if (!tpl) return;
    State._editingTemplateId = tplId;
    this._renderTemplateList();
    this._renderTemplateForm(tpl);
  },

  /** テンプレートを削除 */
  async _onDeleteTemplateItem(btn, db) {
    const tplId = parseInt(btn.dataset.templateId, 10);
    const tpl   = State.templates.find(t => t.id === tplId);
    if (!tpl) return;
    if (!confirm(`テンプレート「${tpl.name}」を削除しますか？`)) return;
    await db.deleteTemplate(tplId);
    State.templates = State.templates.filter(t => t.id !== tplId);
    if (State._editingTemplateId === tplId) {
      State._editingTemplateId = null;
      this._renderTemplateForm(null);
    }
    this._renderTemplateList();
    Toast.success('テンプレートを削除しました');
  },

  /** 新規テンプレートフォームを表示 */
  async _onNewTemplate(db) {
    State._editingTemplateId = null;
    this._renderTemplateList();
    this._renderTemplateForm({ name: '', title: '', description: '', checklist: [], position: State.templates.length });
  },

  /** 現在のタスクをテンプレートとして保存 */
  async _onSaveAsTemplate(db) {
    if (!State.currentTaskId) return;
    const taskId = State.currentTaskId;

    // タスク本体を取得
    let task = null;
    for (const col of getColumnKeys()) {
      task = (State.tasks[col] || []).find(t => t.id === taskId);
      if (task) break;
    }
    if (!task) return;

    const name = prompt('テンプレート名を入力してください:', task.title || 'テンプレート');
    if (!name?.trim()) return;

    // ラベル ID を取得
    const labelIds = [...(State.taskLabels.get(taskId) || new Set())];

    const tpl = {
      name:        name.trim(),
      title:       task.title       || '',
      description: task.description || '',
      checklist:   (task.checklist  || []).map(c => ({ ...c, done: false })),
      label_ids:   labelIds,
      position:    State.templates.length,
    };
    const saved = await db.addTemplate(tpl);
    State.templates.push(saved);
    Toast.success(`「${saved.name}」をテンプレートとして保存しました`);
  },

  // ---- アーカイブ管理モーダル ----

  /** アーカイブ管理モーダルを開く */
  async _onOpenArchiveModal(db) {
    const modal = document.getElementById('archive-modal');
    if (!modal) return;
    modal.removeAttribute('hidden');
    const input = document.getElementById('archive-search-input');
    if (input) input.value = '';
    await this._renderArchiveList('', db);
  },

  /** アーカイブモーダルを閉じる */
  _closeArchiveModal() {
    const modal = document.getElementById('archive-modal');
    if (modal) modal.setAttribute('hidden', '');
  },

  /** アーカイブ一覧を描画 */
  async _renderArchiveList(query, db) {
    const list = document.getElementById('archive-list');
    if (!list) return;
    list.innerHTML = '<li class="archive-list__loading">読み込み中...</li>';
    const archives = await db.getArchives(query);
    list.innerHTML = '';

    if (archives.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'archive-list__empty';
      empty.textContent = query ? '検索結果がありません' : 'アーカイブがありません';
      list.appendChild(empty);
      return;
    }

    for (const arc of archives) {
      const item = document.createElement('li');
      item.className = 'archive-list__item';

      const info = document.createElement('div');
      info.className = 'archive-list__info';

      const title = document.createElement('span');
      title.className = 'archive-list__title';
      title.textContent = arc.title;

      const meta = document.createElement('span');
      meta.className = 'archive-list__meta';
      const d = new Date(arc.archived_at);
      meta.textContent = `アーカイブ: ${d.toLocaleDateString('ja-JP')}`;

      info.appendChild(title);
      info.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'archive-list__actions';

      const restoreBtn = document.createElement('button');
      restoreBtn.className = 'btn btn--secondary btn--sm';
      restoreBtn.dataset.action    = 'restore-archive';
      restoreBtn.dataset.archiveId = arc.id;
      restoreBtn.textContent = '復元';

      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn--ghost-danger btn--sm';
      delBtn.dataset.action    = 'delete-archive';
      delBtn.dataset.archiveId = arc.id;
      delBtn.textContent = '削除';

      actions.appendChild(restoreBtn);
      actions.appendChild(delBtn);

      item.appendChild(info);
      item.appendChild(actions);
      list.appendChild(item);
    }
  },

  /** アーカイブを復元 */
  async _onRestoreArchive(btn, db) {
    const archiveId = parseInt(btn.dataset.archiveId, 10);
    if (!archiveId) return;

    if (!State.columns.length) { Toast.error('カラムが存在しません'); return; }

    // アーカイブレコードを先に取得して元のカラムを確認
    const archives    = await db.getArchives();
    const archived    = archives.find(a => a.id === archiveId);
    const originalCol = archived ? State.columns.find(c => c.key === archived.column) : null;
    // 元のカラムが存在すれば null を渡して元カラムへ、なければ先頭カラムへ
    const targetColKey = originalCol ? null : State.columns[0].key;

    try {
      const task = await db.restoreArchive(archiveId, targetColKey);
      const restoredColKey = task.column;
      if (!State.tasks[restoredColKey]) State.tasks[restoredColKey] = [];
      State.tasks[restoredColKey].push(task);
      _updateWipDisplay(restoredColKey);
      Renderer.renderColumn(restoredColKey, State.tasks[restoredColKey], db);
      applyFilter();
      markDirty();
      // 復元アクティビティを記録
      try { await db.addActivity(task.id, 'restore_archive', {}); } catch {}
      const colName = State.columns.find(c => c.key === restoredColKey)?.name ?? restoredColKey;
      // アクティビティログに記録
      ActivityLogger.log('todo', 'update', 'task', task.id, `タスク「${task.title || '(無題)'}」をアーカイブから復元`);
      Toast.success(`「${task.title}」を「${colName}」に復元しました`);
    } catch (e) {
      console.error('復元に失敗:', e);
      Toast.error('復元に失敗しました');
      return;
    }

    // 一覧を再描画
    const query = document.getElementById('archive-search-input')?.value || '';
    await this._renderArchiveList(query, db);
  },

  /** アーカイブを完全削除 */
  async _onDeleteArchive(btn, db) {
    const archiveId = parseInt(btn.dataset.archiveId, 10);
    if (!archiveId) return;
    if (!confirm('このアーカイブを完全に削除しますか？この操作は取り消せません。')) return;

    await db.deleteArchive(archiveId);
    markDirty();

    const query = document.getElementById('archive-search-input')?.value || '';
    await this._renderArchiveList(query, db);
  },

  /** アーカイブ検索 */
  async _onArchiveSearch(query, db) {
    await this._renderArchiveList(query, db);
  },

};

// ==================================================
// Toast 通知: js/components/toast.js の Toast を使用

// ==================================================
// App: エントリポイント
// ==================================================
const App = {
  async init() {
    // Tauri: <a target="_blank"> をネイティブで開く
    Opener.intercept(document);

    const db = new KanbanDB();
    await db.open();

    // カラムをロード
    State.columns = sortByPosition(await db.getAllColumns());

    // tasks キャッシュを動的に初期化
    for (const col of State.columns) State.tasks[col.key] = [];

    // ソート状態を localStorage から復元
    const savedSort = localStorage.getItem('kanban_sort');
    if (savedSort) {
      try { State.sort = JSON.parse(savedSort); } catch { /* 無視 */ }
    }

    // フィルター状態を localStorage から復元
    const savedFilter = localStorage.getItem('kanban_filter');
    if (savedFilter) {
      try {
        const f = JSON.parse(savedFilter);
        State.filter.text     = f.text || '';
        State.filter.labelIds = new Set(f.labelIds || []);
        State.filter.due      = f.due  || '';
      } catch { /* 無視 */ }
    }

    // ラベルキャッシュをロード（保存済み並び順を適用）
    State.labels = await db.getAllLabels();
    const _savedLabelOrder = (() => { try { return JSON.parse(localStorage.getItem('kanban_label_order') || 'null'); } catch { return null; } })();
    if (_savedLabelOrder && Array.isArray(_savedLabelOrder)) {
      const _orderMap = new Map(_savedLabelOrder.map((id, i) => [id, i]));
      State.labels.sort((a, b) => (_orderMap.has(a.id) ? _orderMap.get(a.id) : Infinity) - (_orderMap.has(b.id) ? _orderMap.get(b.id) : Infinity));
    }

    // DB 参照をモジュールレベル変数にセット（Renderer コールバック等から参照）
    _dbRef = db;

    // テンプレートキャッシュをロード
    State.templates = sortByPosition(await db.getTemplates());

    // ボードカラムを生成してからボードを描画
    Renderer.renderBoardColumns(db);
    await Renderer.renderBoard(db);

    // ドラッグ&ドロップを初期化
    DragDrop.init(db);

    // イベントハンドラを初期化
    EventHandlers.init(db);

    // 期限切れの繰り返しタスクを処理（next_date が過去のものを自動生成）
    {
      const today = new Date().toISOString().slice(0, 10);
      const allTasks = Object.values(State.tasks).flat();
      for (const t of allTasks) {
        if (t.recurring && t.recurring.next_date && t.recurring.next_date <= today) {
          const col = State.columns.find(c => c.key === t.column);
          if (col && !col.done) {
            await _handleRecurringOnDone(t, db).catch(console.error);
          }
        }
      }
    }

    // 親フレームからの navigate:todo 指示を受信してモーダルを開く
    window.addEventListener('message', async (e) => {
      const { type, todoTaskId } = e.data || {};
      if (type !== 'navigate:todo' || !todoTaskId) return;
      await Renderer.renderModal(todoTaskId, db);
    });

    // ソート選択の初期値を設定
    const sortSelect = document.getElementById('sort-select');
    if (sortSelect && State.sort.field) {
      sortSelect.value = `${State.sort.field}:${State.sort.dir}`;
    }

    // フィルターの初期値を DOM に反映（復元後に applyFilter を呼ぶ）
    document.getElementById('filter-text').value = State.filter.text;
    document.getElementById('filter-due').value  = State.filter.due;
    renderFilterLabels();
    if (State.filter.text || State.filter.labelIds.size > 0 || State.filter.due) {
      applyFilter();
    }

    // CustomSelect を初期化（初期値設定後に適用）
    CustomSelect.replaceAll(document.querySelector('.app-header'));
    const modalColSel = document.getElementById('modal-column');
    if (modalColSel) modalColSel._csInst = CustomSelect.create(modalColSel);
    const recurringIntervalSel = document.getElementById('modal-recurring-interval');
    if (recurringIntervalSel) CustomSelect.create(recurringIntervalSel);

    // 前回エクスポート後に変更があるか確認してインジケーターを初期化
    const dirtyAt  = localStorage.getItem('kanban_dirty_at')      || '';
    const exportAt = localStorage.getItem('kanban_last_export_at') || '';
    State.isDirty  = dirtyAt > exportAt;
    Backup.updateExportIndicator(State.isDirty);

    // ショートカットキー一覧登録
    ShortcutHelp.register([
      { name: 'ショートカット', shortcuts: [
        { keys: ['N'], description: '新規タスク追加' },
        { keys: ['F'], description: 'フィルタにフォーカス' },
        { keys: ['Ctrl', 'Shift', 'A'], description: '完了カラムを一括アーカイブ' },
        { keys: ['Escape'], description: 'モーダルを閉じる' },
      ]}
    ]);
  },
};

// DOMContentLoaded 後に起動
document.addEventListener('DOMContentLoaded', () => App.init());

// テーマ変更を受け取る（親フレームからの postMessage）
window.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'theme-change') {
    document.documentElement.setAttribute('data-theme', e.data.theme);
    localStorage.setItem('mytools_theme', e.data.theme);
  }
});

// グローバル検索: kanban_db の tasks を検索して結果を返す
window.addEventListener('message', async (e) => {
  const { type, query, searchId } = e.data || {};
  if (type !== 'global-search' || !query) return;

  try {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('kanban_db');
      req.onupgradeneeded = ev => { if (ev.oldVersion === 0) ev.target.transaction.abort(); };
      req.onsuccess = ev => resolve(ev.target.result);
      req.onerror = () => resolve(null);
    });
    if (!db) { parent.postMessage({ type: 'global-search-result', searchId, page: 'TODO', pageSrc: 'pages/todo.html', results: [] }, '*'); return; }

    const tasks = await new Promise((res) => {
      const req = db.transaction('tasks').objectStore('tasks').getAll();
      req.onsuccess = () => res(req.result);
      req.onerror = () => res([]);
    });
    db.close();

    const q = query.toLowerCase();
    const results = tasks
      .filter(t => t.title?.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q))
      .slice(0, 10)
      .map(t => {
        // 説明から抜粋を生成
        let excerpt = '';
        if (t.description?.toLowerCase().includes(q)) {
          const idx = t.description.toLowerCase().indexOf(q);
          const start = Math.max(0, idx - 20);
          excerpt = (start > 0 ? '…' : '') + t.description.slice(start, idx + query.length + 30);
          if (start + idx + query.length + 30 < t.description.length) excerpt += '…';
        }
        return { id: t.id, title: t.title || '', excerpt };
      });

    parent.postMessage({ type: 'global-search-result', searchId, page: 'TODO', pageSrc: 'pages/todo.html', results }, '*');
  } catch (err) {
    parent.postMessage({ type: 'global-search-result', searchId, page: 'TODO', pageSrc: 'pages/todo.html', results: [] }, '*');
  }
});

// グローバル検索フォーカス: 指定 ID のタスクモーダルを開く
window.addEventListener('message', async (e) => {
  const { type, targetId } = e.data || {};
  if (type !== 'global-search-focus' || !targetId) return;
  try {
    const dbInst = new KanbanDB();
    await dbInst.open();
    await Renderer.renderModal(targetId, dbInst);
  } catch (err) { /* ignore */ }
});
