// ==================================================
// AppDB - アプリ共通設定 IndexedDB（Dexie.js）
// ==================================================
// DB名: app_db  version: 1
// ストア: settings (name*, value)

import Dexie, { type Table } from 'dexie';

interface Setting {
  name: string;
  value: unknown;
}

class AppDatabase extends Dexie {
  settings!: Table<Setting, string>;

  constructor() {
    super('app_db');
    this.version(1).stores({
      settings: 'name',
    });
  }

  async get<T = unknown>(name: string): Promise<T | null> {
    const record = await this.settings.get(name);
    return (record?.value as T) ?? null;
  }

  async set(name: string, value: unknown): Promise<void> {
    await this.settings.put({ name, value });
  }
}

export const appDB = new AppDatabase();
