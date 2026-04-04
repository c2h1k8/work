// ==================================================
// Renderer: DOM 描画
// ==================================================
const Renderer = {
  /** ボードのカラムを動的生成 */
  renderBoardColumns(db) {
    const board = document.getElementById('board');
    board.innerHTML = '';
    // flexbox レイアウトのため列数指定は不要（カラムは固定幅で横並び）
    for (const col of State.columns) {
      board.appendChild(this._createColumnEl(col));
    }
    board.appendChild(this._createAddColumnBtn());
    this.renderModalColumnSelect();
  },

  /** カラム section 要素を生成 */
  _createColumnEl(col) {
    const section = document.createElement('section');
    section.className = 'column';
    section.dataset.column   = col.key;
    section.dataset.columnId = col.id;

    // ヘッダー
    const header = document.createElement('div');
    header.className = 'column__header';

    const titleEl = document.createElement('span');
    titleEl.className = 'column__title';
    titleEl.textContent = col.name;
    titleEl.dataset.action    = 'rename-column';
    titleEl.dataset.columnId  = col.id;
    titleEl.dataset.columnKey = col.key;
    titleEl.setAttribute('data-tooltip', 'ダブルクリックで名前を変更');

    const actions = document.createElement('div');
    actions.className = 'column__header-actions';

    const count = document.createElement('span');
    count.className = 'column__count';
    count.dataset.count = col.key;
    count.textContent = '0';

    // 完了カラムトグルボタン（期限切れ表示を抑制するフラグ）
    const doneBtn = document.createElement('button');
    doneBtn.className = 'column__done-btn' + (col.done ? ' is-active' : '');
    doneBtn.dataset.action    = 'toggle-done-column';
    doneBtn.dataset.columnId  = col.id;
    doneBtn.dataset.columnKey = col.key;
    doneBtn.setAttribute('aria-label', col.done ? `${col.name}: 完了カラム（クリックで解除）` : `${col.name}: 完了カラムに設定`);
    doneBtn.setAttribute('data-tooltip', col.done ? '完了カラム（期限切れ非表示）' : '完了カラムに設定');
    doneBtn.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/></svg>';

    // アーカイブボタン（完了カラムのみ表示）
    const archiveBtn = document.createElement('button');
    archiveBtn.className = 'column__archive-btn' + (col.done ? '' : ' hidden-btn');
    archiveBtn.dataset.action    = 'archive-column';
    archiveBtn.dataset.columnKey = col.key;
    archiveBtn.dataset.columnId  = col.id;
    archiveBtn.setAttribute('aria-label', `${col.name}のタスクをアーカイブ`);
    archiveBtn.setAttribute('data-tooltip', '完了タスクをアーカイブ');
    archiveBtn.innerHTML = Icons.archive;

    const delBtn = document.createElement('button');
    delBtn.className = 'column__delete-btn';
    delBtn.dataset.action    = 'delete-column';
    delBtn.dataset.columnId  = col.id;
    delBtn.dataset.columnKey = col.key;
    delBtn.setAttribute('aria-label', `${col.name} を削除`);
    delBtn.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z"/></svg>';

    actions.appendChild(count);
    actions.appendChild(doneBtn);
    actions.appendChild(archiveBtn);
    actions.appendChild(delBtn);
    header.appendChild(titleEl);
    header.appendChild(actions);

    // ボディ
    const body = document.createElement('div');
    body.className = 'column__body';
    body.dataset.columnBody = col.key;

    // 追加ボタン
    const addBtn = document.createElement('button');
    addBtn.className = 'column__add-btn';
    addBtn.dataset.action = 'add-task';
    addBtn.dataset.column = col.key;
    addBtn.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z"/></svg> タスクを追加';

    // インライン追加フォーム
    const addForm = document.createElement('div');
    addForm.className = 'column__add-form';
    addForm.dataset.column = col.key;
    addForm.setAttribute('hidden', '');
    addForm.innerHTML =
      '<input type="text" class="column__add-input" placeholder="タスク名を入力…" />' +
      '<div class="column__add-actions">' +
        '<button class="btn btn--primary btn--sm" data-action="confirm-add-task" data-column="' + escapeHtml(col.key) + '">追加</button>' +
        '<button class="btn btn--ghost btn--sm" data-action="cancel-add-task" data-column="' + escapeHtml(col.key) + '">キャンセル</button>' +
      '</div>';

    section.appendChild(header);
    section.appendChild(body);
    section.appendChild(addForm);
    section.appendChild(addBtn);
    return section;
  },

  /** カラム追加ボタンを生成 */
  _createAddColumnBtn() {
    const btn = document.createElement('button');
    btn.className = 'add-column-btn';
    btn.dataset.action = 'add-column';
    btn.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z"/></svg> カラムを追加';
    return btn;
  },

  /** モーダルのカラム選択肢を動的生成 */
  renderModalColumnSelect() {
    const select = document.getElementById('modal-column');
    if (!select) return;
    const currentVal = select.value;
    select.innerHTML = '';
    for (const col of State.columns) {
      const opt = document.createElement('option');
      opt.value = col.key;
      opt.textContent = col.name;
      select.appendChild(opt);
    }
    // 以前の選択値を復元（存在する場合）
    if ([...select.options].some(o => o.value === currentVal)) {
      select.value = currentVal;
    }
    // CustomSelect の表示を更新
    if (select._csInst) select._csInst.render();
  },

  /** ボード全体を描画（初回・インポート後用） */
  async renderBoard(db) {
    // taskLabels キャッシュを再構築（フィルター用）
    const allTls = await db._getAll('task_labels');
    State.taskLabels = new Map();
    for (const tl of allTls) {
      if (!State.taskLabels.has(tl.task_id)) State.taskLabels.set(tl.task_id, new Set());
      State.taskLabels.get(tl.task_id).add(tl.label_id);
    }

    // コメントキャッシュを再構築（テキスト検索用）
    const allComments = await db._getAll('comments');
    State.comments = new Map();
    for (const c of allComments) {
      if (!State.comments.has(c.task_id)) State.comments.set(c.task_id, []);
      State.comments.get(c.task_id).push(c.body);
    }

    // 依存関係キャッシュを再構築
    const allDeps = await db.getAllDependencies().catch(() => []);
    State.dependencies = new Map();
    for (const dep of allDeps) {
      if (!State.dependencies.has(dep.from_task_id)) {
        State.dependencies.set(dep.from_task_id, { blocking: new Set(), blockedBy: new Set() });
      }
      if (!State.dependencies.has(dep.to_task_id)) {
        State.dependencies.set(dep.to_task_id, { blocking: new Set(), blockedBy: new Set() });
      }
      // from がブロッカー → to の blockedBy に from を追加
      State.dependencies.get(dep.to_task_id).blockedBy.add(dep.from_task_id);
      // to がブロックされる → from の blocking に to を追加
      State.dependencies.get(dep.from_task_id).blocking.add(dep.to_task_id);
    }

    for (const col of State.columns) {
      const tasks = await db.getTasksByColumn(col.key);
      State.tasks[col.key] = tasks;
      this.renderColumn(col.key, tasks, db);
    }
    applyFilter();
  },

  /** 1カラムを描画（ソート適用済み） */
  renderColumn(column, tasks, db) {
    const body  = document.querySelector(`[data-column-body="${column}"]`);
    if (!body) return;

    // ソートを適用
    const sorted = sortTasksArray(tasks, State.sort);

    // カード描画
    body.innerHTML = '';
    for (const task of sorted) {
      body.appendChild(this.createCard(task, db));
    }

    // WIP バッジ更新
    _updateWipDisplay(column);
  },

  /** カード要素を生成 */
  createCard(task, db) {
    const tpl  = document.getElementById('tpl-card');
    const card = tpl.content.cloneNode(true).querySelector('.card');

    card.dataset.id = task.id;

    // タイトル
    card.querySelector('.card__title').textContent = task.title;

    // 期限（完了カラムでは期限切れスタイルを抑制）
    const dueEl = card.querySelector('.card__due');
    if (task.due_date) {
      const isDoneCol = State.columns.find(c => c.key === task.column)?.done;
      const { text, cls } = this._getDueInfo(task.due_date);
      // 完了カラムでは「期限切れ」ラベル・スタイルを表示しない（日付のみ表示）
      if (isDoneCol && cls === 'card__due--overdue') {
        dueEl.textContent = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' }).format(new Date(task.due_date));
      } else {
        dueEl.textContent = text;
        if (cls) dueEl.classList.add(cls);
      }
    }

    // チェックリスト・繰り返しバッジ（タイトル直下の独立行に表示）
    const badgesEl = card.querySelector('.card__badges');
    if (task.checklist && task.checklist.length > 0) {
      const total = task.checklist.length;
      const done  = task.checklist.filter(i => i.done).length;
      const badge = document.createElement('span');
      badge.className = 'card__checklist-badge' + (done === total ? ' card__checklist-badge--done' : '');
      badge.textContent = `✓ ${done}/${total}`;
      badgesEl.appendChild(badge);
    }

    // 繰り返しバッジ
    if (task.recurring) {
      const repBadge = document.createElement('span');
      repBadge.className = 'card__repeat-badge';
      repBadge.innerHTML = Icons.repeat;
      repBadge.title = `繰り返し（${task.recurring.interval === 'daily' ? '毎日' : task.recurring.interval === 'weekly' ? '毎週' : '毎月'}）`;
      badgesEl.appendChild(repBadge);
    }

    // 依存ロックアイコン（blockedBy に未完了タスクがある場合）
    const deps = State.dependencies.get(task.id);
    if (deps && deps.blockedBy.size > 0) {
      // 完了カラムにいないタスクのうち、blockedBy に含まれるものがあるかチェック
      const doneColKeys = new Set(State.columns.filter(c => c.done).map(c => c.key));
      const allTasks = Object.values(State.tasks).flat();
      const hasBlocker = [...deps.blockedBy].some(blockerId => {
        const bt = allTasks.find(t => t.id === blockerId);
        return bt && !doneColKeys.has(bt.column);
      });
      if (hasBlocker) {
        const lockEl = document.createElement('span');
        lockEl.className = 'card__lock-badge';
        lockEl.innerHTML = Icons.lock;
        lockEl.title = '先行タスクが未完了';
        card.querySelector('.card__status').appendChild(lockEl);
      }
    }

    // ラベル（task_labels は非同期なので後から補完）
    this._appendLabels(card, task.id, db);

    return card;
  },

  /** ラベルをカードに非同期付与 */
  async _appendLabels(card, taskId, db) {
    const tls    = await db.getTaskLabels(taskId);
    const labels = State.labels;
    const labelsEl = card.querySelector('.card__labels');
    labelsEl.innerHTML = '';
    for (const tl of tls) {
      const label = labels.find(l => l.id === tl.label_id);
      if (!label) continue;
      labelsEl.appendChild(this._makeLabelChip(label));
    }
  },

  /** label-chip 要素を生成 */
  _makeLabelChip(label) {
    const chip = document.createElement('span');
    chip.className = 'label-chip';
    chip.dataset.labelId = label.id;
    chip.textContent = label.name;
    chip.style.background = label.color + '33'; // 20% 透過
    chip.style.color = label.color;
    return chip;
  },

  /** 期限テキストとスタイルクラスを返す */
  _getDueInfo(dueDateStr) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDateStr);
    due.setHours(0, 0, 0, 0);
    const diff = Math.round((due - today) / 86400000);

    const fmt = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' });
    const text = fmt.format(due);

    if (diff < 0)   return { text: `${text} (期限切れ)`, cls: 'card__due--overdue' };
    if (diff === 0) return { text: `${text} (今日)`,     cls: 'card__due--today' };
    return { text, cls: '' };
  },

  // ---- モーダル描画 ----

  /** モーダルを特定タスクで開く */
  async renderModal(taskId, db) {
    State.currentTaskId = taskId;

    const allTasks = await db.getAllTasks();
    const t        = allTasks.find(t => t.id === taskId);
    if (!t) return;

    // タイトル — 表示モードに設定
    const titleText  = document.getElementById('modal-title-text');
    const titleInput = document.getElementById('modal-title');
    const titleBtn   = document.querySelector('[data-action="edit-title"]');
    titleText.textContent = t.title;
    titleInput.value = t.title;
    titleText.removeAttribute('hidden');
    titleInput.setAttribute('hidden', '');
    if (titleBtn) titleBtn.removeAttribute('hidden');

    // 説明 — 表示モードに設定
    const descView     = document.getElementById('modal-description-view');
    const descTextarea = document.getElementById('modal-description');
    const descBtn      = document.querySelector('[data-action="edit-description"]');
    descTextarea.value = t.description || '';
    let descText = t.description || '';
    const renderDescView = () => {
      renderMarkdown(descView, descText, async (index, checked) => {
        descText = toggleCheckboxInMarkdown(descText, index, checked);
        await db.updateTask(t.id, { description: descText });
        descTextarea.value = descText;
        markDirty();
        renderDescView();
      });
    };
    renderDescView();
    descView.removeAttribute('hidden');
    descTextarea.setAttribute('hidden', '');
    if (descBtn) descBtn.removeAttribute('hidden');

    // カラム
    this.renderModalColumnSelect();
    const colSelect = document.getElementById('modal-column');
    if (colSelect) {
      colSelect.value = t.column;
      if (colSelect._csInst) colSelect._csInst.render();
    }

    // 期限（hidden input + 表示 div）
    const dueHidden  = document.getElementById('modal-due');
    const dueText    = document.getElementById('modal-due-text');
    const dueDisplay = document.getElementById('modal-due-display');
    dueHidden.value = t.due_date || '';
    if (t.due_date) {
      const [y, m, d] = t.due_date.split('-');
      dueText.textContent = `${y}/${m}/${d}`;
      dueDisplay.className = 'modal__date-display';
      const { cls } = this._getDueInfo(t.due_date);
      if (cls === 'card__due--overdue') dueDisplay.classList.add('modal__date-display--overdue');
      if (cls === 'card__due--today')   dueDisplay.classList.add('modal__date-display--today');
    } else {
      dueText.textContent = '日付を選択...';
      dueDisplay.className = 'modal__date-display';
    }

    // ラベル
    await this.renderModalLabels(taskId, db);

    // チェックリスト
    this.renderChecklist(t);

    // 繰り返し設定
    this.renderRecurring(t);

    // 依存関係
    await this.renderDependencies(taskId, db);

    // 関係タスク
    await this.renderRelations(taskId, db);

    // ノート紐づけ
    await this.renderNoteLinks(taskId, db);

    // コメント
    await this.renderComments(taskId, db);

    // パネルをスライドイン表示（offsetWidth でリフローを強制してアニメーションを確実に開始）
    const modal = document.getElementById('task-modal');
    modal.removeAttribute('hidden');
    // eslint-disable-next-line no-unused-expressions
    modal.offsetWidth;
    modal.classList.add('is-open');
  },

  /** モーダルのラベルリストを描画（適用済み + 既存ラベルピッカー） */
  async renderModalLabels(taskId, db) {
    const tls       = await db.getTaskLabels(taskId);
    const labels    = State.labels;
    const appliedIds = new Set(tls.map(tl => tl.label_id));

    // 適用済みラベル（× 付き）
    const container = document.getElementById('modal-labels');
    container.innerHTML = '';
    for (const tl of tls) {
      const label = labels.find(l => l.id === tl.label_id);
      if (!label) continue;
      const chip = document.createElement('span');
      chip.className = 'modal-label-chip';
      chip.style.background = label.color + '33';
      chip.style.color = label.color;
      chip.dataset.labelId = label.id;

      const name = document.createElement('span');
      name.textContent = label.name;

      const btn = document.createElement('button');
      btn.className = 'modal-label-chip__remove';
      btn.dataset.action  = 'remove-label';
      btn.dataset.labelId = label.id;
      btn.setAttribute('aria-label', `${label.name} を削除`);
      btn.textContent = '×';

      chip.appendChild(name);
      chip.appendChild(btn);
      container.appendChild(chip);
    }

    // 未適用の既存ラベル（クリックで追加）
    const existing = document.getElementById('modal-existing-labels');
    if (existing) {
      existing.innerHTML = '';
      for (const label of labels) {
        const chip = document.createElement('span');
        chip.className = 'modal-existing-label';
        chip.textContent = label.name;
        chip.style.background  = label.color + '22';
        chip.style.color       = label.color;
        chip.style.borderColor = label.color + '99';
        if (!appliedIds.has(label.id)) {
          chip.dataset.action  = 'pick-label';
          chip.dataset.labelId = label.id;
          chip.title = 'クリックして追加';
        } else {
          chip.classList.add('modal-existing-label--applied');
        }
        existing.appendChild(chip);
      }
    }
  },

  /** コメント／アクティビティのタイムラインを描画 */
  async renderComments(taskId, db) {
    const container  = document.getElementById('modal-comments');
    container.innerHTML = '';
    // タブ切替時に古い --timeline-h と scrollTop をリセット
    container.style.setProperty('--timeline-h', '0px');
    container.scrollTop = 0;

    const allComments = await db.getCommentsByTask(taskId);
    // 「コメント」タブでは削除済みを非表示、「すべて」タブでは削除済みも含める
    const comments = State.timelineFilter === 'all'
      ? allComments
      : allComments.filter(c => !c.deleted_at);
    const activities = State.timelineFilter === 'all'
      ? await db.getActivitiesByTask(taskId).catch(() => [])
      : [];

    // 時系列にマージ
    const items = [
      ...comments.map(c  => ({ ...c, _kind: 'comment'  })),
      ...activities.map(a => ({ ...a, _kind: 'activity' })),
    ].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    if (items.length === 0) {
      const empty = document.createElement('p');
      empty.style.cssText = 'color:var(--color-text-muted);font-size:12px;margin:0;';
      empty.textContent = State.timelineFilter === 'all'
        ? 'アクティビティはまだありません'
        : 'コメントはまだありません';
      container.appendChild(empty);
      return;
    }

    for (const item of items) {
      if (item._kind === 'comment') {
        container.appendChild(this._createCommentEl(item, db));
      } else {
        container.appendChild(this._createActivityEl(item));
      }
    }

    // レイアウト確定後に scrollHeight を取得し、縦線の高さを設定する
    // （overflow-y:auto コンテナの ::before は clientHeight にしか伸びないため）
    requestAnimationFrame(() => {
      container.style.setProperty('--timeline-h', container.scrollHeight + 'px');
    });
  },

  /** コメントアイテム DOM を生成 */
  _createCommentEl(c, db) {
    const isDeleted = !!c.deleted_at;

    const item = document.createElement('div');
    item.className = isDeleted ? 'comment-item comment-item--deleted' : 'comment-item';
    item.dataset.commentId = c.id;
    item.dataset.commentBody = c.body || ''; // 編集用に本文を保持

    const header = document.createElement('div');
    header.className = 'comment-item__header';

    const date = document.createElement('span');
    date.className = 'comment-item__date';
    date.dataset.time = c.created_at; // トグル更新用
    date.title = State.timeAbsolute ? this._relativeTime(c.created_at) : new Date(c.created_at).toLocaleString('ja-JP');
    date.textContent = this._formatTime(c.created_at);

    header.appendChild(date);

    // 削除済みの場合はバッジを表示、未削除の場合は編集・削除ボタンを表示
    if (isDeleted) {
      const badge = document.createElement('span');
      badge.className = 'comment-item__deleted-badge';
      badge.textContent = '削除済み';
      header.appendChild(badge);
    } else {
      const actions = document.createElement('div');
      actions.className = 'comment-item__header-actions';

      const edit = document.createElement('button');
      edit.className = 'comment-item__edit';
      edit.dataset.action    = 'edit-comment';
      edit.dataset.commentId = c.id;
      edit.setAttribute('aria-label', 'コメントを編集');
      edit.innerHTML = '<svg viewBox="0 0 16 16"><path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm1.414 1.06a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354l-1.086-1.086ZM11.189 6.25 9.75 4.81l-6.286 6.287a.25.25 0 0 0-.064.108l-.558 1.953 1.953-.558a.249.249 0 0 0 .108-.064l6.286-6.286Z"/></svg>';
      actions.appendChild(edit);

      const del = document.createElement('button');
      del.className = 'comment-item__delete';
      del.dataset.action    = 'delete-comment';
      del.dataset.commentId = c.id;
      del.setAttribute('aria-label', 'コメントを削除');
      del.innerHTML = '<svg viewBox="0 0 16 16"><path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z"/></svg>';
      actions.appendChild(del);

      header.appendChild(actions);
    }

    const body = document.createElement('div');
    body.className = 'comment-item__body md-body';

    if (isDeleted) {
      // 削除済みコメントはテキストのみ表示（チェックボックスは無効のまま）
      renderMarkdown(body, c.body || '');
    } else {
      let commentText = c.body || '';
      const renderCommentBody = () => {
        renderMarkdown(body, commentText, async (index, checked) => {
          commentText = toggleCheckboxInMarkdown(commentText, index, checked);
          await db.updateComment(c.id, { body: commentText });
          markDirty();
          renderCommentBody();
        });
      };
      renderCommentBody();
    }

    item.appendChild(header);
    item.appendChild(body);
    return item;
  },

  /** アクティビティアイテム DOM を生成 */
  _createActivityEl(act) {
    const item = document.createElement('div');
    item.className = 'activity-item';

    const icon = document.createElement('span');
    icon.className = 'activity-item__icon';
    icon.innerHTML = this._activityIcon(act.type);

    const text = document.createElement('span');
    text.className = 'activity-item__text';
    text.innerHTML = this._activityText(act);

    const date = document.createElement('span');
    date.className = 'activity-item__date';
    date.dataset.time = act.created_at; // トグル更新用
    date.title = State.timeAbsolute ? this._relativeTime(act.created_at) : new Date(act.created_at).toLocaleString('ja-JP');
    date.textContent = this._formatTime(act.created_at);

    item.appendChild(icon);
    item.appendChild(text);
    item.appendChild(date);
    return item;
  },

  /** アクティビティ種別ごとの SVG アイコン */
  _activityIcon(type) {
    const icons = {
      task_create:        '<svg viewBox="0 0 16 16"><path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Zm6.75.062V4.25c0 .138.112.25.25.25h2.688ZM8.75 7a.75.75 0 0 1 .75.75v1.5h1.5a.75.75 0 0 1 0 1.5h-1.5v1.5a.75.75 0 0 1-1.5 0v-1.5h-1.5a.75.75 0 0 1 0-1.5h1.5v-1.5A.75.75 0 0 1 8.75 7Z"/></svg>',
      column_change:      '<svg viewBox="0 0 16 16"><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0Zm3.78 4.75H4.22l2.97 2.97L6 8.91l3.47-3.48 3.47 3.48-1.19 1.19L8.81 7.72 8 8.53l-.81-.81-2.94 2.94L3.06 9.47 8 4.53l4.94 4.94-1.19 1.19Z" opacity=".5"/></svg>',
      label_add:          '<svg viewBox="0 0 16 16"><path d="M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.752 1.752 0 0 1 1 7.775Zm1.5 0c0 .066.026.13.073.177l6.25 6.25a.25.25 0 0 0 .354 0l5.025-5.025a.25.25 0 0 0 0-.354l-6.25-6.25a.25.25 0 0 0-.177-.073H2.75a.25.25 0 0 0-.25.25ZM6 5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z"/></svg>',
      label_remove:       '<svg viewBox="0 0 16 16"><path d="M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.752 1.752 0 0 1 1 7.775Zm1.5 0c0 .066.026.13.073.177l6.25 6.25a.25.25 0 0 0 .354 0l5.025-5.025a.25.25 0 0 0 0-.354l-6.25-6.25a.25.25 0 0 0-.177-.073H2.75a.25.25 0 0 0-.25.25ZM6 5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z"/></svg>',
      title_change:       '<svg viewBox="0 0 16 16"><path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm1.414 1.06a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354l-1.086-1.086ZM11.189 6.25 9.75 4.81l-6.286 6.287a.25.25 0 0 0-.064.108l-.558 1.953 1.953-.558a.25.25 0 0 0 .108-.064l6.286-6.286Z"/></svg>',
      description_change: '<svg viewBox="0 0 16 16"><path d="M0 3.75A.75.75 0 0 1 .75 3h14.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 3.75Zm0 4A.75.75 0 0 1 .75 7h14.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 7.75Zm0 4a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1-.75-.75Z"/></svg>',
      due_add:            '<svg viewBox="0 0 16 16"><path d="M4.75 0a.75.75 0 0 1 .75.75V2h5V.75a.75.75 0 0 1 1.5 0V2h1.25c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 13.25 16H2.75A1.75 1.75 0 0 1 1 14.25V3.75C1 2.784 1.784 2 2.75 2H4V.75A.75.75 0 0 1 4.75 0Zm0 3.5h6.5V2h-6.5v1.5ZM2.5 5v9.25c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25V5Z"/></svg>',
      due_remove:         '<svg viewBox="0 0 16 16"><path d="M4.75 0a.75.75 0 0 1 .75.75V2h5V.75a.75.75 0 0 1 1.5 0V2h1.25c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 13.25 16H2.75A1.75 1.75 0 0 1 1 14.25V3.75C1 2.784 1.784 2 2.75 2H4V.75A.75.75 0 0 1 4.75 0Zm0 3.5h6.5V2h-6.5v1.5ZM2.5 5v9.25c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25V5Z"/></svg>',
      due_change:         '<svg viewBox="0 0 16 16"><path d="M4.75 0a.75.75 0 0 1 .75.75V2h5V.75a.75.75 0 0 1 1.5 0V2h1.25c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 13.25 16H2.75A1.75 1.75 0 0 1 1 14.25V3.75C1 2.784 1.784 2 2.75 2H4V.75A.75.75 0 0 1 4.75 0Zm0 3.5h6.5V2h-6.5v1.5ZM2.5 5v9.25c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25V5Z"/></svg>',
      comment_delete:     '<svg viewBox="0 0 16 16"><path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z"/></svg>',
      comment_edit:       '<svg viewBox="0 0 16 16"><path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm1.414 1.06a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354l-1.086-1.086ZM11.189 6.25 9.75 4.81l-6.286 6.287a.25.25 0 0 0-.064.108l-.558 1.953 1.953-.558a.249.249 0 0 0 .108-.064l6.286-6.286Z"/></svg>',
      relation_add:       '<svg viewBox="0 0 16 16"><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0Zm.75 4.75a.75.75 0 0 0-1.5 0v2.5h-2.5a.75.75 0 0 0 0 1.5h2.5v2.5a.75.75 0 0 0 1.5 0v-2.5h2.5a.75.75 0 0 0 0-1.5h-2.5v-2.5Z"/></svg>',
      relation_remove:    '<svg viewBox="0 0 16 16"><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0Zm-3.25 7.25a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Z"/></svg>',
      checklist_add:      '<svg viewBox="0 0 16 16"><path d="M2.75 0h10.5C14.216 0 15 .784 15 1.75v12.5A1.75 1.75 0 0 1 13.25 16H2.75A1.75 1.75 0 0 1 1 14.25V1.75C1 .784 1.784 0 2.75 0Zm0 1.5a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25V1.75a.25.25 0 0 0-.25-.25Zm6.28 4.97-3.5 3.5a.749.749 0 0 1-1.06 0l-1.5-1.5a.749.749 0 1 1 1.06-1.06l.97.97 2.97-2.97a.749.749 0 1 1 1.06 1.06Z"/></svg>',
      checklist_remove:   '<svg viewBox="0 0 16 16"><path d="M2.75 0h10.5C14.216 0 15 .784 15 1.75v12.5A1.75 1.75 0 0 1 13.25 16H2.75A1.75 1.75 0 0 1 1 14.25V1.75C1 .784 1.784 0 2.75 0Zm0 1.5a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25V1.75a.25.25 0 0 0-.25-.25Zm5.04 7.5H4.75a.75.75 0 0 1 0-1.5h3.04v1.5Z"/></svg>',
      checklist_check:    '<svg viewBox="0 0 16 16"><path d="M2.75 0h10.5C14.216 0 15 .784 15 1.75v12.5A1.75 1.75 0 0 1 13.25 16H2.75A1.75 1.75 0 0 1 1 14.25V1.75C1 .784 1.784 0 2.75 0Zm0 1.5a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25V1.75a.25.25 0 0 0-.25-.25Zm6.28 4.97-3.5 3.5a.749.749 0 0 1-1.06 0l-1.5-1.5a.749.749 0 1 1 1.06-1.06l.97.97 2.97-2.97a.749.749 0 1 1 1.06 1.06Z"/></svg>',
      checklist_edit:     '<svg viewBox="0 0 16 16"><path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Z"/></svg>',
      dep_add:            '<svg viewBox="0 0 16 16"><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0Zm.75 4.75a.75.75 0 0 0-1.5 0v2.5h-2.5a.75.75 0 0 0 0 1.5h2.5v2.5a.75.75 0 0 0 1.5 0v-2.5h2.5a.75.75 0 0 0 0-1.5h-2.5v-2.5Z"/></svg>',
      dep_remove:         '<svg viewBox="0 0 16 16"><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0Zm-3.25 7.25a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Z"/></svg>',
      archive:            '<svg viewBox="0 0 16 16"><path d="M0 2.75C0 1.784.784 1 1.75 1h12.5c.966 0 1.75.784 1.75 1.75v1.5A1.75 1.75 0 0 1 14.25 6H1.75A1.75 1.75 0 0 1 0 4.25Zm0 4.5v6c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0 0 16 13.25v-6H0Zm6.75 1.5h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1 0-1.5Z"/></svg>',
      restore_archive:    '<svg viewBox="0 0 16 16"><path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0ZM1.5 8a6.5 6.5 0 1 1 13 0 6.5 6.5 0 0 1-13 0Zm7.25-3.25a.75.75 0 0 0-1.5 0v3.5l2 2a.75.75 0 0 0 1.06-1.06l-1.56-1.56V4.75Z"/></svg>',
    };
    return icons[type] ?? '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="4"/></svg>';
  },

  /** アクティビティ種別ごとの説明文 HTML */
  _activityText(act) {
    const c = act.content ?? {};
    const labelChip = (name, color) => {
      const bg = color + '28';
      const border = color + '60';
      return `<span class="label-chip" style="background:${bg};color:${color};border:1px solid ${border};font-size:11px;">${name}</span>`;
    };
    const fmtDate = (iso) => {
      if (!iso) return '（なし）';
      const [y, m, d] = iso.split('-');
      return `${y}/${m}/${d}`;
    };
    switch (act.type) {
      case 'task_create':
        return 'タスクを作成';
      case 'column_change':
        return `カラムを「${c.from}」→「${c.to}」に変更`;
      case 'label_add':
        return `ラベル ${labelChip(c.name, c.color)} を追加`;
      case 'label_remove':
        return `ラベル ${labelChip(c.name, c.color)} を削除`;
      case 'title_change':
        return `タイトルを「${c.to}」に変更`;
      case 'description_change':
        return '説明を更新';
      case 'due_add':
        return `期限を「${fmtDate(c.to)}」に設定`;
      case 'due_remove':
        return '期限を解除';
      case 'due_change':
        return `期限を「${fmtDate(c.from)}」→「${fmtDate(c.to)}」に変更`;
      case 'comment_delete':
        return 'コメントを削除';
      case 'comment_edit':
        return 'コメントを編集';
      case 'relation_add': {
        const roleLabel = { parent: '親タスク', child: '子タスク', related: '関連タスク' }[c.role] ?? '関係タスク';
        return `${roleLabel}「${c.with_title ?? ''}」を紐づけ`;
      }
      case 'relation_remove': {
        const roleLabel = { parent: '親タスク', child: '子タスク', related: '関連タスク' }[c.role] ?? '関係タスク';
        return `${roleLabel}の紐づけを解除`;
      }
      case 'checklist_add':
        return `チェックリスト「${c.text ?? ''}」を追加`;
      case 'checklist_remove':
        return `チェックリスト「${c.text ?? ''}」を削除`;
      case 'checklist_check':
        return c.done
          ? `チェックリスト「${c.text ?? ''}」を完了へ`
          : `チェックリスト「${c.text ?? ''}」を未完了へ`;
      case 'checklist_edit':
        return `チェックリスト「${c.from ?? ''}」→「${c.to ?? ''}」に変更`;
      case 'dep_add':
        return c.relation === 'blocking'
          ? `先行タスク「${c.taskTitle ?? ''}」を設定`
          : `後続タスク「${c.taskTitle ?? ''}」を設定`;
      case 'dep_remove':
        return c.relation === 'blocking'
          ? `先行タスク「${c.taskTitle ?? ''}」の依存を解除`
          : `後続タスク「${c.taskTitle ?? ''}」の依存を解除`;
      case 'archive':
        return 'アーカイブへ移動';
      case 'restore_archive':
        return 'アーカイブから復元';
      default:
        return '変更';
    }
  },

  /** ISO 日時を相対時刻テキストに変換（例: 3分前 / 昨日） */
  _relativeTime(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const sec  = Math.floor(diff / 1000);
    if (sec < 60)  return 'たった今';
    const min = Math.floor(sec / 60);
    if (min < 60)  return `${min}分前`;
    const h   = Math.floor(min / 60);
    if (h < 24)    return `${h}時間前`;
    const d   = Math.floor(h / 24);
    if (d === 1)   return '昨日';
    if (d < 30)    return `${d}日前`;
    const m   = Math.floor(d / 30);
    if (m < 12)    return `${m}ヶ月前`;
    return `${Math.floor(m / 12)}年前`;
  },

  /** State.timeAbsolute に応じて相対/絶対時刻を返す */
  _formatTime(iso) {
    if (State.timeAbsolute) {
      return new Date(iso).toLocaleString('ja-JP', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
      });
    }
    return this._relativeTime(iso);
  },

  /** カードを1枚だけ更新（全体再描画を避ける） */
  async refreshCard(taskId, db) {
    const allTasks = await db.getAllTasks();
    const task = allTasks.find(t => t.id === taskId);
    if (!task) return;

    const oldCard = document.querySelector(`.card[data-id="${taskId}"]`);
    if (!oldCard) return;

    const newCard = this.createCard(task, db);
    oldCard.parentNode.replaceChild(newCard, oldCard);
  },

  /** サイドバーの関係タスクセクションを描画 */
  async renderRelations(taskId, db) {
    const { parent, children, related } = await db.getRelationsByTask(taskId).catch(() => ({ parent: null, children: [], related: [] }));

    // 親タスク
    const parentEl  = document.getElementById('modal-parent-task');
    const pickParentBtn = document.querySelector('[data-action="pick-parent"]');
    if (parentEl) {
      parentEl.innerHTML = '';
      if (parent) {
        parentEl.appendChild(this._createRelationChip(parent.task, parent.relationId, 'parent', db));
        if (pickParentBtn) pickParentBtn.hidden = true;
      } else {
        if (pickParentBtn) pickParentBtn.hidden = false;
      }
    }

    // 子タスク
    const childrenEl = document.getElementById('modal-child-tasks');
    if (childrenEl) {
      childrenEl.innerHTML = '';
      for (const c of children) {
        childrenEl.appendChild(this._createRelationChip(c.task, c.relationId, 'child', db));
      }
    }

    // 関連タスク
    const relatedEl = document.getElementById('modal-related-tasks');
    if (relatedEl) {
      relatedEl.innerHTML = '';
      for (const r of related) {
        relatedEl.appendChild(this._createRelationChip(r.task, r.relationId, 'related', db));
      }
    }
  },

  /** 関係チップ要素を生成 */
  _createRelationChip(task, relationId, role, db) {
    const col = State.columns.find(c => c.key === task.column);

    const chip = document.createElement('div');
    chip.className = 'relation-chip';
    chip.dataset.action = 'open-related-task';
    chip.dataset.taskId = task.id;

    const title = document.createElement('span');
    title.className = 'relation-chip__title';
    title.textContent = task.title;
    title.title = task.title;

    const colBadge = document.createElement('span');
    colBadge.className = 'relation-chip__column';
    colBadge.textContent = col?.name ?? task.column;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'relation-chip__remove';
    removeBtn.dataset.action = 'remove-relation';
    removeBtn.dataset.relationId = relationId;
    removeBtn.dataset.role = role;
    removeBtn.dataset.relatedTaskId = task.id;
    removeBtn.textContent = '×';
    removeBtn.setAttribute('aria-label', '紐づきを解除');
    removeBtn.title = '紐づきを解除';

    chip.appendChild(title);
    chip.appendChild(colBadge);
    chip.appendChild(removeBtn);
    return chip;
  },

  /** カウントバッジを更新 */
  updateCount(column) {
    _updateWipDisplay(column);
  },

  /** チェックリストを描画・初期化 */
  renderChecklist(task) {
    const container = document.getElementById('modal-checklist-items');
    if (!container) return;
    container.innerHTML = '';

    // 既存の SortableJS を破棄（ドラッグ並べ替えは廃止）
    if (State._checklistSortable) {
      State._checklistSortable.destroy();
      State._checklistSortable = null;
    }

    const items = task.checklist || [];
    const doneCount = items.filter(i => i.done).length;
    const pct = items.length > 0 ? Math.round((doneCount / items.length) * 100) : 0;

    // プログレスバーを更新
    const progressEl   = document.getElementById('checklist-progress');
    const progressFill = document.getElementById('checklist-progress-fill');
    const progressText = document.getElementById('checklist-progress-text');
    if (progressEl) {
      if (items.length > 0) {
        progressEl.removeAttribute('hidden');
        if (progressFill) progressFill.style.width = pct + '%';
        if (progressText) progressText.textContent = `${doneCount} / ${items.length}`;
      } else {
        progressEl.setAttribute('hidden', '');
      }
    }

    for (const item of items) {
      container.appendChild(this._createChecklistItemEl(item, task));
    }
  },

  /** チェックリスト1項目のDOM要素を生成（丸チェックアイコン＋ラベル）*/
  _createChecklistItemEl(item, task) {
    const row = document.createElement('div');
    row.className = 'checklist-item' + (item.done ? ' is-checked' : '');
    row.dataset.itemId = item.id;

    // 丸チェックアイコン
    const checkIcon = document.createElement('span');
    checkIcon.className = 'checklist-check-icon';
    checkIcon.innerHTML = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="2,6.5 4.5,9 10,3"/></svg>';

    // ラベル
    const label = document.createElement('span');
    label.className = 'checklist-label';
    label.textContent = item.text;

    // 削除ボタン
    const delBtn = document.createElement('button');
    delBtn.className = 'checklist-item__del';
    delBtn.innerHTML = Icons.close;
    delBtn.setAttribute('aria-label', '削除');
    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const taskId = State.currentTaskId;
      for (const col of Object.keys(State.tasks)) {
        const t = (State.tasks[col] || []).find(t => t.id === taskId);
        if (t) {
          t.checklist = (t.checklist || []).filter(c => c.id !== item.id);
          await _dbRef.updateTask(taskId, { checklist: t.checklist });
          try { await _dbRef.addActivity(taskId, 'checklist_remove', { text: item.text }); } catch {}
          if (State.timelineFilter === 'all') Renderer.renderComments(taskId, _dbRef).catch(() => {});
          markDirty();
          Renderer.renderChecklist(t);
          await Renderer.refreshCard(taskId, _dbRef);
          break;
        }
      }
    });

    // 行クリックでチェック切り替え
    row.addEventListener('click', async (e) => {
      if (e.target.closest('.checklist-item__del') || e.target.closest('.checklist-item__edit-input')) return;
      const taskId = State.currentTaskId;
      item.done = !item.done;
      row.classList.toggle('is-checked', item.done);
      for (const col of Object.keys(State.tasks)) {
        const t = (State.tasks[col] || []).find(t => t.id === taskId);
        if (t) {
          const ci = (t.checklist || []).find(c => c.id === item.id);
          if (ci) ci.done = item.done;
          await _dbRef.updateTask(taskId, { checklist: t.checklist });
          try { await _dbRef.addActivity(taskId, 'checklist_check', { text: item.text, done: item.done }); } catch {}
          if (State.timelineFilter === 'all') Renderer.renderComments(taskId, _dbRef).catch(() => {});
          markDirty();
          // プログレスバーを再計算
          Renderer.renderChecklist(t);
          await Renderer.refreshCard(taskId, _dbRef);
          break;
        }
      }
    });

    // ラベルクリックでインライン編集
    label.addEventListener('click', (e) => {
      e.stopPropagation();
      const oldText = item.text;
      const inp = document.createElement('input');
      inp.type  = 'text';
      inp.value = item.text;
      inp.className = 'checklist-item__edit-input';
      label.replaceWith(inp);
      inp.focus();
      inp.select();
      const commit = async () => {
        const newText = inp.value.trim();
        if (newText) item.text = newText;
        inp.replaceWith(label);
        label.textContent = item.text;
        const taskId = State.currentTaskId;
        for (const col of Object.keys(State.tasks)) {
          const t = (State.tasks[col] || []).find(t => t.id === taskId);
          if (t) {
            const ci = (t.checklist || []).find(c => c.id === item.id);
            if (ci) ci.text = item.text;
            await _dbRef.updateTask(taskId, { checklist: t.checklist });
            if (newText && newText !== oldText) {
              try { await _dbRef.addActivity(taskId, 'checklist_edit', { from: oldText, to: newText }); } catch {}
              if (State.timelineFilter === 'all') Renderer.renderComments(taskId, _dbRef).catch(() => {});
            }
            markDirty();
            break;
          }
        }
      };
      inp.addEventListener('blur', commit);
      inp.addEventListener('keydown', (e) => {
        if (e.isComposing) return;
        if (e.key === 'Enter')  { e.preventDefault(); inp.blur(); }
        if (e.key === 'Escape') { inp.value = item.text; inp.blur(); }
      });
    });

    row.appendChild(checkIcon);
    row.appendChild(label);
    row.appendChild(delBtn);
    return row;
  },

  /** 繰り返し設定を描画 */
  renderRecurring(task) {
    const toggle       = document.getElementById('modal-recurring-toggle');
    const interval     = document.getElementById('modal-recurring-interval');
    const intervalWrap = document.getElementById('modal-recurring-interval-wrap');
    if (!toggle || !interval) return;
    const rec = task.recurring;
    toggle.checked = !!rec;
    if (rec) {
      intervalWrap?.removeAttribute('hidden');
      interval.value = rec.interval || 'weekly';
      if (interval._csInst) interval._csInst.render();
    } else {
      intervalWrap?.setAttribute('hidden', '');
    }
  },

  /** 依存関係セクションを描画 */
  async renderDependencies(taskId, db) {
    const blockersCont = document.getElementById('modal-dep-blockers');
    const blockedCont  = document.getElementById('modal-dep-blocked');
    if (!blockersCont || !blockedCont) return;

    blockersCont.innerHTML = '';
    blockedCont.innerHTML  = '';

    const deps = State.dependencies.get(taskId);
    const allTasks = Object.values(State.tasks).flat();

    if (deps) {
      // 先行タスク（blockedBy）
      for (const blockerId of deps.blockedBy) {
        const t = allTasks.find(t => t.id === blockerId);
        if (t) blockersCont.appendChild(this._createDepChip(t, taskId, 'blocker', db));
      }
      // 後続タスク（blocking）
      for (const blockedId of deps.blocking) {
        const t = allTasks.find(t => t.id === blockedId);
        if (t) blockedCont.appendChild(this._createDepChip(t, taskId, 'blocked', db));
      }
    }
  },

  /** 依存関係チップ要素を生成 */
  _createDepChip(task, currentTaskId, mode, db) {
    const col  = State.columns.find(c => c.key === task.column);
    const chip = document.createElement('div');
    chip.className = 'relation-chip';
    chip.dataset.action = 'open-related-task';
    chip.dataset.taskId = task.id;

    const title = document.createElement('span');
    title.className = 'relation-chip__title';
    title.textContent = task.title;
    title.title = task.title;

    const colBadge = document.createElement('span');
    colBadge.className = 'relation-chip__column';
    colBadge.textContent = col?.name ?? task.column;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'relation-chip__remove';
    removeBtn.dataset.action = 'remove-dependency';
    removeBtn.dataset.depFromId = mode === 'blocker' ? task.id : currentTaskId;
    removeBtn.dataset.depToId   = mode === 'blocker' ? currentTaskId : task.id;
    removeBtn.textContent = '×';
    removeBtn.setAttribute('aria-label', '依存関係を解除');

    chip.appendChild(title);
    chip.appendChild(colBadge);
    chip.appendChild(removeBtn);
    return chip;
  },

  /** ノート紐づけセクションを描画 */
  async renderNoteLinks(taskId, db) {
    const container = document.getElementById('modal-note-links');
    if (!container) return;
    container.innerHTML = '';

    const links = await db.getNoteLinksByTodo(taskId).catch(() => []);
    if (links.length === 0) return;

    // note_db からノートタスク情報を取得
    let noteTasks = [];
    try {
      const noteDb = await _openNoteDB();
      noteTasks = await new Promise((resolve, reject) => {
        const req = noteDb.transaction('tasks').objectStore('tasks').getAll();
        req.onsuccess = e => resolve(e.target.result);
        req.onerror   = e => reject(e.target.error);
      });
      noteDb.close();
    } catch (e) { /* note_db が未作成の場合は無視 */ }

    const taskMap = new Map(noteTasks.map(t => [t.id, t]));

    for (const link of links) {
      const noteTask = taskMap.get(link.note_task_id);
      const chip = document.createElement('div');
      chip.className = 'relation-chip';
      chip.dataset.action    = 'open-note-task';
      chip.dataset.noteTaskId = link.note_task_id;

      const title = document.createElement('span');
      title.className = 'relation-chip__title';
      title.textContent = noteTask ? noteTask.title : `(ID: ${link.note_task_id})`;
      title.title = noteTask ? `ノートで開く: ${noteTask.title}` : '';

      const removeBtn = document.createElement('button');
      removeBtn.className = 'relation-chip__remove';
      removeBtn.dataset.action = 'remove-note-link';
      removeBtn.dataset.linkId = link.id;
      removeBtn.dataset.noteTaskId = link.note_task_id;
      removeBtn.textContent = '×';
      removeBtn.setAttribute('aria-label', '紐づきを解除');
      removeBtn.title = '紐づきを解除';

      chip.appendChild(title);
      chip.appendChild(removeBtn);
      container.appendChild(chip);
    }
  },
};
