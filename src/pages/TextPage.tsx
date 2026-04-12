// ==================================================
// TextPage: テキスト処理ツール
// ==================================================
// セクション: regex / encode / case / count / format / timestamp / tsv

import { useCallback, useEffect, useState } from 'react';
import { Clipboard } from '../core/clipboard';
import { Toast } from '../components/Toast';
import { ShortcutHelp } from '../components/ShortcutHelp';

// --------------------------------------------------
// 共通ユーティリティ
// --------------------------------------------------
function escHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

type TextSection = 'regex' | 'encode' | 'case' | 'count' | 'format' | 'timestamp' | 'tsv';

const TAB_LABELS: { id: TextSection; label: string }[] = [
  { id: 'regex',     label: '正規表現' },
  { id: 'encode',    label: 'エンコード' },
  { id: 'case',      label: 'ケース変換' },
  { id: 'count',     label: '文字カウント' },
  { id: 'format',    label: 'フォーマッタ' },
  { id: 'timestamp', label: 'タイムスタンプ' },
  { id: 'tsv',       label: 'TSV/CSV' },
];

// --------------------------------------------------
// エンコード/デコード セクション
// --------------------------------------------------
type EncodeDir = 'encode' | 'decode';

const ENCODE_FNS: Record<string, Record<EncodeDir, (s: string) => string>> = {
  base64: {
    encode: (s) => { try { return btoa(unescape(encodeURIComponent(s))); } catch { throw new Error('エンコード失敗'); } },
    decode: (s) => { try { return decodeURIComponent(escape(atob(s.trim()))); } catch { throw new Error('デコード失敗（不正なBase64）'); } },
  },
  url: {
    encode: (s) => encodeURIComponent(s),
    decode: (s) => { try { return decodeURIComponent(s); } catch { throw new Error('デコード失敗（不正なURLエンコード）'); } },
  },
  html: {
    encode: (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
    decode: (s) => { const ta = document.createElement('textarea'); ta.innerHTML = s; return ta.value; },
  },
  unicode: {
    encode: (s) => [...s].map((c) => { const cp = c.codePointAt(0)!; return cp > 127 ? `\\u${cp.toString(16).padStart(4, '0')}` : c; }).join(''),
    decode: (s) => s.replace(/\\u([0-9a-fA-F]{4,6})/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16))),
  },
};

const ENCODE_FORMATS = [
  { type: 'base64',  label: 'Base64',   desc: 'バイナリ↔テキスト' },
  { type: 'url',     label: 'URL',      desc: 'パーセントエンコーディング' },
  { type: 'html',    label: 'HTML',     desc: '特殊文字エスケープ' },
  { type: 'unicode', label: 'Unicode',  desc: '\\uXXXX エスケープ' },
];

function EncodeSection() {
  const [input, setInput] = useState('');
  const [dir, setDir]     = useState<EncodeDir>(() => (localStorage.getItem('text_encode_dir') as EncodeDir) || 'encode');

  const results = ENCODE_FORMATS.map(({ type, label, desc }) => {
    let value = '', error = '';
    if (input) { try { value = ENCODE_FNS[type][dir](input); } catch (e) { error = (e as Error).message; } }
    return { type, label, desc, value, error };
  });

  return (
    <div className="encode-section">
      <div className="encode-dir-bar" id="encode-dir-toggle">
        {(['encode', 'decode'] as EncodeDir[]).map((d) => (
          <button
            key={d}
            type="button"
            className={`encode-dir-btn${dir === d ? ' encode-dir-btn--active' : ''}`}
            data-dir={d}
            onClick={() => { setDir(d); localStorage.setItem('text_encode_dir', d); }}
          >
            {d === 'encode' ? 'エンコード' : 'デコード'}
          </button>
        ))}
      </div>
      <div className="encode-input-wrap">
        <textarea
          id="encode-input"
          className="txt-textarea"
          placeholder="テキストを入力..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={4}
        />
        <button type="button" className="btn btn--ghost btn--sm" id="btn-encode-clear" onClick={() => setInput('')}>クリア</button>
      </div>
      <div className="encode-result-list" id="encode-result-list">
        {results.map(({ type, label, desc, value, error }) => (
          <div key={type} className="encode-result-item">
            <span className="encode-result-item__label" title={desc}>{label}</span>
            {error
              ? <span className="encode-result-item__error">{error}</span>
              : <span className="encode-result-item__value">{value || <span className="encode-result-item__empty">—</span>}</span>
            }
            <button
              type="button"
              className="btn btn--ghost btn--sm encode-result-item__copy"
              disabled={!value}
              onClick={() => Clipboard.copy(value).then(() => Toast.success('コピーしました'))}
            >
              コピー
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// --------------------------------------------------
// ケース変換 セクション
// --------------------------------------------------
function toWords(str: string): string[] {
  return str
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[-_.]+/g, ' ')
    .trim().toLowerCase().split(/\s+/).filter(Boolean);
}

const CASE_FORMATS: { label: string; fn: (s: string) => string }[] = [
  { label: 'lowercase',            fn: (s) => s.toLowerCase() },
  { label: 'UPPERCASE',            fn: (s) => s.toUpperCase() },
  { label: 'Title Case',           fn: (s) => toWords(s).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') },
  { label: 'Sentence case',        fn: (s) => { const w = toWords(s).join(' '); return w ? w[0].toUpperCase() + w.slice(1) : ''; } },
  { label: 'camelCase',            fn: (s) => { const w = toWords(s); return w[0] + w.slice(1).map((v) => v[0].toUpperCase() + v.slice(1)).join(''); } },
  { label: 'PascalCase',           fn: (s) => toWords(s).map((w) => w[0].toUpperCase() + w.slice(1)).join('') },
  { label: 'snake_case',           fn: (s) => toWords(s).join('_') },
  { label: 'SCREAMING_SNAKE_CASE', fn: (s) => toWords(s).join('_').toUpperCase() },
  { label: 'kebab-case',           fn: (s) => toWords(s).join('-') },
  { label: 'COBOL-CASE',           fn: (s) => toWords(s).join('-').toUpperCase() },
  { label: 'dot.case',             fn: (s) => toWords(s).join('.') },
  { label: 'path/case',            fn: (s) => toWords(s).join('/') },
];

function CaseSection() {
  const [input, setInput] = useState('');
  const lines = input.split('\n');

  return (
    <div className="case-section">
      <textarea
        id="case-input"
        className="txt-textarea"
        placeholder="変換するテキストを入力..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={4}
      />
      <div className="case-result-list" id="case-result-list">
        {CASE_FORMATS.map(({ label, fn }) => {
          let result = '';
          try { if (input) result = lines.map((l) => l ? fn(l) : '').join('\n'); } catch { result = ''; }
          return (
            <div key={label} className="case-item">
              <span className="case-item__label">{label}</span>
              <span className="case-item__value">{result || <span className="case-item__empty">—</span>}</span>
              <button
                type="button"
                className="case-item__copy btn btn--ghost btn--sm"
                disabled={!result}
                onClick={() => Clipboard.copy(result).then(() => Toast.success('コピーしました'))}
              >
                コピー
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --------------------------------------------------
// 文字カウント セクション
// --------------------------------------------------
const FULL_WIDTH_RE = /[^\x00-\x7F\uFF61-\uFF9F]/g;

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

function countStats(text: string) {
  if (!text) return { chars: 0, charsNoSpace: 0, bytes: 0, lines: 0, words: 0, paragraphs: 0, fullWidth: 0, halfWidth: 0 };
  const chars = [...text].length;
  const lines = text === '' ? 0 : text.split('\n').length;
  FULL_WIDTH_RE.lastIndex = 0;
  const fullWidthCount = (text.match(FULL_WIDTH_RE) || []).length;
  const words = (text.match(/[^\s\u3000、。！？…・\n\r\t]+/g) || []).length;
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim()).length || (text.trim() ? 1 : 0);
  return {
    chars,
    charsNoSpace: [...text.replace(/\s/g, '')].length,
    bytes: new TextEncoder().encode(text).length,
    lines,
    words,
    paragraphs,
    fullWidth: fullWidthCount,
    halfWidth: chars - fullWidthCount,
  };
}

function CountSection() {
  const [input, setInput] = useState('');
  const stats = countStats(input);

  return (
    <div className="count-section">
      <textarea
        id="count-input"
        className="txt-textarea"
        placeholder="文字数をカウントするテキストを入力..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={6}
      />
      <div className="count-stats" id="count-stats">
        {COUNT_STATS_DEF.map(({ key, label }) => (
          <div key={key} className="count-stat">
            <div className="count-stat__value">{(stats as any)[key].toLocaleString()}</div>
            <div className="count-stat__label">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --------------------------------------------------
// フォーマッタ セクション
// --------------------------------------------------
function serializeXml(node: Node, depth: number): string {
  const indent = '  '.repeat(depth);
  if (node.nodeType === Node.TEXT_NODE) { const t = node.textContent?.trim(); return t ? `${indent}${t}` : ''; }
  if (node.nodeType === Node.COMMENT_NODE) return `${indent}<!--${node.textContent}-->`;
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = node as Element;
  const tag = el.tagName;
  const attrs = Array.from(el.attributes).map((a) => ` ${a.name}="${a.value}"`).join('');
  const children = Array.from(el.childNodes).map((c) => serializeXml(c, depth + 1)).filter((s) => s !== '');
  if (children.length === 0) return `${indent}<${tag}${attrs}/>`;
  if (children.length === 1 && !children[0].startsWith(indent + '  ')) return `${indent}<${tag}${attrs}>${children[0].trim()}</${tag}>`;
  return `${indent}<${tag}${attrs}>\n${children.join('\n')}\n${indent}</${tag}>`;
}

function FormatSection() {
  const [input, setInput]   = useState('');
  const [fmtType, setFmtType] = useState<'json' | 'xml'>('json');
  const [output, setOutput] = useState('');
  const [error, setError]   = useState('');

  const format = useCallback(() => {
    const src = input.trim();
    if (!src) return;
    setError('');
    try {
      if (fmtType === 'json') {
        setOutput(JSON.stringify(JSON.parse(src), null, 2));
      } else {
        const parser = new DOMParser();
        const doc = parser.parseFromString(src, 'text/xml');
        const parseErr = doc.querySelector('parseerror');
        if (parseErr) throw new Error(parseErr.textContent || 'XMLパースエラー');
        setOutput(Array.from(doc.childNodes).map((n) => serializeXml(n, 0)).filter(Boolean).join('\n'));
      }
    } catch (e) {
      setError((e as Error).message);
      setOutput('');
    }
  }, [input, fmtType]);

  return (
    <div className="format-section">
      <div className="fmt-type-row">
        {(['json', 'xml'] as const).map((t) => (
          <label key={t} className="fmt-type-label">
            <input type="radio" name="fmt-type" value={t} checked={fmtType === t} onChange={() => setFmtType(t)} />
            {t.toUpperCase()}
          </label>
        ))}
        <button type="button" className="btn btn--primary btn--sm" onClick={format}>整形</button>
      </div>
      <div className="fmt-panes">
        <div className="fmt-pane">
          <label className="fmt-pane-label">入力</label>
          <textarea
            id="fmt-input"
            className="txt-textarea"
            placeholder={`${fmtType.toUpperCase()} を貼り付け...`}
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(''); setOutput(''); }}
            rows={12}
            spellCheck={false}
          />
        </div>
        <div className="fmt-pane">
          <label className="fmt-pane-label">
            結果
            {output && (
              <button type="button" className="btn btn--ghost btn--sm fmt-copy-btn"
                onClick={() => Clipboard.copy(output).then(() => Toast.success('コピーしました'))}>
                コピー
              </button>
            )}
          </label>
          {error ? (
            <div className="fmt-error">{error}</div>
          ) : (
            <div id="fmt-output-card" className="fmt-output-card">
              <pre id="fmt-code" className="fmt-code">{output}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------
// タイムスタンプ セクション
// --------------------------------------------------
const _jstFmt = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const _localFmt = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const fmtJST   = (d: Date) => _jstFmt.format(d).replace(/\//g, '-');
const fmtLocal = (d: Date) => _localFmt.format(d).replace(/\//g, '-');

function buildNowRows(now: Date) {
  const sec = Math.floor(now.getTime() / 1000);
  return [
    { label: 'エポック秒',    value: String(sec) },
    { label: 'エポックms',    value: String(now.getTime()) },
    { label: 'ISO 8601 (UTC)', value: now.toISOString() },
    { label: 'JST',           value: fmtJST(now) },
    { label: 'ローカル',       value: fmtLocal(now) },
  ];
}

function TimestampSection({ active }: { active: boolean }) {
  const [rows, setRows]      = useState(() => buildNowRows(new Date()));
  const [epochIn, setEpochIn] = useState('');
  const [dtIn, setDtIn]      = useState('');
  const [epochResult, setEpochResult] = useState<{ label: string; value: string }[] | null>(null);
  const [dtResult, setDtResult]       = useState<string | null>(null);
  const [epochErr, setEpochErr] = useState('');
  const [dtErr, setDtErr]       = useState('');

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setRows(buildNowRows(new Date())), 1000);
    return () => clearInterval(id);
  }, [active]);

  const convertEpoch = useCallback(() => {
    const raw = epochIn.trim().replace(/[,_]/g, '');
    if (!/^-?\d+$/.test(raw)) { setEpochErr('数値を入力してください'); setEpochResult(null); return; }
    const num = Number(raw);
    const date = Math.abs(num) < 1e11 ? new Date(num * 1000) : new Date(num);
    if (isNaN(date.getTime())) { setEpochErr('無効な値です'); setEpochResult(null); return; }
    setEpochErr('');
    setEpochResult([
      { label: 'ISO 8601 (UTC)', value: date.toISOString() },
      { label: 'JST',            value: fmtJST(date) },
      { label: 'ローカル',        value: fmtLocal(date) },
    ]);
  }, [epochIn]);

  const convertDatetime = useCallback(() => {
    const d = new Date(dtIn);
    if (isNaN(d.getTime())) { setDtErr('日時を正しく入力してください'); setDtResult(null); return; }
    setDtErr('');
    setDtResult(String(Math.floor(d.getTime() / 1000)));
  }, [dtIn]);

  return (
    <div className="timestamp-section">
      <div className="ts-now-card">
        <div className="ts-now-title">現在時刻</div>
        <div className="ts-now-grid" id="ts-now-grid">
          {rows.map(({ label, value }) => (
            <div key={label} className="ts-now-row">
              <span className="ts-now-row__label">{label}</span>
              <span className="ts-now-row__value">{value}</span>
              <button type="button" className="btn btn--ghost btn--sm ts-copy-btn"
                onClick={() => Clipboard.copy(value).then(() => Toast.success('コピーしました'))}>コピー</button>
            </div>
          ))}
        </div>
      </div>
      <div className="ts-convert-cards">
        <div className="ts-convert-card">
          <div className="ts-convert-title">エポック → 日時</div>
          <div className="ts-convert-row">
            <input id="ts-from-epoch" className="txt-input" type="text" placeholder="例: 1700000000" value={epochIn} onChange={(e) => setEpochIn(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') convertEpoch(); }} />
            <button type="button" className="btn btn--primary btn--sm" onClick={convertEpoch}>変換</button>
          </div>
          {epochErr && <div className="ts-error" id="ts-from-epoch-error">{epochErr}</div>}
          {epochResult && (
            <div id="ts-from-epoch-result" className="ts-result-list">
              {epochResult.map(({ label, value }) => (
                <div key={label} className="ts-result-row">
                  <span className="ts-result-label">{label}</span>
                  <span className="ts-result-value">{value}</span>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => Clipboard.copy(value).then(() => Toast.success('コピーしました'))}>コピー</button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="ts-convert-card">
          <div className="ts-convert-title">日時 → エポック秒</div>
          <div className="ts-convert-row">
            <input id="ts-to-epoch" className="txt-input" type="datetime-local" value={dtIn} onChange={(e) => setDtIn(e.target.value)} />
            <button type="button" className="btn btn--primary btn--sm" onClick={convertDatetime}>変換</button>
          </div>
          {dtErr && <div className="ts-error">{dtErr}</div>}
          {dtResult && (
            <div id="ts-to-epoch-result" className="ts-result-list">
              <div className="ts-result-row">
                <span className="ts-result-label">エポック秒</span>
                <span className="ts-result-value">{dtResult}</span>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => Clipboard.copy(dtResult).then(() => Toast.success('コピーしました'))}>コピー</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------
// 正規表現テスター セクション
// --------------------------------------------------
type RegexFlags = { g: boolean; i: boolean; m: boolean; s: boolean };

function RegexSection() {
  const [pattern, setPattern]   = useState('');
  const [testStr, setTestStr]   = useState('');
  const [replaceStr, setReplace] = useState('');
  const [flags, setFlags]        = useState<RegexFlags>({ g: true, i: false, m: false, s: false });
  const [helpOpen, setHelpOpen] = useState(false);

  const buildRegex = useCallback((): RegExp | Error | null => {
    if (!pattern) return null;
    const f = Object.entries(flags).filter(([, v]) => v).map(([k]) => k).join('');
    try { return new RegExp(pattern, f); } catch (e) { return e as Error; }
  }, [pattern, flags]);

  const rx = buildRegex();
  let matchCount = 0;
  let displayHtml = '';
  let replaceResult = '';
  let rxError = '';

  if (rx instanceof Error) {
    rxError = rx.message;
  } else if (rx && testStr) {
    try {
      const allMatches = [...testStr.matchAll(new RegExp(rx.source, rx.flags.includes('g') ? rx.flags : rx.flags + 'g'))];
      matchCount = allMatches.length;
      let last = 0;
      const parts: string[] = [];
      allMatches.forEach((m) => {
        parts.push(escHtml(testStr.slice(last, m.index!)));
        parts.push(`<mark class="rx-mark">${escHtml(m[0])}</mark>`);
        last = m.index! + m[0].length;
      });
      parts.push(escHtml(testStr.slice(last)));
      displayHtml = parts.join('');
      replaceResult = testStr.replace(rx, replaceStr);
    } catch (e) {
      rxError = (e as Error).message;
    }
  }

  return (
    <div className="regex-section">
      <div className="regex-top">
        <div className="regex-pattern-row">
          <span className="regex-delimiter">/</span>
          <input
            id="regex-pattern"
            className="txt-input regex-pattern-input"
            type="text"
            placeholder="正規表現パターン"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            spellCheck={false}
          />
          <span className="regex-delimiter">/</span>
          <div className="regex-flags">
            {(['g', 'i', 'm', 's'] as (keyof RegexFlags)[]).map((f) => (
              <label key={f} className={`regex-flag${flags[f] ? ' regex-flag--active' : ''}`}>
                <input type="checkbox" checked={flags[f]} onChange={(e) => setFlags((prev) => ({ ...prev, [f]: e.target.checked }))} />
                {f}
              </label>
            ))}
          </div>
        </div>
        {rxError && <div className="regex-error" id="regex-error">{rxError}</div>}
        <button
          id="regex-help-toggle"
          type="button"
          className={`regex-help-toggle${helpOpen ? ' regex-help-toggle--open' : ''}`}
          aria-expanded={helpOpen}
          onClick={() => setHelpOpen((v) => !v)}
        >
          チートシート
        </button>
      </div>
      <div className="regex-test-area">
        <label className="regex-label">テスト文字列</label>
        {!rxError && testStr && displayHtml ? (
          <div
            id="regex-display-wrap"
            className="regex-display-wrap"
          >
            <pre
              id="regex-display"
              className="regex-display"
              dangerouslySetInnerHTML={{ __html: displayHtml }}
            />
            {matchCount > 0 && <span id="regex-match-count" className="regex-match-count">{matchCount} 件マッチ</span>}
          </div>
        ) : null}
        <textarea
          id="regex-test"
          className="txt-textarea"
          placeholder="テスト文字列を入力..."
          value={testStr}
          onChange={(e) => setTestStr(e.target.value)}
          rows={5}
          spellCheck={false}
        />
      </div>
      <div className="regex-replace-area">
        <label className="regex-label">置換文字列 <span className="regex-label-hint">($1, $2 で参照)</span></label>
        <input
          id="regex-replace"
          className="txt-input"
          type="text"
          placeholder="置換後のテキスト（空欄で削除）"
          value={replaceStr}
          onChange={(e) => setReplace(e.target.value)}
        />
        {replaceResult && (
          <div id="regex-replace-result-wrap" className="regex-replace-result-wrap">
            <pre id="regex-replace-result" className="regex-replace-result">{replaceResult}</pre>
            <button type="button" className="btn btn--ghost btn--sm"
              onClick={() => Clipboard.copy(replaceResult).then(() => Toast.success('コピーしました'))}>
              コピー
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// --------------------------------------------------
// TSV/CSV セクション
// --------------------------------------------------
type TsvData = string[][];

function parseCSV(text: string, delim: string, quote: string): TsvData {
  const rows: TsvData = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const hasQuote = quote !== '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i]; const nc = text[i + 1];
    if (inQuotes) {
      if (c === quote && nc === quote) { field += quote; i++; }
      else if (c === quote) { inQuotes = false; }
      else { field += c; }
    } else {
      if (hasQuote && c === quote) { inQuotes = true; }
      else if (c === delim) { row.push(field); field = ''; }
      else if (c === '\n' || (c === '\r' && nc === '\n')) {
        row.push(field); field = '';
        if (row.some((f) => f !== '') || row.length > 1) rows.push(row);
        row = []; if (c === '\r') i++;
      } else if (c === '\r') {
        row.push(field); field = '';
        if (row.some((f) => f !== '') || row.length > 1) rows.push(row);
        row = [];
      } else { field += c; }
    }
  }
  row.push(field);
  if (row.some((f) => f !== '') || row.length > 1) rows.push(row);
  return rows.filter((r) => r.length > 0);
}

function TsvSection() {
  const [input, setInput]   = useState('');
  const [delim, setDelim]   = useState<'tab' | 'comma' | 'pipe'>('tab');
  const [quote, setQuote]   = useState<'none' | 'dquote' | 'squote'>('dquote');
  const [hasHeader, setHasHeader] = useState(true);
  const [data, setData]     = useState<TsvData>([]);

  const DELIM_CHAR = { tab: '\t', comma: ',', pipe: '|' };
  const QUOTE_CHAR = { none: '', dquote: '"', squote: "'" };

  const parse = useCallback(() => {
    const d = parseCSV(input, DELIM_CHAR[delim], QUOTE_CHAR[quote]);
    setData(d);
  }, [input, delim, quote]);

  useEffect(() => { if (input) parse(); else setData([]); }, [input, delim, quote]); // eslint-disable-line react-hooks/exhaustive-deps

  const exportCSV = useCallback(() => {
    if (!data.length) return;
    const dc = DELIM_CHAR[delim];
    const qc = QUOTE_CHAR[quote];
    const text = data.map((row) =>
      row.map((cell) => {
        if (qc && (cell.includes(dc) || cell.includes(qc) || cell.includes('\n')))
          return `${qc}${cell.replace(new RegExp(qc, 'g'), qc + qc)}${qc}`;
        return cell;
      }).join(dc)
    ).join('\n');
    Clipboard.copy(text).then(() => Toast.success('コピーしました'));
  }, [data, delim, quote]);

  const headers = hasHeader && data.length > 0 ? data[0] : null;
  const bodyRows = hasHeader && data.length > 0 ? data.slice(1) : data;

  return (
    <div className="tsv-section">
      <div className="tsv-options">
        <div className="tsv-delim-bar" id="tsv-delim-bar">
          {(['tab', 'comma', 'pipe'] as const).map((d) => (
            <button key={d} type="button"
              className={`tsv-delim-btn${delim === d ? ' tsv-delim-btn--active' : ''}`}
              data-delim={d} onClick={() => setDelim(d)}>
              {d === 'tab' ? 'タブ' : d === 'comma' ? 'カンマ' : 'パイプ (|)'}
            </button>
          ))}
        </div>
        <div className="tsv-quote-bar" id="tsv-quote-bar">
          {(['none', 'dquote', 'squote'] as const).map((q) => (
            <button key={q} type="button"
              className={`tsv-delim-btn${quote === q ? ' tsv-delim-btn--active' : ''}`}
              data-quote={q} onClick={() => setQuote(q)}>
              {q === 'none' ? 'なし' : q === 'dquote' ? '"（ダブル）' : "'（シングル）"}
            </button>
          ))}
        </div>
        <label className="diff-check">
          <input type="checkbox" id="tsv-has-header" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} />
          1行目をヘッダーとして扱う
        </label>
        {data.length > 0 && (
          <button type="button" className="btn btn--ghost btn--sm tsv-export-btn" onClick={exportCSV}>
            コピー
          </button>
        )}
      </div>
      <textarea
        id="tsv-input"
        className="txt-textarea"
        placeholder="TSV / CSV データを貼り付け..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={6}
        spellCheck={false}
      />
      {data.length > 0 && (
        <div className="tsv-table-wrap">
          <table className="tsv-table">
            {headers && (
              <thead>
                <tr>{headers.map((h, j) => <th key={j}>{h}</th>)}</tr>
              </thead>
            )}
            <tbody>
              {bodyRows.map((row, i) => (
                <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------
// TextPage 本体
// --------------------------------------------------
const SHORTCUTS = [{
  name: 'テキスト処理',
  shortcuts: [
    { keys: ['Ctrl', 'Shift', 'C'], description: 'アクティブツールの結果をコピー' },
  ],
}];

export function TextPage() {
  const [section, setSection] = useState<TextSection>(
    () => (localStorage.getItem('text_active_section') as TextSection) || 'regex'
  );

  const switchSection = useCallback((s: TextSection) => {
    setSection(s);
    localStorage.setItem('text_active_section', s);
  }, []);

  return (
    <div className="text-page">
      <ShortcutHelp categories={SHORTCUTS} />
      <nav className="txt-tabs" id="txt-tabs" role="tablist" aria-label="テキスト処理ツール">
        {TAB_LABELS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            className={`txt-tab${section === id ? ' txt-tab--active' : ''}`}
            data-tool={id}
            aria-selected={section === id}
            onClick={() => switchSection(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="txt-body">
        {section === 'regex'     && <RegexSection />}
        {section === 'encode'    && <EncodeSection />}
        {section === 'case'      && <CaseSection />}
        {section === 'count'     && <CountSection />}
        {section === 'format'    && <FormatSection />}
        {section === 'timestamp' && <TimestampSection active={section === 'timestamp'} />}
        {section === 'tsv'       && <TsvSection />}
      </div>
    </div>
  );
}
