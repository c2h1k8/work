// ==================================================
// KanbanDB ユニットテスト
// ==================================================
import { describe, it, expect } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import Dexie from 'dexie';
import type { KanbanTask, KanbanColumn, KanbanLabel } from './kanban_db';
import { sortByPosition } from '../core/utils';

// fake-indexeddb を使ってテストごとに独立した DB を作る
function makeKanbanDB() {
  const idb = new IDBFactory();
  const db = new (class extends Dexie {
    tasks!: Dexie.Table<KanbanTask, number>;
    labels!: Dexie.Table<KanbanLabel, number>;
    task_labels!: Dexie.Table<{ task_id: number; label_id: number }, [number, number]>;
    columns!: Dexie.Table<KanbanColumn, number>;
    archives!: Dexie.Table<KanbanTask & { id?: number; archived_at: string }, number>;

    constructor() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      super('kanban_db_test_' + Math.random(), { indexedDB: idb, IDBKeyRange: (globalThis as any).IDBKeyRange });
      this.version(2).stores({
        tasks:        '++id, column, position',
        labels:       '++id',
        task_labels:  '[task_id+label_id], task_id',
        columns:      '++id, &key, position',
        archives:     '++id, archived_at',
      });
    }

    async addTask(data: Partial<KanbanTask>): Promise<KanbanTask> {
      const now = new Date().toISOString();
      const task: KanbanTask = {
        title:       data.title       ?? '(無題)',
        description: data.description ?? '',
        column:      data.column      ?? 'backlog',
        position:    data.position    ?? 0,
        due_date:    data.due_date    ?? '',
        created_at:  now,
        updated_at:  now,
      };
      const id = await this.tasks.add(task);
      return { ...task, id };
    }

    async updateTask(id: number, data: Partial<KanbanTask>): Promise<KanbanTask> {
      const existing = await this.tasks.get(id);
      if (!existing) throw new Error(`Task ${id} not found`);
      const updated = { ...existing, ...data, updated_at: new Date().toISOString() };
      await this.tasks.put(updated);
      return updated;
    }

    async getTasksByColumn(column: string): Promise<KanbanTask[]> {
      const tasks = await this.tasks.where('column').equals(column).toArray();
      return sortByPosition(tasks);
    }

    async getAllTasks(): Promise<KanbanTask[]> {
      return this.tasks.toArray();
    }

    async deleteTask(id: number): Promise<void> {
      await this.tasks.delete(id);
    }

    async addLabel(name: string, color: string): Promise<KanbanLabel> {
      const label: KanbanLabel = { name, color };
      const id = await this.labels.add(label);
      return { ...label, id };
    }

    async addTaskLabel(taskId: number, labelId: number): Promise<void> {
      await this.task_labels.put({ task_id: taskId, label_id: labelId });
    }

    async getTaskLabels(taskId: number) {
      return this.task_labels.where('task_id').equals(taskId).toArray();
    }

    async deleteLabel(id: number): Promise<void> {
      const related = await this.task_labels.toArray().then((all) =>
        all.filter((tl) => tl.label_id === id),
      );
      await this.transaction('rw', this.labels, this.task_labels, async () => {
        await this.labels.delete(id);
        await this.task_labels.bulkDelete(
          related.map((tl) => [tl.task_id, tl.label_id] as [number, number]),
        );
      });
    }

    async addColumn(name: string, key: string, position: number): Promise<KanbanColumn> {
      const col: KanbanColumn = { name, key, position };
      const id = await this.columns.add(col);
      return { ...col, id };
    }

    async getAllColumns(): Promise<KanbanColumn[]> {
      return this.columns.toArray();
    }
  })();

  return db;
}

// ---- Tasks ----

describe('KanbanDB - Tasks', () => {
  it('タスクを追加して取得できる', async () => {
    const db = makeKanbanDB();
    const task = await db.addTask({ title: 'テストタスク', column: 'todo' });

    expect(task.id).toBeDefined();
    expect(task.title).toBe('テストタスク');
    expect(task.column).toBe('todo');
  });

  it('デフォルト値が設定される', async () => {
    const db = makeKanbanDB();
    const task = await db.addTask({});

    expect(task.title).toBe('(無題)');
    expect(task.description).toBe('');
    expect(task.column).toBe('backlog');
    expect(task.position).toBe(0);
  });

  it('タスクを更新できる', async () => {
    const db = makeKanbanDB();
    const task = await db.addTask({ title: '元のタイトル' });
    const updated = await db.updateTask(task.id!, { title: '更新済みタイトル' });

    expect(updated.title).toBe('更新済みタイトル');
    expect(updated.updated_at).not.toBe(task.updated_at); // タイムスタンプ更新
  });

  it('存在しない ID で updateTask するとエラー', async () => {
    const db = makeKanbanDB();
    await expect(db.updateTask(9999, { title: 'X' })).rejects.toThrow('Task 9999 not found');
  });

  it('タスクを削除できる', async () => {
    const db = makeKanbanDB();
    const task = await db.addTask({ title: '削除対象' });
    await db.deleteTask(task.id!);

    const all = await db.getAllTasks();
    expect(all).toHaveLength(0);
  });

  it('カラム別に取得でき position 昇順になる', async () => {
    const db = makeKanbanDB();
    await db.addTask({ title: 'C', column: 'todo', position: 3 });
    await db.addTask({ title: 'A', column: 'todo', position: 1 });
    await db.addTask({ title: 'B', column: 'todo', position: 2 });
    await db.addTask({ title: 'other', column: 'done', position: 0 });

    const tasks = await db.getTasksByColumn('todo');
    expect(tasks.map((t) => t.title)).toEqual(['A', 'B', 'C']);
  });
});

// ---- Labels ----

describe('KanbanDB - Labels', () => {
  it('ラベルを追加できる', async () => {
    const db = makeKanbanDB();
    const label = await db.addLabel('緊急', '#ff0000');

    expect(label.id).toBeDefined();
    expect(label.name).toBe('緊急');
    expect(label.color).toBe('#ff0000');
  });

  it('タスクにラベルを紐付けできる', async () => {
    const db = makeKanbanDB();
    const task = await db.addTask({ title: 'ラベルテスト' });
    const label = await db.addLabel('重要', '#0000ff');

    await db.addTaskLabel(task.id!, label.id!);

    const taskLabels = await db.getTaskLabels(task.id!);
    expect(taskLabels).toHaveLength(1);
    expect(taskLabels[0].label_id).toBe(label.id);
  });

  it('ラベル削除時に task_labels も削除される', async () => {
    const db = makeKanbanDB();
    const task = await db.addTask({ title: 'タスク' });
    const label = await db.addLabel('削除対象', '#aabbcc');
    await db.addTaskLabel(task.id!, label.id!);

    await db.deleteLabel(label.id!);

    const taskLabels = await db.getTaskLabels(task.id!);
    expect(taskLabels).toHaveLength(0);
  });
});

// ---- Columns ----

describe('KanbanDB - Columns', () => {
  it('カラムを追加できる', async () => {
    const db = makeKanbanDB();
    const col = await db.addColumn('バックログ', 'backlog', 0);

    expect(col.id).toBeDefined();
    expect(col.name).toBe('バックログ');
    expect(col.key).toBe('backlog');
  });

  it('複数カラムを取得できる', async () => {
    const db = makeKanbanDB();
    await db.addColumn('Todo', 'todo', 1);
    await db.addColumn('Done', 'done', 2);

    const cols = await db.getAllColumns();
    expect(cols).toHaveLength(2);
  });
});
