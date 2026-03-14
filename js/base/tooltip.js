// ==========================================
// Tooltip - カスタムツールチップ共通部品
// ==========================================
// 使い方:
//   Tooltip.init(containerEl);
//   → コンテナ内の [data-tooltip] 属性を持つ要素にツールチップを有効化
//
//   オプション:
//   Tooltip.init(containerEl, '[data-tooltip]');  // カスタムセレクター
//
// HTML 例:
//   <div data-tooltip="表示テキスト">...</div>
// ==========================================

const Tooltip = (() => {
  /** ツールチップ DOM 要素（初回 init 時に生成） */
  let _tip = null;

  function _ensureTip() {
    if (_tip) return _tip;
    _tip = document.createElement('div');
    _tip.className = 'tooltip-popup';
    _tip.hidden = true;
    document.body.appendChild(_tip);
    return _tip;
  }

  /**
   * 指定コンテナ内の [data-tooltip] 要素にツールチップを有効化
   * @param {Element} container - イベント委譲するコンテナ
   * @param {string} [selector='[data-tooltip]'] - ツールチップを表示する要素のセレクター
   */
  function init(container, selector = '[data-tooltip]') {
    const tip = _ensureTip();

    // ホバー開始: 即時表示
    container.addEventListener('mouseover', e => {
      const target = e.target.closest(selector);
      if (!target) { tip.hidden = true; return; }
      const text = target.dataset.tooltip;
      if (!text) { tip.hidden = true; return; }
      tip.textContent = text;
      tip.hidden = false;
    });

    // マウス移動: カーソルに追従
    container.addEventListener('mousemove', e => {
      if (tip.hidden) return;
      tip.style.left = (e.clientX + 12) + 'px';
      tip.style.top = (e.clientY - 32) + 'px';
    });

    // ホバー終了: 非表示
    container.addEventListener('mouseout', e => {
      if (e.target.closest(selector)) tip.hidden = true;
    });
  }

  return { init };
})();
