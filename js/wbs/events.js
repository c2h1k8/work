'use strict';

// ==========================================
// WBS イベントハンドラー
// ==========================================
const EventHandlers = {

  bindAll() {
    document.getElementById('add-task-btn').addEventListener('click', () => this.addTask());
    document.getElementById('indent-in-btn').addEventListener('click', () => this.indentTask(1));
    document.getElementById('indent-out-btn').addEventListener('click', () => this.indentTask(-1));
    document.getElementById('move-up-btn').addEventListener('click', () => this.moveTask(-1));
    document.getElementById('move-down-btn').addEventListener('click', () => this.moveTask(1));
    document.getElementById('export-btn').addEventListener('click', () => this.exportData());
    document.getElementById('import-file').addEventListener('change', e => this.importData(e));
    document.getElementById('holiday-btn').addEventListener('click', () => this.openHolidayModal());
    document.getElementById('today-btn').addEventListener('click', () => {
      const gBody = document.getElementById('wbs-gantt-body');
      if (gBody) Renderer.scrollToToday(gBody);
    });

    document.addEventListener('keydown', e => {
      const isInInput = e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA';
      // Escape: 入力中ならフォーカスを外す
      if (e.key === 'Escape' && isInInput && !e.isComposing) { e.target.blur(); return; }
      if (isInInput) return;
      if (e.key === 'Tab') { e.preventDefault(); this.indentTask(e.shiftKey ? -1 : 1); }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (State.selectedId) this.deleteTask(State.selectedId);
      }
      // Ctrl+↑/↓: タスクを上下に移動
      if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowUp') {
        e.preventDefault(); this.moveTask(-1);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowDown') {
        e.preventDefault(); this.moveTask(1);
      }
      // N: 新規タスク追加
      if (e.key === 'n' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault(); this.addTask();
      }
      // Ctrl+D: 選択タスクを複製
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        if (State.selectedId) this.duplicateTask(State.selectedId);
      }
    });

    window.addEventListener('message', e => {
      if (e.data && e.data.type === 'theme-change') {
        document.documentElement.setAttribute('data-theme', e.data.theme);
      }
    });
  },

  bindTableBodyEvents(tbody) {
    tbody.addEventListener('click', e => {
      const row = e.target.closest('[data-task-id]');
      if (!row) return;
      const taskId = Number(row.dataset.taskId);

      const delBtn = e.target.closest('[data-action="delete"]');
      if (delBtn) { this.deleteTask(taskId); return; }

      const collapseBtn = e.target.closest('[data-action="toggle-collapse"]');
      if (collapseBtn) { this.toggleCollapse(taskId); return; }

      State.selectedId = taskId;
      document.querySelectorAll('.wbs-row').forEach(r => r.classList.remove('is-selected'));
      row.classList.add('is-selected');

      const cell = e.target.closest('[data-field]');
      if (cell) this.startEditing(taskId, cell.dataset.field, cell);
    });
  },

  toggleCollapse(taskId) {
    if (State.collapsed.has(taskId)) {
      State.collapsed.delete(taskId);
    } else {
      State.collapsed.add(taskId);
    }
    saveCollapsed();
    Renderer.renderAll();
  },

  async addTask() {
    const position = State.tasks.length
      ? State.tasks[State.tasks.length - 1].position + 1
      : 0;
    const selectedTask = State.tasks.find(t => t.id === State.selectedId);
    const level = selectedTask ? selectedTask.level : 0;

    const id = await _db.addTask({
      title: 'タスク名', level, position,
      plan_start: '', plan_days: 0,
      actual_start: '', actual_end: '',
      progress: 0, status: 'not_started', memo: '',
    });

    State.tasks = await _db.getAllTasks();
    State.selectedId = id;
    Renderer.renderAll();
    showSuccess('タスクを追加しました');
  },

  async deleteTask(id) {
    if (!confirm('このタスクを削除しますか？')) return;
    await _db.deleteTask(id);
    if (State.selectedId === id) State.selectedId = null;
    State.collapsed.delete(id);
    saveCollapsed();
    State.tasks = await _db.getAllTasks();
    Renderer.renderAll();
    TOAST('タスクを削除しました');
  },

  startEditing(taskId, field, cell) {
    if (!field) return;
    // 編集中はツールチップを無効化（セルが残っていると data-tooltip が再トリガーされるため属性ごと除去）
    Tooltip.hide();
    cell.removeAttribute('data-tooltip');
    cell.removeAttribute('data-tooltip-type');
    const task = State.tasks.find(t => t.id === taskId);
    if (!task) return;

    if (field === 'plan_start' || field === 'actual_start' || field === 'actual_end') {
      this._openDatePicker(task, field);
      return;
    }
    if (field === 'status') {
      this._openStatusPicker(task, cell);
      return;
    }

    const val = task[field] != null ? String(task[field]) : '';
    let input;

    if (field === 'title') {
      input = document.createElement('input');
      input.type = 'text';
      input.className = 'wbs-cell-input';
      input.value = val;
    } else if (field === 'plan_days') {
      input = document.createElement('input');
      input.type = 'number';
      input.min = '0'; input.max = '9999';
      input.className = 'wbs-cell-input';
      input.value = val === '0' ? '' : val;
    } else if (field === 'progress') {
      input = document.createElement('input');
      input.type = 'number';
      input.min = '0'; input.max = '100';
      input.className = 'wbs-cell-input';
      input.value = val === '0' ? '0' : val;
    }

    if (!input) return;
    cell.innerHTML = '';
    cell.appendChild(input);
    input.focus();
    if (input.select) input.select();

    let _saved = false;
    const save = async () => {
      if (_saved) return;
      _saved = true;
      let newVal = input.value;
      if (field === 'plan_days') {
        newVal = Math.max(0, parseInt(newVal || '0', 10)) || 0;
      } else if (field === 'progress') {
        newVal = Math.min(100, Math.max(0, parseInt(newVal || '0', 10))) || 0;
      }
      task[field] = newVal;
      await _db.updateTask(task);
      State.tasks = await _db.getAllTasks();
      Renderer.renderAll();
    };

    input.addEventListener('blur', save);
    input.addEventListener('keydown', e => {
      if (field === 'title') {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { _saved = true; Renderer.renderAll(); }
      } else {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { _saved = true; Renderer.renderAll(); }
      }
    });
  },

  _openStatusPicker(task, cell) {
    document.getElementById('wbs-status-picker')?.remove();

    const rect = cell.getBoundingClientRect();
    const picker = document.createElement('div');
    picker.id = 'wbs-status-picker';
    picker.className = 'wbs-status-picker';
    picker.style.left = rect.left + 'px';
    picker.style.top  = rect.bottom + 'px';

    picker.innerHTML = Object.entries(STATUS_CONFIG).map(([k, v]) =>
      `<div class="wbs-status-option${k === (task.status || 'not_started') ? ' is-selected' : ''}" data-status="${k}">
        <span class="wbs-status ${v.cls}">${v.label}</span>
      </div>`
    ).join('');

    document.body.appendChild(picker);

    picker.addEventListener('click', async e => {
      const opt = e.target.closest('[data-status]');
      if (!opt) return;
      picker.remove();
      task.status = opt.dataset.status;
      await _db.updateTask(task);
      State.tasks = await _db.getAllTasks();
      Renderer.renderAll();
    });

    setTimeout(() => {
      const close = e => {
        if (!picker.contains(e.target)) {
          picker.remove();
          document.removeEventListener('click', close, true);
        }
      };
      document.addEventListener('click', close, true);
    }, 0);
  },

  _openDatePicker(task, field) {
    DatePicker.open(
      task[field] || '',
      async (dateStr) => {
        task[field] = dateStr;
        await _db.updateTask(task);
        State.tasks = await _db.getAllTasks();
        Renderer.renderAll();
      },
      async () => {
        task[field] = '';
        await _db.updateTask(task);
        State.tasks = await _db.getAllTasks();
        Renderer.renderAll();
      }
    );
  },

  async indentTask(dir) {
    if (!State.selectedId) return;
    const task = State.tasks.find(t => t.id === State.selectedId);
    if (!task) return;
    const newLevel = Math.min(4, Math.max(0, task.level + dir));
    if (newLevel === task.level) return;
    task.level = newLevel;
    await _db.updateTask(task);
    State.tasks = await _db.getAllTasks();
    Renderer.renderAll();
  },

  async duplicateTask(taskId) {
    const src = State.tasks.find(t => t.id === taskId);
    if (!src) return;
    const position = src.position + 1;
    const id = await _db.addTask({
      title: src.title + '（コピー）', level: src.level, position,
      plan_start: src.plan_start, plan_days: src.plan_days,
      actual_start: '', actual_end: '',
      progress: 0, status: 'not_started', memo: src.memo,
    });
    State.tasks = await _db.getAllTasks();
    State.selectedId = id;
    Renderer.renderAll();
    showSuccess('タスクを複製しました');
  },

  async moveTask(dir) {
    if (!State.selectedId) return;
    const idx = State.tasks.findIndex(t => t.id === State.selectedId);
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= State.tasks.length) return;
    const a = State.tasks[idx];
    const b = State.tasks[newIdx];
    [a.position, b.position] = [b.position, a.position];
    await _db.bulkUpdate([a, b]);
    State.tasks = await _db.getAllTasks();
    Renderer.renderAll();
  },

  async exportData() {
    const json = await _db.exportAll();
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
    a.download = `wbs_export_${ts}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showSuccess('エクスポートしました');
  },

  async importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      await _db.importAll(text);
      State.tasks = await _db.getAllTasks();
      State.selectedId = null;
      Renderer.renderAll();
      showSuccess('インポートしました');
    } catch (err) {
      showError('インポートに失敗しました: ' + err.message);
    }
    e.target.value = '';
  },

  openHolidayModal() {
    document.getElementById('holiday-modal')?.remove();

    const modal = document.createElement('div');
    modal.className = 'wbs-holiday-modal';
    modal.id = 'holiday-modal';
    modal.innerHTML = `
      <div class="wbs-holiday-dialog">
        <h2 class="wbs-holiday-title">カスタム祝日・休業日の設定</h2>
        <p style="font-size:12px;color:var(--c-text-3);margin:0">
          土日・日本の祝日は自動で非営業日として扱われます。<br>
          それ以外の休業日（年末年始・夏季休暇等）をここで追加できます。
        </p>
        <div class="wbs-holiday-input-row">
          <button class="btn btn--secondary btn--sm is-date-picker" id="hday-date-btn" style="min-width:100px;">日付を選択</button>
          <input type="hidden" id="hday-date">
          <input type="text" id="hday-name" placeholder="名称（例: 夏季休暇）" style="flex:2">
          <button class="btn btn--primary btn--sm" id="hday-add-btn">追加</button>
        </div>
        <div class="wbs-holiday-body">
          <div class="wbs-holiday-list" id="hday-list"></div>
        </div>
        <div class="wbs-holiday-footer">
          <button class="btn btn--secondary btn--sm" id="hday-close-btn">閉じる</button>
        </div>
      </div>`;

    document.body.appendChild(modal);

    const renderList = () => {
      const list = loadCustomHolidays().sort((a, b) => a.date.localeCompare(b.date));
      const el = document.getElementById('hday-list');
      if (!list.length) {
        el.innerHTML = '<div style="color:var(--c-text-3);font-size:12px;padding:8px 0">登録なし</div>';
        return;
      }
      el.innerHTML = list.map(h => `
        <div class="wbs-holiday-item">
          <span class="wbs-holiday-item-date">${h.date}</span>
          <span class="wbs-holiday-item-name">${escapeHtml(h.name)}</span>
          <button class="wbs-icon-btn danger" data-del="${escapeHtml(h.date)}" title="削除">
            <svg viewBox="0 0 16 16"><path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z"/></svg>
          </button>
        </div>`).join('');
    };

    renderList();

    document.getElementById('hday-date-btn').addEventListener('click', () => {
      const cur = document.getElementById('hday-date').value || '';
      DatePicker.open(cur, dateStr => {
        document.getElementById('hday-date').value = dateStr;
        document.getElementById('hday-date-btn').textContent = dateStr;
        document.getElementById('hday-date-btn').classList.toggle('has-value', !!dateStr);
      }, () => {
        document.getElementById('hday-date').value = '';
        document.getElementById('hday-date-btn').textContent = '日付を選択';
        document.getElementById('hday-date-btn').classList.remove('has-value');
      });
    });

    document.getElementById('hday-add-btn').addEventListener('click', () => {
      const date = document.getElementById('hday-date').value;
      const name = document.getElementById('hday-name').value.trim();
      if (!date) { showError('日付を入力してください'); return; }
      const cur = loadCustomHolidays();
      if (cur.some(h => h.date === date)) { showError('既に登録されています'); return; }
      cur.push({ date, name: name || '休業日' });
      saveCustomHolidays(cur);
      _customHolidays = loadCustomHolidays();
      _customSet = new Set(_customHolidays.map(h => h.date));
      document.getElementById('hday-date').value = '';
      document.getElementById('hday-date-btn').textContent = '日付を選択';
      document.getElementById('hday-date-btn').classList.remove('has-value');
      document.getElementById('hday-name').value = '';
      renderList();
      Renderer.renderAll();
    });

    document.getElementById('hday-list').addEventListener('click', e => {
      const btn = e.target.closest('[data-del]');
      if (!btn) return;
      const date = btn.dataset.del;
      const cur = loadCustomHolidays().filter(h => h.date !== date);
      saveCustomHolidays(cur);
      _customHolidays = loadCustomHolidays();
      _customSet = new Set(_customHolidays.map(h => h.date));
      renderList();
      Renderer.renderAll();
    });

    document.getElementById('hday-close-btn').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  },
};
