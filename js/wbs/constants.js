'use strict';

// ==========================================
// WBS 定数・祝日計算・営業日ユーティリティ
// ==========================================

// ローカルストレージキー
const CUSTOM_HOLIDAY_KEY     = 'wbs_custom_holidays';
const COLLAPSED_KEY          = 'wbs_collapsed';
const COLLAPSED_MONTHS_KEY   = 'wbs_gantt_collapsed_months';

/** カスタム祝日をロード: [{ date:'YYYY-MM-DD', name:string }] */
function loadCustomHolidays() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_HOLIDAY_KEY) || '[]'); } catch { return []; }
}
function saveCustomHolidays(list) {
  localStorage.setItem(CUSTOM_HOLIDAY_KEY, JSON.stringify(list));
}

/** タスク折りたたみ状態をロード: taskId の Set */
function loadCollapsed() {
  try { return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '[]')); } catch { return new Set(); }
}
function saveCollapsed() {
  localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...State.collapsed]));
}

/** ガント折りたたみ月をロード: 'YYYY-MM' の Set */
function loadCollapsedMonths() {
  try { return new Set(JSON.parse(localStorage.getItem(COLLAPSED_MONTHS_KEY) || '[]')); } catch { return new Set(); }
}
function saveCollapsedMonths() {
  localStorage.setItem(COLLAPSED_MONTHS_KEY, JSON.stringify([...State._collapsedMonths]));
}

/** 日付文字列 'YYYY-MM-DD' を Date に変換（ローカル日時） */
function parseDate(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Date を 'YYYY-MM-DD' に変換 */
function formatDate(d) {
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 指定年の日本の祝日 Set（'YYYY-MM-DD' 文字列） */
const _holidayCache = {};
function getJapaneseHolidays(year) {
  if (_holidayCache[year]) return _holidayCache[year];

  const add = (m, d) => `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  const fixed = new Set([
    add(1, 1),  add(2, 11), add(2, 23), add(4, 29),
    add(5, 3),  add(5, 4),  add(5, 5),  add(8, 11),
    add(11, 3), add(11, 23),
  ]);

  const shunbun = Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  fixed.add(add(3, shunbun));
  const shubun = Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  fixed.add(add(9, shubun));

  const nthMonday = (month, n) => {
    const first = new Date(year, month - 1, 1);
    const dow = first.getDay();
    const firstMon = dow === 1 ? 1 : (8 - dow) % 7 + 1;
    return firstMon + (n - 1) * 7;
  };
  fixed.add(add(1, nthMonday(1, 2)));
  fixed.add(add(7, nthMonday(7, 3)));
  fixed.add(add(9, nthMonday(9, 3)));
  fixed.add(add(10, nthMonday(10, 2)));

  // 振替休日
  const result = new Set(fixed);
  fixed.forEach(dateStr => {
    const d = new Date(dateStr);
    if (d.getDay() === 0) {
      let sub = new Date(d);
      sub.setDate(sub.getDate() + 1);
      while (result.has(formatDate(sub))) sub.setDate(sub.getDate() + 1);
      result.add(formatDate(sub));
    }
  });

  // 国民の休日（敬老の日と秋分の日の間）
  const keiro = add(9, nthMonday(9, 3));
  const shubunDate = add(9, shubun);
  if (keiro && shubunDate) {
    const kd = parseDate(keiro), sd = parseDate(shubunDate);
    if (sd && kd && sd - kd === 2 * 86400000) {
      const mid = new Date(kd);
      mid.setDate(mid.getDate() + 1);
      if (mid.getDay() !== 0 && mid.getDay() !== 6) result.add(formatDate(mid));
    }
  }

  _holidayCache[year] = result;
  return result;
}

function isNonWorkingDay(date, customSet) {
  const dow = date.getDay();
  if (dow === 0 || dow === 6) return true;
  const str = formatDate(date);
  if (getJapaneseHolidays(date.getFullYear()).has(str)) return true;
  if (customSet && customSet.has(str)) return true;
  return false;
}

function addBusinessDays(startStr, days, customSet) {
  if (!startStr || !days || days <= 0) return '';
  const start = parseDate(startStr);
  if (!start) return '';
  while (isNonWorkingDay(start, customSet)) start.setDate(start.getDate() + 1);
  let count = 1;
  const cur = new Date(start);
  while (count < days) {
    cur.setDate(cur.getDate() + 1);
    if (!isNonWorkingDay(cur, customSet)) count++;
  }
  return formatDate(cur);
}

function countBusinessDays(startStr, endStr, customSet) {
  if (!startStr || !endStr) return 0;
  const start = parseDate(startStr);
  const end = parseDate(endStr);
  if (!start || !end || start > end) return 0;
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    if (!isNonWorkingDay(cur, customSet)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}
