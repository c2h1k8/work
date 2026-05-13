// ==================================================
// DashboardDB - カスタムダッシュボード IndexedDB（Dexie.js）
// ==================================================
// DB名: dashboard_db  version: 2
//
// ストア:
//   sections:   id*, instance_id, title, icon, type, position, width, ...
//   items:      id*, section_id, position, item_type, label, hint, value, emoji, row_data, ...
//   presets:    id*, instance_id, name, position, values
//   app_config: name*, value

import Dexie, { type Table } from 'dexie';
import { sortByPosition } from '../core/utils';

// セクション埋め込み・共通プリセット両方で使う共通型
export type BindPreset = { id: number; name: string; values: Record<string, string> };
// セクション固有プリセット（インライン保存のため id は string | number どちらでも可）
export type SectionPreset = { id: string | number; name: string; values: Record<string, string> };

export type SectionType =
  | 'list'
  | 'grid'
  | 'command_builder'
  | 'table'
  | 'memo'
  | 'checklist'
  | 'markdown'
  | 'iframe'
  | 'countdown';

export type SectionWidth = 'narrow' | 'auto' | 'w3' | 'wide' | 'w5' | 'full';
export type ItemType = 'copy' | 'link' | 'template' | 'row';

export interface DashboardSection {
  id?: number;
  instance_id: string;
  title: string;
  icon: string;
  type: SectionType;
  position: number;
  width: SectionWidth;
  // バインド変数
  table_bind_vars?: string[];
  table_presets?: SectionPreset[];
  table_vars_ui_type?: 'pill' | 'segment' | 'tabs' | 'select';
  table_vars_bar_label?: string;
  list_bind_vars?: string[];
  list_presets?: SectionPreset[];
  list_vars_ui_type?: 'pill' | 'segment' | 'tabs' | 'select';
  list_vars_bar_label?: string;
  grid_bind_vars?: string[];
  grid_presets?: SectionPreset[];
  grid_vars_ui_type?: 'pill' | 'segment' | 'tabs' | 'select';
  grid_vars_bar_label?: string;
  // list 専用
  show_filter?: boolean;
  // command_builder 専用
  command_template?: string;
  action_mode?: 'copy' | 'open';
  cmd_buttons?: Array<{ id: string; label: string; template: string; action_mode: 'copy' | 'open' }>;
  history_limit?: number;
  // table 専用
  columns?: Array<{ id: string; label: string; type: 'text' | 'copy' | 'link' }>;
  page_size?: number;
  // checklist 専用
  checklist_reset?: 'never' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  // memo 専用
  memo_content?: string;
  // markdown 専用
  body?: string;
  // iframe 専用
  url?: string;
  iframe_height?: number;
  // countdown 専用
  countdown_mode?: 'calendar' | 'business';
  // レイアウト
  new_row?: boolean;
}

export interface DashboardItem {
  id?: number;
  section_id: number;
  position: number;
  item_type: ItemType;
  label: string;
  hint?: string;
  value: string;
  emoji?: string;
  row_data?: Record<string, string>;
  new_row?: boolean;
  use_count?: number;
}

export interface DashboardPreset {
  id?: number;
  instance_id: string;
  name: string;
  position: number;
  values: Record<string, string>;
}

export interface DashboardAppConfig {
  name: string;
  value: unknown;
}

class DashboardDatabase extends Dexie {
  sections!: Table<DashboardSection, number>;
  items!: Table<DashboardItem, number>;
  presets!: Table<DashboardPreset, number>;
  app_config!: Table<DashboardAppConfig, string>;

  constructor() {
    super('dashboard_db');
    this.version(1).stores({
      sections: '++id, position, instance_id',
      items: '++id, section_id, position',
    });
    this.version(2).stores({
      sections: '++id, position, instance_id',
      items: '++id, section_id, position',
      app_config: 'name',
      presets: '++id, instance_id',
    });
    // TODO: 次リリースで .upgrade() を削除（スキーマ変更なし）
    this.version(3)
      .stores({
        sections:   '++id, position, instance_id',
        items:      '++id, section_id, position',
        app_config: 'name',
        presets:    '++id, instance_id',
      })
      .upgrade(async (tx) => {
        const sections = await tx.table('sections').toArray();
        for (const s of sections) {
          if (!s.cmd_buttons?.length) continue;
          const existing = await tx.table('items').where('section_id').equals(s.id).count();
          if (existing > 0) continue;
          for (let i = 0; i < s.cmd_buttons.length; i++) {
            const btn = s.cmd_buttons[i];
            await tx.table('items').add({
              section_id: s.id, position: i, use_count: 0,
              item_type: btn.action_mode === 'open' ? 'link' : 'copy',
              label: btn.label, value: btn.template, hint: '',
            });
          }
          await tx.table('sections').update(s.id, { cmd_buttons: [] });
        }
      });
  }

  // ── Sections ──────────────────────────

  async getAllSections(instanceId: string): Promise<DashboardSection[]> {
    const all = await this.sections.where('instance_id').equals(instanceId).toArray();
    return sortByPosition(all);
  }

  async addSection(data: Omit<DashboardSection, 'id'>, instanceId: string): Promise<number> {
    return this.sections.add({ ...data, instance_id: instanceId });
  }

  async updateSection(data: DashboardSection): Promise<void> {
    await this.sections.put(data);
  }

  async patchSection(id: number, patch: Partial<DashboardSection>): Promise<void> {
    await this.sections.update(id, patch);
  }

  async deleteSection(id: number): Promise<void> {
    await this.transaction('rw', this.sections, this.items, async () => {
      await this.items.where('section_id').equals(id).delete();
      await this.sections.delete(id);
    });
  }

  async countSections(instanceId: string): Promise<number> {
    return this.sections.where('instance_id').equals(instanceId).count();
  }

  // ── Items ─────────────────────────────

  async getItemsBySection(sectionId: number): Promise<DashboardItem[]> {
    const all = await this.items.where('section_id').equals(sectionId).toArray();
    return sortByPosition(all);
  }

  async addItem(data: Omit<DashboardItem, 'id'>): Promise<number> {
    return this.items.add(data as DashboardItem);
  }

  async updateItem(data: DashboardItem): Promise<void> {
    await this.items.put(data);
  }

  async deleteItem(id: number): Promise<void> {
    await this.items.delete(id);
  }

  async incrementUseCount(itemId: number): Promise<void> {
    const item = await this.items.get(itemId);
    if (!item) return;
    await this.items.put({ ...item, use_count: (item.use_count ?? 0) + 1 });
  }

  async clearUseCounts(sectionId: number): Promise<void> {
    const items = await this.getItemsBySection(sectionId);
    await this.items.bulkPut(items.map((item) => ({ ...item, use_count: 0 })));
  }

  // ── 共通バインド変数プリセット ──────────────────────────

  async getAllPresets(instanceId: string): Promise<DashboardPreset[]> {
    const all = await this.presets.where('instance_id').equals(instanceId).toArray();
    return sortByPosition(all);
  }

  async addPreset(data: Omit<DashboardPreset, 'id'>, instanceId: string): Promise<number> {
    return this.presets.add({ ...data, instance_id: instanceId });
  }

  async updatePreset(data: DashboardPreset): Promise<void> {
    await this.presets.put(data);
  }

  async deletePreset(id: number): Promise<void> {
    await this.presets.delete(id);
  }

  // ── アプリ設定 ───────────���────────────────

  async getAppConfig<T = unknown>(key: string, instanceId: string): Promise<T | null> {
    const record = await this.app_config.get(`${key}_${instanceId}`);
    return (record?.value as T) ?? null;
  }

  async setAppConfig(key: string, instanceId: string, value: unknown): Promise<void> {
    await this.app_config.put({ name: `${key}_${instanceId}`, value });
  }

  // ── エクスポート/インポート ────────────

  async exportInstance(instanceId: string) {
    const sections = await this.getAllSections(instanceId);
    const items: DashboardItem[] = [];
    for (const section of sections) {
      const sectionItems = await this.getItemsBySection(section.id!);
      items.push(...sectionItems);
    }
    const presets = await this.getAllPresets(instanceId);
    const bindConfig = await this.getAppConfig('bind_config', instanceId);
    return { sections, items, presets, bindConfig };
  }

  async importInstance(
    data: Awaited<ReturnType<DashboardDatabase['exportInstance']>>,
    instanceId: string,
    replace = true,
  ): Promise<void> {
    if (replace) {
      const existing = await this.getAllSections(instanceId);
      for (const s of existing) await this.deleteSection(s.id!);
      const existingPresets = await this.getAllPresets(instanceId);
      for (const p of existingPresets) await this.deletePreset(p.id!);
    }

    const idMap: Record<number, number> = {};
    for (const section of data.sections ?? []) {
      const oldId = section.id!;
      const { id: _id, ...newSection } = section;
      const newId = await this.sections.add({ ...newSection, instance_id: instanceId });
      idMap[oldId] = newId;
    }
    for (const item of data.items ?? []) {
      const { id: _id, ...newItem } = item;
      if (idMap[newItem.section_id] !== undefined) {
        await this.items.add({ ...newItem, section_id: idMap[newItem.section_id] });
      }
    }
    for (const preset of data.presets ?? []) {
      const { id: _id, ...newPreset } = preset;
      await this.presets.add({ ...newPreset, instance_id: instanceId });
    }
    if (data.bindConfig) {
      await this.setAppConfig('bind_config', instanceId, data.bindConfig);
    }
  }

  async deleteInstance(instanceId: string): Promise<void> {
    const sections = await this.getAllSections(instanceId);
    for (const s of sections) await this.deleteSection(s.id!);
    const presets = await this.getAllPresets(instanceId);
    for (const p of presets) await this.deletePreset(p.id!);
  }
}

export const dashboardDB = new DashboardDatabase();
