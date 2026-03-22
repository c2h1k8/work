'use strict';

// ==================================================
// 運用ツール — メイン JS
// ==================================================
// セクション: log-viewer / cron / http-status / ports
// ==================================================

const showToast = (msg, type) => Toast.show(msg, type);

// ==================================================
// タブ切替
// ==================================================

const State = {
  activeSection: 'log-viewer',

  // ログビューア
  logLines: [],
  filters: {
    levels: { ERROR: true, WARN: true, INFO: true, DEBUG: true, OTHER: true },
    startTime: null,
    endTime:   null,
    text:      '',
  },

  // cron式エディタ
  cronTz: 'UTC', // 'UTC' | 'JST'

  // ポート番号
  portsFilter:    'all',   // 'all' | 'builtin' | 'custom'
  portsSearch:    '',
  customPorts:    [],      // IndexedDB から読み込んだカスタムポート
  portsEditingId: null,    // 編集中のカスタムポート ID

  // HTTP ステータス
  httpSearch:    '',
  httpStarOnly:  false,
  httpOpenCats:  new Set(['1xx','2xx','3xx','4xx','5xx']), // デフォルト全展開

};

function switchSection(tool) {
  State.activeSection = tool;

  // タブの active を切り替え
  document.querySelectorAll('.ops-tab').forEach(btn => {
    btn.classList.toggle('ops-tab--active', btn.dataset.tool === tool);
  });

  // ツールパネルの表示切り替え
  document.querySelectorAll('.ops-tool').forEach(el => {
    el.hidden = el.id !== `tool-${tool}`;
  });

  // 初回表示時の遅延初期化
  if (tool === 'http-status' && !State._httpInitialized) {
    renderHttpAccordion();
    State._httpInitialized = true;
  }
  if (tool === 'ports' && !State._portsInitialized) {
    loadAndRenderPorts();
    State._portsInitialized = true;
  }
  if (tool === 'cron' && !State._cronInitialized) {
    initCronBuilder();
    updateCron();
    State._cronInitialized = true;
  }
}

// ==================================================
// ログビューア: 定数
// ==================================================

const LOG_LEVEL_PATTERNS = [
  { level: 'ERROR', regex: /\b(ERROR|FATAL|SEVERE|CRITICAL)\b/i, color: 'error' },
  { level: 'WARN',  regex: /\b(WARN|WARNING)\b/i,                color: 'warn'  },
  { level: 'INFO',  regex: /\b(INFO|NOTICE)\b/i,                 color: 'info'  },
  { level: 'DEBUG', regex: /\b(DEBUG|TRACE|FINE|FINER|FINEST)\b/i, color: 'debug' },
];

const TIMESTAMP_PATTERNS = [
  /\d{4}[-/]\d{2}[-/]\d{2}[T ]\d{2}:\d{2}:\d{2}/,
  /\d{2}[-/]\d{2}[-/]\d{4} \d{2}:\d{2}:\d{2}/,
  /\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}/,
  /\d{2}:\d{2}:\d{2}[.,]\d{3}/,
];

// ==================================================
// ログビューア: パース & レンダリング
// ==================================================

function detectLevel(text) {
  for (const pat of LOG_LEVEL_PATTERNS) {
    if (pat.regex.test(text)) return { level: pat.level, color: pat.color };
  }
  return { level: 'OTHER', color: 'other' };
}

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

function parseLogLines(text) {
  return text.split('\n').map((lineText, i) => {
    const { level, color } = detectLevel(lineText);
    const timestamp = detectTimestamp(lineText);
    return { lineNo: i + 1, text: lineText, level, color, timestamp };
  });
}

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

// ==================================================
// cron式エディタ: パーサー
// ==================================================

/**
 * cron フィールドの値セット（数値 Set）を返す
 * @param {string} field  cron フィールド文字列
 * @param {number} min    最小値
 * @param {number} max    最大値
 * @returns {Set<number>}
 */
function parseCronField(field, min, max) {
  const values = new Set();
  for (const part of field.split(',')) {
    if (part === '*') {
      for (let i = min; i <= max; i++) values.add(i);
    } else if (part.includes('/')) {
      const [range, step] = part.split('/');
      const s = parseInt(step, 10);
      if (isNaN(s) || s <= 0) throw new Error(`不正なステップ: ${part}`);
      const start = range === '*' ? min : parseInt(range, 10);
      for (let i = start; i <= max; i += s) values.add(i);
    } else if (part.includes('-')) {
      const [lo, hi] = part.split('-').map(Number);
      for (let i = lo; i <= hi; i++) values.add(i);
    } else {
      const n = parseInt(part, 10);
      if (isNaN(n)) throw new Error(`不正な値: ${part}`);
      values.add(n);
    }
  }
  for (const v of values) {
    if (v < min || v > max) throw new Error(`範囲外の値: ${v}（${min}-${max}）`);
  }
  return values;
}

/**
 * cron 式を解析して各フィールドの値セットを返す
 * @param {string} expr  cron 式（5フィールド）
 * @returns {{ min, hour, day, month, dow }}
 */
function parseCron(expr) {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error('cron 式は 5 フィールドで入力してください（例: 0 9 * * *）');
  const [minF, hourF, dayF, monthF, dowF] = parts;
  return {
    min:   parseCronField(minF,   0, 59),
    hour:  parseCronField(hourF,  0, 23),
    day:   parseCronField(dayF,   1, 31),
    month: parseCronField(monthF, 1, 12),
    dow:   parseCronField(dowF,   0, 6),
  };
}

/**
 * cron 式にマッチする次回実行日時を count 件返す（タイムゾーン対応）
 * @param {string} expr
 * @param {number} count
 * @param {Date}   fromDate
 * @param {number} tzOffsetHours  タイムゾーンオフセット（JST=9, UTC=0）
 * @returns {Date[]}  実際の UTC タイムスタンプ
 */
function getNextExecutions(expr, count, fromDate, tzOffsetHours) {
  const { min, hour, day, month, dow } = parseCron(expr);
  const results = [];

  // tzMs: 対象タイムゾーンの UTC からのオフセット（ms）
  const tzMs = tzOffsetHours * 3600000;

  // fakeMs: 「getUTC*() で読むと対象TZの壁時計時刻になる」仮想タイムスタンプ
  // fakeMs = 実UTC ms + tzMs
  let fakeMs = fromDate.getTime() + tzMs;

  // 次の分（秒以下を切り捨て、1分進める）
  fakeMs = Math.floor(fakeMs / 60000) * 60000 + 60000;

  const limitMs = fakeMs + 2 * 365 * 24 * 3600000; // 最大2年

  while (fakeMs < limitMs && results.length < count) {
    const d  = new Date(fakeMs);
    const mo = d.getUTCMonth() + 1;
    const dy = d.getUTCDate();
    const dw = d.getUTCDay();
    const h  = d.getUTCHours();
    const mn = d.getUTCMinutes();

    if (!month.has(mo)) {
      // 翌月1日 00:00 にスキップ
      fakeMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
      continue;
    }
    if (!day.has(dy) || !dow.has(dw)) {
      // 翌日 00:00 にスキップ
      fakeMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
      continue;
    }
    if (!hour.has(h)) {
      // 翌時 00分 にスキップ
      fakeMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours() + 1);
      continue;
    }
    if (!min.has(mn)) {
      fakeMs += 60000;
      continue;
    }

    // fakeMs（対象TZの壁時計）→ 実 UTC タイムスタンプに変換
    results.push(new Date(fakeMs - tzMs));
    fakeMs += 60000;
  }
  return results;
}

/**
 * Date を指定タイムゾーンの文字列にフォーマットする
 * @param {Date}   date
 * @param {number} tzOffsetHours
 * @param {string} tzLabel  表示ラベル（'JST' | 'UTC'）
 * @returns {string}
 */
function formatInTz(date, tzOffsetHours, tzLabel) {
  const DOW_SHORT = ['日','月','火','水','木','金','土'];
  const d = new Date(date.getTime() + tzOffsetHours * 3600000);
  const dow = DOW_SHORT[d.getUTCDay()];
  const yyyy = d.getUTCFullYear();
  const mo   = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dy   = String(d.getUTCDate()).padStart(2, '0');
  const h    = String(d.getUTCHours()).padStart(2, '0');
  const mn   = String(d.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}/${mo}/${dy} (${dow}) ${h}:${mn} <span class="cron-next-list__tz">${tzLabel}</span>`;
}

// ==================================================
// cron式エディタ: 日本語説明
// ==================================================

const DOW_JA  = ['日','月','火','水','木','金','土'];
const MON_JA  = ['1','2','3','4','5','6','7','8','9','10','11','12'];

function setToDesc(set, min, max, unit, names) {
  if (set.size === max - min + 1) return `毎${unit}`;
  const arr = [...set].sort((a,b) => a-b);
  // ステップ判定
  if (arr.length > 2) {
    const step = arr[1] - arr[0];
    if (step > 1 && arr.every((v,i) => i === 0 || v - arr[i-1] === step)) {
      return `${step}${unit}ごと`;
    }
  }
  return arr.map(v => names ? names[v - min] : `${v}`).join('、') + unit;
}

function describeCron(expr) {
  try {
    const { min, hour, day, month, dow } = parseCron(expr);
    const minD   = setToDesc(min,   0, 59, '分');
    const hourD  = setToDesc(hour,  0, 23, '時');
    const dayD   = setToDesc(day,   1, 31, '日');
    const monD   = setToDesc(month, 1, 12, '月', MON_JA);
    const dowD   = setToDesc(dow,   0, 6,  '曜日', DOW_JA);

    const parts = [];
    if (monD !== '毎月') parts.push(monD);
    if (dayD !== '毎日' && dowD === '毎曜日') parts.push(dayD);
    if (dowD !== '毎曜日') parts.push(`${dowD}曜`);
    if (hourD !== '毎時') parts.push(`${hourD}`);
    else parts.push('毎時');
    parts.push(hourD === '毎時' ? minD : `${minD}`);

    // より自然な文章に整形
    const hasDay = dayD !== '毎日' || dowD !== '毎曜日';
    const hasMon = monD !== '毎月';

    let desc = '';
    if (hasMon)   desc += monD + ' の ';
    if (hasDay) {
      if (dayD !== '毎日' && dowD === '毎曜日') desc += dayD + ' ';
      if (dowD !== '毎曜日') desc += DOW_JA[Math.min(...dow)] + '曜日 ';
    }
    if (hourD === '毎時') {
      desc += `毎時 ${minD}`;
    } else if (min.size === 60) {
      desc += `${hourD} 毎分`;
    } else {
      const hArr = [...hour].sort((a,b)=>a-b);
      const mArr = [...min].sort((a,b)=>a-b);
      desc += hArr.map(h => mArr.map(m => `${h}:${String(m).padStart(2,'0')}`).join(' ')).join(' ');
    }
    return desc.trim() || '毎分';
  } catch (e) {
    return null; // エラーは呼び出し側で処理
  }
}

// ==================================================
// cron式エディタ: GUI ビルダー
// ==================================================

function initCronBuilder() {
  // 日 select のオプションを生成（分・時は number input に変更済み）
  const dayFix  = document.getElementById('cron-day-fix');

  for (let i = 1; i <= 31; i++) {
    const o = document.createElement('option');
    o.value = o.textContent = i;
    dayFix.appendChild(o);
  }

  // CustomSelect を適用
  CustomSelect.replaceAll(document.getElementById('cron-builder'));

  // GUIビルダー → cron式 同期
  document.getElementById('cron-builder').addEventListener('change', () => {
    const expr = buildCronFromGui();
    document.getElementById('cron-expr').value = expr;
    updateCron();
  });
}

/** GUI の状態から cron 式文字列を生成する */
function buildCronFromGui() {
  // 分
  const minMode = document.querySelector('input[name="cron-min"]:checked').value;
  let minF;
  if (minMode === '*') minF = '*';
  else if (minMode === 'step') minF = `*/${document.getElementById('cron-min-step').value}`;
  else minF = document.getElementById('cron-min-fix').value;

  // 時
  const hourMode = document.querySelector('input[name="cron-hour"]:checked').value;
  let hourF;
  if (hourMode === '*') hourF = '*';
  else if (hourMode === 'step') hourF = `*/${document.getElementById('cron-hour-step').value}`;
  else hourF = document.getElementById('cron-hour-fix').value;

  // 日
  const dayMode = document.querySelector('input[name="cron-day"]:checked').value;
  const dayF = dayMode === '*' ? '*' : document.getElementById('cron-day-fix').value;

  // 月
  const monthAllCb = document.getElementById('cron-month-all');
  let monthF;
  if (monthAllCb.checked) {
    monthF = '*';
  } else {
    const months = [...document.querySelectorAll('[data-month]:checked')].map(c => c.dataset.month);
    monthF = months.length ? months.join(',') : '*';
  }

  // 曜日
  const dowAllCb = document.getElementById('cron-dow-all');
  let dowF;
  if (dowAllCb.checked) {
    dowF = '*';
  } else {
    const dows = [...document.querySelectorAll('[data-dow]:checked')].map(c => c.dataset.dow);
    dowF = dows.length ? dows.join(',') : '*';
  }

  return `${minF} ${hourF} ${dayF} ${monthF} ${dowF}`;
}

/** cron 式 → GUI に反映（シンプルなパターンのみ対応） */
function syncGuiFromCron(expr) {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return;
  const [minF, hourF, dayF, monthF, dowF] = parts;

  // 分
  if (minF === '*') {
    document.querySelector('input[name="cron-min"][value="*"]').checked = true;
  } else if (minF.startsWith('*/')) {
    document.querySelector('input[name="cron-min"][value="step"]').checked = true;
    const step = minF.slice(2);
    const sel  = document.getElementById('cron-min-step');
    if ([...sel.options].some(o => o.value === step)) { sel.value = step; sel._csInst?.render(); }
  } else if (!minF.includes(',') && !minF.includes('-')) {
    document.querySelector('input[name="cron-min"][value="fix"]').checked = true;
    document.getElementById('cron-min-fix').value = minF;
  }

  // 時
  if (hourF === '*') {
    document.querySelector('input[name="cron-hour"][value="*"]').checked = true;
  } else if (hourF.startsWith('*/')) {
    document.querySelector('input[name="cron-hour"][value="step"]').checked = true;
    const step = hourF.slice(2);
    const sel  = document.getElementById('cron-hour-step');
    if ([...sel.options].some(o => o.value === step)) { sel.value = step; sel._csInst?.render(); }
  } else if (!hourF.includes(',') && !hourF.includes('-')) {
    document.querySelector('input[name="cron-hour"][value="fix"]').checked = true;
    document.getElementById('cron-hour-fix').value = hourF;
  }

  // 日
  if (dayF === '*') {
    document.querySelector('input[name="cron-day"][value="*"]').checked = true;
  } else if (!dayF.includes(',') && !dayF.includes('-')) {
    document.querySelector('input[name="cron-day"][value="fix"]').checked = true;
    const daySel = document.getElementById('cron-day-fix');
    daySel.value = dayF;
    daySel._csInst?.render();
  }

  // 月
  const monthAllCb = document.getElementById('cron-month-all');
  if (monthF === '*') {
    monthAllCb.checked = true;
    document.querySelectorAll('[data-month]').forEach(c => { c.checked = false; });
  } else {
    monthAllCb.checked = false;
    const months = new Set(monthF.split(',').map(Number));
    document.querySelectorAll('[data-month]').forEach(c => {
      c.checked = months.has(parseInt(c.dataset.month, 10));
    });
  }

  // 曜日
  const dowAllCb = document.getElementById('cron-dow-all');
  if (dowF === '*') {
    dowAllCb.checked = true;
    document.querySelectorAll('[data-dow]').forEach(c => { c.checked = false; });
  } else {
    dowAllCb.checked = false;
    // 範囲展開
    const dows = new Set();
    for (const part of dowF.split(',')) {
      if (part.includes('-')) {
        const [lo, hi] = part.split('-').map(Number);
        for (let i = lo; i <= hi; i++) dows.add(i);
      } else {
        dows.add(parseInt(part, 10));
      }
    }
    document.querySelectorAll('[data-dow]').forEach(c => {
      c.checked = dows.has(parseInt(c.dataset.dow, 10));
    });
  }
}

// ==================================================
// cron式エディタ: 更新（入力 → 説明 + 次回実行）
// ==================================================

function updateCron() {
  const expr    = document.getElementById('cron-expr').value.trim();
  const descEl  = document.getElementById('cron-desc');
  const errorEl = document.getElementById('cron-error');
  const listEl  = document.getElementById('cron-next-list');

  // 選択中タイムゾーンの設定
  const isJst       = State.cronTz === 'JST';
  const mainTzOffset = isJst ? 9 : 0;
  const mainTzLabel  = isJst ? 'JST' : 'UTC';
  const subTzOffset  = isJst ? 0 : 9;
  const subTzLabel   = isJst ? 'UTC' : 'JST';

  try {
    const desc = describeCron(expr);
    descEl.textContent = desc || expr;
    errorEl.hidden     = true;

    // 次回実行一覧（選択TZで計算）
    const nexts = getNextExecutions(expr, 10, new Date(), mainTzOffset);
    if (nexts.length === 0) {
      listEl.innerHTML = '<li class="cron-next-list__empty">実行予定が見つかりません（2年以内）</li>';
    } else {
      listEl.innerHTML = nexts.map((d, i) => {
        const mainStr = formatInTz(d, mainTzOffset, mainTzLabel);
        const subStr  = formatInTz(d, subTzOffset,  subTzLabel);
        return `<li class="cron-next-list__item">
          <span class="cron-next-list__num">${i + 1}</span>
          <span class="cron-next-list__date">${mainStr}</span>
          <span class="cron-next-list__sub">${subStr}</span>
        </li>`;
      }).join('');
    }

    // GUI に反映（ビルダーが初期化済みの場合のみ）
    if (State._cronInitialized) syncGuiFromCron(expr);

  } catch (e) {
    descEl.textContent  = '';
    errorEl.textContent = e.message;
    errorEl.hidden      = false;
    listEl.innerHTML    = '';
  }
}

// ==================================================
// HTTP ステータスコード辞典: データ
// ==================================================

const STATUS_CATEGORIES = [
  { prefix: '1xx', label: 'Informational', colorVar: '--c-info',    desc: '情報レスポンス' },
  { prefix: '2xx', label: 'Success',       colorVar: '--c-success', desc: '成功レスポンス' },
  { prefix: '3xx', label: 'Redirection',   colorVar: '--c-warning', desc: 'リダイレクト' },
  { prefix: '4xx', label: 'Client Error',  colorVar: '--c-danger',  desc: 'クライアントエラー' },
  { prefix: '5xx', label: 'Server Error',  colorVar: '--c-danger',  desc: 'サーバエラー' },
];

const HTTP_STATUS_CODES = [
  // 1xx
  { code: 100, name: 'Continue',             category: '1xx', description: 'リクエストの継続を許可', cause: 'クライアントがリクエスト継続の確認を求めた', solution: '残りのリクエストを送信する' },
  { code: 101, name: 'Switching Protocols',  category: '1xx', description: 'プロトコルを切り替える', cause: 'Upgrade ヘッダーで別プロトコルへの切替をリクエスト', solution: 'WebSocket 接続などで正常' },
  { code: 102, name: 'Processing',           category: '1xx', description: 'サーバが処理中', cause: 'WebDAV リクエストなど長時間処理', solution: '完了を待つ' },
  { code: 103, name: 'Early Hints',          category: '1xx', description: 'プリロードヒントを返す', cause: 'Link ヘッダーを先送りしてブラウザに事前ロードさせる', solution: 'パフォーマンス最適化として正常' },
  // 2xx
  { code: 200, name: 'OK',                   category: '2xx', description: 'リクエスト成功', cause: '正常に処理された', solution: '特に対処不要', starred: true },
  { code: 201, name: 'Created',              category: '2xx', description: 'リソース作成成功', cause: 'POST/PUT でリソースが新規作成された', solution: 'Location ヘッダーで新リソース URL を確認' },
  { code: 202, name: 'Accepted',             category: '2xx', description: '受付済み（処理未完了）', cause: '非同期処理のキューに追加された', solution: '別途完了通知を待つ' },
  { code: 204, name: 'No Content',           category: '2xx', description: '成功・レスポンスボディなし', cause: 'DELETE や一部 PUT で正常', solution: '特に対処不要' },
  { code: 206, name: 'Partial Content',      category: '2xx', description: '部分コンテンツ', cause: 'Range ヘッダーで一部リクエストした', solution: '分割ダウンロード・動画ストリーミングで正常' },
  // 3xx
  { code: 301, name: 'Moved Permanently',    category: '3xx', description: '恒久リダイレクト', cause: 'URL が永続的に変更された', solution: 'Location ヘッダーの URL に更新する', starred: true },
  { code: 302, name: 'Found',                category: '3xx', description: '一時リダイレクト', cause: 'URL が一時的に変更された', solution: 'Location ヘッダーの URL にアクセス（元 URL は維持）', starred: true },
  { code: 303, name: 'See Other',            category: '3xx', description: 'GET でリダイレクト', cause: 'POST 後の結果を GET で取得する', solution: 'PRG パターンとして正常' },
  { code: 304, name: 'Not Modified',         category: '3xx', description: 'キャッシュ有効', cause: '条件付きGETでキャッシュが最新', solution: 'キャッシュを使用する（正常）' },
  { code: 307, name: 'Temporary Redirect',   category: '3xx', description: '一時リダイレクト（メソッド維持）', cause: 'POST など元のメソッドを維持したリダイレクト', solution: 'Location ヘッダーの URL に同じメソッドでアクセス' },
  { code: 308, name: 'Permanent Redirect',   category: '3xx', description: '恒久リダイレクト（メソッド維持）', cause: 'メソッドを維持したまま永続的に移動', solution: 'Location ヘッダーの URL に更新する' },
  // 4xx
  { code: 400, name: 'Bad Request',          category: '4xx', description: '不正なリクエスト', cause: 'リクエスト構文・パラメータが不正', solution: 'リクエスト内容を修正する', starred: true },
  { code: 401, name: 'Unauthorized',         category: '4xx', description: '認証が必要', cause: '認証情報がない・無効', solution: 'ログイン・トークン取得を行う', starred: true },
  { code: 403, name: 'Forbidden',            category: '4xx', description: 'アクセス禁止', cause: '認証済みでもリソースへのアクセス権限がない', solution: '権限設定を確認する', starred: true },
  { code: 404, name: 'Not Found',            category: '4xx', description: 'リソースが見つからない', cause: 'URL が誤っている・リソースが削除された', solution: 'URL を確認する', starred: true },
  { code: 405, name: 'Method Not Allowed',   category: '4xx', description: '許可されていない HTTP メソッド', cause: 'GET のみ許可の URL に POST した等', solution: 'Allow ヘッダーで許可メソッドを確認' },
  { code: 408, name: 'Request Timeout',      category: '4xx', description: 'リクエストタイムアウト', cause: 'クライアントがリクエスト送信に時間がかかりすぎた', solution: '再試行する・ネットワークを確認' },
  { code: 409, name: 'Conflict',             category: '4xx', description: 'リソースの競合', cause: 'リソースの現在の状態と矛盾するリクエスト', solution: '最新状態を取得して再試行' },
  { code: 413, name: 'Content Too Large',    category: '4xx', description: 'リクエストサイズ超過', cause: 'ファイルサイズやリクエストボディが上限を超えた', solution: 'ファイルサイズを縮小・サーバの上限を引き上げる' },
  { code: 414, name: 'URI Too Long',         category: '4xx', description: 'URL が長すぎる', cause: 'GET パラメータが多すぎる', solution: 'POST に変更するか URL を短くする' },
  { code: 415, name: 'Unsupported Media Type', category: '4xx', description: 'サポート外のメディアタイプ', cause: 'Content-Type が不正', solution: 'Content-Type ヘッダーを修正する' },
  { code: 422, name: 'Unprocessable Entity', category: '4xx', description: '処理不可能なエンティティ', cause: 'バリデーションエラー（形式は正しいが内容が不正）', solution: 'リクエストボディの値を修正する' },
  { code: 429, name: 'Too Many Requests',    category: '4xx', description: 'レートリミット超過', cause: 'API 呼び出し回数が制限を超えた', solution: 'Retry-After ヘッダーを確認して待機する' },
  { code: 451, name: 'Unavailable For Legal Reasons', category: '4xx', description: '法的理由によりアクセス不可', cause: '法的規制・著作権・地域制限', solution: '法的手続きを確認する' },
  // 5xx
  { code: 500, name: 'Internal Server Error', category: '5xx', description: 'サーバ内部エラー', cause: 'サーバ側でエラーが発生した', solution: 'サーバログを確認する', starred: true },
  { code: 501, name: 'Not Implemented',      category: '5xx', description: '未実装のメソッド', cause: 'サーバが要求されたメソッドをサポートしていない', solution: '対応するメソッドを使用する' },
  { code: 502, name: 'Bad Gateway',          category: '5xx', description: 'ゲートウェイエラー', cause: 'プロキシ・ロードバランサが上流サーバから不正な応答を受けた', solution: '上流サーバを確認する', starred: true },
  { code: 503, name: 'Service Unavailable',  category: '5xx', description: 'サービス利用不可', cause: 'サーバの過負荷・メンテナンス中', solution: 'Retry-After ヘッダーを確認して待機する', starred: true },
  { code: 504, name: 'Gateway Timeout',      category: '5xx', description: 'ゲートウェイタイムアウト', cause: 'プロキシが上流サーバからのレスポンスをタイムアウト', solution: '上流サーバの応答時間を確認する' },
  { code: 507, name: 'Insufficient Storage', category: '5xx', description: 'ストレージ不足', cause: 'サーバのディスクが満杯', solution: 'ディスクを確保する' },
];

// ==================================================
// HTTP ステータスコード辞典: レンダリング
// ==================================================

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

// ==================================================
// ポート番号リファレンス: データ
// ==================================================

const BUILTIN_PORTS = [
  { port: 20,    protocol: 'TCP',  service: 'FTP (データ)',        memo: 'ファイル転送（データ接続）',     isBuiltIn: true },
  { port: 21,    protocol: 'TCP',  service: 'FTP',                memo: 'ファイル転送（制御接続）',       isBuiltIn: true },
  { port: 22,    protocol: 'TCP',  service: 'SSH',                memo: 'セキュアシェル',                isBuiltIn: true },
  { port: 23,    protocol: 'TCP',  service: 'Telnet',             memo: 'リモート接続（非暗号化）',       isBuiltIn: true },
  { port: 25,    protocol: 'TCP',  service: 'SMTP',               memo: 'メール送信',                    isBuiltIn: true },
  { port: 53,    protocol: 'both', service: 'DNS',                memo: '名前解決',                      isBuiltIn: true },
  { port: 67,    protocol: 'UDP',  service: 'DHCP (サーバ)',       memo: 'IPアドレス自動割当',             isBuiltIn: true },
  { port: 68,    protocol: 'UDP',  service: 'DHCP (クライアント)', memo: 'IPアドレス自動取得',             isBuiltIn: true },
  { port: 80,    protocol: 'TCP',  service: 'HTTP',               memo: 'Webサーバ',                     isBuiltIn: true },
  { port: 110,   protocol: 'TCP',  service: 'POP3',               memo: 'メール受信',                    isBuiltIn: true },
  { port: 143,   protocol: 'TCP',  service: 'IMAP',               memo: 'メール受信（サーバ管理）',       isBuiltIn: true },
  { port: 443,   protocol: 'TCP',  service: 'HTTPS',              memo: 'Web（TLS/SSL）',                isBuiltIn: true },
  { port: 445,   protocol: 'TCP',  service: 'SMB',                memo: 'ファイル共有（Windows）',        isBuiltIn: true },
  { port: 465,   protocol: 'TCP',  service: 'SMTPS',              memo: 'メール送信（SSL）',              isBuiltIn: true },
  { port: 514,   protocol: 'UDP',  service: 'Syslog',             memo: 'ログ転送',                      isBuiltIn: true },
  { port: 587,   protocol: 'TCP',  service: 'SMTP (Submission)',  memo: 'メール送信（認証付き）',         isBuiltIn: true },
  { port: 993,   protocol: 'TCP',  service: 'IMAPS',              memo: 'IMAP over SSL',                 isBuiltIn: true },
  { port: 995,   protocol: 'TCP',  service: 'POP3S',              memo: 'POP3 over SSL',                 isBuiltIn: true },
  { port: 1433,  protocol: 'TCP',  service: 'SQL Server',         memo: 'Microsoft SQL Server',          isBuiltIn: true },
  { port: 1521,  protocol: 'TCP',  service: 'Oracle DB',          memo: 'Oracle Database リスナー',       isBuiltIn: true },
  { port: 3000,  protocol: 'TCP',  service: 'Dev Server',         memo: '開発サーバ（Node.js 等）',       isBuiltIn: true },
  { port: 3306,  protocol: 'TCP',  service: 'MySQL',              memo: 'MySQL / MariaDB',               isBuiltIn: true },
  { port: 3389,  protocol: 'TCP',  service: 'RDP',                memo: 'リモートデスクトップ',           isBuiltIn: true },
  { port: 5432,  protocol: 'TCP',  service: 'PostgreSQL',         memo: 'PostgreSQL',                    isBuiltIn: true },
  { port: 5672,  protocol: 'TCP',  service: 'RabbitMQ',           memo: 'メッセージキュー（AMQP）',       isBuiltIn: true },
  { port: 6379,  protocol: 'TCP',  service: 'Redis',              memo: 'インメモリ KVS',                 isBuiltIn: true },
  { port: 8080,  protocol: 'TCP',  service: 'Tomcat / Proxy',     memo: 'HTTP プロキシ / AP サーバ',      isBuiltIn: true },
  { port: 8443,  protocol: 'TCP',  service: 'HTTPS (Alt)',        memo: 'HTTPS 代替ポート',              isBuiltIn: true },
  { port: 9090,  protocol: 'TCP',  service: 'Prometheus',         memo: '監視ツール',                    isBuiltIn: true },
  { port: 9200,  protocol: 'TCP',  service: 'Elasticsearch',      memo: '検索エンジン（REST API）',      isBuiltIn: true },
  { port: 27017, protocol: 'TCP',  service: 'MongoDB',            memo: 'ドキュメント DB',                isBuiltIn: true },
];

// ==================================================
// ポート番号リファレンス: レンダリング
// ==================================================

async function loadAndRenderPorts() {
  State.customPorts = await opsDB.getPorts();
  renderPorts();
}

function renderPorts() {
  const query   = State.portsSearch.toLowerCase();
  const filter  = State.portsFilter;
  const tbody   = document.getElementById('ports-tbody');
  const emptyEl = document.getElementById('ports-empty');

  // タブのカウントバッジを更新
  const builtinCount = BUILTIN_PORTS.length;
  const customCount  = State.customPorts.length;
  const allCount     = builtinCount + customCount;
  document.querySelectorAll('.ops-filter-tab').forEach(btn => {
    const counts = { all: allCount, builtin: builtinCount, custom: customCount };
    const n = counts[btn.dataset.filter] ?? 0;
    btn.innerHTML = `${btn.dataset.label}<span class="ops-filter-tab__badge">${n}</span>`;
  });

  // 統合リスト作成（ポート番号昇順）
  let all = [];
  if (filter !== 'custom') all = all.concat(BUILTIN_PORTS);
  if (filter !== 'builtin') all = all.concat(State.customPorts.map(p => ({ ...p, isBuiltIn: false })));
  all.sort((a, b) => a.port - b.port || (a.isBuiltIn ? -1 : 1));

  // 検索フィルター
  if (query) {
    all = all.filter(p =>
      p.port.toString().includes(query) ||
      p.service.toLowerCase().includes(query)
    );
  }

  if (all.length === 0) {
    tbody.innerHTML = '';
    emptyEl.hidden  = false;
    return;
  }
  emptyEl.hidden = true;

  const PROTO_COLOR = { TCP: 'accent', UDP: 'warning', both: 'info' };

  tbody.innerHTML = all.map(p => {
    const color  = PROTO_COLOR[p.protocol] || 'info';
    const isEdit = !p.isBuiltIn;
    return `<tr class="${p.isBuiltIn ? '' : 'ports-table__row--custom'}" data-port-id="${p.id ?? ''}">
      <td class="ports-table__td--port"><code class="ports-port-num">${p.port}</code></td>
      <td class="ports-table__td--proto">
        <span class="ports-proto-badge ports-proto-badge--${color}">${p.protocol}</span>
      </td>
      <td class="ports-table__td--service">${escapeHtml(p.service)}</td>
      <td class="ports-table__td--memo">${escapeHtml(p.memo || '')}</td>
      <td class="ports-table__td--ops">
        ${isEdit
          ? `<button class="btn btn--ghost btn--sm" data-action="edit-port" data-id="${p.id}">編集</button>
             <button class="btn btn--ghost-danger btn--sm" data-action="delete-port" data-id="${p.id}">削除</button>`
          : ''}
      </td>
    </tr>`;
  }).join('');
}

function openPortsForm(port) {
  // port が undefined → 新規追加、Object → 編集
  const formEl = document.getElementById('ports-form');
  State.portsEditingId = port ? port.id : null;

  document.getElementById('ports-form-port').value    = port ? port.port    : '';
  const protoSel = document.getElementById('ports-form-proto');
  protoSel.value = port ? port.protocol : 'TCP';
  protoSel._csInst?.render();
  document.getElementById('ports-form-service').value = port ? port.service : '';
  document.getElementById('ports-form-memo').value    = port ? port.memo    : '';
  formEl.hidden = false;
  document.getElementById('ports-form-port').focus();
}

async function savePortsForm() {
  const portNum = parseInt(document.getElementById('ports-form-port').value, 10);
  const proto   = document.getElementById('ports-form-proto').value;
  const service = document.getElementById('ports-form-service').value.trim();
  const memo    = document.getElementById('ports-form-memo').value.trim();

  if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
    showToast('ポート番号は 1〜65535 の範囲で入力してください', 'error'); return;
  }
  if (!service) {
    showToast('サービス名を入力してください', 'error'); return;
  }

  // 重複チェック（編集中の自分自身は除外）
  const allPorts = BUILTIN_PORTS.concat(State.customPorts);
  const dup = allPorts.find(p =>
    p.port === portNum && p.protocol === proto &&
    (!State.portsEditingId || p.id !== State.portsEditingId)
  );
  if (dup) {
    showToast(`ポート ${portNum}/${proto} はすでに登録されています（${dup.service}）`, 'warn'); return;
  }

  const position = State.customPorts.length;
  if (State.portsEditingId) {
    await opsDB.updatePort({ id: State.portsEditingId, port: portNum, protocol: proto, service, memo, position });
  } else {
    await opsDB.addPort({ port: portNum, protocol: proto, service, memo, position });
  }

  State.customPorts = await opsDB.getPorts();
  document.getElementById('ports-form').hidden = true;
  renderPorts();
  showToast('保存しました', 'success');
}


// ==================================================
// 初期化
// ==================================================

function init() {
  // ── タブ切替 ────────────────────────────────────
  document.getElementById('ops-tabs').addEventListener('click', e => {
    const btn = e.target.closest('.ops-tab');
    if (btn) switchSection(btn.dataset.tool);
  });

  // ── ログビューア イベント ────────────────────────
  const logInput = document.getElementById('log-input');
  logInput.addEventListener('paste', () => setTimeout(onLogInput, 0));
  logInput.addEventListener('input', onLogInput);

  document.getElementById('log-text-filter').addEventListener('input', e => {
    State.filters.text = e.target.value;
    applyLogFilter();
  });

  document.querySelectorAll('.log-filter__level input[data-level]').forEach(cb => {
    cb.addEventListener('change', () => {
      State.filters.levels[cb.dataset.level] = cb.checked;
      applyLogFilter();
    });
  });

  function bindTimePicker(btnId, isStart) {
    document.getElementById(btnId).addEventListener('click', () => {
      const btn   = document.getElementById(btnId);
      const label = btn.querySelector('.log-filter__time-btn-label');
      const defaultLabel = isStart ? '開始日時' : '終了日時';
      DatePicker.open(
        btn.dataset.value || '',
        dt => {
          btn.dataset.value = dt;
          label.textContent = dt.replace('T', ' ');
          btn.classList.add('log-filter__time-btn--set');
          State.filters[isStart ? 'startTime' : 'endTime'] = new Date(dt).getTime();
          applyLogFilter();
        },
        () => {
          btn.dataset.value = '';
          label.textContent = defaultLabel;
          btn.classList.remove('log-filter__time-btn--set');
          State.filters[isStart ? 'startTime' : 'endTime'] = null;
          applyLogFilter();
        },
        { showTime: true }
      );
    });
  }
  bindTimePicker('log-time-start-btn', true);
  bindTimePicker('log-time-end-btn',   false);

  document.getElementById('log-filter-clear').addEventListener('click', () => {
    State.filters = {
      levels: { ERROR: true, WARN: true, INFO: true, DEBUG: true, OTHER: true },
      startTime: null, endTime: null, text: '',
    };
    document.querySelectorAll('.log-filter__level input[data-level]').forEach(cb => { cb.checked = true; });
    document.getElementById('log-text-filter').value = '';
    ['log-time-start-btn','log-time-end-btn'].forEach((id, i) => {
      const btn = document.getElementById(id);
      btn.dataset.value = '';
      btn.querySelector('.log-filter__time-btn-label').textContent = i === 0 ? '開始日時' : '終了日時';
      btn.classList.remove('log-filter__time-btn--set');
    });
    applyLogFilter();
  });

  // ── cron式エディタ イベント ──────────────────────
  document.getElementById('cron-expr').addEventListener('input', updateCron);

  // JST / UTC 切替
  document.getElementById('cron-tz-toggle').addEventListener('click', e => {
    const btn = e.target.closest('.cron-tz-btn');
    if (!btn) return;
    State.cronTz = btn.dataset.tz;
    document.querySelectorAll('.cron-tz-btn').forEach(b => {
      b.classList.toggle('cron-tz-btn--active', b.dataset.tz === State.cronTz);
    });
    updateCron();
  });

  document.querySelector('.cron-presets').addEventListener('click', e => {
    const btn = e.target.closest('.cron-preset-btn');
    if (!btn) return;
    document.getElementById('cron-expr').value = btn.dataset.expr;
    updateCron();
    if (State._cronInitialized) syncGuiFromCron(btn.dataset.expr);
  });

  // 月チェックボックス「毎月」と個別選択の相互排他
  document.getElementById('cron-month-all').addEventListener('change', e => {
    if (e.target.checked) {
      document.querySelectorAll('[data-month]').forEach(c => { c.checked = false; });
    }
  });
  document.querySelectorAll('[data-month]').forEach(c => {
    c.addEventListener('change', () => {
      if (c.checked) document.getElementById('cron-month-all').checked = false;
    });
  });

  // 曜日チェックボックス「毎日」と個別選択の相互排他
  document.getElementById('cron-dow-all').addEventListener('change', e => {
    if (e.target.checked) {
      document.querySelectorAll('[data-dow]').forEach(c => { c.checked = false; });
    }
  });
  document.querySelectorAll('[data-dow]').forEach(c => {
    c.addEventListener('change', () => {
      if (c.checked) document.getElementById('cron-dow-all').checked = false;
    });
  });

  // ── HTTP ステータスコード辞典 イベント ──────────
  document.getElementById('http-search').addEventListener('input', e => {
    State.httpSearch = e.target.value;
    renderHttpAccordion();
  });

  document.getElementById('http-star-toggle').addEventListener('click', e => {
    State.httpStarOnly = !State.httpStarOnly;
    e.currentTarget.setAttribute('aria-pressed', State.httpStarOnly);
    e.currentTarget.classList.toggle('http-star-btn--active', State.httpStarOnly);
    renderHttpAccordion();
  });

  document.getElementById('http-accordion').addEventListener('click', e => {
    // アコーディオン開閉
    const toggleBtn = e.target.closest('[data-action="toggle-cat"]');
    if (toggleBtn) {
      const cat    = toggleBtn.dataset.cat;
      const catEl  = toggleBtn.closest('.http-cat');
      const bodyEl = catEl.querySelector('.http-cat__body');
      const chev   = catEl.querySelector('.http-cat__chevron');
      const isOpen = bodyEl.classList.toggle('http-cat__body--open');
      chev.classList.toggle('http-cat__chevron--open', isOpen);
      if (isOpen) State.httpOpenCats.add(cat);
      else        State.httpOpenCats.delete(cat);
      return;
    }
    // コードコピー
    const copyBtn = e.target.closest('[data-copy]');
    if (copyBtn) {
      navigator.clipboard.writeText(copyBtn.dataset.copy)
        .then(() => showToast(`${copyBtn.dataset.copy} をコピーしました`, 'success'))
        .catch(() => showToast('コピーに失敗しました', 'error'));
    }
  });

  // ── ポート番号リファレンス イベント ─────────────
  // プロトコル select を CustomSelect に変換
  CustomSelect.replaceAll(document.getElementById('ports-form'));

  document.getElementById('ports-search').addEventListener('input', e => {
    State.portsSearch = e.target.value;
    renderPorts();
  });

  document.getElementById('ports-filter-tabs').addEventListener('click', e => {
    const btn = e.target.closest('.ops-filter-tab');
    if (!btn) return;
    State.portsFilter = btn.dataset.filter;
    document.querySelectorAll('.ops-filter-tab').forEach(b => {
      b.classList.toggle('ops-filter-tab--active', b === btn);
    });
    renderPorts();
  });

  document.getElementById('ports-add-btn').addEventListener('click', () => {
    openPortsForm();
  });

  document.getElementById('ports-form-save').addEventListener('click', savePortsForm);

  document.getElementById('ports-form-cancel').addEventListener('click', () => {
    document.getElementById('ports-form').hidden = true;
    State.portsEditingId = null;
  });

  document.getElementById('ports-tbody').addEventListener('click', async e => {
    const editBtn   = e.target.closest('[data-action="edit-port"]');
    const deleteBtn = e.target.closest('[data-action="delete-port"]');

    if (editBtn) {
      const id   = parseInt(editBtn.dataset.id, 10);
      const port = State.customPorts.find(p => p.id === id);
      if (port) openPortsForm(port);
      return;
    }
    if (deleteBtn) {
      const id = parseInt(deleteBtn.dataset.id, 10);
      if (!confirm('このカスタムポートを削除しますか？')) return;
      await opsDB.deletePort(id);
      State.customPorts = await opsDB.getPorts();
      renderPorts();
      showToast('削除しました');
    }
  });


  // ── テーマ変更（親フレームからの postMessage） ───
  window.addEventListener('message', e => {
    if (e.data?.type === 'theme-change') {
      document.documentElement.setAttribute('data-theme', e.data.theme);
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
