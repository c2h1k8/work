'use strict';

// ==================================================
// テキスト処理ツール — 状態管理・タブ切替
// ==================================================

const showToast = (msg, type) => Toast.show(msg, type);
const showSuccess = (msg) => Toast.success(msg);
const showError = (msg) => Toast.error(msg);

// ==================================================
// 状態管理
// ==================================================

/** TSV 区切り文字のキーマップ */
const _DELIM_KEY_MAP = { '\t': 'tab', ',': 'comma', '|': 'pipe' };
const _DELIM_VAL_MAP = { tab: '\t', comma: ',', pipe: '|' };

/** 囲み文字のキーマップ */
const _QUOTE_KEY_MAP = { '"': 'dquote', "'": 'squote', '': 'none' };
const _QUOTE_VAL_MAP = { dquote: '"', squote: "'", none: '' };

const State = {
  activeSection: loadFromStorage('text_active_section') || 'encode',
  encodeDir: loadFromStorage('text_encode_dir') || 'encode', // 'encode' | 'decode'
  regexFlags: { g: true, i: false, m: false, s: false, u: false },
  tsv: {
    delimiter: _DELIM_VAL_MAP[loadFromStorage('text_tsv_delimiter')] || '\t', // 現在の区切り文字
    // 囲み文字: '' はクォートなし。null → undefined → ?? で '"' にフォールバック
    quoteChar: _QUOTE_VAL_MAP[loadFromStorage('text_tsv_quote_char')] ?? '"',
    hasHeader: loadFromStorage('text_tsv_has_header') !== 'false',
    data: [],        // string[][] - テーブルデータ
    searchQuery: '', // 検索クエリ
    sortCol: -1,     // ソート列インデックス (-1 = 未ソート)
    sortDir: 'asc',  // 'asc' | 'desc'
  },
  _timestampTimer: null,
  _textDb: null,
  regexPatterns: [],  // 保存済みパターンキャッシュ
};

// ==================================================
// タブ切替
// ==================================================

function switchSection(tool) {
  State.activeSection = tool;
  saveToStorage('text_active_section', tool);
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
