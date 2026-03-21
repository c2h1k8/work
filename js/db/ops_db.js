'use strict';

// ==================================================
// OpsDB — 運用ツール用 IndexedDB
// ==================================================
//
// DB名: ops_db  version: 1
//
// ストア:
//   ports        (keyPath: id, autoIncrement)
//     id        : number  — 自動採番
//     port      : number  — ポート番号
//     protocol  : string  — 'TCP' | 'UDP' | 'both'
//     service   : string  — サービス名
//     memo      : string  — メモ（任意）
//     position  : number  — 並び順
//
//   certificates (keyPath: id, autoIncrement) ← SSL トラッカー用（将来拡張）
//     id        : number
//     domain    : string
//     expiry    : string  — YYYY-MM-DD
//     memo      : string
//     position  : number
//
// ==================================================

class OpsDB {
  constructor() {
    this._db = null;
  }

  // --------------------------------------------------
  // DB を開く
  // --------------------------------------------------

  open() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('ops_db', 1);

      req.onupgradeneeded = e => {
        const db = e.target.result;
        // ports ストア
        if (!db.objectStoreNames.contains('ports')) {
          db.createObjectStore('ports', { keyPath: 'id', autoIncrement: true });
        }
        // certificates ストア（SSL トラッカー用・将来拡張）
        if (!db.objectStoreNames.contains('certificates')) {
          db.createObjectStore('certificates', { keyPath: 'id', autoIncrement: true });
        }
      };

      req.onsuccess = e => {
        this._db = e.target.result;
        resolve(this._db);
      };
      req.onerror = () => reject(req.error);
    });
  }

  // --------------------------------------------------
  // ポート番号 CRUD
  // --------------------------------------------------

  /** カスタムポートを全件取得（position 昇順） */
  getPorts() {
    return this.open().then(db => new Promise((resolve, reject) => {
      const tx  = db.transaction('ports', 'readonly');
      const req = tx.objectStore('ports').getAll();
      req.onsuccess = () => resolve(req.result.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)));
      req.onerror   = () => reject(req.error);
    }));
  }

  /** カスタムポートを追加 */
  addPort(port) {
    return this.open().then(db => new Promise((resolve, reject) => {
      const tx  = db.transaction('ports', 'readwrite');
      const req = tx.objectStore('ports').add(port);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    }));
  }

  /** カスタムポートを更新 */
  updatePort(port) {
    return this.open().then(db => new Promise((resolve, reject) => {
      const tx  = db.transaction('ports', 'readwrite');
      const req = tx.objectStore('ports').put(port);
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    }));
  }

  /** カスタムポートを削除 */
  deletePort(id) {
    return this.open().then(db => new Promise((resolve, reject) => {
      const tx  = db.transaction('ports', 'readwrite');
      const req = tx.objectStore('ports').delete(id);
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    }));
  }
}

// グローバル公開
const opsDB = new OpsDB();
