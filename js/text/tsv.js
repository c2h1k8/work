'use strict';

// ==================================================
// テキスト処理ツール — TSV/CSV ⇔ テーブル変換
// ==================================================
// パース、テーブル表示、セル編集、行操作、エクスポート
// ==================================================

function _getDelimChar() {
  return State.tsv.delimiter;
}

// RFC 4180 準拠の CSV パーサー
function _parseCSV(text, delim) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const isComma = delim === ',';

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const nc = text[i + 1];

    if (inQuotes) {
      if (c === '"' && nc === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { field += c; }
    } else {
      if (c === '"' && isComma) {
        inQuotes = true;
      } else if (c === delim) {
        row.push(field); field = '';
      } else if (c === '\n' || (c === '\r' && nc === '\n')) {
        row.push(field); field = '';
        if (row.some(f => f !== '') || row.length > 1) rows.push(row);
        row = [];
        if (c === '\r') i++;
      } else if (c === '\r') {
        row.push(field); field = '';
        if (row.some(f => f !== '') || row.length > 1) rows.push(row);
        row = [];
      } else {
        field += c;
      }
    }
  }
  // 最後のフィールド/行
  row.push(field);
  if (row.some(f => f !== '') || row.length > 1) rows.push(row);
  return rows.filter(r => r.length > 0);
}

function parseTsvInput() {
  const raw = document.getElementById('tsv-input').value;
  const delim = _getDelimChar();
  State.tsv.data = _parseCSV(raw, delim);
  renderTsvTable();
}

function renderTsvTable() {
  const data = State.tsv.data;
  const card = document.getElementById('tsv-table-card');
  const table = document.getElementById('tsv-table');
  const info = document.getElementById('tsv-table-info');

  if (data.length === 0) {
    card.hidden = true;
    return;
  }

  card.hidden = false;
  const hasHeader = State.tsv.hasHeader && data.length > 1;
  const maxCols = Math.max(...data.map(r => r.length));
  const header = hasHeader ? data[0] : null;
  const body = hasHeader ? data.slice(1) : data;

  info.textContent = `${body.length}行 × ${maxCols}列`;

  let html = '';
  if (header) {
    html += '<thead><tr>';
    for (let c = 0; c < maxCols; c++) {
      const val = escapeHtml(header[c] || '');
      html += `<th contenteditable="true" data-row="0" data-col="${c}">${val}</th>`;
    }
    html += '<th class="tsv-table__del-col"></th></tr></thead>';
  }

  html += '<tbody>';
  body.forEach((row, ri) => {
    const dataRowIdx = hasHeader ? ri + 1 : ri;
    html += '<tr>';
    for (let c = 0; c < maxCols; c++) {
      const val = escapeHtml(row[c] || '');
      html += `<td contenteditable="true" data-row="${dataRowIdx}" data-col="${c}">${val}</td>`;
    }
    html += `<td class="tsv-table__del-col"><button class="tsv-del-row-btn" data-row="${dataRowIdx}" title="行を削除">✕</button></td>`;
    html += '</tr>';
  });
  html += '</tbody>';
  table.innerHTML = html;
}

// ── セル編集 ────────────────────────────────────────

function _syncCellToData(el) {
  const row = parseInt(el.dataset.row);
  const col = parseInt(el.dataset.col);
  if (State.tsv.data[row]) {
    while (State.tsv.data[row].length <= col) State.tsv.data[row].push('');
    State.tsv.data[row][col] = el.textContent;
  }
}

// ── 行操作 ──────────────────────────────────────────

function _tsvAddRow() {
  const maxCols = State.tsv.data.length > 0 ? Math.max(...State.tsv.data.map(r => r.length)) : 1;
  State.tsv.data.push(Array(maxCols).fill(''));
  renderTsvTable();
}

function _tsvDeleteRow(rowIdx) {
  State.tsv.data.splice(rowIdx, 1);
  renderTsvTable();
}

// ── エクスポート ────────────────────────────────────

function _exportTsv() {
  return State.tsv.data.map(r => r.join('\t')).join('\n');
}

function _escapeCSVField(val) {
  if (val.includes('"') || val.includes(',') || val.includes('\n') || val.includes('\r')) {
    return '"' + val.replace(/"/g, '""') + '"';
  }
  return val;
}

function _exportCsv() {
  return State.tsv.data.map(r => r.map(_escapeCSVField).join(',')).join('\n');
}

function _exportMarkdown() {
  if (State.tsv.data.length === 0) return '';
  const maxCols = Math.max(...State.tsv.data.map(r => r.length));
  const pad = (val, len) => val.padEnd(len);

  // 列幅計算
  const widths = Array(maxCols).fill(3);
  State.tsv.data.forEach(row => {
    for (let c = 0; c < maxCols; c++) {
      widths[c] = Math.max(widths[c], (row[c] || '').length);
    }
  });

  const hasHeader = State.tsv.hasHeader && State.tsv.data.length > 1;
  const lines = [];

  State.tsv.data.forEach((row, ri) => {
    const cells = Array(maxCols).fill('').map((_, c) => pad(row[c] || '', widths[c]));
    lines.push('| ' + cells.join(' | ') + ' |');
    if (ri === 0 && hasHeader) {
      lines.push('| ' + widths.map(w => '-'.repeat(w)).join(' | ') + ' |');
    }
  });
  return lines.join('\n');
}
