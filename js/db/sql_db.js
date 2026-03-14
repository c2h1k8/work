// ==================================================
// SqlDB — sql_db IndexedDB Promise ラッパー
// ==================================================
//
// ■ DB情報
//   DB名: sql_db  /  バージョン: 1
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
// ■ テーブル間リレーション
//
//   単一ストアのため、ストア間リレーションなし。
//
// ■ 関連する localStorage キー（ブラウザ固有の UI 状態）
//
//   sql_selected_env   現在選択中の接続環境キー (string)
//   sql_tune_open      チューニング詳細パネルの開閉状態 (boolean)
//   sql_params         バインド変数値マップ ({[name]: string})
//
// ==================================================

class SqlDB {
  static DB_NAME    = 'sql_db';
  static DB_VERSION = 1;

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
}
