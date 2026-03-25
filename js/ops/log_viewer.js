'use strict';

// ==================================================
// 運用ツール — ログビューア
// ==================================================
// ログのパース・仮想スクロール・フィルタリング・
// サマリー表示
// ==================================================

// ── 仮想スクロール定数 ────────────────────────────
const LOG_ROW_HEIGHT = 24;   // 1行の高さ(px)
const LOG_OVERSCAN   = 20;   // ビューポート外のバッファ行数

// ── レベル検出 ────────────────────────────────────
function detectLevel(text) {
  for (const pat of LOG_LEVEL_PATTERNS) {
    if (pat.regex.test(text)) return { level: pat.level, color: pat.color };
  }
  return { level: 'OTHER', color: 'other' };
}

// ── タイムスタンプ検出 ────────────────────────────
function detectTimestamp(text) {
  for (const pat of TIMESTAMP_PATTERNS) {
    const m = text.match(pat);
    if (m) {
      try {
        let raw = m[0];
        if (/^\w{3}\s+\d/.test(raw)) raw = `${new Date().getFullYear()} ${raw}`;
        const d = new Date(raw);
        if (!isNaN(d.getTime())) return d;
      } catch (_) { /* パース失敗は無視 */ }
    }
  }
  return null;
}

// ── ログ行パース ──────────────────────────────────
function parseLogLines(text) {
  return text.split('\n').map((lineText, i) => {
    const { level, color } = detectLevel(lineText);
    const timestamp = detectTimestamp(lineText);
    return {
      lineNo: i + 1,
      text: lineText,
      textLower: lineText.toLowerCase(), // フィルタ検索用キャッシュ
      level,
      color,
      timestamp,
    };
  });
}

// ── フィルタリング（データ層） ────────────────────
// DOM操作なしでフィルタ済み行配列を返す
function getFilteredLines() {
  const { levels, startTime, endTime, text } = State.filters;
  const needle = text.toLowerCase();
  const counts = { ERROR: 0, WARN: 0, INFO: 0, DEBUG: 0, OTHER: 0 };
  const filtered = [];

  for (const line of State.logLines) {
    if (!levels[line.level]) continue;
    if (needle && !line.textLower.includes(needle)) continue;
    if (line.timestamp) {
      const ts = line.timestamp.getTime();
      if (startTime && ts < startTime) continue;
      if (endTime && ts > endTime) continue;
    }
    filtered.push(line);
    counts[line.level] = (counts[line.level] || 0) + 1;
  }
  return { filtered, counts };
}

// ── フィルター適用 ────────────────────────────────
function applyLogFilter() {
  const { filtered, counts } = getFilteredLines();
  State.filteredLines = filtered;
  updateSummary(filtered.length, counts);
  resetVirtualScroll();
}

// ── サマリー更新 ──────────────────────────────────
function updateSummary(visibleCount, counts) {
  document.getElementById('log-total-count').textContent =
    `${visibleCount.toLocaleString()} / ${State.logLines.length.toLocaleString()} 行`;

  const BADGE_DEFS = [
    { level: 'ERROR', color: 'error' },
    { level: 'WARN',  color: 'warn'  },
    { level: 'INFO',  color: 'info'  },
    { level: 'DEBUG', color: 'debug' },
  ];
  document.getElementById('log-summary-badges').innerHTML =
    BADGE_DEFS
      .filter(b => counts[b.level] > 0)
      .map(b => `<span class="log-level-badge log-level-badge--${b.color}">${b.level}: ${counts[b.level].toLocaleString()}</span>`)
      .join('');
}

// ── 仮想スクロール ────────────────────────────────
// ビューポート内の行のみ DOM に生成する

function resetVirtualScroll() {
  const output = document.getElementById('log-output');
  const lines  = State.filteredLines;
  const totalHeight = lines.length * LOG_ROW_HEIGHT;

  // スペーサー要素で全体高さを確保
  let spacer = output.querySelector('.log-spacer');
  if (!spacer) {
    spacer = document.createElement('div');
    spacer.className = 'log-spacer';
    output.innerHTML = '';
    output.appendChild(spacer);
  }
  spacer.style.height = `${totalHeight}px`;

  // 既存の行要素を削除（スペーサー以外）
  const existing = output.querySelectorAll('.log-line');
  existing.forEach(el => el.remove());

  // キャッシュをリセットして再描画を強制
  State._vsStart = -1;
  State._vsEnd   = -1;
  output.scrollTop = 0;
  renderVisibleLines();
}

function renderVisibleLines() {
  const output = document.getElementById('log-output');
  const lines  = State.filteredLines;
  if (!lines.length) return;

  const scrollTop   = output.scrollTop;
  const viewHeight  = output.clientHeight;

  // 表示範囲を計算
  const startIdx = Math.max(0, Math.floor(scrollTop / LOG_ROW_HEIGHT) - LOG_OVERSCAN);
  const endIdx   = Math.min(lines.length, Math.ceil((scrollTop + viewHeight) / LOG_ROW_HEIGHT) + LOG_OVERSCAN);

  // 現在描画範囲と同じなら何もしない
  if (State._vsStart === startIdx && State._vsEnd === endIdx) return;
  State._vsStart = startIdx;
  State._vsEnd   = endIdx;

  // 既存行要素を削除してから再描画
  const existing = output.querySelectorAll('.log-line');
  existing.forEach(el => el.remove());

  const fragment = document.createDocumentFragment();
  for (let i = startIdx; i < endIdx; i++) {
    const line = lines[i];
    const div = document.createElement('div');
    div.className = `log-line log-line--${line.color}`;
    div.style.position = 'absolute';
    div.style.top = `${i * LOG_ROW_HEIGHT}px`;
    div.style.left = '0';
    div.style.right = '0';
    div.style.height = `${LOG_ROW_HEIGHT}px`;

    const numSpan = document.createElement('span');
    numSpan.className = 'log-line__num';
    numSpan.textContent = line.lineNo;

    let badgeSpan = null;
    if (line.level !== 'OTHER') {
      badgeSpan = document.createElement('span');
      badgeSpan.className = `log-line__badge log-level-badge log-level-badge--${line.color}`;
      badgeSpan.textContent = line.level;
    }

    const textSpan = document.createElement('span');
    textSpan.className = 'log-line__text';
    textSpan.textContent = line.text;

    div.appendChild(numSpan);
    if (badgeSpan) div.appendChild(badgeSpan);
    div.appendChild(textSpan);
    fragment.appendChild(div);
  }
  output.appendChild(fragment);
}

// ── ログ入力ハンドラ ──────────────────────────────
function onLogInput() {
  const text      = document.getElementById('log-input').value;
  const output    = document.getElementById('log-output');
  const summary   = document.getElementById('log-summary');
  const filterBar = document.getElementById('log-filter-bar');

  if (!text.trim()) {
    output.hidden = summary.hidden = filterBar.hidden = true;
    State.logLines = [];
    State.filteredLines = [];
    return;
  }
  State.logLines = parseLogLines(text);
  // hidden を先に解除して clientHeight が取得できるようにする
  output.hidden = summary.hidden = filterBar.hidden = false;
  applyLogFilter();
}

// ── スクロールイベント初期化 ──────────────────────
function initLogScroll() {
  const output = document.getElementById('log-output');
  let rafPending = false;
  output.addEventListener('scroll', () => {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      renderVisibleLines();
      rafPending = false;
    });
  });
}
