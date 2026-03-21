// ==================================================
// SqlDB — sql_db IndexedDB Promise ラッパー
// ==================================================
//
// ■ DB情報
//   DB名: sql_db  /  バージョン: 2
//
// ■ ストア一覧とスキーマ
//
//   envs            Oracle 接続環境定義
//     id*           AutoIncrement PK
//     key           環境キー・識別名 (string, ユーザー定義)
//     username      DB ユーザー名 (string)
//     password      パスワード (string)
//     connect_identifier  接続識別子（TNS名 or host:port/service）(string)
//     position      表示順 (number)
//
//   table_memos     テーブル定義メモ
//     id*           AutoIncrement PK
//     schema_name   スキーマ名 (string, 省略可)
//     table_name    テーブル名 (string)
//     comment       テーブルコメント (string)
//     columns       カラム定義配列 [{name, type, nullable, pk, comment}]
//     indexes       インデックス定義配列 [{name, unique, cols, comment}]
//     memo          フリーメモ (string)
//     created_at    作成日時 ISO8601 (string)
//     updated_at    更新日時 ISO8601 (string)
//
// ■ テーブル間リレーション
//
//   ストア間リレーションなし。
//
// ■ 関連する localStorage キー（ブラウザ固有の UI 状態）
//
//   sql_selected_env   現在選択中の接続環境キー (string)
//   sql_tune_open      チューニング詳細パネルの開閉状態 (boolean)
//   sql_params         バインド変数値マップ ({[name]: string})
//   sql_memo_open      テーブル定義メモパネルの開閉状態 (boolean)
//
// ==================================================

class SqlDB {
  static DB_NAME    = 'sql_db';
  static DB_VERSION = 2;

  constructor() { this._db = null; }

  open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(SqlDB.DB_NAME, SqlDB.DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        // 接続環境ストア: id(auto) / key / username / password / connect_identifier / position
        if (!db.objectStoreNames.contains('envs')) {
          db.createObjectStore('envs', { keyPath: 'id', autoIncrement: true });
        }
        // v2: テーブル定義メモストア
        if (e.oldVersion < 2) {
          const memoStore = db.createObjectStore('table_memos', { keyPath: 'id', autoIncrement: true });
          memoStore.createIndex('table_name', 'table_name', { unique: false });
        }
      };
      req.onsuccess = (e) => { this._db = e.target.result; resolve(this); };
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  _store(name, mode = 'readonly') {
    return this._db.transaction(name, mode).objectStore(name);
  }

  // position 昇順でソートした全環境を返す
  getAllEnvs() {
    return new Promise((resolve, reject) => {
      const req = this._store('envs').getAll();
      req.onsuccess = () => resolve(sortByPosition(req.result));
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  // 末尾 position に追加
  async addEnv(env) {
    const envs = await this.getAllEnvs();
    const pos  = envs.length > 0 ? Math.max(...envs.map(e => e.position)) + 1 : 0;
    return new Promise((resolve, reject) => {
      const req = this._store('envs', 'readwrite').add({ ...env, position: pos });
      req.onsuccess = () => resolve(req.result);
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  // 指定フィールドを上書き更新
  updateEnv(id, data) {
    return new Promise((resolve, reject) => {
      const store  = this._store('envs', 'readwrite');
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const putReq = store.put({ ...getReq.result, ...data });
        putReq.onsuccess = () => resolve();
        putReq.onerror   = (e) => reject(e.target.error);
      };
      getReq.onerror = (e) => reject(e.target.error);
    });
  }

  deleteEnv(id) {
    return new Promise((resolve, reject) => {
      const req = this._store('envs', 'readwrite').delete(id);
      req.onsuccess = () => resolve();
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  // ==================================================
  // テーブル定義メモ CRUD
  // ==================================================

  // 全メモを更新日時降順で返す
  getAllTableMemos() {
    return new Promise((resolve, reject) => {
      const req = this._store('table_memos').getAll();
      req.onsuccess = () => {
        const sorted = req.result.slice().sort((a, b) =>
          (b.updated_at ?? '').localeCompare(a.updated_at ?? '')
        );
        resolve(sorted);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  // メモを追加
  addTableMemo(memo) {
    const now = new Date().toISOString();
    return new Promise((resolve, reject) => {
      const req = this._store('table_memos', 'readwrite').add({
        ...memo,
        columns:    memo.columns    ?? [],
        indexes:    memo.indexes    ?? [],
        memo:       memo.memo       ?? '',
        created_at: now,
        updated_at: now,
      });
      req.onsuccess = () => resolve(req.result);
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  // メモを更新
  updateTableMemo(id, data) {
    return new Promise((resolve, reject) => {
      const store  = this._store('table_memos', 'readwrite');
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const putReq = store.put({ ...getReq.result, ...data, updated_at: new Date().toISOString() });
        putReq.onsuccess = () => resolve();
        putReq.onerror   = (e) => reject(e.target.error);
      };
      getReq.onerror = (e) => reject(e.target.error);
    });
  }

  // メモを削除
  deleteTableMemo(id) {
    return new Promise((resolve, reject) => {
      const req = this._store('table_memos', 'readwrite').delete(id);
      req.onsuccess = () => resolve();
      req.onerror   = (e) => reject(e.target.error);
    });
  }
}
