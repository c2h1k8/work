// ==================================================
// dashboard/settings — 設定パネル・バインド変数UI（DashboardPage から分割）
// ==================================================
import React, { useState, useEffect, useRef } from 'react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  PlusIcon, Settings2Icon,
  GripVerticalIcon, Trash2Icon, CopyIcon,
  DownloadIcon, UploadIcon, XIcon, PencilIcon,
  
  ChevronRightIcon, ListIcon, SearchIcon,
  
} from 'lucide-react';
import {
  dashboardDB,
  type DashboardSection, type DashboardPreset,
  type SectionType, type SectionWidth, type SectionPreset,
} from '../../db/dashboard_db';
import { Select } from '../../components/Select';
import { confirmDialog } from '../../components/ConfirmDialog';
import { TYPE_LABELS, TYPE_BADGE, WIDTH_SELECT_OPTIONS, TYPE_SELECT_OPTIONS, type BindUiType, type BindConfig } from './shared';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// プリセット設定パネル
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function SortablePresetRow({ preset, isActive, onActiveChange, onEdit, onDelete, isDragDisabled = false }: {
  preset: SectionPreset;
  isActive: boolean;
  onActiveChange: (id: string | number | null) => void;
  onEdit: (p: SectionPreset) => void;
  onDelete: (id: string | number) => void;
  isDragDisabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: preset.id });
  return (
    <div ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className={`flex items-center gap-2 px-3 py-2.5 rounded-[8px] border transition-all cursor-pointer ${isActive ? 'border-[var(--c-accent)] bg-[var(--c-bg-2)]' : 'border-[var(--c-border)] hover:border-[var(--c-accent)] hover:bg-[var(--c-bg-2)]'}`}
      onClick={() => onActiveChange(isActive ? null : preset.id)}
    >
      {!isDragDisabled && (
        <button {...attributes} {...listeners}
          className="text-[var(--c-fg-3)] hover:text-[var(--c-fg)] cursor-grab active:cursor-grabbing shrink-0 p-0.5"
          onClick={(e) => e.stopPropagation()} tabIndex={-1}>
          <GripVerticalIcon size={12} />
        </button>
      )}
      <span className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 transition-colors ${isActive ? 'border-[var(--c-accent)] bg-[var(--c-accent)]' : 'border-[var(--c-border)] bg-transparent'}`} />
      <span className={`flex-1 text-sm font-medium truncate ${isActive ? 'text-[var(--c-accent)]' : 'text-[var(--c-fg)]'}`}>{preset.name}</span>
      <button onClick={(e) => { e.stopPropagation(); onEdit(preset); }}
        className="p-1.5 rounded text-[var(--c-fg-3)] hover:text-[var(--c-accent)] hover:bg-[var(--c-bg)] transition-colors" title="編集">
        <PencilIcon size={12} />
      </button>
      <button onClick={(e) => { e.stopPropagation(); onDelete(preset.id); }}
        className="p-1.5 rounded text-[var(--c-fg-3)] hover:text-red-500 hover:bg-red-50 transition-colors" title="削除">
        <Trash2Icon size={12} />
      </button>
    </div>
  );
}

interface BindVarPanelProps {
  varNames: string[];
  uiType: BindUiType;
  barLabel: string;
  presets: SectionPreset[];
  activePresetId: string | number | null;
  formState: { id: string | number | null; name: string; values: Record<string, string> } | null;
  onFormStateChange: (s: { id: string | number | null; name: string; values: Record<string, string> } | null) => void;
  onActiveChange: (id: string | number | null) => void;
  onSaveConfig: (varNames: string[], uiType: BindUiType, barLabel: string) => Promise<void>;
  onPresetAdd: (data: { name: string; values: Record<string, string> }) => Promise<SectionPreset | null>;
  onPresetSave: (preset: SectionPreset) => Promise<void>;
  onPresetDelete: (id: string | number) => Promise<void>;
  onPresetReorder: (reordered: SectionPreset[]) => Promise<void>;
}

function BindVarPanel({
  varNames: initVarNames, uiType: initUiType, barLabel: initBarLabel,
  presets, activePresetId, formState, onFormStateChange, onActiveChange,
  onSaveConfig, onPresetAdd, onPresetSave, onPresetDelete, onPresetReorder,
}: BindVarPanelProps) {
  const presetSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const [varNames, setVarNames] = useState<string[]>(initVarNames);
  const [uiType, setUiType] = useState<BindUiType>(initUiType || 'segment');
  const [barLabel, setBarLabel] = useState<string>(initBarLabel || '');
  const [newVarName, setNewVarName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingVarIdx, setEditingVarIdx] = useState<number | null>(null);

  async function addVarName() {
    const trimmed = newVarName.trim();
    if (!trimmed || varNames.includes(trimmed)) return;
    const next = [...varNames, trimmed];
    setVarNames(next);
    setNewVarName('');
    await onSaveConfig(next, uiType, barLabel);
  }

  async function removeVarName(i: number) {
    const next = varNames.filter((_, j) => j !== i);
    setVarNames(next);
    await onSaveConfig(next, uiType, barLabel);
  }

  async function renameVarName(i: number, newName: string) {
    const trimmed = newName.trim();
    setEditingVarIdx(null);
    setNewVarName('');
    if (!trimmed || (trimmed !== varNames[i] && varNames.includes(trimmed))) return;
    const next = varNames.map((vn, j) => (j === i ? trimmed : vn));
    setVarNames(next);
    await onSaveConfig(next, uiType, barLabel);
  }

  async function changeUiType(ut: BindUiType) {
    setUiType(ut);
    await onSaveConfig(varNames, ut, barLabel);
  }

  async function handlePresetDragEnd(event: DragEndEvent) {
    if (searchQuery) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = presets.findIndex((p) => String(p.id) === String(active.id));
    const newIdx = presets.findIndex((p) => String(p.id) === String(over.id));
    const reordered = arrayMove(presets, oldIdx, newIdx).map((p, i) => ({ ...p, position: i }));
    await onPresetReorder(reordered);
  }

  async function handleFormSave() {
    if (!formState) return;
    if (formState.id === null) {
      const newPreset = await onPresetAdd({ name: formState.name, values: formState.values });
      onFormStateChange(null);
      if (newPreset) onActiveChange(newPreset.id);
    } else {
      await onPresetSave({ id: formState.id, name: formState.name, values: formState.values });
      onFormStateChange(null);
    }
  }

  const filteredPresets = searchQuery
    ? presets.filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : presets;

  return (
    <div className="flex h-full">

      {/* ── 左カラム: 変数設定 ── */}
      <div className="w-96 shrink-0 flex flex-col gap-5 border-r border-[var(--c-border)] p-5 overflow-y-auto">

        {/* 変数名 */}
        <section>
          <span className="text-xs font-semibold text-[var(--c-fg-2)] uppercase tracking-wide block mb-2">バインド変数</span>
          <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
            {varNames.map((vn, i) => (
              <span key={i}
                onClick={() => {
                  if (editingVarIdx === i) { setEditingVarIdx(null); setNewVarName(''); }
                  else { setEditingVarIdx(i); setNewVarName(vn); }
                }}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-mono cursor-pointer transition-colors ${
                  editingVarIdx === i
                    ? 'bg-[var(--c-accent-dim)] border-[var(--c-accent)] text-[var(--c-accent)]'
                    : 'bg-[var(--c-bg-2)] border-[var(--c-border)] text-[var(--c-fg)] hover:border-[var(--c-accent)]'
                }`}>
                <span className="opacity-60">{'{'}</span>{vn}<span className="opacity-60">{'}'}</span>
                <button onClick={(e) => { e.stopPropagation(); removeVarName(i); }}
                  className="opacity-50 hover:opacity-100 hover:text-red-500 transition-all ml-0.5">
                  <XIcon size={10} />
                </button>
              </span>
            ))}
            {varNames.length === 0 && <span className="text-xs text-[var(--c-fg-3)]">変数なし</span>}
          </div>

          <div className="flex gap-1.5">
            <input value={newVarName} onChange={(e) => setNewVarName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { setEditingVarIdx(null); setNewVarName(''); }
                else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  editingVarIdx !== null ? renameVarName(editingVarIdx, newVarName) : addVarName();
                }
              }}
              placeholder={editingVarIdx !== null ? `"${varNames[editingVarIdx]}" を変更…` : '変数名…'}
              className={`flex-1 h-8 px-3 rounded-[7px] border bg-[var(--c-bg)] text-[var(--c-fg)] text-xs focus:outline-none ${editingVarIdx !== null ? 'border-[var(--c-accent)]' : 'border-[var(--c-border)] focus:border-[var(--c-accent)]'}`}
            />
            {editingVarIdx !== null ? (
              <button onClick={() => renameVarName(editingVarIdx, newVarName)}
                className="h-8 px-3 rounded-[7px] bg-[var(--c-accent)] text-white text-xs shrink-0">変更</button>
            ) : (
              <button onClick={addVarName}
                className="h-8 px-3 rounded-[7px] bg-[var(--c-accent)] text-white text-xs shrink-0">追加</button>
            )}
          </div>
        </section>

        {/* 表示形式（横並び） */}
        <section>
          <span className="text-xs font-semibold text-[var(--c-fg-2)] uppercase tracking-wide block mb-2">表示形式</span>
          <div className="flex border border-[var(--c-border)] rounded-[7px] overflow-hidden">
            {([
              ['pill',    'ピル'],
              ['segment', 'セグメント'],
              ['tabs',    'タブ'],
              ['select',  'ドロップダウン'],
            ] as [BindUiType, string][]).map(([val, label], i, arr) => (
              <button key={val} onClick={() => changeUiType(val)}
                className={`flex-1 py-1.5 text-xs font-medium transition-colors ${i < arr.length - 1 ? 'border-r border-[var(--c-border)]' : ''} ${uiType === val ? 'bg-[var(--c-accent)] text-white' : 'text-[var(--c-fg-2)] hover:bg-[var(--c-bg-2)]'}`}>
                {label}
              </button>
            ))}
          </div>
        </section>

        {/* バーラベル */}
        <section>
          <label className="text-xs font-semibold text-[var(--c-fg-2)] uppercase tracking-wide block mb-2">バーラベル</label>
          <input value={barLabel} onChange={(e) => setBarLabel(e.target.value)}
            onBlur={() => onSaveConfig(varNames, uiType, barLabel)}
            placeholder="例: 環境:"
            className="w-full h-8 px-3 rounded-[7px] border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] text-xs focus:outline-none focus:border-[var(--c-accent)]"
          />
        </section>
      </div>

      {/* ── 右カラム: プリセット ── */}
      <div className="flex-1 flex flex-col gap-3 min-w-0 overflow-y-auto p-5">

        {formState !== null ? (
          /* ── フォームビュー（追加 / 編集 共通）── */
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs font-medium text-[var(--c-fg-2)] block mb-1">プリセット名</label>
              <input value={formState.name}
                onChange={(e) => onFormStateChange({ ...formState, name: e.target.value })}
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                className="w-full px-3 py-2 rounded-[7px] border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] text-sm focus:outline-none focus:border-[var(--c-accent)]"
              />
            </div>
            {varNames.length > 0 ? (
              <div className="space-y-2">
                <label className="text-xs font-medium text-[var(--c-fg-2)] block">変数値</label>
                {varNames.map((vn) => (
                  <div key={vn}>
                    <label className="text-xs text-[var(--c-fg-3)] font-mono mb-0.5 block">{'{' + vn + '}'}</label>
                    <input
                      value={formState.values?.[vn] ?? ''}
                      onChange={(e) => onFormStateChange({ ...formState, values: { ...formState.values, [vn]: e.target.value } })}
                      className="w-full px-3 py-2 rounded-[7px] border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] text-sm focus:outline-none focus:border-[var(--c-accent)]"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[var(--c-fg-3)] bg-[var(--c-bg-2)] rounded-[7px] px-3 py-2">
                変数名を先に追加してください
              </p>
            )}
            <div className="flex gap-2 mt-1">
              <button onClick={() => onFormStateChange(null)}
                className="flex-1 py-2 rounded-[7px] border border-[var(--c-border)] text-sm text-[var(--c-fg-2)] hover:bg-[var(--c-bg-2)] transition-colors">キャンセル</button>
              <button onClick={handleFormSave}
                className="flex-1 py-2 rounded-[7px] bg-[var(--c-accent)] text-white text-sm font-medium">保存</button>
            </div>
          </div>
        ) : (
          /* ── リストビュー ── */
          <>
            {/* ヘッダー */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--c-fg-2)] uppercase tracking-wide">プリセット</span>
              <div className="flex items-center gap-1.5">
                {activePresetId != null && (
                  <button
                    onClick={() => {
                      const src = presets.find((p) => String(p.id) === String(activePresetId));
                      if (src) onFormStateChange({ id: null, name: src.name + ' のコピー', values: { ...src.values } });
                    }}
                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border border-[var(--c-border)] text-[var(--c-fg-2)] hover:border-[var(--c-accent)] hover:text-[var(--c-accent)] font-medium transition-colors"
                    title="選択中のプリセットをコピーして追加">
                    <CopyIcon size={10} />コピー追加
                  </button>
                )}
                <button
                  onClick={() => onFormStateChange({ id: null, name: '新しいプリセット', values: {} })}
                  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-[var(--c-accent)] text-white font-medium">
                  <PlusIcon size={10} />追加
                </button>
              </div>
            </div>

            {/* 検索フィールド */}
            <div className="relative">
              <SearchIcon size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--c-fg-3)] pointer-events-none" />
              <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="プリセットを検索…"
                className="w-full h-8 pl-7 pr-3 rounded-[7px] border border-[var(--c-border)] bg-[var(--c-bg-2)] text-[var(--c-fg)] text-xs focus:outline-none focus:border-[var(--c-accent)]"
              />
            </div>

            {/* プリセット一覧 */}
            <DndContext sensors={presetSensors} collisionDetection={closestCenter} onDragEnd={handlePresetDragEnd}>
              <SortableContext items={filteredPresets.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-1.5">
                  {filteredPresets.map((p) => (
                    <SortablePresetRow
                      key={String(p.id)}
                      preset={p}
                      isActive={String(activePresetId) === String(p.id)}
                      onActiveChange={onActiveChange}
                      onEdit={(preset) => onFormStateChange({ id: preset.id, name: preset.name, values: preset.values ?? {} })}
                      onDelete={onPresetDelete}
                      isDragDisabled={!!searchQuery}
                    />
                  ))}
                  {filteredPresets.length === 0 && (
                    <p className="text-xs text-[var(--c-fg-3)] text-center py-4 bg-[var(--c-bg-2)] rounded-[7px]">
                      {searchQuery ? '該当するプリセットがありません' : 'プリセットがありません'}
                    </p>
                  )}
                </div>
              </SortableContext>
            </DndContext>
          </>
        )}
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// セクションジャンプナビ（3件以上で表示）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function SectionJumpNav({ sections }: { sections: DashboardSection[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  if (sections.length < 3) return null;

  function scrollTo(sectionId: number) {
    document.getElementById(`section-${sectionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setOpen(false);
  }

  return (
    <div ref={ref} className="fixed top-[56px] right-5 z-[200]">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="w-[38px] h-[38px] rounded-[7px] bg-[var(--c-bg)] border-[1.5px] border-[var(--c-border)] shadow flex items-center justify-center text-[var(--c-fg-3)] hover:bg-[var(--c-accent)] hover:text-white hover:border-[var(--c-accent)] transition-all"
        title="セクションへジャンプ"
      >
        <ListIcon size={14} />
      </button>
      {open && (
        <div className="absolute top-[calc(100%+6px)] right-0 min-w-[200px] max-w-[280px] max-h-[70vh] overflow-y-auto bg-[var(--c-bg)] border border-[var(--c-border)] rounded-[7px] shadow-md py-1">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => scrollTo(s.id!)}
              className="w-full text-left px-3 py-1.5 text-sm text-[var(--c-fg)] hover:bg-[var(--c-bg-2)] hover:text-[var(--c-accent)] transition-colors flex items-center gap-2"
            >
              <span className="shrink-0">{s.icon}</span>
              <span className="truncate">{s.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// バインド変数バー（グリッド直上・プリセット存在時のみ表示）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function BindVarBar({
  presets, activePresetId, uiType, barLabel, onActiveChange,
}: {
  presets: DashboardPreset[];
  activePresetId: number | null;
  uiType: BindUiType;
  barLabel?: string;
  onActiveChange: (id: number | null) => void;
}) {
  if (presets.length === 0) return null;

  const toggle = (id: number | undefined) =>
    onActiveChange(activePresetId === (id ?? null) ? null : (id ?? null));

  return (
    <div className="px-8 pt-6">
      <div className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg px-4 py-2.5 flex items-center gap-3 shadow-[var(--shadow-sm,0_1px_4px_rgba(0,0,0,.06))] flex-wrap">
        {barLabel && <span className="text-xs text-[var(--c-fg-3)] shrink-0 font-medium">{barLabel}</span>}
        {uiType === 'segment' ? (
          <div className="seg-ctrl">
            {presets.map((p) => (
              <button key={p.id}
                className={`seg-btn seg-btn--sm${activePresetId === p.id ? ' seg-btn--active' : ''}`}
                onClick={() => toggle(p.id)}>
                {p.name}
              </button>
            ))}
          </div>
        ) : uiType === 'tabs' ? (
          <div className="flex items-end gap-0 flex-wrap border-b border-[var(--c-border)] -mx-4 px-4">
            {presets.map((p) => (
              <button key={p.id}
                onClick={() => toggle(p.id)}
                className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors ${activePresetId === p.id ? 'border-[var(--c-accent)] text-[var(--c-accent)]' : 'border-transparent text-[var(--c-fg-2)] hover:text-[var(--c-fg)]'}`}>
                {p.name}
              </button>
            ))}
          </div>
        ) : uiType === 'select' ? (
          <Select
            options={[{ value: '', label: '選択なし' }, ...presets.map((p) => ({ value: String(p.id), label: p.name }))]}
            value={activePresetId != null ? String(activePresetId) : ''}
            onChange={(v) => onActiveChange(v ? Number(v) : null)}
          />
        ) : (
          /* pill: 独立したカプセル形ボタン */
          <div className="flex gap-1 flex-wrap">
            {presets.map((p) => {
              const isActive = activePresetId === p.id;
              return (
                <button key={p.id} onClick={() => toggle(p.id)}
                  className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${isActive ? 'bg-[var(--c-accent)] text-white border-[var(--c-accent)]' : 'border-[var(--c-border)] text-[var(--c-fg-2)] hover:border-[var(--c-accent)] hover:text-[var(--c-accent)]'}`}>
                  {p.name}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 設定パネル内ソータブル行
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ITEM_MANAGED_TYPES: SectionType[] = ['list', 'grid', 'table', 'command_builder'];

function SortableSettingsRow({
  section,
  onEdit,
  onDelete,
  onOpenItemMgr,
  onToggleNewRow,
  onToggleShowFilter,
  onToggleShowAddBtn,
  onUpdateWidth,
}: {
  section: DashboardSection;
  onEdit: (s: DashboardSection) => void;
  onDelete: (id: number) => void;
  onOpenItemMgr: (s: DashboardSection) => void;
  onToggleNewRow: (s: DashboardSection, value: boolean) => void;
  onToggleShowFilter: (s: DashboardSection, value: boolean) => void;
  onToggleShowAddBtn: (s: DashboardSection, value: boolean) => void;
  onUpdateWidth: (s: DashboardSection, width: SectionWidth) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id! });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const isNewRow = section.new_row ?? (section as any).newRow ?? false;

  return (
    <div ref={setNodeRef} style={style}
      className="group border border-[var(--c-border)] rounded-xl bg-[var(--c-surface)] hover:border-[var(--c-border-2,var(--c-border))] transition-colors">
      {/* 上段: ハンドル・バッジ・アイコン・タイトル・アクション */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button {...attributes} {...listeners}
          className="text-[var(--c-fg-3)] cursor-grab active:cursor-grabbing hover:text-[var(--c-fg)] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity touch-none p-0.5"
          tabIndex={-1} aria-label="ドラッグして並び替え">
          <GripVerticalIcon size={14} />
        </button>
        <span className={`text-[10px] shrink-0 px-2 py-0.5 rounded-full font-semibold whitespace-nowrap ${TYPE_BADGE[section.type]}`}>
          {TYPE_LABELS[section.type]}
        </span>
        <span className="text-base shrink-0 leading-none">{section.icon}</span>
        <span className="flex-1 text-sm font-medium text-[var(--c-fg)] truncate min-w-0">{section.title}</span>
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {ITEM_MANAGED_TYPES.includes(section.type) && (
            <button onClick={() => onOpenItemMgr(section)}
              className="p-1.5 rounded-md text-[var(--c-fg-3)] hover:text-[var(--c-accent)] hover:bg-[var(--c-accent-dim)] transition-colors" title="アイテム管理">
              <ListIcon size={12} />
            </button>
          )}
          <button onClick={() => onEdit(section)}
            className="p-1.5 rounded-md text-[var(--c-fg-3)] hover:text-[var(--c-accent)] hover:bg-[var(--c-accent-dim)] transition-colors" title="編集">
            <PencilIcon size={12} />
          </button>
          <button onClick={() => onDelete(section.id!)}
            className="p-1.5 rounded-md text-[var(--c-fg-3)] hover:text-red-500 hover:bg-[var(--c-danger-bg)] transition-colors" title="削除">
            <Trash2Icon size={12} />
          </button>
        </div>
      </div>
      {/* 下段: 幅・行頭トグル・フィルタバートグル */}
      <div className="flex items-center gap-3 px-3 pb-2.5 border-t border-[var(--c-border)]/60 pt-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-[var(--c-fg-3)] shrink-0">幅</span>
          <div className="w-[112px] shrink-0">
            <Select
              options={WIDTH_SELECT_OPTIONS}
              value={section.width}
              onChange={(v) => onUpdateWidth(section, v as SectionWidth)}
            />
          </div>
        </div>
        <label className="toggle-wrap">
          <input type="checkbox" className="toggle-input" checked={isNewRow}
            onChange={(e) => onToggleNewRow(section, e.target.checked)} />
          <span className="toggle-track"><span className="toggle-thumb" /></span>
          <span className="toggle-label" style={{ fontSize: '11px' }}>行頭</span>
        </label>
        {section.type === 'list' && (
          <label className="toggle-wrap">
            <input type="checkbox" className="toggle-input" checked={section.show_filter ?? false}
              onChange={(e) => onToggleShowFilter(section, e.target.checked)} />
            <span className="toggle-track"><span className="toggle-thumb" /></span>
            <span className="toggle-label" style={{ fontSize: '11px' }}>フィルタ</span>
          </label>
        )}
        {['list', 'grid', 'table'].includes(section.type) && (
          <label className="toggle-wrap">
            <input type="checkbox" className="toggle-input" checked={section.show_add_btn ?? false}
              onChange={(e) => onToggleShowAddBtn(section, e.target.checked)} />
            <span className="toggle-track"><span className="toggle-thumb" /></span>
            <span className="toggle-label" style={{ fontSize: '11px' }}>追加ボタン</span>
          </label>
        )}
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 共通バインド変数モーダル
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function BindVarModal({
  open, onClose, title, zIndex = 400,
  varNames, uiType, barLabel,
  presets, activePresetId, onActiveChange,
  onSaveConfig, onPresetAdd, onPresetSave, onPresetDelete, onPresetReorder,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  zIndex?: number;
  varNames: string[];
  uiType: BindUiType;
  barLabel: string;
  presets: SectionPreset[];
  activePresetId: string | number | null;
  onActiveChange: (id: string | number | null) => void;
  onSaveConfig: (varNames: string[], uiType: BindUiType, barLabel: string) => Promise<void>;
  onPresetAdd: (data: { name: string; values: Record<string, string> }) => Promise<SectionPreset | null>;
  onPresetSave: (preset: SectionPreset) => Promise<void>;
  onPresetDelete: (id: string | number) => Promise<void>;
  onPresetReorder: (reordered: SectionPreset[]) => Promise<void>;
}) {
  const [formState, setFormState] = useState<{ id: string | number | null; name: string; values: Record<string, string> } | null>(null);

  useEffect(() => { if (!open) setFormState(null); }, [open]);

  // ESC で閉じる
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const modalTitle = title ?? '共通バインド変数';

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex }} onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
      <div
        role="dialog" aria-modal="true"
        aria-label={modalTitle}
        className="relative bg-[var(--c-bg)] border border-[var(--c-border)] rounded-2xl shadow-[var(--shadow-lg,0_20px_60px_rgba(0,0,0,.25))] w-[780px] h-[760px] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-5 py-4 border-b border-[var(--c-border)] shrink-0">
          <span className="font-mono text-xs font-semibold text-[var(--c-accent)] shrink-0">{'{x}'}</span>
          <h2 className="font-semibold text-sm flex-1">{modalTitle}</h2>
          <button onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--c-fg-3)] hover:text-[var(--c-fg)] hover:bg-[var(--c-bg-2)] transition-colors"
            aria-label="閉じる">
            <XIcon size={14} />
          </button>
        </div>
        <div className="flex-1 overflow-hidden min-h-0">
          <BindVarPanel
            varNames={varNames}
            uiType={uiType}
            barLabel={barLabel}
            presets={presets}
            activePresetId={activePresetId}
            formState={formState}
            onFormStateChange={setFormState}
            onActiveChange={onActiveChange}
            onSaveConfig={onSaveConfig}
            onPresetAdd={onPresetAdd}
            onPresetSave={onPresetSave}
            onPresetDelete={onPresetDelete}
            onPresetReorder={onPresetReorder}
          />
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 設定パネル
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface DashboardSettingsPanelProps {
  open: boolean;
  onClose: () => void;
  sections: DashboardSection[];
  onDragEnd: (event: DragEndEvent) => void;
  onAddSectionDirect: (name: string, type: SectionType) => Promise<void>;
  onEditSection: (section: DashboardSection) => void;
  onDeleteSection: (id: number) => void;
  onToggleNewRow: (section: DashboardSection, value: boolean) => Promise<void>;
  onToggleShowFilter: (section: DashboardSection, value: boolean) => Promise<void>;
  onUpdateWidth: (section: DashboardSection, width: SectionWidth) => Promise<void>;
  onOpenItemMgr: (section: DashboardSection) => void;
  instanceId: string;
  presets: DashboardPreset[];
  activePresetId: number | null;
  bindConfig: BindConfig;
  onPresetsChanged: () => void;
  onActiveChange: (id: number | null) => void;
  onExport: () => void;
  onImportClick: () => void;
  isOverlaid?: boolean;
  onToggleShowAddBtn: (section: DashboardSection, value: boolean) => void;
}

export function DashboardSettingsPanel({
  open, onClose, sections, onDragEnd, onAddSectionDirect, onEditSection, onDeleteSection,
  onToggleNewRow, onToggleShowFilter, onToggleShowAddBtn, onUpdateWidth, onOpenItemMgr,
  instanceId, presets, activePresetId, bindConfig, onPresetsChanged, onActiveChange,
  onExport, onImportClick, isOverlaid = false,
}: DashboardSettingsPanelProps) {
  const [bindModalOpen, setBindModalOpen] = useState(false);

  // ESC で閉じる（上位モーダルや BindVarModal が開いていればスキップ）
  useEffect(() => {
    if (!open || isOverlaid || bindModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, isOverlaid, bindModalOpen, onClose]);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<SectionType>('list');
  const panelSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[300] flex items-center justify-center p-4"
        onClick={onClose}
      >
        {/* バックドロップ */}
        <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />

        {/* モーダル本体 */}
        <div
          role="dialog" aria-modal="true" aria-label="ダッシュボード設定"
          className="relative bg-[var(--c-bg)] border border-[var(--c-border)] rounded-2xl shadow-[var(--shadow-lg,0_20px_60px_rgba(0,0,0,.25))] w-[640px] max-h-[85vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* ヘッダー */}
          <div className="flex items-center gap-2 px-5 py-4 border-b border-[var(--c-border)] shrink-0">
            <Settings2Icon size={15} className="text-[var(--c-accent)] shrink-0" />
            <h2 className="font-semibold text-sm flex-1">ダッシュボード設定</h2>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--c-bg-2)] text-[var(--c-fg-3)] shrink-0">
              {sections.length} セクション
            </span>
            <div className="flex items-center gap-0.5 shrink-0">
              <button onClick={onExport}
                className="p-1.5 rounded-lg text-[var(--c-fg-3)] hover:text-[var(--c-fg)] hover:bg-[var(--c-bg-2)] transition-colors" title="エクスポート">
                <DownloadIcon size={14} />
              </button>
              <button onClick={onImportClick}
                className="p-1.5 rounded-lg text-[var(--c-fg-3)] hover:text-[var(--c-fg)] hover:bg-[var(--c-bg-2)] transition-colors" title="インポート">
                <UploadIcon size={14} />
              </button>
              <button onClick={onClose}
                className="p-1.5 rounded-lg text-[var(--c-fg-3)] hover:text-[var(--c-fg)] hover:bg-[var(--c-bg-2)] transition-colors ml-0.5"
                aria-label="閉じる">
                <XIcon size={14} />
              </button>
            </div>
          </div>

          {/* ボディ */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="flex flex-col gap-2 p-4">
              {/* 共通バインド変数 固定ナビ行（DnD対象外） */}
              <button
                onClick={() => setBindModalOpen(true)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] text-left hover:border-[var(--c-accent)] hover:bg-[var(--c-accent-dim)] transition-colors"
              >
                <span className="font-mono text-xs font-semibold text-[var(--c-accent)] shrink-0">{'{x}'}</span>
                <span className="flex-1 text-sm text-[var(--c-fg)]">共通バインド変数</span>
                {(bindConfig.varNames.length > 0 || presets.length > 0) && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--c-accent-dim)] text-[var(--c-accent)] shrink-0">
                    {bindConfig.varNames.length}変数 / {presets.length}プリセット
                  </span>
                )}
                <ChevronRightIcon size={13} className="text-[var(--c-fg-3)] shrink-0" />
              </button>
              <DndContext sensors={panelSensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={sections.map((s) => s.id!)} strategy={verticalListSortingStrategy}>
                  {sections.map((s) => (
                    <SortableSettingsRow
                      key={s.id}
                      section={s}
                      onEdit={onEditSection}
                      onDelete={onDeleteSection}
                      onOpenItemMgr={onOpenItemMgr}
                      onToggleNewRow={onToggleNewRow}
                      onToggleShowFilter={onToggleShowFilter}
                      onToggleShowAddBtn={onToggleShowAddBtn}
                      onUpdateWidth={onUpdateWidth}
                    />
                  ))}
                </SortableContext>
              </DndContext>
              {sections.length === 0 && (
                <p className="text-xs text-[var(--c-fg-3)] text-center py-8">セクションがありません</p>
              )}
            </div>
          </div>

          {/* フッター（セクション追加フォーム） */}
          <div className="shrink-0 border-t border-[var(--c-border)] px-5 py-4 bg-[var(--c-bg-2)]/40 rounded-b-2xl">
            <p className="text-[10px] font-semibold text-[var(--c-fg-3)] uppercase tracking-wider mb-3">セクションを追加</p>
            <div className="flex gap-2 items-center">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing && newName.trim()) {
                    onAddSectionDirect(newName.trim(), newType).then(() => setNewName(''));
                  }
                }}
                placeholder="セクション名"
                className="flex-1 px-3 py-2 text-sm rounded-lg border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] focus:outline-none focus:border-[var(--c-accent)] focus:shadow-[0_0_0_3px_var(--c-accent-dim)] transition-all"
              />
              <div className="w-36 shrink-0">
                <Select
                  options={TYPE_SELECT_OPTIONS}
                  value={newType}
                  onChange={(v) => setNewType(v as SectionType)}
                />
              </div>
              <button
                onClick={() => {
                  if (newName.trim()) {
                    onAddSectionDirect(newName.trim(), newType).then(() => setNewName(''));
                  }
                }}
                disabled={!newName.trim()}
                className="btn btn--primary btn--sm flex items-center gap-1.5 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed">
                <PlusIcon size={13} />追加
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 共通バインド変数モーダル（設定パネルより前面） */}
      <BindVarModal
        open={bindModalOpen}
        onClose={() => setBindModalOpen(false)}
        zIndex={400}
        varNames={bindConfig.varNames}
        uiType={bindConfig.uiType || 'segment'}
        barLabel={bindConfig.barLabel || ''}
        presets={presets.map((p) => ({ id: p.id!, name: p.name, values: p.values }))}
        activePresetId={activePresetId}
        onActiveChange={(id) => onActiveChange(id !== null ? Number(id) : null)}
        onSaveConfig={async (varNames, uiType, barLabel) => {
          await dashboardDB.setAppConfig('bind_config', instanceId, { varNames, uiType, barLabel: barLabel || undefined });
          onPresetsChanged();
        }}
        onPresetAdd={async (data) => {
          const id = await dashboardDB.addPreset(
            { instance_id: instanceId, name: data.name, position: presets.length, values: data.values }, instanceId
          );
          onPresetsChanged();
          const p = await dashboardDB.presets.get(id);
          return p ? { id: p.id!, name: p.name, values: p.values } : null;
        }}
        onPresetSave={async (preset) => {
          const existing = presets.find((p) => String(p.id) === String(preset.id));
          if (!existing) return;
          await dashboardDB.updatePreset({ ...existing, name: preset.name, values: preset.values });
          onPresetsChanged();
        }}
        onPresetDelete={async (id) => {
          if (!(await confirmDialog({ message: 'このプリセットを削除しますか？', danger: true }))) return;
          await dashboardDB.deletePreset(Number(id));
          if (String(activePresetId) === String(id)) onActiveChange(null);
          onPresetsChanged();
        }}
        onPresetReorder={async (reordered) => {
          await Promise.all(reordered.map((p, i) => {
            const existing = presets.find((orig) => String(orig.id) === String(p.id));
            return existing ? dashboardDB.updatePreset({ ...existing, position: i }) : Promise.resolve();
          }));
          onPresetsChanged();
        }}
      />
    </>
  );
}

