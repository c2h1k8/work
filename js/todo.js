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
  templates: [],         // タスクテンプレートキャッシュ
  sortables: [],         // SortableJS インスタンス
  isDirty:   false,      // 前回エクスポート後に変更があるか
  taskLabels: new Map(), // taskId → Set<labelId>（フィルター用キャッシュ）
  comments:  new Map(), // taskId → string[]（コメント本文、テキスト検索用キャッシュ）
  dependencies: new Map(), // taskId → { blocking: Set<taskId>, blockedBy: Set<taskId> }
  _labelFilterInst: null,                                     // LabelFilter コンポーネントインスタンス
  filter:         { text: '', labelIds: new Set(), due: '' }, // フィルター状態
  sort:           { field: '', dir: 'asc' },                  // ソート状態
  timelineFilter: 'comments',                                 // 'comments' | 'all'
  timeAbsolute:   false,                                      // 時刻表示形式（false=相対, true=絶対）
  newlyCreatedTaskId: null,                                   // 新規作成直後のタスクID（初回編集をアクティビティに記録しない）
  _descriptionBeforeEdit: null,                              // 説明編集開始時の元テキスト（変更なし判定用）
  _checklistSortable: null,                                  // チェックリスト SortableJS インスタンス
  _templateSortable:  null,                                  // テンプレート一覧 SortableJS インスタンス
  _pickerDepMode: null,                                      // 'blocker' | 'blocked' 依存ピッカーモード
  _depPickerCandidates: null,                                // 依存ピッカー候補リスト
  _templatePickerColumn: null,                               // テンプレート選択中のカラムキー
  _editingTemplateId: null,                                  // テンプレート管理モーダルで編集中のテンプレートID
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
// DB 参照（モジュールレベル、App.init() で設定）
// ==================================================
let _dbRef = null;

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
// Helper: WIP 超過表示を更新
// ==================================================
function _updateWipDisplay(columnKey) {
  const col = State.columns.find(c => c.key === columnKey);
  if (!col) return;
  const count   = (State.tasks[columnKey] || []).length;
  const limit   = col.wip_limit || 0;
  const exceeded = limit > 0 && count > limit;

  const countEl  = document.querySelector(`[data-count="${columnKey}"]`);
  const section  = document.querySelector(`[data-column="${columnKey}"]`);
  if (countEl) {
    countEl.textContent = limit > 0 ? `${count}/${limit}` : String(count);
    countEl.style.color = exceeded ? 'var(--c-danger)' : '';
    countEl.style.background = exceeded ? 'var(--c-danger-bg)' : '';
  }
  if (section) section.classList.toggle('column--wip-exceeded', exceeded);
}

// ==================================================
// Helper: 繰り返しの次回日付を計算
// ==================================================
function _calcNextDate(dateStr, interval) {
  const d = new Date(dateStr + 'T00:00:00');
  if (interval === 'daily')   d.setDate(d.getDate() + 1);
  if (interval === 'weekly')  d.setDate(d.getDate() + 7);
  if (interval === 'monthly') d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
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

    // WIP 表示更新（フィルター中は実タスク数を使う）
    _updateWipDisplay(col);
    const countEl = document.querySelector(`[data-count="${col}"]`);
    if (countEl && active) countEl.textContent = (() => {
      const limit = State.columns.find(c => c.key === col)?.wip_limit || 0;
      const total = (State.tasks[col] || []).length;
      return limit > 0 ? `${visible}/${limit}` : String(visible);
    })();
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

    // チェックリストバッジ
    const footer = card.querySelector('.card__footer');
    if (task.checklist && task.checklist.length > 0) {
      const total = task.checklist.length;
      const done  = task.checklist.filter(i => i.done).length;
      const badge = document.createElement('span');
      badge.className = 'card__checklist-badge' + (done === total ? ' card__checklist-badge--done' : '');
      badge.textContent = `✓ ${done}/${total}`;
      footer.insertBefore(badge, footer.firstChild);
    }

    // 繰り返しバッジ
    if (task.recurring) {
      const repBadge = document.createElement('span');
      repBadge.className = 'card__repeat-badge';
      repBadge.innerHTML = Icons.repeat;
      repBadge.title = `繰り返し（${task.recurring.interval === 'daily' ? '毎日' : task.recurring.interval === 'weekly' ? '毎週' : '毎月'}）`;
      footer.insertBefore(repBadge, footer.firstChild);
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
        card.querySelector('.card__actions').prepend(lockEl);
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

    // 完了カラムへ移動しようとしている場合、先行タスクが完了しているか確認
    if (fromCol !== toCol) {
      const toColDef = State.columns.find(c => c.key === toCol);
      if (toColDef?.done) {
        const deps = State.dependencies.get(taskId);
        if (deps && deps.blockedBy.size > 0) {
          const doneKeys = new Set(State.columns.filter(c => c.done).map(c => c.key));
          const hasBlocker = [...deps.blockedBy].some(blockerId => {
            const bt = Object.values(State.tasks).flat().find(t => t.id === blockerId);
            return !bt || !doneKeys.has(bt.column);
          });
          if (hasBlocker) {
            Toast.show('先行タスクが完了していないため移動できません', 'error');
            // SortableJS が移動した DOM を元に戻す
            Renderer.renderColumn(fromCol, State.tasks[fromCol] || [], db);
            Renderer.renderColumn(toCol,   State.tasks[toCol]   || [], db);
            DragDrop.init(db);
            return;
          }
        }
      }
    }

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
      // done ステータスが異なるカラム間の移動は期限切れ表示が変わるため再描画
      const fromDone = State.columns.find(c => c.key === fromCol)?.done;
      const toDone   = State.columns.find(c => c.key === toCol)?.done;
      if (fromDone !== toDone) {
        Renderer.renderColumn(fromCol, State.tasks[fromCol] || [], db);
        Renderer.renderColumn(toCol,   State.tasks[toCol]   || [], db);
      }
      // 作業履歴（非同期、失敗しても無視）
      try {
        const fromName = State.columns.find(c => c.key === fromCol)?.name ?? fromCol;
        const toName   = State.columns.find(c => c.key === toCol)?.name ?? toCol;
        await db.addActivity(taskId, 'column_change', { from: fromName, to: toName });
      } catch (_) { /* アクティビティ記録失敗は無視 */ }
    }
    Renderer.updateCount(toCol);

    // 完了カラムへ移動した場合、繰り返しタスクを自動生成
    if (fromCol !== toCol) {
      const toDone = State.columns.find(c => c.key === toCol)?.done;
      if (toDone) {
        const allTasks = await db.getAllTasks();
        const movedTask = allTasks.find(t => t.id === taskId);
        if (movedTask?.recurring) {
          await _handleRecurringOnDone(movedTask, db);
        }
      }
    }

    applyFilter();
  },

};

// ==================================================
// Helper: 完了カラム移動時に繰り返しタスクを生成
// ==================================================
async function _handleRecurringOnDone(task, db) {
  if (!task.recurring) return;
  const firstCol = [...State.columns].sort((a, b) => a.position - b.position)[0];
  if (!firstCol) return;

  const nextDate = task.recurring.next_date || task.due_date || new Date().toISOString().slice(0, 10);
  const afterNextDate = _calcNextDate(nextDate, task.recurring.interval);

  // チェックリストの done をリセット
  const checklist = (task.checklist || []).map(c => ({ ...c, done: false }));

  // 次回タスクを作成
  const colTasks = State.tasks[firstCol.key] || [];
  const lastPos  = colTasks.length > 0 ? colTasks[colTasks.length - 1].position + 1000 : 1000;

  // task_labels を取得してコピー
  const taskLabels = await db._getAllByIndex('task_labels', 'task_id', task.id).catch(() => []);
  const labelIds   = taskLabels.map(tl => tl.label_id);

  const newTask = await db.addTask({
    column:      firstCol.key,
    position:    lastPos,
    title:       task.title,
    description: task.description || '',
    checklist,
    due_date:    nextDate,
    recurring:   { interval: task.recurring.interval, next_date: afterNextDate },
  });

  // ラベルをコピー
  for (const labelId of labelIds) {
    await db.addTaskLabel(newTask.id, labelId).catch(() => {});
    if (!State.taskLabels.has(newTask.id)) State.taskLabels.set(newTask.id, new Set());
    State.taskLabels.get(newTask.id).add(labelId);
  }

  // State キャッシュ更新
  if (!State.tasks[firstCol.key]) State.tasks[firstCol.key] = [];
  State.tasks[firstCol.key].push(newTask);
  try { await db.addActivity(newTask.id, 'task_create', {}); } catch {}

  // 元タスクの next_date を更新
  await db.updateTask(task.id, { recurring: { ...task.recurring, next_date: afterNextDate } });
  for (const col of Object.keys(State.tasks)) {
    const t = (State.tasks[col] || []).find(t => t.id === task.id);
    if (t) { t.recurring = { ...t.recurring, next_date: afterNextDate }; break; }
  }

  // ボード更新
  Renderer.renderColumn(firstCol.key, State.tasks[firstCol.key], db);
  markDirty();
  const showToast = (msg, type) => Toast.show(msg, type);
  showToast('繰り返しタスクを生成しました', 'success');
}

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
      // アーカイブ
      case 'open-archive-modal':  this._onOpenArchiveModal(db).catch(console.error); break;
      case 'close-archive-modal': this._closeArchiveModal(); break;
      case 'restore-archive':     this._onRestoreArchive(btn, db).catch(console.error); break;
      case 'delete-archive':      this._onDeleteArchive(btn, db).catch(console.error); break;
    }
  },

  /** タスク追加 */
  async _onAddTask(btn, db) {
    const column = btn.dataset.column;

    // テンプレートが存在する場合はテンプレート選択ポップアップを表示
    if (State.templates.length > 0) {
      State._templatePickerColumn = column;
      this._showTemplatePicker(btn);
      return;
    }

    await this._createTaskInColumn(column, {}, db);
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

  /** テンプレートを使用してタスク作成 */
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
    const data = {
      title:       tpl.title       || '',
      description: tpl.description || '',
      checklist,
    };
    const task = await this._createTaskInColumn(column, data, db);

    // ラベルを付与
    if (tpl.label_ids && tpl.label_ids.length > 0) {
      for (const labelId of tpl.label_ids) {
        await db.addTaskLabel(task.id, labelId).catch(() => {});
        if (!State.taskLabels.has(task.id)) State.taskLabels.set(task.id, new Set());
        State.taskLabels.get(task.id).add(labelId);
      }
    }
  },

  /** テンプレートをスキップして空白タスクを作成 */
  async _onSkipTemplate(btn, db) {
    const column = State._templatePickerColumn;
    document.getElementById('template-picker').setAttribute('hidden', '');
    State._templatePickerColumn = null;
    if (!column) return;
    await this._createTaskInColumn(column, {}, db);
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
    // 新規作成フラグをセット（モーダルで最初に入力するタイトル・説明はアクティビティに記録しない）
    State.newlyCreatedTaskId = task.id;
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
          Toast.show('先行タスクが完了していないため移動できません', 'error');
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
    // 完了カラムへ移動した場合、繰り返しタスクを自動生成
    const newDone2 = State.columns.find(c => c.key === newCol)?.done;
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
      if (newName !== originalName) Toast.show(`カラム名を「${newName}」に変更しました`, 'success');
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
      Toast.show('循環依存になるため追加できません', 'error');
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
    Toast.show(`${tasks.length} 件をアーカイブしました`, 'success');
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
      if (!name) { Toast.show('テンプレート名を入力してください', 'error'); return; }
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
      Toast.show('テンプレートを保存しました', 'success');
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
    Toast.show('テンプレートを削除しました', 'success');
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
    Toast.show(`「${saved.name}」をテンプレートとして保存しました`, 'success');
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

    if (!State.columns.length) { Toast.show('カラムが存在しません', 'error'); return; }

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
      Renderer.renderColumn(restoredColKey, State.tasks[restoredColKey], db);
      applyFilter();
      markDirty();
      const colName = State.columns.find(c => c.key === restoredColKey)?.name ?? restoredColKey;
      Toast.show(`「${task.title}」を「${colName}」に復元しました`, 'success');
    } catch (e) {
      console.error('復元に失敗:', e);
      Toast.show('復元に失敗しました', 'error');
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
