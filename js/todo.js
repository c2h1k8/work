// ==================================================
// Kanban Board — Vanilla JS + IndexedDB
// ==================================================

// ==================================================
// KanbanDB: IndexedDB Promise ラッパー
// ==================================================
class KanbanDB {
  constructor() {
    this.db = null;
  }

  /** DBをオープン（スキーマ初期化含む） */
  open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('kanban_db', 2);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;

        // tasks ストア
        if (!db.objectStoreNames.contains('tasks')) {
          const tasks = db.createObjectStore('tasks', { keyPath: 'id', autoIncrement: true });
          tasks.createIndex('column', 'column', { unique: false });
          tasks.createIndex('position', 'position', { unique: false });
        }

        // comments ストア
        if (!db.objectStoreNames.contains('comments')) {
          const comments = db.createObjectStore('comments', { keyPath: 'id', autoIncrement: true });
          comments.createIndex('task_id', 'task_id', { unique: false });
        }

        // labels ストア
        if (!db.objectStoreNames.contains('labels')) {
          db.createObjectStore('labels', { keyPath: 'id', autoIncrement: true });
        }

        // task_labels ストア
        if (!db.objectStoreNames.contains('task_labels')) {
          const tl = db.createObjectStore('task_labels', { keyPath: ['task_id', 'label_id'] });
          tl.createIndex('task_id', 'task_id', { unique: false });
        }

        // columns ストア（v2 で追加）
        if (!db.objectStoreNames.contains('columns')) {
          const cols = db.createObjectStore('columns', { keyPath: 'id', autoIncrement: true });
          cols.createIndex('key', 'key', { unique: true });
          cols.createIndex('position', 'position', { unique: false });
        }
      };

      req.onsuccess = (e) => { this.db = e.target.result; resolve(this); };
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  /** 汎用トランザクション実行 */
  _tx(stores, mode, fn) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(stores, mode);
      tx.onerror = (e) => reject(e.target.error);
      resolve(fn(tx));
    });
  }

  /** ストアの全レコード取得 */
  _getAll(storeName) {
    return new Promise((resolve, reject) => {
      const tx  = this.db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  /** インデックスで検索 */
  _getAllByIndex(storeName, indexName, value) {
    return new Promise((resolve, reject) => {
      const tx  = this.db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).index(indexName).getAll(value);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  // ---- Tasks ----
  async getAllTasks() {
    return this._getAll('tasks');
  }

  async getTasksByColumn(column) {
    const tasks = await this._getAllByIndex('tasks', 'column', column);
    return tasks.sort((a, b) => a.position - b.position);
  }

  async addTask(data) {
    return new Promise((resolve, reject) => {
      const now = new Date().toISOString();
      const task = {
        title:       data.title       || '(無題)',
        description: data.description || '',
        column:      data.column      || 'backlog',
        position:    data.position    ?? 0,
        due_date:    data.due_date    || '',
        created_at:  now,
        updated_at:  now,
      };
      const tx  = this.db.transaction('tasks', 'readwrite');
      const req = tx.objectStore('tasks').add(task);
      req.onsuccess = () => { task.id = req.result; resolve(task); };
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  async updateTask(id, data) {
    return new Promise((resolve, reject) => {
      const tx    = this.db.transaction('tasks', 'readwrite');
      const store = tx.objectStore('tasks');
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const task = { ...getReq.result, ...data, updated_at: new Date().toISOString() };
        const putReq = store.put(task);
        putReq.onsuccess = () => resolve(task);
        putReq.onerror   = (e) => reject(e.target.error);
      };
      getReq.onerror = (e) => reject(e.target.error);
    });
  }

  async deleteTask(id) {
    // コメントとラベル関連をカスケード削除
    const comments   = await this._getAllByIndex('comments',   'task_id', id);
    const taskLabels = await this._getAllByIndex('task_labels', 'task_id', id);

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['tasks', 'comments', 'task_labels'], 'readwrite');
      tx.oncomplete = resolve;
      tx.onerror    = (e) => reject(e.target.error);

      tx.objectStore('tasks').delete(id);
      for (const c of comments)   tx.objectStore('comments').delete(c.id);
      for (const tl of taskLabels) tx.objectStore('task_labels').delete([tl.task_id, tl.label_id]);
    });
  }

  // ---- Comments ----
  async getCommentsByTask(taskId) {
    const comments = await this._getAllByIndex('comments', 'task_id', taskId);
    return comments.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }

  async addComment(taskId, body) {
    return new Promise((resolve, reject) => {
      const comment = { task_id: taskId, body, created_at: new Date().toISOString() };
      const tx  = this.db.transaction('comments', 'readwrite');
      const req = tx.objectStore('comments').add(comment);
      req.onsuccess = () => { comment.id = req.result; resolve(comment); };
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  async deleteComment(id) {
    return new Promise((resolve, reject) => {
      const tx  = this.db.transaction('comments', 'readwrite');
      const req = tx.objectStore('comments').delete(id);
      req.onsuccess = resolve;
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  // ---- Labels ----
  async getAllLabels() {
    return this._getAll('labels');
  }

  async addLabel(name, color) {
    return new Promise((resolve, reject) => {
      const label = { name, color };
      const tx  = this.db.transaction('labels', 'readwrite');
      const req = tx.objectStore('labels').add(label);
      req.onsuccess = () => { label.id = req.result; resolve(label); };
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  async deleteLabel(id) {
    // task_labels も削除
    const taskLabels = await this._getAll('task_labels');
    const related = taskLabels.filter(tl => tl.label_id === id);
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['labels', 'task_labels'], 'readwrite');
      tx.oncomplete = resolve;
      tx.onerror    = (e) => reject(e.target.error);
      tx.objectStore('labels').delete(id);
      for (const tl of related) tx.objectStore('task_labels').delete([tl.task_id, tl.label_id]);
    });
  }

  async getTaskLabels(taskId) {
    return this._getAllByIndex('task_labels', 'task_id', taskId);
  }

  async addTaskLabel(taskId, labelId) {
    return new Promise((resolve, reject) => {
      const tx  = this.db.transaction('task_labels', 'readwrite');
      const req = tx.objectStore('task_labels').put({ task_id: taskId, label_id: labelId });
      req.onsuccess = resolve;
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  async removeTaskLabel(taskId, labelId) {
    return new Promise((resolve, reject) => {
      const tx  = this.db.transaction('task_labels', 'readwrite');
      const req = tx.objectStore('task_labels').delete([taskId, labelId]);
      req.onsuccess = resolve;
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  // ---- Columns ----
  async getAllColumns() {
    return this._getAll('columns');
  }

  async addColumn(name, key, position) {
    return new Promise((resolve, reject) => {
      const col = { name, key, position };
      const tx  = this.db.transaction('columns', 'readwrite');
      const req = tx.objectStore('columns').add(col);
      req.onsuccess = () => { col.id = req.result; resolve(col); };
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  async deleteColumn(id) {
    return new Promise((resolve, reject) => {
      const tx  = this.db.transaction('columns', 'readwrite');
      const req = tx.objectStore('columns').delete(id);
      req.onsuccess = resolve;
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  /** 全ストアのデータを一括エクスポート */
  async exportAll() {
    const [tasks, comments, labels, task_labels, columns] = await Promise.all([
      this._getAll('tasks'), this._getAll('comments'),
      this._getAll('labels'), this._getAll('task_labels'),
      this._getAll('columns'),
    ]);
    return { version: 2, exported_at: new Date().toISOString(), tasks, comments, labels, task_labels, columns };
  }

  /** 全ストアをクリアして data で上書き（put で ID 保持） */
  async importAll(data) {
    const stores = ['tasks', 'comments', 'labels', 'task_labels', 'columns'];
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(stores, 'readwrite');
      tx.oncomplete = resolve;
      tx.onerror    = (e) => reject(e.target.error);
      for (const s of stores) tx.objectStore(s).clear();
      for (const t   of (data.tasks       ?? [])) tx.objectStore('tasks').put(t);
      for (const c   of (data.comments    ?? [])) tx.objectStore('comments').put(c);
      for (const l   of (data.labels      ?? [])) tx.objectStore('labels').put(l);
      for (const tl  of (data.task_labels ?? [])) tx.objectStore('task_labels').put(tl);
      for (const col of (data.columns     ?? [])) tx.objectStore('columns').put(col);
    });
  }

  /**
   * カラム内の position を再採番する（gap が小さすぎる場合）
   * tasks: 当該カラムのタスク配列（position 順）
   */
  async renumberPositions(tasks) {
    return new Promise((resolve, reject) => {
      const tx    = this.db.transaction('tasks', 'readwrite');
      const store = tx.objectStore('tasks');
      tx.oncomplete = resolve;
      tx.onerror    = (e) => reject(e.target.error);
      tasks.forEach((t, i) => {
        t.position = (i + 1) * 1000;
        store.put(t);
      });
    });
  }
}

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
  filter:    { text: '', labelIds: new Set() }, // フィルター状態
  sort:      { field: '', dir: 'asc' },         // ソート状態
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
// Helper: エクスポート後の変更フラグを立てる
// ==================================================
function markDirty() {
  State.isDirty = true;
  localStorage.setItem('kanban_dirty_at', new Date().toISOString());
  Backup.updateExportIndicator(true);
}

// ==================================================
// Helper: フィルターをボード全体に適用
// ==================================================
function applyFilter() {
  const text   = State.filter.text.toLowerCase();
  const ids    = State.filter.labelIds;
  const active = text !== '' || ids.size > 0;

  for (const col of getColumnKeys()) {
    const body = document.querySelector(`[data-column-body="${col}"]`);
    if (!body) continue;
    let visible = 0;

    for (const card of body.querySelectorAll('.card[data-id]')) {
      const taskId  = parseInt(card.dataset.id, 10);
      const title   = (card.querySelector('.card__title')?.textContent || '').toLowerCase();
      const textOk  = !text || title.includes(text);
      let   labelOk = true;
      if (ids.size > 0) {
        const cardIds = State.taskLabels.get(taskId) || new Set();
        labelOk = [...ids].some(id => cardIds.has(id));
      }
      const show = textOk && labelOk;
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
// Helper: フィルターバーのラベルボタンを再描画
// ==================================================
function renderFilterLabels() {
  const bar = document.getElementById('filter-label-bar');
  if (!bar) return;
  bar.innerHTML = '';
  for (const label of State.labels) {
    const btn = document.createElement('button');
    btn.className = 'filter-label-btn';
    btn.dataset.labelId = label.id;
    btn.textContent = label.name;
    const active = State.filter.labelIds.has(label.id);
    btn.style.background   = active ? label.color + '55' : label.color + '22';
    btn.style.color        = label.color;
    btn.style.borderColor  = label.color + '99';
    if (active) btn.classList.add('filter-label-btn--active');
    bar.appendChild(btn);
  }
}

// ==================================================
// Migration: 旧 localStorage → IndexedDB
// ==================================================
const Migration = {
  /** 旧データが存在するか確認 */
  hasLegacyData() {
    return !!localStorage.getItem('tasks');
  },

  /** バナーを表示する */
  showBanner() {
    document.getElementById('migration-banner').removeAttribute('hidden');
  },

  /** 移行実行 */
  async run(db) {
    const raw = localStorage.getItem('tasks');
    if (!raw) return;

    let groups;
    try { groups = JSON.parse(raw); } catch { return; }
    if (!Array.isArray(groups)) return;

    const columnMap = ['backlog', 'in_progress', 'in_review', 'done'];

    for (let gIndex = 0; gIndex < groups.length; gIndex++) {
      const group  = groups[gIndex];
      const column = columnMap[Math.min(gIndex, columnMap.length - 1)];
      const tasks  = Array.isArray(group.task) ? group.task : [];

      for (let tIndex = 0; tIndex < tasks.length; tIndex++) {
        const t    = tasks[tIndex];
        // notes[] → description に結合
        let desc = '';
        if (Array.isArray(t.notes) && t.notes.length > 0) {
          desc = t.notes.map(n => n.isLink ? `${n.val} ${n.url}`.trim() : n.val).join('\n');
        }
        await db.addTask({
          title:       t.name || '(無題)',
          description: desc,
          column,
          position:    gIndex * 1000 + tIndex * 10,
          due_date:    t.date || '',
        });
      }
    }

    localStorage.removeItem('tasks');
    Toast.show('旧データを IndexedDB に移行しました', 'success');
  },
};

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
      download: `kanban_backup_${new Date().toISOString().slice(0, 10)}.json`,
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
        State.columns = (await db.getAllColumns()).sort((a, b) => a.position - b.position);
        if (State.columns.length === 0) {
          // バックアップにカラムがなければデフォルトを投入
          const defaults = [
            { name: 'バックログ', key: 'backlog',     position: 0 },
            { name: '進行中',     key: 'in_progress', position: 1 },
            { name: 'レビュー中', key: 'in_review',   position: 2 },
            { name: '完了',       key: 'done',        position: 3 },
          ];
          for (const d of defaults) await db.addColumn(d.name, d.key, d.position);
          State.columns = (await db.getAllColumns()).sort((a, b) => a.position - b.position);
        }
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
// DatePicker: カスタムカレンダー日付選択
// ==================================================
const DatePicker = {
  _year:     0,
  _month:    0,   // 0-based
  _selected: null,
  _onSelect: null,
  _onClear:  null,

  /** 日付ピッカーを開く */
  open(dateStr, onSelect, onClear) {
    const today = new Date();
    if (dateStr) {
      const d = new Date(dateStr + 'T00:00:00');
      this._year  = d.getFullYear();
      this._month = d.getMonth();
      this._selected = new Date(dateStr + 'T00:00:00');
    } else {
      this._year  = today.getFullYear();
      this._month = today.getMonth();
      this._selected = null;
    }
    this._onSelect = onSelect;
    this._onClear  = onClear;
    this._render();
    document.getElementById('date-picker').removeAttribute('hidden');
  },

  /** ピッカーを閉じる */
  close() {
    document.getElementById('date-picker').setAttribute('hidden', '');
  },

  /** カレンダーグリッドを描画 */
  _render() {
    // 月ラベル更新
    const label = document.getElementById('dp-month-label');
    label.textContent = `${this._year}年 ${this._month + 1}月`;

    const grid = document.getElementById('dp-grid');
    grid.innerHTML = '';

    // 曜日ヘッダー
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    for (const d of weekdays) {
      const hd = document.createElement('div');
      hd.className = 'dp-weekday';
      hd.textContent = d;
      grid.appendChild(hd);
    }

    // 今日の日付（比較用）
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 当月情報
    const firstDay = new Date(this._year, this._month, 1);
    const lastDay  = new Date(this._year, this._month + 1, 0);
    const startDow = firstDay.getDay(); // 0=日

    // 前月の空セル
    for (let i = 0; i < startDow; i++) {
      const blank = document.createElement('div');
      blank.className = 'dp-day dp-day--other';
      grid.appendChild(blank);
    }

    // 当月の日付ボタン
    for (let day = 1; day <= lastDay.getDate(); day++) {
      const btn = document.createElement('button');
      btn.className = 'dp-day';
      btn.textContent = day;

      const dateStr = [
        this._year,
        String(this._month + 1).padStart(2, '0'),
        String(day).padStart(2, '0'),
      ].join('-');
      btn.dataset.dpAction = 'pick-date';
      btn.dataset.date     = dateStr;

      const date = new Date(this._year, this._month, day);
      date.setHours(0, 0, 0, 0);

      if (this._selected) {
        const sel = new Date(this._selected);
        sel.setHours(0, 0, 0, 0);
        if (date.getTime() === sel.getTime()) btn.classList.add('dp-day--selected');
      }
      if (date.getTime() === today.getTime()) btn.classList.add('dp-day--today');

      grid.appendChild(btn);
    }
  },

  /** アクション処理 */
  handleAction(action, btn) {
    switch (action) {
      case 'prev-month':
        this._month--;
        if (this._month < 0) { this._month = 11; this._year--; }
        this._render();
        break;
      case 'next-month':
        this._month++;
        if (this._month > 11) { this._month = 0; this._year++; }
        this._render();
        break;
      case 'pick-date':
        this._selected = new Date(btn.dataset.date + 'T00:00:00');
        this._render();
        break;
      case 'today': {
        const t = new Date();
        this._selected = new Date(t.getFullYear(), t.getMonth(), t.getDate());
        this._year  = t.getFullYear();
        this._month = t.getMonth();
        this._render();
        break;
      }
      case 'tomorrow': {
        const t = new Date();
        t.setDate(t.getDate() + 1);
        this._selected = new Date(t.getFullYear(), t.getMonth(), t.getDate());
        this._year  = t.getFullYear();
        this._month = t.getMonth();
        this._render();
        break;
      }
      case 'month-end': {
        const t = new Date();
        const lastDay = new Date(t.getFullYear(), t.getMonth() + 1, 0);
        this._selected = lastDay;
        this._year  = lastDay.getFullYear();
        this._month = lastDay.getMonth();
        this._render();
        break;
      }
      case 'goto-today': {
        const t = new Date();
        this._year  = t.getFullYear();
        this._month = t.getMonth();
        this._render();
        break;
      }
      case 'confirm':
        if (this._selected) {
          const y = this._selected.getFullYear();
          const m = String(this._selected.getMonth() + 1).padStart(2, '0');
          const d = String(this._selected.getDate()).padStart(2, '0');
          this._onSelect?.(`${y}-${m}-${d}`);
        }
        this.close();
        break;
      case 'clear':
        this._onClear?.();
        this.close();
        break;
      case 'cancel':
        this.close();
        break;
    }
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

    const delBtn = document.createElement('button');
    delBtn.className = 'column__delete-btn';
    delBtn.dataset.action    = 'delete-column';
    delBtn.dataset.columnId  = col.id;
    delBtn.dataset.columnKey = col.key;
    delBtn.setAttribute('aria-label', `${col.name} を削除`);
    delBtn.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z"/></svg>';

    actions.appendChild(count);
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

    // 期限
    const dueEl = card.querySelector('.card__due');
    if (task.due_date) {
      const { text, cls } = this._getDueInfo(task.due_date);
      dueEl.textContent = text;
      if (cls) dueEl.classList.add(cls);
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
    renderTextWithLinks(descView, t.description || '');
    descView.removeAttribute('hidden');
    descTextarea.setAttribute('hidden', '');
    if (descBtn) descBtn.removeAttribute('hidden');

    // カラム
    this.renderModalColumnSelect();
    const colSelect = document.getElementById('modal-column');
    if (colSelect) colSelect.value = t.column;

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

    // コメント
    await this.renderComments(taskId, db);

    // モーダルを表示
    document.getElementById('task-modal').removeAttribute('hidden');
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
      const available = labels.filter(l => !appliedIds.has(l.id));
      for (const label of available) {
        const chip = document.createElement('span');
        chip.className = 'modal-existing-label';
        chip.dataset.action  = 'pick-label';
        chip.dataset.labelId = label.id;
        chip.textContent     = label.name;
        chip.style.background   = label.color + '22';
        chip.style.color        = label.color;
        chip.style.borderColor  = label.color + '99';
        existing.appendChild(chip);
      }
    }
  },

  /** コメントタイムラインを描画 */
  async renderComments(taskId, db) {
    const comments  = await db.getCommentsByTask(taskId);
    const container = document.getElementById('modal-comments');
    container.innerHTML = '';

    if (comments.length === 0) {
      const empty = document.createElement('p');
      empty.style.cssText = 'color:var(--color-text-muted);font-size:12px;margin:0;';
      empty.textContent = 'コメントはまだありません';
      container.appendChild(empty);
      return;
    }

    for (const c of comments) {
      const item = document.createElement('div');
      item.className = 'comment-item';
      item.dataset.commentId = c.id;

      const header = document.createElement('div');
      header.className = 'comment-item__header';

      const date = document.createElement('span');
      date.className = 'comment-item__date';
      date.textContent = new Date(c.created_at).toLocaleString('ja-JP');

      const del = document.createElement('button');
      del.className = 'comment-item__delete';
      del.dataset.action    = 'delete-comment';
      del.dataset.commentId = c.id;
      del.setAttribute('aria-label', 'コメントを削除');
      del.innerHTML = '<svg viewBox="0 0 16 16"><path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z"/></svg>';

      header.appendChild(date);
      header.appendChild(del);

      const body = document.createElement('pre');
      body.className = 'comment-item__body';
      body.textContent = c.body;

      item.appendChild(header);
      item.appendChild(body);
      container.appendChild(item);
    }
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

  /** カウントバッジを更新 */
  updateCount(column) {
    const count = document.querySelector(`[data-count="${column}"]`);
    if (count) count.textContent = (State.tasks[column] || []).length;
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
    State.tasks[toCol].sort((a, b) => a.position - b.position);

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

    // マイグレーションバナー
    document.getElementById('migration-banner').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      this._dispatch(btn.dataset.action, btn, db);
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
    document.getElementById('modal-description').addEventListener('blur', (e) => {
      this._onDescriptionBlur(e, db);
    });

    // カレンダーピッカー（クリック委譲）
    document.getElementById('date-picker').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-dp-action]');
      if (btn) DatePicker.handleAction(btn.dataset.dpAction, btn);
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
      applyFilter();
    });

    // フィルターラベルバー（クリック委譲）
    document.getElementById('filter-label-bar').addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-label-btn');
      if (!btn) return;
      const labelId = parseInt(btn.dataset.labelId, 10);
      if (!labelId) return;
      if (State.filter.labelIds.has(labelId)) {
        State.filter.labelIds.delete(labelId);
      } else {
        State.filter.labelIds.add(labelId);
      }
      renderFilterLabels();
      applyFilter();
    });

    // フィルタークリアボタン
    document.getElementById('filter-clear').addEventListener('click', () => {
      State.filter.text = '';
      State.filter.labelIds = new Set();
      document.getElementById('filter-text').value = '';
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
      case 'add-comment':       this._onAddComment(db);          break;
      case 'delete-comment':    this._onDeleteComment(btn, db);  break;
      case 'add-label':         this._onAddLabel(db);            break;
      case 'remove-label':      this._onRemoveLabel(btn, db);    break;
      case 'edit-title':        this._onEditTitle();             break;
      case 'edit-description':  this._onEditDescription();       break;
      case 'pick-label':        this._onPickLabel(btn, db);      break;
      case 'run-migration':     this._onRunMigration(db);        break;
      case 'dismiss-migration': document.getElementById('migration-banner').setAttribute('hidden', ''); break;
      case 'add-column':        this._onAddColumn(db);           break;
      case 'delete-column':     this._onDeleteColumn(btn, db);   break;
      case 'open-datepicker':   this._onOpenDatepicker(db);      break;
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

  /** タスク削除 */
  async _onDeleteTask(btn, db) {
    const card   = btn.closest('.card');
    const taskId = parseInt(card?.dataset.id, 10);
    if (!taskId) return;
    if (!confirm('このタスクを削除しますか？')) return;

    const column = card.closest('[data-column-body]')?.dataset.columnBody;
    await db.deleteTask(taskId);

    // State キャッシュから削除
    if (column) State.tasks[column] = (State.tasks[column] || []).filter(t => t.id !== taskId);

    markDirty();
    card.remove();
    if (column) {
      Renderer.updateCount(column);
    }
    applyFilter();
  },

  /** モーダルを閉じる */
  _closeModal() {
    document.getElementById('task-modal').setAttribute('hidden', '');
    State.currentTaskId = null;
    document.getElementById('modal-comment-input').value = '';
  },

  /** コメント追加 */
  async _onAddComment(db) {
    const input = document.getElementById('modal-comment-input');
    const body  = input.value.trim();
    if (!body || !State.currentTaskId) return;

    await db.addComment(State.currentTaskId, body);
    markDirty();
    input.value = '';
    await Renderer.renderComments(State.currentTaskId, db);
  },

  /** コメント削除 */
  async _onDeleteComment(btn, db) {
    const commentId = parseInt(btn.dataset.commentId, 10);
    if (!commentId) return;
    await db.deleteComment(commentId);
    markDirty();
    await Renderer.renderComments(State.currentTaskId, db);
  },

  /** ラベル追加 */
  async _onAddLabel(db) {
    const nameInput  = document.getElementById('modal-label-name');
    const colorInput = document.getElementById('modal-label-color');
    const name  = nameInput.value.trim();
    const color = colorInput.value;
    if (!name || !State.currentTaskId) return;

    // 同名ラベルが存在するか確認
    let label = State.labels.find(l => l.name === name && l.color === color);
    if (!label) {
      label = await db.addLabel(name, color);
      State.labels.push(label);
      renderFilterLabels();
    }

    await db.addTaskLabel(State.currentTaskId, label.id);
    // taskLabels キャッシュ更新
    if (!State.taskLabels.has(State.currentTaskId)) State.taskLabels.set(State.currentTaskId, new Set());
    State.taskLabels.get(State.currentTaskId).add(label.id);
    markDirty();
    nameInput.value = '';
    await Renderer.renderModalLabels(State.currentTaskId, db);
    await Renderer.refreshCard(State.currentTaskId, db);
  },

  /** ラベル削除（タスクから切り離すのみ） */
  async _onRemoveLabel(btn, db) {
    const labelId = parseInt(btn.dataset.labelId, 10);
    if (!labelId || !State.currentTaskId) return;
    await db.removeTaskLabel(State.currentTaskId, labelId);
    // taskLabels キャッシュ更新
    const labelsForTask = State.taskLabels.get(State.currentTaskId);
    if (labelsForTask) labelsForTask.delete(labelId);
    markDirty();
    await Renderer.renderModalLabels(State.currentTaskId, db);
    await Renderer.refreshCard(State.currentTaskId, db);
  },

  /** 既存ラベルをピッカーからタスクに追加 */
  async _onPickLabel(btn, db) {
    const labelId = parseInt(btn.dataset.labelId, 10);
    if (!labelId || !State.currentTaskId) return;
    await db.addTaskLabel(State.currentTaskId, labelId);
    // taskLabels キャッシュ更新
    if (!State.taskLabels.has(State.currentTaskId)) State.taskLabels.set(State.currentTaskId, new Set());
    State.taskLabels.get(State.currentTaskId).add(labelId);
    markDirty();
    await Renderer.renderModalLabels(State.currentTaskId, db);
    await Renderer.refreshCard(State.currentTaskId, db);
  },

  /** カラム変更 */
  async _onColumnChange(e, db) {
    if (!State.currentTaskId) return;
    const newCol   = e.target.value;
    const allTasks = await db.getAllTasks();
    const task     = allTasks.find(t => t.id === State.currentTaskId);
    if (!task) return;
    const oldCol = task.column;
    if (oldCol === newCol) return;

    // 新カラムの末尾 position
    const newColTasks = State.tasks[newCol] || [];
    const lastPos     = newColTasks.length > 0 ? newColTasks[newColTasks.length - 1].position + 1000 : 1000;
    const updated     = await db.updateTask(State.currentTaskId, { column: newCol, position: lastPos });

    // State キャッシュ更新
    State.tasks[oldCol] = (State.tasks[oldCol] || []).filter(t => t.id !== State.currentTaskId);
    if (!State.tasks[newCol]) State.tasks[newCol] = [];
    State.tasks[newCol].push(updated);

    // DOM 更新
    const newBody = document.querySelector(`[data-column-body="${newCol}"]`);
    const card    = document.querySelector(`.card[data-id="${State.currentTaskId}"]`);
    if (card && newBody) {
      newBody.appendChild(card);
    }
    markDirty();
    Renderer.updateCount(oldCol);
    Renderer.updateCount(newCol);
    applyFilter();
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
    const dueHidden  = document.getElementById('modal-due');
    const dueText    = document.getElementById('modal-due-text');
    const dueDisplay = document.getElementById('modal-due-display');

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

    await db.updateTask(State.currentTaskId, { due_date: dateStr });
    markDirty();

    // タスクキャッシュ更新
    for (const col of getColumnKeys()) {
      const idx = (State.tasks[col] || []).findIndex(t => t.id === State.currentTaskId);
      if (idx !== -1) { State.tasks[col][idx].due_date = dateStr; break; }
    }
    await Renderer.refreshCard(State.currentTaskId, db);
  },

  /** タイトル blur 時に保存して表示モードに戻す */
  async _onTitleBlur(e, db) {
    if (!State.currentTaskId) return;
    const title = e.target.value.trim() || '(無題)';
    await db.updateTask(State.currentTaskId, { title });

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
      const idx = (State.tasks[col] || []).findIndex(t => t.id === State.currentTaskId);
      if (idx !== -1) { State.tasks[col][idx].title = title; break; }
    }
    await Renderer.refreshCard(State.currentTaskId, db);
  },

  /** 説明 blur 時に保存して表示モードに戻す */
  async _onDescriptionBlur(e, db) {
    if (!State.currentTaskId) return;
    const description = e.target.value;
    await db.updateTask(State.currentTaskId, { description });
    markDirty();

    // 表示モードに切り替え（URL をリンクにレンダリング）
    const descView = document.getElementById('modal-description-view');
    const descBtn  = document.querySelector('[data-action="edit-description"]');
    renderTextWithLinks(descView, description);
    e.target.setAttribute('hidden', '');
    descView.removeAttribute('hidden');
    if (descBtn) descBtn.removeAttribute('hidden');
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
    const descView     = document.getElementById('modal-description-view');
    const descTextarea = document.getElementById('modal-description');
    const descBtn      = document.querySelector('[data-action="edit-description"]');
    descView.setAttribute('hidden', '');
    descTextarea.removeAttribute('hidden');
    if (descBtn) descBtn.setAttribute('hidden', '');
    descTextarea.focus();
  },

  /** キーボード操作 */
  _onKeydown(e, db) {
    const modal = document.getElementById('task-modal');
    if (!modal.hasAttribute('hidden')) {
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
      // Ctrl+Enter: コメント投稿または説明保存
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        const active = document.activeElement;
        if (active === document.getElementById('modal-comment-input')) {
          e.preventDefault();
          this._onAddComment(db);
        } else if (active === document.getElementById('modal-description')) {
          e.preventDefault();
          active.blur(); // blur イベント → _onDescriptionBlur で保存+表示切替
        }
      }
    }
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

  /** マイグレーション実行 */
  async _onRunMigration(db) {
    document.getElementById('migration-banner').setAttribute('hidden', '');
    await Migration.run(db);
    await Renderer.renderBoard(db);
  },
};

// ==================================================
// Toast: 通知表示
// ==================================================
const Toast = {
  _timer: null,
  show(message, type = '') {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.className   = 'toast' + (type ? ` toast--${type}` : '');
    el.removeAttribute('hidden');
    clearTimeout(this._timer);
    this._timer = setTimeout(() => el.setAttribute('hidden', ''), 3000);
  },
};

// ==================================================
// App: エントリポイント
// ==================================================
const App = {
  async init() {
    const db = new KanbanDB();
    await db.open();

    // カラムをロード（なければデフォルト4カラムを投入）
    State.columns = (await db.getAllColumns()).sort((a, b) => a.position - b.position);
    if (State.columns.length === 0) {
      const defaults = [
        { name: 'バックログ', key: 'backlog',     position: 0 },
        { name: '進行中',     key: 'in_progress', position: 1 },
        { name: 'レビュー中', key: 'in_review',   position: 2 },
        { name: '完了',       key: 'done',        position: 3 },
      ];
      for (const d of defaults) await db.addColumn(d.name, d.key, d.position);
      State.columns = (await db.getAllColumns()).sort((a, b) => a.position - b.position);
    }

    // tasks キャッシュを動的に初期化
    for (const col of State.columns) State.tasks[col.key] = [];

    // ソート状態を localStorage から復元
    const savedSort = localStorage.getItem('kanban_sort');
    if (savedSort) {
      try { State.sort = JSON.parse(savedSort); } catch { /* 無視 */ }
    }

    // ラベルキャッシュをロード
    State.labels = await db.getAllLabels();

    // ボードカラムを生成してからボードを描画
    Renderer.renderBoardColumns(db);
    await Renderer.renderBoard(db);

    // フィルターラベルバーを初期化
    renderFilterLabels();

    // ドラッグ&ドロップを初期化
    DragDrop.init(db);

    // イベントハンドラを初期化
    EventHandlers.init(db);

    // ソート選択の初期値を設定
    const sortSelect = document.getElementById('sort-select');
    if (sortSelect && State.sort.field) {
      sortSelect.value = `${State.sort.field}:${State.sort.dir}`;
    }

    // 旧データのマイグレーション確認
    if (Migration.hasLegacyData()) {
      Migration.showBanner();
    }

    // 前回エクスポート後に変更があるか確認してインジケーターを初期化
    const dirtyAt  = localStorage.getItem('kanban_dirty_at')      || '';
    const exportAt = localStorage.getItem('kanban_last_export_at') || '';
    State.isDirty  = dirtyAt > exportAt;
    Backup.updateExportIndicator(State.isDirty);
  },
};

// DOMContentLoaded 後に起動
document.addEventListener('DOMContentLoaded', () => App.init());
