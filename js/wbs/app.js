'use strict';

// ==========================================
// WBS アプリ初期化
// ==========================================
const App = {
  async init() {
    _db = await new WbsDB().open();
    State.tasks = await _db.getAllTasks();
    State.collapsed = loadCollapsed();
    State._collapsedMonths = loadCollapsedMonths();
    Renderer.renderAll();
    Renderer.initScrollSync();
    Tooltip.init(document.getElementById('wbs-gantt-body'));
    Tooltip.init(document.getElementById('wbs-table-body'));
    EventHandlers.bindAll();

    // ショートカットキー一覧登録
    ShortcutHelp.register([
      { name: 'ショートカット', shortcuts: [
        { keys: ['N'], description: '新規タスク追加' },
        { keys: ['Ctrl', '↑'], description: 'タスクを上に移動' },
        { keys: ['Ctrl', '↓'], description: 'タスクを下に移動' },
        { keys: ['Ctrl', 'D'], description: '選択タスクを複製' },
        { keys: ['Tab'], description: 'インデント（右へ）' },
        { keys: ['Shift', 'Tab'], description: 'インデント（左へ）' },
        { keys: ['Delete'], description: '選択タスクを削除' },
      ]}
    ]);
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
