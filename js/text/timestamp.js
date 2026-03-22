'use strict';

// ==================================================
// テキスト処理ツール — タイムスタンプ変換
// ==================================================
// 現在時刻表示、エポック⇔日時の相互変換
// ==================================================

// JST フォーマッター
const _jstFmt = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hour12: false,
});

// ローカル時刻フォーマッター
const _localFmt = new Intl.DateTimeFormat(undefined, {
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hour12: false,
});

function _formatJST(date) {
  return _jstFmt.format(date).replace(/\//g, '-');
}
function _formatLocal(date) {
  return _localFmt.format(date).replace(/\//g, '-');
}

function _buildNowRows(now) {
  const sec = Math.floor(now.getTime() / 1000);
  const ms = now.getTime();
  return [
    { label: 'エポック秒',    value: String(sec) },
    { label: 'エポックms',    value: String(ms) },
    { label: 'ISO 8601 (UTC)', value: now.toISOString() },
    { label: 'JST',           value: _formatJST(now) },
    { label: 'ローカル',       value: _formatLocal(now) },
  ];
}

function _renderNowGrid() {
  const now = new Date();
  const grid = document.getElementById('ts-now-grid');
  if (!grid) return;
  const rows = _buildNowRows(now);
  grid.innerHTML = rows.map(r => `
    <div class="ts-now-row">
      <span class="ts-now-row__label">${escapeHtml(r.label)}</span>
      <span class="ts-now-row__value">${escapeHtml(r.value)}</span>
      <button class="btn btn--ghost btn--sm ts-copy-btn" data-value="${escapeHtml(r.value)}">${Icons.copyFill} コピー</button>
    </div>
  `).join('');
}

function startTimestampTimer() {
  _renderNowGrid();
  State._timestampTimer = setInterval(_renderNowGrid, 1000);
}

function stopTimestampTimer() {
  if (State._timestampTimer) {
    clearInterval(State._timestampTimer);
    State._timestampTimer = null;
  }
}

function _detectEpoch(raw) {
  const n = raw.trim().replace(/[,_]/g, '');
  if (!/^-?\d+$/.test(n)) return null;
  const num = Number(n);
  // 10桁以下 → 秒, 13桁 → ミリ秒
  return Math.abs(num) < 1e11 ? new Date(num * 1000) : new Date(num);
}

function renderEpochToDatetime() {
  const raw = document.getElementById('ts-from-epoch').value.trim();
  const resultEl = document.getElementById('ts-from-epoch-result');
  const errEl = document.getElementById('ts-from-epoch-error');

  if (!raw) {
    resultEl.innerHTML = '';
    errEl.hidden = true;
    return;
  }

  const d = _detectEpoch(raw);
  if (!d || isNaN(d.getTime())) {
    resultEl.innerHTML = '';
    errEl.textContent = '数値として認識できません';
    errEl.hidden = false;
    return;
  }

  errEl.hidden = true;
  const items = [
    { label: 'UTC',    value: d.toUTCString() },
    { label: 'ISO 8601', value: d.toISOString() },
    { label: 'JST',    value: _formatJST(d) },
    { label: 'ローカル', value: _formatLocal(d) },
  ];
  resultEl.innerHTML = items.map(it => `
    <div class="ts-result-row">
      <span class="ts-result-row__label">${escapeHtml(it.label)}</span>
      <span class="ts-result-row__value">${escapeHtml(it.value)}</span>
      <button class="btn btn--ghost btn--sm ts-copy-btn" data-value="${escapeHtml(it.value)}">${Icons.copyFill} コピー</button>
    </div>
  `).join('');
}

function renderDatetimeToEpoch() {
  const raw = document.getElementById('ts-from-datetime').value.trim();
  const resultEl = document.getElementById('ts-from-datetime-result');
  const errEl = document.getElementById('ts-from-datetime-error');

  if (!raw) {
    resultEl.innerHTML = '';
    errEl.hidden = true;
    return;
  }

  const d = new Date(raw);
  if (isNaN(d.getTime())) {
    resultEl.innerHTML = '';
    errEl.textContent = '日時として認識できません（例: 2024-03-24 10:23:45）';
    errEl.hidden = false;
    return;
  }

  errEl.hidden = true;
  const sec = Math.floor(d.getTime() / 1000);
  const ms = d.getTime();
  const items = [
    { label: 'エポック秒',  value: String(sec) },
    { label: 'エポックms',  value: String(ms) },
    { label: 'UTC',         value: d.toUTCString() },
    { label: 'ISO 8601',    value: d.toISOString() },
  ];
  resultEl.innerHTML = items.map(it => `
    <div class="ts-result-row">
      <span class="ts-result-row__label">${escapeHtml(it.label)}</span>
      <span class="ts-result-row__value">${escapeHtml(it.value)}</span>
      <button class="btn btn--ghost btn--sm ts-copy-btn" data-value="${escapeHtml(it.value)}">${Icons.copyFill} コピー</button>
    </div>
  `).join('');
}
