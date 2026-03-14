/**
 * WbsDB - WBS（作業分解構造）の IndexedDB ラッパー
 *
 * スキーマ:
 *   tasks: {
 *     id        (PK, autoIncrement),
 *     title     string,
 *     level     number 0-4（インデントレベル）,
 *     position  number（表示順）,
 *     plan_start  string 'YYYY-MM-DD' | '',
 *     plan_days   number（営業日数, 0=未設定）,
 *     actual_start string 'YYYY-MM-DD' | '',
 *     actual_days  number（0=未設定）,
 *     progress  number 0-100,
 *     status    string 'not_started'|'in_progress'|'done'|'on_hold',
 *     memo      string
 *   }
 */
class WbsDB {
  static DB_NAME = 'wbs_db';
  static VERSION = 1;

  constructor() {
    this._db = null;
  }

  open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(WbsDB.DB_NAME, WbsDB.VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('tasks')) {
          const store = db.createObjectStore('tasks', { keyPath: 'id', autoIncrement: true });
          store.createIndex('position', 'position', { unique: false });
        }
      };
      req.onsuccess = e => { this._db = e.target.result; resolve(this); };
      req.onerror = e => reject(e.target.error);
    });
  }

  getAllTasks() {
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction('tasks', 'readonly');
      const req = tx.objectStore('tasks').index('position').getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  addTask(task) {
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction('tasks', 'readwrite');
      const req = tx.objectStore('tasks').add(task);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  updateTask(task) {
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction('tasks', 'readwrite');
      const req = tx.objectStore('tasks').put(task);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  deleteTask(id) {
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction('tasks', 'readwrite');
      const req = tx.objectStore('tasks').delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /** 複数タスクを一括更新（並び替え時等） */
  bulkUpdate(tasks) {
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction('tasks', 'readwrite');
      const store = tx.objectStore('tasks');
      tasks.forEach(t => store.put(t));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /** 全タスクを JSON エクスポート */
  async exportAll() {
    const tasks = await this.getAllTasks();
    return JSON.stringify({ type: 'wbs_export', version: 1, tasks }, null, 2);
  }

  /** JSON からインポート（既存データを全削除して置換） */
  async importAll(jsonStr) {
    const data = JSON.parse(jsonStr);
    if (data.type !== 'wbs_export') throw new Error('不正なファイル形式です');
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction('tasks', 'readwrite');
      const store = tx.objectStore('tasks');
      store.clear();
      (data.tasks || []).forEach(t => store.put(t));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
