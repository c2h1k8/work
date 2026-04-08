'use strict';

// ==================================================
// テキスト処理ツール — TSV/CSV ⇔ テーブル変換
// ==================================================
// パース、テーブル表示、セル編集、行操作、エクスポート
// ==================================================

function _getDelimChar() {
  return State.tsv.delimiter;
}

// 任意の区切り文字・囲み文字に対応したパーサー
// quote が空文字の場合はクォート処理をスキップ
function _parseCSV(text, delim, quote) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const hasQuote = quote !== '';

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const nc = text[i + 1];

    if (inQuotes) {
      // クォート文字の連続はエスケープ（例: "" → "）
      if (c === quote && nc === quote) { field += quote; i++; }
      else if (c === quote) { inQuotes = false; }
      else { field += c; }
    } else {
      if (hasQuote && c === quote) {
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
  State.tsv.data = _parseCSV(raw, delim, State.tsv.quoteChar);
  // ソートはリセット（列構成が変わる可能性があるため）
  State.tsv.sortCol = -1;
  State.tsv.sortDir = 'asc';
  renderTsvTable();
}

// 検索・ソートを適用したボディ行を返す
// { idx: State.tsv.data の元インデックス, cells: string[] }
function _getDisplayBodyRows() {
  const data = State.tsv.data;
  const hasHeader = State.tsv.hasHeader && data.length > 1;
  const startIdx = hasHeader ? 1 : 0;

  let rows = [];
  for (let i = startIdx; i < data.length; i++) {
    rows.push({ idx: i, cells: data[i] });
  }

  // 検索フィルター
  const q = State.tsv.searchQuery.trim().toLowerCase();
  if (q) {
    rows = rows.filter(r => r.cells.some(c => c.toLowerCase().includes(q)));
  }

  // ソート
  const sc = State.tsv.sortCol;
  if (sc >= 0) {
    rows.sort((a, b) => {
      const va = (a.cells[sc] || '').toLowerCase();
      const vb = (b.cells[sc] || '').toLowerCase();
      const na = parseFloat(va);
      const nb = parseFloat(vb);
      let cmp;
      // 両方数値として解釈できる場合は数値ソート
      if (!isNaN(na) && !isNaN(nb) && String(na) === va && String(nb) === vb) {
        cmp = na - nb;
      } else {
        cmp = va.localeCompare(vb, 'ja');
      }
      return State.tsv.sortDir === 'asc' ? cmp : -cmp;
    });
  }

  return rows;
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
  const totalBodyCount = hasHeader ? data.length - 1 : data.length;

  const displayRows = _getDisplayBodyRows();
  const q = State.tsv.searchQuery.trim().toLowerCase();

  // 行数・列数情報
  if (q && displayRows.length !== totalBodyCount) {
    info.textContent = `${displayRows.length} / ${totalBodyCount}行 × ${maxCols}列`;
  } else {
    info.textContent = `${totalBodyCount}行 × ${maxCols}列`;
  }

  let html = '';
  if (header) {
    html += '<thead><tr>';
    for (let c = 0; c < maxCols; c++) {
      const val = escapeHtml(header[c] || '');
      const isSorted = State.tsv.sortCol === c;
      const sortAttr = isSorted ? ` data-sort="${State.tsv.sortDir}"` : '';
      const sortClass = isSorted ? ' tsv-th--sorted' : '';
      html += `<th class="tsv-th${sortClass}" data-sort-col="${c}"${sortAttr}>${val}</th>`;
    }
    html += '<th class="tsv-table__del-col"></th></tr></thead>';
  }

  html += '<tbody>';
  displayRows.forEach(({ idx, cells }) => {
    html += '<tr>';
    for (let c = 0; c < maxCols; c++) {
      const val = cells[c] || '';
      const isMatch = q && val.toLowerCase().includes(q);
      const cellClass = isMatch ? ' class="tsv-cell--match"' : '';
      html += `<td${cellClass} contenteditable="true" data-row="${idx}" data-col="${c}">${escapeHtml(val)}</td>`;
    }
    html += `<td class="tsv-table__del-col"><button class="tsv-del-row-btn" data-row="${idx}" title="行を削除">✕</button></td>`;
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

// 指定された区切り文字・囲み文字でフィールドをクォート処理する
function _quoteField(val) {
  const q = State.tsv.quoteChar;
  if (!q) return val; // 「なし」: そのまま出力
  // 囲み文字が設定されている場合は常に全フィールドを囲む
  // 値に囲み文字が含まれる場合はダブルでエスケープ（例: " → ""）
  const escaped = val.split(q).join(q + q);
  return q + escaped + q;
}

function _exportTsv() {
  return State.tsv.data.map(r => r.map(_quoteField).join('\t')).join('\n');
}

function _exportCsv() {
  return State.tsv.data.map(r => r.map(_quoteField).join(',')).join('\n');
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
