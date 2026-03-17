// ==================================================
// Kanban Board — Vanilla JS + IndexedDB
// ==================================================
// DB層: js/db/kanban_db.js の KanbanDB クラスを参照

// ==================================================
// State: グローバル状態
// ==================================================
const State = {
  currentTaskId: null,   // モーダルで開いているタスクの ID
  tasks:     {},         // 列別キャッシュ（動的、col.key → task[]）
  columns:   [],         // { id, key, name, position }[] 位置順
  labels:    [],         // 全ラベルキャッシュ
  sortables: [],         // SortableJS インスタンス
  isDirty:   false,      // 前回エクスポート後に変更があるか
  taskLabels: new Map(), // taskId → Set<labelId>（フィルター用キャッシュ）
  comments:  new Map(), // taskId → string[]（コメント本文、テキスト検索用キャッシュ）
  _labelFilterInst: null,                                     // LabelFilter コンポーネントインスタンス
  filter:         { text: '', labelIds: new Set(), due: '' }, // フィルター状態
  sort:           { field: '', dir: 'asc' },                  // ソート状態
  timelineFilter: 'comments',                                 // 'comments' | 'all'
  timeAbsolute:   false,                                      // 時刻表示形式（false=相対, true=絶対）
  newlyCreatedTaskId: null,                                   // 新規作成直後のタスクID（初回編集をアクティビティに記録しない）
  _descriptionBeforeEdit: null,                              // 説明編集開始時の元テキスト（変更なし判定用）
};

// ==================================================
// Helper: 現在のカラムキー一覧を返す
// ==================================================
function getColumnKeys() {
  return State.columns.map(c => c.key);
}

// ==================================================
// Helper: タスク配列をソート（条件なしはそのまま返す）
// ==================================================
function sortTasksArray(tasks, sort) {
  if (!sort.field) return tasks;
  return [...tasks].sort((a, b) => {
    let av = a[sort.field] || '';
    let bv = b[sort.field] || '';
    if (sort.field === 'due_date') {
      if (!av && !bv) return 0;
      if (!av) return 1;   // 期限なしは末尾
      if (!bv) return -1;
    }
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sort.dir === 'desc' ? -cmp : cmp;
  });
}

// ==================================================
// Helper: テキスト内の URL を <a> リンクに変換して要素に挿入
// ==================================================
function renderTextWithLinks(el, text) {
  el.innerHTML = '';
  if (!text) return;
  const urlRe = /https?:\/\/[^\s<>"']+/g;
  let last = 0;
  let m;
  while ((m = urlRe.exec(text)) !== null) {
    if (m.index > last) {
      el.appendChild(document.createTextNode(text.slice(last, m.index)));
    }
    const a = document.createElement('a');
    a.href = m[0];
    a.textContent = m[0];
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    el.appendChild(a);
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    el.appendChild(document.createTextNode(text.slice(last)));
  }
}

// ==================================================
// Helper: マークダウン内の n 番目のチェックボックスを書き換える
// ==================================================
function toggleCheckboxInMarkdown(text, index, checked) {
  let count = 0;
  return text.replace(/- \[(x| )\]/gi, (match) => {
    if (count++ === index) return checked ? '- [x]' : '- [ ]';
    return match;
  });
}

// ==================================================
// Helper: マークダウンを HTML に変換して要素に挿入
// onCheckboxChange が渡された場合はチェックボックスをインタラクティブにする
// ==================================================
function renderMarkdown(el, text, onCheckboxChange = null) {
  el.innerHTML = '';
  if (!text) return;
  el.innerHTML = marked.parse(text, { breaks: true });
  if (onCheckboxChange) {
    el.querySelectorAll('input[type="checkbox"]').forEach((cb, index) => {
      cb.removeAttribute('disabled');
      cb.addEventListener('change', () => onCheckboxChange(index, cb.checked));
    });
  }
}

// ==================================================
// Helper: md-editor を write タブ表示にリセットする
// ==================================================
function _resetMdEditor(editor) {
  if (!editor) return;
  const textarea = editor.querySelector('textarea');
  const preview  = editor.querySelector('.md-editor__preview');
  editor.querySelectorAll('.md-editor__tab').forEach(t => {
    t.classList.toggle('is-active', t.dataset.tab === 'write');
  });
  if (textarea) textarea.removeAttribute('hidden');
  if (preview)  preview.setAttribute('hidden', '');
}

// ==================================================
// BroadcastChannel: ノートリンク変更をノートページに通知（非対応環境は null）
// ==================================================
let _noteLinksBC = null;
try { _noteLinksBC = new BroadcastChannel('kanban-note-links'); } catch (e) {}

// ==================================================
// Helper: note_db を読み取り専用で開く
// ==================================================
function _openNoteDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('note_db');
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

// ==================================================
// Helper: エクスポート後の変更フラグを立てる
// ==================================================
function markDirty() {
  State.isDirty = true;
  localStorage.setItem('kanban_dirty_at', new Date().toISOString());
  Backup.updateExportIndicator(true);
}

// ==================================================
// Helper: フィルター状態を localStorage に保存
// ==================================================
function saveFilterState() {
  localStorage.setItem('kanban_filter', JSON.stringify({
    text:     State.filter.text,
    labelIds: [...State.filter.labelIds],
    due:      State.filter.due,
  }));
}

// ==================================================
// Helper: フィルターをボード全体に適用
// ==================================================
function applyFilter() {
  const text   = State.filter.text.toLowerCase();
  const ids    = State.filter.labelIds;
  const due    = State.filter.due;
  const active = text !== '' || ids.size > 0 || due !== '';

  const today = new Date(); today.setHours(0, 0, 0, 0);

  for (const col of getColumnKeys()) {
    const body = document.querySelector(`[data-column-body="${col}"]`);
    if (!body) continue;
    let visible = 0;

    for (const card of body.querySelectorAll('.card[data-id]')) {
      const taskId = parseInt(card.dataset.id, 10);
      const task   = (State.tasks[col] || []).find(t => t.id === taskId);

      // テキスト検索（タイトル・説明・コメント）
      let textOk = true;
      if (text) {
        const title    = (task?.title       || '').toLowerCase();
        const desc     = (task?.description || '').toLowerCase();
        const comments = (State.comments.get(taskId) || []).join(' ').toLowerCase();
        textOk = title.includes(text) || desc.includes(text) || comments.includes(text);
      }

      // ラベルフィルター
      let labelOk = true;
      if (ids.size > 0) {
        const cardIds = State.taskLabels.get(taskId) || new Set();
        labelOk = [...ids].some(id => cardIds.has(id));
      }

      // 期限フィルター
      let dueOk = true;
      if (due) {
        const taskDue = task?.due_date ? new Date(task.due_date + 'T00:00:00') : null;
        switch (due) {
          case 'has_due':  dueOk = !!taskDue; break;
          case 'no_due':   dueOk = !taskDue;  break;
          case 'overdue': {
            // 完了カラムは期限切れ表示を抑制しているため、フィルターからも除外する
            const isDoneCol = State.columns.find(c => c.key === col)?.done;
            dueOk = !!taskDue && taskDue < today && !isDoneCol;
            break;
          }
          case 'today':    dueOk = !!taskDue && taskDue.getTime() === today.getTime(); break;
          case 'week': {
            const endOfWeek = new Date(today);
            endOfWeek.setDate(today.getDate() + (6 - today.getDay()));
            dueOk = !!taskDue && taskDue >= today && taskDue <= endOfWeek;
            break;
          }
          case 'month': {
            const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            dueOk = !!taskDue && taskDue >= today && taskDue <= endOfMonth;
            break;
          }
        }
      }

      const show = textOk && labelOk && dueOk;
      card.style.display = show ? '' : 'none';
      if (show) visible++;
    }

    const count = document.querySelector(`[data-count="${col}"]`);
    if (count) count.textContent = active ? visible : (State.tasks[col] || []).length;
  }

  const clearBtn = document.getElementById('filter-clear');
  if (clearBtn) clearBtn.hidden = !active;
}

// ==================================================
// Helper: ラベルフィルタードロップダウンを再描画（LabelFilter コンポーネント使用）
// ==================================================
function renderFilterLabels() {
  if (!State._labelFilterInst) return;
  State._labelFilterInst.update(
    State.labels.map(l => ({ id: l.id, name: l.name, color: l.color })),
    State.filter.labelIds,
  );
}

// ==================================================
// Backup: エクスポート／インポート
// ==================================================
const Backup = {
  /** IndexedDB の全データを JSON ファイルとしてダウンロード */
  async export(db) {
    const data = await db.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href: url,
      download: (() => { const n = new Date(), p = x => String(x).padStart(2,'0'); return `kanban_backup_${n.getFullYear()}${p(n.getMonth()+1)}${p(n.getDate())}_${p(n.getHours())}${p(n.getMinutes())}${p(n.getSeconds())}.json`; })(),
    });
    a.click();
    URL.revokeObjectURL(url);
    // エクスポート日時を保存してインジケーターを消す
    localStorage.setItem('kanban_last_export_at', new Date().toISOString());
    State.isDirty = false;
    this.updateExportIndicator(false);
    Toast.show('バックアップをエクスポートしました', 'success');
  },

  /** JSON ファイルを選択して IndexedDB を上書き復元 */
  import(db) {
    const input = Object.assign(document.createElement('input'), {
      type: 'file', accept: '.json,application/json',
    });
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!data.version || !Array.isArray(data.tasks)) throw new Error('フォーマットが不正です');
        if (!confirm('現在のデータを削除してバックアップを復元しますか？')) return;
        await db.importAll(data);

        // カラムキャッシュ再構築
        State.columns = sortByPosition(await db.getAllColumns());
        State.tasks = {};
        for (const col of State.columns) State.tasks[col.key] = [];

        // ラベルキャッシュ再構築 → ボード再描画 → D&D 再初期化
        State.labels = await db.getAllLabels();
        Renderer.renderBoardColumns(db);
        await Renderer.renderBoard(db);
        renderFilterLabels();
        for (const s of State.sortables) s.destroy();
        DragDrop.init(db);

        // インポート直後はクリーンな状態とみなす
        localStorage.setItem('kanban_last_export_at', new Date().toISOString());
        State.isDirty = false;
        this.updateExportIndicator(false);
        Toast.show('バックアップを復元しました', 'success');
      } catch (err) {
        Toast.show('復元失敗: ' + err.message, 'error');
      }
    };
    input.click();
  },

  /** エクスポートボタンに未保存変更インジケーターを表示／非表示 */
  updateExportIndicator(dirty) {
    const btn = document.querySelector('[data-action="export-backup"]');
    if (btn) btn.classList.toggle('has-changes', dirty);
  },
};

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

    const delBtn = document.createElement('button');
    delBtn.className = 'column__delete-btn';
    delBtn.dataset.action    = 'delete-column';
    delBtn.dataset.columnId  = col.id;
    delBtn.dataset.columnKey = col.key;
    delBtn.setAttribute('aria-label', `${col.name} を削除`);
    delBtn.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z"/></svg>';

    actions.appendChild(count);
    actions.appendChild(doneBtn);
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

    section.appendChild(header);
    section.appendChild(body);
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
    const count = document.querySelector(`[data-count="${column}"]`);
    if (!body) return;

    // ソートを適用
    const sorted = sortTasksArray(tasks, State.sort);

    // カード描画
    body.innerHTML = '';
    for (const task of sorted) {
      body.appendChild(this.createCard(task, db));
    }

    // バッジ更新
    if (count) count.textContent = tasks.length;
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
    // 別タスクを開いたら新規作成フラグをクリア
    if (State.newlyCreatedTaskId !== taskId) State.newlyCreatedTaskId = null;
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
    const count = document.querySelector(`[data-count="${column}"]`);
    if (count) count.textContent = (State.tasks[column] || []).length;
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

// ==================================================
// DragDrop: SortableJS によるドラッグ&ドロップ
// ==================================================
const DragDrop = {
  init(db) {
    State.sortables = [];
    for (const col of getColumnKeys()) {
      const el = document.querySelector(`[data-column-body="${col}"]`);
      if (!el) continue;

      const sortable = Sortable.create(el, {
        group:       'kanban',           // カラム間移動を許可
        animation:   150,
        ghostClass:  'sortable-ghost',
        chosenClass: 'sortable-chosen',
        // ソート条件あり時は列内並び替えを無効化
        sort:        !State.sort.field,
        emptyInsertThreshold: 10,

        onEnd: (evt) => {
          this._onEnd(evt, db);
        },
      });
      State.sortables.push(sortable);
    }
  },

  /** ドラッグ終了後に position を更新 */
  async _onEnd(evt, db) {
    const fromCol = evt.from.dataset.columnBody;
    const toCol   = evt.to.dataset.columnBody;
    const taskId  = parseInt(evt.item.dataset.id, 10);

    if (!fromCol || !toCol || !taskId) return;

    if (State.sort.field) {
      // ソート条件あり：カラム移動のみ更新（position は変えない）
      if (fromCol !== toCol) {
        await db.updateTask(taskId, { column: toCol });
        State.tasks[fromCol] = (State.tasks[fromCol] || []).filter(t => t.id !== taskId);
        const allTasks = await db.getAllTasks();
        const task = allTasks.find(t => t.id === taskId);
        if (task) {
          if (!State.tasks[toCol]) State.tasks[toCol] = [];
          State.tasks[toCol].push(task);
        }
        Renderer.updateCount(fromCol);
        // 作業履歴（非同期、失敗しても無視）
        try {
          const fromName = State.columns.find(c => c.key === fromCol)?.name ?? fromCol;
          const toName   = State.columns.find(c => c.key === toCol)?.name ?? toCol;
          await db.addActivity(taskId, 'column_change', { from: fromName, to: toName });
        } catch (_) { /* アクティビティ記録失敗は無視 */ }
      }
      Renderer.renderColumn(toCol, State.tasks[toCol] || [], db);
      Renderer.updateCount(toCol);
      markDirty();
      applyFilter();
      return;
    }

    // ソート条件なし：position を中間値で更新
    const cards    = [...evt.to.querySelectorAll('.card[data-id]')];
    const newIndex = cards.indexOf(evt.item);

    const prevCard = cards[newIndex - 1];
    const nextCard = cards[newIndex + 1];

    const prevTask = prevCard ? (State.tasks[toCol] || []).find(t => t.id === parseInt(prevCard.dataset.id, 10)) : null;
    const nextTask = nextCard ? (State.tasks[toCol] || []).find(t => t.id === parseInt(nextCard.dataset.id, 10)) : null;

    let newPosition;
    if (prevTask && nextTask) {
      newPosition = (prevTask.position + nextTask.position) / 2;
    } else if (prevTask) {
      newPosition = prevTask.position + 1000;
    } else if (nextTask) {
      newPosition = nextTask.position / 2;
    } else {
      newPosition = 1000;
    }

    // DB 更新
    const updated = await db.updateTask(taskId, { column: toCol, position: newPosition });

    // State キャッシュ更新
    if (fromCol !== toCol) {
      State.tasks[fromCol] = (State.tasks[fromCol] || []).filter(t => t.id !== taskId);
      if (!State.tasks[toCol]) State.tasks[toCol] = [];
      State.tasks[toCol].push(updated);
    } else {
      const idx = (State.tasks[toCol] || []).findIndex(t => t.id === taskId);
      if (idx !== -1) State.tasks[toCol][idx] = updated;
    }
    State.tasks[toCol] = sortByPosition(State.tasks[toCol]);

    // gap が小さすぎる場合は全体再採番
    const positions = State.tasks[toCol].map(t => t.position);
    const minGap = Math.min(...positions.slice(1).map((p, i) => p - positions[i]));
    if (minGap < 0.001) {
      await db.renumberPositions(State.tasks[toCol]);
    }

    // 変更フラグ
    markDirty();

    if (fromCol !== toCol) {
      Renderer.updateCount(fromCol);
      // 作業履歴（非同期、失敗しても無視）
      try {
        const fromName = State.columns.find(c => c.key === fromCol)?.name ?? fromCol;
        const toName   = State.columns.find(c => c.key === toCol)?.name ?? toCol;
        await db.addActivity(taskId, 'column_change', { from: fromName, to: toName });
      } catch (_) { /* アクティビティ記録失敗は無視 */ }
    }
    Renderer.updateCount(toCol);

    applyFilter();
  },

};

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


    // ヘッダー（バックアップ操作）
    document.querySelector('.app-header').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      if (btn.dataset.action === 'export-backup') Backup.export(db);
      if (btn.dataset.action === 'import-backup') Backup.import(db);
    });

    // モーダルフィールドの変更イベント
    document.getElementById('modal-column').addEventListener('change', (e) => {
      this._onColumnChange(e, db);
    });
    document.getElementById('modal-title').addEventListener('blur', (e) => {
      this._onTitleBlur(e, db);
    });
    // Ctrl+Enter でタイトルを確定（blur 経由で保存）
    document.getElementById('modal-title').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.target.blur(); }
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
    // タスクピッカー外クリックで閉じる
    document.addEventListener('click', (e) => {
      const picker = document.getElementById('task-picker');
      if (picker && !picker.hidden && !picker.contains(e.target)) {
        this._closeTaskPicker();
      }
      const notePicker = document.getElementById('note-picker');
      if (notePicker && !notePicker.hidden && !notePicker.contains(e.target)) {
        this._closeNotePicker();
      }
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
    }
  },

  /** タスク追加 */
  async _onAddTask(btn, db) {
    const column   = btn.dataset.column;
    const colTasks = State.tasks[column] || [];
    const lastPos  = colTasks.length > 0 ? colTasks[colTasks.length - 1].position + 1000 : 1000;
    const task     = await db.addTask({ column, position: lastPos });
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
    // 新規作成フラグをセット（モーダルで最初に入力するタイトル・説明はアクティビティに記録しない）
    State.newlyCreatedTaskId = task.id;
    // すぐモーダルを開く
    await Renderer.renderModal(task.id, db);
  },

  /** タスク詳細を開く */
  async _onOpenTask(btn, db) {
    const card   = btn.closest('.card');
    const taskId = parseInt(card?.dataset.id, 10);
    if (!taskId) return;
    await Renderer.renderModal(taskId, db);
  },

  /** タスク削除（カードのボタンからもモーダルの削除ボタンからも呼ばれる） */
  async _onDeleteTask(btn, db) {
    const card   = btn.closest('.card');
    const taskId = card ? parseInt(card.dataset.id, 10) : State.currentTaskId;
    if (!taskId) return;
    if (!confirm('このタスクを削除しますか？')) return;

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

    // 新カラムの末尾 position
    const newColTasks = State.tasks[newCol] || [];
    const lastPos     = newColTasks.length > 0 ? newColTasks[newColTasks.length - 1].position + 1000 : 1000;
    const updated     = await db.updateTask(taskId, { column: newCol, position: lastPos });

    // State キャッシュ更新
    State.tasks[oldCol] = (State.tasks[oldCol] || []).filter(t => t.id !== taskId);
    if (!State.tasks[newCol]) State.tasks[newCol] = [];
    State.tasks[newCol].push(updated);

    // DOM 更新
    const newBody = document.querySelector(`[data-column-body="${newCol}"]`);
    const card    = document.querySelector(`.card[data-id="${taskId}"]`);
    if (card && newBody) {
      newBody.appendChild(card);
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

    // タスクキャッシュ更新
    for (const col of getColumnKeys()) {
      const idx = (State.tasks[col] || []).findIndex(t => t.id === taskId);
      if (idx !== -1) { State.tasks[col][idx].due_date = dateStr; break; }
    }
    await Renderer.refreshCard(taskId, db);
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
    // 新規作成直後の初回編集はアクティビティに記録しない
    if (oldTitle !== title && taskId !== State.newlyCreatedTaskId) {
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
    // 新規作成直後の初回編集・変更なしはアクティビティに記録しない
    if (taskId !== State.newlyCreatedTaskId && description !== State._descriptionBeforeEdit) {
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
    // カードを再描画して期限表示を更新し、アクティブなフィルターを再適用
    Renderer.renderColumn(key, State.tasks[key] ?? [], db);
    applyFilter();
    markDirty();
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
      Toast.show('タスクを先に移動または削除してください', 'error');
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
      Toast.show('ノートDBを開けませんでした', 'error');
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

};

// ==================================================
// Toast 通知: js/base/toast.js の Toast を使用

// ==================================================
// App: エントリポイント
// ==================================================
const App = {
  async init() {
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

    // ボードカラムを生成してからボードを描画
    Renderer.renderBoardColumns(db);
    await Renderer.renderBoard(db);

    // ドラッグ&ドロップを初期化
    DragDrop.init(db);

    // イベントハンドラを初期化
    EventHandlers.init(db);

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

    // 前回エクスポート後に変更があるか確認してインジケーターを初期化
    const dirtyAt  = localStorage.getItem('kanban_dirty_at')      || '';
    const exportAt = localStorage.getItem('kanban_last_export_at') || '';
    State.isDirty  = dirtyAt > exportAt;
    Backup.updateExportIndicator(State.isDirty);
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
