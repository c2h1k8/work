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
let _searchQuery     = '';      // 現在の検索クエリ（インクリメンタル描画用）

/** グローバル検索バーのイベントを初期化する */
function _initGlobalSearch(wrap) {
  const input   = wrap.querySelector('#global-search-input');
  const results = wrap.querySelector('#global-search-results');
  if (!input || !results) return;

  // 入力: タブ候補は即時、iframe 検索は debounce 150ms
  input.addEventListener('input', () => {
    clearTimeout(_searchTimer);
    const q = input.value.trim();
    if (!q) { _closeSearchResults(); return; }
    // タブ候補を即時表示
    _renderSearchResults(q, _searchResults);
    // iframe 検索は debounce
    _searchTimer = setTimeout(() => _runGlobalSearch(q), 150);
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
  _searchQuery    = query;

  const results = document.getElementById('global-search-results');
  if (!results) return;
  results.hidden = false;

  // 表示中の iframe のみ対象
  const frames = Array.from(document.querySelectorAll('.tab-frame'));
  const visibleFrames = frames.filter(f => f.contentWindow);
  _searchExpected = visibleFrames.length;

  if (visibleFrames.length === 0) {
    _renderSearchResults(query, []);
    return;
  }

  // タブ候補だけ先に表示（iframe 結果は空）
  _renderSearchResults(query, []);

  visibleFrames.forEach(frame => {
    try {
      frame.contentWindow.postMessage({ type: 'global-search', query, searchId: sid }, '*');
    } catch (e) {
      _searchReceived++;
    }
  });

  // 400ms のフォールバックタイムアウト（応答しない iframe がある場合）
  setTimeout(() => {
    if (_searchId === sid) _renderSearchResults(query, _searchResults);
  }, 400);
}

/** global-search-result メッセージを受信する（window.addEventListener の message ハンドラで呼ばれる） */
function _onGlobalSearchResult(sid, page, pageSrc, results) {
  if (sid !== _searchId) return;  // 古い検索の結果は無視

  results.forEach(r => _searchResults.push({ ...r, page, pageSrc }));
  _searchReceived++;

  // 結果が届くたびにインクリメンタル描画
  _renderSearchResults(_searchQuery || '', _searchResults);
}

/** テキスト内の検索クエリを <mark> でハイライトする（XSS 対策: エスケープ済みテキストに適用） */
function _highlightQuery(text, query) {
  if (!query || !text) return escapeHtml(text || '');
  const escaped = escapeHtml(text);
  const q = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escaped.replace(new RegExp(q, 'gi'), m => `<mark>${m}</mark>`);
}

/** タブ名にマッチするタブ候補を返す */
function _matchTabs(query) {
  if (!query) return [];
  const q = query.toLowerCase();
  const tabs = Array.from(document.querySelectorAll('.tab-btn'));
  return tabs
    .filter(btn => {
      const label = btn.textContent.trim().toLowerCase();
      return label.includes(q);
    })
    .map(btn => ({
      label: btn.textContent.trim(),
      tabId: btn.htmlFor,
    }));
}

/** 検索結果をページ別グループで描画する */
function _renderSearchResults(query, allResults) {
  const el = document.getElementById('global-search-results');
  if (!el) return;
  el.hidden = false;

  // タブ候補を先頭に表示
  const tabMatches = _matchTabs(query);

  if (allResults.length === 0 && tabMatches.length === 0) {
    el.innerHTML = '<div class="global-search__empty">一致する結果がありません</div>';
    return;
  }

  let html = '';

  // タブ候補グループ
  if (tabMatches.length > 0) {
    html += '<div class="global-search__group-label">タブ</div>';
    tabMatches.forEach(tab => {
      const titleHl = _highlightQuery(tab.label, query);
      html += `
        <button class="global-search__item global-search__item--tab" data-tab-id="${escapeHtml(tab.tabId)}">
          <div class="global-search__item-text">
            <div class="title">${titleHl}</div>
            <div class="excerpt">タブに切替</div>
          </div>
        </button>
      `;
    });
  }

  // ページ別グループ化（pageSrc をキーに）
  const groups = {};
  allResults.forEach(r => {
    const key = r.page || r.pageSrc || 'その他';
    if (!groups[key]) groups[key] = { page: r.page, pageSrc: r.pageSrc, items: [] };
    groups[key].items.push(r);
  });

  Object.values(groups).forEach((group) => {
    if (html) html += '<div class="global-search__divider"></div>';
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

  // タブ候補クリックでタブ切替
  el.querySelectorAll('.global-search__item--tab').forEach(btn => {
    btn.addEventListener('click', () => {
      _closeSearchResults();
      const input = document.getElementById('global-search-input');
      if (input) input.value = '';
      activateTab(btn.dataset.tabId);
      saveToStorage(STORAGE_KEY_ACTIVE_TAB_ID, btn.dataset.tabId);
    });
  });

  // コンテンツ結果クリックで該当タブに遷移
  el.querySelectorAll('.global-search__item:not(.global-search__item--tab)').forEach(btn => {
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
