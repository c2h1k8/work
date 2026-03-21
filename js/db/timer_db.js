// ==================================================
// TimerDB - 定型作業タイマー IndexedDB 操作クラス
// ==================================================
//
// DB名: timer_db  version: 1
//
// ストア:
//   sessions
//     id           : number (autoIncrement, keyPath)
//     task_name    : string
//     tag          : string
//     notes        : string
//     duration_sec : number
//     started_at   : string (ISO8601)
//     ended_at     : string (ISO8601)
//
//   presets
//     id           : number (autoIncrement, keyPath)
//     name         : string
//     work_sec     : number
//     break_sec    : number
//     position     : number
//
// ==================================================

class TimerDB {
  constructor() {
    this._db = null;
  }

  /** DBを開く */
  open() {
    return new Promise((resolve, reject) => {
      if (this._db) { resolve(this._db); return; }
      const req = indexedDB.open('timer_db', 1);

      req.onupgradeneeded = e => {
        const db = e.target.result;

        if (!db.objectStoreNames.contains('sessions')) {
          const ss = db.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true });
          ss.createIndex('started_at', 'started_at', { unique: false });
          ss.createIndex('tag', 'tag', { unique: false });
        }

        if (!db.objectStoreNames.contains('presets')) {
          db.createObjectStore('presets', { keyPath: 'id', autoIncrement: true });
        }
      };

      req.onsuccess = e => { this._db = e.target.result; resolve(this._db); };
      req.onerror   = e => reject(e.target.error);
    });
  }

  // ----- セッション -----

  /** セッションを追加する */
  addSession(session) {
    return new Promise((resolve, reject) => {
      const tx  = this._db.transaction('sessions', 'readwrite');
      const req = tx.objectStore('sessions').add(session);
      req.onsuccess = e => resolve({ ...session, id: e.target.result });
      req.onerror   = e => reject(e.target.error);
    });
  }

  /** セッションを削除する */
  deleteSession(id) {
    return new Promise((resolve, reject) => {
      const tx  = this._db.transaction('sessions', 'readwrite');
      const req = tx.objectStore('sessions').delete(id);
      req.onsuccess = () => resolve();
      req.onerror   = e => reject(e.target.error);
    });
  }

  /** 全セッションを取得する */
  getAllSessions() {
    return new Promise((resolve, reject) => {
      const tx  = this._db.transaction('sessions', 'readonly');
      const req = tx.objectStore('sessions').getAll();
      req.onsuccess = e => resolve(e.target.result);
      req.onerror   = e => reject(e.target.error);
    });
  }

  /** 指定日のセッションを取得する（YYYY-MM-DD） */
  async getSessionsByDate(dateStr) {
    const all = await this.getAllSessions();
    return all.filter(s => s.started_at.slice(0, 10) === dateStr);
  }

  /** 指定期間のセッションを取得する */
  async getSessionsInRange(fromStr, toStr) {
    const all = await this.getAllSessions();
    return all.filter(s => s.started_at.slice(0, 10) >= fromStr && s.started_at.slice(0, 10) <= toStr);
  }

  // ----- プリセット -----

  /** プリセットを追加する */
  addPreset(preset) {
    return new Promise((resolve, reject) => {
      const tx  = this._db.transaction('presets', 'readwrite');
      const req = tx.objectStore('presets').add(preset);
      req.onsuccess = e => resolve({ ...preset, id: e.target.result });
      req.onerror   = e => reject(e.target.error);
    });
  }

  /** プリセットを更新する */
  updatePreset(preset) {
    return new Promise((resolve, reject) => {
      const tx  = this._db.transaction('presets', 'readwrite');
      const req = tx.objectStore('presets').put(preset);
      req.onsuccess = () => resolve(preset);
      req.onerror   = e => reject(e.target.error);
    });
  }

  /** プリセットを削除する */
  deletePreset(id) {
    return new Promise((resolve, reject) => {
      const tx  = this._db.transaction('presets', 'readwrite');
      const req = tx.objectStore('presets').delete(id);
      req.onsuccess = () => resolve();
      req.onerror   = e => reject(e.target.error);
    });
  }

  /** プリセット一覧を取得する（position昇順） */
  getPresets() {
    return new Promise((resolve, reject) => {
      const tx  = this._db.transaction('presets', 'readonly');
      const req = tx.objectStore('presets').getAll();
      req.onsuccess = e => resolve(e.target.result.sort((a, b) => a.position - b.position));
      req.onerror   = e => reject(e.target.error);
    });
  }

  // ----- エクスポート/インポート -----

  async exportAll() {
    const [sessions, presets] = await Promise.all([this.getAllSessions(), this.getPresets()]);
    return { type: 'timer_export', version: 1, sessions, presets };
  }

  async importAll(data, replace = false) {
    if (data.type !== 'timer_export') throw new Error('フォーマットが不正です');
    const sessions = data.sessions || [];
    const presets  = data.presets  || [];

    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(['sessions', 'presets'], 'readwrite');

      if (replace) {
        tx.objectStore('sessions').clear();
        tx.objectStore('presets').clear();
      }

      sessions.forEach(({ id: _id, ...rest }) => tx.objectStore('sessions').add(rest));
      presets.forEach(({ id: _id, ...rest })  => tx.objectStore('presets').add(rest));

      tx.oncomplete = () => resolve({ sessions: sessions.length, presets: presets.length });
      tx.onerror    = e => reject(e.target.error);
    });
  }
}
