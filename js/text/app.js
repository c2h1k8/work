'use strict';

// ==================================================
// テキスト処理ツール — 初期化・イベント登録
// ==================================================
// DOMContentLoaded でイベントリスナー登録、
// テーマ変更メッセージの受信
// ==================================================

/** アクティブツールの結果をコピーする */
function _copyActiveResult() {
  let text = '';
  switch (State.activeSection) {
    case 'format': {
      text = document.getElementById('fmt-code')?.textContent || '';
      break;
    }
    case 'regex': {
      text = document.getElementById('regex-replace-result')?.textContent || '';
      break;
    }
    default:
      showError('このツールではコピー対象がありません');
      return;
  }
  if (!text) { showError('コピーする結果がありません'); return; }
  navigator.clipboard.writeText(text).then(() => showSuccess('コピーしました'));
}

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
    navigator.clipboard.writeText(btn.dataset.value).then(() => showSuccess('コピーしました'));
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
    navigator.clipboard.writeText(btn.dataset.value).then(() => showSuccess('コピーしました'));
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
    navigator.clipboard.writeText(val).then(() => showSuccess('コピーしました'));
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
    navigator.clipboard.writeText(btn.dataset.value).then(() => showSuccess('コピーしました'));
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
    navigator.clipboard.writeText(out).then(() => showSuccess('TSVをコピーしました'));
  });
  document.getElementById('tsv-export-csv').addEventListener('click', () => {
    const out = _exportCsv();
    navigator.clipboard.writeText(out).then(() => showSuccess('CSVをコピーしました'));
  });
  document.getElementById('tsv-export-md').addEventListener('click', () => {
    const out = _exportMarkdown();
    navigator.clipboard.writeText(out).then(() => showSuccess('Markdownテーブルをコピーしました'));
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
    navigator.clipboard.writeText(text).then(() => showSuccess('コピーしました'));
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

  // ━━━ ツールチップ初期化 ━━━
  Tooltip.init(document.body);

  // ━━━ キーボードショートカット ━━━
  document.addEventListener('keydown', e => {
    // Ctrl+Shift+C: アクティブツールの結果をコピー
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
      e.preventDefault();
      _copyActiveResult();
      return;
    }
  });

  // ━━━ ショートカットキー一覧登録 ━━━
  ShortcutHelp.register([
    { name: 'ショートカット', shortcuts: [
      { keys: ['Ctrl', 'Enter'], description: '整形実行（フォーマッタ）' },
      { keys: ['Ctrl', 'Shift', 'C'], description: 'アクティブツールの結果をコピー' },
      { keys: ['?'], description: 'ショートカット一覧' },
    ]}
  ]);
}

document.addEventListener('DOMContentLoaded', init);

// テーマ変更を受け取る（iframe 内での親フレームからのメッセージ）
window.addEventListener('message', e => {
  if (e.data?.type === 'theme-change') {
    document.documentElement.setAttribute('data-theme', e.data.theme);
  }
});
