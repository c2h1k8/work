// ==================================================
// SettingsPanel: タブ設定パネル（モーダル）
// ==================================================

import clsx from 'clsx';
import styles from '../../styles/components/settings-panel.module.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type Dexie from 'dexie';
import { useTabStore } from '../../stores/tab_store';
import { ICON_PALETTE, GENERIC_ICON, type TabConfig } from '../../constants/tabs';
import { Toast } from '../Toast';
import { FileSaver } from '../../core/file_saver';
import { appDB } from '../../db/app_db';
import { kanbanDB } from '../../db/kanban_db';
import { noteDB } from '../../db/note_db';
import { sqlDB } from '../../db/sql_db';
import { wbsDB } from '../../db/wbs_db';
import { snippetDB } from '../../db/snippet_db';
import { dashboardDB } from '../../db/dashboard_db';

// --------------------------------------------------
// アイコンピッカー（ポップオーバー）
// --------------------------------------------------
function IconPicker({
  currentIcon,
  onSelect,
  onClose,
}: {
  currentIcon: string;
  onSelect: (svg: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div ref={ref} className={styles['settings-icon-picker']}>
      {ICON_PALETTE.map((icon) => (
        <button
          key={icon.id}
          type="button"
          className={clsx(styles['settings-icon-swatch'], currentIcon === icon.svg && styles['is-active'])}
          title={icon.label}
          dangerouslySetInnerHTML={{ __html: icon.svg }}
          onClick={() => { onSelect(icon.svg); onClose(); }}
        />
      ))}
    </div>
  );
}

// --------------------------------------------------
// タブ一覧アイテム（ソータブル）
// --------------------------------------------------
function TabSettingItem({ tab }: { tab: TabConfig }) {
  const { toggleTabVisible, deleteTab, updateTabIcon, renameTab } = useTabStore();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [renaming, setRenaming]     = useState(false);
  const [renameVal, setRenameVal]   = useState(tab.label);
  const renameRef = useRef<HTMLInputElement>(null);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tab.label,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const handleRenameStart = () => {
    setRenameVal(tab.label);
    setRenaming(true);
    setTimeout(() => renameRef.current?.select(), 30);
  };

  const handleRenameSave = async () => {
    const trimmed = renameVal.trim();
    if (!trimmed || trimmed === tab.label) { setRenaming(false); return; }
    await renameTab(tab.label, trimmed);
    setRenaming(false);
  };

  const handleDelete = async () => {
    if (!confirm(`タブ「${tab.label}」を削除しますか？\nこの操作は元に戻せません。`)) return;
    await deleteTab(tab.label);
    Toast.success(`「${tab.label}」を削除しました`);
  };

  return (
    <li ref={setNodeRef} style={style} className={styles['settings-item']} data-label={tab.label}>
      {/* ドラッグハンドル */}
      <button
        type="button"
        className={styles['settings-item__drag-handle']}
        aria-label="ドラッグして並び替え"
        {...attributes}
        {...listeners}
      >
        <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor">
          <path d="M5.5 3a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM5.5 8a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM5.5 13a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM13.5 3a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM13.5 8a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM13.5 13a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" />
        </svg>
      </button>

      {/* 表示/非表示トグル */}
      <button
        type="button"
        className={clsx(styles['settings-item__toggle'], tab.visible && styles['is-visible'])}
        title={tab.visible ? '非表示にする' : '表示する'}
        onClick={() => toggleTabVisible(tab.label)}
      >
        <svg viewBox="0 0 16 16" fill="currentColor" width="13" height="13">
          {tab.visible ? (
            <path d="M8 2c1.981 0 3.671.992 4.933 2.078 1.27 1.091 2.187 2.345 2.637 3.023a1.62 1.62 0 0 1 0 1.798c-.45.678-1.367 1.932-2.637 3.023C11.67 13.008 9.981 14 8 14c-1.981 0-3.671-.992-4.933-2.078C1.797 10.83.88 9.576.43 8.898a1.62 1.62 0 0 1 0-1.798c.45-.677 1.367-1.931 2.637-3.022C4.33 2.992 6.019 2 8 2ZM1.679 7.932a.12.12 0 0 0 0 .136c.411.622 1.241 1.75 2.366 2.717C5.176 11.758 6.527 12.5 8 12.5c1.473 0 2.825-.742 3.955-1.715 1.124-.967 1.954-2.096 2.366-2.717a.12.12 0 0 0 0-.136c-.412-.621-1.242-1.75-2.366-2.717C10.825 4.242 9.473 3.5 8 3.5c-1.473 0-2.825.742-3.955 1.715-1.124.967-1.954 2.096-2.366 2.717ZM8 10a2 2 0 1 1-.001-3.999A2 2 0 0 1 8 10Z" />
          ) : (
            <path d="M.143 2.31a.75.75 0 0 1 1.047-.167l14.5 10.5a.75.75 0 1 1-.88 1.214l-2.248-1.628C11.346 13.19 9.792 14 8 14c-1.981 0-3.67-.992-4.933-2.078C1.797 10.83.88 9.576.43 8.898a1.62 1.62 0 0 1 0-1.798c.318-.478.790-1.084 1.39-1.703L.31 3.357A.75.75 0 0 1 .143 2.31Zm3.386 3.378L5.065 6.88a3.5 3.5 0 0 0 4.554 4.554l1.044.756C9.966 12.587 9.02 12.5 8 12.5c-1.473 0-2.825-.742-3.955-1.715-1.124-.967-1.954-2.096-2.366-2.717a.12.12 0 0 1 0-.136c.274-.413.673-.944 1.198-1.487L3.53 5.688ZM8 3.5c.552 0 1.088.1 1.586.281L8.356 3.27A5.3 5.3 0 0 0 8 3.5ZM10.5 8a2.5 2.5 0 0 1-2.5 2.5c-.168 0-.333-.017-.491-.049L10.5 8ZM8 5.5a2.5 2.5 0 0 1 2.5 2.5c0 .168-.017.333-.049.491L8 5.5Z" />
          )}
        </svg>
      </button>

      {/* アイコン */}
      <div className={styles['settings-item__icon-wrap']} style={{ position: 'relative' }}>
        <button
          type="button"
          className={styles['settings-item__icon']}
          title="アイコンを変更"
          dangerouslySetInnerHTML={{ __html: tab.icon || GENERIC_ICON }}
          onClick={() => setPickerOpen((v) => !v)}
        />
        {pickerOpen && (
          <IconPicker
            currentIcon={tab.icon}
            onSelect={(svg) => updateTabIcon(tab.label, svg)}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </div>

      {/* ラベル（クリックでリネーム） */}
      {renaming ? (
        <input
          ref={renameRef}
          className={styles['settings-item__rename-input']}
          type="text"
          value={renameVal}
          onChange={(e) => setRenameVal(e.target.value)}
          onBlur={handleRenameSave}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleRenameSave();
            if (e.key === 'Escape') setRenaming(false);
          }}
        />
      ) : (
        <span
          className={styles['settings-item__label']}
          title="クリックしてリネーム"
          onClick={tab.isBuiltIn ? undefined : handleRenameStart}
          style={{ cursor: tab.isBuiltIn ? 'default' : 'pointer' }}
        >
          {tab.label}
          {tab.isBuiltIn && <span className={styles['settings-item__builtin']}>組み込み</span>}
        </span>
      )}

      {/* 削除 */}
      {!tab.isBuiltIn && (
        <button
          type="button"
          className={styles['settings-item__delete']}
          title="削除"
          onClick={handleDelete}
        >
          <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
            <path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z" />
          </svg>
        </button>
      )}
    </li>
  );
}

// --------------------------------------------------
// バックアップ機能
// --------------------------------------------------
type BackupData = {
  type: string;
  version: number;
  timestamp: string;
  databases: Record<string, Record<string, unknown[]>>;
};

async function _dumpDB(db: Dexie, storeNames: string[]): Promise<Record<string, unknown[]>> {
  await db.open();
  const data: Record<string, unknown[]> = {};
  for (const name of storeNames) {
    try { data[name] = await db.table(name).toArray(); }
    catch { data[name] = []; }
  }
  return data;
}

async function _loadDB(db: Dexie, storeData: Record<string, unknown[]>): Promise<void> {
  await db.open();
  for (const [name, records] of Object.entries(storeData)) {
    if (!db.tables.some((t) => t.name === name)) continue;
    const table = db.table(name);
    await table.clear();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (records.length > 0) await table.bulkPut(records as any[]);
  }
}

async function backupAllData() {
  try {
    const [appData, kanbanData, noteData, sqlData, wbsData, snippetData, dashboardData] = await Promise.all([
      _dumpDB(appDB,      ['settings']),
      _dumpDB(kanbanDB,   ['tasks', 'comments', 'labels', 'task_labels', 'columns', 'activities', 'task_relations', 'note_links', 'templates', 'archives', 'dependencies']),
      _dumpDB(noteDB,     ['tasks', 'fields', 'entries', 'note_links', 'history']),
      _dumpDB(sqlDB,      ['envs', 'table_memos']),
      _dumpDB(wbsDB,      ['tasks']),
      _dumpDB(snippetDB,  ['snippets']),
      _dumpDB(dashboardDB,['sections', 'items', 'app_config', 'presets']),
    ]);
    const backup: BackupData = {
      type: 'full_backup',
      version: 1,
      timestamp: new Date().toISOString(),
      databases: { app: appData, kanban: kanbanData, note: noteData, sql: sqlData, wbs: wbsData, snippet: snippetData, dashboard: dashboardData },
    };
    const json = JSON.stringify(backup, null, 2);
    const now = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    const ts = `${now.getFullYear()}${p(now.getMonth()+1)}${p(now.getDate())}_${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
    const saved = await FileSaver.save(json, `mytools_backup_${ts}.json`);
    if (saved) Toast.success('全データのバックアップが完了しました。');
  } catch (err) {
    Toast.error('バックアップに失敗しました: ' + (err instanceof Error ? err.message : String(err)));
  }
}

async function restoreAllData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    let data: BackupData;
    try { data = JSON.parse(await file.text()) as BackupData; }
    catch { Toast.error('JSONの解析に失敗しました'); return; }
    if (data.type !== 'full_backup') {
      Toast.error('全データバックアップファイルではありません');
      return;
    }
    if (!confirm('現在の全データが上書きされます。この操作は元に戻せません。\nよろしいですか？')) return;
    const dbs = data.databases ?? {};
    try {
      if (dbs.app)       await _loadDB(appDB,       dbs.app);
      if (dbs.kanban)    await _loadDB(kanbanDB,     dbs.kanban);
      if (dbs.note)      await _loadDB(noteDB,       dbs.note);
      if (dbs.sql)       await _loadDB(sqlDB,        dbs.sql);
      if (dbs.wbs)       await _loadDB(wbsDB,        dbs.wbs);
      if (dbs.snippet)   await _loadDB(snippetDB,    dbs.snippet);
      if (dbs.dashboard) await _loadDB(dashboardDB,  dbs.dashboard);
      Toast.success('全データの復元が完了しました。ページを再読み込みします。');
      window.location.reload();
    } catch (err) {
      Toast.error('復元に失敗しました: ' + (err instanceof Error ? err.message : String(err)));
    }
  };
  input.click();
}

// --------------------------------------------------
// SettingsPanel 本体
// --------------------------------------------------
export function SettingsPanel() {
  const { config, settingsOpen, closeSettings, addTab, reorderTabs } = useTabStore();
  const [newLabel, setNewLabel] = useState('');

  const sensors = useSensors(useSensor(PointerSensor, {
    activationConstraint: { distance: 5 },
  }));

  useEffect(() => {
    if (!settingsOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeSettings(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [settingsOpen, closeSettings]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    reorderTabs(String(active.id), String(over.id));
  }, [reorderTabs]);

  const handleAddTab = useCallback(async () => {
    const label = newLabel.trim();
    if (!label) { Toast.error('ラベル名を入力してください'); return; }
    if (config.some((t) => t.label === label)) {
      Toast.error('同じ名前のタブが既に存在します');
      return;
    }
    await addTab({
      label,
      pageSrc: 'pages/dashboard.html',
      icon: GENERIC_ICON,
      visible: true,
      isBuiltIn: false,
    });
    setNewLabel('');
    Toast.success(`「${label}」タブを追加しました`);
  }, [newLabel, config, addTab]);

  if (!settingsOpen) return null;

  const sorted = [...config].sort((a, b) => a.position - b.position);

  return createPortal(
    <div id="settings-overlay" className={styles['settings-overlay']} role="dialog" aria-modal="true" aria-label="タブ設定">
      <div className={styles['settings-backdrop']} onClick={closeSettings} />
      <div className={styles['settings-dialog']}>
        <div className={styles['settings-header']}>
          <h2>タブ設定</h2>
          <button type="button" className={styles['settings-close-btn']} aria-label="閉じる" onClick={closeSettings}>×</button>
        </div>
        <div className={styles['settings-body']}>
          {/* タブ一覧（DnD） */}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={sorted.map((t) => t.label)} strategy={verticalListSortingStrategy}>
              <ul className={styles['settings-list']}>
                {sorted.map((tab) => (
                  <TabSettingItem key={tab.label} tab={tab} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>

          {/* タブ追加フォーム */}
          <div className={styles['settings-add-form']}>
            <h3>タブを追加</h3>
            <input
              type="text"
              className={styles['settings-input']}
              placeholder="ラベル名"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAddTab(); }}
            />
            <button type="button" className="btn btn--primary btn--sm" onClick={handleAddTab}>
              追加
            </button>
          </div>

          {/* 全データバックアップ */}
          <div className={styles['settings-io-form']}>
            <h3>全データ一括バックアップ</h3>
            <div className={styles['settings-backup-btns']}>
              <button type="button" className="btn btn--sm" onClick={backupAllData}>
                <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true">
                  <path d="M2.75 14A1.75 1.75 0 0 1 1 12.25v-2.5a.75.75 0 0 1 1.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 1.5 0v2.5A1.75 1.75 0 0 1 13.25 14ZM7.25 7.689V2a.75.75 0 0 1 1.5 0v5.689l1.97-1.97a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734l-3.5 3.5a.75.75 0 0 1-1.06 0l-3.5-3.5a.749.749 0 0 1 .326-1.275.749.749 0 0 1 .734.215Z" />
                </svg>
                バックアップ
              </button>
              <button type="button" className="btn btn--sm" onClick={restoreAllData}>
                <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true">
                  <path d="M2.75 14A1.75 1.75 0 0 1 1 12.25v-2.5a.75.75 0 0 1 1.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 1.5 0v2.5A1.75 1.75 0 0 1 13.25 14ZM7.25 2.311v5.689l-1.97-1.97a.749.749 0 0 0-1.275.326.749.749 0 0 0 .215.734l3.5 3.5a.75.75 0 0 0 1.06 0l3.5-3.5a.749.749 0 0 0-.326-1.275.749.749 0 0 0-.734.215L9.75 8V2.311a.75.75 0 0 0-1.5 0Z" />
                </svg>
                復元
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
