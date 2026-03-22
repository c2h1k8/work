'use strict';

// ==================================================
// テキスト処理ツール — フォーマッタ（JSON / XML 整形）
// ==================================================

function _serializeXml(node, depth) {
  const indent = '  '.repeat(depth);
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent.trim();
    return text ? `${indent}${text}` : '';
  }
  if (node.nodeType === Node.COMMENT_NODE) return `${indent}<!--${node.textContent}-->`;
  if (node.nodeType === Node.CDATA_SECTION_NODE) return `${indent}<![CDATA[${node.textContent}]]>`;
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const tag = node.tagName;
  const attrs = Array.from(node.attributes).map(a => ` ${a.name}="${a.value}"`).join('');
  const children = Array.from(node.childNodes)
    .map(c => _serializeXml(c, depth + 1))
    .filter(s => s !== '');
  if (children.length === 0) return `${indent}<${tag}${attrs}/>`;
  if (children.length === 1 && !children[0].startsWith(indent + '  ')) {
    return `${indent}<${tag}${attrs}>${children[0].trim()}</${tag}>`;
  }
  return `${indent}<${tag}${attrs}>\n${children.join('\n')}\n${indent}</${tag}>`;
}

function formatCode() {
  const inputEl = document.getElementById('fmt-input');
  const codeEl = document.getElementById('fmt-code');
  const errorEl = document.getElementById('fmt-error');
  const outputCard = document.getElementById('fmt-output-card');
  const input = inputEl.value.trim();
  if (!input) return;

  const fmtType = document.querySelector('input[name="fmt-type"]:checked')?.value || 'json';
  errorEl.hidden = true;
  codeEl.textContent = '';
  inputEl.classList.remove('fmt-input--error');

  // エラー位置をテキストエリアでハイライト
  const highlightPos = (lineNum, colNum) => {
    if (!lineNum) return;
    const lines = inputEl.value.split('\n');
    const idx = Math.max(0, lineNum - 1);
    const lineStart = lines.slice(0, idx).reduce((s, l) => s + l.length + 1, 0);
    const col = colNum != null && colNum > 0
      ? Math.min(colNum - 1, lines[idx]?.length || 0) : 0;
    const selPos = lineStart + col;
    inputEl.focus();
    inputEl.setSelectionRange(selPos, colNum != null ? selPos + 1 : lineStart + (lines[idx]?.length || 0));
  };

  try {
    let formatted = '';
    if (fmtType === 'json') {
      let parsed;
      try {
        parsed = JSON.parse(input);
      } catch (e) {
        const lineMatch = e.message.match(/line\s+(\d+)/i);
        const colMatch  = e.message.match(/column\s+(\d+)/i);
        const posMatch  = e.message.match(/\(char\s+(\d+)\)/) || e.message.match(/position\s+(\d+)/i);
        let msg = e.message;
        if (lineMatch) {
          const ln = parseInt(lineMatch[1]);
          const cn = colMatch ? parseInt(colMatch[1]) : null;
          msg = `行 ${ln}${cn != null ? `、列 ${cn}` : ''}: ${e.message}`;
          highlightPos(ln, cn);
        } else if (posMatch) {
          const pos = parseInt(posMatch[1]);
          const before = input.substring(0, pos);
          const ln = before.split('\n').length;
          const cn = pos - before.lastIndexOf('\n');
          msg = `行 ${ln}、列 ${cn}: ${e.message}`;
          highlightPos(ln, cn);
        }
        throw new Error(msg);
      }
      formatted = JSON.stringify(parsed, null, 2);
    } else {
      const parser = new DOMParser();
      const doc = parser.parseFromString(input, 'application/xml');
      const parseError = doc.querySelector('parsererror');
      if (parseError) {
        const errText = parseError.textContent;
        const lineMatch = errText.match(/line\s+(\d+)/i);
        const colMatch  = errText.match(/column\s+(\d+)/i);
        const descMatch = errText.match(/:\s*(.+)$/m);
        const desc = descMatch ? descMatch[1].trim() : errText.split('\n')[0].trim();
        const lineNum = lineMatch ? parseInt(lineMatch[1]) : null;
        const colNum  = colMatch  ? parseInt(colMatch[1]) : null;
        let msg = desc;
        if (lineNum !== null) {
          msg = `行 ${lineNum}${colNum !== null ? `、列 ${colNum}` : ''}: ${desc}`;
          highlightPos(lineNum, colNum);
        }
        throw new Error(msg);
      }
      formatted = _serializeXml(doc.documentElement, 0);
    }
    codeEl.textContent = formatted;
    outputCard.hidden = false;
  } catch (err) {
    inputEl.classList.add('fmt-input--error');
    errorEl.textContent = `エラー: ${err.message}`;
    errorEl.hidden = false;
    outputCard.hidden = true;
  }
}
