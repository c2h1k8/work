// ==================================================
// LabelManager: ラベル管理ダイアログ
// ==================================================
// 使い方:
//   <LabelManager
//     open={true}
//     title="ラベル設定"
//     labels={[{ id, name, color }]}
//     onAdd={async (name, color) => newLabel}
//     onUpdate={async (id, name, color) => void}
//     onDelete={async (id) => void}
//     onClose={() => void}
//   />

import '../styles/components/label-manager.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Toast } from './Toast';

export interface LabelItem {
  id: number;
  name: string;
  color: string;
}

interface LabelManagerProps {
  open: boolean;
  title?: string;
  labels: LabelItem[];
  onAdd: (name: string, color: string) => Promise<LabelItem>;
  onUpdate: (id: number, name: string, color: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onClose: () => void;
  onReorder?: (labels: LabelItem[]) => void;
}

const PRESET_COLORS = [
  '#f85149', '#fd7e14', '#e3b341', '#3fb950',
  '#58a6ff', '#d2a8ff', '#ff7b72', '#ffa657',
  '#79c0ff', '#db61a2', '#8957e5', '#56d364',
];

function ColorPalette({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (color: string) => void;
}) {
  return (
    <div className="lmgr__palette">
      {PRESET_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          className={`lmgr__swatch${selected === color ? ' is-active' : ''}`}
          style={{ background: color }}
          title={color}
          onClick={() => onSelect(color)}
        />
      ))}
      <label className="lmgr__swatch lmgr__swatch--custom" title="カスタムカラー">
        <input
          type="color"
          className="lmgr__custom-color-input"
          value={selected}
          onChange={(e) => onSelect(e.target.value)}
        />
        <svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor" aria-hidden="true">
          <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064Zm1.238-3.763a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354Z" />
        </svg>
      </label>
    </div>
  );
}

export function LabelManager({
  open,
  title = 'ラベル設定',
  labels,
  onAdd,
  onUpdate,
  onDelete,
  onClose,
  onReorder,
}: LabelManagerProps) {
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [colorPopoverId, setColorPopoverId] = useState<number | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setNewName('');
      setNewColor(PRESET_COLORS[0]);
      setEditingId(null);
      setTimeout(() => nameInputRef.current?.focus(), 50);
    }
  }, [open]);

  // ESC で閉じる
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const handleAdd = useCallback(async () => {
    const name = newName.trim();
    if (!name) { nameInputRef.current?.focus(); return; }
    if (labels.some((l) => l.name === name)) {
      Toast.error('同じ名前のラベルがすでに存在します');
      nameInputRef.current?.select();
      return;
    }
    await onAdd(name, newColor);
    setNewName('');
  }, [newName, newColor, labels, onAdd]);

  const handleDelete = useCallback(async (label: LabelItem) => {
    if (!confirm(`ラベル「${label.name}」を削除しますか？`)) return;
    await onDelete(label.id);
  }, [onDelete]);

  const handleEditSave = useCallback(async (label: LabelItem) => {
    const name = editingName.trim();
    if (!name || name === label.name) { setEditingId(null); return; }
    if (labels.some((l) => l.id !== label.id && l.name === name)) {
      Toast.error('同じ名前のラベルがすでに存在します');
      return;
    }
    await onUpdate(label.id, name, label.color);
    setEditingId(null);
  }, [editingName, labels, onUpdate]);

  const handleColorChange = useCallback(async (label: LabelItem, color: string) => {
    await onUpdate(label.id, label.name, color);
    setColorPopoverId(null);
  }, [onUpdate]);

  const handleMove = useCallback((index: number, dir: 'up' | 'down') => {
    if (!onReorder) return;
    const next = [...labels];
    const swapIdx = dir === 'up' ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= next.length) return;
    [next[index], next[swapIdx]] = [next[swapIdx], next[index]];
    onReorder(next);
  }, [labels, onReorder]);

  if (!open) return null;

  return createPortal(
    <div id="label-manager" className="lmgr is-open" role="dialog" aria-modal="true" aria-labelledby="lmgr-title">
      <div className="lmgr__backdrop" onClick={onClose} />
      <div className="lmgr__dialog">
        <div className="lmgr__header">
          <span className="lmgr__header-icon" aria-hidden="true">
            <svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor">
              <path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3.879a1.5 1.5 0 0 1 1.06.44l8.5 8.5a1.5 1.5 0 0 1 0 2.12l-3.878 3.879a1.5 1.5 0 0 1-2.122 0l-8.5-8.5A1.5 1.5 0 0 1 1 6.38Zm1.5 0v3.879l8.5 8.5 3.879-3.878-8.5-8.5ZM6 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z" />
            </svg>
          </span>
          <h2 className="lmgr__title" id="lmgr-title">{title}</h2>
          <button className="lmgr__close" aria-label="閉じる" onClick={onClose} type="button">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
              <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
            </svg>
          </button>
        </div>

        <div className="lmgr__body">
          {/* 既存ラベル一覧 */}
          <div className="lmgr__section">
            <div className="lmgr__section-header">
              <span className="lmgr__section-title">ラベル一覧</span>
              <span className="lmgr__label-count">{labels.length} 件</span>
            </div>
            <ul className="lmgr__list">
              {labels.length === 0 ? (
                <li className="lmgr__empty">
                  ラベルがありません。下のフォームから追加してください。
                </li>
              ) : (
                labels.map((label, i) => (
                  <li key={label.id} className="lmgr__item">
                    <div className="lmgr__item-move">
                      <button
                        className="lmgr__move-btn"
                        type="button"
                        title="上へ"
                        disabled={i === 0}
                        onClick={() => handleMove(i, 'up')}
                      >▲</button>
                      <button
                        className="lmgr__move-btn"
                        type="button"
                        title="下へ"
                        disabled={i === labels.length - 1}
                        onClick={() => handleMove(i, 'down')}
                      >▼</button>
                    </div>

                    {/* カラー変更ボタン */}
                    <div style={{ position: 'relative' }}>
                      <button
                        className="lmgr__item-color-btn"
                        type="button"
                        style={{ background: label.color }}
                        title="カラーを変更"
                        onClick={() => setColorPopoverId(colorPopoverId === label.id ? null : label.id)}
                      />
                      {colorPopoverId === label.id && (
                        <div className="lmgr__color-popover">
                          <div className="lmgr__color-popover-inner">
                            <ColorPalette
                              selected={label.color}
                              onSelect={(c) => handleColorChange(label, c)}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <span
                      className="lmgr__item-chip"
                      style={{
                        background: `${label.color}33`,
                        color: label.color,
                        borderColor: `${label.color}99`,
                      }}
                    >
                      {label.name}
                    </span>

                    {/* 名前編集 */}
                    {editingId === label.id ? (
                      <input
                        type="text"
                        className="lmgr__item-name-input"
                        value={editingName}
                        autoFocus
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={() => handleEditSave(label)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleEditSave(label);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                      />
                    ) : (
                      <span
                        className="lmgr__item-name"
                        role="button"
                        tabIndex={0}
                        title="クリックして名前を変更"
                        onClick={() => { setEditingId(label.id); setEditingName(label.name); }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { setEditingId(label.id); setEditingName(label.name); }
                        }}
                      >
                        {label.name}
                      </span>
                    )}

                    <button
                      className="lmgr__item-del"
                      type="button"
                      title="削除"
                      onClick={() => handleDelete(label)}
                    >
                      <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
                        <path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z" />
                      </svg>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>

          {/* 新規追加フォーム */}
          <div className="lmgr__section lmgr__add-section">
            <div className="lmgr__section-header">
              <span className="lmgr__section-title">新しいラベルを追加</span>
            </div>
            <div className="lmgr__add-preview-wrap">
              {newName.trim() && (
                <span
                  className="lmgr__add-preview"
                  style={{
                    background: `${newColor}33`,
                    color: newColor,
                    borderColor: `${newColor}99`,
                  }}
                >
                  {newName}
                </span>
              )}
            </div>
            <div className="lmgr__add-row">
              <input
                ref={nameInputRef}
                className="lmgr__add-input"
                type="text"
                placeholder="ラベル名を入力..."
                maxLength={30}
                autoComplete="off"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAdd();
                }}
              />
              <button className="lmgr__add-btn" type="button" onClick={handleAdd}>
                <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true">
                  <path d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z" />
                </svg>
                追加
              </button>
            </div>
            <ColorPalette selected={newColor} onSelect={setNewColor} />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
