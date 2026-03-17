'use strict';

// ==================================================
// NoteDB — note_db IndexedDB Promise ラッパー
// ==================================================
//
// ■ DB情報
//   DB名: note_db  /  バージョン: 1
//
// ■ ストア一覧とスキーマ
//
//   tasks           ノートタスク（案件・チケット等）
//     id*           AutoIncrement PK
//     title         タイトル (string)
//     created_at    作成日時 (unixtime ms)
//     updated_at    更新日時 (unixtime ms)
//
//   fields          フィールド定義（タスクに付く属性の種類）
//     id*           AutoIncrement PK
//     name          フィールド名 (string)
//     type          フィールドタイプ (string) ※下記参照
//     options       選択肢 (配列, タイプにより構造が異なる)
//     position      表示順 (number)
//     width         表示幅 'narrow'|'auto'|'w3'|'wide'|'w5'|'full'
//     listVisible   タスク一覧に値を表示するか (boolean)
//     index: position
//
//     type 一覧:
//       link     外部リンク（複数可）  options: []
//       text     メモ（単一）          options: []
//       date     日付（単一）          options: []
//       select   単一選択バッジ        options: string[]
//       label    複数選択バッジ        options: { name, color }[]
//       todo     TODOリンクセクション  options: [] / visible: 表示制御
//
//   entries         フィールド値（タスク × フィールドの実データ）
//     id*           AutoIncrement PK
//     task_id       → tasks.id
//     field_id      → fields.id
//     label         エントリラベル（linkの表示名など）(string)
//     value         値 (string)
//     created_at    作成日時 (unixtime ms)
//     index: task_id, field_id
//
// ■ テーブル間リレーション
//
//   tasks ──< entries         tasks.id = entries.task_id
//   fields ──< entries        fields.id = entries.field_id
//
//   entries は tasks × fields の交差テーブル。
//   同一 (task_id, field_id) のエントリは type=link のみ複数可。
//   それ以外（text/date/select/label）は基本1件。
//
// ■ 外部DB連携
//
//   kanban_db.note_links ストアに { todo_task_id, note_task_id } で
//   TODO タスクとの紐づけを保存（この DB は直接関与しない）。
//   note.js 内の _openKanbanDB() で cross-DB アクセスして参照。
//
// ==================================================

const NoteDB = (() => {
  const DB_NAME = 'note_db';
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
      req.onsuccess = (e) => {
        _db = e.target.result;
        resolve(_db);
      };
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
    return sortByPosition(fields);
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
      { name: 'TODO',           type: 'todo',   options: [], width: 'full', listVisible: false, visible: true },
    ];
    for (let i = 0; i < defaults.length; i++) {
      await _add('fields', { ...defaults[i], position: i });
    }
  }

  // TODOフィールドが未存在の場合に末尾へ追加（既存ユーザー向けマイグレーション）
  async function ensureTodoField() {
    const existing = await getAllFields();
    if (existing.some(f => f.type === 'todo')) return;
    const maxPos = existing.length > 0 ? Math.max(...existing.map(f => f.position)) : -1;
    await _add('fields', {
      name: 'TODO', type: 'todo', options: [],
      position: maxPos + 1, width: 'full', listVisible: false, visible: true,
    });
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
    return { type: 'note_export', version: 1, tasks, fields, entries };
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
    getAllFields, addField, updateField, deleteField, initDefaultFields, ensureTodoField,
    getAllEntries, getEntriesByTask, addEntry, updateEntry, deleteEntry,
    exportData, importData,
  };
})();
