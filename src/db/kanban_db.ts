// ==================================================
// KanbanDB - Kanban ボード IndexedDB（Dexie.js）
// ==================================================
// DB名: kanban_db  version: 2
//
// ストア:
//   tasks:          id*, title, description, column, position, due_date,
//                   created_at, updated_at, checklist, recurring
//   comments:       id*, task_id, body, created_at, updated_at
//   labels:         id*, name, color
//   task_labels:    [task_id+label_id]* （複合キー）
//   columns:        id*, key, name, position, wip_limit
//   activities:     id*, task_id, type, content, created_at
//   task_relations: id*, task_id, related_id, relation_type
//   note_links:     id*, todo_task_id, note_task_id
//   templates:      id*, name, title, description, checklist, label_ids, position (v2)
//   archives:       id*, archived_at, ...tasks フィールド (v2)
//   dependencies:   id*, from_task_id, to_task_id (v2)

import Dexie, { type Table } from 'dexie';
import { sortByPosition } from '../core/utils';

export type RelationType = 'child' | 'related';

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  position: number;
}

export interface RecurringConfig {
  interval: 'daily' | 'weekly' | 'monthly';
  next_date: string;
}

export interface KanbanTask {
  id?: number;
  title: string;
  description: string;
  column: string;
  position: number;
  due_date: string;
  created_at: string;
  updated_at: string;
  checklist?: ChecklistItem[] | null;
  recurring?: RecurringConfig | null;
}

export interface KanbanComment {
  id?: number;
  task_id: number;
  body: string;
  created_at: string;
  updated_at?: string;
  deleted_at?: string;
}

export interface KanbanLabel {
  id?: number;
  name: string;
  color: string;
}

export interface KanbanTaskLabel {
  task_id: number;
  label_id: number;
}

export interface KanbanColumn {
  id?: number;
  key: string;
  name: string;
  position: number;
  wip_limit?: number;
  done?: boolean;
}

export interface KanbanActivity {
  id?: number;
  task_id: number;
  type: string;
  content: Record<string, unknown>;
  created_at: string;
}

export interface KanbanTaskRelation {
  id?: number;
  task_id: number;
  related_id: number;
  relation_type: RelationType;
}

export interface KanbanNoteLink {
  id?: number;
  todo_task_id: number;
  note_task_id: number;
}

export interface KanbanTemplate {
  id?: number;
  name: string;
  title: string;
  description: string;
  checklist?: ChecklistItem[] | null;
  label_ids: number[];
  position: number;
}

export interface KanbanArchive extends Omit<KanbanTask, 'id'> {
  id?: number;
  archived_at: string;
  archived_activities?: KanbanActivity[];
  archived_label_ids?: number[];
  archived_comments?: KanbanComment[];
}

export interface KanbanDependency {
  id?: number;
  from_task_id: number;
  to_task_id: number;
}

class KanbanDatabase extends Dexie {
  tasks!: Table<KanbanTask, number>;
  comments!: Table<KanbanComment, number>;
  labels!: Table<KanbanLabel, number>;
  task_labels!: Table<KanbanTaskLabel, [number, number]>;
  columns!: Table<KanbanColumn, number>;
  activities!: Table<KanbanActivity, number>;
  task_relations!: Table<KanbanTaskRelation, number>;
  note_links!: Table<KanbanNoteLink, number>;
  templates!: Table<KanbanTemplate, number>;
  archives!: Table<KanbanArchive, number>;
  dependencies!: Table<KanbanDependency, number>;

  constructor() {
    super('kanban_db');
    this.version(1).stores({
      tasks:          '++id, column, position',
      comments:       '++id, task_id',
      labels:         '++id',
      task_labels:    '[task_id+label_id], task_id',
      columns:        '++id, &key, position',
      activities:     '++id, task_id',
      task_relations: '++id, task_id, related_id',
      note_links:     '++id, todo_task_id, note_task_id',
    });
    this.version(2).stores({
      tasks:          '++id, column, position',
      comments:       '++id, task_id',
      labels:         '++id',
      task_labels:    '[task_id+label_id], task_id',
      columns:        '++id, &key, position',
      activities:     '++id, task_id',
      task_relations: '++id, task_id, related_id',
      note_links:     '++id, todo_task_id, note_task_id',
      templates:      '++id, position',
      archives:       '++id, archived_at',
      dependencies:   '++id, from_task_id, to_task_id',
    });
  }

  // ---- Tasks ----

  async getAllTasks(): Promise<KanbanTask[]> {
    return this.tasks.toArray();
  }

  async getTasksByColumn(column: string): Promise<KanbanTask[]> {
    const tasks = await this.tasks.where('column').equals(column).toArray();
    return sortByPosition(tasks);
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

  async deleteTask(id: number): Promise<void> {
    await this.deleteRelationsByTask(id);
    await this.deleteNoteLinksByTodo(id);
    await this.deleteDependenciesForTask(id);

    const [comments, taskLabels, activities] = await Promise.all([
      this.comments.where('task_id').equals(id).toArray(),
      this.task_labels.where('task_id').equals(id).toArray(),
      this.activities.where('task_id').equals(id).toArray(),
    ]);

    await this.transaction(
      'rw',
      this.tasks,
      this.comments,
      this.task_labels,
      this.activities,
      async () => {
        await this.tasks.delete(id);
        await this.comments.bulkDelete(comments.map((c) => c.id!));
        await this.task_labels.bulkDelete(
          taskLabels.map((tl) => [tl.task_id, tl.label_id] as [number, number]),
        );
        await this.activities.bulkDelete(activities.map((a) => a.id!));
      },
    );
  }

  // ---- Comments ----

  async getCommentsByTask(taskId: number): Promise<KanbanComment[]> {
    const comments = await this.comments.where('task_id').equals(taskId).toArray();
    return comments.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
  }

  async addComment(taskId: number, body: string): Promise<KanbanComment> {
    const comment: KanbanComment = {
      task_id: taskId,
      body,
      created_at: new Date().toISOString(),
    };
    const id = await this.comments.add(comment);
    return { ...comment, id };
  }

  async updateComment(id: number, changes: Partial<KanbanComment>): Promise<KanbanComment> {
    const existing = await this.comments.get(id);
    if (!existing) throw new Error(`Comment ${id} not found`);
    const updated = { ...existing, ...changes };
    await this.comments.put(updated);
    return updated;
  }

  async deleteComment(id: number): Promise<KanbanComment> {
    const existing = await this.comments.get(id);
    if (!existing) throw new Error(`Comment ${id} not found`);
    const updated = { ...existing, deleted_at: new Date().toISOString() };
    await this.comments.put(updated);
    return updated;
  }

  // ---- Labels ----

  async getAllLabels(): Promise<KanbanLabel[]> {
    return this.labels.toArray();
  }

  async addLabel(name: string, color: string): Promise<KanbanLabel> {
    const label: KanbanLabel = { name, color };
    const id = await this.labels.add(label);
    return { ...label, id };
  }

  async updateLabel(id: number, name: string, color: string): Promise<void> {
    await this.labels.put({ id, name, color });
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

  async getTaskLabels(taskId: number): Promise<KanbanTaskLabel[]> {
    return this.task_labels.where('task_id').equals(taskId).toArray();
  }

  async addTaskLabel(taskId: number, labelId: number): Promise<void> {
    await this.task_labels.put({ task_id: taskId, label_id: labelId });
  }

  async removeTaskLabel(taskId: number, labelId: number): Promise<void> {
    await this.task_labels.delete([taskId, labelId]);
  }

  // ---- Columns ----

  async getAllColumns(): Promise<KanbanColumn[]> {
    return this.columns.toArray();
  }

  async addColumn(name: string, key: string, position: number): Promise<KanbanColumn> {
    const col: KanbanColumn = { name, key, position };
    const id = await this.columns.add(col);
    return { ...col, id };
  }

  async updateColumn(col: KanbanColumn): Promise<void> {
    await this.columns.put(col);
  }

  async deleteColumn(id: number): Promise<void> {
    await this.columns.delete(id);
  }

  // ---- Task Relations ----

  async addRelation(
    taskId: number,
    relatedId: number,
    type: RelationType,
  ): Promise<KanbanTaskRelation> {
    const record: KanbanTaskRelation =
      type === 'child'
        ? { task_id: taskId, related_id: relatedId, relation_type: 'child' }
        : {
            task_id: Math.min(taskId, relatedId),
            related_id: Math.max(taskId, relatedId),
            relation_type: 'related',
          };
    const id = await this.task_relations.add(record);
    return { ...record, id };
  }

  async deleteRelation(id: number): Promise<void> {
    await this.task_relations.delete(id);
  }

  async getRelationsByTask(taskId: number) {
    const [byTaskId, byRelatedId] = await Promise.all([
      this.task_relations.where('task_id').equals(taskId).toArray(),
      this.task_relations.where('related_id').equals(taskId).toArray(),
    ]);
    const allTasks = await this.getAllTasks();
    const taskMap = new Map(allTasks.map((t) => [t.id!, t]));

    let parent: { task: KanbanTask; relationId: number } | null = null;
    const children: Array<{ task: KanbanTask; relationId: number }> = [];
    const related: Array<{ task: KanbanTask; relationId: number }> = [];

    for (const rel of byTaskId) {
      if (rel.relation_type === 'child') {
        const t = taskMap.get(rel.related_id);
        if (t) children.push({ task: t, relationId: rel.id! });
      } else {
        const t = taskMap.get(rel.related_id);
        if (t) related.push({ task: t, relationId: rel.id! });
      }
    }
    for (const rel of byRelatedId) {
      if (rel.relation_type === 'child') {
        const t = taskMap.get(rel.task_id);
        if (t) parent = { task: t, relationId: rel.id! };
      } else {
        const t = taskMap.get(rel.task_id);
        if (t) related.push({ task: t, relationId: rel.id! });
      }
    }
    return { parent, children, related };
  }

  async deleteRelationsByTask(taskId: number): Promise<void> {
    const [byTaskId, byRelatedId] = await Promise.all([
      this.task_relations.where('task_id').equals(taskId).toArray().catch(() => []),
      this.task_relations.where('related_id').equals(taskId).toArray().catch(() => []),
    ]);
    const ids = [...byTaskId, ...byRelatedId].map((r) => r.id!);
    if (ids.length > 0) await this.task_relations.bulkDelete(ids);
  }

  // ---- Note Links ----

  async addNoteLink(todoTaskId: number, noteTaskId: number): Promise<KanbanNoteLink> {
    const record: KanbanNoteLink = { todo_task_id: todoTaskId, note_task_id: noteTaskId };
    const id = await this.note_links.add(record);
    return { ...record, id };
  }

  async getNoteLinksByTodo(todoTaskId: number): Promise<KanbanNoteLink[]> {
    return this.note_links.where('todo_task_id').equals(todoTaskId).toArray();
  }

  async deleteNoteLink(id: number): Promise<void> {
    await this.note_links.delete(id);
  }

  async deleteNoteLinksByTodo(todoTaskId: number): Promise<void> {
    await this.note_links.where('todo_task_id').equals(todoTaskId).delete();
  }

  // ---- Activities ----

  async addActivity(
    taskId: number,
    type: string,
    content: Record<string, unknown>,
  ): Promise<KanbanActivity> {
    const act: KanbanActivity = {
      task_id: taskId,
      type,
      content,
      created_at: new Date().toISOString(),
    };
    const id = await this.activities.add(act);
    return { ...act, id };
  }

  async getActivitiesByTask(taskId: number): Promise<KanbanActivity[]> {
    const acts = await this.activities.where('task_id').equals(taskId).toArray();
    return acts.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
  }

  // ---- Templates ----

  async getAllTemplates(): Promise<KanbanTemplate[]> {
    const all = await this.templates.toArray();
    return sortByPosition(all);
  }

  async addTemplate(template: Omit<KanbanTemplate, 'id'>): Promise<KanbanTemplate> {
    const id = await this.templates.add(template as KanbanTemplate);
    return { ...template, id };
  }

  async updateTemplate(template: KanbanTemplate): Promise<void> {
    await this.templates.put(template);
  }

  async deleteTemplate(id: number): Promise<void> {
    await this.templates.delete(id);
  }

  // ---- Archives ----

  async archiveTask(task: KanbanTask): Promise<KanbanArchive> {
    const [activities, comments, taskLabels] = await Promise.all([
      this.activities.where('task_id').equals(task.id!).toArray(),
      this.comments.where('task_id').equals(task.id!).toArray(),
      this.task_labels.where('task_id').equals(task.id!).toArray(),
    ]);
    const archive: KanbanArchive = {
      ...task,
      id: undefined,
      archived_at: new Date().toISOString(),
      archived_activities: activities,
      archived_comments: comments,
      archived_label_ids: taskLabels.map((tl) => tl.label_id),
    };
    const id = await this.archives.add(archive);
    return { ...archive, id };
  }

  async getAllArchives(): Promise<KanbanArchive[]> {
    const all = await this.archives.toArray();
    return all.sort(
      (a, b) => new Date(b.archived_at).getTime() - new Date(a.archived_at).getTime(),
    );
  }

  async deleteArchive(id: number): Promise<void> {
    await this.archives.delete(id);
  }

  // ---- Dependencies ----

  async addDependency(fromTaskId: number, toTaskId: number): Promise<KanbanDependency> {
    const dep: KanbanDependency = { from_task_id: fromTaskId, to_task_id: toTaskId };
    const id = await this.dependencies.add(dep);
    return { ...dep, id };
  }

  async getDependenciesForTask(taskId: number): Promise<KanbanDependency[]> {
    const [from, to] = await Promise.all([
      this.dependencies.where('from_task_id').equals(taskId).toArray(),
      this.dependencies.where('to_task_id').equals(taskId).toArray(),
    ]);
    return [...from, ...to];
  }

  async deleteDependency(id: number): Promise<void> {
    await this.dependencies.delete(id);
  }

  async deleteDependenciesForTask(taskId: number): Promise<void> {
    await Promise.all([
      this.dependencies.where('from_task_id').equals(taskId).delete(),
      this.dependencies.where('to_task_id').equals(taskId).delete(),
    ]);
  }

  // ---- Export / Import ----

  async importAll(data: {
    version?: number;
    tasks?: KanbanTask[];
    comments?: KanbanComment[];
    labels?: KanbanLabel[];
    task_labels?: KanbanTaskLabel[];
    columns?: KanbanColumn[];
    activities?: KanbanActivity[];
    task_relations?: KanbanTaskRelation[];
    note_links?: KanbanNoteLink[];
    templates?: KanbanTemplate[];
    archives?: KanbanArchive[];
    dependencies?: KanbanDependency[];
  }): Promise<void> {
    await this.transaction(
      'rw',
      [this.tasks, this.comments, this.labels, this.task_labels, this.columns,
       this.activities, this.task_relations, this.note_links, this.templates,
       this.archives, this.dependencies],
      async () => {
        await Promise.all([
          this.tasks.clear(), this.comments.clear(), this.labels.clear(),
          this.task_labels.clear(), this.columns.clear(), this.activities.clear(),
          this.task_relations.clear().catch(() => {}),
          this.note_links.clear().catch(() => {}),
          this.templates.clear().catch(() => {}),
          this.archives.clear().catch(() => {}),
          this.dependencies.clear().catch(() => {}),
        ]);
        if (data.tasks?.length)          await this.tasks.bulkPut(data.tasks);
        if (data.comments?.length)       await this.comments.bulkPut(data.comments);
        if (data.labels?.length)         await this.labels.bulkPut(data.labels);
        if (data.task_labels?.length)    await this.task_labels.bulkPut(data.task_labels);
        if (data.columns?.length)        await this.columns.bulkPut(data.columns);
        if (data.activities?.length)     await this.activities.bulkPut(data.activities);
        if (data.task_relations?.length) await this.task_relations.bulkPut(data.task_relations);
        if (data.note_links?.length)     await this.note_links.bulkPut(data.note_links);
        if (data.templates?.length)      await this.templates.bulkPut(data.templates);
        if (data.archives?.length)       await this.archives.bulkPut(data.archives);
        if (data.dependencies?.length)   await this.dependencies.bulkPut(data.dependencies);
      },
    );
  }

  async exportAll() {
    const [
      tasks, comments, labels, task_labels, columns, activities,
      task_relations, note_links, templates, archives, dependencies,
    ] = await Promise.all([
      this.tasks.toArray(),
      this.comments.toArray(),
      this.labels.toArray(),
      this.task_labels.toArray(),
      this.columns.toArray(),
      this.activities.toArray(),
      this.task_relations.toArray().catch(() => []),
      this.note_links.toArray().catch(() => []),
      this.templates.toArray().catch(() => []),
      this.archives.toArray().catch(() => []),
      this.dependencies.toArray().catch(() => []),
    ]);
    return {
      version: 6,
      exported_at: new Date().toISOString(),
      tasks, comments, labels, task_labels, columns, activities,
      task_relations, note_links, templates, archives, dependencies,
    };
  }
}

export const kanbanDB = new KanbanDatabase();
