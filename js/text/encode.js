'use strict';

// ==================================================
// テキスト処理ツール — エンコード/デコード
// ==================================================
// Base64, URL, HTML, Unicode の各形式でリアルタイム変換
// ==================================================

// 全4形式をリアルタイムに変換してリスト描画
function renderEncodeResults() {
  const input = document.getElementById('encode-input').value;
  const dir = State.encodeDir;
  const listEl = document.getElementById('encode-result-list');
  listEl.innerHTML = ENCODE_FORMATS.map(({ type, label, desc }) => {
    let result = '', error = '';
    if (input) {
      try {
        result = ENCODE_FNS[type][dir](input);
      } catch (e) {
        error = e.message;
      }
    }
    const safeResult = escapeHtml(result);
    return `<div class="encode-result-item">
      <span class="encode-result-item__label" title="${escapeHtml(desc)}">${escapeHtml(label)}</span>
      ${error
        ? `<span class="encode-result-item__error">${escapeHtml(error)}</span>`
        : `<span class="encode-result-item__value">${result ? safeResult : '<span class="encode-result-item__empty">—</span>'}</span>`
      }
      <button class="btn btn--ghost btn--sm encode-result-item__copy" data-value="${safeResult}"${!result ? ' disabled' : ''}>${Icons.copyFill}</button>
    </div>`;
  }).join('');
}
