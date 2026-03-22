'use strict';

// ==================================================
// テキスト処理ツール — 定数定義
// ==================================================
// エンコード関数・形式定義、ケース変換、正規表現チートシート、
// 文字カウント統計定義、全角判定正規表現 など
// ==================================================

// ── エンコード/デコード関数 ──────────────────────────
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

// ── ケース変換形式 ──────────────────────────────────
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

// ── 正規表現チートシート ────────────────────────────
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

// ── 文字カウント統計定義 ────────────────────────────
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

// 全角文字の判定正規表現（半角カナ \uFF61-\uFF9F は半角扱い）
const FULL_WIDTH_RE = /[^\x00-\x7F\uFF61-\uFF9F]/g;

// マッチハイライトの色数
const MARK_COUNT = 6;
