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
  },
};

document.addEventListener('DOMContentLoaded', () => App.init().catch(console.error));

// テーマ変更を受け取る（親フレームからの postMessage）
window.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'theme-change') {
    document.documentElement.setAttribute('data-theme', e.data.theme);
    localStorage.setItem('mytools_theme', e.data.theme);
  }
});
