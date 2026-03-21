// ==================================================
// SnippetDB - コードスニペット管理 IndexedDB 操作クラス
// ==================================================
//
// DB名: snippet_db  version: 1
//
// ストア:
//   snippets
//     id          : number (autoIncrement, keyPath)
//     title       : string
//     language    : string
//     tags        : string[]
//     description : string
//     code        : string
//     created_at  : string (ISO8601)
//     updated_at  : string (ISO8601)
//     position    : number (追加順インデックス)
//
// ==================================================

class SnippetDB {
  constructor() {
    this._db = null;
  }

  /** DBを開く */
  open() {
    return new Promise((resolve, reject) => {
      if (this._db) { resolve(this._db); return; }
      const req = indexedDB.open('snippet_db', 1);

      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('snippets')) {
          const store = db.createObjectStore('snippets', { keyPath: 'id', autoIncrement: true });
          store.createIndex('language', 'language', { unique: false });
          store.createIndex('updated_at', 'updated_at', { unique: false });
        }
      };

      req.onsuccess = e => { this._db = e.target.result; resolve(this._db); };
      req.onerror   = e => reject(e.target.error);
    });
  }

  /** スニペットを追加する */
  addSnippet(snippet) {
    return new Promise((resolve, reject) => {
      const tx  = this._db.transaction('snippets', 'readwrite');
      const req = tx.objectStore('snippets').add(snippet);
      req.onsuccess = e => resolve({ ...snippet, id: e.target.result });
      req.onerror   = e => reject(e.target.error);
    });
  }

  /** スニペットを更新する */
  updateSnippet(snippet) {
    return new Promise((resolve, reject) => {
      const tx  = this._db.transaction('snippets', 'readwrite');
      const req = tx.objectStore('snippets').put(snippet);
      req.onsuccess = () => resolve(snippet);
      req.onerror   = e => reject(e.target.error);
    });
  }

  /** スニペットを削除する */
  deleteSnippet(id) {
    return new Promise((resolve, reject) => {
      const tx  = this._db.transaction('snippets', 'readwrite');
      const req = tx.objectStore('snippets').delete(id);
      req.onsuccess = () => resolve();
      req.onerror   = e => reject(e.target.error);
    });
  }

  /** 全スニペットを取得する（id昇順） */
  getAllSnippets() {
    return new Promise((resolve, reject) => {
      const tx  = this._db.transaction('snippets', 'readonly');
      const req = tx.objectStore('snippets').getAll();
      req.onsuccess = e => resolve(e.target.result.sort((a, b) => a.id - b.id));
      req.onerror   = e => reject(e.target.error);
    });
  }

  /** JSONでエクスポート */
  async exportAll() {
    const snippets = await this.getAllSnippets();
    return { type: 'snippet_export', version: 1, snippets };
  }

  /** JSONからインポート（replace=trueで既存データを削除） */
  async importAll(data, replace = false) {
    if (data.type !== 'snippet_export') throw new Error('フォーマットが不正です');
    const snippets = data.snippets || [];

    return new Promise((resolve, reject) => {
      const tx    = this._db.transaction('snippets', 'readwrite');
      const store = tx.objectStore('snippets');

      if (replace) {
        store.clear();
      }

      snippets.forEach(s => {
        const { id: _id, ...rest } = s;
        store.add(rest);
      });

      tx.oncomplete = () => resolve(snippets.length);
      tx.onerror    = e => reject(e.target.error);
    });
  }
}
