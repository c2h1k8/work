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
  _textDb: null,
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
