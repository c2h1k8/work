'use strict';

/**
 * AppDB - アプリ共通設定 IndexedDB
 *
 * スキーマ:
 *   DB名: app_db  version: 1
 *   ストア: settings
 *     name* (keyPath)
 *     value: any
 */

const AppDB = {
  DB_NAME: "app_db",
  VERSION: 1,

  _open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(AppDB.DB_NAME, AppDB.VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "name" });
        }
      };
      req.onsuccess = e => resolve(e.target.result);
      req.onerror = e => reject(e.target.error);
    });
  },

  async get(name) {
    const db = await AppDB._open();
    return new Promise((resolve, reject) => {
      const req = db.transaction("settings", "readonly")
        .objectStore("settings").get(name);
      req.onsuccess = () => resolve(req.result?.value ?? null);
      req.onerror = () => reject(req.error);
    });
  },

  async set(name, value) {
    const db = await AppDB._open();
    return new Promise((resolve, reject) => {
      const req = db.transaction("settings", "readwrite")
        .objectStore("settings").put({ name, value });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },
};
