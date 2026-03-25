'use strict';

// ==================================================
// 運用ツール — アプリケーション初期化
// ==================================================
// DOMContentLoaded でのイベントバインド、
// セクション初期化、テーマ変更リスナー
// ==================================================

function init() {
  // ── タブ切替 ────────────────────────────────────
  document.getElementById('ops-tabs').addEventListener('click', e => {
    const btn = e.target.closest('.ops-tab');
    if (btn) switchSection(btn.dataset.tool);
  });

  // ── ログビューア イベント ────────────────────────
  const logInput = document.getElementById('log-input');
  logInput.addEventListener('paste', () => setTimeout(onLogInput, 0));
  logInput.addEventListener('input', onLogInput);
  initLogScroll();

  // テキストフィルタ（debounce 300ms）
  let _logFilterTimer = null;
  document.getElementById('log-text-filter').addEventListener('input', e => {
    State.filters.text = e.target.value;
    clearTimeout(_logFilterTimer);
    _logFilterTimer = setTimeout(applyLogFilter, 300);
  });

  document.querySelectorAll('.log-filter__level input[data-level]').forEach(cb => {
    cb.addEventListener('change', () => {
      State.filters.levels[cb.dataset.level] = cb.checked;
      applyLogFilter();
    });
  });

  function bindTimePicker(btnId, isStart) {
    document.getElementById(btnId).addEventListener('click', () => {
      const btn   = document.getElementById(btnId);
      const label = btn.querySelector('.log-filter__time-btn-label');
      const defaultLabel = isStart ? '開始日時' : '終了日時';
      DatePicker.open(
        btn.dataset.value || '',
        dt => {
          btn.dataset.value = dt;
          label.textContent = dt.replace('T', ' ');
          btn.classList.add('log-filter__time-btn--set');
          State.filters[isStart ? 'startTime' : 'endTime'] = new Date(dt).getTime();
          applyLogFilter();
        },
        () => {
          btn.dataset.value = '';
          label.textContent = defaultLabel;
          btn.classList.remove('log-filter__time-btn--set');
          State.filters[isStart ? 'startTime' : 'endTime'] = null;
          applyLogFilter();
        },
        { showTime: true }
      );
    });
  }
  bindTimePicker('log-time-start-btn', true);
  bindTimePicker('log-time-end-btn',   false);

  document.getElementById('log-filter-clear').addEventListener('click', () => {
    State.filters = {
      levels: { ERROR: true, WARN: true, INFO: true, DEBUG: true, OTHER: true },
      startTime: null, endTime: null, text: '',
    };
    document.querySelectorAll('.log-filter__level input[data-level]').forEach(cb => { cb.checked = true; });
    document.getElementById('log-text-filter').value = '';
    ['log-time-start-btn','log-time-end-btn'].forEach((id, i) => {
      const btn = document.getElementById(id);
      btn.dataset.value = '';
      btn.querySelector('.log-filter__time-btn-label').textContent = i === 0 ? '開始日時' : '終了日時';
      btn.classList.remove('log-filter__time-btn--set');
    });
    applyLogFilter();
  });

  // ── cron式エディタ イベント ──────────────────────
  document.getElementById('cron-expr').addEventListener('input', updateCron);

  // JST / UTC 切替
  document.getElementById('cron-tz-toggle').addEventListener('click', e => {
    const btn = e.target.closest('.cron-tz-btn');
    if (!btn) return;
    State.cronTz = btn.dataset.tz;
    document.querySelectorAll('.cron-tz-btn').forEach(b => {
      b.classList.toggle('cron-tz-btn--active', b.dataset.tz === State.cronTz);
    });
    updateCron();
  });

  document.querySelector('.cron-presets').addEventListener('click', e => {
    const btn = e.target.closest('.cron-preset-btn');
    if (!btn) return;
    document.getElementById('cron-expr').value = btn.dataset.expr;
    updateCron();
    if (State._cronInitialized) syncGuiFromCron(btn.dataset.expr);
  });

  // 月チェックボックス「毎月」と個別選択の相互排他
  document.getElementById('cron-month-all').addEventListener('change', e => {
    if (e.target.checked) {
      document.querySelectorAll('[data-month]').forEach(c => { c.checked = false; });
    }
  });
  document.querySelectorAll('[data-month]').forEach(c => {
    c.addEventListener('change', () => {
      if (c.checked) document.getElementById('cron-month-all').checked = false;
    });
  });

  // 曜日チェックボックス「毎日」と個別選択の相互排他
  document.getElementById('cron-dow-all').addEventListener('change', e => {
    if (e.target.checked) {
      document.querySelectorAll('[data-dow]').forEach(c => { c.checked = false; });
    }
  });
  document.querySelectorAll('[data-dow]').forEach(c => {
    c.addEventListener('change', () => {
      if (c.checked) document.getElementById('cron-dow-all').checked = false;
    });
  });

  // ── HTTP ステータスコード辞典 イベント ──────────
  document.getElementById('http-search').addEventListener('input', e => {
    State.httpSearch = e.target.value;
    renderHttpAccordion();
  });

  document.getElementById('http-star-toggle').addEventListener('click', e => {
    State.httpStarOnly = !State.httpStarOnly;
    e.currentTarget.setAttribute('aria-pressed', State.httpStarOnly);
    e.currentTarget.classList.toggle('http-star-btn--active', State.httpStarOnly);
    renderHttpAccordion();
  });

  document.getElementById('http-accordion').addEventListener('click', e => {
    // アコーディオン開閉
    const toggleBtn = e.target.closest('[data-action="toggle-cat"]');
    if (toggleBtn) {
      const cat    = toggleBtn.dataset.cat;
      const catEl  = toggleBtn.closest('.http-cat');
      const bodyEl = catEl.querySelector('.http-cat__body');
      const chev   = catEl.querySelector('.http-cat__chevron');
      const isOpen = bodyEl.classList.toggle('http-cat__body--open');
      chev.classList.toggle('http-cat__chevron--open', isOpen);
      if (isOpen) State.httpOpenCats.add(cat);
      else        State.httpOpenCats.delete(cat);
      return;
    }
    // コードコピー
    const copyBtn = e.target.closest('[data-copy]');
    if (copyBtn) {
      navigator.clipboard.writeText(copyBtn.dataset.copy)
        .then(() => showSuccess(`${copyBtn.dataset.copy} をコピーしました`))
        .catch(() => showError('コピーに失敗しました'));
    }
  });

  // ── ポート番号リファレンス イベント ─────────────
  // プロトコル select を CustomSelect に変換
  CustomSelect.replaceAll(document.getElementById('ports-form'));

  document.getElementById('ports-search').addEventListener('input', e => {
    State.portsSearch = e.target.value;
    renderPorts();
  });

  document.getElementById('ports-filter-tabs').addEventListener('click', e => {
    const btn = e.target.closest('.ops-filter-tab');
    if (!btn) return;
    State.portsFilter = btn.dataset.filter;
    document.querySelectorAll('.ops-filter-tab').forEach(b => {
      b.classList.toggle('ops-filter-tab--active', b === btn);
    });
    renderPorts();
  });

  document.getElementById('ports-add-btn').addEventListener('click', () => {
    openPortsForm();
  });

  document.getElementById('ports-form-save').addEventListener('click', savePortsForm);

  document.getElementById('ports-form-cancel').addEventListener('click', () => {
    document.getElementById('ports-form').hidden = true;
    State.portsEditingId = null;
  });

  document.getElementById('ports-tbody').addEventListener('click', async e => {
    const editBtn   = e.target.closest('[data-action="edit-port"]');
    const deleteBtn = e.target.closest('[data-action="delete-port"]');

    if (editBtn) {
      const id   = parseInt(editBtn.dataset.id, 10);
      const port = State.customPorts.find(p => p.id === id);
      if (port) openPortsForm(port);
      return;
    }
    if (deleteBtn) {
      const id = parseInt(deleteBtn.dataset.id, 10);
      if (!confirm('このカスタムポートを削除しますか？')) return;
      await opsDB.deletePort(id);
      State.customPorts = await opsDB.getPorts();
      renderPorts();
      showToast('削除しました');
    }
  });


  // ── ショートカットキー一覧登録（ページ固有ショートカットなし） ──

  // ── テーマ変更（親フレームからの postMessage） ───
  window.addEventListener('message', e => {
    if (e.data?.type === 'theme-change') {
      document.documentElement.setAttribute('data-theme', e.data.theme);
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
