'use strict';

// ==================================================
// 運用ツール — ログビューア
// ==================================================
// ログのパース・レンダリング・フィルタリング・
// サマリー表示
// ==================================================

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
    return { lineNo: i + 1, text: lineText, level, color, timestamp };
  });
}

// ── ログ行レンダリング ────────────────────────────
function renderLogLines() {
  const output   = document.getElementById('log-output');
  const fragment = document.createDocumentFragment();
  for (const line of State.logLines) {
    const div = document.createElement('div');
    div.className = `log-line log-line--${line.color}`;
    div.dataset.level = line.level;
    if (line.timestamp) div.dataset.ts = line.timestamp.getTime();

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
  output.innerHTML = '';
  output.appendChild(fragment);
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

// ── フィルター適用 ────────────────────────────────
function applyLogFilter() {
  const { levels, startTime, endTime, text } = State.filters;
  const needle  = text.toLowerCase();
  const lines   = document.querySelectorAll('.log-line');
  const counts  = { ERROR: 0, WARN: 0, INFO: 0, DEBUG: 0, OTHER: 0 };
  let visibleCount = 0;

  for (const el of lines) {
    const level = el.dataset.level;
    const ts    = el.dataset.ts ? parseInt(el.dataset.ts, 10) : null;
    let visible = !!levels[level];

    if (visible && needle) {
      const lineText = el.querySelector('.log-line__text')?.textContent ?? '';
      if (!lineText.toLowerCase().includes(needle)) visible = false;
    }
    if (visible && ts !== null) {
      if (startTime && ts < startTime) visible = false;
      if (endTime   && ts > endTime)   visible = false;
    }

    el.hidden = !visible;
    if (visible) { visibleCount++; counts[level] = (counts[level] || 0) + 1; }
  }
  updateSummary(visibleCount, counts);
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
    return;
  }
  State.logLines = parseLogLines(text);
  renderLogLines();
  applyLogFilter();
  output.hidden = summary.hidden = filterBar.hidden = false;
}
