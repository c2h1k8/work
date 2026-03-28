'use strict';

// NoteDB モジュールは js/db/note_db.js を参照

// ── kanban_db アクセスヘルパー ──────────────────────────────────
// ※ onupgradeneeded で中断: 未初期化DBを空で作成しない（KanbanDB.open() に初期化を委譲）
async function _openKanbanDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('kanban_db');
    req.onupgradeneeded = (e) => { e.target.transaction.abort(); };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

// ── TODOピッカー ヘルパー ────────────────────────────────────────
function _renderTodoPickerList(tasks) {
  const list = document.getElementById('todo-picker-list');
  if (!list) return;
  list.innerHTML = '';
  if (tasks.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'task-picker__empty';
    empty.textContent = '選択可能なTODOタスクがありません';
    list.appendChild(empty);
    return;
  }
  for (const t of tasks) {
    const item = document.createElement('li');
    item.className = 'task-picker__item';
    item.dataset.action = 'select-todo-task';
    item.dataset.taskId = t.id;
    const titleEl = document.createElement('span');
    titleEl.className = 'task-picker__item-title';
    titleEl.textContent = t.title;
    item.appendChild(titleEl);
    list.appendChild(item);
  }
}

function _closeTodoPicker() {
  const picker = document.getElementById('todo-picker');
  if (picker) picker.setAttribute('hidden', '');
  State._todoPickerCandidates = null;
}

// ── ノートピッカー ヘルパー ────────────────────────────────────────
function _renderNotePickerList(tasks) {
  const list = document.getElementById('note-picker-list');
  if (!list) return;
  list.innerHTML = '';
  if (tasks.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'task-picker__empty';
    empty.textContent = '選択可能なノートがありません';
    list.appendChild(empty);
    return;
  }
  for (const t of tasks) {
    const item = document.createElement('li');
    item.className = 'task-picker__item';
    item.dataset.action = 'select-note-link';
    item.dataset.taskId = t.id;
    const titleEl = document.createElement('span');
    titleEl.className = 'task-picker__item-title';
    titleEl.textContent = t.title;
    item.appendChild(titleEl);
    list.appendChild(item);
  }
}

function _closeNotePicker() {
  const picker = document.getElementById('note-picker');
  if (picker) picker.setAttribute('hidden', '');
  State._notePickerCandidates = null;
}

// ── State ──────────────────────────────────────────────────────
const State = {
  tasks: [],           // 全タスク
  fields: [],          // フィールド定義（position昇順）
  selectedTaskId: null,
  entries: [],         // 選択中タスクのエントリ
  allEntries: [],      // 全タスクのエントリ（タスク一覧表示用キャッシュ）
  searchText: '',
  sort: { field: 'created_at', dir: 'desc' }, // ソート状態（localStorage: note_sort）
  listFilter: {},      // field_id → Set（select/label/dropdown 共通）
  titleLines: 1,       // タイトル表示行数: 1 | 2 | 0（制限なし）. localStorage: note_title_lines
  _filterPopoverOpen: false, // フィルターポップオーバーの開閉状態
  _labelFilters: [],        // LabelFilter インスタンス（後方互換用）
  _todoPickerCandidates: null, // TODOピッカー候補キャッシュ
  _notePickerCandidates: null, // ノートピッカー候補キャッシュ
};

// ── フィルター状態の永続化 ──────────────────────────────────────
function _saveFilter() {
  const serialized = {};
  for (const [key, val] of Object.entries(State.listFilter)) {
    if (val instanceof Set && val.size > 0) {
      serialized[key] = { type: 'set', values: [...val] };
    }
  }
  localStorage.setItem('note_filter', JSON.stringify(serialized));
}

function _loadFilter() {
  try {
    const raw = localStorage.getItem('note_filter');
    if (!raw) return;
    const parsed = JSON.parse(raw);
    for (const [key, entry] of Object.entries(parsed)) {
      const fieldId = Number(key);
      const field = State.fields.find(f => f.id === fieldId);
      if (!field || !field.listVisible) continue;
      if ((field.type === 'select' || field.type === 'label' || field.type === 'dropdown') && entry.type === 'set') {
        State.listFilter[key] = new Set(entry.values || []);
      }
    }
  } catch (e) { /* ignore */ }
}

// ── ユーティリティ ──────────────────────────────────────────────
// HTML エスケープ: js/core/utils.js の escapeHtml を使用
const _esc = escapeHtml;

// 日付文字列（YYYY-MM-DD）を日本語形式（YYYY/MM/DD）に変換
function _formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${y}/${m}/${d}`;
}

// トースト通知: js/components/toast.js の Toast.show() を使用
const showToast = (msg, type) => Toast.show(msg, type);
const showSuccess = (msg) => Toast.success(msg);
const showError = (msg) => Toast.error(msg);

// 削除アイコン SVG


// ── Renderer ────────────────────────────────────────────────────
