'use strict';

/**
 * TextDB - テキスト処理ツール共通 IndexedDB
 *
 * スキーマ:
 *   DB名: tools_db  version: 1
 *   ストア: regex_patterns
 *     id* (autoIncrement)
 *     name: string
 *     pattern: string
 *     flags: string (例: "gi")
 *     test_text: string
 *     created_at: ISO8601
 *     position: number
 */

class TextDB {
  constructor() {
    this._db = null;
    this._dbName = 'tools_db';
    this._version = 1;
  }

  // DB を開く（初回は自動マイグレーション）
  open() {
    return new Promise((resolve, reject) => {
      if (this._db) { resolve(this._db); return; }
      const req = indexedDB.open(this._dbName, this._version);

      req.onupgradeneeded = e => {
        const db = e.target.result;
        // regex_patterns ストア
        if (!db.objectStoreNames.contains('regex_patterns')) {
          const store = db.createObjectStore('regex_patterns', { keyPath: 'id', autoIncrement: true });
          store.createIndex('position', 'position', { unique: false });
        }
      };

      req.onsuccess = e => {
        this._db = e.target.result;
        resolve(this._db);
      };

      req.onerror = e => reject(e.target.error);
    });
  }

  // 全パターンを position 昇順で取得
  getAllPatterns() {
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction('regex_patterns', 'readonly');
      const store = tx.objectStore('regex_patterns');
      const index = store.index('position');
      const req = index.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = e => reject(e.target.error);
    });
  }

  // パターンを追加
  addPattern(obj) {
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction('regex_patterns', 'readwrite');
      const store = tx.objectStore('regex_patterns');
      const req = store.add(obj);
      req.onsuccess = () => resolve(req.result);
      req.onerror = e => reject(e.target.error);
    });
  }

  // パターンを削除
  deletePattern(id) {
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction('regex_patterns', 'readwrite');
      const store = tx.objectStore('regex_patterns');
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = e => reject(e.target.error);
    });
  }
}
