'use strict';

// ==================================================
// アクティビティログモーダル（自己挿入型）
// ActivityDB が先に読み込まれていること
// ==================================================

const ActivityLogModal = (() => {
  // ページ表示設定
  const PAGE_META = {
    todo:      { label: 'TODO',          color: '#4f80ff' },
    note:      { label: 'ノート',        color: '#22c55e' },
    snippet:   { label: 'スニペット',    color: '#a855f7' },
    dashboard: { label: 'ダッシュボード',color: '#f97316' },
    sql:       { label: 'SQL',           color: '#ef4444' },
    wbs:       { label: 'WBS',           color: '#14b8a6' },
  };

  // アクション表示ラベル
  const ACTION_LABEL = {
    create:   '追加',
    delete:   '削除',
    archive:  'アーカイブ',
    complete: '完了',
    update:   '更新',
    move:     '移動',
  };

  // 状態
  let _el       = null;
  let _offset   = 0;
  const _LIMIT  = 50;
  let _loading  = false;
  let _hasMore  = true;
  let _observer = null;
  let _filters  = { pages: new Set(Object.keys(PAGE_META)), startDate: '', endDate: '' };

  // =============================================
  // 公開 API
  // =============================================

  function show() {
    if (!_el) _build();
    _resetState();
    _applyFiltersToUI();
    _el.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
    _loadMore();
  }

  function hide() {
    if (!_el) return;
    _el.setAttribute('hidden', '');
    document.body.style.overflow = '';
    if (_observer) { _observer.disconnect(); _observer = null; }
  }

  // =============================================
  // 初期化
  // =============================================

  function _build() {
    _el = document.createElement('div');
    _el.className = 'actlog-overlay';
    _el.setAttribute('hidden', '');
    _el.innerHTML = `
      <div class="actlog-modal" role="dialog" aria-modal="true" aria-label="アクティビティログ">
        <div class="actlog-modal__header">
          <h2 class="actlog-modal__title">アクティビティログ</h2>
          <button class="actlog-modal__close" aria-label="閉じる" data-actlog="close">
            <svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
              <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/>
            </svg>
          </button>
        </div>
        <div class="actlog-modal__filters">
          <div class="actlog-filters__row">
            <span class="actlog-filters__label">日付</span>
            <div class="actlog-filters__dates">
              <button class="actlog-date-btn" id="actlog-start-date" data-actlog="open-start-date">
                <svg class="actlog-date-btn__icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4.75 0a.75.75 0 0 1 .75.75V2h5V.75a.75.75 0 0 1 1.5 0V2h1.25c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 13.25 16H2.75A1.75 1.75 0 0 1 1 14.25V3.75C1 2.784 1.784 2 2.75 2H4V.75A.75.75 0 0 1 4.75 0ZM2.5 7.5v6.75c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25V7.5Zm10.75-4H2.75a.25.25 0 0 0-.25.25V6h11V3.75a.25.25 0 0 0-.25-.25Z"/></svg>
                <span class="actlog-date-btn__text actlog-date-btn__text--placeholder">開始日</span>
              </button>
              <span class="actlog-filters__sep">〜</span>
              <button class="actlog-date-btn" id="actlog-end-date" data-actlog="open-end-date">
                <svg class="actlog-date-btn__icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4.75 0a.75.75 0 0 1 .75.75V2h5V.75a.75.75 0 0 1 1.5 0V2h1.25c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 13.25 16H2.75A1.75 1.75 0 0 1 1 14.25V3.75C1 2.784 1.784 2 2.75 2H4V.75A.75.75 0 0 1 4.75 0ZM2.5 7.5v6.75c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25V7.5Zm10.75-4H2.75a.25.25 0 0 0-.25.25V6h11V3.75a.25.25 0 0 0-.25-.25Z"/></svg>
                <span class="actlog-date-btn__text actlog-date-btn__text--placeholder">終了日</span>
              </button>
              <button class="btn btn--ghost btn--sm actlog-clear-date-btn" data-actlog="clear-date">クリア</button>
            </div>
          </div>
          <div class="actlog-filters__row">
            <span class="actlog-filters__label">ページ</span>
            <div class="actlog-filters__pages" id="actlog-page-filter">
              ${Object.entries(PAGE_META).map(([key, { label, color }]) => `
                <label class="actlog-page-chip" data-page="${key}">
                  <input type="checkbox" value="${key}" checked>
                  <span class="actlog-page-chip__badge" style="background:${color}"></span>
                  <span>${escapeHtml(label)}</span>
                </label>
              `).join('')}
            </div>
          </div>
        </div>
        <div class="actlog-modal__body" id="actlog-list-wrap">
          <ul class="actlog-list" id="actlog-list" aria-label="アクティビティ一覧"></ul>
          <div class="actlog-sentinel" id="actlog-sentinel"></div>
          <div class="actlog-loading" id="actlog-loading" hidden>
            <span class="actlog-loading__dot"></span>
            <span class="actlog-loading__dot"></span>
            <span class="actlog-loading__dot"></span>
          </div>
          <div class="actlog-empty" id="actlog-empty" hidden>記録がありません</div>
        </div>
      </div>
    `;

    // イベント
    _el.addEventListener('click', e => {
      const action = e.target.closest('[data-actlog]')?.dataset.actlog;
      if (action === 'close') hide();
      if (e.target === _el) hide(); // オーバーレイクリックで閉じる
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !_el.hasAttribute('hidden')) hide();
    });

    // 日付フィルター（DatePicker 経由）
    _el.querySelector('[data-actlog="open-start-date"]').addEventListener('click', () => {
      DatePicker.open(
        _filters.startDate,
        dateStr => { _filters.startDate = dateStr; _updateDateBtn('actlog-start-date', dateStr); _reload(); },
        ()      => { _filters.startDate = '';       _updateDateBtn('actlog-start-date', '');      _reload(); },
      );
    });
    _el.querySelector('[data-actlog="open-end-date"]').addEventListener('click', () => {
      DatePicker.open(
        _filters.endDate,
        dateStr => { _filters.endDate = dateStr; _updateDateBtn('actlog-end-date', dateStr); _reload(); },
        ()      => { _filters.endDate = '';      _updateDateBtn('actlog-end-date', '');     _reload(); },
      );
    });
    _el.querySelector('[data-actlog="clear-date"]').addEventListener('click', () => {
      _filters.startDate = '';
      _filters.endDate   = '';
      _updateDateBtn('actlog-start-date', '');
      _updateDateBtn('actlog-end-date',   '');
      _reload();
    });

    // ページフィルターチェックボックス
    _el.querySelector('#actlog-page-filter').addEventListener('change', e => {
      if (e.target.type !== 'checkbox') return;
      const page = e.target.value;
      if (e.target.checked) _filters.pages.add(page);
      else _filters.pages.delete(page);
      _reload();
    });

    document.body.appendChild(_el);
  }

  function _applyFiltersToUI() {
    if (!_el) return;
    _updateDateBtn('actlog-start-date', _filters.startDate);
    _updateDateBtn('actlog-end-date',   _filters.endDate);
    _el.querySelectorAll('#actlog-page-filter input[type="checkbox"]').forEach(cb => {
      cb.checked = _filters.pages.has(cb.value);
    });
  }

  /** 日付ボタンの表示テキストを更新する */
  function _updateDateBtn(id, dateStr) {
    const btn = _el?.querySelector(`#${id}`);
    if (!btn) return;
    const span = btn.querySelector('.actlog-date-btn__text');
    if (dateStr) {
      const [y, m, d] = dateStr.split('-');
      if (span) {
        span.textContent = `${y}/${m}/${d}`;
        span.classList.remove('actlog-date-btn__text--placeholder');
      }
      btn.classList.add('actlog-date-btn--set');
    } else {
      const isStart = id === 'actlog-start-date';
      if (span) {
        span.textContent = isStart ? '開始日' : '終了日';
        span.classList.add('actlog-date-btn__text--placeholder');
      }
      btn.classList.remove('actlog-date-btn--set');
    }
  }

  function _resetState() {
    _offset  = 0;
    _hasMore = true;
    _loading = false;
    if (_observer) { _observer.disconnect(); _observer = null; }
    const list = _el?.querySelector('#actlog-list');
    if (list) list.innerHTML = '';
    _el?.querySelector('#actlog-empty')?.setAttribute('hidden', '');
    _el?.querySelector('#actlog-loading')?.setAttribute('hidden', '');
    _setupObserver();
  }

  function _reload() {
    _resetState();
    _loadMore();
  }

  function _setupObserver() {
    const sentinel = _el?.querySelector('#actlog-sentinel');
    if (!sentinel) return;
    _observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && _hasMore && !_loading) _loadMore();
    }, { rootMargin: '100px' });
    _observer.observe(sentinel);
  }

  // =============================================
  // データ取得・描画
  // =============================================

  async function _loadMore() {
    if (_loading || !_hasMore) return;
    _loading = true;
    _el?.querySelector('#actlog-loading')?.removeAttribute('hidden');

    try {
      // ページフィルターが空なら0件扱い
      if (_filters.pages.size === 0) {
        _hasMore = false;
        _showEmptyIfNeeded();
        return;
      }

      // page フィルターが全選択 or 一部選択に応じてクエリ
      const pages = [..._filters.pages];
      const allPages = Object.keys(PAGE_META);
      const isAllSelected = allPages.every(p => _filters.pages.has(p));

      let logs = [];
      if (isAllSelected) {
        // 全ページ対象: page フィルターなしで一括取得
        logs = await ActivityDB.query({
          startDate: _filters.startDate,
          endDate:   _filters.endDate,
          limit:     _LIMIT,
          offset:    _offset,
        });
      } else {
        // 選択ページのみ: 各ページを個別に取得してマージ（簡易実装）
        const perLimit = Math.ceil(_LIMIT / pages.length) + 10;
        const results  = await Promise.all(pages.map(p =>
          ActivityDB.query({
            page:      p,
            startDate: _filters.startDate,
            endDate:   _filters.endDate,
            limit:     perLimit,
            offset:    0, // 複数ページ混在時はoffsetが正確でないので全取得で補正
          })
        ));
        // マージして新しい順にソート
        logs = results.flat().sort((a, b) => b.created_at.localeCompare(a.created_at))
                      .slice(_offset, _offset + _LIMIT);
      }

      if (logs.length < _LIMIT) _hasMore = false;
      _offset += logs.length;
      _renderLogs(logs);
      _showEmptyIfNeeded();
    } catch (err) {
      console.error('[ActivityLogModal] ログ取得失敗:', err);
    } finally {
      _loading = false;
      _el?.querySelector('#actlog-loading')?.setAttribute('hidden', '');
    }
  }

  function _showEmptyIfNeeded() {
    const list  = _el?.querySelector('#actlog-list');
    const empty = _el?.querySelector('#actlog-empty');
    if (!list || !empty) return;
    empty.toggleAttribute('hidden', list.children.length > 0);
  }

  /** ログアイテム群を描画する */
  function _renderLogs(logs) {
    const list = _el?.querySelector('#actlog-list');
    if (!list) return;

    let lastDateLabel = null;
    // 既存のアイテムから最後の日付ラベルを取得
    const existingGroups = list.querySelectorAll('.actlog-date-group');
    if (existingGroups.length > 0) {
      lastDateLabel = existingGroups[existingGroups.length - 1].dataset.dateLabel;
    }

    logs.forEach(log => {
      const dateLabel = _formatDateLabel(log.created_at);

      // 日付グループヘッダー
      if (dateLabel !== lastDateLabel) {
        lastDateLabel = dateLabel;
        const header = document.createElement('li');
        header.className = 'actlog-date-group';
        header.dataset.dateLabel = dateLabel;
        header.textContent = dateLabel;
        list.appendChild(header);
      }

      // ログアイテム
      const meta = PAGE_META[log.page] || { label: log.page, color: '#888' };
      const actionLabel = ACTION_LABEL[log.action] || log.action;
      const time = _formatTime(log.created_at);

      const li = document.createElement('li');
      li.className = 'actlog-item';
      li.innerHTML = `
        <span class="actlog-item__badge" style="background:${meta.color}">${escapeHtml(meta.label)}</span>
        <span class="actlog-item__summary">${escapeHtml(log.summary)}</span>
        <span class="actlog-item__time">${time}</span>
      `;
      list.appendChild(li);
    });
  }

  // =============================================
  // 日時フォーマット
  // =============================================

  function _formatDateLabel(isoStr) {
    const d     = new Date(isoStr);
    const today = new Date();
    const diff  = _dayDiff(today, d);
    if (diff === 0) return '今日';
    if (diff === 1) return '昨日';
    // 今年なら MM/DD、去年以前は YYYY/MM/DD
    const sameYear = d.getFullYear() === today.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return sameYear ? `${mm}/${dd}` : `${d.getFullYear()}/${mm}/${dd}`;
  }

  function _formatTime(isoStr) {
    const d  = new Date(isoStr);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  function _dayDiff(a, b) {
    const aDay = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    const bDay = new Date(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.floor((aDay - bDay) / 86400000);
  }

  return { show, hide };
})();
