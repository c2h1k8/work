// ==================================================
// ActivityDB ユニットテスト
// ==================================================
import { describe, it, expect } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import Dexie from 'dexie';
import type { ActivityLog, ActivityQueryOptions } from './activity_db';

// テストごとに独立した DB インスタンスを生成するためのヘルパー
async function makeDB() {
  // fake-indexeddb の新しいファクトリでインスタンスを分離
  const idb = new IDBFactory();
  // Dexie に fake-indexeddb を注入
  const db = new (class extends Dexie {
    logs!: Dexie.Table<ActivityLog, number>;
    constructor() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      super('activity_db_test_' + Math.random(), { indexedDB: idb, IDBKeyRange: (globalThis as any).IDBKeyRange });
      this.version(1).stores({
        logs: '++id, page, created_at, [page+created_at]',
      });
    }

    async add(record: Omit<ActivityLog, 'id'>): Promise<number> {
      return this.logs.add(record as ActivityLog);
    }

    async query({
      page,
      pages,
      startDate,
      endDate,
      limit = 50,
      offset = 0,
    }: ActivityQueryOptions = {}): Promise<ActivityLog[]> {
      const pageFilter = pages ?? (page ? [page] : null);
      const _toLocalISO = (dateStr: string, endOfDay: boolean): string => {
        const [y, m, d] = dateStr.split('-').map(Number);
        return endOfDay
          ? new Date(y, m - 1, d, 23, 59, 59, 999).toISOString()
          : new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
      };

      let collection = this.logs.orderBy('created_at').reverse();

      if (startDate || endDate) {
        const lower = startDate ? _toLocalISO(startDate, false) : undefined;
        const upper = endDate ? _toLocalISO(endDate, true) : undefined;
        collection = collection.filter((log) => {
          if (lower && log.created_at < lower) return false;
          if (upper && log.created_at > upper) return false;
          return true;
        });
      }

      if (pageFilter && pageFilter.length > 0) {
        const pageSet = new Set(pageFilter);
        collection = collection.filter((log) => pageSet.has(log.page));
      }

      return collection.offset(offset).limit(limit).toArray();
    }

    async cleanup(days = 90): Promise<void> {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      await this.logs.where('created_at').below(cutoff).delete();
    }
  })();

  return db;
}

// ---- add / query ----

describe('ActivityDB.add & query', () => {
  it('ログを追加して取得できる', async () => {
    const db = await makeDB();
    await db.add({
      page: 'todo',
      action: 'create',
      target_type: 'task',
      target_id: '1',
      summary: 'テストタスク作成',
      created_at: new Date().toISOString(),
    });

    const logs = await db.query();
    expect(logs).toHaveLength(1);
    expect(logs[0].summary).toBe('テストタスク作成');
  });

  it('page フィルターが機能する', async () => {
    const db = await makeDB();
    await db.add({ page: 'todo', action: 'create', target_type: 'task', target_id: '1', summary: 'todo', created_at: new Date().toISOString() });
    await db.add({ page: 'note', action: 'create', target_type: 'note', target_id: '2', summary: 'note', created_at: new Date().toISOString() });

    const todoLogs = await db.query({ page: 'todo' });
    expect(todoLogs).toHaveLength(1);
    expect(todoLogs[0].page).toBe('todo');
  });

  it('pages 配列フィルターが機能する', async () => {
    const db = await makeDB();
    await db.add({ page: 'todo', action: 'create', target_type: 'task', target_id: '1', summary: 'todo', created_at: new Date().toISOString() });
    await db.add({ page: 'note', action: 'create', target_type: 'note', target_id: '2', summary: 'note', created_at: new Date().toISOString() });
    await db.add({ page: 'sql', action: 'create', target_type: 'env', target_id: '3', summary: 'sql', created_at: new Date().toISOString() });

    const logs = await db.query({ pages: ['todo', 'note'] });
    expect(logs).toHaveLength(2);
    expect(logs.map((l) => l.page).sort()).toEqual(['note', 'todo']);
  });

  it('limit が適用される', async () => {
    const db = await makeDB();
    for (let i = 0; i < 5; i++) {
      await db.add({ page: 'todo', action: 'create', target_type: 'task', target_id: String(i), summary: `task${i}`, created_at: new Date().toISOString() });
    }
    const logs = await db.query({ limit: 3 });
    expect(logs).toHaveLength(3);
  });

  it('新しい順（降順）で返す', async () => {
    const db = await makeDB();
    await db.add({ page: 'todo', action: 'create', target_type: 'task', target_id: '1', summary: 'older', created_at: '2026-01-01T00:00:00.000Z' });
    await db.add({ page: 'todo', action: 'create', target_type: 'task', target_id: '2', summary: 'newer', created_at: '2026-06-01T00:00:00.000Z' });

    const logs = await db.query();
    expect(logs[0].summary).toBe('newer');
    expect(logs[1].summary).toBe('older');
  });
});

// ---- cleanup ----

describe('ActivityDB.cleanup', () => {
  it('指定日数より古いログを削除する', async () => {
    const db = await makeDB();
    const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(); // 100日前
    const recentDate = new Date().toISOString();

    await db.add({ page: 'todo', action: 'create', target_type: 'task', target_id: '1', summary: '古いログ', created_at: oldDate });
    await db.add({ page: 'todo', action: 'create', target_type: 'task', target_id: '2', summary: '新しいログ', created_at: recentDate });

    await db.cleanup(90); // 90日以上前を削除

    const logs = await db.query();
    expect(logs).toHaveLength(1);
    expect(logs[0].summary).toBe('新しいログ');
  });

  it('全件が新しい場合は何も削除しない', async () => {
    const db = await makeDB();
    await db.add({ page: 'todo', action: 'create', target_type: 'task', target_id: '1', summary: 'recent', created_at: new Date().toISOString() });

    await db.cleanup(90);

    const logs = await db.query();
    expect(logs).toHaveLength(1);
  });
});
