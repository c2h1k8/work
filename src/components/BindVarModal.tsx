// ==================================================
// BindVarModal: バインド変数 + プリセット管理モーダル
// ==================================================
// 使い方:
//   <BindVarModal
//     open={true}
//     title="バインド変数設定"
//     varNames={['HOST', 'PORT']}
//     presets={[{ id: 1, name: '本番', values: { HOST: 'prod.example.com', PORT: '443' } }]}
//     showBarConfig={true}
//     uiType="tabs"
//     barLabel="環境"
//     onAddVar={async (name) => void}
//     onRemoveVar={async (name) => void}
//     onSaveBarConfig={async ({ uiType, barLabel }) => void}
//     onAddPreset={async (name) => newPreset}
//     onUpdatePreset={async (preset) => void}
//     onDeletePreset={async (id) => void}
//     onMovePresetUp={async (id) => void}
//     onMovePresetDown={async (id) => void}
//     onChange={() => void}
//     onClose={() => void}
//   />

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Toast } from './Toast';

export interface BindVarPreset {
  id: number;
  name: string;
  values: Record<string, string>;
}

export type UiType = 'tabs' | 'select' | 'segment';

interface BindVarModalProps {
  open: boolean;
  title?: string;
  varNames: string[];
  presets: BindVarPreset[];
  showBarConfig?: boolean;
  uiType?: UiType;
  barLabel?: string;
  onAddVar: (name: string) => Promise<void>;
  onRemoveVar: (name: string) => Promise<void>;
  onSaveBarConfig?: (cfg: { uiType: UiType; barLabel: string }) => Promise<void>;
  onAddPreset: (name: string) => Promise<BindVarPreset>;
  onUpdatePreset: (preset: BindVarPreset) => Promise<void>;
  onDeletePreset: (id: number) => Promise<void>;
  onMovePresetUp: (id: number) => Promise<void>;
  onMovePresetDown: (id: number) => Promise<void>;
  onChange: () => void;
  onClose: () => void;
}

// --------------------------------------------------
// 変数セクション
// --------------------------------------------------
function VarSection({
  varNames,
  onAdd,
  onRemove,
}: {
  varNames: string[];
  onAdd: (name: string) => Promise<void>;
  onRemove: (name: string) => Promise<void>;
}) {
  const [inputVal, setInputVal] = useState('');

  const handleAdd = useCallback(async () => {
    const raw = inputVal.trim();
    const name = raw.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    if (!name) return;
    if (varNames.includes(name)) { Toast.error('すでに存在する変数名です'); return; }
    await onAdd(name);
    setInputVal('');
  }, [inputVal, varNames, onAdd]);

  const handleRemove = useCallback(async (name: string) => {
    if (!confirm(`変数 {${name}} を削除しますか？`)) return;
    await onRemove(name);
  }, [onRemove]);

  return (
    <div className="bvm-section">
      <h3 className="bvm-section-title">変数名の定義</h3>
      <p className="bvm-help">
        コマンドや値に <code>{'{変数名}'}</code> 形式で埋め込めます。例: <code>{'{IP}'}</code>
      </p>
      <div id="bvm-var-list">
        {varNames.length === 0 ? (
          <p className="bvm-empty">変数が定義されていません</p>
        ) : (
          varNames.map((name) => (
            <div key={name} className="bvm-var-row">
              <code className="bvm-var-badge">{`{${name}}`}</code>
              <button
                type="button"
                className="bvm-btn bvm-btn--danger bvm-btn--sm"
                onClick={() => handleRemove(name)}
              >
                削除
              </button>
            </div>
          ))
        )}
      </div>
      <div className="bvm-add-row">
        <input
          className="bvm-input"
          type="text"
          placeholder="変数名（例: HOST_NAME）"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAdd(); }}
        />
        <button type="button" className="bvm-btn bvm-btn--primary" onClick={handleAdd}>
          追加
        </button>
      </div>
    </div>
  );
}

// --------------------------------------------------
// バー設定セクション
// --------------------------------------------------
function BarConfigSection({
  uiType,
  barLabel,
  onSave,
}: {
  uiType: UiType;
  barLabel: string;
  onSave: (cfg: { uiType: UiType; barLabel: string }) => Promise<void>;
}) {
  const [localType, setLocalType] = useState<UiType>(uiType);
  const [localLabel, setLocalLabel] = useState(barLabel);

  const handleSave = useCallback(async () => {
    await onSave({ uiType: localType, barLabel: localLabel.trim() });
    Toast.success('保存しました');
  }, [localType, localLabel, onSave]);

  return (
    <div className="bvm-section">
      <h3 className="bvm-section-title">選択 UI</h3>
      <div className="bvm-form-row">
        <label className="bvm-label">ラベル（空白で非表示）</label>
        <input
          className="bvm-input"
          type="text"
          value={localLabel}
          placeholder="プリセット"
          onChange={(e) => setLocalLabel(e.target.value)}
        />
      </div>
      <div className="bvm-form-row">
        <label className="bvm-label">表示タイプ</label>
        <select
          className="bvm-select"
          value={localType}
          onChange={(e) => setLocalType(e.target.value as UiType)}
        >
          <option value="tabs">タブ</option>
          <option value="select">セレクトボックス</option>
          <option value="segment">セグメントコントロール</option>
        </select>
      </div>
      <div className="bvm-form-actions">
        <button type="button" className="bvm-btn bvm-btn--primary" onClick={handleSave}>
          保存
        </button>
      </div>
    </div>
  );
}

// --------------------------------------------------
// プリセット一覧
// --------------------------------------------------
function PresetList({
  presets,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
  onAdd,
}: {
  presets: BindVarPreset[];
  onEdit: (id: number) => void;
  onDelete: (id: number) => Promise<void>;
  onMoveUp: (id: number) => Promise<void>;
  onMoveDown: (id: number) => Promise<void>;
  onAdd: (name: string) => Promise<BindVarPreset>;
}) {
  const [addingName, setAddingName] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const addInputRef = useRef<HTMLInputElement>(null);

  const handleShowAdd = () => {
    setShowAddForm(true);
    setTimeout(() => addInputRef.current?.focus(), 50);
  };

  const handleAdd = useCallback(async () => {
    const name = addingName.trim();
    if (!name) { Toast.error('プリセット名を入力してください'); return; }
    await onAdd(name);
    setAddingName('');
    setShowAddForm(false);
  }, [addingName, onAdd]);

  const handleDelete = useCallback(async (id: number) => {
    if (!confirm('このプリセットを削除しますか？')) return;
    await onDelete(id);
  }, [onDelete]);

  return (
    <div className="bvm-section bvm-section--full">
      <h3 className="bvm-section-title">プリセット一覧</h3>
      <div id="bvm-preset-list">
        {presets.length === 0 ? (
          <p className="bvm-empty">プリセットが登録されていません</p>
        ) : (
          presets.map((p, idx) => (
            <div key={p.id} className="bvm-preset-row">
              <span className="bvm-preset-name">{p.name}</span>
              <div className="bvm-preset-actions">
                <button
                  type="button"
                  className="bvm-btn bvm-btn--sm"
                  disabled={idx === 0}
                  onClick={() => onMoveUp(p.id)}
                >↑</button>
                <button
                  type="button"
                  className="bvm-btn bvm-btn--sm"
                  disabled={idx === presets.length - 1}
                  onClick={() => onMoveDown(p.id)}
                >↓</button>
                <button
                  type="button"
                  className="bvm-btn bvm-btn--sm bvm-btn--primary"
                  onClick={() => onEdit(p.id)}
                >編集</button>
                <button
                  type="button"
                  className="bvm-btn bvm-btn--sm bvm-btn--danger"
                  onClick={() => handleDelete(p.id)}
                >削除</button>
              </div>
            </div>
          ))
        )}
      </div>
      {showAddForm ? (
        <div className="bvm-add-preset-form">
          <div className="bvm-form-row">
            <label className="bvm-label">プリセット名</label>
            <input
              ref={addInputRef}
              className="bvm-input"
              type="text"
              placeholder="プリセット名（例: 本番, 開発）"
              value={addingName}
              onChange={(e) => setAddingName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAdd(); }}
            />
          </div>
          <div className="bvm-form-actions">
            <button type="button" className="bvm-btn bvm-btn--primary" onClick={handleAdd}>追加</button>
            <button type="button" className="bvm-btn" onClick={() => { setShowAddForm(false); setAddingName(''); }}>キャンセル</button>
          </div>
        </div>
      ) : (
        <button type="button" className="bvm-add-btn" onClick={handleShowAdd}>＋ プリセットを追加</button>
      )}
    </div>
  );
}

// --------------------------------------------------
// プリセット編集エディタ
// --------------------------------------------------
function PresetEditor({
  preset,
  varNames,
  onSave,
  onBack,
}: {
  preset: BindVarPreset;
  varNames: string[];
  onSave: (updated: BindVarPreset) => Promise<void>;
  onBack: () => void;
}) {
  const [name, setName] = useState(preset.name);
  const [values, setValues] = useState<Record<string, string>>({ ...preset.values });

  const handleSave = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) { Toast.error('プリセット名を入力してください'); return; }
    const finalValues: Record<string, string> = {};
    for (const n of varNames) {
      finalValues[n] = (values[n] || '').trim();
    }
    await onSave({ ...preset, name: trimmed, values: finalValues });
    Toast.success('保存しました');
    onBack();
  }, [name, values, varNames, preset, onSave, onBack]);

  return (
    <div className="bvm-section bvm-section--full">
      <div className="bvm-editor-hd">
        <button type="button" className="bvm-back-btn" onClick={onBack}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="12" height="12">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          一覧に戻る
        </button>
        <h3 className="bvm-section-title">プリセット編集</h3>
      </div>
      <div className="bvm-form-row">
        <label className="bvm-label">プリセット名</label>
        <input
          className="bvm-input"
          type="text"
          value={name}
          placeholder="プリセット名"
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="bvm-vars-title">バインド変数の値</div>
      {varNames.length === 0 ? (
        <p className="bvm-empty">変数が定義されていません</p>
      ) : (
        varNames.map((n) => (
          <div key={n} className="bvm-form-row">
            <label className="bvm-label">
              <code className="bvm-var-badge">{`{${n}}`}</code>
            </label>
            <input
              className="bvm-input"
              type="text"
              value={values[n] ?? ''}
              placeholder={`${n} の値`}
              onChange={(e) => setValues((v) => ({ ...v, [n]: e.target.value }))}
            />
          </div>
        ))
      )}
      <div className="bvm-form-actions">
        <button type="button" className="bvm-btn bvm-btn--primary" onClick={handleSave}>保存</button>
        <button type="button" className="bvm-btn" onClick={onBack}>キャンセル</button>
      </div>
    </div>
  );
}

// --------------------------------------------------
// BindVarModal 本体
// --------------------------------------------------
export function BindVarModal({
  open,
  title = 'バインド変数設定',
  varNames: initialVarNames,
  presets: initialPresets,
  showBarConfig = false,
  uiType: initialUiType = 'tabs',
  barLabel: initialBarLabel = '',
  onAddVar,
  onRemoveVar,
  onSaveBarConfig,
  onAddPreset,
  onUpdatePreset,
  onDeletePreset,
  onMovePresetUp,
  onMovePresetDown,
  onChange,
  onClose,
}: BindVarModalProps) {
  const [varNames, setVarNames] = useState<string[]>(initialVarNames);
  const [presets, setPresets]   = useState<BindVarPreset[]>(initialPresets);
  const [editingPresetId, setEditingPresetId] = useState<number | null>(null);

  // props が変化したら内部状態を同期
  useEffect(() => {
    setVarNames(initialVarNames);
    setPresets(initialPresets);
  }, [initialVarNames, initialPresets]);

  // 開いたときに編集状態をリセット
  useEffect(() => {
    if (open) setEditingPresetId(null);
  }, [open]);

  // ESC で閉じる
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const handleAddVar = useCallback(async (name: string) => {
    await onAddVar(name);
    setVarNames((v) => [...v, name]);
    onChange();
  }, [onAddVar, onChange]);

  const handleRemoveVar = useCallback(async (name: string) => {
    await onRemoveVar(name);
    setVarNames((v) => v.filter((n) => n !== name));
    onChange();
  }, [onRemoveVar, onChange]);

  const handleSaveBarConfig = useCallback(async (cfg: { uiType: UiType; barLabel: string }) => {
    await onSaveBarConfig?.(cfg);
    onChange();
  }, [onSaveBarConfig, onChange]);

  const handleAddPreset = useCallback(async (name: string): Promise<BindVarPreset> => {
    const newPreset = await onAddPreset(name);
    setPresets((p) => [...p, newPreset]);
    onChange();
    return newPreset;
  }, [onAddPreset, onChange]);

  const handleUpdatePreset = useCallback(async (updated: BindVarPreset) => {
    await onUpdatePreset(updated);
    setPresets((ps) => ps.map((p) => p.id === updated.id ? updated : p));
    onChange();
  }, [onUpdatePreset, onChange]);

  const handleDeletePreset = useCallback(async (id: number) => {
    await onDeletePreset(id);
    setPresets((ps) => ps.filter((p) => p.id !== id));
    onChange();
  }, [onDeletePreset, onChange]);

  const handleMoveUp = useCallback(async (id: number) => {
    await onMovePresetUp(id);
    setPresets((ps) => {
      const idx = ps.findIndex((p) => p.id === id);
      if (idx <= 0) return ps;
      const next = [...ps];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }, [onMovePresetUp]);

  const handleMoveDown = useCallback(async (id: number) => {
    await onMovePresetDown(id);
    setPresets((ps) => {
      const idx = ps.findIndex((p) => p.id === id);
      if (idx < 0 || idx >= ps.length - 1) return ps;
      const next = [...ps];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }, [onMovePresetDown]);

  if (!open) return null;

  const editingPreset = editingPresetId !== null ? presets.find((p) => p.id === editingPresetId) : null;

  return createPortal(
    <div className="bvm-overlay" role="dialog" aria-modal="true">
      <div className="bvm-backdrop" onClick={onClose} />
      <div className="bvm-dialog">
        <div className="bvm-hd">
          <h2 className="bvm-title">{title}</h2>
          <button type="button" className="bvm-close" aria-label="閉じる" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="bvm-body">
          <div className="bvm-left">
            <VarSection
              varNames={varNames}
              onAdd={handleAddVar}
              onRemove={handleRemoveVar}
            />
            {showBarConfig && onSaveBarConfig && (
              <BarConfigSection
                uiType={initialUiType}
                barLabel={initialBarLabel}
                onSave={handleSaveBarConfig}
              />
            )}
          </div>
          <div className="bvm-right">
            {editingPreset ? (
              <PresetEditor
                preset={editingPreset}
                varNames={varNames}
                onSave={handleUpdatePreset}
                onBack={() => setEditingPresetId(null)}
              />
            ) : (
              <PresetList
                presets={presets}
                onEdit={(id) => setEditingPresetId(id)}
                onDelete={handleDeletePreset}
                onMoveUp={handleMoveUp}
                onMoveDown={handleMoveDown}
                onAdd={handleAddPreset}
              />
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
