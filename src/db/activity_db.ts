// ==================================================
// ActivityDB - アクティビティログ IndexedDB（Dexie.js）
// ==================================================
// DB名: activity_db  version: 1
//
// ストア: logs
//   id*          autoIncrement
//   page:        'todo'|'note'|'snippet'|'dashboard'|'sql'|'wbs'
//   action:      'create'|'delete'|'archive'|'complete'|'update'|'move'
//   target_type: 'task'|'note'|'snippet'|'section'|'item'|'env'|'table_memo'
//   target_id:   string
//   summary:     string
//   created_at:  ISO8601

import Dexie, { type Table } from 'dexie';

export type ActivityPage = 'todo' | 'note' | 'snippet' | 'dashboard' | 'sql' | 'wbs';
export type ActivityAction = 'create' | 'delete' | 'archive' | 'complete' | 'update' | 'move';
export type ActivityTargetType = 'task' | 'note' | 'snippet' | 'section' | 'item' | 'env' | 'table_memo';

export interface ActivityLog {
  id?: number;
  page: ActivityPage;
  action: ActivityAction;
  target_type: ActivityTargetType;
  target_id: string;
  summary: string;
  created_at: string;
}

export interface ActivityQueryOptions {
  page?: ActivityPage;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

class ActivityDatabase extends Dexie {
  logs!: Table<ActivityLog, number>;

  constructor() {
    super('activity_db');
    this.version(1).stores({
      logs: '++id, page, created_at, [page+created_at]',
    });
  }

  /** ログを1件追加する */
  async add(record: Omit<ActivityLog, 'id'>): Promise<number> {
    return this.logs.add(record as ActivityLog);
  }

  /**
   * ログをフィルタリングして取得する（新しい順）
   */
  async query({
    page,
    startDate,
    endDate,
    limit = 50,
    offset = 0,
  }: ActivityQueryOptions = {}): Promise<ActivityLog[]> {
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

    if (page) {
      collection = collection.filter((log) => log.page === page);
    }

    return collection.offset(offset).limit(limit).toArray();
  }

  /**
   * 指定日数以上前のログを一括削除する
   * @param days 保持日数（デフォルト 90）
   */
  async cleanup(days = 90): Promise<void> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    await this.logs.where('created_at').below(cutoff).delete();
  }
}

export const activityDB = new ActivityDatabase();
