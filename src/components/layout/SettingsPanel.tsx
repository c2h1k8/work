// ==================================================
// SettingsPanel: タブ設定パネル（モーダル）
// ==================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTabStore } from '../../stores/tab_store';
import { ICON_PALETTE, GENERIC_ICON, type TabConfig } from '../../constants/tabs';
import { Toast } from '../Toast';

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
    <div ref={ref} className="settings-icon-picker">
      {ICON_PALETTE.map((icon) => (
        <button
          key={icon.id}
          type="button"
          className={`settings-icon-swatch${currentIcon === icon.svg ? ' is-active' : ''}`}
          title={icon.label}
          dangerouslySetInnerHTML={{ __html: icon.svg }}
          onClick={() => { onSelect(icon.svg); onClose(); }}
        />
      ))}
    </div>
  );
}

// --------------------------------------------------
// タブ一覧アイテム
// --------------------------------------------------
function TabSettingItem({
  tab,
  index,
  total,
}: {
  tab: TabConfig;
  index: number;
  total: number;
}) {
  const { toggleTabVisible, moveTab, deleteTab, updateTabIcon, renameTab } = useTabStore();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [renaming, setRenaming]     = useState(false);
  const [renameVal, setRenameVal]   = useState(tab.label);
  const renameRef = useRef<HTMLInputElement>(null);

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
    <li className="settings-item" data-label={tab.label}>
      {/* 表示/非表示トグル */}
      <button
        type="button"
        className={`settings-item__toggle${tab.visible ? ' is-visible' : ''}`}
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
      <div className="settings-item__icon-wrap" style={{ position: 'relative' }}>
        <button
          type="button"
          className="settings-item__icon"
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
          className="settings-item__rename-input"
          type="text"
          value={renameVal}
          onChange={(e) => setRenameVal(e.target.value)}
          onBlur={handleRenameSave}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleRenameSave();
            if (e.key === 'Escape') setRenaming(false);
          }}
        />
      ) : (
        <span
          className="settings-item__label"
          title="クリックしてリネーム"
          onClick={tab.isBuiltIn ? undefined : handleRenameStart}
          style={{ cursor: tab.isBuiltIn ? 'default' : 'pointer' }}
        >
          {tab.label}
          {tab.isBuiltIn && <span className="settings-item__builtin">組み込み</span>}
        </span>
      )}

      {/* 並び替え・削除 */}
      <div className="settings-item__actions">
        <button
          type="button"
          className="settings-item__move"
          title="上へ"
          disabled={index === 0}
          onClick={() => moveTab(tab.label, 'up')}
        >▲</button>
        <button
          type="button"
          className="settings-item__move"
          title="下へ"
          disabled={index === total - 1}
          onClick={() => moveTab(tab.label, 'down')}
        >▼</button>
        {!tab.isBuiltIn && (
          <button
            type="button"
            className="settings-item__delete"
            title="削除"
            onClick={handleDelete}
          >
            <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
              <path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z" />
            </svg>
          </button>
        )}
      </div>
    </li>
  );
}

// --------------------------------------------------
// バックアップ機能
// --------------------------------------------------
async function backupAllData() {
  // Phase 4 で各 DB を import して実装
  Toast.info('バックアップ機能は Phase 4 で実装予定です');
}

async function restoreAllData() {
  Toast.info('復元機能は Phase 4 で実装予定です');
}

// --------------------------------------------------
// SettingsPanel 本体
// --------------------------------------------------
export function SettingsPanel() {
  const { config, settingsOpen, closeSettings, addTab } = useTabStore();
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType]   = useState<'url' | 'dashboard'>('url');
  const [newUrl, setNewUrl]     = useState('');

  // ESC で閉じる
  useEffect(() => {
    if (!settingsOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeSettings(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [settingsOpen, closeSettings]);

  const handleAddTab = useCallback(async () => {
    const label = newLabel.trim();
    if (!label) { Toast.error('ラベル名を入力してください'); return; }
    if (config.some((t) => t.label === label)) {
      Toast.error('同じ名前のタブが既に存在します');
      return;
    }
    const pageSrc = newType === 'dashboard'
      ? `pages/dashboard.html?instance=${Date.now()}`
      : newUrl.trim() || '#';
    await addTab({
      label,
      pageSrc,
      icon: GENERIC_ICON,
      visible: true,
      isBuiltIn: false,
    });
    setNewLabel('');
    setNewUrl('');
    Toast.success(`「${label}」タブを追加しました`);
  }, [newLabel, newType, newUrl, config, addTab]);

  if (!settingsOpen) return null;

  const sorted = [...config].sort((a, b) => a.position - b.position);

  return createPortal(
    <div id="settings-overlay" className="settings-overlay" role="dialog" aria-modal="true" aria-label="タブ設定">
      <div className="settings-backdrop" onClick={closeSettings} />
      <div className="settings-dialog">
        <div className="settings-header">
          <h2>タブ設定</h2>
          <button type="button" className="settings-close-btn" aria-label="閉じる" onClick={closeSettings}>×</button>
        </div>
        <div className="settings-body">
          {/* タブ一覧 */}
          <ul className="settings-list">
            {sorted.map((tab, i) => (
              <TabSettingItem key={tab.label} tab={tab} index={i} total={sorted.length} />
            ))}
          </ul>

          {/* タブ追加フォーム */}
          <div className="settings-add-form">
            <h3>タブを追加</h3>
            <input
              type="text"
              className="settings-input"
              placeholder="ラベル名"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddTab(); }}
            />
            <select
              className="settings-select"
              value={newType}
              onChange={(e) => setNewType(e.target.value as 'url' | 'dashboard')}
            >
              <option value="url">カスタムURL</option>
              <option value="dashboard">ダッシュボード</option>
            </select>
            {newType === 'url' && (
              <input
                type="text"
                className="settings-input"
                placeholder="URL（例: mypage.html）"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
              />
            )}
            <button type="button" className="btn btn--primary btn--sm" onClick={handleAddTab}>
              追加
            </button>
          </div>

          {/* 全データバックアップ */}
          <div className="settings-io-form">
            <h3>全データ一括バックアップ</h3>
            <div className="settings-backup-btns">
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
