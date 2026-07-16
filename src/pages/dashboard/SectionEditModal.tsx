// ==================================================
// dashboard/SectionEditModal — セクション追加/編集モーダル（DashboardPage から分割）
// ==================================================
import { useState, useEffect } from 'react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  
  GripVerticalIcon, Trash2Icon,
  XIcon,
  
  ChevronRightIcon,
  
} from 'lucide-react';
import {
  dashboardDB,
  type DashboardSection, type DashboardItem,
  type SectionType, type SectionWidth, type SectionPreset,
} from '../../db/dashboard_db';
import { Select } from '../../components/Select';
import { ActivityLogger } from '../../core/activity_logger';
import { confirmDialog } from '../../components/ConfirmDialog';
import { TYPE_SELECT_OPTIONS, WIDTH_SELECT_OPTIONS, COL_TYPE_OPTIONS, CHECKLIST_RESET_OPTIONS, type BindUiType } from './shared';
import { BindVarModal } from './settings';

// SectionVarEditor は BindVarModal に統合済みのため削除

type TableColumn = { id: string; label: string; type: 'text' | 'copy' | 'link' };

function SortableColumnRow({ col, i, columns, setColumns }: {
  col: TableColumn; i: number; columns: TableColumn[]; setColumns: (cols: TableColumn[]) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: col.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, gridTemplateColumns: '1.5rem 1fr auto auto' }}
      className="grid items-center gap-2 px-3 py-1.5 border-b border-[var(--c-border)] last:border-b-0"
    >
      <button type="button" className="flex items-center justify-center cursor-grab text-[var(--c-fg-3)]" {...attributes} {...listeners}>
        <GripVerticalIcon size={12} />
      </button>
      <input value={col.label} onChange={(e) => { const next = [...columns]; next[i] = { ...col, label: e.target.value }; setColumns(next); }}
        className="w-full px-2 py-1 rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] text-sm focus:outline-none focus:border-[var(--c-accent)]" />
      <div className="w-28 shrink-0">
        <Select options={COL_TYPE_OPTIONS} value={col.type}
          onChange={(v) => { const next = [...columns]; next[i] = { ...col, type: v as 'text' | 'copy' | 'link' }; setColumns(next); }} />
      </div>
      <button type="button" onClick={() => setColumns(columns.filter((_, j) => j !== i))}
        className="p-1 rounded text-[var(--c-fg-3)] hover:text-red-500 transition-colors">
        <Trash2Icon size={12} />
      </button>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// セクション編集モーダル
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface SectionEditModalProps {
  section: DashboardSection | null;  // null = 新規追加
  instanceId: string;
  items: DashboardItem[];
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: (id: number) => void;
  initialType?: SectionType;
  isOverlaid?: boolean;
}

export function SectionEditModal({ section, instanceId, items, onClose, onSaved, onDeleted, initialType, isOverlaid = false }: SectionEditModalProps) {
  const [title, setTitle] = useState(section?.title || '新しいセクション');
  const [icon,  setIcon]  = useState(section?.icon  || '📋');
  const [type,  setType]  = useState<SectionType>(section?.type || initialType || 'list');
  const [width, setWidth] = useState<SectionWidth>(section?.width || 'auto');
  const [newRow, setNewRow] = useState<boolean>(section?.new_row ?? (section as any)?.newRow ?? false);
  // memo/markdown はセクション内インライン編集のため、ここでは初期値を保持するのみ
  const memoContent = section?.memo_content || '';
  const body = section?.body || '';
  // iframe
  const [url, setUrl]                   = useState(section?.url || '');
  const [iframeHeight, setIframeHeight] = useState(String(section?.iframe_height || 400));
  // countdown
  const [countdownMode, setCountdownMode] = useState<'calendar' | 'business'>(section?.countdown_mode || 'calendar');
  // table columns
  const [columns, setColumns] = useState<Array<{ id: string; label: string; type: 'text' | 'copy' | 'link' }>>(section?.columns || []);
  const [pageSize, setPageSize] = useState(String(section?.page_size || 0));
  // list 専用
  const hasItems = items.length > 0;
  const [showFilterBar, setShowFilterBar] = useState(section?.show_filter ?? false);
  const [showAddBtn, setShowAddBtn] = useState(section?.show_add_btn ?? false);
  // 列 DnD
  const columnSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  // command_builder 専用
  const [historyLimit, setHistoryLimit] = useState(String(section?.history_limit ?? 10));
  const [cmdPlaceholder, setCmdPlaceholder] = useState(section?.cmd_placeholder || '');
  // checklist 専用
  const [checklistReset, setChecklistReset] = useState<NonNullable<DashboardSection['checklist_reset']>>(section?.checklist_reset || 'never');
  // セクション固有バインド変数（table / list / grid）
  const [tableBindVars, setTableBindVars]       = useState<string[]>(section?.table_bind_vars || []);
  const [tablePresets, setTablePresets]         = useState<SectionPreset[]>(section?.table_presets || []);
  const [tableVarsUiType, setTableVarsUiType]   = useState<BindUiType>(section?.table_vars_ui_type || 'segment');
  const [tableVarsBarLabel, setTableVarsBarLabel] = useState(section?.table_vars_bar_label || '');
  const [listBindVars, setListBindVars]         = useState<string[]>(section?.list_bind_vars || []);
  const [listPresets, setListPresets]           = useState<SectionPreset[]>(section?.list_presets || []);
  const [listVarsUiType, setListVarsUiType]     = useState<BindUiType>(section?.list_vars_ui_type || 'segment');
  const [listVarsBarLabel, setListVarsBarLabel] = useState(section?.list_vars_bar_label || '');
  const [gridBindVars, setGridBindVars]         = useState<string[]>(section?.grid_bind_vars || []);
  const [gridPresets, setGridPresets]           = useState<SectionPreset[]>(section?.grid_presets || []);
  const [gridVarsUiType, setGridVarsUiType]     = useState<BindUiType>(section?.grid_vars_ui_type || 'segment');
  const [gridVarsBarLabel, setGridVarsBarLabel] = useState(section?.grid_vars_bar_label || '');
  // セクション固有バインド変数モーダル
  const [sectionBindTarget, setSectionBindTarget] = useState<'table' | 'list' | 'grid' | null>(null);
  const [sectionBindActiveId, setSectionBindActiveId] = useState<string | number | null>(null);

  // ESC で閉じる（上位モーダルや BindVarModal が開いていればスキップ）
  useEffect(() => {
    if (isOverlaid || sectionBindTarget !== null) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOverlaid, sectionBindTarget, onClose]);

  // セクション固有バインド変数モーダル用ヘルパー
  const sectionBindVarNames  = sectionBindTarget === 'table' ? tableBindVars  : sectionBindTarget === 'list' ? listBindVars  : gridBindVars;
  const sectionBindUiType    = sectionBindTarget === 'table' ? tableVarsUiType : sectionBindTarget === 'list' ? listVarsUiType : gridVarsUiType;
  const sectionBindBarLabel  = sectionBindTarget === 'table' ? tableVarsBarLabel : sectionBindTarget === 'list' ? listVarsBarLabel : gridVarsBarLabel;
  const sectionBindPresets   = sectionBindTarget === 'table' ? tablePresets   : sectionBindTarget === 'list' ? listPresets   : gridPresets;

  function setSectionBindConfig(varNames: string[], uiType: BindUiType, barLabel: string) {
    if (sectionBindTarget === 'table') { setTableBindVars(varNames); setTableVarsUiType(uiType); setTableVarsBarLabel(barLabel); }
    else if (sectionBindTarget === 'list')  { setListBindVars(varNames); setListVarsUiType(uiType); setListVarsBarLabel(barLabel); }
    else if (sectionBindTarget === 'grid')  { setGridBindVars(varNames); setGridVarsUiType(uiType); setGridVarsBarLabel(barLabel); }
  }
  function setSectionBindPresetsForTarget(p: SectionPreset[]) {
    if (sectionBindTarget === 'table') setTablePresets(p);
    else if (sectionBindTarget === 'list')  setListPresets(p);
    else if (sectionBindTarget === 'grid')  setGridPresets(p);
  }
  function sectionBindPatch(target: 'table' | 'list' | 'grid', varNames: string[], uiType: BindUiType, barLabel: string): Partial<DashboardSection> {
    if (target === 'table') return { table_bind_vars: varNames, table_vars_ui_type: uiType, table_vars_bar_label: barLabel };
    if (target === 'list')  return { list_bind_vars: varNames,  list_vars_ui_type: uiType,  list_vars_bar_label: barLabel };
    return                         { grid_bind_vars: varNames,  grid_vars_ui_type: uiType,  grid_vars_bar_label: barLabel };
  }
  const handleSectionBindSaveConfig = async (varNames: string[], uiType: BindUiType, barLabel: string) => {
    setSectionBindConfig(varNames, uiType, barLabel);
    if (section?.id && sectionBindTarget) {
      await dashboardDB.patchSection(section.id, sectionBindPatch(sectionBindTarget, varNames, uiType, barLabel));
      onSaved();
    }
  };
  const handleSectionBindPresetAdd = async (data: { name: string; values: Record<string, string> }): Promise<SectionPreset | null> => {
    const p: SectionPreset = { id: crypto.randomUUID(), name: data.name, values: data.values };
    const next = [...sectionBindPresets, p];
    setSectionBindPresetsForTarget(next);
    if (section?.id && sectionBindTarget) {
      const key = `${sectionBindTarget}_presets` as 'table_presets' | 'list_presets' | 'grid_presets';
      await dashboardDB.patchSection(section.id, { [key]: next });
      onSaved();
    }
    return p;
  };
  const handleSectionBindPresetSave = async (p: SectionPreset) => {
    const next = sectionBindPresets.map((x) => String(x.id) === String(p.id) ? p : x);
    setSectionBindPresetsForTarget(next);
    if (section?.id && sectionBindTarget) {
      const key = `${sectionBindTarget}_presets` as 'table_presets' | 'list_presets' | 'grid_presets';
      await dashboardDB.patchSection(section.id, { [key]: next });
      onSaved();
    }
  };
  const handleSectionBindPresetDelete = async (id: string | number) => {
    if (!(await confirmDialog({ message: 'このプリセットを削除しますか？', danger: true }))) return;
    const next = sectionBindPresets.filter((p) => String(p.id) !== String(id));
    setSectionBindPresetsForTarget(next);
    if (String(sectionBindActiveId) === String(id)) setSectionBindActiveId(null);
    if (section?.id && sectionBindTarget) {
      const key = `${sectionBindTarget}_presets` as 'table_presets' | 'list_presets' | 'grid_presets';
      await dashboardDB.patchSection(section.id, { [key]: next });
      onSaved();
    }
  };
  const handleSectionBindPresetReorder = async (reordered: SectionPreset[]) => {
    setSectionBindPresetsForTarget(reordered);
    if (section?.id && sectionBindTarget) {
      const key = `${sectionBindTarget}_presets` as 'table_presets' | 'list_presets' | 'grid_presets';
      await dashboardDB.patchSection(section.id, { [key]: reordered });
      onSaved();
    }
  };

  const SECTION_BIND_TITLE: Record<string, string> = {
    table: 'テーブル バインド変数',
    list: 'リスト バインド変数',
    grid: 'グリッド バインド変数',
  };

  async function handleSave() {
    const base: Omit<DashboardSection, 'id'> = {
      instance_id: instanceId,
      title, icon, type, width, new_row: newRow,
      position: section?.position ?? 9999,
      memo_content: memoContent,
      body,
      url,
      iframe_height: parseInt(iframeHeight) || 400,
      countdown_mode: countdownMode,
      cmd_buttons: [],
      command_template: section?.command_template ?? '',
      action_mode: section?.action_mode ?? 'copy',
      columns,
      page_size: parseInt(pageSize) || 0,
      show_filter: showFilterBar,
      show_add_btn: showAddBtn,
      history_limit: parseInt(historyLimit) || 10,
      cmd_placeholder: cmdPlaceholder || undefined,
      checklist_reset: checklistReset as DashboardSection['checklist_reset'],
      // セクション固有バインド変数（保存時に全タイプ分を維持する）
      table_bind_vars: tableBindVars,
      table_presets: tablePresets,
      table_vars_ui_type: tableVarsUiType,
      table_vars_bar_label: tableVarsBarLabel,
      list_bind_vars: listBindVars,
      list_presets: listPresets,
      list_vars_ui_type: listVarsUiType,
      list_vars_bar_label: listVarsBarLabel,
      grid_bind_vars: gridBindVars,
      grid_presets: gridPresets,
      grid_vars_ui_type: gridVarsUiType,
      grid_vars_bar_label: gridVarsBarLabel,
    };
    if (section?.id) {
      await dashboardDB.updateSection({ ...section, ...base });
      ActivityLogger.log('dashboard', 'update', 'section', section.id, `セクション「${title}」を更新`);
    } else {
      const count = await dashboardDB.countSections(instanceId);
      const newId = await dashboardDB.addSection({ ...base, position: count }, instanceId);
      ActivityLogger.log('dashboard', 'create', 'section', newId, `セクション「${title}」を追加`);
    }
    onSaved();
    onClose();
  }

  async function handleDelete() {
    if (!section?.id) return;
    if (!(await confirmDialog({ message: `「${section.title}」を削除しますか？`, danger: true }))) return;
    ActivityLogger.log('dashboard', 'delete', 'section', section.id, `セクション「${section.title}」を削除`);
    await dashboardDB.deleteSection(section.id);
    onDeleted?.(section.id);
    onSaved();
    onClose();
  }

  function addColumn() {
    setColumns([...columns, { id: crypto.randomUUID(), label: '列' + (columns.length + 1), type: 'text' }]);
  }

  function handleColumnDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = columns.findIndex((c) => c.id === active.id);
    const newIdx = columns.findIndex((c) => c.id === over.id);
    setColumns(arrayMove(columns, oldIdx, newIdx));
  }

  return (
    <>
    <div className="fixed inset-0 bg-black/50 z-[400] flex items-center justify-center p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={section ? 'セクションを編集' : 'セクションを追加'}
        className="bg-[var(--c-bg)] rounded-xl border border-[var(--c-border)] w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--c-border)]">
          <h3 className="font-semibold text-[var(--c-fg)]">{section ? 'セクションを編集' : 'セクションを追加'}</h3>
          <button onClick={onClose} aria-label="閉じる" className="p-1 rounded hover:bg-[var(--c-bg-2)] text-[var(--c-fg-3)]"><XIcon size={16} aria-hidden="true" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex gap-2">
            <div className="w-16">
              <label className="text-xs text-[var(--c-fg-3)]">アイコン</label>
              <input value={icon} onChange={(e) => setIcon(e.target.value)}
                className="w-full px-2 py-1.5 rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-center text-lg focus:outline-none" />
            </div>
            <div className="flex-1">
              <label className="text-xs text-[var(--c-fg-3)]">タイトル</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-1.5 rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] focus:outline-none focus:border-[var(--c-accent)]" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-[var(--c-fg-3)]">タイプ</label>
              <div className={hasItems ? 'pointer-events-none opacity-50' : ''}>
                <Select options={TYPE_SELECT_OPTIONS} value={type} onChange={(v) => setType(v as SectionType)} />
              </div>
              {hasItems && <p className="text-[10px] text-[var(--c-fg-3)] mt-0.5">アイテムを削除すると変更できます</p>}
            </div>
            <div>
              <label className="text-xs text-[var(--c-fg-3)]">幅</label>
              <Select options={WIDTH_SELECT_OPTIONS} value={width} onChange={(v) => setWidth(v as SectionWidth)} />
            </div>
          </div>

          <label className="toggle-wrap">
            <input type="checkbox" className="toggle-input" checked={newRow} onChange={(e) => setNewRow(e.target.checked)} />
            <span className="toggle-track"><span className="toggle-thumb" /></span>
            <span className="toggle-label">行頭から開始する</span>
          </label>

          {type === 'iframe' && (
            <>
              <div>
                <label className="text-xs text-[var(--c-fg-3)]">URL</label>
                <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..."
                  className="w-full px-3 py-1.5 rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] focus:outline-none focus:border-[var(--c-accent)]" />
              </div>
              <div>
                <label className="text-xs text-[var(--c-fg-3)]">高さ(px)</label>
                <input value={iframeHeight} onChange={(e) => setIframeHeight(e.target.value)} type="number"
                  className="w-full px-3 py-1.5 rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] focus:outline-none focus:border-[var(--c-accent)]" />
              </div>
            </>
          )}

          {type === 'countdown' && (
            <div>
              <label className="text-xs text-[var(--c-fg-3)] block">カウント方法</label>
              <div className="seg-ctrl">
                {(['calendar', 'business'] as const).map((m) => (
                  <button key={m} type="button"
                    className={`seg-btn${countdownMode === m ? ' seg-btn--active' : ''}`}
                    onClick={() => setCountdownMode(m)}>
                    {m === 'calendar' ? 'カレンダー日数' : '営業日'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {type === 'table' && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-[var(--c-fg-3)]">ページサイズ（0=無制限）</label>
                <input value={pageSize} onChange={(e) => setPageSize(e.target.value)} type="number" min="0"
                  className="w-full px-3 py-1.5 rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] focus:outline-none focus:border-[var(--c-accent)]" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-[var(--c-fg-3)]">列定義</label>
                  <button type="button" onClick={addColumn} className="text-xs px-2 py-1 rounded-md bg-[var(--c-accent)] text-white">追加</button>
                </div>
                <DndContext sensors={columnSensors} collisionDetection={closestCenter} onDragEnd={handleColumnDragEnd}>
                  <div className="border border-[var(--c-border)] rounded-lg overflow-hidden">
                    <div className="grid items-center gap-2 px-3 py-1.5 bg-[var(--c-bg-2)] border-b border-[var(--c-border)]" style={{ gridTemplateColumns: '1.5rem 1fr auto auto' }}>
                      <span />
                      <span className="text-[10px] font-semibold text-[var(--c-fg-3)] uppercase tracking-wide">列名</span>
                      <span className="text-[10px] font-semibold text-[var(--c-fg-3)] uppercase tracking-wide">タイプ</span>
                      <span />
                    </div>
                    <SortableContext items={columns.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                      {columns.map((col, i) => (
                        <SortableColumnRow key={col.id} col={col} i={i} columns={columns} setColumns={setColumns} />
                      ))}
                    </SortableContext>
                    {columns.length === 0 && <p className="text-xs text-[var(--c-fg-3)] text-center py-3">列がありません</p>}
                  </div>
                </DndContext>
                <p className="mt-1.5 text-[11px] text-[var(--c-fg-3)] leading-relaxed">
                  セルの値に <span className="font-mono text-[var(--c-accent)]">{'{@列名}'}</span> と書くと、同じ行の他列の値を埋め込めます（例: link 列に <span className="font-mono text-[var(--c-accent)]">https://example.com/u/{'{@id}'}</span>）。スペース入りの列名は <span className="font-mono text-[var(--c-accent)]">{'{@"列 名"}'}</span>。
                </p>
              </div>
              <label className="toggle-wrap">
                <input type="checkbox" className="toggle-input" checked={showAddBtn} onChange={(e) => setShowAddBtn(e.target.checked)} />
                <span className="toggle-track"><span className="toggle-thumb" /></span>
                <span className="toggle-label">ヘッダに追加ボタンを表示する</span>
              </label>
              <button type="button" onClick={() => setSectionBindTarget('table')}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-[7px] border border-[var(--c-border)] bg-[var(--c-bg)] text-sm text-[var(--c-fg)] hover:border-[var(--c-accent)] hover:bg-[var(--c-accent-dim)] transition-colors">
                <span className="font-mono text-xs text-[var(--c-accent)] shrink-0">{'{x}'}</span>
                <span className="flex-1 text-left">バインド変数を設定</span>
                {(tableBindVars.length > 0 || tablePresets.length > 0) && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--c-accent-dim)] text-[var(--c-accent)] shrink-0">{tableBindVars.length}変数 / {tablePresets.length}プリセット</span>}
                <ChevronRightIcon size={13} className="text-[var(--c-fg-3)] shrink-0" />
              </button>
            </div>
          )}

          {type === 'list' && (
            <div className="space-y-2">
              <label className="toggle-wrap">
                <input type="checkbox" className="toggle-input" checked={showFilterBar} onChange={(e) => setShowFilterBar(e.target.checked)} />
                <span className="toggle-track"><span className="toggle-thumb" /></span>
                <span className="toggle-label">フィルターバーを表示する</span>
              </label>
              <label className="toggle-wrap">
                <input type="checkbox" className="toggle-input" checked={showAddBtn} onChange={(e) => setShowAddBtn(e.target.checked)} />
                <span className="toggle-track"><span className="toggle-thumb" /></span>
                <span className="toggle-label">ヘッダに追加ボタンを表示する</span>
              </label>
              <button type="button" onClick={() => setSectionBindTarget('list')}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-[7px] border border-[var(--c-border)] bg-[var(--c-bg)] text-sm text-[var(--c-fg)] hover:border-[var(--c-accent)] hover:bg-[var(--c-accent-dim)] transition-colors">
                <span className="font-mono text-xs text-[var(--c-accent)] shrink-0">{'{x}'}</span>
                <span className="flex-1 text-left">バインド変数を設定</span>
                {(listBindVars.length > 0 || listPresets.length > 0) && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--c-accent-dim)] text-[var(--c-accent)] shrink-0">{listBindVars.length}変数 / {listPresets.length}プリセット</span>}
                <ChevronRightIcon size={13} className="text-[var(--c-fg-3)] shrink-0" />
              </button>
            </div>
          )}

          {type === 'checklist' && (
            <div>
              <label className="text-xs text-[var(--c-fg-3)]">自動リセット</label>
              <Select options={CHECKLIST_RESET_OPTIONS} value={checklistReset}
                onChange={(v) => setChecklistReset(v as NonNullable<DashboardSection['checklist_reset']>)} />
            </div>
          )}

          {type === 'command_builder' && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-[var(--c-fg-3)]">入力欄のプレースホルダー</label>
                <input value={cmdPlaceholder} onChange={(e) => setCmdPlaceholder(e.target.value)}
                  placeholder="入力値 {INPUT}"
                  className="w-full px-3 py-1.5 rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] focus:outline-none focus:border-[var(--c-accent)]" />
              </div>
              <div>
                <label className="text-xs text-[var(--c-fg-3)]">履歴の上限件数（0=無効）</label>
                <input value={historyLimit} onChange={(e) => setHistoryLimit(e.target.value)} type="number" min="0"
                  className="w-full px-3 py-1.5 rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] focus:outline-none focus:border-[var(--c-accent)]" />
              </div>
            </div>
          )}

          {type === 'grid' && (
            <div className="space-y-2">
              <label className="toggle-wrap">
                <input type="checkbox" className="toggle-input" checked={showAddBtn} onChange={(e) => setShowAddBtn(e.target.checked)} />
                <span className="toggle-track"><span className="toggle-thumb" /></span>
                <span className="toggle-label">ヘッダに追加ボタンを表示する</span>
              </label>
              <button type="button" onClick={() => setSectionBindTarget('grid')}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-[7px] border border-[var(--c-border)] bg-[var(--c-bg)] text-sm text-[var(--c-fg)] hover:border-[var(--c-accent)] hover:bg-[var(--c-accent-dim)] transition-colors">
                <span className="font-mono text-xs text-[var(--c-accent)] shrink-0">{'{x}'}</span>
                <span className="flex-1 text-left">バインド変数を設定</span>
                {(gridBindVars.length > 0 || gridPresets.length > 0) && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--c-accent-dim)] text-[var(--c-accent)] shrink-0">{gridBindVars.length}変数 / {gridPresets.length}プリセット</span>}
                <ChevronRightIcon size={13} className="text-[var(--c-fg-3)] shrink-0" />
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--c-border)]">
          {section?.id ? (
            <button onClick={handleDelete} className="px-3 py-1.5 rounded border border-red-300 text-red-500 text-sm hover:bg-red-50 dark:hover:bg-red-950">削除</button>
          ) : <span />}
          <button onClick={handleSave} className="px-3 py-1.5 rounded bg-[var(--c-accent)] text-white text-sm">保存</button>
        </div>
      </div>
    </div>
    {sectionBindTarget && (
      <BindVarModal
        open={true}
        onClose={() => setSectionBindTarget(null)}
        title={SECTION_BIND_TITLE[sectionBindTarget]}
        zIndex={500}
        varNames={sectionBindVarNames}
        uiType={sectionBindUiType}
        barLabel={sectionBindBarLabel}
        presets={sectionBindPresets}
        activePresetId={sectionBindActiveId}
        onActiveChange={setSectionBindActiveId}
        onSaveConfig={handleSectionBindSaveConfig}
        onPresetAdd={handleSectionBindPresetAdd}
        onPresetSave={handleSectionBindPresetSave}
        onPresetDelete={handleSectionBindPresetDelete}
        onPresetReorder={handleSectionBindPresetReorder}
      />
    )}
    </>
  );
}

