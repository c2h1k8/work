'use strict';

// ==================================================
// テキスト処理・変換ツール
// ==================================================
// セクション: encode / case / regex / count
// ==================================================

const showToast = (msg, type) => Toast.show(msg, type);

// ==================================================
// 状態管理
// ==================================================

const State = {
  activeSection: 'encode',
  encodeDir: 'encode', // 'encode' | 'decode'
  regexFlags: { g: true, i: false, m: false, s: false, u: false },
  tsv: {
    delimiter: '\t', // 現在の区切り文字
    hasHeader: true,
    data: [],        // string[][] - テーブルデータ
  },
  _timestampTimer: null,
  _toolsDb: null,
  regexPatterns: [],  // 保存済みパターンキャッシュ
};

// ==================================================
// タブ切替
// ==================================================

function switchSection(tool) {
  State.activeSection = tool;
  document.querySelectorAll('.txt-tab').forEach(btn => {
    btn.classList.toggle('txt-tab--active', btn.dataset.tool === tool);
  });
  document.querySelectorAll('.txt-tool').forEach(el => {
    el.hidden = el.id !== `tool-${tool}`;
  });
  // タイムスタンプタイマー制御
  if (tool === 'timestamp') {
    startTimestampTimer();
  } else {
    stopTimestampTimer();
  }
}

// ==================================================
// エンコード/デコード
// ==================================================

const ENCODE_FNS = {
  base64: {
    encode: s => {
      try { return btoa(unescape(encodeURIComponent(s))); }
      catch (_) { throw new Error('エンコードに失敗しました（対応外の文字が含まれている可能性があります）'); }
    },
    decode: s => {
      try { return decodeURIComponent(escape(atob(s.trim()))); }
      catch (_) { throw new Error('デコードに失敗しました（不正なBase64文字列です）'); }
    },
  },
  url: {
    encode: s => encodeURIComponent(s),
    decode: s => {
      try { return decodeURIComponent(s); }
      catch (_) { throw new Error('デコードに失敗しました（不正なURLエンコード文字列です）'); }
    },
  },
  html: {
    encode: s => s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;'),
    decode: s => {
      // textarea の innerHTML 経由でブラウザのHTMLパーサーを利用
      const ta = document.createElement('textarea');
      ta.innerHTML = s;
      return ta.value;
    },
  },
  unicode: {
    encode: s => [...s].map(c => {
      const cp = c.codePointAt(0);
      return cp > 127 ? `\\u${cp.toString(16).padStart(4, '0')}` : c;
    }).join(''),
    decode: s => s.replace(/\\u([0-9a-fA-F]{4,6})/gi, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16))
    ),
  },
};

// エンコード形式定義（ラベル・説明）
const ENCODE_FORMATS = [
  { type: 'base64',  label: 'Base64',   desc: 'バイナリ↔テキスト' },
  { type: 'url',     label: 'URL',      desc: 'パーセントエンコーディング' },
  { type: 'html',    label: 'HTML',     desc: '特殊文字エスケープ' },
  { type: 'unicode', label: 'Unicode',  desc: '\\uXXXX エスケープ' },
];

// 全4形式をリアルタイムに変換してリスト描画
function renderEncodeResults() {
  const input = document.getElementById('encode-input').value;
  const dir = State.encodeDir;
  const listEl = document.getElementById('encode-result-list');
  listEl.innerHTML = ENCODE_FORMATS.map(({ type, label, desc }) => {
    let result = '', error = '';
    if (input) {
      try {
        result = ENCODE_FNS[type][dir](input);
      } catch (e) {
        error = e.message;
      }
    }
    const safeResult = escapeHtml(result);
    return `<div class="encode-result-item">
      <span class="encode-result-item__label" title="${escapeHtml(desc)}">${escapeHtml(label)}</span>
      ${error
        ? `<span class="encode-result-item__error">${escapeHtml(error)}</span>`
        : `<span class="encode-result-item__value">${result ? safeResult : '<span class="encode-result-item__empty">—</span>'}</span>`
      }
      <button class="btn btn--ghost btn--sm encode-result-item__copy" data-value="${safeResult}"${!result ? ' disabled' : ''}>${Icons.copyFill}</button>
    </div>`;
  }).join('');
}

// ==================================================
// ケース変換
// ==================================================

// テキストを単語配列に分割する（各種デリミタ・camelCase・PascalCase対応）
function toWords(str) {
  return str
    .replace(/([a-z])([A-Z])/g, '$1 $2')         // camelCase → camel Case
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')   // ABCDef → ABC Def
    .replace(/[-_.]+/g, ' ')                      // ハイフン・アンダースコア・ドット → スペース
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

const CASE_FORMATS = [
  { label: 'lowercase',            fn: s => s.toLowerCase() },
  { label: 'UPPERCASE',            fn: s => s.toUpperCase() },
  { label: 'Title Case',           fn: s => toWords(s).map(w => w[0].toUpperCase() + w.slice(1)).join(' ') },
  { label: 'Sentence case',        fn: s => { const w = toWords(s).join(' '); return w ? w[0].toUpperCase() + w.slice(1) : ''; } },
  { label: 'camelCase',            fn: s => { const w = toWords(s); return w[0] + w.slice(1).map(w => w[0].toUpperCase() + w.slice(1)).join(''); } },
  { label: 'PascalCase',           fn: s => toWords(s).map(w => w[0].toUpperCase() + w.slice(1)).join('') },
  { label: 'snake_case',           fn: s => toWords(s).join('_') },
  { label: 'SCREAMING_SNAKE_CASE', fn: s => toWords(s).join('_').toUpperCase() },
  { label: 'kebab-case',           fn: s => toWords(s).join('-') },
  { label: 'COBOL-CASE',           fn: s => toWords(s).join('-').toUpperCase() },
  { label: 'dot.case',             fn: s => toWords(s).join('.') },
  { label: 'path/case',            fn: s => toWords(s).join('/') },
];

function renderCaseResults() {
  const input = document.getElementById('case-input').value;
  // 複数行対応: 各行を個別に変換して \n で結合
  const lines = input.split('\n');
  const list = document.getElementById('case-result-list');
  list.innerHTML = CASE_FORMATS.map(fmt => {
    let result = '';
    try {
      if (input) {
        result = lines.map(line => line ? fmt.fn(line) : '').join('\n');
      }
    } catch (_) { result = ''; }
    const safeResult = escapeHtml(result);
    const safeLabel = escapeHtml(fmt.label);
    return `<div class="case-item">
      <span class="case-item__label">${safeLabel}</span>
      <span class="case-item__value">${result ? safeResult : '<span class="case-item__empty">—</span>'}</span>
      <button class="case-item__copy btn btn--ghost btn--sm" data-value="${safeResult}"${!result ? ' disabled' : ''}>${Icons.copyFill}</button>
    </div>`;
  }).join('');
}

// ==================================================
// 正規表現テスター
// ==================================================

// ── チートシートデータ ──────────────────────────────
const REGEX_HELP = [
  {
    title: 'アンカー',
    items: [
      { sym: '^',   desc: '行の先頭' },
      { sym: '$',   desc: '行の末尾' },
      { sym: '\\b', desc: '単語境界（\\_wと\\_Wの境目）' },
      { sym: '\\B', desc: '単語境界以外' },
    ],
  },
  {
    title: '文字クラス',
    items: [
      { sym: '.',   desc: '任意の1文字（改行を除く）' },
      { sym: '\\d', desc: '数字 [0-9]' },
      { sym: '\\D', desc: '数字以外' },
      { sym: '\\w', desc: '英数字・アンダースコア [A-Za-z0-9_]' },
      { sym: '\\W', desc: '\\w 以外' },
      { sym: '\\s', desc: '空白文字（スペース・タブ・改行）' },
      { sym: '\\S', desc: '空白以外' },
    ],
  },
  {
    title: '文字セット',
    items: [
      { sym: '[abc]',  desc: 'a, b, c のいずれか' },
      { sym: '[^abc]', desc: 'a, b, c 以外' },
      { sym: '[a-z]',  desc: 'a〜z の範囲' },
      { sym: '[a-zA-Z0-9]', desc: '英数字の範囲' },
    ],
  },
  {
    title: '数量詞',
    items: [
      { sym: '*',     desc: '0回以上（最長マッチ）' },
      { sym: '+',     desc: '1回以上（最長マッチ）' },
      { sym: '?',     desc: '0回または1回' },
      { sym: '{n}',   desc: 'ちょうど n 回' },
      { sym: '{n,}',  desc: 'n 回以上' },
      { sym: '{n,m}', desc: 'n 回以上 m 回以下' },
      { sym: '*?',    desc: '0回以上（最短マッチ・遅延）' },
      { sym: '+?',    desc: '1回以上（最短マッチ・遅延）' },
    ],
  },
  {
    title: 'グループ',
    items: [
      { sym: '(...)',          desc: 'キャプチャグループ（$1, $2 で参照）' },
      { sym: '(?:...)',        desc: '非キャプチャグループ' },
      { sym: '(?<name>...)',   desc: '名前付きキャプチャグループ' },
      { sym: '(?=...)',        desc: '肯定先読み（...の前にマッチ）' },
      { sym: '(?!...)',        desc: '否定先読み' },
      { sym: '(?<=...)',       desc: '肯定後読み（...の後にマッチ）' },
      { sym: '(?<!...)',       desc: '否定後読み' },
    ],
  },
  {
    title: 'エスケープ',
    items: [
      { sym: '\\n', desc: '改行' },
      { sym: '\\t', desc: 'タブ' },
      { sym: '\\r', desc: 'キャリッジリターン' },
      { sym: '\\.',  desc: 'ドット（リテラル）' },
      { sym: '\\\\', desc: 'バックスラッシュ（リテラル）' },
    ],
  },
  {
    title: 'フラグ',
    items: [
      { sym: 'g', desc: 'グローバル — 全マッチを検索' },
      { sym: 'i', desc: 'ケースインセンシティブ — 大小文字を区別しない' },
      { sym: 'm', desc: 'マルチライン — ^ $ が各行の先頭/末尾にマッチ' },
      { sym: 's', desc: 'dotAll — . が改行（\\n）にもマッチ' },
      { sym: 'u', desc: 'Unicode — サロゲートペアや \\u{XXXX} を正しく扱う' },
    ],
  },
  {
    title: 'よく使うパターン例',
    items: [
      { sym: '\\d+',              desc: '1桁以上の整数' },
      { sym: '\\d{4}-\\d{2}-\\d{2}', desc: 'YYYY-MM-DD 形式の日付' },
      { sym: '[\\w.+-]+@[\\w-]+\\.[\\w.]+', desc: 'メールアドレス（簡易）' },
      { sym: 'https?://\\S+',     desc: 'URL（http / https）' },
      { sym: '(?<=\\s|^)#\\w+',  desc: 'ハッシュタグ' },
      { sym: '^\\s*$',            desc: '空行（スペースのみ行も含む）' },
    ],
  },
];

// ヘルプパネルの描画
function renderRegexHelp() {
  const body = document.getElementById('regex-help-body');
  body.innerHTML = REGEX_HELP.map(section => `
    <div class="rxh-section">
      <div class="rxh-section__title">${escapeHtml(section.title)}</div>
      <div class="rxh-rows">
        ${section.items.map(item => `
          <div class="rxh-row">
            <code class="rxh-sym">${escapeHtml(item.sym)}</code>
            <span class="rxh-desc">${escapeHtml(item.desc)}</span>
            <button class="btn btn--ghost btn--sm rxh-copy-btn" data-value="${escapeHtml(item.sym)}" title="パターンに挿入">${Icons.copyFill}</button>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

// チートシートアコーディオンのトグル
let _regexHelpOpen = false;
function toggleRegexHelp() {
  _regexHelpOpen = !_regexHelpOpen;
  const body = document.getElementById('regex-help-body');
  const btn = document.getElementById('regex-help-toggle');
  body.hidden = !_regexHelpOpen;
  btn.setAttribute('aria-expanded', String(_regexHelpOpen));
  btn.classList.toggle('regex-help-toggle--open', _regexHelpOpen);
  if (_regexHelpOpen && !body.firstElementChild) {
    renderRegexHelp();
  }
}

const MARK_COUNT = 6;

// 現在の入力から RegExp オブジェクト（またはエラー）を生成
function buildRegex() {
  const pattern = document.getElementById('regex-pattern').value;
  if (!pattern) return null;
  const flags = Object.entries(State.regexFlags)
    .filter(([, v]) => v).map(([k]) => k).join('');
  try {
    return new RegExp(pattern, flags);
  } catch (e) {
    return e; // Error オブジェクトを返す
  }
}

function renderRegex() {
  const test = document.getElementById('regex-test').value;
  const replaceInput = document.getElementById('regex-replace').value;
  const displayEl = document.getElementById('regex-display');
  const displayWrap = document.getElementById('regex-display-wrap');
  const matchListEl = document.getElementById('regex-match-list');
  const matchCard = document.getElementById('regex-match-card');
  const matchCountEl = document.getElementById('regex-match-count');
  const errEl = document.getElementById('regex-error');
  const replaceResultEl = document.getElementById('regex-replace-result');
  const replaceResultWrap = document.getElementById('regex-replace-result-wrap');

  const rx = buildRegex();

  // パターン未入力
  if (!rx) {
    errEl.hidden = true;
    displayWrap.hidden = true;
    matchCard.hidden = true;
    replaceResultWrap.hidden = true;
    matchCountEl.hidden = true;
    return;
  }

  // パターンエラー
  if (rx instanceof Error) {
    errEl.textContent = rx.message;
    errEl.hidden = false;
    displayWrap.hidden = true;
    matchCard.hidden = true;
    replaceResultWrap.hidden = true;
    matchCountEl.hidden = true;
    return;
  }

  errEl.hidden = true;

  // テスト文字列が空
  if (!test) {
    displayWrap.hidden = true;
    matchCard.hidden = true;
    replaceResultWrap.hidden = true;
    matchCountEl.hidden = true;
    return;
  }

  // マッチ収集 & ハイライトHTML生成
  const matches = [];
  let highlighted = '';
  let lastIdx = 0;
  const isGlobal = rx.flags.includes('g');

  if (isGlobal) {
    rx.lastIndex = 0;
    let match;
    let safety = 0;
    while ((match = rx.exec(test)) !== null && safety++ < 2000) {
      matches.push({ match, idx: matches.length });
      highlighted += escapeHtml(test.slice(lastIdx, match.index));
      const colorIdx = (matches.length - 1) % MARK_COUNT;
      highlighted += `<mark class="rx-mark rx-mark--${colorIdx}">${escapeHtml(match[0])}</mark>`;
      lastIdx = match.index + match[0].length;
      // 空マッチによる無限ループ防止
      if (match[0].length === 0) rx.lastIndex++;
    }
  } else {
    const singleRx = new RegExp(rx.source, rx.flags);
    const match = singleRx.exec(test);
    if (match) {
      matches.push({ match, idx: 0 });
      highlighted += escapeHtml(test.slice(0, match.index));
      highlighted += `<mark class="rx-mark rx-mark--0">${escapeHtml(match[0])}</mark>`;
      lastIdx = match.index + match[0].length;
    }
  }
  highlighted += escapeHtml(test.slice(lastIdx));

  // ハイライト表示
  displayEl.innerHTML = highlighted;
  displayWrap.hidden = false;

  // マッチ数バッジ
  matchCountEl.hidden = false;
  matchCountEl.textContent = matches.length > 0 ? `${matches.length}件マッチ` : 'マッチなし';
  matchCountEl.className = `txt-card__badge${matches.length === 0 ? ' txt-card__badge--none' : ''}`;

  // マッチリスト
  matchCard.hidden = false;
  if (matches.length > 0) {
    const listHtml = matches.slice(0, 200).map(({ match: m }, i) => {
      // インデックスキャプチャグループ
      const indexGroups = m.slice(1).map((g, gi) =>
        `<span class="rx-match__group">グループ${gi + 1}: ${g !== undefined ? escapeHtml(g) : '<em>undefined</em>'}</span>`
      ).join('');
      // named groups（?<name>...）
      const namedGroups = m.groups
        ? Object.entries(m.groups).map(([name, val]) =>
            `<span class="rx-match__group rx-match__group--named">${escapeHtml(name)}: ${val !== undefined ? escapeHtml(val) : '<em>undefined</em>'}</span>`
          ).join('')
        : '';
      return `<div class="rx-match rx-match--${i % MARK_COUNT}">
        <span class="rx-match__idx">${i + 1}</span>
        <span class="rx-match__val">${m[0] ? escapeHtml(m[0]) : '<em class="rx-match__empty">空文字</em>'}</span>
        <span class="rx-match__pos">位置 ${m.index}</span>
        ${indexGroups}${namedGroups}
      </div>`;
    }).join('');
    matchListEl.innerHTML = listHtml +
      (matches.length > 200 ? `<div class="rx-match-more">... 残り ${matches.length - 200}件</div>` : '');
  } else {
    matchListEl.innerHTML = '<div class="rx-no-match">マッチしませんでした</div>';
  }

  // 置換結果
  if (replaceInput !== '') {
    try {
      // isGlobal の場合は全置換、非グローバルは最初のマッチのみ置換
      const rxReplace = new RegExp(rx.source, rx.flags);
      replaceResultEl.textContent = test.replace(rxReplace, replaceInput);
      replaceResultWrap.hidden = false;
    } catch (e) {
      replaceResultEl.textContent = 'エラー: ' + e.message;
      replaceResultWrap.hidden = false;
    }
  } else {
    replaceResultWrap.hidden = true;
  }
}

// ==================================================
// 文字カウント
// ==================================================

// 全角文字の判定正規表現（半角カナ \uFF61-\uFF9F は半角扱い）
const FULL_WIDTH_RE = /[^\x00-\x7F\uFF61-\uFF9F]/g;

function countStats(text) {
  if (!text) {
    return { chars: 0, charsNoSpace: 0, bytes: 0, lines: 0, words: 0, paragraphs: 0, fullWidth: 0, halfWidth: 0 };
  }
  // サロゲートペア対応: スプレッドで正確な文字数
  const chars = [...text].length;
  // 空文字=0行。それ以外は改行数+1
  const lines = text === '' ? 0 : text.split('\n').length;
  FULL_WIDTH_RE.lastIndex = 0;
  const fullWidthCount = (text.match(FULL_WIDTH_RE) || []).length;
  // 単語 / トークン: 空白・句読点で区切られた連続文字列
  const words = (text.match(/[^\s\u3000、。！？…・\n\r\t]+/g) || []).length;
  // 段落: 空行で区切られたブロック
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim()).length || (text.trim() ? 1 : 0);
  return {
    chars,
    charsNoSpace: [...text.replace(/\s/g, '')].length,
    bytes:        new TextEncoder().encode(text).length,
    lines,
    words,
    paragraphs,
    fullWidth:    fullWidthCount,
    halfWidth:    chars - fullWidthCount,
  };
}

const COUNT_STATS_DEF = [
  { key: 'chars',        label: '文字数' },
  { key: 'charsNoSpace', label: 'スペース除く' },
  { key: 'bytes',        label: 'バイト数 (UTF-8)' },
  { key: 'lines',        label: '行数' },
  { key: 'words',        label: '単語 / トークン' },
  { key: 'paragraphs',   label: '段落数' },
  { key: 'fullWidth',    label: '全角文字数' },
  { key: 'halfWidth',    label: '半角文字数' },
];

function renderCount() {
  const text = document.getElementById('count-input').value;
  const stats = countStats(text);
  document.getElementById('count-stats').innerHTML = COUNT_STATS_DEF.map(def => `
    <div class="count-stat">
      <div class="count-stat__value">${stats[def.key].toLocaleString()}</div>
      <div class="count-stat__label">${escapeHtml(def.label)}</div>
    </div>
  `).join('');
}

// ==================================================
// フォーマッタ（JSON / XML 整形）
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

// ==================================================
// イベント登録 & 初期化
// ==================================================

function init() {
  // ━━━ タブ切替 ━━━
  document.getElementById('txt-tabs').addEventListener('click', e => {
    const btn = e.target.closest('.txt-tab');
    if (btn) switchSection(btn.dataset.tool);
  });

  // ━━━ エンコード/デコード ━━━
  // 方向切替トグル
  document.getElementById('encode-dir-toggle').addEventListener('click', e => {
    const btn = e.target.closest('.encode-dir-btn');
    if (!btn) return;
    State.encodeDir = btn.dataset.dir;
    document.querySelectorAll('.encode-dir-btn').forEach(b =>
      b.classList.toggle('encode-dir-btn--active', b.dataset.dir === State.encodeDir)
    );
    renderEncodeResults();
  });
  // 入力リアルタイム変換
  document.getElementById('encode-input').addEventListener('input', renderEncodeResults);
  // クリア
  document.getElementById('btn-encode-clear').addEventListener('click', () => {
    document.getElementById('encode-input').value = '';
    renderEncodeResults();
  });
  // 結果行のコピーボタン（イベント委譲）
  document.getElementById('encode-result-list').addEventListener('click', e => {
    const btn = e.target.closest('.encode-result-item__copy');
    if (!btn || btn.disabled) return;
    navigator.clipboard.writeText(btn.dataset.value).then(() => showToast('コピーしました', 'success'));
  });

  // ━━━ ケース変換 ━━━
  document.getElementById('case-input').addEventListener('input', renderCaseResults);
  document.getElementById('case-clear-btn').addEventListener('click', () => {
    document.getElementById('case-input').value = '';
    renderCaseResults();
  });

  document.getElementById('case-result-list').addEventListener('click', e => {
    const btn = e.target.closest('.case-item__copy');
    if (!btn || btn.disabled) return;
    navigator.clipboard.writeText(btn.dataset.value).then(() => showToast('コピーしました', 'success'));
  });

  // ━━━ 正規表現テスター ━━━
  document.getElementById('regex-help-toggle').addEventListener('click', toggleRegexHelp);
  // ヘルプのコピーボタン: パターン入力欄の末尾に挿入
  document.getElementById('regex-help-body').addEventListener('click', e => {
    const btn = e.target.closest('.rxh-copy-btn');
    if (!btn) return;
    const patternEl = document.getElementById('regex-pattern');
    const val = btn.dataset.value;
    const start = patternEl.selectionStart;
    const end = patternEl.selectionEnd;
    patternEl.value = patternEl.value.slice(0, start) + val + patternEl.value.slice(end);
    patternEl.selectionStart = patternEl.selectionEnd = start + val.length;
    patternEl.focus();
    renderRegex();
  });
  document.getElementById('regex-pattern').addEventListener('input', renderRegex);
  document.getElementById('regex-test').addEventListener('input', renderRegex);
  document.getElementById('regex-replace').addEventListener('input', renderRegex);

  document.getElementById('regex-flags').addEventListener('click', e => {
    const btn = e.target.closest('.regex-flag-btn');
    if (!btn) return;
    const flag = btn.dataset.flag;
    State.regexFlags[flag] = !State.regexFlags[flag];
    btn.classList.toggle('regex-flag-btn--active', State.regexFlags[flag]);
    renderRegex();
  });

  document.getElementById('regex-replace-copy-btn').addEventListener('click', () => {
    const val = document.getElementById('regex-replace-result').textContent;
    if (!val) return;
    navigator.clipboard.writeText(val).then(() => showToast('コピーしました', 'success'));
  });

  // ━━━ 文字カウント ━━━
  document.getElementById('count-input').addEventListener('input', renderCount);
  document.getElementById('count-clear-btn').addEventListener('click', () => {
    document.getElementById('count-input').value = '';
    renderCount();
  });

  // 初期レンダリング
  renderEncodeResults();
  renderCaseResults();
  renderCount();

  // ━━━ タイムスタンプ ━━━
  document.getElementById('ts-from-epoch').addEventListener('input', renderEpochToDatetime);
  document.getElementById('ts-from-datetime').addEventListener('input', renderDatetimeToEpoch);
  // timestamp セクション全体のコピーボタン（イベント委譲）
  document.getElementById('tool-timestamp').addEventListener('click', e => {
    const btn = e.target.closest('.ts-copy-btn');
    if (!btn) return;
    navigator.clipboard.writeText(btn.dataset.value).then(() => showToast('コピーしました', 'success'));
  });

  // ━━━ TSV/CSV ━━━
  document.getElementById('tsv-delim-bar').addEventListener('click', e => {
    const btn = e.target.closest('.tsv-delim-btn');
    if (!btn) return;
    const delimMap = { tab: '\t', comma: ',', pipe: '|' };
    State.tsv.delimiter = delimMap[btn.dataset.delim] || '\t';
    document.querySelectorAll('.tsv-delim-btn').forEach(b =>
      b.classList.toggle('tsv-delim-btn--active', b.dataset.delim === btn.dataset.delim)
    );
  });
  document.getElementById('tsv-has-header').addEventListener('change', e => {
    State.tsv.hasHeader = e.target.checked;
    if (State.tsv.data.length > 0) renderTsvTable();
  });
  document.getElementById('tsv-parse-btn').addEventListener('click', parseTsvInput);
  document.getElementById('tsv-clear-btn').addEventListener('click', () => {
    document.getElementById('tsv-input').value = '';
    State.tsv.data = [];
    document.getElementById('tsv-table-card').hidden = true;
  });
  document.getElementById('tsv-add-row-btn').addEventListener('click', _tsvAddRow);
  document.getElementById('tsv-table').addEventListener('blur', e => {
    const el = e.target.closest('[contenteditable]');
    if (el && el.dataset.row !== undefined) _syncCellToData(el);
  }, true);
  document.getElementById('tsv-table').addEventListener('click', e => {
    const btn = e.target.closest('.tsv-del-row-btn');
    if (btn) _tsvDeleteRow(parseInt(btn.dataset.row));
  });
  document.getElementById('tsv-export-tsv').addEventListener('click', () => {
    const out = _exportTsv();
    navigator.clipboard.writeText(out).then(() => showToast('TSVをコピーしました', 'success'));
  });
  document.getElementById('tsv-export-csv').addEventListener('click', () => {
    const out = _exportCsv();
    navigator.clipboard.writeText(out).then(() => showToast('CSVをコピーしました', 'success'));
  });
  document.getElementById('tsv-export-md').addEventListener('click', () => {
    const out = _exportMarkdown();
    navigator.clipboard.writeText(out).then(() => showToast('Markdownテーブルをコピーしました', 'success'));
  });

  // ━━━ 正規表現パターン保存 ━━━
  document.getElementById('regex-save-btn').addEventListener('click', saveCurrentRegexPattern);
  document.getElementById('regex-pattern-list').addEventListener('click', e => {
    const loadBtn = e.target.closest('.regex-saved-item__load');
    const delBtn = e.target.closest('.regex-saved-item__del');
    if (loadBtn) loadRegexPatternById(Number(loadBtn.dataset.id));
    if (delBtn) deleteRegexPattern(Number(delBtn.dataset.id));
  });

  // 保存済みパターン読み込み（非同期）
  loadRegexPatterns();

  // ━━━ フォーマッタ ━━━
  document.getElementById('fmt-format-btn').addEventListener('click', formatCode);
  document.getElementById('fmt-clear-btn').addEventListener('click', () => {
    const inputEl = document.getElementById('fmt-input');
    inputEl.value = '';
    inputEl.classList.remove('fmt-input--error');
    document.getElementById('fmt-error').hidden = true;
    document.getElementById('fmt-output-card').hidden = true;
    document.getElementById('fmt-code').textContent = '';
  });
  document.getElementById('fmt-copy-btn').addEventListener('click', () => {
    const text = document.getElementById('fmt-code').textContent;
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => showToast('コピーしました', 'success'));
  });
  document.getElementById('fmt-input').addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      formatCode();
    }
  });
  // 入力先頭文字で JSON/XML を自動判定
  document.getElementById('fmt-input').addEventListener('input', () => {
    const val = document.getElementById('fmt-input').value.trimStart();
    const radioJson = document.querySelector('input[name="fmt-type"][value="json"]');
    const radioXml  = document.querySelector('input[name="fmt-type"][value="xml"]');
    if (val.startsWith('<') && radioXml) radioXml.checked = true;
    else if ((val.startsWith('{') || val.startsWith('[')) && radioJson) radioJson.checked = true;
  });

  // ━━━ コピーボタンに Icons を注入（静的HTML箇所）━━━
  document.getElementById('regex-replace-copy-btn').innerHTML = `${Icons.copyFill} コピー`;
}

// ==================================================
// タイムスタンプツール
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

// ==================================================
// TSV/CSV ⇔ テーブル変換
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

function _syncCellToData(el) {
  const row = parseInt(el.dataset.row);
  const col = parseInt(el.dataset.col);
  if (State.tsv.data[row]) {
    while (State.tsv.data[row].length <= col) State.tsv.data[row].push('');
    State.tsv.data[row][col] = el.textContent;
  }
}

function _tsvAddRow() {
  const maxCols = State.tsv.data.length > 0 ? Math.max(...State.tsv.data.map(r => r.length)) : 1;
  State.tsv.data.push(Array(maxCols).fill(''));
  renderTsvTable();
}

function _tsvDeleteRow(rowIdx) {
  State.tsv.data.splice(rowIdx, 1);
  renderTsvTable();
}

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

// ==================================================
// 正規表現パターン保存
// ==================================================

async function _initToolsDb() {
  if (!State._toolsDb) {
    State._toolsDb = new ToolsDB();
  }
  await State._toolsDb.open();
}

async function loadRegexPatterns() {
  try {
    await _initToolsDb();
    State.regexPatterns = await State._toolsDb.getAllPatterns();
    renderRegexPatternList();
  } catch (e) {
    console.warn('パターン読み込みエラー:', e);
  }
}

function renderRegexPatternList() {
  const card = document.getElementById('regex-patterns-card');
  const list = document.getElementById('regex-pattern-list');
  if (!card || !list) return;

  if (State.regexPatterns.length === 0) {
    card.hidden = true;
    return;
  }

  card.hidden = false;
  list.innerHTML = State.regexPatterns.map(p => `
    <div class="regex-saved-item" data-id="${p.id}">
      <span class="regex-saved-item__name">${escapeHtml(p.name)}</span>
      <span class="regex-saved-item__pattern">/${escapeHtml(p.pattern)}/${escapeHtml(p.flags)}</span>
      <button class="btn btn--ghost btn--sm regex-saved-item__load" data-id="${p.id}">読み込み</button>
      <button class="btn btn--ghost-danger btn--sm regex-saved-item__del" data-id="${p.id}">削除</button>
    </div>
  `).join('');
}

async function saveCurrentRegexPattern() {
  const pattern = document.getElementById('regex-pattern').value.trim();
  if (!pattern) { showToast('パターンを入力してください', 'error'); return; }

  const name = prompt('パターン名を入力してください:');
  if (!name || !name.trim()) return;

  try {
    await _initToolsDb();
    const flags = Object.entries(State.regexFlags).filter(([,v]) => v).map(([k]) => k).join('');
    const testText = document.getElementById('regex-test').value;
    await State._toolsDb.addPattern({
      name: name.trim(),
      pattern,
      flags,
      test_text: testText,
      created_at: new Date().toISOString(),
      position: Date.now(),
    });
    await loadRegexPatterns();
    showToast('パターンを保存しました');
  } catch (e) {
    showToast('保存に失敗しました', 'error');
  }
}

function loadRegexPatternById(id) {
  const p = State.regexPatterns.find(x => x.id === id);
  if (!p) return;
  document.getElementById('regex-pattern').value = p.pattern;
  document.getElementById('regex-test').value = p.test_text || '';
  // フラグを復元
  ['g', 'i', 'm', 's', 'u'].forEach(f => {
    State.regexFlags[f] = p.flags.includes(f);
    const btn = document.querySelector(`.regex-flag-btn[data-flag="${f}"]`);
    if (btn) btn.classList.toggle('regex-flag-btn--active', State.regexFlags[f]);
  });
  renderRegex();
  showToast(`「${p.name}」を読み込みました`);
}

async function deleteRegexPattern(id) {
  try {
    await _initToolsDb();
    await State._toolsDb.deletePattern(id);
    await loadRegexPatterns();
    showToast('パターンを削除しました');
  } catch (e) {
    showToast('削除に失敗しました', 'error');
  }
}

document.addEventListener('DOMContentLoaded', init);

// テーマ変更を受け取る（iframe 内での親フレームからのメッセージ）
window.addEventListener('message', e => {
  if (e.data?.type === 'theme-change') {
    document.documentElement.setAttribute('data-theme', e.data.theme);
  }
});
