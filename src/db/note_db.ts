// ==================================================
// NoteDB - ノート管理 IndexedDB（Dexie.js）
// ==================================================
// DB名: note_db  version: 2
//
// ストア:
//   tasks:      id*, title, created_at, updated_at
//   fields:     id*, name, type, options, position, width, listVisible
//   entries:    id*, task_id, field_id, label, value, created_at
//   note_links: id*, from_task_id, to_task_id  (v2)
//   history:    id*, task_id, field_id, old_value, new_value, changed_at  (v2)

import Dexie, { type Table } from 'dexie';
import { sortByPosition } from '../core/utils';

export type NoteFieldType =
  | 'link'
  | 'text'
  | 'date'
  | 'select'
  | 'label'
  | 'dropdown'
  | 'note_link'
  | 'todo';

export type NoteFieldWidth = 'narrow' | 'auto' | 'w3' | 'wide' | 'w5' | 'full';

export interface NoteTask {
  id?: number;
  title: string;
  created_at: number;
  updated_at: number;
}

export interface NoteField {
  id?: number;
  name: string;
  type: NoteFieldType;
  options: unknown[];
  position: number;
  width: NoteFieldWidth;
  listVisible: boolean;
  visible?: boolean;
}

export interface NoteEntry {
  id?: number;
  task_id: number;
  field_id: number;
  label: string;
  value: string;
  created_at: number;
}

export interface NoteLink {
  id?: number;
  from_task_id: number;
  to_task_id: number;
}

export interface NoteHistory {
  id?: number;
  task_id: number;
  field_id: number;
  old_value: string;
  new_value: string;
  changed_at: number;
}

class NoteDatabase extends Dexie {
  tasks!: Table<NoteTask, number>;
  fields!: Table<NoteField, number>;
  entries!: Table<NoteEntry, number>;
  note_links!: Table<NoteLink, number>;
  history!: Table<NoteHistory, number>;

  constructor() {
    super('note_db');
    this.version(1).stores({
      tasks: '++id',
      fields: '++id, position',
      entries: '++id, task_id, field_id',
    });
    this.version(2).stores({
      tasks: '++id',
      fields: '++id, position',
      entries: '++id, task_id, field_id',
      note_links: '++id, from_task_id, to_task_id',
      history: '++id, task_id, changed_at',
    });
  }

  // ── タスク操作 ─────────��──────────────────────────────

  async getAllTasks(): Promise<NoteTask[]> {
    return this.tasks.toArray();
  }

  async addTask(title: string): Promise<NoteTask> {
    const now = Date.now();
    const data: NoteTask = { title, created_at: now, updated_at: now };
    const id = await this.tasks.add(data);
    return { ...data, id };
  }

  async updateTask(task: NoteTask): Promise<NoteTask> {
    task.updated_at = Date.now();
    await this.tasks.put(task);
    return task;
  }

  async deleteTask(id: number): Promise<void> {
    await this.transaction(
      'rw',
      this.tasks,
      this.entries,
      this.note_links,
      this.history,
      async () => {
        await this.entries.where('task_id').equals(id).delete();
        await this.note_links.where('from_task_id').equals(id).delete();
        await this.note_links.where('to_task_id').equals(id).delete();
        await this.history.where('task_id').equals(id).delete();
        await this.tasks.delete(id);
      },
    );
  }

  // ── フィールド操作 ───────────────────���────────────────

  async getAllFields(): Promise<NoteField[]> {
    const fields = await this.fields.toArray();
    return sortByPosition(fields);
  }

  async addField(
    name: string,
    type: NoteFieldType,
    options: unknown[] = [],
  ): Promise<NoteField> {
    const fields = await this.getAllFields();
    const position =
      fields.length > 0 ? Math.max(...fields.map((f) => f.position)) + 1 : 0;
    const data: NoteField = { name, type, options, position, width: 'full', listVisible: false };
    const id = await this.fields.add(data);
    return { ...data, id };
  }

  async updateField(field: NoteField): Promise<NoteField> {
    await this.fields.put(field);
    return field;
  }

  async deleteField(id: number): Promise<void> {
    await this.transaction('rw', this.fields, this.entries, async () => {
      await this.entries.where('field_id').equals(id).delete();
      await this.fields.delete(id);
    });
  }

  /** 初回起動時にデフォルトフィールドを挿入 */
  async initDefaultFields(): Promise<void> {
    const existing = await this.getAllFields();
    if (existing.length > 0) return;
    const defaults: Omit<NoteField, 'id'>[] = [
      { name: '設計書',       type: 'link',      options: [], position: 0, width: 'full', listVisible: false },
      { name: 'テストケース', type: 'link',      options: [], position: 1, width: 'full', listVisible: false },
      { name: 'ドキュメント', type: 'link',      options: [], position: 2, width: 'full', listVisible: false },
      { name: 'エビデンス',   type: 'link',      options: [], position: 3, width: 'full', listVisible: false },
      { name: 'プルリク',     type: 'link',      options: [], position: 4, width: 'full', listVisible: false },
      { name: '備考',         type: 'text',      options: [], position: 5, width: 'full', listVisible: false },
      { name: 'TODO',         type: 'todo',      options: [], position: 6, width: 'full', listVisible: false, visible: true },
      { name: '関連ノート',   type: 'note_link', options: [], position: 7, width: 'full', listVisible: false, visible: true },
    ];
    await this.fields.bulkAdd(defaults as NoteField[]);
  }

  // ── エントリ操作 ──────────────────────────────────────

  async getAllEntries(): Promise<NoteEntry[]> {
    return this.entries.toArray();
  }

  async getEntriesByTask(taskId: number): Promise<NoteEntry[]> {
    return this.entries.where('task_id').equals(taskId).toArray();
  }

  async addEntry(taskId: number, fieldId: number, label: string, value: string): Promise<NoteEntry> {
    const data: NoteEntry = {
      task_id: taskId,
      field_id: fieldId,
      label,
      value,
      created_at: Date.now(),
    };
    const id = await this.entries.add(data);
    return { ...data, id };
  }

  async updateEntry(entry: NoteEntry): Promise<NoteEntry> {
    await this.entries.put(entry);
    return entry;
  }

  async deleteEntry(id: number): Promise<void> {
    await this.entries.delete(id);
  }

  // ── ノート間リンク操作 ──────────────────���─────────────

  async addNoteLink(fromId: number, toId: number): Promise<NoteLink | null> {
    const [fromLinks, toLinks] = await Promise.all([
      this.note_links.where('from_task_id').equals(fromId).toArray(),
      this.note_links.where('to_task_id').equals(fromId).toArray(),
    ]);
    if (fromLinks.some((l) => l.to_task_id === toId)) return null;
    if (toLinks.some((l) => l.from_task_id === toId)) return null;
    const data: NoteLink = { from_task_id: fromId, to_task_id: toId };
    const id = await this.note_links.add(data);
    return { ...data, id };
  }

  async deleteNoteLink(id: number): Promise<void> {
    await this.note_links.delete(id);
  }

  async getNoteLinks(taskId: number): Promise<NoteLink[]> {
    const [fromLinks, toLinks] = await Promise.all([
      this.note_links.where('from_task_id').equals(taskId).toArray(),
      this.note_links.where('to_task_id').equals(taskId).toArray(),
    ]);
    return [...fromLinks, ...toLinks];
  }

  // ── 変更履歴操作 ───────────────────────��──────────────

  async addHistory(record: Omit<NoteHistory, 'id' | 'changed_at'>): Promise<NoteHistory> {
    const data: NoteHistory = { ...record, changed_at: Date.now() };
    const id = await this.history.add(data);
    await this._trimHistory(record.task_id, 100);
    return { ...data, id };
  }

  async getHistory(taskId: number): Promise<NoteHistory[]> {
    const all = await this.history.where('task_id').equals(taskId).toArray();
    return all.sort((a, b) => b.changed_at - a.changed_at);
  }

  async clearHistory(taskId: number): Promise<void> {
    await this.history.where('task_id').equals(taskId).delete();
  }

  private async _trimHistory(taskId: number, maxCount: number): Promise<void> {
    const all = await this.history.where('task_id').equals(taskId).toArray();
    if (all.length <= maxCount) return;
    all.sort((a, b) => a.changed_at - b.changed_at);
    const toDelete = all.slice(0, all.length - maxCount).map((h) => h.id!);
    await this.history.bulkDelete(toDelete);
  }

  // ── エクスポート/インポート ───────────────────────────

  async exportData() {
    const [tasks, fields, entries, noteLinks, historyAll] = await Promise.all([
      this.getAllTasks(),
      this.getAllFields(),
      this.getAllEntries(),
      this.note_links.toArray(),
      this.history.toArray(),
    ]);
    return {
      type: 'note_export',
      version: 2,
      tasks,
      fields,
      entries,
      note_links: noteLinks,
      history: historyAll,
    };
  }

  async importData(data: ReturnType<NoteDatabase['exportData']> extends Promise<infer T> ? T : never): Promise<void> {
    // Dexie.transaction の引数上限を避けるため stores を配列で渡す
    await this.transaction(
      'rw',
      [this.tasks, this.fields, this.entries, this.note_links, this.history],
      async () => {
        await this.tasks.clear();
        await this.fields.clear();
        await this.entries.clear();
        await this.note_links.clear();
        await this.history.clear();
        await this.tasks.bulkPut((data.tasks as NoteTask[]) ?? []);
        await this.fields.bulkPut((data.fields as NoteField[]) ?? []);
        await this.entries.bulkPut((data.entries as NoteEntry[]) ?? []);
        await this.note_links.bulkPut((data.note_links as NoteLink[]) ?? []);
        await this.history.bulkPut((data.history as NoteHistory[]) ?? []);
      },
    );
  }
}

export const noteDB = new NoteDatabase();
