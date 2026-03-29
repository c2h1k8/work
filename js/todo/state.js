// ==================================================
// Kanban Board — Vanilla JS + IndexedDB
// ==================================================
// DB層: js/db/kanban_db.js の KanbanDB クラスを参照

// ==================================================
// State: グローバル状態
// ==================================================
const State = {
  currentTaskId: null,   // モーダルで開いているタスクの ID
  tasks:     {},         // 列別キャッシュ（動的、col.key → task[]）
  columns:   [],         // { id, key, name, position }[] 位置順
  labels:    [],         // 全ラベルキャッシュ
  templates: [],         // タスクテンプレートキャッシュ
  sortables: [],         // SortableJS インスタンス
  isDirty:   false,      // 前回エクスポート後に変更があるか
  taskLabels: new Map(), // taskId → Set<labelId>（フィルター用キャッシュ）
  comments:  new Map(), // taskId → string[]（コメント本文、テキスト検索用キャッシュ）
  dependencies: new Map(), // taskId → { blocking: Set<taskId>, blockedBy: Set<taskId> }
  _labelFilterInst: null,                                     // LabelFilter コンポーネントインスタンス
  filter:         { text: '', labelIds: new Set(), due: '' }, // フィルター状態
  sort:           { field: '', dir: 'asc' },                  // ソート状態
  timelineFilter: 'comments',                                 // 'comments' | 'all'
  timeAbsolute:   false,                                      // 時刻表示形式（false=相対, true=絶対）
  _descriptionBeforeEdit: null,                              // 説明編集開始時の元テキスト（変更なし判定用）
  _checklistSortable: null,                                  // チェックリスト SortableJS インスタンス
  _templateSortable:  null,                                  // テンプレート一覧 SortableJS インスタンス
  _pickerDepMode: null,                                      // 'blocker' | 'blocked' 依存ピッカーモード
  _depPickerCandidates: null,                                // 依存ピッカー候補リスト
  _templatePickerColumn: null,                               // テンプレート選択中のカラムキー
  _editingTemplateId: null,                                  // テンプレート管理モーダルで編集中のテンプレートID
};

// ==================================================
// Helper: 現在のカラムキー一覧を返す
// ==================================================
function getColumnKeys() {
  return State.columns.map(c => c.key);
}

// ==================================================
// Helper: タスク配列をソート（条件なしはそのまま返す）
// ==================================================
function sortTasksArray(tasks, sort) {
  if (!sort.field) return tasks;
  return [...tasks].sort((a, b) => {
    let av = a[sort.field] || '';
    let bv = b[sort.field] || '';
    if (sort.field === 'due_date') {
      if (!av && !bv) return 0;
      if (!av) return 1;   // 期限なしは末尾
      if (!bv) return -1;
    }
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sort.dir === 'desc' ? -cmp : cmp;
  });
}

// ==================================================
// Helper: テキスト内の URL を <a> リンクに変換して要素に挿入
// ==================================================
function renderTextWithLinks(el, text) {
  el.innerHTML = '';
  if (!text) return;
  const urlRe = /https?:\/\/[^\s<>"']+/g;
  let last = 0;
  let m;
  while ((m = urlRe.exec(text)) !== null) {
    if (m.index > last) {
      el.appendChild(document.createTextNode(text.slice(last, m.index)));
    }
    const a = document.createElement('a');
    a.href = m[0];
    a.textContent = m[0];
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    el.appendChild(a);
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    el.appendChild(document.createTextNode(text.slice(last)));
  }
}

// ==================================================
// Helper: マークダウン内の n 番目のチェックボックスを書き換える
// ==================================================
function toggleCheckboxInMarkdown(text, index, checked) {
  let count = 0;
  return text.replace(/- \[(x| )\]/gi, (match) => {
    if (count++ === index) return checked ? '- [x]' : '- [ ]';
    return match;
  });
}

// ==================================================
// Helper: マークダウンを HTML に変換して要素に挿入
// onCheckboxChange が渡された場合はチェックボックスをインタラクティブにする
// ==================================================
function renderMarkdown(el, text, onCheckboxChange = null) {
  el.innerHTML = '';
  if (!text) return;
  el.innerHTML = marked.parse(text, { breaks: true });
  // リンクを別タブで開く
  el.querySelectorAll('a').forEach(a => {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  });
  if (onCheckboxChange) {
    el.querySelectorAll('input[type="checkbox"]').forEach((cb, index) => {
      cb.removeAttribute('disabled');
      cb.addEventListener('change', () => onCheckboxChange(index, cb.checked));
    });
  }
}

// ==================================================
// Helper: md-editor を write タブ表示にリセットする
// ==================================================
function _resetMdEditor(editor) {
  if (!editor) return;
  const textarea = editor.querySelector('textarea');
  const preview  = editor.querySelector('.md-editor__preview');
  editor.querySelectorAll('.md-editor__tab').forEach(t => {
    t.classList.toggle('is-active', t.dataset.tab === 'write');
  });
  if (textarea) textarea.removeAttribute('hidden');
  if (preview)  preview.setAttribute('hidden', '');
}

// ==================================================
// DB 参照（モジュールレベル、App.init() で設定）
// ==================================================
let _dbRef = null;

// ==================================================
// BroadcastChannel: ノートリンク変更をノートページに通知（非対応環境は null）
// ==================================================
let _noteLinksBC = null;
try { _noteLinksBC = new BroadcastChannel('kanban-note-links'); } catch (e) {}

// ==================================================
// Helper: note_db を読み取り専用で開く
// ==================================================
function _openNoteDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('note_db');
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

// ==================================================
// Helper: WIP 超過表示を更新
// ==================================================
function _updateWipDisplay(columnKey) {
  const col = State.columns.find(c => c.key === columnKey);
  if (!col) return;
  const count   = (State.tasks[columnKey] || []).length;
  const limit   = col.wip_limit || 0;
  const exceeded = limit > 0 && count > limit;

  const countEl  = document.querySelector(`[data-count="${columnKey}"]`);
  const section  = document.querySelector(`[data-column="${columnKey}"]`);
  if (countEl) {
    countEl.textContent = limit > 0 ? `${count}/${limit}` : String(count);
    countEl.style.color = exceeded ? 'var(--c-danger)' : '';
    countEl.style.background = exceeded ? 'var(--c-danger-bg)' : '';
  }
  if (section) section.classList.toggle('column--wip-exceeded', exceeded);
}

// ==================================================
// Helper: 繰り返しの次回日付を計算
// ==================================================
function _calcNextDate(dateStr, interval) {
  const d = new Date(dateStr + 'T00:00:00');
  if (interval === 'daily')   d.setDate(d.getDate() + 1);
  if (interval === 'weekly')  d.setDate(d.getDate() + 7);
  if (interval === 'monthly') d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

// ==================================================
// Helper: エクスポート後の変更フラグを立てる
// ==================================================
function markDirty() {
  State.isDirty = true;
  localStorage.setItem('kanban_dirty_at', new Date().toISOString());
  Backup.updateExportIndicator(true);
}

// ==================================================
// Helper: フィルター状態を localStorage に保存
// ==================================================
function saveFilterState() {
  localStorage.setItem('kanban_filter', JSON.stringify({
    text:     State.filter.text,
    labelIds: [...State.filter.labelIds],
    due:      State.filter.due,
  }));
}

// ==================================================
// Helper: フィルターをボード全体に適用
// ==================================================
function applyFilter() {
  const text   = State.filter.text.toLowerCase();
  const ids    = State.filter.labelIds;
  const due    = State.filter.due;
  const active = text !== '' || ids.size > 0 || due !== '';

  const today = new Date(); today.setHours(0, 0, 0, 0);

  for (const col of getColumnKeys()) {
    const body = document.querySelector(`[data-column-body="${col}"]`);
    if (!body) continue;
    let visible = 0;

    for (const card of body.querySelectorAll('.card[data-id]')) {
      const taskId = parseInt(card.dataset.id, 10);
      const task   = (State.tasks[col] || []).find(t => t.id === taskId);

      // テキスト検索（タイトル・説明・コメント）
      let textOk = true;
      if (text) {
        const title    = (task?.title       || '').toLowerCase();
        const desc     = (task?.description || '').toLowerCase();
        const comments = (State.comments.get(taskId) || []).join(' ').toLowerCase();
        textOk = title.includes(text) || desc.includes(text) || comments.includes(text);
      }

      // ラベルフィルター
      let labelOk = true;
      if (ids.size > 0) {
        const cardIds = State.taskLabels.get(taskId) || new Set();
        labelOk = [...ids].some(id => cardIds.has(id));
      }

      // 期限フィルター
      let dueOk = true;
      if (due) {
        const taskDue = task?.due_date ? new Date(task.due_date + 'T00:00:00') : null;
        switch (due) {
          case 'has_due':  dueOk = !!taskDue; break;
          case 'no_due':   dueOk = !taskDue;  break;
          case 'overdue': {
            // 完了カラムは期限切れ表示を抑制しているため、フィルターからも除外する
            const isDoneCol = State.columns.find(c => c.key === col)?.done;
            dueOk = !!taskDue && taskDue < today && !isDoneCol;
            break;
          }
          case 'today':    dueOk = !!taskDue && taskDue.getTime() === today.getTime(); break;
          case 'week': {
            const endOfWeek = new Date(today);
            endOfWeek.setDate(today.getDate() + (6 - today.getDay()));
            dueOk = !!taskDue && taskDue >= today && taskDue <= endOfWeek;
            break;
          }
          case 'month': {
            const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            dueOk = !!taskDue && taskDue >= today && taskDue <= endOfMonth;
            break;
          }
        }
      }

      const show = textOk && labelOk && dueOk;
      card.style.display = show ? '' : 'none';
      if (show) visible++;
    }

    // WIP 表示更新（フィルター中は実タスク数を使う）
    _updateWipDisplay(col);
    const countEl = document.querySelector(`[data-count="${col}"]`);
    if (countEl && active) countEl.textContent = (() => {
      const limit = State.columns.find(c => c.key === col)?.wip_limit || 0;
      const total = (State.tasks[col] || []).length;
      return limit > 0 ? `${visible}/${limit}` : String(visible);
    })();
  }

  const clearBtn = document.getElementById('filter-clear');
  if (clearBtn) clearBtn.hidden = !active;
}

// ==================================================
// Helper: ラベルフィルタードロップダウンを再描画（LabelFilter コンポーネント使用）
// ==================================================
function renderFilterLabels() {
  if (!State._labelFilterInst) return;
  State._labelFilterInst.update(
    State.labels.map(l => ({ id: l.id, name: l.name, color: l.color })),
    State.filter.labelIds,
  );
}

