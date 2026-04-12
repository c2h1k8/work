// ==================================================
// SqlDB - SQL Toolkit IndexedDB（Dexie.js）
// ==================================================
// DB名: sql_db  version: 2
//
// ストア:
//   envs:        id*, key, username, password, connect_identifier, position
//   table_memos: id*, schema_name, table_name, comment, columns, indexes, memo,
//                created_at, updated_at

import Dexie, { type Table } from 'dexie';
import { sortByPosition } from '../core/utils';

export interface SqlEnv {
  id?: number;
  key: string;
  username: string;
  password: string;
  connect_identifier: string;
  position: number;
}

export interface TableColumn {
  name: string;
  type: string;
  nullable: boolean;
  pk: boolean;
  comment: string;
}

export interface TableIndex {
  name: string;
  unique: boolean;
  cols: string[];
  comment: string;
}

export interface TableMemo {
  id?: number;
  schema_name: string;
  table_name: string;
  comment: string;
  columns: TableColumn[];
  indexes: TableIndex[];
  memo: string;
  created_at: string;
  updated_at: string;
}

class SqlDatabase extends Dexie {
  envs!: Table<SqlEnv, number>;
  table_memos!: Table<TableMemo, number>;

  constructor() {
    super('sql_db');
    this.version(1).stores({
      envs: '++id',
    });
    this.version(2).stores({
      envs: '++id',
      table_memos: '++id, table_name',
    });
  }

  // ── 接続環境 ──────────────────────────────────────────

  async getAllEnvs(): Promise<SqlEnv[]> {
    const all = await this.envs.toArray();
    return sortByPosition(all);
  }

  async addEnv(env: Omit<SqlEnv, 'id'>): Promise<number> {
    const envs = await this.getAllEnvs();
    const pos = envs.length > 0 ? Math.max(...envs.map((e) => e.position)) + 1 : 0;
    return this.envs.add({ ...env, position: pos } as SqlEnv);
  }

  async updateEnv(id: number, data: Partial<SqlEnv>): Promise<void> {
    await this.envs.update(id, data);
  }

  async deleteEnv(id: number): Promise<void> {
    await this.envs.delete(id);
  }

  // ── テーブル定義メモ ──────────────────────────────────

  async getAllTableMemos(): Promise<TableMemo[]> {
    const all = await this.table_memos.toArray();
    return all.slice().sort((a, b) =>
      (b.updated_at ?? '').localeCompare(a.updated_at ?? ''),
    );
  }

  async addTableMemo(memo: Omit<TableMemo, 'id' | 'created_at' | 'updated_at'>): Promise<number> {
    const now = new Date().toISOString();
    return this.table_memos.add({
      ...memo,
      columns: memo.columns ?? [],
      indexes: memo.indexes ?? [],
      memo: memo.memo ?? '',
      created_at: now,
      updated_at: now,
    } as TableMemo);
  }

  async updateTableMemo(id: number, data: Partial<TableMemo>): Promise<void> {
    await this.table_memos.update(id, { ...data, updated_at: new Date().toISOString() });
  }

  async deleteTableMemo(id: number): Promise<void> {
    await this.table_memos.delete(id);
  }
}

export const sqlDB = new SqlDatabase();
