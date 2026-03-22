'use strict';

// ==================================================
// データ管理（エクスポート/インポート・全データ一括バックアップ）
// ==================================================

/** dashboard_db（共有DB）から指定インスタンスのデータを全削除 */
async function _deleteDashboardInstance(instanceId) {
  const db = await new Promise((resolve) => {
    const req = indexedDB.open('dashboard_db');
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = () => resolve(null);
    // DBが存在しない場合（oldVersion===0）は作成しない
    req.onupgradeneeded = (e) => { if (e.oldVersion === 0) e.target.transaction.abort(); };
  });
  if (!db || !db.objectStoreNames.contains('sections')) {
    if (db) db.close();
    return;
  }
  try {
    const os = db.transaction('sections').objectStore('sections');
    const sections = await new Promise((res) => {
      if (os.indexNames.contains('instance_id')) {
        const req = os.index('instance_id').getAll(IDBKeyRange.only(instanceId));
        req.onsuccess = () => res(req.result);
        req.onerror = () => res([]);
      } else {
        const req = os.getAll();
        req.onsuccess = () => res(req.result.filter(s => s.instance_id === instanceId));
        req.onerror = () => res([]);
      }
    });
    for (const section of sections) {
      const items = await new Promise((res) => {
        const req = db.transaction('items').objectStore('items')
          .index('section_id').getAll(IDBKeyRange.only(section.id));
        req.onsuccess = () => res(req.result);
        req.onerror = () => res([]);
      });
      await new Promise((res, rej) => {
        const tx = db.transaction(['sections', 'items'], 'readwrite');
        tx.objectStore('sections').delete(section.id);
        items.forEach(item => tx.objectStore('items').delete(item.id));
        tx.oncomplete = res;
        tx.onerror = () => rej(tx.error);
      });
    }
  } finally {
    db.close();
  }
}

// ==================================================
// 全データ一括バックアップ（全DB対象）
// ==================================================

/** 指定 DB を開いて指定ストアの全データを取得する */
async function _dumpDB(dbName, storeNames) {
  return new Promise((resolve) => {
    const req = indexedDB.open(dbName);
    // DB が存在しない場合は作成しない（upgrade をキャンセル）
    req.onupgradeneeded = (e) => { if (e.oldVersion === 0) { e.target.transaction.abort(); } };
    req.onerror = () => resolve(null);
    req.onsuccess = (e) => {
      const db = e.target.result;
      const data = {};
      const existing = storeNames.filter(s => db.objectStoreNames.contains(s));
      if (existing.length === 0) { db.close(); resolve(data); return; }

      let done = 0;
      existing.forEach(storeName => {
        const r = db.transaction(storeName).objectStore(storeName).getAll();
        r.onsuccess = () => {
          data[storeName] = r.result;
          if (++done === existing.length) { db.close(); resolve(data); }
        };
        r.onerror = () => {
          data[storeName] = [];
          if (++done === existing.length) { db.close(); resolve(data); }
        };
      });
    };
  });
}

/** 指定 DB を開いてストアをクリアしデータを投入する */
async function _loadDB(dbName, version, onUpgrade, storeData) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, version);
    req.onupgradeneeded = onUpgrade;
    req.onerror = () => reject(req.error);
    req.onsuccess = async (e) => {
      const db = e.target.result;
      try {
        const stores = Object.keys(storeData).filter(s => db.objectStoreNames.contains(s));
        if (stores.length > 0) {
          await new Promise((res, rej) => {
            const tx = db.transaction(stores, 'readwrite');
            stores.forEach(s => {
              tx.objectStore(s).clear();
              (storeData[s] || []).forEach(rec => tx.objectStore(s).put(rec));
            });
            tx.oncomplete = res;
            tx.onerror = () => rej(tx.error);
          });
        }
        db.close();
        resolve();
      } catch (err) { db.close(); reject(err); }
    };
  });
}

/** 全 DB（app_db/kanban_db/note_db/sql_db/wbs_db/snippet_db/dashboard_db）を一括エクスポート */
async function backupAllData() {
  const exportBtn = document.querySelector('.settings-backup-export-btn');
  if (exportBtn) { exportBtn.disabled = true; exportBtn.textContent = '準備中...'; }

  try {
    const [appData, kanbanData, noteData, sqlData, wbsData, snippetData, dashboardData] = await Promise.all([
      _dumpDB('app_db',       ['settings']),
      _dumpDB('kanban_db',    ['tasks', 'columns', 'labels', 'task_labels', 'comments', 'activities', 'task_relations', 'note_links', 'templates', 'archives', 'dependencies']),
      _dumpDB('note_db',      ['tasks', 'fields', 'entries']),
      _dumpDB('sql_db',       ['envs', 'table_memos']),
      _dumpDB('wbs_db',       ['tasks']),
      _dumpDB('snippet_db',   ['snippets']),
      _dumpDB('dashboard_db', ['sections', 'items', 'presets', 'app_config']),
    ]);

    const backup = {
      type: 'full_backup',
      version: 1,
      timestamp: new Date().toISOString(),
      databases: {
        app:       appData       || {},
        kanban:    kanbanData    || {},
        note:      noteData      || {},
        sql:       sqlData       || {},
        wbs:       wbsData       || {},
        snippet:   snippetData   || {},
        dashboard: dashboardData || {},
      },
    };

    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    const now = new Date(), p = n => String(n).padStart(2, '0');
    const ts  = `${now.getFullYear()}${p(now.getMonth()+1)}${p(now.getDate())}_${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
    a.download = `mytools_backup_${ts}.json`;
    a.click();
    URL.revokeObjectURL(url);
    Toast.show('全データのバックアップが完了しました。');
  } catch (err) {
    console.error(err);
    Toast.show('バックアップに失敗しました: ' + err.message, 'error');
  } finally {
    if (exportBtn) { exportBtn.disabled = false; exportBtn.innerHTML = `${Icons.export} バックアップ`; }
  }
}

/** バックアップ JSON から全 DB を復元する */
async function restoreAllData() {
  const input = document.createElement('input');
  input.type  = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    let data;
    try { data = JSON.parse(await file.text()); } catch { Toast.show('JSONの解析に失敗しました', 'error'); return; }

    if (data.type !== 'full_backup') {
      Toast.show('全データバックアップファイルではありません（type: "full_backup" が必要です）', 'error');
      return;
    }
    if (!confirm('現在の全データが上書きされます。この操作は元に戻せません。\nよろしいですか？')) return;

    const importBtn = document.querySelector('.settings-backup-import-btn');
    if (importBtn) { importBtn.disabled = true; importBtn.textContent = '復元中...'; }

    try {
      const dbs = data.databases || {};

      // app_db: settings ストア（TAB_CONFIG など）
      if (dbs.app && Object.keys(dbs.app).length > 0) {
        await _loadDB('app_db', 1, (ev) => {
          if (!ev.target.result.objectStoreNames.contains('settings')) {
            ev.target.result.createObjectStore('settings', { keyPath: 'name' });
          }
        }, dbs.app);
      }

      // kanban_db
      if (dbs.kanban && Object.keys(dbs.kanban).length > 0) {
        await _loadDB('kanban_db', 2, (ev) => {
          const idb = ev.target.result;
          const stores = {
            tasks:          () => { const s = idb.createObjectStore('tasks', { keyPath: 'id', autoIncrement: true }); s.createIndex('column', 'column'); s.createIndex('position', 'position'); },
            comments:       () => { const s = idb.createObjectStore('comments', { keyPath: 'id', autoIncrement: true }); s.createIndex('task_id', 'task_id'); },
            labels:         () => idb.createObjectStore('labels', { keyPath: 'id', autoIncrement: true }),
            task_labels:    () => { const s = idb.createObjectStore('task_labels', { keyPath: ['task_id', 'label_id'] }); s.createIndex('task_id', 'task_id'); },
            columns:        () => { const s = idb.createObjectStore('columns', { keyPath: 'id', autoIncrement: true }); s.createIndex('key', 'key', { unique: true }); s.createIndex('position', 'position'); },
            activities:     () => { const s = idb.createObjectStore('activities', { keyPath: 'id', autoIncrement: true }); s.createIndex('task_id', 'task_id'); },
            task_relations: () => { const s = idb.createObjectStore('task_relations', { keyPath: 'id', autoIncrement: true }); s.createIndex('task_id', 'task_id'); s.createIndex('related_id', 'related_id'); },
            note_links:     () => { const s = idb.createObjectStore('note_links', { keyPath: 'id', autoIncrement: true }); s.createIndex('todo_task_id', 'todo_task_id'); s.createIndex('note_task_id', 'note_task_id'); },
            templates:      () => { const s = idb.createObjectStore('templates', { keyPath: 'id', autoIncrement: true }); s.createIndex('position', 'position'); },
            archives:       () => { const s = idb.createObjectStore('archives', { keyPath: 'id', autoIncrement: true }); s.createIndex('archived_at', 'archived_at'); },
            dependencies:   () => { const s = idb.createObjectStore('dependencies', { keyPath: 'id', autoIncrement: true }); s.createIndex('from_task_id', 'from_task_id'); s.createIndex('to_task_id', 'to_task_id'); },
          };
          Object.entries(stores).forEach(([name, create]) => { if (!idb.objectStoreNames.contains(name)) create(); });
        }, dbs.kanban);
      }

      // note_db
      if (dbs.note && Object.keys(dbs.note).length > 0) {
        await _loadDB('note_db', 1, (ev) => {
          const idb = ev.target.result;
          if (!idb.objectStoreNames.contains('tasks')) idb.createObjectStore('tasks', { keyPath: 'id', autoIncrement: true });
          if (!idb.objectStoreNames.contains('fields')) { const s = idb.createObjectStore('fields', { keyPath: 'id', autoIncrement: true }); s.createIndex('position', 'position'); }
          if (!idb.objectStoreNames.contains('entries')) { const s = idb.createObjectStore('entries', { keyPath: 'id', autoIncrement: true }); s.createIndex('task_id', 'task_id'); s.createIndex('field_id', 'field_id'); }
        }, dbs.note);
      }

      // sql_db
      if (dbs.sql && Object.keys(dbs.sql).length > 0) {
        await _loadDB('sql_db', 2, (ev) => {
          const idb = ev.target.result;
          if (!idb.objectStoreNames.contains('envs')) idb.createObjectStore('envs', { keyPath: 'id', autoIncrement: true });
          if (!idb.objectStoreNames.contains('table_memos')) { const s = idb.createObjectStore('table_memos', { keyPath: 'id', autoIncrement: true }); s.createIndex('table_name', 'table_name'); }
        }, dbs.sql);
      }

      // wbs_db
      if (dbs.wbs && Object.keys(dbs.wbs).length > 0) {
        await _loadDB('wbs_db', 1, (ev) => {
          const idb = ev.target.result;
          if (!idb.objectStoreNames.contains('tasks')) { const s = idb.createObjectStore('tasks', { keyPath: 'id', autoIncrement: true }); s.createIndex('position', 'position'); }
        }, dbs.wbs);
      }

      // snippet_db
      if (dbs.snippet && Object.keys(dbs.snippet).length > 0) {
        await _loadDB('snippet_db', 1, (ev) => {
          const idb = ev.target.result;
          if (!idb.objectStoreNames.contains('snippets')) { const s = idb.createObjectStore('snippets', { keyPath: 'id', autoIncrement: true }); s.createIndex('language', 'language'); s.createIndex('updated_at', 'updated_at'); }
        }, dbs.snippet);
      }

      // dashboard_db
      if (dbs.dashboard && Object.keys(dbs.dashboard).length > 0) {
        await _loadDB('dashboard_db', 2, (ev) => {
          const idb = ev.target.result;
          if (!idb.objectStoreNames.contains('sections')) { const ss = idb.createObjectStore('sections', { keyPath: 'id', autoIncrement: true }); ss.createIndex('position', 'position'); ss.createIndex('instance_id', 'instance_id'); }
          if (!idb.objectStoreNames.contains('items')) { const is = idb.createObjectStore('items', { keyPath: 'id', autoIncrement: true }); is.createIndex('section_id', 'section_id'); is.createIndex('position', 'position'); }
          if (!idb.objectStoreNames.contains('app_config')) idb.createObjectStore('app_config', { keyPath: 'name' });
          if (!idb.objectStoreNames.contains('presets')) { const ps = idb.createObjectStore('presets', { keyPath: 'id', autoIncrement: true }); ps.createIndex('instance_id', 'instance_id'); ps.createIndex('position', 'position'); }
        }, dbs.dashboard);
      }

      Toast.show('全データの復元が完了しました。ページを再読み込みします。');
      location.reload();
    } catch (err) {
      console.error(err);
      Toast.show('復元に失敗しました: ' + err.message, 'error');
      if (importBtn) { importBtn.disabled = false; importBtn.innerHTML = `${Icons.import} 復元`; }
    }
  };
  input.click();
}
