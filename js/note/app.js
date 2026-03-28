const App = {
  async init() {
    await NoteDB.open();
    await NoteDB.initDefaultFields();
    await NoteDB.ensureTodoField();
    [State.tasks, State.fields, State.allEntries] = await Promise.all([
      NoteDB.getAllTasks(),
      NoteDB.getAllFields(),
      NoteDB.getAllEntries(),
    ]);

    // フィルター状態を localStorage から復元
    _loadFilter();

    // タイトル行数を localStorage から復元
    const savedLines = localStorage.getItem('note_title_lines');
    if (savedLines !== null) State.titleLines = Number(savedLines);
    document.querySelectorAll('.note-title-lines-btn').forEach(btn => {
      btn.classList.toggle('is-active', Number(btn.dataset.lines) === State.titleLines);
    });

    // ソート状態を localStorage から復元
    const savedSort = localStorage.getItem('note_sort');
    if (savedSort) {
      const [field, dir] = savedSort.split('-');
      State.sort = { field, dir };
      const sortEl = document.getElementById('note-sort');
      if (sortEl) sortEl.value = savedSort;
    }

    Renderer.renderTaskList();
    Renderer.renderFilterUI();
    await Renderer.renderDetail();
    await EventHandlers.init(NoteDB);

    // 親フレームからの navigate:note 指示を受信してタスクを選択・表示
    window.addEventListener('message', async (e) => {
      const { type, noteTaskId } = e.data || {};
      if (type !== 'navigate:note' || !noteTaskId) return;
      let task = State.tasks.find(t => t.id === noteTaskId);
      if (!task) {
        // キャッシュが古い可能性があるため DB から再取得
        State.tasks = await NoteDB.getAllTasks();
        task = State.tasks.find(t => t.id === noteTaskId);
      }
      if (!task) return;
      State.selectedTaskId = noteTaskId;
      State.entries = await NoteDB.getEntriesByTask(noteTaskId);
      Renderer.renderTaskList();
      await Renderer.renderDetail();
      document.querySelector(`[data-task-id="${noteTaskId}"]`)?.scrollIntoView({ block: 'nearest' });
    });

    // BroadcastChannel: TODOページからのノートリンク変更通知を受け取る
    try {
      new BroadcastChannel('kanban-note-links').addEventListener('message', async (e) => {
        if (e.data.type === 'note-link-changed' && e.data.noteTaskId === State.selectedTaskId) {
          await Renderer.renderTodoLinks(State.selectedTaskId);
        }
      });
    } catch (e) { /* BroadcastChannel 非対応環境では無視 */ }

    // CustomSelect: ソートセレクトとフィールド追加フォームのタイプセレクトをカスタム UI に置き換え
    CustomSelect.replaceAll(document.getElementById('note-sidebar-controls'));
    CustomSelect.replaceAll(document.querySelector('.note-modal__ft'));

    // ショートカットキー一覧登録
    ShortcutHelp.register([
      { name: 'ショートカット', shortcuts: [
        { keys: ['N'], description: '新規ノート追加' },
        { keys: ['F'], description: '検索にフォーカス' },
        { keys: ['Escape'], description: '詳細パネルの選択を解除' },
      ]}
    ]);
  },
};

document.addEventListener('DOMContentLoaded', () => App.init().catch(console.error));

// キーボードショートカット
document.addEventListener('keydown', async (e) => {
  const isInInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable;

  // Escape: 入力中ならフォーカスを外す、そうでなければ詳細パネルの選択を解除
  if (e.key === 'Escape') {
    if (isInInput && !e.isComposing) {
      e.target.blur();
      return;
    }
    if (State.selectedTaskId) {
      State.selectedTaskId = null;
      Renderer.renderTaskList();
      await Renderer.renderDetail();
    }
    return;
  }

  if (isInInput) return;

  // N: 新規ノート追加
  if (e.key === 'n' && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    document.getElementById('add-task-btn')?.click();
    return;
  }

  // F: 検索にフォーカス
  if (e.key === 'f' && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    document.getElementById('task-search')?.focus();
    return;
  }

});

// テーマ変更を受け取る（親フレームからの postMessage）
window.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'theme-change') {
    document.documentElement.setAttribute('data-theme', e.data.theme);
    localStorage.setItem('mytools_theme', e.data.theme);
  }
});

// グローバル検索: note_db の tasks を検索して結果を返す
window.addEventListener('message', async (e) => {
  const { type, query, searchId } = e.data || {};
  if (type !== 'global-search' || !query) return;

  try {
    const db = await new Promise((resolve) => {
      const req = indexedDB.open('note_db');
      req.onupgradeneeded = ev => { if (ev.oldVersion === 0) ev.target.transaction.abort(); };
      req.onsuccess = ev => resolve(ev.target.result);
      req.onerror = () => resolve(null);
    });
    if (!db) { parent.postMessage({ type: 'global-search-result', searchId, page: 'ノート', pageSrc: 'pages/note.html', results: [] }, '*'); return; }

    const tx = db.transaction(['tasks', 'entries', 'fields']);
    const tasks = await new Promise((res) => {
      const req = tx.objectStore('tasks').getAll();
      req.onsuccess = () => res(req.result);
      req.onerror = () => res([]);
    });
    const entries = await new Promise((res) => {
      const req = tx.objectStore('entries').getAll();
      req.onsuccess = () => res(req.result);
      req.onerror = () => res([]);
    });
    const fields = await new Promise((res) => {
      const req = tx.objectStore('fields').getAll();
      req.onsuccess = () => res(req.result);
      req.onerror = () => res([]);
    });
    db.close();

    // フィールドタイプのルックアップ
    const fieldTypeMap = {};
    fields.forEach(f => { fieldTypeMap[f.id] = f.type; });

    const q = query.toLowerCase();
    // タスクIDごとにマッチしたエントリ情報を収集
    const entryMatchMap = {};
    for (const e of entries) {
      const ft = fieldTypeMap[e.field_id];
      if (ft === 'link') {
        if ((e.label && e.label.toLowerCase().includes(q)) ||
            (e.value && e.value.toLowerCase().includes(q))) {
          entryMatchMap[e.task_id] = true;
        }
      } else if (ft === 'text') {
        if (e.value && e.value.toLowerCase().includes(q)) {
          entryMatchMap[e.task_id] = true;
        }
      }
    }

    const results = tasks
      .filter(t => t.title?.toLowerCase().includes(q) || entryMatchMap[t.id])
      .slice(0, 10)
      .map(t => ({ id: t.id, title: t.title || '' }));

    parent.postMessage({ type: 'global-search-result', searchId, page: 'ノート', pageSrc: 'pages/note.html', results }, '*');
  } catch (err) {
    parent.postMessage({ type: 'global-search-result', searchId, page: 'ノート', pageSrc: 'pages/note.html', results: [] }, '*');
  }
});

// グローバル検索フォーカス: 指定 ID のノートを選択・表示する
window.addEventListener('message', async (e) => {
  const { type, targetId } = e.data || {};
  if (type !== 'global-search-focus' || !targetId) return;
  try {
    await NoteDB.open();
    State.tasks = await NoteDB.getAllTasks();
    const task = State.tasks.find(t => t.id === targetId);
    if (!task) return;
    State.selectedTaskId = targetId;
    State.entries = await NoteDB.getEntriesByTask(targetId);
    Renderer.renderTaskList();
    await Renderer.renderDetail();
    document.querySelector(`[data-task-id="${targetId}"]`)?.scrollIntoView({ block: 'nearest' });
  } catch (err) { /* ignore */ }
});
