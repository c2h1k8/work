'use strict';

/**
 * ActivityLogger - アクティビティログ記録ユーティリティ
 * 各ページの主要操作を activity_db に非同期で記録する。
 * ActivityDB クラス（js/db/activity_db.js）が先に読み込まれている必要がある。
 *
 * ページ単位の記録オン/オフ設定:
 *   app_db の settings ストアに { name: 'activity_log_config', value: { disabledPages: [...] } } として保存。
 *   初期化時にキャッシュし、log() 呼び出し時にチェックする。
 */
const ActivityLogger = {
  /** @type {Set<string>|null} 無効化されたページの Set（null = 未ロード） */
  _disabledPages: null,

  /**
   * 設定を app_db から読み込みキャッシュする
   * index.html 以外のページでも app_db を直接参照する
   */
  async _loadConfig() {
    try {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('app_db', 1);
        req.onsuccess = e => resolve(e.target.result);
        req.onerror   = e => reject(e.target.error);
        // app_db が未作成の場合（初回起動時）はストアを作らず閉じる
        req.onupgradeneeded = e => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('settings')) {
            db.createObjectStore('settings', { keyPath: 'name' });
          }
        };
      });
      const record = await new Promise((resolve, reject) => {
        const tx  = db.transaction('settings', 'readonly');
        const req = tx.objectStore('settings').get('activity_log_config');
        req.onsuccess = () => resolve(req.result);
        req.onerror   = () => reject(req.error);
      });
      const config = record?.value;
      ActivityLogger._disabledPages = new Set(config?.disabledPages || []);
    } catch {
      // 読み込み失敗時は全ページ有効（デフォルト）
      ActivityLogger._disabledPages = new Set();
    }
  },

  /**
   * 設定を保存する（設定画面から呼ばれる）
   * @param {string[]} disabledPages 無効化するページ識別子の配列
   */
  async saveConfig(disabledPages) {
    ActivityLogger._disabledPages = new Set(disabledPages);
    try {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('app_db', 1);
        req.onsuccess = e => resolve(e.target.result);
        req.onerror   = e => reject(e.target.error);
      });
      await new Promise((resolve, reject) => {
        const tx  = db.transaction('settings', 'readwrite');
        const req = tx.objectStore('settings').put({
          name: 'activity_log_config',
          value: { disabledPages },
        });
        req.onsuccess = () => resolve();
        req.onerror   = () => reject(req.error);
      });
    } catch (e) {
      console.warn('[ActivityLogger] 設定保存失敗:', e);
    }
  },

  /**
   * アクティビティを記録する（Fire-and-forget）
   * @param {string} page       ページ識別子 ('todo'|'note'|'snippet'|'dashboard'|'sql'|'wbs')
   * @param {string} action     操作種別 ('create'|'delete'|'archive'|'complete'|'update'|'move')
   * @param {string} targetType 対象種別 ('task'|'note'|'snippet'|'section'|'item'|'env'|'table_memo')
   * @param {string|number} targetId 対象ID
   * @param {string} summary    表示用サマリー（例: 'タスク「XXX」を追加'）
   */
  log(page, action, targetType, targetId, summary) {
    // ページが無効化されている場合はスキップ
    if (ActivityLogger._disabledPages?.has(page)) return;

    const record = {
      page,
      action,
      target_type: targetType,
      target_id:   String(targetId),
      summary,
      created_at:  new Date().toISOString(),
    };
    ActivityDB.add(record).catch(e => console.warn('[ActivityLogger] 記録失敗:', e));
  },

  /**
   * ログをフィルタリングして取得する
   * @param {Object} opts ActivityDB.query と同じオプション
   */
  query(opts) {
    return ActivityDB.query(opts);
  },

  /**
   * 古いログを削除する（90日以上前）
   * @param {number} days 保持日数
   */
  cleanup(days = 90) {
    ActivityDB.cleanup(days).catch(e => console.warn('[ActivityLogger] クリーンアップ失敗:', e));
  },
};

// 初期化: 設定をキャッシュ（非同期、log() が先に呼ばれた場合は全ページ有効扱い）
ActivityLogger._loadConfig();
