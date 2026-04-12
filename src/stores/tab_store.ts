// ==================================================
// tab_store: タブ設定状態管理 (Zustand)
// ==================================================
// - タブ設定は IndexedDB (app_db) に永続化
// - アクティブタブ ID は localStorage に保存
// - loadConfig() を初期化時に呼ぶこと

import { create } from 'zustand';
import { appDB } from '../db/app_db';
import { TAB_ITEMS, STORAGE_KEY_ACTIVE_TAB, type TabConfig } from '../constants/tabs';

function sortByPosition<T extends { position: number }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => a.position - b.position);
}

function getDefaultConfig(): TabConfig[] {
  return TAB_ITEMS.map((item, i) => ({
    label: item.label,
    pageSrc: item.pageSrc,
    icon: item.icon,
    visible: true,
    position: i,
    isBuiltIn: true,
  }));
}

async function loadTabConfigFromDB(): Promise<TabConfig[]> {
  let saved = await appDB.get<TabConfig[]>('tab_config');

  if (!saved || !Array.isArray(saved) || saved.length === 0) {
    return getDefaultConfig();
  }

  // TAB_ITEMS に存在するが config にない組み込みタブを末尾に追加
  const maxPosition = saved.reduce((m, t) => Math.max(m, t.position ?? 0), 0);
  let offset = 1;
  let added = false;
  for (const item of TAB_ITEMS) {
    if (!saved.some((t) => t.pageSrc === item.pageSrc && t.isBuiltIn)) {
      saved.push({
        label: item.label,
        pageSrc: item.pageSrc,
        icon: item.icon,
        visible: true,
        position: maxPosition + offset++,
        isBuiltIn: true,
      });
      added = true;
    }
  }
  if (added) await appDB.set('tab_config', saved);

  return sortByPosition(saved);
}

interface TabStore {
  config: TabConfig[];
  activeTabId: string;
  settingsOpen: boolean;
  activityLogOpen: boolean;
  isLoading: boolean;

  // 初期化
  loadConfig: () => Promise<void>;

  // ナビゲーション
  setActiveTab: (label: string) => void;
  switchTabRelative: (delta: 1 | -1) => void;

  // 設定パネル
  openSettings: () => void;
  closeSettings: () => void;

  // アクティビティログ
  openActivityLog: () => void;
  closeActivityLog: () => void;

  // タブ操作（設定パネルから）
  toggleTabVisible: (label: string) => Promise<void>;
  moveTab: (label: string, dir: 'up' | 'down') => Promise<void>;
  deleteTab: (label: string) => Promise<void>;
  addTab: (tab: Omit<TabConfig, 'position'>) => Promise<void>;
  updateTabIcon: (label: string, icon: string) => Promise<void>;
  renameTab: (label: string, newLabel: string) => Promise<void>;
}

export const useTabStore = create<TabStore>((set, get) => ({
  config: [],
  activeTabId: '',
  settingsOpen: false,
  activityLogOpen: false,
  isLoading: true,

  loadConfig: async () => {
    const config = await loadTabConfigFromDB();
    const visibleTabs = config.filter((t) => t.visible);
    const defaultTab = visibleTabs.find((t) =>
      TAB_ITEMS.some((ti) => ti.pageSrc === t.pageSrc && ti.isDefault)
    ) ?? visibleTabs[0];

    const savedId = localStorage.getItem(STORAGE_KEY_ACTIVE_TAB) ?? '';
    const validId = savedId && config.some((t) => `TAB-${t.label}` === savedId && t.visible)
      ? savedId
      : `TAB-${defaultTab?.label ?? ''}`;

    set({ config, activeTabId: validId, isLoading: false });
  },

  setActiveTab: (label) => {
    const id = `TAB-${label}`;
    localStorage.setItem(STORAGE_KEY_ACTIVE_TAB, id);
    set({ activeTabId: id });
  },

  switchTabRelative: (delta) => {
    const { config, activeTabId } = get();
    const visible = config.filter((t) => t.visible);
    if (visible.length === 0) return;
    const currentIdx = visible.findIndex((t) => `TAB-${t.label}` === activeTabId);
    const nextIdx = (currentIdx + delta + visible.length) % visible.length;
    get().setActiveTab(visible[nextIdx].label);
  },

  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),

  openActivityLog: () => set({ activityLogOpen: true }),
  closeActivityLog: () => set({ activityLogOpen: false }),

  toggleTabVisible: async (label) => {
    const config = get().config.map((t) =>
      t.label === label ? { ...t, visible: !t.visible } : t
    );
    await appDB.set('tab_config', config);
    // 非表示にしたタブがアクティブなら切り替え
    const { activeTabId } = get();
    const now = config.find((t) => `TAB-${t.label}` === activeTabId);
    let nextActiveId = activeTabId;
    if (now && !now.visible) {
      const first = config.find((t) => t.visible);
      nextActiveId = first ? `TAB-${first.label}` : '';
      if (nextActiveId) localStorage.setItem(STORAGE_KEY_ACTIVE_TAB, nextActiveId);
    }
    set({ config, activeTabId: nextActiveId });
  },

  moveTab: async (label, dir) => {
    const sorted = sortByPosition(get().config);
    const idx = sorted.findIndex((t) => t.label === label);
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    [sorted[idx].position, sorted[swapIdx].position] = [sorted[swapIdx].position, sorted[idx].position];
    const newConfig = sortByPosition(sorted);
    await appDB.set('tab_config', newConfig);
    set({ config: newConfig });
  },

  deleteTab: async (label) => {
    const config = get().config.filter((t) => t.label !== label);
    // position を詰め直す
    const reindexed = sortByPosition(config).map((t, i) => ({ ...t, position: i }));
    await appDB.set('tab_config', reindexed);
    const { activeTabId } = get();
    let nextActiveId = activeTabId;
    if (activeTabId === `TAB-${label}`) {
      const first = reindexed.find((t) => t.visible);
      nextActiveId = first ? `TAB-${first.label}` : '';
      if (nextActiveId) localStorage.setItem(STORAGE_KEY_ACTIVE_TAB, nextActiveId);
    }
    set({ config: reindexed, activeTabId: nextActiveId });
  },

  addTab: async (tab) => {
    const config = get().config;
    const maxPos = config.reduce((m, t) => Math.max(m, t.position), -1);
    const newTab: TabConfig = { ...tab, position: maxPos + 1 };
    const newConfig = [...config, newTab];
    await appDB.set('tab_config', newConfig);
    set({ config: newConfig });
  },

  updateTabIcon: async (label, icon) => {
    const config = get().config.map((t) =>
      t.label === label ? { ...t, icon } : t
    );
    await appDB.set('tab_config', config);
    set({ config });
  },

  renameTab: async (label, newLabel) => {
    const config = get().config.map((t) =>
      t.label === label ? { ...t, label: newLabel } : t
    );
    await appDB.set('tab_config', config);
    const { activeTabId } = get();
    const nextActiveId = activeTabId === `TAB-${label}` ? `TAB-${newLabel}` : activeTabId;
    if (nextActiveId !== activeTabId) localStorage.setItem(STORAGE_KEY_ACTIVE_TAB, nextActiveId);
    set({ config, activeTabId: nextActiveId });
  },
}));
