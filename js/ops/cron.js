'use strict';

// ==================================================
// 運用ツール — cron式エディタ
// ==================================================
// cron式のパース・次回実行日時計算・日本語説明生成・
// GUIビルダー・更新処理
// ==================================================

// ── パーサー ──────────────────────────────────────

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

// ── 日本語説明 ────────────────────────────────────

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

// ── GUI ビルダー ──────────────────────────────────

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

// ── 更新（入力 → 説明 + 次回実行） ───────────────

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
