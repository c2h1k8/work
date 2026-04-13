// ==================================================
// WbsDB - WBS（作業分解構造）IndexedDB（Dexie.js）
// ==================================================
// DB名: wbs_db  version: 1
//
// ストア:
//   tasks: id*, title, level, position, plan_start, plan_days,
//          actual_start, actual_days, progress, status, memo

import Dexie, { type Table } from 'dexie';

export type WbsStatus = 'not_started' | 'in_progress' | 'done' | 'on_hold';

export interface WbsTask {
  id?: number;
  title: string;
  level: number;
  position: number;
  plan_start: string;
  plan_days: number;
  actual_start: string;
  actual_end: string;   // 実績終了日 'YYYY-MM-DD' | ''
  progress: number;
  status: WbsStatus;
  memo: string;
}

class WbsDatabase extends Dexie {
  tasks!: Table<WbsTask, number>;

  constructor() {
    super('wbs_db');
    this.version(1).stores({
      tasks: '++id, position',
    });
  }

  async getAllTasks(): Promise<WbsTask[]> {
    return this.tasks.orderBy('position').toArray();
  }

  async addTask(task: Omit<WbsTask, 'id'>): Promise<number> {
    return this.tasks.add(task as WbsTask);
  }

  async updateTask(task: WbsTask): Promise<void> {
    await this.tasks.put(task);
  }

  async deleteTask(id: number): Promise<void> {
    await this.tasks.delete(id);
  }

  /** 複数タスクを一括更新（並び替え時等） */
  async bulkUpdate(tasks: WbsTask[]): Promise<void> {
    await this.tasks.bulkPut(tasks);
  }

  /** 全タスクを JSON エクスポート */
  async exportAll(): Promise<string> {
    const tasks = await this.getAllTasks();
    return JSON.stringify({ type: 'wbs_export', version: 1, tasks }, null, 2);
  }

  /** JSON からインポート（既存データを全削除して置換） */
  async importAll(jsonStr: string): Promise<void> {
    const data = JSON.parse(jsonStr) as { type: string; tasks: WbsTask[] };
    if (data.type !== 'wbs_export') throw new Error('不正なファイル形式です');
    await this.transaction('rw', this.tasks, async () => {
      await this.tasks.clear();
      await this.tasks.bulkPut(data.tasks ?? []);
    });
  }
}

export const wbsDB = new WbsDatabase();
