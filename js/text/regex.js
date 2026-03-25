'use strict';

// ==================================================
// テキスト処理ツール — 正規表現テスター
// ==================================================
// チートシート描画、パターン構築、マッチ・置換処理、
// パターン保存/読み込み/削除（IndexedDB: TextDB）
// ==================================================

// ── チートシート描画 ────────────────────────────────

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

// ── パターン構築・マッチ処理 ────────────────────────

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

// ── パターン保存/読み込み/削除（IndexedDB） ────────

async function _initTextDb() {
  if (!State._textDb) {
    State._textDb = new TextDB();
  }
  await State._textDb.open();
}

async function loadRegexPatterns() {
  try {
    await _initTextDb();
    State.regexPatterns = await State._textDb.getAllPatterns();
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
  if (!pattern) { showError('パターンを入力してください'); return; }

  const name = prompt('パターン名を入力してください:');
  if (!name || !name.trim()) return;

  try {
    await _initTextDb();
    const flags = Object.entries(State.regexFlags).filter(([,v]) => v).map(([k]) => k).join('');
    const testText = document.getElementById('regex-test').value;
    await State._textDb.addPattern({
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
    showError('保存に失敗しました');
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
    await _initTextDb();
    await State._textDb.deletePattern(id);
    await loadRegexPatterns();
    showToast('パターンを削除しました');
  } catch (e) {
    showError('削除に失敗しました');
  }
}
