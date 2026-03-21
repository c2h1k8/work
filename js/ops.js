'use strict';

// ==================================================
// 運用ツール
// ==================================================

// ==================================================
// ログレベルフォーマッタ: 定数
// ==================================================

// ログレベル検出パターン（優先度順、大文字小文字不問）
const LOG_LEVEL_PATTERNS = [
  { level: 'ERROR', regex: /\b(ERROR|FATAL|SEVERE|CRITICAL)\b/i, color: 'error' },
  { level: 'WARN',  regex: /\b(WARN|WARNING)\b/i,                color: 'warn'  },
  { level: 'INFO',  regex: /\b(INFO|NOTICE)\b/i,                 color: 'info'  },
  { level: 'DEBUG', regex: /\b(DEBUG|TRACE|FINE|FINER|FINEST)\b/i, color: 'debug' },
];

// タイムスタンプ検出パターン（複数形式対応）
const TIMESTAMP_PATTERNS = [
  /\d{4}[-/]\d{2}[-/]\d{2}[T ]\d{2}:\d{2}:\d{2}/,   // 2024-01-15 09:30:45 / ISO8601
  /\d{2}[-/]\d{2}[-/]\d{4} \d{2}:\d{2}:\d{2}/,        // 01/15/2024 09:30:45
  /\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}/,               // Jan 15 09:30:45 (syslog)
  /\d{2}:\d{2}:\d{2}[.,]\d{3}/,                         // 09:30:45.123 (ミリ秒付き)
];

// ==================================================
// 状態管理
// ==================================================

const State = {
  /** パース済みログ行: { lineNo, text, level, color, timestamp }[] */
  logLines: [],
  /** フィルター状態 */
  filters: {
    levels: { ERROR: true, WARN: true, INFO: true, DEBUG: true, OTHER: true },
    startTime: null, // ms epoch
    endTime:   null, // ms epoch
    text:      '',   // テキスト絞り込み（大文字小文字不問）
  },
};

const showToast = (msg, type) => Toast.show(msg, type);

// ==================================================
// ログレベルフォーマッタ: パース
// ==================================================

/** テキストからログレベルを検出する */
function detectLevel(text) {
  for (const pat of LOG_LEVEL_PATTERNS) {
    if (pat.regex.test(text)) return { level: pat.level, color: pat.color };
  }
  return { level: 'OTHER', color: 'other' };
}

/** テキストからタイムスタンプを検出して Date に変換する */
function detectTimestamp(text) {
  for (const pat of TIMESTAMP_PATTERNS) {
    const m = text.match(pat);
    if (m) {
      try {
        // syslog形式 (Jan 15 09:30:45) は年が不明なので今年を補完
        let raw = m[0];
        if (/^\w{3}\s+\d/.test(raw)) {
          raw = `${new Date().getFullYear()} ${raw}`;
        }
        const d = new Date(raw);
        if (!isNaN(d.getTime())) return d;
      } catch (_) { /* パース失敗は無視 */ }
    }
  }
  return null;
}

/** ログテキストを行単位でパースして State.logLines に格納する */
function parseLogLines(text) {
  const lines = text.split('\n');
  return lines.map((lineText, i) => {
    const { level, color } = detectLevel(lineText);
    const timestamp = detectTimestamp(lineText);
    return { lineNo: i + 1, text: lineText, level, color, timestamp };
  });
}

// ==================================================
// ログレベルフォーマッタ: レンダリング
// ==================================================

/** ログ行を DOM に描画する（DocumentFragment で一括挿入） */
function renderLogLines() {
  const output = document.getElementById('log-output');
  const fragment = document.createDocumentFragment();

  for (const line of State.logLines) {
    const div = document.createElement('div');
    div.className = `log-line log-line--${line.color}`;
    div.dataset.level = line.level;
    if (line.timestamp) div.dataset.ts = line.timestamp.getTime();

    // 行番号
    const numSpan = document.createElement('span');
    numSpan.className = 'log-line__num';
    numSpan.textContent = line.lineNo;

    // レベルバッジ（OTHER 以外）
    let badgeSpan = null;
    if (line.level !== 'OTHER') {
      badgeSpan = document.createElement('span');
      badgeSpan.className = `log-line__badge log-level-badge log-level-badge--${line.color}`;
      badgeSpan.textContent = line.level;
    }

    // 本文（textContent でエスケープ）
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

/** サマリーバーの件数を更新する */
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
      .map(b =>
        `<span class="log-level-badge log-level-badge--${b.color}">${b.level}: ${counts[b.level].toLocaleString()}</span>`
      )
      .join('');
}

// ==================================================
// ログレベルフォーマッタ: フィルター
// ==================================================

/** フィルターを適用して表示/非表示を切り替え、サマリーを更新する */
function applyLogFilter() {
  const { levels, startTime, endTime, text } = State.filters;
  const needle = text.toLowerCase();
  const lines  = document.querySelectorAll('.log-line');
  const counts = { ERROR: 0, WARN: 0, INFO: 0, DEBUG: 0, OTHER: 0 };
  let visibleCount = 0;

  for (const el of lines) {
    const level = el.dataset.level;
    const ts    = el.dataset.ts ? parseInt(el.dataset.ts, 10) : null;

    let visible = !!levels[level];

    // テキスト絞り込み
    if (visible && needle) {
      const lineText = el.querySelector('.log-line__text')?.textContent ?? '';
      if (!lineText.toLowerCase().includes(needle)) visible = false;
    }

    // 時間範囲フィルター（タイムスタンプ検出済み行のみ）
    if (visible && ts !== null) {
      if (startTime && ts < startTime) visible = false;
      if (endTime   && ts > endTime)   visible = false;
    }

    el.hidden = !visible;
    if (visible) {
      visibleCount++;
      counts[level] = (counts[level] || 0) + 1;
    }
  }

  updateSummary(visibleCount, counts);
}

// ==================================================
// ログレベルフォーマッタ: 入力ハンドラ
// ==================================================

/** textarea の入力内容をパースして表示を更新する */
function onLogInput() {
  const text    = document.getElementById('log-input').value;
  const output  = document.getElementById('log-output');
  const summary = document.getElementById('log-summary');
  const filterBar = document.getElementById('log-filter-bar');

  if (!text.trim()) {
    output.hidden   = true;
    summary.hidden  = true;
    filterBar.hidden = true;
    State.logLines  = [];
    return;
  }

  State.logLines = parseLogLines(text);
  renderLogLines();
  applyLogFilter();
  output.hidden   = false;
  summary.hidden  = false;
  filterBar.hidden = false;
}

// ==================================================
// 初期化
// ==================================================

function init() {
  // ログ入力（paste は非同期で処理）
  const logInput = document.getElementById('log-input');
  logInput.addEventListener('paste',  () => setTimeout(onLogInput, 0));
  logInput.addEventListener('input',  onLogInput);

  // テキスト絞り込み
  document.getElementById('log-text-filter').addEventListener('input', e => {
    State.filters.text = e.target.value;
    applyLogFilter();
  });

  // レベルチェックボックス
  document.querySelectorAll('.log-filter__level input[data-level]').forEach(cb => {
    cb.addEventListener('change', () => {
      State.filters.levels[cb.dataset.level] = cb.checked;
      applyLogFilter();
    });
  });

  // 開始日時ピッカー
  document.getElementById('log-time-start-btn').addEventListener('click', () => {
    const btn   = document.getElementById('log-time-start-btn');
    const label = btn.querySelector('.log-filter__time-btn-label');
    DatePicker.open(
      btn.dataset.value || '',
      (dt) => {
        btn.dataset.value = dt;
        label.textContent = dt.replace('T', ' ');
        btn.classList.add('log-filter__time-btn--set');
        State.filters.startTime = new Date(dt).getTime();
        applyLogFilter();
      },
      () => {
        btn.dataset.value = '';
        label.textContent = '開始日時';
        btn.classList.remove('log-filter__time-btn--set');
        State.filters.startTime = null;
        applyLogFilter();
      },
      { showTime: true }
    );
  });

  // 終了日時ピッカー
  document.getElementById('log-time-end-btn').addEventListener('click', () => {
    const btn   = document.getElementById('log-time-end-btn');
    const label = btn.querySelector('.log-filter__time-btn-label');
    DatePicker.open(
      btn.dataset.value || '',
      (dt) => {
        btn.dataset.value = dt;
        label.textContent = dt.replace('T', ' ');
        btn.classList.add('log-filter__time-btn--set');
        State.filters.endTime = new Date(dt).getTime();
        applyLogFilter();
      },
      () => {
        btn.dataset.value = '';
        label.textContent = '終了日時';
        btn.classList.remove('log-filter__time-btn--set');
        State.filters.endTime = null;
        applyLogFilter();
      },
      { showTime: true }
    );
  });

  // フィルタークリアボタン
  document.getElementById('log-filter-clear').addEventListener('click', () => {
    State.filters = {
      levels: { ERROR: true, WARN: true, INFO: true, DEBUG: true, OTHER: true },
      startTime: null,
      endTime:   null,
      text:      '',
    };
    document.querySelectorAll('.log-filter__level input[data-level]').forEach(cb => {
      cb.checked = true;
    });
    document.getElementById('log-text-filter').value = '';
    const startBtn = document.getElementById('log-time-start-btn');
    const endBtn   = document.getElementById('log-time-end-btn');
    startBtn.dataset.value = '';
    startBtn.querySelector('.log-filter__time-btn-label').textContent = '開始日時';
    startBtn.classList.remove('log-filter__time-btn--set');
    endBtn.dataset.value   = '';
    endBtn.querySelector('.log-filter__time-btn-label').textContent = '終了日時';
    endBtn.classList.remove('log-filter__time-btn--set');
    applyLogFilter();
  });

  // テーマ変更（親フレームからの postMessage）
  window.addEventListener('message', e => {
    if (e.data?.type === 'theme-change') {
      document.documentElement.setAttribute('data-theme', e.data.theme);
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
