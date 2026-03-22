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
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
