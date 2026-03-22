'use strict';

// ==================================================
// テキスト処理ツール — ケース変換
// ==================================================
// テキストを各種命名規則に変換（camelCase, snake_case 等）
// ==================================================

// テキストを単語配列に分割する（各種デリミタ・camelCase・PascalCase対応）
function toWords(str) {
  return str
    .replace(/([a-z])([A-Z])/g, '$1 $2')         // camelCase → camel Case
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')   // ABCDef → ABC Def
    .replace(/[-_.]+/g, ' ')                      // ハイフン・アンダースコア・ドット → スペース
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function renderCaseResults() {
  const input = document.getElementById('case-input').value;
  // 複数行対応: 各行を個別に変換して \n で結合
  const lines = input.split('\n');
  const list = document.getElementById('case-result-list');
  list.innerHTML = CASE_FORMATS.map(fmt => {
    let result = '';
    try {
      if (input) {
        result = lines.map(line => line ? fmt.fn(line) : '').join('\n');
      }
    } catch (_) { result = ''; }
    const safeResult = escapeHtml(result);
    const safeLabel = escapeHtml(fmt.label);
    return `<div class="case-item">
      <span class="case-item__label">${safeLabel}</span>
      <span class="case-item__value">${result ? safeResult : '<span class="case-item__empty">—</span>'}</span>
      <button class="case-item__copy btn btn--ghost btn--sm" data-value="${safeResult}"${!result ? ' disabled' : ''}>${Icons.copyFill}</button>
    </div>`;
  }).join('');
}
