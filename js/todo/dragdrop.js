// ==================================================
// DragDrop: SortableJS によるドラッグ&ドロップ
// ==================================================
const DragDrop = {
  init(db) {
    State.sortables = [];
    for (const col of getColumnKeys()) {
      const el = document.querySelector(`[data-column-body="${col}"]`);
      if (!el) continue;

      const sortable = Sortable.create(el, {
        group:       'kanban',           // カラム間移動を許可
        animation:   150,
        ghostClass:  'sortable-ghost',
        chosenClass: 'sortable-chosen',
        // ソート条件あり時は列内並び替えを無効化
        sort:        !State.sort.field,
        emptyInsertThreshold: 10,

        onEnd: (evt) => {
          this._onEnd(evt, db);
        },
      });
      State.sortables.push(sortable);
    }
  },

  /** ドラッグ終了後に position を更新 */
  async _onEnd(evt, db) {
    const fromCol = evt.from.dataset.columnBody;
    const toCol   = evt.to.dataset.columnBody;
    const taskId  = parseInt(evt.item.dataset.id, 10);

    if (!fromCol || !toCol || !taskId) return;

    // 完了カラムへ移動しようとしている場合、先行タスクが完了しているか確認
    if (fromCol !== toCol) {
      const toColDef = State.columns.find(c => c.key === toCol);
      if (toColDef?.done) {
        const deps = State.dependencies.get(taskId);
        if (deps && deps.blockedBy.size > 0) {
          const doneKeys = new Set(State.columns.filter(c => c.done).map(c => c.key));
          const hasBlocker = [...deps.blockedBy].some(blockerId => {
            const bt = Object.values(State.tasks).flat().find(t => t.id === blockerId);
            return !bt || !doneKeys.has(bt.column);
          });
          if (hasBlocker) {
            Toast.error('先行タスクが完了していないため移動できません');
            // SortableJS が移動した DOM を元に戻す
            Renderer.renderColumn(fromCol, State.tasks[fromCol] || [], db);
            Renderer.renderColumn(toCol,   State.tasks[toCol]   || [], db);
            DragDrop.init(db);
            return;
          }
        }
      }
    }

    if (State.sort.field) {
      // ソート条件あり：カラム移動のみ更新（position は変えない）
      if (fromCol !== toCol) {
        await db.updateTask(taskId, { column: toCol });
        State.tasks[fromCol] = (State.tasks[fromCol] || []).filter(t => t.id !== taskId);
        const allTasks = await db.getAllTasks();
        const task = allTasks.find(t => t.id === taskId);
        if (task) {
          if (!State.tasks[toCol]) State.tasks[toCol] = [];
          State.tasks[toCol].push(task);
        }
        Renderer.updateCount(fromCol);
        // 作業履歴（非同期、失敗しても無視）
        try {
          const fromName = State.columns.find(c => c.key === fromCol)?.name ?? fromCol;
          const toName   = State.columns.find(c => c.key === toCol)?.name ?? toCol;
          await db.addActivity(taskId, 'column_change', { from: fromName, to: toName });
        } catch (_) { /* アクティビティ記録失敗は無視 */ }
        // アクティビティログに記録
        const _sortedTask = (State.tasks[toCol] || []).find(t => t.id === taskId);
        const _taskTitleS = _sortedTask?.title || '(無題)';
        const _toDoneS  = State.columns.find(c => c.key === toCol)?.done;
        if (_toDoneS) {
          ActivityLogger.log('todo', 'complete', 'task', taskId, `タスク「${_taskTitleS}」を完了`);
        } else {
          const _fromName = State.columns.find(c => c.key === fromCol)?.name ?? fromCol;
          const _toName   = State.columns.find(c => c.key === toCol)?.name ?? toCol;
          ActivityLogger.log('todo', 'move', 'task', taskId, `タスク「${_taskTitleS}」を移動（${_fromName} → ${_toName}）`);
        }
      }
      Renderer.renderColumn(toCol, State.tasks[toCol] || [], db);
      Renderer.updateCount(toCol);
      markDirty();
      applyFilter();
      return;
    }

    // ソート条件なし：position を中間値で更新
    const cards    = [...evt.to.querySelectorAll('.card[data-id]')];
    const newIndex = cards.indexOf(evt.item);

    const prevCard = cards[newIndex - 1];
    const nextCard = cards[newIndex + 1];

    const prevTask = prevCard ? (State.tasks[toCol] || []).find(t => t.id === parseInt(prevCard.dataset.id, 10)) : null;
    const nextTask = nextCard ? (State.tasks[toCol] || []).find(t => t.id === parseInt(nextCard.dataset.id, 10)) : null;

    let newPosition;
    if (prevTask && nextTask) {
      newPosition = (prevTask.position + nextTask.position) / 2;
    } else if (prevTask) {
      newPosition = prevTask.position + 1000;
    } else if (nextTask) {
      newPosition = nextTask.position / 2;
    } else {
      newPosition = 1000;
    }

    // DB 更新
    const updated = await db.updateTask(taskId, { column: toCol, position: newPosition });

    // State キャッシュ更新
    if (fromCol !== toCol) {
      State.tasks[fromCol] = (State.tasks[fromCol] || []).filter(t => t.id !== taskId);
      if (!State.tasks[toCol]) State.tasks[toCol] = [];
      State.tasks[toCol].push(updated);
    } else {
      const idx = (State.tasks[toCol] || []).findIndex(t => t.id === taskId);
      if (idx !== -1) State.tasks[toCol][idx] = updated;
    }
    State.tasks[toCol] = sortByPosition(State.tasks[toCol]);

    // gap が小さすぎる場合は全体再採番
    const positions = State.tasks[toCol].map(t => t.position);
    const minGap = Math.min(...positions.slice(1).map((p, i) => p - positions[i]));
    if (minGap < 0.001) {
      await db.renumberPositions(State.tasks[toCol]);
    }

    // 変更フラグ
    markDirty();

    if (fromCol !== toCol) {
      Renderer.updateCount(fromCol);
      // done ステータスが異なるカラム間の移動は期限切れ表示が変わるため再描画
      const fromDone = State.columns.find(c => c.key === fromCol)?.done;
      const toDone   = State.columns.find(c => c.key === toCol)?.done;
      if (fromDone !== toDone) {
        Renderer.renderColumn(fromCol, State.tasks[fromCol] || [], db);
        Renderer.renderColumn(toCol,   State.tasks[toCol]   || [], db);
      }
      // 作業履歴（非同期、失敗しても無視）
      try {
        const fromName = State.columns.find(c => c.key === fromCol)?.name ?? fromCol;
        const toName   = State.columns.find(c => c.key === toCol)?.name ?? toCol;
        await db.addActivity(taskId, 'column_change', { from: fromName, to: toName });
      } catch (_) { /* アクティビティ記録失敗は無視 */ }
      // アクティビティログに記録
      const _ddTaskTitle = updated?.title || '(無題)';
      const _ddToDone   = State.columns.find(c => c.key === toCol)?.done;
      if (_ddToDone) {
        ActivityLogger.log('todo', 'complete', 'task', taskId, `タスク「${_ddTaskTitle}」を完了`);
      } else {
        const _ddFromName = State.columns.find(c => c.key === fromCol)?.name ?? fromCol;
        const _ddToName   = State.columns.find(c => c.key === toCol)?.name ?? toCol;
        ActivityLogger.log('todo', 'move', 'task', taskId, `タスク「${_ddTaskTitle}」を移動（${_ddFromName} → ${_ddToName}）`);
      }
    }
    Renderer.updateCount(toCol);

    // 完了カラムへ移動した場合、繰り返しタスクを自動生成
    if (fromCol !== toCol) {
      const toDone = State.columns.find(c => c.key === toCol)?.done;
      if (toDone) {
        const allTasks = await db.getAllTasks();
        const movedTask = allTasks.find(t => t.id === taskId);
        if (movedTask?.recurring) {
          await _handleRecurringOnDone(movedTask, db);
        }
      }
    }

    applyFilter();
  },

};

// ==================================================
// Helper: 完了カラム移動時に繰り返しタスクを生成
// ==================================================
async function _handleRecurringOnDone(task, db) {
  if (!task.recurring) return;
  const firstCol = [...State.columns].sort((a, b) => a.position - b.position)[0];
  if (!firstCol) return;

  const nextDate = task.recurring.next_date || task.due_date || new Date().toISOString().slice(0, 10);
  const afterNextDate = _calcNextDate(nextDate, task.recurring.interval);

  // チェックリストの done をリセット
  const checklist = (task.checklist || []).map(c => ({ ...c, done: false }));

  // 次回タスクを作成
  const colTasks = State.tasks[firstCol.key] || [];
  const lastPos  = colTasks.length > 0 ? colTasks[colTasks.length - 1].position + 1000 : 1000;

  // task_labels を取得してコピー
  const taskLabels = await db._getAllByIndex('task_labels', 'task_id', task.id).catch(() => []);
  const labelIds   = taskLabels.map(tl => tl.label_id);

  const newTask = await db.addTask({
    column:      firstCol.key,
    position:    lastPos,
    title:       task.title,
    description: task.description || '',
    checklist,
    due_date:    nextDate,
    recurring:   { interval: task.recurring.interval, next_date: afterNextDate },
  });

  // ラベルをコピー
  for (const labelId of labelIds) {
    await db.addTaskLabel(newTask.id, labelId).catch(() => {});
    if (!State.taskLabels.has(newTask.id)) State.taskLabels.set(newTask.id, new Set());
    State.taskLabels.get(newTask.id).add(labelId);
  }

  // State キャッシュ更新
  if (!State.tasks[firstCol.key]) State.tasks[firstCol.key] = [];
  State.tasks[firstCol.key].push(newTask);
  try { await db.addActivity(newTask.id, 'task_create', {}); } catch {}

  // 元タスクの next_date を更新
  await db.updateTask(task.id, { recurring: { ...task.recurring, next_date: afterNextDate } });
  for (const col of Object.keys(State.tasks)) {
    const t = (State.tasks[col] || []).find(t => t.id === task.id);
    if (t) { t.recurring = { ...t.recurring, next_date: afterNextDate }; break; }
  }

  // ボード更新
  Renderer.renderColumn(firstCol.key, State.tasks[firstCol.key], db);
  markDirty();
  Toast.success('繰り返しタスクを生成しました');
}
