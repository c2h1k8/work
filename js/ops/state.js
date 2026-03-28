'use strict';

// ==================================================
// 運用ツール — 状態管理・タブ切替
// ==================================================
// State オブジェクト、showToast ラッパー、
// セクション切替関数
// ==================================================

const showToast = (msg, type) => Toast.show(msg, type);
const showSuccess = (msg) => Toast.success(msg);
const showError = (msg) => Toast.error(msg);

const State = {
  activeSection: loadFromStorage('ops_active_section') || 'log-viewer',

  // ログビューア
  logLines: [],
  filteredLines: [],  // フィルタ済み行（仮想スクロール用）
  _vsStart: -1,       // 仮想スクロール描画開始インデックス
  _vsEnd: -1,         // 仮想スクロール描画終了インデックス
  filters: {
    levels: { ERROR: true, WARN: true, INFO: true, DEBUG: true, OTHER: true },
    startTime: null,
    endTime:   null,
    text:      '',
  },

  // cron式エディタ
  cronTz: loadFromStorage('ops_cron_tz') || 'UTC', // 'UTC' | 'JST'

  // ポート番号
  portsFilter:    loadFromStorage('ops_ports_filter') || 'all',   // 'all' | 'builtin' | 'custom'
  portsSearch:    '',
  customPorts:    [],      // IndexedDB から読み込んだカスタムポート
  portsEditingId: null,    // 編集中のカスタムポート ID

  // HTTP ステータス
  httpSearch:    '',
  httpStarOnly:  loadFromStorage('ops_http_star_only') === 'true',
  httpOpenCats:  _loadHttpOpenCats(), // localStorage から復元

};

/** HTTP アコーディオン開閉状態を localStorage から復元 */
function _loadHttpOpenCats() {
  const saved = loadJsonFromStorage('ops_http_open_cats');
  return saved ? new Set(saved) : new Set(['1xx','2xx','3xx','4xx','5xx']);
}

/** HTTP アコーディオン開閉状態を localStorage に保存 */
function _saveHttpOpenCats() {
  localStorage.setItem('ops_http_open_cats', JSON.stringify([...State.httpOpenCats]));
}

function switchSection(tool) {
  State.activeSection = tool;
  saveToStorage('ops_active_section', tool);

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
