'use strict';

// ==================================================
// グローバル検索
// ==================================================

// 検索ステート
let _searchTimer     = null;    // debounce タイマー
let _searchId        = 0;       // 進行中の検索 ID（古い結果を捨てるため）
let _searchResults   = [];      // 集約結果
let _searchExpected  = 0;       // 期待するレスポンス数
let _searchReceived  = 0;       // 受信済みレスポンス数
let _searchFocusIdx  = -1;      // キーボードフォーカス中のアイテム index

/** グローバル検索バーのイベントを初期化する */
function _initGlobalSearch(wrap) {
  const input   = wrap.querySelector('#global-search-input');
  const results = wrap.querySelector('#global-search-results');
  if (!input || !results) return;

  // 入力: debounce 300ms で検索実行
  input.addEventListener('input', () => {
    clearTimeout(_searchTimer);
    const q = input.value.trim();
    if (!q) { _closeSearchResults(); return; }
    _searchTimer = setTimeout(() => _runGlobalSearch(q), 300);
  });

  // フォーカスアウト: 少し待ってから閉じる（クリックを拾うため）
  input.addEventListener('blur', () => {
    setTimeout(() => _closeSearchResults(), 200);
  });

  // キーボード: 上下で選択、Enter で遷移、Escape で閉じる
  input.addEventListener('keydown', (e) => {
    const items = results.querySelectorAll('.global-search__item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _searchFocusIdx = Math.min(_searchFocusIdx + 1, items.length - 1);
      _updateSearchFocus(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _searchFocusIdx = Math.max(_searchFocusIdx - 1, -1);
      _updateSearchFocus(items);
    } else if (e.key === 'Enter') {
      const focused = results.querySelector('.global-search__item--focused');
      if (focused) focused.click();
    } else if (e.key === 'Escape') {
      _closeSearchResults();
      input.blur();
    }
  });
}

/** 検索結果ドロップダウンを閉じる */
function _closeSearchResults() {
  const results = document.getElementById('global-search-results');
  if (results) results.hidden = true;
  _searchFocusIdx = -1;
}

/** キーボードフォーカスを更新する */
function _updateSearchFocus(items) {
  items.forEach((item, i) => {
    item.classList.toggle('global-search__item--focused', i === _searchFocusIdx);
    if (i === _searchFocusIdx) item.scrollIntoView({ block: 'nearest' });
  });
}

/** 全 iframe に検索クエリを送信して結果を集約する */
async function _runGlobalSearch(query) {
  const sid = ++_searchId;
  _searchResults  = [];
  _searchExpected = 0;
  _searchReceived = 0;
  _searchFocusIdx = -1;

  const results = document.getElementById('global-search-results');
  if (!results) return;
  results.hidden = false;
  results.innerHTML = '<div class="global-search__loading">検索中...</div>';

  // 表示中の iframe のみ対象
  const frames = Array.from(document.querySelectorAll('.tab-frame'));
  const visibleFrames = frames.filter(f => f.contentWindow);
  _searchExpected = visibleFrames.length;

  if (visibleFrames.length === 0) {
    _renderSearchResults(query, []);
    return;
  }

  visibleFrames.forEach(frame => {
    try {
      frame.contentWindow.postMessage({ type: 'global-search', query, searchId: sid }, '*');
    } catch (e) {
      _searchReceived++;
    }
  });

  // 600ms のフォールバックタイムアウト（応答しない iframe がある場合）
  setTimeout(() => {
    if (_searchId === sid) _renderSearchResults(query, _searchResults);
  }, 600);
}

/** global-search-result メッセージを受信する（window.addEventListener の message ハンドラで呼ばれる） */
function _onGlobalSearchResult(sid, page, pageSrc, results) {
  if (sid !== _searchId) return;  // 古い検索の結果は無視

  results.forEach(r => _searchResults.push({ ...r, page, pageSrc }));
  _searchReceived++;

  // 全 iframe から応答を受け取ったら即時描画
  if (_searchReceived >= _searchExpected) {
    const input = document.getElementById('global-search-input');
    _renderSearchResults(input?.value?.trim() || '', _searchResults);
  }
}

/** テキスト内の検索クエリを <mark> でハイライトする（XSS 対策: エスケープ済みテキストに適用） */
function _highlightQuery(text, query) {
  if (!query || !text) return escapeHtml(text || '');
  const escaped = escapeHtml(text);
  const q = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escaped.replace(new RegExp(q, 'gi'), m => `<mark>${m}</mark>`);
}

/** 検索結果をページ別グループで描画する */
function _renderSearchResults(query, allResults) {
  const el = document.getElementById('global-search-results');
  if (!el) return;
  el.hidden = false;

  if (allResults.length === 0) {
    el.innerHTML = '<div class="global-search__empty">一致する結果がありません</div>';
    return;
  }

  // ページ別グループ化（pageSrc をキーに）
  const groups = {};
  allResults.forEach(r => {
    const key = r.page || r.pageSrc || 'その他';
    if (!groups[key]) groups[key] = { page: r.page, pageSrc: r.pageSrc, items: [] };
    groups[key].items.push(r);
  });

  let html = '';
  Object.values(groups).forEach((group, gi) => {
    if (gi > 0) html += '<div class="global-search__divider"></div>';
    html += `<div class="global-search__group-label">${escapeHtml(group.page || 'その他')}</div>`;
    group.items.slice(0, 10).forEach(item => {
      const titleHl   = _highlightQuery(item.title || '', query);
      const excerptHl = item.excerpt ? _highlightQuery(item.excerpt, query) : '';
      html += `
        <button class="global-search__item" data-page-src="${escapeHtml(item.pageSrc || '')}" data-id="${Number(item.id) || 0}">
          <div class="global-search__item-text">
            <div class="title">${titleHl}</div>
            ${excerptHl ? `<div class="excerpt">${excerptHl}</div>` : ''}
          </div>
        </button>
      `;
    });
  });

  el.innerHTML = html;

  // クリックで該当タブに遷移
  el.querySelectorAll('.global-search__item').forEach(btn => {
    btn.addEventListener('click', () => _navigateToResult(btn.dataset.pageSrc, Number(btn.dataset.id)));
  });
}

/** 検索結果をクリックしてタブ切替 + フォーカスを送信する */
async function _navigateToResult(pageSrc, targetId) {
  _closeSearchResults();
  const input = document.getElementById('global-search-input');
  if (input) { input.value = ''; }

  const config = await loadTabConfig();
  // pageSrc が完全一致 or 先頭一致（dashboard.html?instance=... 対応）
  const tab = config.find(t => t.visible && (t.pageSrc === pageSrc || pageSrc?.startsWith(t.pageSrc?.split('?')[0])));
  if (!tab) return;

  const tabId = `TAB-${tab.label}`;
  activateTab(tabId);
  saveToStorage(STORAGE_KEY_ACTIVE_TAB_ID, tabId);

  const iframe = document.getElementById(`frame-${tab.label}`);
  if (!iframe) return;

  const sendFocus = () => {
    iframe.contentWindow?.postMessage({ type: 'global-search-focus', targetId }, '*');
  };
  const doc = iframe.contentDocument;
  if (!doc || doc.readyState === 'complete') {
    sendFocus();
  } else {
    iframe.addEventListener('load', sendFocus, { once: true });
  }
}
