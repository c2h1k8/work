// ==================================================
// DashboardDB — dashboard_db IndexedDB Promise ラッパー
// ==================================================
//
// ■ DB情報
//   DB名: dashboard_db  /  バージョン: 2（全インスタンス共有の単一DB）
//
//   URLパラメータ ?instance=<id> で複数ダッシュボードタブを識別。
//   同一 DB 内で instance_id フィールドによりデータを分離。
//
// ■ バージョン履歴
//   v1: sections + items ストアを追加
//   v2: app_config + presets ストアを追加（バインド変数機能）
//
// ■ ストア一覧とスキーマ
//
//   sections        ダッシュボードセクション（カード）
//     id*           AutoIncrement PK
//     instance_id   ダッシュボードインスタンスID (string) ← フィルタリングキー
//     title         セクション名 (string)
//     icon          アイコン (string, 絵文字など)
//     type          セクションタイプ (string) ※下記参照
//     position      表示順 (number)
//     width         表示幅 'narrow'|'auto'|'w3'|'wide'|'w5'|'full'
//     // --- list/grid/table セクション共通バインド変数 ---
//     table_bind_vars    テーブル用変数名配列 (string[])
//     table_presets      テーブル用プリセット配列 ({id,name,values})
//     table_vars_ui_type テーブル用UIタイプ 'select'|'tabs'|'segment'
//     table_vars_bar_label テーブル用バーラベル (string)
//     list_bind_vars     リスト用変数名配列 (string[])
//     list_presets       リスト用プリセット配列
//     list_vars_ui_type  リスト用UIタイプ
//     list_vars_bar_label リスト用バーラベル
//     grid_bind_vars     グリッド用変数名配列 (string[])
//     grid_presets       グリッド用プリセット配列
//     grid_vars_ui_type  グリッド用UIタイプ
//     grid_vars_bar_label グリッド用バーラベル
//     // --- command_builder セクション専用 ---
//     command_template   コマンドテンプレート (string, 後方互換)
//     action_mode        'copy'|'open'
//     cmd_buttons        ボタン配列 ({id,label,template,action_mode})
//     // --- table セクション専用 ---
//     columns     列定義配列 ({id, label, type: 'text'|'copy'|'link'})
//     page_size   1ページ表示件数 (number, 0=無制限)
//     // --- memo セクション専用 ---
//     memo_content メモ内容 (string)
//     index: position, instance_id
//
//     type 一覧:
//       list           リスト（ラベル+ヒント+値のリスト）
//       grid           グリッド（絵文字カード）
//       command_builder コマンドビルダー（入力欄+実行ボタン）
//       table          テーブル（列定義+行データ）
//       memo           メモ（自由テキスト）
//       checklist      チェックリスト（定期リセット付き）
//
//   items           セクション内のアイテム
//     id*           AutoIncrement PK
//     section_id    → sections.id
//     position      表示順 (number)
//     item_type     アイテムタイプ (string) ※下記参照
//     label         表示ラベル (string)
//     hint          ヒントテキスト (string, listのみ)
//     value         値（URLまたはコピーテキスト）(string)
//     emoji         絵文字 (string, gridのみ)
//     row_data      行データ ({[col_id]: string}, tableのみ)
//     new_row       新規行フラグ (boolean, table編集用)
//     index: section_id, position
//
//     item_type 一覧:
//       copy      クリックでクリップボードにコピー
//       link      クリックでURLを開く
//       template  テンプレート（日付変数・バインド変数を解決してコピー）
//       row       テーブル行（row_data に値を持つ）
//
//   presets         共通バインド変数プリセット
//     id*           AutoIncrement PK
//     instance_id   → ダッシュボードインスタンスID
//     name          プリセット名 (string)
//     position      表示順 (number)
//     values        変数値マップ ({[varName]: string})
//     index: instance_id
//
//   app_config      アプリ設定（キーバリューストア）
//     name*         キー (string) ← keyPath
//     value         値 (any)
//
//     主なキー:
//       bind_config_{instanceId}  → { varNames: string[], uiType: 'select'|'tabs'|'segment', barLabel: string }
//
// ■ テーブル間リレーション
//
//   sections ──< items           sections.id = items.section_id
//   sections.instance_id = presets.instance_id（同一インスタンスのデータ）
//   app_config は instance_id をキーに含めてスコープを分離
//
// ■ インスタンス分離の仕組み
//
//   全ダッシュボードタブは同一 dashboard_db を共有する。
//   sections / presets は instance_id フィールドで絞り込み。
//   app_config は キー名に _{instanceId} サフィックスを付与。
//   localStorage のアクティブプリセットキーも instanceId を含む。
//
// ==================================================

class DashboardDB {
  constructor() {
    this.db = null;
    this.DB_NAME = "dashboard_db"; // 全インスタンス共有の単一DB
    this.DB_VERSION = 2;
    this.instanceId = _instanceId; // このインスタンスのID（dashboard.js で定義）
  }

  open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        // v1: sections + items ストア（初回作成）
        if (e.oldVersion < 1) {
          const ss = db.createObjectStore("sections", {
            keyPath: "id",
            autoIncrement: true,
          });
          ss.createIndex("position", "position");
          ss.createIndex("instance_id", "instance_id");
          const is = db.createObjectStore("items", {
            keyPath: "id",
            autoIncrement: true,
          });
          is.createIndex("section_id", "section_id");
          is.createIndex("position", "position");
        }
        // v2: app_config + presets ストアを追加（既存 v1 DB への移行対応）
        if (e.oldVersion < 2) {
          if (!db.objectStoreNames.contains("app_config")) {
            db.createObjectStore("app_config", { keyPath: "name" });
          }
          if (!db.objectStoreNames.contains("presets")) {
            const presetsStore = db.createObjectStore("presets", {
              keyPath: "id",
              autoIncrement: true,
            });
            presetsStore.createIndex("instance_id", "instance_id");
          }
        }
      };
      req.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this);
      };
      req.onerror = () => reject(req.error);
    });
  }

  _get(store, id) {
    return new Promise((resolve, reject) => {
      const req = this.db.transaction(store).objectStore(store).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  _getAll(store, indexName, query) {
    return new Promise((resolve, reject) => {
      const os = this.db.transaction(store).objectStore(store);
      const req = indexName ? os.index(indexName).getAll(query) : os.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  _add(store, data) {
    return new Promise((resolve, reject) => {
      const req = this.db
        .transaction(store, "readwrite")
        .objectStore(store)
        .add(data);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  _put(store, data) {
    return new Promise((resolve, reject) => {
      const req = this.db
        .transaction(store, "readwrite")
        .objectStore(store)
        .put(data);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  _delete(store, id) {
    return new Promise((resolve, reject) => {
      const req = this.db
        .transaction(store, "readwrite")
        .objectStore(store)
        .delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  _count(store) {
    return new Promise((resolve, reject) => {
      const req = this.db.transaction(store).objectStore(store).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // ── Sections ──────────────────────────

  getAllSections() {
    return new Promise((resolve, reject) => {
      const os = this.db.transaction("sections").objectStore("sections");
      const req = os
        .index("instance_id")
        .getAll(IDBKeyRange.only(this.instanceId));
      req.onsuccess = () => resolve(sortByPosition(req.result));
      req.onerror = () => reject(req.error);
    });
  }

  addSection(data) {
    return this._add("sections", { ...data, instance_id: this.instanceId });
  }
  updateSection(data) {
    return this._put("sections", data);
  }

  async deleteSection(id) {
    // アイテムもカスケード削除
    const items = await this.getItemsBySection(id);
    const tx = this.db.transaction(["sections", "items"], "readwrite");
    tx.objectStore("sections").delete(id);
    items.forEach((item) => tx.objectStore("items").delete(item.id));
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  countSections() {
    return new Promise((resolve, reject) => {
      const os = this.db.transaction("sections").objectStore("sections");
      const req = os
        .index("instance_id")
        .count(IDBKeyRange.only(this.instanceId));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // ── Items ─────────────────────────────

  getItemsBySection(sectionId) {
    return this._getAll(
      "items",
      "section_id",
      IDBKeyRange.only(sectionId),
    ).then(sortByPosition);
  }

  addItem(data) {
    return this._add("items", data);
  }
  updateItem(data) {
    return this._put("items", data);
  }
  deleteItem(id) {
    return this._delete("items", id);
  }

  // ── 共通バインド変数プリセット ──────────────────────────

  getAllPresets() {
    return new Promise((resolve, reject) => {
      const os = this.db.transaction("presets").objectStore("presets");
      const req = os
        .index("instance_id")
        .getAll(IDBKeyRange.only(this.instanceId));
      req.onsuccess = () => resolve(sortByPosition(req.result));
      req.onerror = () => reject(req.error);
    });
  }

  addPreset(data) {
    return this._add("presets", { ...data, instance_id: this.instanceId });
  }
  updatePreset(data) {
    return this._put("presets", data);
  }
  deletePreset(id) {
    return this._delete("presets", id);
  }

  // ── アプリ設定 ────────────────────────────

  async getAppConfig(key) {
    try {
      const fullKey = `${key}_${this.instanceId}`;
      const record = await this._get("app_config", fullKey);
      return record?.value ?? null;
    } catch {
      return null;
    }
  }

  async setAppConfig(key, value) {
    try {
      const fullKey = `${key}_${this.instanceId}`;
      return await this._put("app_config", { name: fullKey, value });
    } catch {
      return null;
    }
  }

  // ── エクスポート/インポート ────────────

  /** このインスタンスのデータをエクスポート */
  async exportInstance() {
    const sections = await this.getAllSections();
    const items = [];
    for (const section of sections) {
      const sectionItems = await this.getItemsBySection(section.id);
      items.push(...sectionItems);
    }
    const presets = await this.getAllPresets();
    const bindConfig = await this.getAppConfig("bind_config");
    return { sections, items, presets, bindConfig };
  }

  /** このインスタンスのデータをインポート（replace=true なら既存を全削除してから追加） */
  async importInstance(data, replace = true) {
    if (replace) {
      const existing = await this.getAllSections();
      for (const s of existing) await this.deleteSection(s.id);
      const existingPresets = await this.getAllPresets();
      for (const p of existingPresets) await this.deletePreset(p.id);
    }
    const idMap = {};
    for (const section of data.sections || []) {
      const oldId = section.id;
      const newSection = { ...section, instance_id: this.instanceId };
      delete newSection.id;
      const newId = await this._add("sections", newSection);
      if (oldId !== undefined) idMap[oldId] = newId;
    }
    for (const item of data.items || []) {
      const newItem = { ...item };
      delete newItem.id;
      if (idMap[newItem.section_id] !== undefined) {
        newItem.section_id = idMap[newItem.section_id];
        await this._add("items", newItem);
      }
    }
    for (const preset of data.presets || []) {
      const newPreset = { ...preset, instance_id: this.instanceId };
      delete newPreset.id;
      await this._add("presets", newPreset);
    }
    if (data.bindConfig) {
      await this.setAppConfig("bind_config", data.bindConfig);
    }
  }

  /** このインスタンスのデータを全削除（タブ削除時に使用） */
  async deleteInstance() {
    const sections = await this.getAllSections();
    for (const s of sections) await this.deleteSection(s.id);
    const presets = await this.getAllPresets();
    for (const p of presets) await this.deletePreset(p.id);
  }
}
