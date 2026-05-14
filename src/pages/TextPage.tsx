// ==================================================
// TextPage: テキスト処理ツール
// ==================================================
// セクション: regex / encode / case / count / format / timestamp / tsv

import styles from '../styles/pages/text.module.css';
import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clipboard } from '../core/clipboard';
import { Toast } from '../components/Toast';
import { ShortcutHelp } from '../components/ShortcutHelp';
import { textDB, type RegexPattern } from '../db/text_db';
import { Select, type SelectOption } from '../components/Select';
import { useTabStore } from '../stores/tab_store';
import { searchRegistry } from '../stores/search_store';

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
// エンコード/デコード
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

// --------------------------------------------------
// ケース変換
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

// --------------------------------------------------
// 文字カウント
// --------------------------------------------------
const FULL_WIDTH_RE = /[^\x00-\x7F｡-ﾟ]/g;

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
  const words = (text.match(/[^\s　、。！？…・\n\r\t]+/g) || []).length;
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

// --------------------------------------------------
// フォーマッタ ヘルパー
// --------------------------------------------------
function serializeXml(node: Node, depth: number): string {
  const indent = '  '.repeat(depth);
  if (node.nodeType === Node.TEXT_NODE) { const t = node.textContent?.trim(); return t ? `${indent}${t}` : ''; }
  if (node.nodeType === Node.COMMENT_NODE) return `${indent}<!--${node.textContent}-->`;
  if (node.nodeType === Node.CDATA_SECTION_NODE) return `${indent}<![CDATA[${node.textContent}]]>`;
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = node as Element;
  const tag = el.tagName;
  const attrs = Array.from(el.attributes).map((a) => ` ${a.name}="${a.value}"`).join('');
  const children = Array.from(el.childNodes).map((c) => serializeXml(c, depth + 1)).filter((s) => s !== '');
  if (children.length === 0) return `${indent}<${tag}${attrs}/>`;
  if (children.length === 1 && !children[0].startsWith(indent + '  ')) return `${indent}<${tag}${attrs}>${children[0].trim()}</${tag}>`;
  return `${indent}<${tag}${attrs}>\n${children.join('\n')}\n${indent}</${tag}>`;
}

// --------------------------------------------------
// 正規表現チートシート データ
// --------------------------------------------------
const REGEX_HELP = [
  { title: 'アンカー', items: [
    { sym: '^',   desc: '行の先頭' },
    { sym: '$',   desc: '行の末尾' },
    { sym: '\\b', desc: '単語境界' },
    { sym: '\\B', desc: '単語境界以外' },
  ]},
  { title: '文字クラス', items: [
    { sym: '.',   desc: '任意の1文字（改行を除く）' },
    { sym: '\\d', desc: '数字 [0-9]' },
    { sym: '\\D', desc: '数字以外' },
    { sym: '\\w', desc: '英数字・アンダースコア' },
    { sym: '\\W', desc: '\\w 以外' },
    { sym: '\\s', desc: '空白文字' },
    { sym: '\\S', desc: '空白以外' },
  ]},
  { title: '文字セット', items: [
    { sym: '[abc]',       desc: 'a, b, c のいずれか' },
    { sym: '[^abc]',      desc: 'a, b, c 以外' },
    { sym: '[a-z]',       desc: 'a〜z の範囲' },
    { sym: '[a-zA-Z0-9]', desc: '英数字の範囲' },
  ]},
  { title: '数量詞', items: [
    { sym: '*',     desc: '0回以上（最長マッチ）' },
    { sym: '+',     desc: '1回以上（最長マッチ）' },
    { sym: '?',     desc: '0回または1回' },
    { sym: '{n}',   desc: 'ちょうど n 回' },
    { sym: '{n,}',  desc: 'n 回以上' },
    { sym: '{n,m}', desc: 'n 回以上 m 回以下' },
    { sym: '*?',    desc: '0回以上（最短マッチ）' },
    { sym: '+?',    desc: '1回以上（最短マッチ）' },
  ]},
  { title: 'グループ', items: [
    { sym: '(...)',        desc: 'キャプチャグループ（$1, $2 で参照）' },
    { sym: '(?:...)',      desc: '非キャプチャグループ' },
    { sym: '(?<name>...)', desc: '名前付きキャプチャグループ' },
    { sym: '(?=...)',      desc: '肯定先読み' },
    { sym: '(?!...)',      desc: '否定先読み' },
    { sym: '(?<=...)',     desc: '肯定後読み' },
    { sym: '(?<!...)',     desc: '否定後読み' },
  ]},
  { title: 'エスケープ', items: [
    { sym: '\\n',  desc: '改行' },
    { sym: '\\t',  desc: 'タブ' },
    { sym: '\\r',  desc: 'キャリッジリターン' },
    { sym: '\\.',  desc: 'ドット（リテラル）' },
    { sym: '\\\\', desc: 'バックスラッシュ' },
  ]},
  { title: 'フラグ', items: [
    { sym: 'g', desc: 'グローバル — 全マッチを検索' },
    { sym: 'i', desc: '大小文字を区別しない' },
    { sym: 'm', desc: '^ $ が各行の先頭/末尾にマッチ' },
    { sym: 's', desc: '. が改行にもマッチ' },
    { sym: 'u', desc: 'Unicode — サロゲートペアを正しく扱う' },
  ]},
  { title: 'よく使うパターン例', items: [
    { sym: '\\d+',                    desc: '1桁以上の整数' },
    { sym: '\\d{4}-\\d{2}-\\d{2}',   desc: 'YYYY-MM-DD 形式の日付' },
    { sym: '[\\w.+-]+@[\\w-]+\\.[\\w.]+', desc: 'メールアドレス（簡易）' },
    { sym: 'https?://\\S+',           desc: 'URL（http / https）' },
    { sym: '^\\s*$',                  desc: '空行' },
  ]},
];

// --------------------------------------------------
// TSV/CSV パーサー
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

// --------------------------------------------------
// タイムスタンプ ヘルパー
// --------------------------------------------------
const _localFmt = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const fmtLocal = (d: Date) => _localFmt.format(d).replace(/\//g, '-');

function fmtWithTz(d: Date, tz: string): string {
  if (!tz) return fmtLocal(d);
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(d).replace(/\//g, '-');
}

const TZ_OPTIONS = [
  { label: 'JST',  tz: 'Asia/Tokyo' },
  { label: 'UTC',  tz: 'UTC' },
  { label: 'EST',  tz: 'America/New_York' },
  { label: 'PST',  tz: 'America/Los_Angeles' },
  { label: 'CET',  tz: 'Europe/Berlin' },
  { label: 'BST',  tz: 'Europe/London' },
  { label: 'SGT',  tz: 'Asia/Singapore' },
  { label: 'IST',  tz: 'Asia/Kolkata' },
  { label: 'CST',  tz: 'Asia/Shanghai' },
  { label: 'AEST', tz: 'Australia/Sydney' },
];

function buildNowRows(now: Date, tz: string) {
  const sec = Math.floor(now.getTime() / 1000);
  const tzLabel = TZ_OPTIONS.find((o) => o.tz === tz)?.label ?? tz;
  const tzVal   = fmtWithTz(now, tz);
  const localVal = fmtLocal(now);
  const rows = [
    { label: 'エポック秒',     value: String(sec) },
    { label: 'エポックms',     value: String(now.getTime()) },
    { label: 'ISO 8601 (UTC)', value: now.toISOString() },
    { label: tzLabel,          value: tzVal },
  ];
  if (localVal !== tzVal) rows.push({ label: 'ローカル', value: localVal });
  return rows;
}

// ==================================================
// EncodeSection
// ==================================================
function EncodeSection() {
  const [input, setInput] = useState('');
  const [dir, setDir] = useState<EncodeDir>(() => (localStorage.getItem('text_encode_dir') as EncodeDir) || 'encode');

  const results = ENCODE_FORMATS.map(({ type, label, desc }) => {
    let value = '', error = '';
    if (input) { try { value = ENCODE_FNS[type][dir](input); } catch (e) { error = (e as Error).message; } }
    return { type, label, desc, value, error };
  });

  return (
    <div className={styles['encode-section']}>
      <div className={styles['section-header']}>
        <div className="seg-ctrl">
          {(['encode', 'decode'] as EncodeDir[]).map((d) => (
            <button key={d} type="button"
              className={clsx('seg-btn', dir === d && 'seg-btn--active')}
              onClick={() => { setDir(d); localStorage.setItem('text_encode_dir', d); }}>
              {d === 'encode' ? 'エンコード' : 'デコード'}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setInput('')}>クリア</button>
      </div>
      <div className={styles['section-body']}>
        <textarea className={styles['txt-textarea']} placeholder="テキストを入力..." value={input}
          onChange={(e) => setInput(e.target.value)} rows={4} />
      </div>
      <div className={styles['encode-result-list']}>
        {results.map(({ type, label, desc, value, error }) => (
          <div key={type} className={styles['encode-result-item']}>
            <span className={styles['encode-result-item__label']} title={desc}>{label}</span>
            {error
              ? <span className={styles['encode-result-item__error']}>{error}</span>
              : <span className={styles['encode-result-item__value']}>{value || <span className={styles['encode-result-item__empty']}>—</span>}</span>}
            <button type="button" className={clsx('btn btn--ghost btn--sm', styles['encode-result-item__copy'])}
              disabled={!value}
              onClick={() => Clipboard.copy(value).then(() => Toast.success('コピーしました'))}>
              コピー
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==================================================
// CaseSection
// ==================================================
function CaseSection() {
  const [input, setInput] = useState('');
  const lines = input.split('\n');
  return (
    <div className={styles['case-section']}>
      <div className={styles['section-header']}>
        <span className={styles['section-label']}>変換するテキストを入力</span>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setInput('')}>クリア</button>
      </div>
      <div className={styles['section-body']}>
        <textarea className={styles['txt-textarea']} placeholder="変換するテキストを入力..."
          value={input} onChange={(e) => setInput(e.target.value)} rows={4} />
      </div>
      <div className={styles['case-result-list']}>
        {CASE_FORMATS.map(({ label, fn }) => {
          let result = '';
          try { if (input) result = lines.map((l) => l ? fn(l) : '').join('\n'); } catch { result = ''; }
          return (
            <div key={label} className={styles['case-item']}>
              <span className={styles['case-item__label']}>{label}</span>
              <span className={styles['case-item__value']}>{result || <span className={styles['case-item__empty']}>—</span>}</span>
              <button type="button" className={clsx(styles['case-item__copy'], 'btn btn--ghost btn--sm')}
                disabled={!result}
                onClick={() => Clipboard.copy(result).then(() => Toast.success('コピーしました'))}>
                コピー
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ==================================================
// CountSection
// ==================================================
function CountSection() {
  const [input, setInput] = useState('');
  const stats = countStats(input);
  return (
    <div className={styles['count-section']}>
      <div className={styles['section-header']}>
        <span className={styles['section-label']}>文字数をカウントするテキストを入力</span>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setInput('')}>クリア</button>
      </div>
      <div className={styles['section-body']}>
        <textarea className={styles['txt-textarea']} placeholder="テキストを入力..."
          value={input} onChange={(e) => setInput(e.target.value)} rows={6} />
      </div>
      <div className={styles['count-stats']}>
        {COUNT_STATS_DEF.map(({ key, label }) => (
          <div key={key} className={styles['count-stat']}>
            <div className={styles['count-stat__value']}>{(stats as Record<string, number>)[key].toLocaleString()}</div>
            <div className={styles['count-stat__label']}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==================================================
// FormatSection — 自動判定・Ctrl+Enter・エラー位置ハイライト・クリア
// ==================================================
function FormatSection() {
  const [input, setInput]     = useState('');
  const [fmtType, setFmtType] = useState<'json' | 'xml'>('json');
  const [output, setOutput]   = useState('');
  const [error, setError]     = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleInput = (val: string) => {
    setInput(val);
    setError('');
    setOutput('');
    const trimmed = val.trimStart();
    if (trimmed.startsWith('<')) setFmtType('xml');
    else if (trimmed.startsWith('{') || trimmed.startsWith('[')) setFmtType('json');
  };

  const highlightPos = useCallback((lineNum: number, colNum: number | null) => {
    const el = inputRef.current;
    if (!el || !lineNum) return;
    const lines = el.value.split('\n');
    const idx = Math.max(0, lineNum - 1);
    const lineStart = lines.slice(0, idx).reduce((s, l) => s + l.length + 1, 0);
    const col = colNum != null && colNum > 0 ? Math.min(colNum - 1, lines[idx]?.length || 0) : 0;
    const selPos = lineStart + col;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(selPos, colNum != null ? selPos + 1 : lineStart + (lines[idx]?.length || 0));
    });
  }, []);

  const format = useCallback(() => {
    const src = input.trim();
    if (!src) return;
    setError('');
    try {
      if (fmtType === 'json') {
        try {
          setOutput(JSON.stringify(JSON.parse(src), null, 2));
        } catch (e) {
          const msg = (e as Error).message;
          const lineMatch = msg.match(/line\s+(\d+)/i);
          const colMatch  = msg.match(/column\s+(\d+)/i);
          const posMatch  = msg.match(/\(char\s+(\d+)\)/) || msg.match(/position\s+(\d+)/i);
          if (lineMatch) {
            const ln = parseInt(lineMatch[1]);
            const cn = colMatch ? parseInt(colMatch[1]) : null;
            highlightPos(ln, cn);
            throw new Error(`行 ${ln}${cn != null ? `、列 ${cn}` : ''}: ${msg}`);
          } else if (posMatch) {
            const pos = parseInt(posMatch[1]);
            const before = input.substring(0, pos);
            const ln = before.split('\n').length;
            const cn = pos - before.lastIndexOf('\n');
            highlightPos(ln, cn);
            throw new Error(`行 ${ln}、列 ${cn}: ${msg}`);
          }
          throw e;
        }
      } else {
        const parser = new DOMParser();
        const doc = parser.parseFromString(src, 'application/xml');
        const parseErr = doc.querySelector('parseerror');
        if (parseErr) {
          const errText = parseErr.textContent || '';
          const lineMatch = errText.match(/line\s+(\d+)/i);
          const colMatch  = errText.match(/column\s+(\d+)/i);
          const descMatch = errText.match(/:\s*(.+)$/m);
          const desc = descMatch ? descMatch[1].trim() : errText.split('\n')[0].trim();
          const ln = lineMatch ? parseInt(lineMatch[1]) : null;
          const cn = colMatch  ? parseInt(colMatch[1])  : null;
          if (ln !== null) highlightPos(ln, cn);
          throw new Error(ln !== null ? `行 ${ln}${cn !== null ? `、列 ${cn}` : ''}: ${desc}` : desc);
        }
        setOutput(Array.from(doc.childNodes).map((n) => serializeXml(n, 0)).filter(Boolean).join('\n'));
      }
    } catch (e) {
      setError((e as Error).message);
      setOutput('');
    }
  }, [input, fmtType, highlightPos]);

  const clear = () => { setInput(''); setOutput(''); setError(''); };

  return (
    <div className={styles['format-section']}>
      <div className={styles['fmt-toolbar']}>
        <div className={styles['fmt-seg']}>
          {(['json', 'xml'] as const).map((t) => (
            <label key={t} className={styles['fmt-seg__item']}>
              <input type="radio" name="fmt-type" value={t} checked={fmtType === t} onChange={() => setFmtType(t)} />
              {t.toUpperCase()}
            </label>
          ))}
        </div>
        <div className={styles['fmt-toolbar__actions']}>
          <button type="button" className="btn btn--primary btn--sm" onClick={format}>整形</button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={clear}>クリア</button>
          {output && (
            <button type="button" className="btn btn--ghost btn--sm"
              onClick={() => Clipboard.copy(output).then(() => Toast.success('コピーしました'))}>
              コピー
            </button>
          )}
        </div>
      </div>
      <div className={styles['fmt-panes']}>
        <div className={styles['fmt-pane']}>
          <div className={styles['fmt-pane-label']}>入力 <span className={styles['fmt-hint']}>Ctrl+Enter で整形</span></div>
          <textarea ref={inputRef}
            className={clsx(styles['txt-textarea'], styles['fmt-textarea'], error && styles['fmt-input--error'])}
            placeholder={`${fmtType.toUpperCase()} を貼り付け...`}
            value={input}
            onChange={(e) => handleInput(e.target.value)}
            onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); format(); } }}
            rows={14} spellCheck={false} />
        </div>
        <div className={styles['fmt-pane']}>
          <div className={styles['fmt-pane-label']}>結果</div>
          {error
            ? <div className={styles['fmt-error']}>{error}</div>
            : <pre className={clsx(styles['fmt-output'], styles['fmt-textarea'])}>{output}</pre>}
        </div>
      </div>
    </div>
  );
}

// ==================================================
// TimestampSection — 変換結果の充実・テキスト入力
// ==================================================
type TsRow = { label: string; value: string };

function TimestampSection({ active }: { active: boolean }) {
  const [selectedTz, setSelectedTz] = useState(() => localStorage.getItem('text_ts_tz') || 'Asia/Tokyo');
  const [nowRows, setNowRows]       = useState(() => buildNowRows(new Date(), selectedTz));
  const [epochIn, setEpochIn]       = useState('');
  const [dtIn, setDtIn]             = useState('');
  const [epochResult, setEpochResult] = useState<TsRow[] | null>(null);
  const [dtResult, setDtResult]     = useState<TsRow[] | null>(null);
  const [epochErr, setEpochErr]     = useState('');
  const [dtErr, setDtErr]           = useState('');

  const tzLabel = useMemo(() => TZ_OPTIONS.find((o) => o.tz === selectedTz)?.label ?? selectedTz, [selectedTz]);

  const changeTz = (tz: string) => {
    setSelectedTz(tz);
    localStorage.setItem('text_ts_tz', tz);
    setNowRows(buildNowRows(new Date(), tz));
    setEpochResult(null);
    setDtResult(null);
  };

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNowRows(buildNowRows(new Date(), selectedTz)), 1000);
    return () => clearInterval(id);
  }, [active, selectedTz]);

  const convertEpoch = useCallback(() => {
    const raw = epochIn.trim().replace(/[,_]/g, '');
    if (!/^-?\d+$/.test(raw)) { setEpochErr('数値を入力してください'); setEpochResult(null); return; }
    const num = Number(raw);
    const date = Math.abs(num) < 1e11 ? new Date(num * 1000) : new Date(num);
    if (isNaN(date.getTime())) { setEpochErr('無効な値です'); setEpochResult(null); return; }
    setEpochErr('');
    const tzVal   = fmtWithTz(date, selectedTz);
    const localVal = fmtLocal(date);
    const rows: TsRow[] = [
      { label: 'UTC',            value: date.toUTCString() },
      { label: 'ISO 8601 (UTC)', value: date.toISOString() },
      { label: tzLabel,          value: tzVal },
    ];
    if (localVal !== tzVal) rows.push({ label: 'ローカル', value: localVal });
    setEpochResult(rows);
  }, [epochIn, selectedTz, tzLabel]);

  const convertDatetime = useCallback(() => {
    const d = new Date(dtIn);
    if (isNaN(d.getTime())) { setDtErr('日時として認識できません（例: 2024-03-24 10:23:45）'); setDtResult(null); return; }
    setDtErr('');
    setDtResult([
      { label: 'エポック秒',  value: String(Math.floor(d.getTime() / 1000)) },
      { label: 'エポックms',  value: String(d.getTime()) },
      { label: 'UTC',         value: d.toUTCString() },
      { label: 'ISO 8601',    value: d.toISOString() },
    ]);
  }, [dtIn]);

  const copyRow = (value: string) => Clipboard.copy(value).then(() => Toast.success('コピーしました'));

  const ResultGrid = ({ rows }: { rows: TsRow[] }) => (
    <div className={styles['ts-result-grid']}>
      {rows.map(({ label, value }) => (
        <div key={label} className={styles['ts-result-row']}>
          <span className={styles['ts-result-row__label']}>{label}</span>
          <span className={styles['ts-result-row__value']}>{value}</span>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => copyRow(value)}>コピー</button>
        </div>
      ))}
    </div>
  );

  return (
    <div className={styles['timestamp-section']}>
      <div className={styles['ts-now-card']}>
        <div className={styles['ts-now-title']}>
          <span>現在時刻</span>
          <Select
            className={styles['ts-tz-select']}
            options={TZ_OPTIONS.map((o): SelectOption => ({ value: o.tz, label: `${o.label} (${o.tz})` }))}
            value={selectedTz}
            onChange={changeTz}
            dropdownAlign="right"
          />
        </div>
        <div className={styles['ts-now-grid']}>
          {nowRows.map(({ label, value }) => (
            <div key={label} className={styles['ts-now-row']}>
              <span className={styles['ts-now-row__label']}>{label}</span>
              <span className={styles['ts-now-row__value']}>{value}</span>
              <button type="button" className={clsx('btn btn--ghost btn--sm', styles['ts-copy-btn'])}
                onClick={() => copyRow(value)}>コピー</button>
            </div>
          ))}
        </div>
      </div>

      <div className={styles['ts-convert-cards']}>
        <div className={styles['ts-convert-card']}>
          <div className={styles['ts-convert-title']}>エポック → 日時</div>
          <div className={styles['ts-convert-row']}>
            <input className={clsx(styles['ts-input'], styles['txt-input'])} type="text"
              placeholder="例: 1700000000" value={epochIn}
              onChange={(e) => setEpochIn(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') convertEpoch(); }} />
            <button type="button" className="btn btn--primary btn--sm" onClick={convertEpoch}>変換</button>
          </div>
          {epochErr && <div className={styles['ts-error']}>{epochErr}</div>}
          {epochResult && <ResultGrid rows={epochResult} />}
        </div>

        <div className={styles['ts-convert-card']}>
          <div className={styles['ts-convert-title']}>日時 → エポック</div>
          <div className={styles['ts-convert-row']}>
            <input className={clsx(styles['ts-input'], styles['txt-input'])} type="text"
              placeholder="例: 2024-03-24 10:23:45" value={dtIn}
              onChange={(e) => setDtIn(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') convertDatetime(); }} />
            <button type="button" className="btn btn--primary btn--sm" onClick={convertDatetime}>変換</button>
          </div>
          {dtErr && <div className={styles['ts-error']}>{dtErr}</div>}
          {dtResult && <ResultGrid rows={dtResult} />}
        </div>
      </div>
    </div>
  );
}

// ==================================================
// RegexSection — リデザイン
// ==================================================
type RegexFlags = { g: boolean; i: boolean; m: boolean; s: boolean; u: boolean };

const FLAG_DESCS: Record<keyof RegexFlags, string> = {
  g: 'グローバル — 全マッチを検索',
  i: '大小文字を区別しない',
  m: '^ $ が各行の先頭/末尾にマッチ',
  s: '. が改行にもマッチ',
  u: 'Unicode — サロゲートペアを正しく扱う',
};

function buildSnippets(pattern: string, flags: RegexFlags) {
  const f    = Object.entries(flags).filter(([, v]) => v).map(([k]) => k).join('');
  const e4j  = pattern.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const e4py = pattern.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const pyF: string[] = [];
  if (flags.i) pyF.push('re.IGNORECASE');
  if (flags.m) pyF.push('re.MULTILINE');
  if (flags.s) pyF.push('re.DOTALL');
  return [
    { lang: 'JavaScript', code: `/${pattern}/${f}` },
    { lang: 'Python',     code: `re.compile(r'${e4py}'${pyF.length ? ', ' + pyF.join(' | ') : ''})` },
    { lang: 'Java',       code: `Pattern.compile("${e4j}"${flags.i ? ', Pattern.CASE_INSENSITIVE' : ''})` },
  ];
}

interface RegexCheatsheetProps {
  flags: RegexFlags;
  onToggleFlag: (f: keyof RegexFlags) => void;
  onInsert: (sym: string) => void;
}
function RegexCheatsheet({ flags, onToggleFlag, onInsert }: RegexCheatsheetProps) {
  return (
    <div className={styles['regex-side-panel']}>
      <div className={styles['regex-side-title']}>チートシート</div>
      <div className={styles['regex-help-body']}>
        {REGEX_HELP.filter((s) => s.title !== 'フラグ').map((section) => (
          <div key={section.title} className={styles['rxh-section']}>
            <div className={styles['rxh-section__title']}>{section.title}</div>
            <div className={styles['rxh-rows']}>
              {section.items.map((item) => (
                <div key={item.sym} className={styles['rxh-row']}>
                  <code className={styles['rxh-sym']}>{item.sym}</code>
                  <span className={styles['rxh-desc']}>{item.desc}</span>
                  <button type="button" className={clsx('btn btn--ghost btn--sm', styles['rxh-copy-btn'])}
                    title="パターンに挿入" onClick={() => onInsert(item.sym)}>挿入</button>
                </div>
              ))}
            </div>
          </div>
        ))}
        {/* フラグ: クリックでトグル、● / ○ でアクティブ表示 */}
        <div className={styles['rxh-section']}>
          <div className={styles['rxh-section__title']}>フラグ</div>
          <div className={styles['rxh-rows']}>
            {(Object.keys(flags) as (keyof RegexFlags)[]).map((f) => (
              <div key={f}
                className={clsx(styles['rxh-row'], styles['rxh-row--flag'], flags[f] && styles['rxh-row--flag-active'])}
                role="button" onClick={() => onToggleFlag(f)}>
                <code className={styles['rxh-sym']}>{f}</code>
                <span className={styles['rxh-desc']}>{FLAG_DESCS[f]}</span>
                <span className={styles['rxh-flag-dot']}>{flags[f] ? '●' : '○'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function RegexSection() {
  const [pattern, setPattern]   = useState('');
  const [testStr, setTestStr]   = useState('');
  const [replaceStr, setReplace] = useState('');
  const [flags, setFlags]       = useState<RegexFlags>({ g: true, i: false, m: false, s: false, u: false });
  const [saveFormOpen, setSaveFormOpen] = useState(false);
  const [loadDropOpen, setLoadDropOpen] = useState(false);
  const [codeOpen,     setCodeOpen]     = useState(false);
  const [saveName, setSaveName]         = useState('');
  const [savedPatterns, setSavedPatterns] = useState<RegexPattern[]>([]);
  const [history, setHistory]     = useState<string[]>(() =>
    JSON.parse(localStorage.getItem('text_regex_history') || '[]')
  );
  const [extractMode, setExtractMode] = useState<'highlight' | 'extract'>('highlight');
  const [lineFilter, setLineFilter]   = useState<'all' | 'match' | 'nomatch'>('all');
  const patternRef   = useRef<HTMLInputElement>(null);
  const loadDropRef  = useRef<HTMLDivElement>(null);
  const codeDropRef  = useRef<HTMLDivElement>(null);

  useEffect(() => { textDB.getAllPatterns().then(setSavedPatterns); }, []);

  useEffect(() => {
    if (!loadDropOpen) return;
    const handler = (e: MouseEvent) => {
      if (!loadDropRef.current?.contains(e.target as Node)) setLoadDropOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [loadDropOpen]);

  useEffect(() => {
    if (!codeOpen) return;
    const handler = (e: MouseEvent) => {
      if (!codeDropRef.current?.contains(e.target as Node)) setCodeOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [codeOpen]);

  const toggleFlag = useCallback((f: keyof RegexFlags) =>
    setFlags((prev) => ({ ...prev, [f]: !prev[f] })), []);

  const insertSymbol = useCallback((sym: string) => {
    const el = patternRef.current;
    if (!el) { setPattern((p) => p + sym); return; }
    const start = el.selectionStart ?? el.value.length;
    const end   = el.selectionEnd   ?? el.value.length;
    const newVal = el.value.slice(0, start) + sym + el.value.slice(end);
    setPattern(newVal);
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = start + sym.length;
      el.focus();
    });
  }, []);

  const savePattern = useCallback(async () => {
    if (!saveName.trim()) { Toast.error('パターン名を入力してください'); return; }
    if (!pattern.trim())  { Toast.error('パターンを入力してください'); return; }
    const flagStr = Object.entries(flags).filter(([, v]) => v).map(([k]) => k).join('');
    await textDB.addPattern({ name: saveName.trim(), pattern, flags: flagStr, test_text: testStr, created_at: new Date().toISOString(), position: Date.now() });
    setSavedPatterns(await textDB.getAllPatterns());
    setSaveName('');
    setSaveFormOpen(false);
    Toast.success('パターンを保存しました');
  }, [saveName, pattern, flags, testStr]);

  const loadPattern = useCallback((p: RegexPattern) => {
    setPattern(p.pattern);
    setTestStr(p.test_text || '');
    const f = p.flags;
    setFlags({ g: f.includes('g'), i: f.includes('i'), m: f.includes('m'), s: f.includes('s'), u: f.includes('u') });
    setLoadDropOpen(false);
    Toast.success(`「${p.name}」を読み込みました`);
  }, []);

  const deletePattern = useCallback(async (id: number) => {
    await textDB.deletePattern(id);
    setSavedPatterns(await textDB.getAllPatterns());
    Toast.success('パターンを削除しました');
  }, []);

  const rx = useMemo((): RegExp | Error | null => {
    if (!pattern) return null;
    const f = Object.entries(flags).filter(([, v]) => v).map(([k]) => k).join('');
    try { return new RegExp(pattern, f); } catch (e) { return e as Error; }
  }, [pattern, flags]);

  // パターン入力からフォーカスが外れたとき、有効なパターンを履歴に追加
  const handlePatternBlur = useCallback(() => {
    if (!pattern.trim() || rx instanceof Error || rx === null) return;
    setHistory((prev) => {
      if (prev[0] === pattern) return prev;
      const next = [pattern, ...prev.filter((p) => p !== pattern)].slice(0, 10);
      localStorage.setItem('text_regex_history', JSON.stringify(next));
      return next;
    });
  }, [pattern, rx]);

  type MatchItem = { idx: number; value: string; pos: number; captures: (string | undefined)[]; namedGroups: Record<string, string> | null };

  const matchResult = useMemo(() => {
    const empty = { rxError: '', matchItems: [] as MatchItem[], matchCount: 0, displayHtml: '' };
    if (rx instanceof Error) return { ...empty, rxError: rx.message };
    if (!rx || !testStr) return empty;
    try {
      const gf = rx.flags.includes('g') ? rx.flags : rx.flags + 'g';
      const all = [...testStr.matchAll(new RegExp(rx.source, gf))];
      const matchCount = all.length;
      const matchItems: MatchItem[] = all.slice(0, 200).map((m, i) => ({
        idx: i, value: m[0], pos: m.index!,
        captures: m.length > 1 ? Array.from(m).slice(1) : [],
        namedGroups: m.groups ? { ...m.groups } : null,
      }));
      let last = 0; const parts: string[] = [];
      all.forEach((m, i) => {
        parts.push(escHtml(testStr.slice(last, m.index!)));
        parts.push(`<mark class="rx-mark rx-mark--${i % 6}">${escHtml(m[0])}</mark>`);
        last = m.index! + m[0].length;
      });
      parts.push(escHtml(testStr.slice(last)));
      return { rxError: '', matchItems, matchCount, displayHtml: parts.join('') };
    } catch (e) { return { ...empty, rxError: (e as Error).message }; }
  }, [rx, testStr]);

  const replaceResult = useMemo((): string | null => {
    if (!rx || rx instanceof Error || !testStr) return null;
    try { return testStr.replace(rx, replaceStr); } catch { return null; }
  }, [rx, testStr, replaceStr]);

  const filteredLines = useMemo(() => {
    if (lineFilter === 'all' || !rx || rx instanceof Error || !testStr) return null;
    const sr = new RegExp(rx.source, rx.flags.replace('g', ''));
    return testStr.split('\n').filter((l) => lineFilter === 'match' ? sr.test(l) : !sr.test(l));
  }, [testStr, lineFilter, rx]);

  const filteredHtml = useMemo(() => {
    if (!filteredLines?.length || !rx || rx instanceof Error) return '';
    const gf = rx.flags.includes('g') ? rx.flags : rx.flags + 'g';
    return filteredLines.map((line) => {
      let last = 0; const parts: string[] = [];
      [...line.matchAll(new RegExp(rx.source, gf))].forEach((m, i) => {
        parts.push(escHtml(line.slice(last, m.index!)));
        parts.push(`<mark class="rx-mark rx-mark--${i % 6}">${escHtml(m[0])}</mark>`);
        last = m.index! + m[0].length;
      });
      parts.push(escHtml(line.slice(last)));
      return parts.join('');
    }).join('\n');
  }, [filteredLines, rx]);

  const snippets = useMemo(
    () => (pattern && !matchResult.rxError ? buildSnippets(pattern, flags) : []),
    [pattern, flags, matchResult.rxError]
  );

  const { rxError, matchItems, matchCount, displayHtml } = matchResult;
  const totalLines = testStr.split('\n').length;

  return (
    <div className={styles['regex-section']}>
      {/* ── パターン入力行 ── */}
      <div className={styles['regex-pattern-row']}>
        <span className={styles['regex-delim']}>/</span>
        <input ref={patternRef} className={styles['regex-pattern-input']}
          type="text" placeholder="正規表現パターン"
          value={pattern} onChange={(e) => setPattern(e.target.value)}
          onBlur={handlePatternBlur} spellCheck={false} />
        <span className={styles['regex-delim']}>/</span>
        <div className={styles['regex-flags-inline']}>
          {(['g', 'i', 'm', 's', 'u'] as (keyof RegexFlags)[]).map((f) => (
            <button key={f} type="button"
              className={clsx(styles['regex-flag-btn'], flags[f] && styles['regex-flag-btn--active'])}
              onClick={() => toggleFlag(f)}>{f}
            </button>
          ))}
        </div>
        {/* 保存: インラインフォームをトグル */}
        <button type="button" className="btn btn--ghost btn--sm"
          onClick={() => setSaveFormOpen((v) => !v)}>保存</button>
        {/* 読込 ▾: 履歴・保存済みドロップダウン */}
        <div className={styles['regex-save-wrap']} ref={loadDropRef}>
          <button type="button" className="btn btn--ghost btn--sm"
            onClick={() => setLoadDropOpen((v) => !v)}>読込 ▾</button>
          {loadDropOpen && (
            <div className={styles['regex-save-dropdown']}>
              {history.length > 0 && (
                <div className={styles['regex-drop-section']}>
                  <div className={styles['regex-drop-title']}>履歴</div>
                  {history.map((p, i) => (
                    <div key={i} className={styles['regex-drop-item']}>
                      <code className={styles['regex-drop-item__pattern']}>{p}</code>
                      <button type="button" className="btn btn--ghost btn--sm"
                        onClick={() => { setPattern(p); setLoadDropOpen(false); }}>読込</button>
                    </div>
                  ))}
                </div>
              )}
              {savedPatterns.length > 0 && (
                <div className={styles['regex-drop-section']}>
                  <div className={styles['regex-drop-title']}>保存済み</div>
                  {savedPatterns.map((p) => (
                    <div key={p.id} className={styles['regex-drop-item']}>
                      <span className={styles['regex-drop-item__name']}>{p.name}</span>
                      <code className={styles['regex-drop-item__pattern']}>/{p.pattern}/{p.flags}</code>
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => loadPattern(p)}>読込</button>
                      <button type="button" className="btn btn--ghost btn--sm text-red-400 hover:text-red-300" onClick={() => deletePattern(p.id!)}>削除</button>
                    </div>
                  ))}
                </div>
              )}
              {history.length === 0 && savedPatterns.length === 0 && (
                <div className={styles['regex-drop-empty']}>保存済みパターンがありません</div>
              )}
            </div>
          )}
        </div>
        {/* コード ▾: JS/Python/Java スニペット */}
        <div className={styles['regex-save-wrap']} ref={codeDropRef}>
          <button type="button" className="btn btn--ghost btn--sm"
            disabled={!pattern || !!rxError}
            onClick={() => setCodeOpen((v) => !v)}>コード ▾</button>
          {codeOpen && snippets.length > 0 && (
            <div className={styles['regex-save-dropdown']}>
              {snippets.map(({ lang, code }) => (
                <div key={lang} className={styles['regex-drop-item']}>
                  <span className={styles['regex-drop-item__name']}>{lang}</span>
                  <code className={styles['regex-code-snippet']}>{code}</code>
                  <button type="button" className="btn btn--ghost btn--sm"
                    onClick={() => Clipboard.copy(code).then(() => Toast.success(`${lang} をコピーしました`))}>
                    コピー
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <button type="button" className="btn btn--ghost btn--sm"
          onClick={() => { setPattern(''); setTestStr(''); setReplace(''); }}>クリア</button>
      </div>

      {/* インライン保存フォーム */}
      {saveFormOpen && (
        <div className={styles['regex-save-inline']}>
          <input type="text" className={styles['regex-drop-name-input']}
            placeholder="パターン名を入力" value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') savePattern();
              if (e.key === 'Escape') { setSaveFormOpen(false); setSaveName(''); }
            }}
            autoFocus />
          <button type="button" className="btn btn--primary btn--sm" onClick={savePattern}>保存する</button>
          <button type="button" className="btn btn--ghost btn--sm"
            onClick={() => { setSaveFormOpen(false); setSaveName(''); }}>キャンセル</button>
        </div>
      )}

      <div className={styles['regex-layout']}>
        {/* ── メインエリア ── */}
        <div className={styles['regex-main']}>
          {rxError && <div className={styles['regex-error']}>{rxError}</div>}

          {/* テスト文字列 */}
          <div className={styles['regex-test-area']}>
            <div className={styles['regex-test-header']}>
              <span className={styles['regex-label']}>テスト文字列</span>
              <div className="seg-ctrl">
                {(['highlight', 'extract'] as const).map((m) => (
                  <button key={m} type="button"
                    className={clsx('seg-btn', 'seg-btn--sm', extractMode === m && 'seg-btn--active')}
                    onClick={() => setExtractMode(m)}>
                    {m === 'highlight' ? 'ハイライト' : '抽出'}
                  </button>
                ))}
              </div>
              {extractMode === 'highlight' && !rxError && testStr && (
                <div className="seg-ctrl">
                  {(['all', 'match', 'nomatch'] as const).map((m) => (
                    <button key={m} type="button"
                      className={clsx('seg-btn', 'seg-btn--sm', lineFilter === m && 'seg-btn--active')}
                      onClick={() => setLineFilter(m)}>
                      {m === 'all' ? '全行' : m === 'match' ? 'マッチ行' : '非マッチ行'}
                    </button>
                  ))}
                </div>
              )}
              {!rxError && testStr && pattern && (
                <span className={clsx(styles['regex-match-badge'], matchCount === 0 && styles['regex-match-badge--none'])}>
                  {matchCount > 0 ? `${matchCount} 件マッチ` : 'マッチなし'}
                </span>
              )}
            </div>

            {extractMode === 'highlight' ? (
              <>
                {!rxError && testStr && (lineFilter === 'all' ? displayHtml : filteredHtml) && (
                  <div className={styles['regex-display-wrap']}>
                    <pre className={styles['regex-display']}
                      dangerouslySetInnerHTML={{ __html: lineFilter === 'all' ? displayHtml : filteredHtml }} />
                    {lineFilter !== 'all' && filteredLines && (
                      <span className={styles['regex-filter-hint']}>{filteredLines.length} / {totalLines} 行</span>
                    )}
                  </div>
                )}
                {lineFilter !== 'all' && filteredLines?.length === 0 && (
                  <div className={styles['regex-filter-empty']}>
                    {lineFilter === 'match' ? 'マッチする行がありません' : 'すべての行がマッチしました'}
                  </div>
                )}
                <textarea className={styles['txt-textarea']} placeholder="テスト文字列を入力..."
                  value={testStr} onChange={(e) => setTestStr(e.target.value)} rows={5} spellCheck={false} />
              </>
            ) : (
              /* 抽出モード */
              <div className={styles['regex-extract-panel']}>
                <textarea className={styles['txt-textarea']} placeholder="テスト文字列を入力..."
                  value={testStr} onChange={(e) => setTestStr(e.target.value)} rows={4} spellCheck={false} />
                {matchItems.length > 0 ? (
                  <>
                    <div className={styles['regex-extract-header']}>
                      <span className={styles['regex-label']}>
                        {matchItems.length} 件{matchCount > 200 ? '（上位 200 件）' : ''}
                      </span>
                      <button type="button" className="btn btn--ghost btn--sm"
                        onClick={() => Clipboard.copy(matchItems.map((m) => m.value).join('\n')).then(() => Toast.success('全件コピーしました'))}>
                        全件コピー
                      </button>
                    </div>
                    <div className={styles['regex-extract-list']}>
                      {matchItems.map((m) => (
                        <div key={m.idx} className={clsx(styles['regex-extract-item'], styles[`regex-extract-item--c${m.idx % 6}` as keyof typeof styles])}>
                          <span className={styles['regex-extract-item__idx']}>{m.idx + 1}</span>
                          <div className={styles['regex-extract-item__body']}>
                            <code className={styles['regex-extract-item__val']}>{m.value || <em>空文字</em>}</code>
                            <span className={styles['regex-extract-item__meta']}>位置 {m.pos}</span>
                            {m.captures.length > 0 && (
                              <span className={styles['regex-extract-item__caps']}>
                                {m.captures.map((c, i) => (
                                  <span key={i} className={styles['regex-extract-item__cap']}>
                                    ${i + 1}: <code>{c ?? <em>undefined</em>}</code>
                                  </span>
                                ))}
                              </span>
                            )}
                            {m.namedGroups && Object.entries(m.namedGroups).map(([name, val]) => (
                              <span key={name} className={clsx(styles['regex-extract-item__caps'], styles['regex-extract-item__caps--named'])}>
                                <span className={styles['regex-extract-item__cap']}>
                                  {name}: <code>{val}</code>
                                </span>
                              </span>
                            ))}
                          </div>
                          <button type="button" className="btn btn--ghost btn--sm"
                            onClick={() => Clipboard.copy(m.value).then(() => Toast.success('コピーしました'))}>
                            コピー
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                ) : testStr && pattern ? (
                  <div className={styles['regex-extract-empty']}>マッチなし</div>
                ) : null}
              </div>
            )}
          </div>

          {/* 置換: 入力のみ */}
          <div className={styles['regex-replace-area']}>
            <label className={styles['regex-label']}>
              置換文字列 <span className={styles['regex-label-hint']}>($1, $2 で参照)</span>
            </label>
            <input className={styles['txt-input']} type="text"
              placeholder="空欄 = マッチ部分を削除"
              value={replaceStr} onChange={(e) => setReplace(e.target.value)} />
          </div>

          {/* 置換結果: 残り高さを埋める出力エリア */}
          <div className={styles['regex-output-area']}>
            {replaceResult !== null ? (
              <>
                <div className={styles['regex-output-header']}>
                  <span className={styles['regex-label']}>置換結果</span>
                  <button type="button" className="btn btn--ghost btn--sm"
                    onClick={() => Clipboard.copy(replaceResult!).then(() => Toast.success('コピーしました'))}>
                    コピー
                  </button>
                </div>
                <pre className={styles['regex-output-pre']}>{replaceResult}</pre>
              </>
            ) : (
              <div className={styles['regex-output-empty']}>
                {rxError ? 'パターンエラーのため置換できません' : '置換文字列を入力すると結果がここに表示されます'}
              </div>
            )}
          </div>

        </div>

        {/* ── チートシート（常時表示） ── */}
        <RegexCheatsheet
          flags={flags}
          onToggleFlag={toggleFlag}
          onInsert={insertSymbol}
        />
      </div>
    </div>
  );
}

// ==================================================
// TsvSection — 検索・ソート・セル編集・エクスポート全種
// ==================================================
function TsvSection() {
  const [input, setInput]     = useState('');
  const [delim, setDelim]     = useState<'tab' | 'comma' | 'pipe'>(() => (localStorage.getItem('text_tsv_delimiter') as 'tab' | 'comma' | 'pipe') || 'tab');
  const [quote, setQuote]     = useState<'none' | 'dquote' | 'squote'>(() => (localStorage.getItem('text_tsv_quote') as 'none' | 'dquote' | 'squote') || 'dquote');
  const [hasHeader, setHasHeader] = useState(() => localStorage.getItem('text_tsv_header') !== 'false');
  const [data, setData]       = useState<string[][]>([]);
  const [search, setSearch]   = useState('');
  const [sortCol, setSortCol] = useState(-1);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [cellEdit, setCellEdit] = useState<{ row: number; col: number } | null>(null);
  const [cellValue, setCellValue] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const cellInputRef = useRef<HTMLInputElement>(null);
  const dragCount    = useRef(0);

  const DC = { tab: '\t', comma: ',', pipe: '|' } as const;
  const QC = { none: '', dquote: '"', squote: "'" } as const;

  useEffect(() => {
    if (input) { setData(parseCSV(input, DC[delim], QC[quote])); setSortCol(-1); setSortDir('asc'); }
    else setData([]);
  }, [input, delim, quote]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { localStorage.setItem('text_tsv_delimiter', delim); }, [delim]);
  useEffect(() => { localStorage.setItem('text_tsv_quote', quote); }, [quote]);
  useEffect(() => { localStorage.setItem('text_tsv_header', String(hasHeader)); }, [hasHeader]);

  useEffect(() => { if (cellEdit && cellInputRef.current) { cellInputRef.current.focus(); cellInputRef.current.select(); } }, [cellEdit]);

  const headers  = hasHeader && data.length > 0 ? data[0] : null;
  const bodyRows = hasHeader && data.length > 0 ? data.slice(1) : data;
  const maxCols  = data.length > 0 ? Math.max(...data.map((r) => r.length)) : 0;

  const q = search.trim().toLowerCase();
  let displayRows = bodyRows.map((cells, i) => ({ idx: hasHeader ? i + 1 : i, cells }));
  if (q) displayRows = displayRows.filter((r) => r.cells.some((c) => c.toLowerCase().includes(q)));
  if (sortCol >= 0) {
    displayRows = [...displayRows].sort((a, b) => {
      const va = (a.cells[sortCol] || '').toLowerCase();
      const vb = (b.cells[sortCol] || '').toLowerCase();
      const na = parseFloat(va); const nb = parseFloat(vb);
      const cmp = !isNaN(na) && !isNaN(nb) && String(na) === va && String(nb) === vb
        ? na - nb : va.localeCompare(vb, 'ja');
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }

  const updateCell = useCallback((rowIdx: number, colIdx: number, val: string) => {
    setData((prev) => {
      const next = prev.map((r) => [...r]);
      while (next[rowIdx].length <= colIdx) next[rowIdx].push('');
      next[rowIdx][colIdx] = val;
      return next;
    });
  }, []);

  const commitEdit = useCallback(() => {
    if (!cellEdit) return;
    updateCell(cellEdit.row, cellEdit.col, cellValue);
    setCellEdit(null);
  }, [cellEdit, cellValue, updateCell]);

  const addRow = () => setData((prev) => [...prev, Array(Math.max(maxCols, 1)).fill('')]);
  const deleteRow = (rowIdx: number) => setData((prev) => prev.filter((_, i) => i !== rowIdx));

  const handleSortClick = (col: number) => {
    if (sortCol === col) {
      if (sortDir === 'asc') setSortDir('desc');
      else { setSortCol(-1); setSortDir('asc'); }
    } else { setSortCol(col); setSortDir('asc'); }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDragEnter = useCallback(() => {
    dragCount.current++;
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    dragCount.current = Math.max(0, dragCount.current - 1);
    if (dragCount.current === 0) setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCount.current = 0;
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      Toast.error('ファイルが大きすぎます（上限 5MB）');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setInput(reader.result);
    };
    reader.readAsText(file);
  }, []);

  const buildExport = (dc: string, qc: string) =>
    data.map((row) =>
      row.map((cell) => {
        if (qc && (cell.includes(dc) || cell.includes(qc) || cell.includes('\n')))
          return `${qc}${cell.split(qc).join(qc + qc)}${qc}`;
        return cell;
      }).join(dc)
    ).join('\n');

  const buildMarkdown = () => {
    if (!data.length) return '';
    const mc = Math.max(...data.map((r) => r.length));
    const widths = Array(mc).fill(3);
    data.forEach((row) => { for (let c = 0; c < mc; c++) widths[c] = Math.max(widths[c], (row[c] || '').length); });
    const lines: string[] = [];
    data.forEach((row, ri) => {
      const cells = Array.from({ length: mc }, (_, c) => (row[c] || '').padEnd(widths[c]));
      lines.push('| ' + cells.join(' | ') + ' |');
      if (ri === 0 && hasHeader) lines.push('| ' + widths.map((w) => '-'.repeat(w)).join(' | ') + ' |');
    });
    return lines.join('\n');
  };

  const copy = (text: string, msg: string) => Clipboard.copy(text).then(() => Toast.success(msg));

  return (
    <div className={styles['tsv-section']}>
      {/* オプションバー */}
      <div className={styles['tsv-options']}>
        <div className="seg-ctrl">
          {(['tab', 'comma', 'pipe'] as const).map((d) => (
            <button key={d} type="button"
              className={clsx('seg-btn', delim === d && 'seg-btn--active')}
              onClick={() => setDelim(d)}>
              {d === 'tab' ? 'タブ' : d === 'comma' ? 'カンマ' : 'パイプ (|)'}
            </button>
          ))}
        </div>
        <div className="seg-ctrl">
          {(['none', 'dquote', 'squote'] as const).map((q) => (
            <button key={q} type="button"
              className={clsx('seg-btn', quote === q && 'seg-btn--active')}
              onClick={() => setQuote(q)}>
              {q === 'none' ? '囲みなし' : q === 'dquote' ? '"（ダブル）' : "'（シングル）"}
            </button>
          ))}
        </div>
        <label className="toggle-wrap">
          <input type="checkbox" className="toggle-input" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} />
          <span className="toggle-track"><span className="toggle-thumb" /></span>
          <span className="toggle-label">1行目をヘッダーとして扱う</span>
        </label>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setInput(''); setData([]); setSearch(''); setSortCol(-1); }}>クリア</button>
      </div>

      {/* 入力 */}
      <div className={styles['tsv-drop-wrap']}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}>
        <textarea className={styles['txt-textarea']}
          placeholder="TSV / CSV データを貼り付け..."
          value={input} onChange={(e) => setInput(e.target.value)} rows={6} spellCheck={false} />
        {isDragOver && (
          <div className={styles['tsv-drop-overlay']}>
            <span>ファイルをドロップ</span>
            <span className={styles['tsv-drop-hint']}>TSV / CSV / テキストファイル</span>
          </div>
        )}
      </div>

      {/* テーブル */}
      {data.length > 0 && (
        <>
          {/* 検索バー */}
          <div className={styles['tsv-search-bar']}>
            <div className={styles['tsv-search-wrap']}>
              <input type="search" className={styles['tsv-search-input']}
                placeholder="テーブルを検索..."
                value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <span className={styles['tsv-search-hint']}>
              {q ? `${displayRows.length} / ${bodyRows.length} 行` : `${bodyRows.length} 行`} × {maxCols} 列
            </span>
          </div>

          <div className={styles['tsv-table-wrap']}>
            <table className={styles['tsv-table']}>
              {headers && (
                <thead>
                  <tr>
                    {Array.from({ length: maxCols }, (_, c) => {
                      const isSorted = sortCol === c;
                      return (
                        <th key={c}
                          className={clsx(styles['tsv-th'], isSorted && styles['tsv-th--sorted'])}
                          data-sort={isSorted ? sortDir : undefined}
                          onClick={() => handleSortClick(c)}>
                          {headers[c] || ''}
                        </th>
                      );
                    })}
                    <th className={styles['tsv-table__del-col']} />
                  </tr>
                </thead>
              )}
              <tbody>
                {displayRows.map(({ idx: rowIdx, cells }) => (
                  <tr key={rowIdx}>
                    {Array.from({ length: maxCols }, (_, colIdx) => {
                      const cell = cells[colIdx] ?? '';
                      const isEditing = cellEdit?.row === rowIdx && cellEdit?.col === colIdx;
                      return (
                        <td key={colIdx}
                          className={clsx(q && cell.toLowerCase().includes(q) && styles['tsv-cell--match'], styles['tsv-editable-cell'])}
                          onDoubleClick={() => { setCellEdit({ row: rowIdx, col: colIdx }); setCellValue(cell); }}>
                          {isEditing
                            ? <input ref={cellInputRef} type="text" className={styles['tsv-cell-input']}
                                value={cellValue}
                                onChange={(e) => setCellValue(e.target.value)}
                                onBlur={commitEdit}
                                onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setCellEdit(null); }} />
                            : cell}
                        </td>
                      );
                    })}
                    <td className={styles['tsv-table__del-col']}>
                      <button className={styles['tsv-del-row-btn']} onClick={() => deleteRow(rowIdx)} title="行を削除">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 行操作・エクスポートバー */}
          <div className={styles['tsv-export-bar']}>
            <button type="button" className="btn btn--ghost btn--sm" onClick={addRow}>+ 行を追加</button>
            <span style={{ flex: 1 }} />
            <button type="button" className="btn btn--ghost btn--sm"
              onClick={() => copy(buildExport('\t', QC[quote]), 'TSVをコピーしました')}>TSVコピー</button>
            <button type="button" className="btn btn--ghost btn--sm"
              onClick={() => copy(buildExport(',', QC[quote]), 'CSVをコピーしました')}>CSVコピー</button>
            <button type="button" className="btn btn--ghost btn--sm"
              onClick={() => copy(buildMarkdown(), 'Markdownをコピーしました')}>Markdownコピー</button>
          </div>
        </>
      )}
    </div>
  );
}

// ==================================================
// TextPage 本体 — display:none で状態保持
// ==================================================
const SHORTCUTS = [{
  name: 'テキスト処理',
  shortcuts: [
    { keys: ['Ctrl', 'Enter'],         description: '整形実行（フォーマッタ）' },
    { keys: ['Ctrl', 'Shift', 'C'],    description: 'アクティブツールの結果をコピー' },
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

  const { config, setActiveTab: setGlobalTab } = useTabStore();
  useEffect(() => {
    const label = config.find(t => t.pageSrc === 'pages/text.html')?.label;
    searchRegistry.register('text-nav', async (query) => {
      const q = query.toLowerCase();
      return TAB_LABELS
        .filter(({ label: l }) => l.toLowerCase().includes(q))
        .map(({ id, label: l }) => ({
          id: `text-nav-${id}`,
          pageSrc: 'pages/text.html',
          title: l,
          excerpt: '',
          onSelect: () => { if (label) setGlobalTab(label); switchSection(id); },
        }));
    });
    return () => searchRegistry.unregister('text-nav');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, setGlobalTab]);

  return (
    <div className={styles['text-page']}>
      <ShortcutHelp categories={SHORTCUTS} />
      <nav className={styles['txt-tabs']} role="tablist" aria-label="テキスト処理ツール">
        {TAB_LABELS.map(({ id, label }) => (
          <button key={id} type="button" role="tab"
            className={clsx(styles['txt-tab'], section === id && styles['txt-tab--active'])}
            aria-selected={section === id}
            onClick={() => switchSection(id)}>
            {label}
          </button>
        ))}
      </nav>
      <div className={styles['txt-body']} data-activesec={section}>
        <div style={{ display: section === 'regex' ? undefined : 'none', height: '100%' }}><RegexSection /></div>
        <div style={{ display: section === 'encode'    ? undefined : 'none' }}><EncodeSection /></div>
        <div style={{ display: section === 'case'      ? undefined : 'none' }}><CaseSection /></div>
        <div style={{ display: section === 'count'     ? undefined : 'none' }}><CountSection /></div>
        <div style={{ display: section === 'format'    ? undefined : 'none' }}><FormatSection /></div>
        <div style={{ display: section === 'timestamp' ? undefined : 'none' }}><TimestampSection active={section === 'timestamp'} /></div>
        <div style={{ display: section === 'tsv'       ? undefined : 'none' }}><TsvSection /></div>
      </div>
    </div>
  );
}
