// ==================================================
// KanbanDB — kanban_db IndexedDB Promise ラッパー
// ==================================================
//
// ■ DB情報
//   DB名: kanban_db  /  バージョン: 1
//
// ■ ストア一覧とスキーマ
//
//   tasks           タスク本体
//     id*           AutoIncrement PK
//     title         タイトル (string)
//     description   説明・本文 (string, Markdown)
//     column        所属カラムキー (string) → columns.key に対応
//     position      表示順 (number)
//     due_date      期限日 (string YYYY/MM/DD | '')
//     created_at    作成日時 (ISO8601)
//     updated_at    更新日時 (ISO8601)
//     index: column, position
//
//   comments        タスクコメント
//     id*           AutoIncrement PK
//     task_id       → tasks.id
//     body          本文 (string, Markdown)
//     created_at    作成日時 (ISO8601)
//     updated_at    更新日時 (ISO8601, 任意)
//     index: task_id
//
//   labels          ラベルマスタ
//     id*           AutoIncrement PK
//     name          ラベル名 (string)
//     color         色コード (string, e.g. "#e74c3c")
//
//   task_labels     タスク↔ラベル 中間テーブル（複合PK）
//     [task_id, label_id]*  複合 keyPath
//     task_id       → tasks.id
//     label_id      → labels.id
//     index: task_id
//
//   columns         ボードカラム定義
//     id*           AutoIncrement PK
//     key           カラム識別キー (string, unique) → tasks.column に対応
//     name          表示名 (string)
//     position      表示順 (number)
//     index: key (unique), position
//
//   activities      変更履歴（アクティビティタイムライン）
//     id*           AutoIncrement PK
//     task_id       → tasks.id
//     type          変更種別 (string) ※下記参照
//     content       詳細 (object, 型によって構造が異なる)
//     created_at    記録日時 (ISO8601)
//     index: task_id
//
//     type 一覧:
//       column_change      カラム移動       content: { from, to }
//       title_change       タイトル変更     content: { from, to }
//       description_change 説明変更         content: {}
//       due_add            期限追加         content: { date }
//       due_remove         期限削除         content: { date }
//       due_change         期限変更         content: { from, to }
//       label_add          ラベル追加       content: { name, color }
//       label_remove       ラベル削除       content: { name, color }
//       comment_delete     コメント削除     content: { body }
//       comment_edit       コメント編集     content: {}
//       relation_add       紐づけ追加       content: { role, with_title }
//       relation_remove    紐づけ削除       content: { role, with_title }
//
//   task_relations  タスク間の紐づけ（自己参照）
//     id*           AutoIncrement PK
//     task_id       基準タスク ID
//     related_id    関連タスク ID
//     relation_type 'child' | 'related'
//     index: task_id, related_id（双方向検索用）
//
//     ルール:
//       child   → task_id=親タスク, related_id=子タスク（1タスクに子は複数可）
//       related → task_id=min(両者ID), related_id=max(両者ID) に正規化して重複防止
//
//   note_links      TODO タスク↔ノートタスクの紐づけ（cross-DB）
//     id*           AutoIncrement PK
//     todo_task_id  → tasks.id（この DB）
//     note_task_id  → note_db.tasks.id（別 DB）
//     index: todo_task_id, note_task_id
//
// ■ テーブル間リレーション
//
//   tasks ──< comments        tasks.id = comments.task_id
//   tasks >── columns         tasks.column = columns.key
//   tasks >─< labels          tasks × labels (via task_labels)
//   tasks ──< activities      tasks.id = activities.task_id
//   tasks >─< tasks           自己参照 (via task_relations)
//     child:   tasks.id = task_relations.task_id (親)
//              tasks.id = task_relations.related_id (子)
//     related: 双方向。task_id/related_id インデックス両方を検索
//   tasks >─< note_db.tasks   cross-DB (via note_links)
//
// ==================================================

class KanbanDB {
  constructor() {
    this.db = null;
  }

  /** DBをオープン（スキーマ初期化含む） */
  open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('kanban_db', 1);

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

        // columns ストア
        if (!db.objectStoreNames.contains('columns')) {
          const cols = db.createObjectStore('columns', { keyPath: 'id', autoIncrement: true });
          cols.createIndex('key', 'key', { unique: true });
          cols.createIndex('position', 'position', { unique: false });
        }

        // activities ストア
        if (!db.objectStoreNames.contains('activities')) {
          const acts = db.createObjectStore('activities', { keyPath: 'id', autoIncrement: true });
          acts.createIndex('task_id', 'task_id', { unique: false });
        }

        // task_relations ストア
        if (!db.objectStoreNames.contains('task_relations')) {
          const rels = db.createObjectStore('task_relations', { keyPath: 'id', autoIncrement: true });
          rels.createIndex('task_id', 'task_id', { unique: false });
          rels.createIndex('related_id', 'related_id', { unique: false });
        }

        // note_links ストア
        if (!db.objectStoreNames.contains('note_links')) {
          const nl = db.createObjectStore('note_links', { keyPath: 'id', autoIncrement: true });
          nl.createIndex('todo_task_id', 'todo_task_id', { unique: false });
          nl.createIndex('note_task_id', 'note_task_id', { unique: false });
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
    return sortByPosition(tasks);
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
    // コメント・ラベル関連・アクティビティをカスケード削除
    const [comments, taskLabels, activities] = await Promise.all([
      this._getAllByIndex('comments',   'task_id', id),
      this._getAllByIndex('task_labels', 'task_id', id),
      this._getAllByIndex('activities', 'task_id', id),
    ]);
    // task_relations は双方向インデックスから取得して削除
    await this.deleteRelationsByTask(id).catch(() => {});
    // note_links をカスケード削除
    await this.deleteNoteLinksByTodo(id).catch(() => {});

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['tasks', 'comments', 'task_labels', 'activities'], 'readwrite');
      tx.oncomplete = resolve;
      tx.onerror    = (e) => reject(e.target.error);

      tx.objectStore('tasks').delete(id);
      for (const c  of comments)   tx.objectStore('comments').delete(c.id);
      for (const tl of taskLabels) tx.objectStore('task_labels').delete([tl.task_id, tl.label_id]);
      for (const a  of activities) tx.objectStore('activities').delete(a.id);
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

  async updateComment(id, changes) {
    return new Promise((resolve, reject) => {
      const tx    = this.db.transaction('comments', 'readwrite');
      const store = tx.objectStore('comments');
      const req   = store.get(id);
      req.onsuccess = () => {
        const updated = { ...req.result, ...changes };
        const put = store.put(updated);
        put.onsuccess = () => resolve(updated);
        put.onerror   = () => reject(put.error);
      };
      req.onerror  = () => reject(req.error);
      tx.onerror   = () => reject(tx.error);
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

  async updateLabel(id, name, color) {
    return new Promise((resolve, reject) => {
      const tx  = this.db.transaction('labels', 'readwrite');
      const req = tx.objectStore('labels').put({ id, name, color });
      req.onsuccess = () => resolve();
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

  // ---- Task Relations ----
  /** タスク関係を追加（child: task_id=親/related_id=子, related: min/max 正規化） */
  async addRelation(taskId, relatedId, type) {
    return new Promise((resolve, reject) => {
      const record = type === 'child'
        ? { task_id: taskId, related_id: relatedId, relation_type: 'child' }
        : { task_id: Math.min(taskId, relatedId), related_id: Math.max(taskId, relatedId), relation_type: 'related' };
      const tx  = this.db.transaction('task_relations', 'readwrite');
      const req = tx.objectStore('task_relations').add(record);
      req.onsuccess = () => { record.id = req.result; resolve(record); };
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  /** タスク関係を削除 */
  async deleteRelation(id) {
    return new Promise((resolve, reject) => {
      const tx  = this.db.transaction('task_relations', 'readwrite');
      const req = tx.objectStore('task_relations').delete(id);
      req.onsuccess = resolve;
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  /** タスクの全関係を取得（parent / children / related に分類） */
  async getRelationsByTask(taskId) {
    const [byTaskId, byRelatedId] = await Promise.all([
      this._getAllByIndex('task_relations', 'task_id',   taskId).catch(() => []),
      this._getAllByIndex('task_relations', 'related_id', taskId).catch(() => []),
    ]);
    const allTasks = await this.getAllTasks();
    const taskMap  = new Map(allTasks.map(t => [t.id, t]));

    let parent = null;
    const children = [];
    const related  = [];

    for (const rel of byTaskId) {
      if (rel.relation_type === 'child') {
        // 自分が親 → related_id が子
        const t = taskMap.get(rel.related_id);
        if (t) children.push({ task: t, relationId: rel.id });
      } else {
        // related: task_id = min(自分, 相手) → 相手は related_id
        const t = taskMap.get(rel.related_id);
        if (t) related.push({ task: t, relationId: rel.id });
      }
    }
    for (const rel of byRelatedId) {
      if (rel.relation_type === 'child') {
        // 自分が子 → task_id が親
        const t = taskMap.get(rel.task_id);
        if (t) parent = { task: t, relationId: rel.id };
      } else {
        // related: related_id = max → task_id は相手
        const t = taskMap.get(rel.task_id);
        if (t) related.push({ task: t, relationId: rel.id });
      }
    }
    return { parent, children, related };
  }

  /** タスク削除時に関連するリレーションをカスケード削除 */
  async deleteRelationsByTask(taskId) {
    const [byTaskId, byRelatedId] = await Promise.all([
      this._getAllByIndex('task_relations', 'task_id',   taskId).catch(() => []),
      this._getAllByIndex('task_relations', 'related_id', taskId).catch(() => []),
    ]);
    const all = [...byTaskId, ...byRelatedId];
    if (all.length === 0) return;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('task_relations', 'readwrite');
      tx.oncomplete = resolve;
      tx.onerror    = (e) => reject(e.target.error);
      for (const r of all) tx.objectStore('task_relations').delete(r.id);
    });
  }

  // ---- Note Links ----
  /** ノートタスクとの紐づけを追加 */
  async addNoteLink(todoTaskId, noteTaskId) {
    return new Promise((resolve, reject) => {
      const record = { todo_task_id: todoTaskId, note_task_id: noteTaskId };
      const tx  = this.db.transaction('note_links', 'readwrite');
      const req = tx.objectStore('note_links').add(record);
      req.onsuccess = () => { record.id = req.result; resolve(record); };
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  /** TODO タスクに紐づくノートリンクを取得 */
  async getNoteLinksByTodo(todoTaskId) {
    return this._getAllByIndex('note_links', 'todo_task_id', todoTaskId);
  }

  /** ノートリンクを削除 */
  async deleteNoteLink(id) {
    return new Promise((resolve, reject) => {
      const tx  = this.db.transaction('note_links', 'readwrite');
      const req = tx.objectStore('note_links').delete(id);
      req.onsuccess = resolve;
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  /** タスク削除時に関連するノートリンクをカスケード削除 */
  async deleteNoteLinksByTodo(todoTaskId) {
    const links = await this.getNoteLinksByTodo(todoTaskId).catch(() => []);
    if (links.length === 0) return;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('note_links', 'readwrite');
      tx.oncomplete = resolve;
      tx.onerror    = (e) => reject(e.target.error);
      for (const l of links) tx.objectStore('note_links').delete(l.id);
    });
  }

  // ---- Activities ----
  /** 作業履歴を追加 */
  async addActivity(taskId, type, content) {
    return new Promise((resolve, reject) => {
      const act = { task_id: taskId, type, content, created_at: new Date().toISOString() };
      const tx  = this.db.transaction('activities', 'readwrite');
      const req = tx.objectStore('activities').add(act);
      req.onsuccess = () => { act.id = req.result; resolve(act); };
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  /** タスクの作業履歴を時系列で取得 */
  async getActivitiesByTask(taskId) {
    const acts = await this._getAllByIndex('activities', 'task_id', taskId);
    return acts.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }

  /** 全ストアのデータを一括エクスポート */
  async exportAll() {
    const [tasks, comments, labels, task_labels, columns, activities, task_relations, note_links] = await Promise.all([
      this._getAll('tasks'), this._getAll('comments'),
      this._getAll('labels'), this._getAll('task_labels'),
      this._getAll('columns'), this._getAll('activities'),
      this._getAll('task_relations').catch(() => []),
      this._getAll('note_links').catch(() => []),
    ]);
    return { version: 5, exported_at: new Date().toISOString(), tasks, comments, labels, task_labels, columns, activities, task_relations, note_links };
  }

  /** 全ストアをクリアして data で上書き（put で ID 保持） */
  async importAll(data) {
    const stores = ['tasks', 'comments', 'labels', 'task_labels', 'columns', 'activities', 'task_relations', 'note_links'];
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(stores, 'readwrite');
      tx.oncomplete = resolve;
      tx.onerror    = (e) => reject(e.target.error);
      for (const s of stores) tx.objectStore(s).clear();
      for (const t   of (data.tasks          ?? [])) tx.objectStore('tasks').put(t);
      for (const c   of (data.comments       ?? [])) tx.objectStore('comments').put(c);
      for (const l   of (data.labels         ?? [])) tx.objectStore('labels').put(l);
      for (const tl  of (data.task_labels    ?? [])) tx.objectStore('task_labels').put(tl);
      for (const col of (data.columns        ?? [])) tx.objectStore('columns').put(col);
      for (const a   of (data.activities     ?? [])) tx.objectStore('activities').put(a);
      for (const r   of (data.task_relations ?? [])) tx.objectStore('task_relations').put(r);
      for (const nl  of (data.note_links     ?? [])) tx.objectStore('note_links').put(nl);
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
