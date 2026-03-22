'use strict';

// ==================================================
// 運用ツール — HTTPステータスコード辞典
// ==================================================
// アコーディオン形式のステータスコード一覧レンダリング
// ==================================================

// ── アコーディオン描画 ────────────────────────────
function renderHttpAccordion() {
  const accordion = document.getElementById('http-accordion');
  const query     = State.httpSearch.toLowerCase();
  const starOnly  = State.httpStarOnly;

  // フィルター適用
  const filtered = HTTP_STATUS_CODES.filter(c => {
    if (starOnly && !c.starred) return false;
    if (query) {
      const matchCode = c.code.toString().includes(query);
      const matchName = c.name.toLowerCase().includes(query);
      return matchCode || matchName;
    }
    return true;
  });

  const html = STATUS_CATEGORIES.map(cat => {
    const codes = filtered.filter(c => c.category === cat.prefix);
    if (codes.length === 0 && query) return ''; // 検索時は空カテゴリを非表示

    const isOpen = query
      ? codes.length > 0  // 検索時はマッチするカテゴリを展開
      : State.httpOpenCats.has(cat.prefix);

    return `
      <div class="http-cat" data-cat="${cat.prefix}">
        <button class="http-cat__header" data-action="toggle-cat" data-cat="${cat.prefix}"
          style="--cat-color: var(${cat.colorVar})">
          <span class="http-cat__name">${cat.prefix} ${cat.label}</span>
          <span class="http-cat__desc">${cat.desc}</span>
          <span class="http-cat__badge">${codes.length}</span>
          <svg class="http-cat__chevron ${isOpen ? 'http-cat__chevron--open' : ''}"
            viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M4.427 7.427l3.396 3.396a.25.25 0 0 0 .354 0l3.396-3.396A.25.25 0 0 0 11.396 7H4.604a.25.25 0 0 0-.177.427Z"/>
          </svg>
        </button>
        <div class="http-cat__body ${isOpen ? 'http-cat__body--open' : ''}">
          <div class="http-cards">
            ${codes.map(c => renderHttpCard(c, cat.colorVar)).join('')}
          </div>
        </div>
      </div>`;
  }).join('');

  accordion.innerHTML = html || '<p class="http-empty">該当するステータスコードが見つかりません</p>';
}

// ── カード描画 ────────────────────────────────────
function renderHttpCard(c, colorVar) {
  return `
    <div class="http-card">
      <div class="http-card__head" style="--cat-color: var(${colorVar})">
        <span class="http-card__code">${c.code}</span>
        <span class="http-card__name">${escapeHtml(c.name)}</span>
        ${c.starred ? '<span class="http-card__star" title="よく使うコード">★</span>' : ''}
        <button class="http-card__copy btn btn--ghost btn--sm" data-copy="${c.code}" title="${c.code} をコピー">
          コピー
        </button>
      </div>
      <div class="http-card__body">
        <div class="http-card__row"><span class="http-card__row-label">概要</span><span>${escapeHtml(c.description)}</span></div>
        <div class="http-card__row"><span class="http-card__row-label">原因</span><span>${escapeHtml(c.cause)}</span></div>
        <div class="http-card__row"><span class="http-card__row-label">対処</span><span>${escapeHtml(c.solution)}</span></div>
      </div>
    </div>`;
}
