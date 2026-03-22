'use strict';

// ==================================================
// 運用ツール — 状態管理・タブ切替
// ==================================================
// State オブジェクト、showToast ラッパー、
// セクション切替関数
// ==================================================

const showToast = (msg, type) => Toast.show(msg, type);

const State = {
  activeSection: 'log-viewer',

  // ログビューア
  logLines: [],
  filters: {
    levels: { ERROR: true, WARN: true, INFO: true, DEBUG: true, OTHER: true },
    startTime: null,
    endTime:   null,
    text:      '',
  },

  // cron式エディタ
  cronTz: 'UTC', // 'UTC' | 'JST'

  // ポート番号
  portsFilter:    'all',   // 'all' | 'builtin' | 'custom'
  portsSearch:    '',
  customPorts:    [],      // IndexedDB から読み込んだカスタムポート
  portsEditingId: null,    // 編集中のカスタムポート ID

  // HTTP ステータス
  httpSearch:    '',
  httpStarOnly:  false,
  httpOpenCats:  new Set(['1xx','2xx','3xx','4xx','5xx']), // デフォルト全展開

};

function switchSection(tool) {
  State.activeSection = tool;

  // タブの active を切り替え
  document.querySelectorAll('.ops-tab').forEach(btn => {
    btn.classList.toggle('ops-tab--active', btn.dataset.tool === tool);
  });

  // ツールパネルの表示切り替え
  document.querySelectorAll('.ops-tool').forEach(el => {
    el.hidden = el.id !== `tool-${tool}`;
  });

  // 初回表示時の遅延初期化
  if (tool === 'http-status' && !State._httpInitialized) {
    renderHttpAccordion();
    State._httpInitialized = true;
  }
  if (tool === 'ports' && !State._portsInitialized) {
    loadAndRenderPorts();
    State._portsInitialized = true;
  }
  if (tool === 'cron' && !State._cronInitialized) {
    initCronBuilder();
    updateCron();
    State._cronInitialized = true;
  }
}
