'use strict';

// ==================================================
// テキスト処理ツール — 文字カウント
// ==================================================
// 文字数・バイト数・行数・単語数・全角/半角カウント
// ==================================================

function countStats(text) {
  if (!text) {
    return { chars: 0, charsNoSpace: 0, bytes: 0, lines: 0, words: 0, paragraphs: 0, fullWidth: 0, halfWidth: 0 };
  }
  // サロゲートペア対応: スプレッドで正確な文字数
  const chars = [...text].length;
  // 空文字=0行。それ以外は改行数+1
  const lines = text === '' ? 0 : text.split('\n').length;
  FULL_WIDTH_RE.lastIndex = 0;
  const fullWidthCount = (text.match(FULL_WIDTH_RE) || []).length;
  // 単語 / トークン: 空白・句読点で区切られた連続文字列
  const words = (text.match(/[^\s\u3000、。！？…・\n\r\t]+/g) || []).length;
  // 段落: 空行で区切られたブロック
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim()).length || (text.trim() ? 1 : 0);
  return {
    chars,
    charsNoSpace: [...text.replace(/\s/g, '')].length,
    bytes:        new TextEncoder().encode(text).length,
    lines,
    words,
    paragraphs,
    fullWidth:    fullWidthCount,
    halfWidth:    chars - fullWidthCount,
  };
}

function renderCount() {
  const text = document.getElementById('count-input').value;
  const stats = countStats(text);
  document.getElementById('count-stats').innerHTML = COUNT_STATS_DEF.map(def => `
    <div class="count-stat">
      <div class="count-stat__value">${stats[def.key].toLocaleString()}</div>
      <div class="count-stat__label">${escapeHtml(def.label)}</div>
    </div>
  `).join('');
}
