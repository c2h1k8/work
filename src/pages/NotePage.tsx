// ==================================================
// NotePage — ノート管理（React 移行版）
// ==================================================

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useToast } from '../components/Toast';
import { noteDB, type NoteTask, type NoteField, type NoteEntry, type NoteFieldType, type NoteFieldWidth } from '../db/note_db';
import { activityDB } from '../db/activity_db';
import { Clipboard } from '../core/clipboard';

// ── localStorage キー ─────────────────────────────
const KEY_SORT         = 'note_sort';
const KEY_TITLE_LINES  = 'note_title_lines';
const KEY_FILTER       = 'note_filter';

// ── フィールドタイプ表示名 ────────────────────────
const FIELD_TYPE_LABELS: Record<NoteFieldType, string> = {
  link: 'リンク', text: 'テキスト', date: '日付',
  select: '単一ラベル', label: 'ラベル', dropdown: 'ドロップダウン',
  todo: 'TODOリンク', note_link: '関連ノート',
};

const WIDTH_OPTIONS: { value: NoteFieldWidth; label: string }[] = [
  { value: 'narrow', label: '狭' }, { value: 'auto', label: '自動' },
  { value: 'w3', label: '中小' }, { value: 'wide', label: '中' },
  { value: 'w5', label: '大' }, { value: 'full', label: '全幅' },
];

type SortKey = 'created_at-desc' | 'created_at-asc' | 'updated_at-desc' | 'updated_at-asc' | 'title-asc' | 'title-desc';

interface FieldOption { name: string; color: string; }
interface TodoLink { id: number; todo_task_id: number; note_task_id: number; }
interface KanbanTask { id: number; title: string; }

// ── kanban_db を非同期に開く ──────────────────────
async function openKanbanDB(): Promise<IDBDatabase | null> {
  return new Promise(resolve => {
    const req = indexedDB.open('kanban_db');
    req.onupgradeneeded = (e) => { (e as IDBVersionChangeEvent & { target: IDBOpenDBRequest }).target.transaction?.abort(); };
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror = () => resolve(null);
  });
}

// ── リンクエントリコンポーネント ─────────────────
function LinkEntry({ entry, onDelete, onCopy }: {
  entry: NoteEntry;
  onDelete: (id: number) => void;
  onCopy: (text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [eLabel, setELabel] = useState(entry.label);
  const [eValue, setEValue] = useState(entry.value);

  const display = entry.label || entry.value;

  if (editing) {
    return (
      <div className="flex flex-col gap-1.5 p-2 bg-[var(--c-bg-2)] rounded border border-[var(--c-border)]">
        <input type="text" value={eLabel} onChange={e => setELabel(e.target.value)} placeholder="表示名（省略可）"
          className="w-full px-2 py-1 text-xs rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-text)] outline-none focus:border-[var(--c-accent)]" />
        <input type="url" value={eValue} onChange={e => setEValue(e.target.value)} placeholder="URL"
          className="w-full px-2 py-1 text-xs rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-text)] outline-none focus:border-[var(--c-accent)]" />
        <div className="flex gap-1">
          <button onClick={() => { noteDB.updateEntry({ ...entry, label: eLabel, value: eValue }); setEditing(false); }}
            className="btn btn--primary btn--sm text-xs">保存</button>
          <button onClick={() => setEditing(false)} className="btn btn--ghost btn--sm text-xs">キャンセル</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 group py-0.5">
      <a href={entry.value} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-1 text-xs text-[var(--c-accent)] hover:underline min-w-0 flex-1 truncate">
        <svg viewBox="0 0 16 16" className="w-3 h-3 shrink-0" fill="currentColor">
          <path d="M3.75 2h3.5a.75.75 0 0 1 0 1.5h-3.5a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-3.5a.75.75 0 0 1 1.5 0v3.5A1.75 1.75 0 0 1 12.25 14h-8.5A1.75 1.75 0 0 1 2 12.25v-8.5C2 2.784 2.784 2 3.75 2Zm6.854-1h4.146a.25.25 0 0 1 .25.25v4.146a.25.25 0 0 1-.427.177L13.03 4.03 9.28 7.78a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042l3.75-3.75-1.543-1.543A.25.25 0 0 1 10.604 1Z"/>
        </svg>
        {display}
      </a>
      <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
        {entry.label && (
          <button onClick={() => onCopy(entry.label)} title="表示名をコピー"
            className="p-0.5 text-[var(--c-text-3)] hover:text-[var(--c-text)]">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"/><path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/></svg>
          </button>
        )}
        <button onClick={() => onCopy(entry.value)} title="URLをコピー"
          className="p-0.5 text-[var(--c-text-3)] hover:text-[var(--c-text)]">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"/><path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/></svg>
        </button>
        <button onClick={() => setEditing(true)} title="編集"
          className="p-0.5 text-[var(--c-text-3)] hover:text-[var(--c-text)]">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor"><path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064Zm1.238-3.763a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354Z"/></svg>
        </button>
        <button onClick={() => onDelete(entry.id!)} title="削除"
          className="p-0.5 text-[var(--c-text-3)] hover:text-red-400">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor"><path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/></svg>
        </button>
      </div>
    </div>
  );
}

// ── フィールド値表示コンポーネント ────────────────
function FieldView({
  field, entries, allTasks,
  onEntriesChange,
}: {
  field: NoteField;
  entries: NoteEntry[];
  allTasks: NoteTask[];
  onEntriesChange: () => void;
}) {
  const { success } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [formLabel, setFormLabel] = useState('');
  const [formValue, setFormValue] = useState('');
  const [todoLinks, setTodoLinks] = useState<{ linkId: number; taskId: number; title: string }[]>([]);
  const [noteLinks, setNoteLinks] = useState<{ linkId: number; linkedId: number; title: string }[]>([]);
  const [showTodoPicker, setShowTodoPicker] = useState(false);
  const [showNotePicker, setShowNotePicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [todoPickerItems, setTodoPickerItems] = useState<KanbanTask[]>([]);
  const textTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opts = (field.options || []) as FieldOption[];

  // タスクID (entries から親タスクIDを取得)
  const taskId = entries[0]?.task_id;

  // TODO リンク読み込み
  useEffect(() => {
    if (field.type !== 'todo' || !taskId) return;
    (async () => {
      const db = await openKanbanDB();
      if (!db) return;
      try {
        const links: TodoLink[] = await new Promise(resolve => {
          try {
            const req = db.transaction('note_links').objectStore('note_links').index('note_task_id').getAll(taskId);
            req.onsuccess = (e) => resolve((e.target as IDBRequest).result);
            req.onerror = () => resolve([]);
          } catch { resolve([]); }
        });
        if (links.length === 0) { db.close(); return; }
        const kTasks: KanbanTask[] = await new Promise((res, rej) => {
          const req = db.transaction('tasks').objectStore('tasks').getAll();
          req.onsuccess = (e) => res((e.target as IDBRequest).result);
          req.onerror = (e) => rej(e);
        });
        db.close();
        const taskMap = new Map(kTasks.map(t => [t.id, t]));
        setTodoLinks(links.map(l => ({ linkId: l.id, taskId: l.todo_task_id, title: taskMap.get(l.todo_task_id)?.title ?? `(ID:${l.todo_task_id})` })));
      } catch { db.close(); }
    })();
  }, [field.type, taskId]);

  // 関連ノートリンク読み込み
  useEffect(() => {
    if (field.type !== 'note_link' || !taskId) return;
    (async () => {
      const links = await noteDB.getNoteLinks(taskId);
      const taskMap = new Map(allTasks.map(t => [t.id!, t]));
      setNoteLinks(links.map(l => {
        const linkedId = l.from_task_id === taskId ? l.to_task_id : l.from_task_id;
        return { linkId: l.id!, linkedId, title: taskMap.get(linkedId)?.title ?? `(ID:${linkedId})` };
      }));
    })();
  }, [field.type, taskId, allTasks]);

  const copyText = (text: string) => {
    Clipboard.copy(text).then(() => success('コピーしました'));
  };

  const deleteLinkEntry = async (entryId: number) => {
    await noteDB.deleteEntry(entryId);
    onEntriesChange();
  };

  const addLinkEntry = async () => {
    if (!formValue.trim() || !taskId) return;
    await noteDB.addEntry(taskId, field.id!, formLabel.trim(), formValue.trim());
    setFormLabel(''); setFormValue(''); setShowForm(false);
    onEntriesChange();
  };

  const saveText = useCallback((value: string, entryId: number | null) => {
    if (textTimer.current) clearTimeout(textTimer.current);
    textTimer.current = setTimeout(async () => {
      if (!taskId) return;
      if (entryId) {
        const e = entries.find(x => x.id === entryId);
        if (e) await noteDB.updateEntry({ ...e, value });
      } else {
        await noteDB.addEntry(taskId, field.id!, '', value);
      }
      onEntriesChange();
    }, 600);
  }, [taskId, field.id, entries, onEntriesChange]);

  const saveDate = async (dateStr: string) => {
    if (!taskId) return;
    const entry = entries[0];
    if (entry) {
      if (dateStr) await noteDB.updateEntry({ ...entry, value: dateStr });
      else await noteDB.deleteEntry(entry.id!);
    } else if (dateStr) {
      await noteDB.addEntry(taskId, field.id!, '', dateStr);
    }
    onEntriesChange();
  };

  const toggleSelect = async (optName: string) => {
    if (!taskId) return;
    const entry = entries[0];
    const newVal = entry?.value === optName ? '' : optName;
    if (entry) await noteDB.updateEntry({ ...entry, value: newVal });
    else if (newVal) await noteDB.addEntry(taskId, field.id!, '', newVal);
    onEntriesChange();
  };

  const toggleLabel = async (optName: string) => {
    if (!taskId) return;
    const entry = entries[0];
    let labels: string[] = [];
    if (entry) { try { labels = JSON.parse(entry.value); } catch { labels = []; } }
    const idx = labels.indexOf(optName);
    if (idx >= 0) labels.splice(idx, 1); else labels.push(optName);
    const newVal = JSON.stringify(labels);
    if (entry) await noteDB.updateEntry({ ...entry, value: newVal });
    else await noteDB.addEntry(taskId, field.id!, '', newVal);
    onEntriesChange();
  };

  const saveDropdown = async (value: string) => {
    if (!taskId) return;
    const entry = entries[0];
    if (entry) await noteDB.updateEntry({ ...entry, value });
    else if (value) await noteDB.addEntry(taskId, field.id!, '', value);
    else return;
    onEntriesChange();
  };

  const removeTodoLink = async (linkId: number) => {
    const db = await openKanbanDB();
    if (!db) return;
    try {
      await new Promise<void>((res, rej) => {
        const req = db.transaction('note_links', 'readwrite').objectStore('note_links').delete(linkId);
        req.onsuccess = () => res();
        req.onerror = (e) => rej(e);
      });
      db.close();
      setTodoLinks(prev => prev.filter(l => l.linkId !== linkId));
    } catch { db.close(); }
  };

  const removeNoteLink = async (linkId: number) => {
    await noteDB.deleteNoteLink(linkId);
    setNoteLinks(prev => prev.filter(l => l.linkId !== linkId));
  };

  const openTodoPicker = async () => {
    const db = await openKanbanDB();
    if (!db) return;
    const kTasks: KanbanTask[] = await new Promise((res, rej) => {
      const req = db.transaction('tasks').objectStore('tasks').getAll();
      req.onsuccess = (e) => res((e.target as IDBRequest).result);
      req.onerror = (e) => rej(e);
    });
    db.close();
    const linkedIds = new Set(todoLinks.map(l => l.taskId));
    setTodoPickerItems(kTasks.filter(t => !linkedIds.has(t.id)));
    setPickerSearch('');
    setShowTodoPicker(true);
  };

  const selectTodoTask = async (kTask: KanbanTask) => {
    if (!taskId) return;
    const db = await openKanbanDB();
    if (!db) return;
    try {
      const id: number = await new Promise((res, rej) => {
        const req = db.transaction('note_links', 'readwrite').objectStore('note_links').add({ todo_task_id: kTask.id, note_task_id: taskId });
        req.onsuccess = (e) => res((e.target as IDBRequest).result as number);
        req.onerror = (e) => rej(e);
      });
      db.close();
      setTodoLinks(prev => [...prev, { linkId: id, taskId: kTask.id, title: kTask.title }]);
    } catch { db.close(); }
    setShowTodoPicker(false);
  };

  const openNotePicker = () => {
    setPickerSearch('');
    setShowNotePicker(true);
  };

  const selectNoteLink = async (target: NoteTask) => {
    if (!taskId || !target.id) return;
    await noteDB.addNoteLink(taskId, target.id);
    const taskMap = new Map(allTasks.map(t => [t.id!, t]));
    setNoteLinks(prev => [...prev, { linkId: Date.now(), linkedId: target.id!, title: taskMap.get(target.id!)?.title ?? '' }]);
    setShowNotePicker(false);
  };

  // ── レンダリング ──────────────────────────────
  if (field.type === 'todo') {
    const filtered = todoPickerItems.filter(t => t.title.toLowerCase().includes(pickerSearch.toLowerCase()));
    return (
      <div>
        <div className="flex items-center gap-2 mb-1">
          <button onClick={openTodoPicker} className="text-xs text-[var(--c-accent)] hover:underline">＋ 追加</button>
        </div>
        {todoLinks.map(l => (
          <div key={l.linkId} className="flex items-center gap-1 py-0.5">
            <span className="text-xs flex-1 truncate text-[var(--c-text-2)]">{l.title}</span>
            <button onClick={() => removeTodoLink(l.linkId)} className="text-[var(--c-text-3)] hover:text-red-400 text-xs">×</button>
          </div>
        ))}
        {showTodoPicker && (
          <div className="mt-1 border border-[var(--c-border)] rounded bg-[var(--c-bg)] shadow-lg z-20">
            <input autoFocus type="text" value={pickerSearch} onChange={e => setPickerSearch(e.target.value)}
              placeholder="検索..." className="w-full px-2 py-1 text-xs border-b border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-text)] outline-none" />
            <div className="max-h-32 overflow-auto">
              {filtered.length === 0
                ? <p className="px-2 py-1 text-xs text-[var(--c-text-3)]">候補がありません</p>
                : filtered.map(t => (
                  <div key={t.id} onClick={() => selectTodoTask(t)}
                    className="px-2 py-1 text-xs hover:bg-[var(--c-bg-2)] cursor-pointer">{t.title}</div>
                ))
              }
            </div>
            <button onClick={() => setShowTodoPicker(false)} className="w-full text-xs text-[var(--c-text-3)] py-1 hover:bg-[var(--c-bg-2)]">閉じる</button>
          </div>
        )}
      </div>
    );
  }

  if (field.type === 'note_link') {
    const filtered = allTasks.filter(t => t.id !== taskId && t.title.toLowerCase().includes(pickerSearch.toLowerCase()));
    return (
      <div>
        <div className="flex items-center gap-2 mb-1">
          <button onClick={openNotePicker} className="text-xs text-[var(--c-accent)] hover:underline">＋ 追加</button>
        </div>
        {noteLinks.map(l => (
          <div key={l.linkId} className="flex items-center gap-1 py-0.5">
            <span className="text-xs flex-1 truncate text-[var(--c-accent)] hover:underline cursor-pointer">{l.title}</span>
            <button onClick={() => removeNoteLink(l.linkId)} className="text-[var(--c-text-3)] hover:text-red-400 text-xs">×</button>
          </div>
        ))}
        {showNotePicker && (
          <div className="mt-1 border border-[var(--c-border)] rounded bg-[var(--c-bg)] shadow-lg z-20">
            <input autoFocus type="text" value={pickerSearch} onChange={e => setPickerSearch(e.target.value)}
              placeholder="検索..." className="w-full px-2 py-1 text-xs border-b border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-text)] outline-none" />
            <div className="max-h-32 overflow-auto">
              {filtered.length === 0
                ? <p className="px-2 py-1 text-xs text-[var(--c-text-3)]">候補がありません</p>
                : filtered.map(t => (
                  <div key={t.id} onClick={() => selectNoteLink(t)}
                    className="px-2 py-1 text-xs hover:bg-[var(--c-bg-2)] cursor-pointer">{t.title}</div>
                ))
              }
            </div>
            <button onClick={() => setShowNotePicker(false)} className="w-full text-xs text-[var(--c-text-3)] py-1 hover:bg-[var(--c-bg-2)]">閉じる</button>
          </div>
        )}
      </div>
    );
  }

  if (field.type === 'link') {
    const sorted = [...entries].sort((a, b) => (a.label || a.value).localeCompare(b.label || b.value, 'ja'));
    return (
      <div>
        {sorted.map(e => (
          <LinkEntry key={e.id} entry={e} onDelete={deleteLinkEntry} onCopy={copyText} />
        ))}
        {showForm ? (
          <div className="flex flex-col gap-1.5 mt-1 p-2 bg-[var(--c-bg-2)] rounded border border-[var(--c-border)]">
            <input type="text" value={formLabel} onChange={e => setFormLabel(e.target.value)} placeholder="表示名（省略可）"
              className="w-full px-2 py-1 text-xs rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-text)] outline-none focus:border-[var(--c-accent)]" />
            <input type="url" value={formValue} onChange={e => setFormValue(e.target.value)} placeholder="URL"
              className="w-full px-2 py-1 text-xs rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-text)] outline-none focus:border-[var(--c-accent)]"
              onKeyDown={e => { if (e.key === 'Enter') addLinkEntry(); }} />
            <div className="flex gap-1">
              <button onClick={addLinkEntry} className="btn btn--primary btn--sm text-xs">追加</button>
              <button onClick={() => { setShowForm(false); setFormLabel(''); setFormValue(''); }} className="btn btn--ghost btn--sm text-xs">キャンセル</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowForm(true)} className="text-xs text-[var(--c-accent)] hover:underline mt-0.5">＋ 追加</button>
        )}
      </div>
    );
  }

  if (field.type === 'text') {
    const entry = entries[0] ?? null;
    return (
      <textarea
        defaultValue={entry?.value ?? ''}
        onChange={e => saveText(e.target.value, entry?.id ?? null)}
        rows={3}
        placeholder="テキストを入力..."
        className="w-full px-3 py-2 text-xs rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-text)] resize-y outline-none focus:border-[var(--c-accent)]"
      />
    );
  }

  if (field.type === 'date') {
    const entry = entries[0] ?? null;
    return (
      <input
        type="date"
        value={entry?.value ?? ''}
        onChange={e => saveDate(e.target.value)}
        className="px-2 py-1 text-xs rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-text)] outline-none focus:border-[var(--c-accent)] cursor-pointer"
      />
    );
  }

  if (field.type === 'select') {
    if (opts.length === 0) return <p className="text-xs text-[var(--c-text-3)]">選択肢が設定されていません</p>;
    const currentValue = entries[0]?.value ?? '';
    return (
      <div className="flex flex-wrap gap-1">
        {opts.map(opt => {
          const isActive = opt.name === currentValue;
          return (
            <button key={opt.name} onClick={() => toggleSelect(opt.name)}
              className="px-2 py-0.5 rounded-full text-xs font-medium border transition-colors"
              style={isActive
                ? { background: opt.color, borderColor: opt.color, color: '#fff' }
                : { background: `${opt.color}22`, borderColor: `${opt.color}66`, color: opt.color }
              }>{opt.name}</button>
          );
        })}
      </div>
    );
  }

  if (field.type === 'label') {
    if (opts.length === 0) return <p className="text-xs text-[var(--c-text-3)]">選択肢が設定されていません</p>;
    let selectedLabels: string[] = [];
    try { selectedLabels = JSON.parse(entries[0]?.value ?? '[]'); } catch { selectedLabels = []; }
    return (
      <div className="flex flex-wrap gap-1">
        {opts.map(opt => {
          const isActive = selectedLabels.includes(opt.name);
          return (
            <button key={opt.name} onClick={() => toggleLabel(opt.name)}
              className="px-2 py-0.5 rounded-full text-xs font-medium border transition-colors"
              style={isActive
                ? { background: opt.color, borderColor: opt.color, color: '#fff' }
                : { background: `${opt.color}22`, borderColor: `${opt.color}66`, color: opt.color }
              }>{opt.name}</button>
          );
        })}
      </div>
    );
  }

  if (field.type === 'dropdown') {
    if (opts.length === 0) return <p className="text-xs text-[var(--c-text-3)]">選択肢が設定されていません</p>;
    const currentValue = entries[0]?.value ?? '';
    return (
      <select value={currentValue} onChange={e => saveDropdown(e.target.value)}
        className="px-2 py-1 text-xs rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-text)] outline-none focus:border-[var(--c-accent)]">
        <option value="">（未選択）</option>
        {opts.map(opt => <option key={opt.name} value={opt.name}>{opt.name}</option>)}
      </select>
    );
  }

  return null;
}

// ── フィールド管理モーダル ────────────────────────
function FieldModal({
  fields,
  onClose,
  onChanged,
}: {
  fields: NoteField[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [localFields, setLocalFields] = useState(fields);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<NoteFieldType>('link');
  const [editingOptions, setEditingOptions] = useState<Record<number, string>>({});
  const [optionInputs, setOptionInputs] = useState<Record<number, string>>({});

  const reload = async () => {
    const f = await noteDB.getAllFields();
    setLocalFields(f);
    onChanged();
  };

  const addField = async () => {
    if (!newName.trim()) return;
    await noteDB.addField(newName.trim(), newType);
    setNewName('');
    await reload();
  };

  const deleteField = async (id: number) => {
    if (!confirm('このフィールドを削除しますか？関連するエントリもすべて削除されます。')) return;
    await noteDB.deleteField(id);
    await reload();
  };

  const updateWidth = async (field: NoteField, width: NoteFieldWidth) => {
    await noteDB.updateField({ ...field, width });
    await reload();
  };

  const updateListVisible = async (field: NoteField, v: boolean) => {
    await noteDB.updateField({ ...field, listVisible: v });
    await reload();
  };

  const updateVisible = async (field: NoteField, v: boolean) => {
    await noteDB.updateField({ ...field, visible: v });
    await reload();
  };

  const moveField = async (idx: number, dir: -1 | 1) => {
    const arr = [...localFields];
    const other = arr[idx + dir];
    if (!other) return;
    [arr[idx].position, other.position] = [other.position, arr[idx].position];
    await Promise.all([noteDB.updateField(arr[idx]), noteDB.updateField(other)]);
    await reload();
  };

  const addOption = async (field: NoteField) => {
    const name = (optionInputs[field.id!] ?? '').trim();
    if (!name) return;
    const opts = (field.options as FieldOption[]) ?? [];
    const colors = ['#8957e5','#1f6feb','#2da44e','#e16b2d','#d4325e','#7c8591'];
    const color = colors[opts.length % colors.length];
    await noteDB.updateField({ ...field, options: [...opts, { name, color }] });
    setOptionInputs(p => ({ ...p, [field.id!]: '' }));
    await reload();
  };

  const removeOption = async (field: NoteField, name: string) => {
    const opts = (field.options as FieldOption[]).filter(o => o.name !== name);
    await noteDB.updateField({ ...field, options: opts });
    await reload();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[var(--c-bg)] border border-[var(--c-border)] rounded-xl shadow-xl w-[560px] max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--c-border)]">
          <h2 className="font-semibold text-sm">フィールド管理</h2>
          <button onClick={onClose} className="text-[var(--c-text-3)] hover:text-[var(--c-text)]">✕</button>
        </div>
        <div className="flex-1 overflow-auto p-4 flex flex-col gap-3">
          {localFields.length === 0 && <p className="text-xs text-[var(--c-text-3)]">フィールドがありません</p>}
          {localFields.map((f, i) => {
            const hasOptions = f.type === 'select' || f.type === 'label' || f.type === 'dropdown';
            const isSpecial = f.type === 'todo' || f.type === 'note_link';
            return (
              <div key={f.id} className="border border-[var(--c-border)] rounded-lg p-3 flex flex-col gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <div className="flex flex-col gap-0.5">
                    <button onClick={() => moveField(i, -1)} disabled={i === 0} className="text-[var(--c-text-3)] hover:text-[var(--c-text)] disabled:opacity-30 text-[10px] leading-none">▲</button>
                    <button onClick={() => moveField(i, 1)} disabled={i === localFields.length - 1} className="text-[var(--c-text-3)] hover:text-[var(--c-text)] disabled:opacity-30 text-[10px] leading-none">▼</button>
                  </div>
                  <span className="font-medium flex-1">{f.name}</span>
                  <span className="text-[var(--c-text-3)] text-[10px] bg-[var(--c-bg-2)] px-1.5 py-0.5 rounded">{FIELD_TYPE_LABELS[f.type]}</span>
                  <button onClick={() => deleteField(f.id!)} className="text-red-400 hover:text-red-300 text-[10px]">削除</button>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  {!isSpecial && (
                    <>
                      <label className="flex items-center gap-1 text-[var(--c-text-2)]">
                        一覧表示
                        <input type="checkbox" checked={f.listVisible} onChange={e => updateListVisible(f, e.target.checked)} className="accent-[var(--c-accent)]" />
                      </label>
                      <label className="flex items-center gap-1 text-[var(--c-text-2)]">
                        幅
                        <select value={f.width} onChange={e => updateWidth(f, e.target.value as NoteFieldWidth)}
                          className="text-xs bg-[var(--c-bg)] border border-[var(--c-border)] rounded px-1 text-[var(--c-text)]">
                          {WIDTH_OPTIONS.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
                        </select>
                      </label>
                    </>
                  )}
                  {isSpecial && (
                    <label className="flex items-center gap-1 text-[var(--c-text-2)]">
                      表示
                      <input type="checkbox" checked={f.visible !== false} onChange={e => updateVisible(f, e.target.checked)} className="accent-[var(--c-accent)]" />
                    </label>
                  )}
                </div>
                {hasOptions && (
                  <div>
                    <div className="flex flex-wrap gap-1 mb-1">
                      {(f.options as FieldOption[]).map(o => (
                        <span key={o.name} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium"
                          style={{ background: `${o.color}22`, color: o.color, border: `1px solid ${o.color}66` }}>
                          {o.name}
                          <button onClick={() => removeOption(f, o.name)} className="ml-0.5 opacity-60 hover:opacity-100">×</button>
                        </span>
                      ))}
                    </div>
                    {editingOptions[f.id!] !== undefined ? (
                      <div className="flex gap-1">
                        <input type="text" value={optionInputs[f.id!] ?? ''} onChange={e => setOptionInputs(p => ({ ...p, [f.id!]: e.target.value }))}
                          placeholder="選択肢名" autoFocus
                          className="flex-1 px-1.5 py-0.5 text-xs border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-text)] rounded outline-none"
                          onKeyDown={e => { if (e.key === 'Enter') addOption(f); if (e.key === 'Escape') setEditingOptions(p => { const n = {...p}; delete n[f.id!]; return n; }); }} />
                        <button onClick={() => addOption(f)} className="btn btn--primary btn--sm text-[10px]">追加</button>
                        <button onClick={() => setEditingOptions(p => { const n = {...p}; delete n[f.id!]; return n; })} className="btn btn--ghost btn--sm text-[10px]">閉</button>
                      </div>
                    ) : (
                      <button onClick={() => setEditingOptions(p => ({ ...p, [f.id!]: '' }))}
                        className="text-[10px] text-[var(--c-accent)] hover:underline">＋ 選択肢追加</button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {/* 新規フィールド追加フォーム */}
        <div className="border-t border-[var(--c-border)] px-4 py-3 flex gap-2 items-end">
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-[10px] text-[var(--c-text-3)]">フィールド名</label>
            <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="名前"
              className="px-2 py-1 text-xs rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-text)] outline-none focus:border-[var(--c-accent)]"
              onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addField(); }} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-[var(--c-text-3)]">種類</label>
            <select value={newType} onChange={e => setNewType(e.target.value as NoteFieldType)}
              className="px-2 py-1 text-xs rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-text)]">
              {Object.entries(FIELD_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <button onClick={addField} className="btn btn--primary btn--sm text-xs shrink-0">追加</button>
        </div>
      </div>
    </div>
  );
}

// ── メインコンポーネント ──────────────────────────
export function NotePage() {
  const { success: showSuccess, error: showError } = useToast();

  const [tasks, setTasks] = useState<NoteTask[]>([]);
  const [fields, setFields] = useState<NoteField[]>([]);
  const [allEntries, setAllEntries] = useState<NoteEntry[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [taskEntries, setTaskEntries] = useState<NoteEntry[]>([]);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>(() => (localStorage.getItem(KEY_SORT) as SortKey) ?? 'created_at-desc');
  const [titleLines, setTitleLines] = useState<number>(() => Number(localStorage.getItem(KEY_TITLE_LINES) ?? '1'));
  const [listFilter, setListFilter] = useState<Record<number, Set<string>>>(() => {
    try {
      const raw = localStorage.getItem(KEY_FILTER);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      const result: Record<number, Set<string>> = {};
      for (const [k, v] of Object.entries(parsed)) {
        const e = v as { type: string; values: string[] };
        if (e.type === 'set') result[Number(k)] = new Set(e.values);
      }
      return result;
    } catch { return {}; }
  });
  const [filterOpen, setFilterOpen] = useState(false);
  const [showFieldModal, setShowFieldModal] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<Array<{ field: NoteField | undefined; old_value: string; new_value: string; changed_at: number }>>([]);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // ── データ読み込み ────────────────────────────────
  const loadAll = useCallback(async () => {
    const [t, f, e] = await Promise.all([noteDB.getAllTasks(), noteDB.getAllFields(), noteDB.getAllEntries()]);
    await noteDB.initDefaultFields();
    const f2 = f.length > 0 ? f : await noteDB.getAllFields();
    setTasks(t);
    setFields(f2);
    setAllEntries(e);
  }, []);

  const loadTaskEntries = useCallback(async (taskId: number) => {
    const e = await noteDB.getEntriesByTask(taskId);
    setTaskEntries(e);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    if (selectedTaskId) loadTaskEntries(selectedTaskId);
    else setTaskEntries([]);
  }, [selectedTaskId, loadTaskEntries]);

  // ── フィルター永続化 ──────────────────────────────
  const saveFilter = useCallback((f: Record<number, Set<string>>) => {
    const serialized: Record<number, { type: string; values: string[] }> = {};
    for (const [key, val] of Object.entries(f)) {
      if (val.size > 0) serialized[Number(key)] = { type: 'set', values: [...val] };
    }
    localStorage.setItem(KEY_FILTER, JSON.stringify(serialized));
  }, []);

  // ── ソート・フィルター適用 ────────────────────────
  const visibleTasks = useMemo(() => {
    const [sortField, sortDir] = sort.split('-') as [string, string];
    let result = [...tasks].sort((a, b) => {
      const va = sortField === 'title' ? a.title.toLowerCase() : ((a as unknown as Record<string, unknown>)[sortField] as number) ?? 0;
      const vb = sortField === 'title' ? b.title.toLowerCase() : ((b as unknown as Record<string, unknown>)[sortField] as number) ?? 0;
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(t => {
        if (t.title.toLowerCase().includes(q)) return true;
        return allEntries.some(e => {
          if (e.task_id !== t.id) return false;
          const f = fields.find(ff => ff.id === e.field_id);
          if (!f) return false;
          if (f.type === 'link') return (e.label?.toLowerCase().includes(q)) || (e.value?.toLowerCase().includes(q));
          if (f.type === 'text') return e.value?.toLowerCase().includes(q);
          return false;
        });
      });
    }

    for (const [fieldIdStr, filterSet] of Object.entries(listFilter)) {
      if (filterSet.size === 0) continue;
      const fieldId = Number(fieldIdStr);
      const field = fields.find(f => f.id === fieldId);
      if (!field) continue;
      if (field.type === 'select' || field.type === 'dropdown') {
        result = result.filter(t => allEntries.some(e => e.task_id === t.id && e.field_id === fieldId && filterSet.has(e.value)));
      } else if (field.type === 'label') {
        result = result.filter(t => {
          const e = allEntries.find(e => e.task_id === t.id && e.field_id === fieldId);
          if (!e) return false;
          try { const labels = JSON.parse(e.value); return [...filterSet].some(v => labels.includes(v)); }
          catch { return false; }
        });
      }
    }

    return result;
  }, [tasks, search, sort, allEntries, fields, listFilter]);

  const filterFields = useMemo(() => fields.filter(f => f.listVisible && (f.type === 'select' || f.type === 'label' || f.type === 'dropdown')), [fields]);
  const totalActiveFilters = useMemo(() => Object.values(listFilter).reduce((s, set) => s + set.size, 0), [listFilter]);

  const selectedTask = tasks.find(t => t.id === selectedTaskId);

  // ── タスク操作 ────────────────────────────────────
  const addTask = async () => {
    const title = window.prompt('タスクのタイトルを入力してください');
    if (!title?.trim()) return;
    const task = await noteDB.addTask(title.trim());
    setTasks(prev => [...prev, task]);
    setSelectedTaskId(task.id!);
    activityDB.add({ page: 'note', action: 'create', target_type: 'note', target_id: String(task.id), summary: `ノート「${task.title}」を追加`, created_at: new Date().toISOString() });
  };

  const deleteTask = async () => {
    if (!selectedTaskId || !selectedTask) return;
    if (!confirm(`「${selectedTask.title}」を削除しますか？`)) return;
    activityDB.add({ page: 'note', action: 'delete', target_type: 'note', target_id: String(selectedTaskId), summary: `ノート「${selectedTask.title}」を削除`, created_at: new Date().toISOString() });
    await noteDB.deleteTask(selectedTaskId);
    setTasks(prev => prev.filter(t => t.id !== selectedTaskId));
    setSelectedTaskId(null);
    setTaskEntries([]);
    await loadAll();
  };

  const startEditTitle = () => {
    if (!selectedTask) return;
    setTitleInput(selectedTask.title);
    setEditingTitle(true);
    setTimeout(() => titleInputRef.current?.focus(), 50);
  };

  const commitTitle = async () => {
    if (!selectedTask) return;
    const newTitle = titleInput.trim() || selectedTask.title;
    setEditingTitle(false);
    if (newTitle !== selectedTask.title) {
      const updated = await noteDB.updateTask({ ...selectedTask, title: newTitle });
      setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
      activityDB.add({ page: 'note', action: 'update', target_type: 'note', target_id: String(selectedTask.id), summary: `ノート「${selectedTask.title}」のタイトルを変更`, created_at: new Date().toISOString() });
    }
  };

  // ── エントリ再読み込み ────────────────────────────
  const refreshEntries = useCallback(async () => {
    const [e, all] = await Promise.all([
      selectedTaskId ? noteDB.getEntriesByTask(selectedTaskId) : Promise.resolve([]),
      noteDB.getAllEntries(),
    ]);
    setTaskEntries(e);
    setAllEntries(all);
  }, [selectedTaskId]);

  // ── フィルター操作 ────────────────────────────────
  const toggleFilterChip = (fieldId: number, value: string) => {
    setListFilter(prev => {
      const next = { ...prev };
      if (!next[fieldId]) next[fieldId] = new Set();
      else next[fieldId] = new Set(prev[fieldId]);
      if (next[fieldId].has(value)) {
        next[fieldId].delete(value);
        if (next[fieldId].size === 0) delete next[fieldId];
      } else {
        next[fieldId].add(value);
      }
      saveFilter(next);
      return next;
    });
  };

  const clearFilterChip = (fieldId: number, value: string) => {
    setListFilter(prev => {
      const next = { ...prev };
      if (next[fieldId]) {
        next[fieldId] = new Set(prev[fieldId]);
        next[fieldId].delete(value);
        if (next[fieldId].size === 0) delete next[fieldId];
      }
      saveFilter(next);
      return next;
    });
  };

  // ── エクスポート / インポート ─────────────────────
  const exportData = async () => {
    const data = await noteDB.exportData();
    const json = JSON.stringify(data, null, 2);
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = `note_export_${ts}.json`;
    a.click();
    showSuccess('エクスポートしました');
  };

  const importData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await noteDB.importData(data);
      await loadAll();
      setSelectedTaskId(null);
      showSuccess('インポートしました');
    } catch (err) {
      showError('インポートに失敗しました: ' + (err as Error).message);
    }
    e.target.value = '';
  };

  // ── 変更履歴 ──────────────────────────────────────
  const openHistory = async () => {
    if (!selectedTaskId) return;
    const h = await noteDB.getHistory(selectedTaskId);
    setHistory(h.map(r => ({ field: fields.find(f => f.id === r.field_id), old_value: r.old_value, new_value: r.new_value, changed_at: r.changed_at })));
    setShowHistory(true);
  };

  // ── フィールドリストバッジ ────────────────────────
  const renderBadge = (field: NoteField, taskId: number) => {
    const opts = (field.options as FieldOption[]) ?? [];
    const entries = allEntries.filter(e => e.task_id === taskId && e.field_id === field.id);
    const entry = entries[0] ?? null;
    if (field.type === 'select' || field.type === 'dropdown') {
      if (!entry?.value) return null;
      const opt = opts.find(o => o.name === entry.value);
      const color = opt?.color;
      return <span key={field.id} className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
        style={color ? { background: `${color}22`, color, border: `1px solid ${color}55` } : { background: 'var(--c-bg-2)', color: 'var(--c-text-2)' }}>{entry.value}</span>;
    }
    if (field.type === 'label') {
      try {
        const labels: string[] = JSON.parse(entry?.value ?? '[]');
        return <React.Fragment key={field.id}>{labels.map(name => {
          const opt = opts.find(o => o.name === name);
          const color = opt?.color ?? '#8957e5';
          return <span key={name} className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
            style={{ background: `${color}22`, color, border: `1px solid ${color}55` }}>{name}</span>;
        })}</React.Fragment>;
      } catch { return null; }
    }
    if (field.type === 'date') {
      if (!entry?.value) return null;
      return <span key={field.id} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--c-bg-2)] text-[var(--c-text-2)]">{entry.value.replace(/-/g, '/')}</span>;
    }
    if (field.type === 'link') {
      if (entries.length === 0) return null;
      return <span key={field.id} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--c-bg-2)] text-[var(--c-text-2)]">{field.name}: {entries.length}件</span>;
    }
    if (field.type === 'text') {
      if (!entry?.value) return null;
      const trunc = entry.value.length > 20 ? entry.value.slice(0, 20) + '…' : entry.value;
      return <span key={field.id} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--c-bg-2)] text-[var(--c-text-2)]" title={entry.value}>{trunc}</span>;
    }
    return null;
  };

  const visibleFields = fields.filter(f => f.listVisible);
  const detailFields = fields.filter(f => f.type !== 'todo' && f.type !== 'note_link' ? true : f.visible !== false);

  return (
    <div className="flex h-full overflow-hidden">
      {/* サイドバー */}
      <div className="w-64 flex flex-col shrink-0 border-r border-[var(--c-border)]">
        {/* サイドバーヘッダー */}
        <div className="px-3 py-2 border-b border-[var(--c-border)] flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="検索..."
            className="flex-1 min-w-0 px-2 py-1 text-xs rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-text)] outline-none focus:border-[var(--c-accent)]"
          />
          <select value={sort} onChange={e => { setSort(e.target.value as SortKey); localStorage.setItem(KEY_SORT, e.target.value); }}
            className="text-xs bg-[var(--c-bg)] border border-[var(--c-border)] rounded px-1 text-[var(--c-text)] outline-none">
            <option value="created_at-desc">作成↓</option>
            <option value="created_at-asc">作成↑</option>
            <option value="updated_at-desc">更新↓</option>
            <option value="updated_at-asc">更新↑</option>
            <option value="title-asc">名前↑</option>
            <option value="title-desc">名前↓</option>
          </select>
        </div>

        {/* タイトル行数 */}
        <div className="px-3 py-1.5 border-b border-[var(--c-border)] flex items-center gap-1">
          {[{lines: 1, label: '1行'}, {lines: 2, label: '2行'}, {lines: 0, label: '全'}].map(item => (
            <button key={item.lines} onClick={() => { setTitleLines(item.lines); localStorage.setItem(KEY_TITLE_LINES, String(item.lines)); }}
              className={`text-[10px] px-2 py-0.5 rounded ${titleLines === item.lines ? 'bg-[var(--c-accent)] text-white' : 'text-[var(--c-text-2)] hover:bg-[var(--c-bg-2)]'}`}>
              {item.label}
            </button>
          ))}
        </div>

        {/* フィルター */}
        {filterFields.length > 0 && (
          <div className="px-3 py-1.5 border-b border-[var(--c-border)]">
            <button onClick={() => setFilterOpen(p => !p)}
              className={`flex items-center gap-1 text-xs px-2 py-1 rounded ${filterOpen ? 'bg-[var(--c-accent)]/20 text-[var(--c-accent)]' : 'text-[var(--c-text-2)] hover:bg-[var(--c-bg-2)]'}`}>
              <svg viewBox="0 0 16 16" className="w-3 h-3" fill="currentColor"><path d="M.75 3h14.5a.75.75 0 0 0 0-1.5H.75a.75.75 0 0 0 0 1.5ZM3 7.75A.75.75 0 0 1 3.75 7h8.5a.75.75 0 0 1 0 1.5h-8.5A.75.75 0 0 1 3 7.75Zm3 4a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z"/></svg>
              フィルター
              {totalActiveFilters > 0 && <span className="bg-[var(--c-accent)] text-white text-[9px] px-1 rounded-full">{totalActiveFilters}</span>}
            </button>
            {totalActiveFilters > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {filterFields.map(f => {
                  const set = listFilter[f.id!];
                  if (!set || set.size === 0) return null;
                  return [...set].map(v => {
                    const opt = (f.options as FieldOption[]).find(o => o.name === v);
                    return (
                      <span key={`${f.id}-${v}`} className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full"
                        style={opt?.color ? { background: `${opt.color}22`, color: opt.color, border: `1px solid ${opt.color}55` } : { background: 'var(--c-bg-2)', color: 'var(--c-text-2)' }}>
                        {v}
                        <button onClick={() => clearFilterChip(f.id!, v)} className="opacity-60 hover:opacity-100">×</button>
                      </span>
                    );
                  });
                })}
              </div>
            )}
            {filterOpen && (
              <div className="mt-1.5 flex flex-col gap-2">
                {filterFields.map(f => (
                  <div key={f.id}>
                    <div className="text-[10px] text-[var(--c-text-3)] mb-0.5">{f.name}</div>
                    <div className="flex flex-wrap gap-1">
                      {(f.options as FieldOption[]).map(opt => {
                        const isActive = listFilter[f.id!]?.has(opt.name);
                        return (
                          <button key={opt.name} onClick={() => toggleFilterChip(f.id!, opt.name)}
                            className="text-[10px] px-1.5 py-0.5 rounded-full border transition-colors"
                            style={isActive
                              ? { background: opt.color, borderColor: opt.color, color: '#fff' }
                              : { background: `${opt.color}22`, borderColor: `${opt.color}55`, color: opt.color }
                            }>{opt.name}</button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* タスクリスト */}
        <div className="flex-1 overflow-auto">
          {visibleTasks.length === 0
            ? <p className="p-4 text-center text-xs text-[var(--c-text-3)]">タスクがありません</p>
            : visibleTasks.map(task => (
              <div key={task.id} onClick={() => setSelectedTaskId(task.id!)}
                className={`px-3 py-2 cursor-pointer border-b border-[var(--c-border)] transition-colors ${selectedTaskId === task.id ? 'bg-[var(--c-accent)]/10 border-l-2 border-l-[var(--c-accent)]' : 'hover:bg-[var(--c-bg-2)]'}`}>
                <div className={`text-xs font-medium text-[var(--c-text)] ${titleLines === 1 ? 'truncate' : titleLines === 2 ? 'line-clamp-2' : ''}`}>
                  {task.title}
                </div>
                {visibleFields.length > 0 && (
                  <div className="flex flex-wrap gap-0.5 mt-0.5">
                    {visibleFields.map(f => renderBadge(f, task.id!))}
                  </div>
                )}
              </div>
            ))
          }
        </div>

        {/* 追加ボタン */}
        <div className="p-3 border-t border-[var(--c-border)]">
          <button onClick={addTask} className="w-full btn btn--primary btn--sm text-xs">＋ ノート追加</button>
        </div>
      </div>

      {/* 詳細パネル */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {!selectedTask ? (
          <div className="flex items-center justify-center h-full text-[var(--c-text-3)]">
            <div className="text-center">
              <svg viewBox="0 0 24 24" className="w-12 h-12 opacity-30 mx-auto mb-2" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2Z" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <p className="text-sm">ノートを選択してください</p>
            </div>
          </div>
        ) : (
          <>
            {/* 詳細ヘッダー */}
            <div className="px-4 py-3 border-b border-[var(--c-border)] shrink-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  {editingTitle ? (
                    <input
                      ref={titleInputRef}
                      type="text"
                      value={titleInput}
                      onChange={e => setTitleInput(e.target.value)}
                      onBlur={commitTitle}
                      onKeyDown={e => { if (e.key === 'Enter') commitTitle(); if (e.key === 'Escape') setEditingTitle(false); }}
                      className="w-full text-base font-semibold bg-[var(--c-bg)] text-[var(--c-text)] border-b-2 border-[var(--c-accent)] outline-none"
                    />
                  ) : (
                    <h2 onClick={startEditTitle} className="text-base font-semibold cursor-text hover:text-[var(--c-accent)] transition-colors truncate" title="クリックして編集">
                      {selectedTask.title}
                    </h2>
                  )}
                  <div className="text-[10px] text-[var(--c-text-3)] mt-0.5">
                    作成: {new Date(selectedTask.created_at).toLocaleString('ja-JP')}
                    {selectedTask.updated_at !== selectedTask.created_at && ` ・ 更新: ${new Date(selectedTask.updated_at).toLocaleString('ja-JP')}`}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={openHistory} title="変更履歴" className="p-1.5 text-[var(--c-text-3)] hover:text-[var(--c-text)] hover:bg-[var(--c-bg-2)] rounded">
                    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor"><path d="M1.643 3.143 1.26 7.23a.45.45 0 0 0 .498.498l4.084-.382c.246-.023.33-.329.116-.44L4.24 6.23a6.25 6.25 0 1 1-.21 4.741.75.75 0 0 0-1.403.527A7.75 7.75 0 1 0 3.735 5.014l-.706-.854a.246.246 0 0 0-.386.983Z"/></svg>
                  </button>
                  <button onClick={deleteTask} title="削除" className="p-1.5 text-red-400 hover:text-red-300 hover:bg-[var(--c-bg-2)] rounded">
                    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor"><path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z"/></svg>
                  </button>
                </div>
              </div>
            </div>
            {/* ヘッダーアクション */}
            <div className="px-4 py-2 border-b border-[var(--c-border)] flex items-center gap-2 shrink-0">
              <button onClick={() => setShowFieldModal(true)} className="btn btn--ghost btn--sm text-xs">フィールド管理</button>
              <div className="ml-auto flex items-center gap-1">
                <button onClick={exportData} className="btn btn--ghost btn--sm text-xs">エクスポート</button>
                <label className="btn btn--ghost btn--sm text-xs cursor-pointer">
                  インポート
                  <input type="file" accept=".json" className="hidden" onChange={importData} />
                </label>
              </div>
            </div>
            {/* フィールド一覧 */}
            <div className="flex-1 overflow-auto px-4 py-4">
              <div className="flex flex-wrap gap-4">
                {detailFields.map(field => {
                  const fieldEntries = taskEntries.filter(e => e.field_id === field.id).map(e => ({ ...e, task_id: selectedTaskId! }));
                  const widthCls = field.width === 'full' ? 'w-full' : field.width === 'wide' || field.width === 'w5' ? 'min-w-[280px]' : 'min-w-[180px]';
                  return (
                    <div key={field.id} className={`flex flex-col gap-1 ${widthCls} grow`}>
                      <div className="text-[10px] font-semibold text-[var(--c-text-3)] uppercase tracking-wide">{field.name}</div>
                      <FieldView
                        field={field}
                        entries={fieldEntries}
                        allTasks={tasks}
                        onEntriesChange={refreshEntries}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {/* フィールド管理モーダル */}
      {showFieldModal && (
        <FieldModal
          fields={fields}
          onClose={() => setShowFieldModal(false)}
          onChanged={loadAll}
        />
      )}

      {/* 変更履歴モーダル */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={e => { if (e.target === e.currentTarget) setShowHistory(false); }}>
          <div className="bg-[var(--c-bg)] border border-[var(--c-border)] rounded-xl shadow-xl w-[480px] max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--c-border)]">
              <h2 className="font-semibold text-sm">変更履歴</h2>
              <div className="flex gap-2">
                <button onClick={async () => { if (!selectedTaskId) return; await noteDB.clearHistory(selectedTaskId); setHistory([]); }} className="text-xs text-red-400 hover:underline">クリア</button>
                <button onClick={() => setShowHistory(false)} className="text-[var(--c-text-3)] hover:text-[var(--c-text)]">✕</button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {history.length === 0
                ? <p className="text-xs text-[var(--c-text-3)]">変更履歴がありません</p>
                : history.map((h, i) => (
                  <div key={i} className="border-b border-[var(--c-border)] py-2 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-[var(--c-text-2)]">{h.field?.name ?? '不明なフィールド'}</span>
                      <span className="text-[var(--c-text-3)] text-[10px]">{new Date(h.changed_at).toLocaleString('ja-JP')}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px]">
                      <span className="text-[var(--c-text-3)] truncate max-w-[40%]">{h.old_value || '（空）'}</span>
                      <span className="text-[var(--c-text-3)] shrink-0">→</span>
                      <span className="text-[var(--c-text)] truncate max-w-[40%]">{h.new_value || '（空）'}</span>
                    </div>
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
