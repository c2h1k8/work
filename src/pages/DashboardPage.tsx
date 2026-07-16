// ==================================================
// DashboardPage — カスタムダッシュボード
// ==================================================
// セクションタイプ: list / grid / command_builder / table /
//                  memo / checklist / markdown / iframe / countdown
// バインド変数: 共通プリセット + セクション固有プリセット（2段階解決）
// 列値バインド: {@列名}（table のみ・同じ行の他列の生値を埋め込む。行依存）
// 日付変数: {TODAY} / {NOW} / {DATE:±N単位:Fmt}

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
} from '@dnd-kit/sortable';
import {
  Settings2Icon,
  
  
  
  
  
} from 'lucide-react';
import {
  dashboardDB,
  type DashboardSection, type DashboardItem, type DashboardPreset,
  type SectionType, type SectionWidth,
} from '../db/dashboard_db';
import { lsSet, lsJson } from '../core/utils';
import { useTabLabel } from '../contexts/TabContext';
import { useTabStore } from '../stores/tab_store';
import { useToast } from '../components/Toast';
import { FileSaver } from '../core/file_saver';
import { ActivityLogger } from '../core/activity_logger';
import { ShortcutHelp } from '../components/ShortcutHelp';
import { confirmDialog } from '../components/ConfirmDialog';
import {
  ACTIVE_PRESET_KEY_PREFIX, DASHBOARD_SHORTCUTS,
  type BindConfig,
} from './dashboard/shared';
import { SectionCard } from './dashboard/sections';
import { SectionEditModal } from './dashboard/SectionEditModal';
import { ItemManagerModal } from './dashboard/ItemManagerModal';
import { DashboardSettingsPanel, BindVarBar, SectionJumpNav } from './dashboard/settings';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// メインコンポーネント
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function DashboardPage() {
  const tabLabel = useTabLabel();
  const { config } = useTabStore();
  // pageSrc の ?instance= パラメータを instanceId として使用（VanillaJS 互換）
  // 例: 'pages/dashboard.html'           → instanceId = ""
  //     'pages/dashboard.html?instance=x' → instanceId = "x"
  const instanceId = useMemo(() => {
    const tab = config.find(t => t.label === tabLabel);
    const qs = tab?.pageSrc.split('?')[1] ?? '';
    return new URLSearchParams(qs).get('instance') ?? '';
  }, [tabLabel, config]);
  const toast = useToast();

  const [sections,       setSections]       = useState<DashboardSection[]>([]);
  const [itemsMap,       setItemsMap]       = useState<Record<number, DashboardItem[]>>({});
  const [presets,        setPresets]        = useState<DashboardPreset[]>([]);
  const [activePresetId, setActivePresetId] = useState<number | null>(
    () => {
      const key = ACTIVE_PRESET_KEY_PREFIX + instanceId;
      const v = lsJson<number | null>(key);
      return v ?? null;
    }
  );
  const [bindConfig, setBindConfig] = useState<BindConfig>({ varNames: [], uiType: 'segment' });

  // モーダル状態
  const [editingSection, setEditingSection] = useState<DashboardSection | null | undefined>(undefined);  // undefined = 閉じてる, null = 新規
  const [itemMgrSection, setItemMgrSection] = useState<DashboardSection | null>(null);
  // sections の最新値を常に参照できる ref（安定コールバックから参照するため）
  const sectionsRef = useRef<DashboardSection[]>([]);

  // ── データ読み込み ────────────────────────────────────
  const load = useCallback(async () => {
    const [secs, pres, cfg] = await Promise.all([
      dashboardDB.getAllSections(instanceId),
      dashboardDB.getAllPresets(instanceId),
      dashboardDB.getAppConfig<{ varNames: string[] }>('bind_config', instanceId),
    ]);
    setSections(secs);
    sectionsRef.current = secs;
    setPresets(pres);
    setBindConfig(cfg || { varNames: [] });

    const map: Record<number, DashboardItem[]> = {};
    await Promise.all(secs.map(async (s) => {
      map[s.id!] = await dashboardDB.getItemsBySection(s.id!);
    }));
    setItemsMap(map);
  }, [instanceId]);

  useEffect(() => { load(); }, [load]);

  // アクティブプリセット変更
  function changeActivePreset(id: number | null) {
    setActivePresetId(id);
    lsSet(ACTIVE_PRESET_KEY_PREFIX + instanceId, JSON.stringify(id));
  }

  // ── DnD セクション並び替え ────────────────────────────
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = sections.findIndex((s) => s.id === active.id);
    const newIdx = sections.findIndex((s) => s.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(sections, oldIdx, newIdx).map((s, i) => ({ ...s, position: i }));
    setSections(reordered);
    await Promise.all(reordered.map((s) => dashboardDB.updateSection(s)));
  }

  // ── アイテム変更後のリロード ───────────────────────────
  const reloadItems = useCallback(async (sectionId?: number) => {
    if (sectionId !== undefined) {
      const items = await dashboardDB.getItemsBySection(sectionId);
      setItemsMap((prev) => ({ ...prev, [sectionId]: items }));
    } else {
      await load();
    }
  }, [load]);

  // ── SectionCard へ渡す安定コールバック（sectionsRef 経由で最新状態を参照） ──
  const handleOpenItemMgr = useCallback((section: DashboardSection) => {
    setItemMgrSection(section);
  }, []);

  const handleEditSection = useCallback((s: DashboardSection) => {
    setEditingSection(s);
  }, []);

  // ── ヘッダ追加ボタン表示設定（セクション単位で DB に保存） ──
  async function handleToggleShowAddBtn(section: DashboardSection, value: boolean) {
    await dashboardDB.patchSection(section.id!, { show_add_btn: value });
    setSections((prev) => prev.map((s) => s.id === section.id ? { ...s, show_add_btn: value } : s));
  }

  // ── エクスポート ──────────────────────────────────────
  async function handleExport() {
    const data = await dashboardDB.exportInstance(instanceId);
    const json = JSON.stringify({ type: 'dashboard_export', version: 2, instanceId, ...data }, null, 2);
    await FileSaver.save(json, `dashboard_${instanceId || 'default'}_${new Date().toISOString().slice(0, 10)}.json`);
  }

  // ── インポート ────────────────────────────────────────
  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await dashboardDB.importInstance(data, instanceId, true);
      await load();
      toast.success('インポートしました');
    } catch {
      toast.error('インポートに失敗しました');
    }
    e.target.value = '';
  }

  const importRef = useRef<HTMLInputElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  async function handleDeleteSection(id: number) {
    if (!(await confirmDialog({ message: 'このセクションを削除しますか？', danger: true }))) return;
    const target = sections.find((s) => s.id === id);
    ActivityLogger.log('dashboard', 'delete', 'section', id, `セクション「${target?.title || ''}」を削除`);
    await dashboardDB.deleteSection(id);
    await load();
  }

  async function handleAddSectionDirect(name: string, type: SectionType) {
    const count = await dashboardDB.countSections(instanceId);
    const newId = await dashboardDB.addSection({
      instance_id: instanceId,
      title: name,
      icon: '📋',
      type,
      width: 'auto',
      position: count,
      new_row: false,
      memo_content: '',
      body: '',
      url: '',
      iframe_height: 400,
      countdown_mode: 'calendar',
      cmd_buttons: [],
      command_template: '',
      action_mode: 'copy',
      columns: [],
      page_size: 0,
      show_filter: true,
      history_limit: 10,
      table_bind_vars: [], table_presets: [],
      list_bind_vars: [],  list_presets: [],
      grid_bind_vars: [],  grid_presets: [],
    }, instanceId);
    ActivityLogger.log('dashboard', 'create', 'section', newId, `セクション「${name}」を追加`);
    await load();
  }

  async function handleToggleNewRow(section: DashboardSection, value: boolean) {
    await dashboardDB.updateSection({ ...section, new_row: value });
    setSections((prev) => prev.map((s) => s.id === section.id ? { ...s, new_row: value } : s));
  }

  async function handleToggleShowFilter(section: DashboardSection, value: boolean) {
    await dashboardDB.patchSection(section.id!, { show_filter: value });
    setSections((prev) => prev.map((s) => s.id === section.id ? { ...s, show_filter: value } : s));
  }

  async function handleUpdateWidth(section: DashboardSection, width: SectionWidth) {
    await dashboardDB.updateSection({ ...section, width });
    setSections((prev) => prev.map((s) => s.id === section.id ? { ...s, width } : s));
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[var(--c-bg)]">
      {/* セクショングリッド（ドット背景） */}
      <div
        className="flex-1 overflow-y-auto pb-20"
        style={{
          backgroundColor: 'var(--c-bg)',
          backgroundImage: 'radial-gradient(circle, var(--c-border) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      >
        {/* バインド変数バー（プリセット存在時のみ） */}
        <BindVarBar
          presets={presets}
          activePresetId={activePresetId}
          uiType={bindConfig.uiType || 'segment'}
          barLabel={bindConfig.barLabel}
          onActiveChange={changeActivePreset}
        />

        {sections.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[var(--c-fg-3)]">
            <p className="text-sm">セクションがありません</p>
          </div>
        ) : (
          <div className="grid gap-5 p-8 pt-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(max(190px, calc(100% / 6 - 20px)), 1fr))' }}>
            {sections.map((section) => (
              <SectionCard
                key={section.id}
                section={section}
                items={itemsMap[section.id!] || []}
                presets={presets}
                activePresetId={activePresetId}
                globalVarNames={bindConfig.varNames}
                onItemsChange={() => reloadItems(section.id)}
                onOpenItemMgr={handleOpenItemMgr}
              />
            ))}
          </div>
        )}
      </div>

      {/* セクションジャンプナビ */}
      <SectionJumpNav sections={sections} />

      {/* 右下ギアボタン */}
      <button
        onClick={() => setSettingsOpen(true)}
        className="fixed bottom-6 right-5 z-[100] w-11 h-11 rounded-full bg-[var(--c-bg)] border-[1.5px] border-[var(--c-border)] shadow-[0_4px_16px_rgba(0,0,0,.1)] flex items-center justify-center text-[var(--c-fg-3)] hover:bg-[var(--c-accent)] hover:text-white hover:border-[var(--c-accent)] hover:shadow-[0_4px_20px_rgba(99,102,241,.35)] transition-all"
        aria-label="ダッシュボード設定"
      >
        <Settings2Icon size={18} />
      </button>

      {/* 設定パネル（モーダル） */}
      <DashboardSettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        isOverlaid={editingSection !== undefined || !!itemMgrSection}
        sections={sections}
        onDragEnd={handleDragEnd}
        onAddSectionDirect={handleAddSectionDirect}
        onEditSection={handleEditSection}
        onDeleteSection={handleDeleteSection}
        onToggleNewRow={handleToggleNewRow}
        onToggleShowFilter={handleToggleShowFilter}
        onUpdateWidth={handleUpdateWidth}
        onOpenItemMgr={handleOpenItemMgr}
        instanceId={instanceId}
        presets={presets}
        activePresetId={activePresetId}
        bindConfig={bindConfig}
        onPresetsChanged={load}
        onActiveChange={changeActivePreset}
        onExport={handleExport}
        onImportClick={() => importRef.current?.click()}
        onToggleShowAddBtn={handleToggleShowAddBtn}
      />
      <input ref={importRef} type="file" accept=".json" onChange={handleImport} className="hidden" />

      {/* セクション編集/追加モーダル */}
      {editingSection !== undefined && (
        <SectionEditModal
          section={editingSection}
          instanceId={instanceId}
          items={editingSection?.id ? (itemsMap[editingSection.id] || []) : []}
          onClose={() => setEditingSection(undefined)}
          onSaved={load}
          onDeleted={(id) => setSections((prev) => prev.filter((s) => s.id !== id))}
          isOverlaid={!!itemMgrSection}
        />
      )}

      {/* アイテム管理モーダル */}
      {itemMgrSection && (
        <ItemManagerModal
          section={itemMgrSection}
          items={itemsMap[itemMgrSection.id!] || []}
          onClose={() => setItemMgrSection(null)}
          onChanged={() => reloadItems(itemMgrSection.id!)}
        />
      )}

      <ShortcutHelp categories={DASHBOARD_SHORTCUTS} />
    </div>
  );
}

