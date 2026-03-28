'use strict';

/**
 * ActivityDB - アクティビティログ IndexedDB
 *
 * スキーマ:
 *   DB名: activity_db  version: 1
 *   ストア: logs
 *     id*          autoIncrement (keyPath)
 *     page:        string ('todo' / 'note' / 'snippet' / 'dashboard' / 'sql' / 'wbs')
 *     action:      string ('create' / 'delete' / 'complete' / 'update' / 'move')
 *     target_type: string ('task' / 'note' / 'snippet' / 'section' / 'item' / 'env')
 *     target_id:   string | number
 *     summary:     string（例: 'タスク「XXX」を追加'）
 *     created_at:  string（ISO 8601）
 *
 * インデックス:
 *   page, created_at, [page, created_at]
 */

const ActivityDB = {
  DB_NAME: 'activity_db',
  VERSION: 1,

  _open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(ActivityDB.DB_NAME, ActivityDB.VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('logs')) {
          const store = db.createObjectStore('logs', { keyPath: 'id', autoIncrement: true });
          store.createIndex('page',             'page',                    { unique: false });
          store.createIndex('created_at',       'created_at',              { unique: false });
          store.createIndex('page_created_at',  ['page', 'created_at'],    { unique: false });
        }
      };
      req.onsuccess = e => resolve(e.target.result);
      req.onerror   = e => reject(e.target.error);
    });
  },

  /** ログを1件追加する */
  async add(record) {
    const db = await ActivityDB._open();
    return new Promise((resolve, reject) => {
      const req = db.transaction('logs', 'readwrite')
        .objectStore('logs').add(record);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  },

  /**
   * ログをフィルタリングして取得する（新しい順）
   * @param {Object} opts
   * @param {string}  [opts.page]       ページ絞り込み（未指定で全ページ）
   * @param {string}  [opts.startDate]  開始日 YYYY-MM-DD
   * @param {string}  [opts.endDate]    終了日 YYYY-MM-DD
   * @param {number}  [opts.limit=50]
   * @param {number}  [opts.offset=0]
   */
  async query({ page, startDate, endDate, limit = 50, offset = 0 } = {}) {
    const db = await ActivityDB._open();
    return new Promise((resolve, reject) => {
      const store = db.transaction('logs', 'readonly').objectStore('logs');
      const index = store.index('created_at');
      const results = [];
      let skipped = 0;

      // 日付範囲の IDBKeyRange を構築
      // created_at は UTC ISO 文字列だが、ユーザーが指定する日付はローカル日付なので
      // ローカル時間の 00:00:00 / 23:59:59 を UTC に変換して比較する
      const _toLocalISO = (dateStr, endOfDay) => {
        const [y, m, d] = dateStr.split('-').map(Number);
        return endOfDay
          ? new Date(y, m - 1, d, 23, 59, 59, 999).toISOString()
          : new Date(y, m - 1, d,  0,  0,  0,   0).toISOString();
      };
      let range = null;
      if (startDate || endDate) {
        const lower = startDate ? _toLocalISO(startDate, false) : undefined;
        const upper = endDate   ? _toLocalISO(endDate,   true)  : undefined;
        if (lower && upper) range = IDBKeyRange.bound(lower, upper);
        else if (lower)     range = IDBKeyRange.lowerBound(lower);
        else                range = IDBKeyRange.upperBound(upper);
      }

      // 降順（新しい順）でカーソルを開く
      const req = index.openCursor(range, 'prev');
      req.onsuccess = e => {
        const cursor = e.target.result;
        if (!cursor || results.length >= limit) { resolve(results); return; }
        const log = cursor.value;
        if (!page || log.page === page) {
          if (skipped >= offset) {
            results.push(log);
          } else {
            skipped++;
          }
        }
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    });
  },

  /**
   * 指定日数以上前のログを一括削除する（自動クリーンアップ用）
   * @param {number} days 保持日数（デフォルト 90）
   */
  async cleanup(days = 90) {
    const db = await ActivityDB._open();
    return new Promise((resolve, reject) => {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const range  = IDBKeyRange.upperBound(cutoff);
      const tx     = db.transaction('logs', 'readwrite');
      const req    = tx.objectStore('logs').index('created_at').openCursor(range);
      req.onsuccess = e => {
        const cursor = e.target.result;
        if (!cursor) { resolve(); return; }
        cursor.delete();
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    });
  },
};
