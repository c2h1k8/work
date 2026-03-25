// ==================================================
// 差分比較ツール メインスクリプト
// ==================================================

const showToast = (msg, type) => Toast.show(msg, type);
const showSuccess = (msg) => Toast.success(msg);
const showError = (msg) => Toast.error(msg);

// ローカルストレージキー
const DIFF_IGNORE_WS_KEY    = 'diff_ignore_whitespace';
const DIFF_IGNORE_BLANK_KEY = 'diff_ignore_blank_lines';
const DIFF_IGNORE_TABS_KEY  = 'diff_ignore_tabs';
const DIFF_MODE_KEY          = 'diff_mode';
const DIFF_REALTIME_KEY      = 'diff_realtime';

// 状態
const State = {
  mode: loadFromStorage(DIFF_MODE_KEY) || 'line',        // 'line' | 'char'
  ignoreWhitespace: loadFromStorage(DIFF_IGNORE_WS_KEY) === 'true',
  ignoreBlankLines: loadFromStorage(DIFF_IGNORE_BLANK_KEY) === 'true',
  ignoreTabs: loadFromStorage(DIFF_IGNORE_TABS_KEY) === 'true',
  realtime: loadFromStorage(DIFF_REALTIME_KEY) === 'true',
  realtimeTimer: null,
};

// ==================================================
// Myers diff アルゴリズム
// ==================================================

/**
 * Myers diff アルゴリズムでaとbの差分を計算する
 * @param {string[]} a - 変更前の配列
 * @param {string[]} b - 変更後の配列
 * @returns {{type:'equal'|'add'|'remove', value:string}[]}
 */
function myersDiff(a, b) {
  const N = a.length;
  const M = b.length;

  if (N === 0 && M === 0) return [];
  if (N === 0) return b.map(v => ({ type: 'add', value: v }));
  if (M === 0) return a.map(v => ({ type: 'remove', value: v }));

  const max = N + M;
  const offset = max;
  // v[k+offset] = 対角線k上で到達できる最も遠いx座標
  const v = new Array(2 * max + 1).fill(0);
  const trace = [];

  outer:
  for (let d = 0; d <= max; d++) {
    for (let k = -d; k <= d; k += 2) {
      let x;
      // k+1方向（下：挿入）かk-1方向（右：削除）から来るか選択
      if (k === -d || (k !== d && v[k - 1 + offset] < v[k + 1 + offset])) {
        x = v[k + 1 + offset]; // 下（挿入）
      } else {
        x = v[k - 1 + offset] + 1; // 右（削除）
      }
      let y = x - k;
      // 対角線（一致）をたどる
      while (x < N && y < M && a[x] === b[y]) { x++; y++; }
      v[k + offset] = x;
      if (x >= N && y >= M) {
        trace.push(v.slice());
        break outer;
      }
    }
    trace.push(v.slice());
  }

  // バックトラックでdiff結果を構築
  return _backtrack(trace, a, b, offset, N, M);
}

/**
 * Myers diffのバックトラック処理
 */
function _backtrack(trace, a, b, offset, N, M) {
  const result = [];
  let x = N, y = M;

  for (let d = trace.length - 1; d >= 1; d--) {
    const vPrev = trace[d - 1];
    const k = x - y;

    let prevK;
    if (k === -d || (k !== d && (vPrev[k - 1 + offset] || 0) < (vPrev[k + 1 + offset] || 0))) {
      prevK = k + 1; // k+1から来た（挿入）
    } else {
      prevK = k - 1; // k-1から来た（削除）
    }

    const prevX = vPrev[prevK + offset] || 0;
    const prevY = prevX - prevK;

    // 対角線（一致）の逆順処理
    while (x > prevX && y > prevY) {
      x--; y--;
      result.unshift({ type: 'equal', value: a[x] });
    }

    // 非対角線の1手
    if (prevK === k + 1) {
      // 挿入（b側の要素を追加）
      y--;
      result.unshift({ type: 'add', value: b[y] });
    } else {
      // 削除（a側の要素を削除）
      x--;
      result.unshift({ type: 'remove', value: a[x] });
    }
  }

  // d=0時の残り対角線
  while (x > 0 && y > 0) {
    x--; y--;
    result.unshift({ type: 'equal', value: a[x] });
  }

  return result;
}

/**
 * 文字単位のdiff（行内差分用）
 * @param {string} a - 変更前の文字列
 * @param {string} b - 変更後の文字列
 * @returns {{type:'equal'|'add'|'remove', value:string}[]}
 */
function charDiff(a, b) {
  // 短い文字列のみ対象（パフォーマンス対策）
  if (a.length + b.length > 2000) return null;
  return myersDiff(a.split(''), b.split(''));
}

// ==================================================
// diff 実行
// ==================================================

/**
 * 差分を計算してレンダリングする
 */
function compare() {
  const left  = document.getElementById('input-left').value;
  const right = document.getElementById('input-right').value;

  if (!left && !right) {
    showDiffEmpty();
    return;
  }

  const ignoreWS    = State.ignoreWhitespace;
  const ignoreBlank = State.ignoreBlankLines;
  const ignoreTabs  = State.ignoreTabs;
  const mode        = State.mode;

  // 行に分割
  let leftLines  = left.split('\n');
  let rightLines = right.split('\n');

  // 空行無視: 空行を除外（元のインデックスを保持）
  let leftFiltered  = leftLines.map((line, i) => ({ line, idx: i }));
  let rightFiltered = rightLines.map((line, i) => ({ line, idx: i }));
  if (ignoreBlank) {
    leftFiltered  = leftFiltered.filter(item => item.line.trim() !== '');
    rightFiltered = rightFiltered.filter(item => item.line.trim() !== '');
  }

  // 正規化関数
  const normalize = s => {
    let r = s;
    if (ignoreTabs) r = r.replace(/\t/g, '');
    if (ignoreWS) r = r.replace(/\s+/g, ' ').trim();
    return r;
  };
  const normLeft  = leftFiltered.map(item => normalize(item.line));
  const normRight = rightFiltered.map(item => normalize(item.line));

  // diff 計算
  const rawDiff = myersDiff(normLeft, normRight);

  // インデックスマッピング（正規化前の元の行を表示用に使う）
  let lIdx = 0, rIdx = 0;
  const diff = rawDiff.map(item => {
    if (item.type === 'equal')  { return { type: 'equal',  left: leftFiltered[lIdx++].line, right: rightFiltered[rIdx++].line }; }
    if (item.type === 'remove') { return { type: 'remove', left: leftFiltered[lIdx++].line, right: null }; }
    if (item.type === 'add')    { return { type: 'add',    left: null, right: rightFiltered[rIdx++].line }; }
    return item;
  });

  renderDiff(diff, mode, leftLines, rightLines);
}

// ==================================================
// レンダリング
// ==================================================

/** diff結果の空状態を表示 */
function showDiffEmpty() {
  document.getElementById('diff-empty').hidden   = false;
  document.getElementById('diff-content').hidden = true;
  document.getElementById('diff-content').innerHTML = '';
}

/**
 * diff 結果を描画する
 * @param {{type:string, left:string|null, right:string|null}[]} diff
 * @param {string} mode - 'line' | 'char'
 * @param {string[]} leftLines
 * @param {string[]} rightLines
 */
function renderDiff(diff, mode, leftLines, rightLines) {
  const container = document.getElementById('diff-content');
  document.getElementById('diff-empty').hidden = true;
  container.hidden = false;

  // 統計を計算
  let addCount = 0, removeCount = 0, equalCount = 0;
  diff.forEach(item => {
    if (item.type === 'add')    addCount++;
    else if (item.type === 'remove') removeCount++;
    else equalCount++;
  });

  let lLineNum = 0, rLineNum = 0;

  // グループ化（equalは連続してまとめ、折りたたみ対象にする）
  const groups = [];
  let equalBuf = [];
  diff.forEach(item => {
    if (item.type === 'equal') {
      equalBuf.push(item);
    } else {
      if (equalBuf.length) { groups.push({ type: 'equal-block', items: equalBuf }); equalBuf = []; }
      groups.push({ type: 'change', item });
    }
  });
  if (equalBuf.length) groups.push({ type: 'equal-block', items: equalBuf });

  // HTML生成
  let html = `
    <div class="diff-summary">
      <span class="diff-summary__label">差分結果</span>
      <span class="diff-summary__add">+${addCount} 行追加</span>
      <span class="diff-summary__remove">−${removeCount} 行削除</span>
      <span class="diff-summary__equal">${equalCount} 行一致</span>
      <button class="btn btn--ghost btn--sm diff-copy-btn" id="copy-diff-btn">${Icons.copyFill} テキストコピー</button>
    </div>
    <div class="diff-lines">
  `;

  // 行番号カウンタをリセット
  let leftNum = 0, rightNum = 0;

  groups.forEach(group => {
    if (group.type === 'change') {
      const item = group.item;
      if (item.type === 'remove') {
        leftNum++;
        const lineHtml = mode === 'char' ? escapeHtml(item.left) : escapeHtml(item.left);
        html += `<div class="diff-line diff-line--remove">
          <span class="diff-line__nums">${leftNum}<span class="diff-line__num-sep"></span></span>
          <span class="diff-line__sign diff-line__sign--remove">−</span>
          <span class="diff-line__content">${lineHtml}</span>
        </div>`;
      } else {
        rightNum++;
        const lineHtml = mode === 'char' ? escapeHtml(item.right) : escapeHtml(item.right);
        html += `<div class="diff-line diff-line--add">
          <span class="diff-line__nums"><span class="diff-line__num-sep"></span>${rightNum}</span>
          <span class="diff-line__sign diff-line__sign--add">+</span>
          <span class="diff-line__content">${lineHtml}</span>
        </div>`;
      }
    } else {
      // equal-block: 3行以上は折りたたむ
      const items = group.items;
      const CONTEXT = 3; // 前後に表示する行数
      if (items.length <= CONTEXT * 2) {
        // 短いブロックはすべて表示
        items.forEach(item => {
          leftNum++;
          rightNum++;
          html += `<div class="diff-line diff-line--equal">
            <span class="diff-line__nums">${leftNum}<span class="diff-line__num-sep">|</span>${rightNum}</span>
            <span class="diff-line__sign"></span>
            <span class="diff-line__content">${escapeHtml(item.left)}</span>
          </div>`;
        });
      } else {
        // 先頭CONTEXT行を表示
        for (let i = 0; i < CONTEXT; i++) {
          leftNum++;
          rightNum++;
          html += `<div class="diff-line diff-line--equal">
            <span class="diff-line__nums">${leftNum}<span class="diff-line__num-sep">|</span>${rightNum}</span>
            <span class="diff-line__sign"></span>
            <span class="diff-line__content">${escapeHtml(items[i].left)}</span>
          </div>`;
        }
        // 省略行
        const skipped = items.length - CONTEXT * 2;
        const skipStart = leftNum + 1;
        const hiddenItems = items.slice(CONTEXT, items.length - CONTEXT);
        let hiddenHtml = '';
        hiddenItems.forEach(item => {
          const ln = ++leftNum;
          const rn = ++rightNum;
          hiddenHtml += `<div class="diff-line diff-line--equal">
            <span class="diff-line__nums">${ln}<span class="diff-line__num-sep">|</span>${rn}</span>
            <span class="diff-line__sign"></span>
            <span class="diff-line__content">${escapeHtml(item.left)}</span>
          </div>`;
        });
        html += `<div class="diff-line diff-line--collapsed" data-hidden-html="${escapeHtml(hiddenHtml)}">
          … ${skipped} 行省略（クリックして展開）…
        </div>`;
        // 末尾CONTEXT行を表示
        for (let i = items.length - CONTEXT; i < items.length; i++) {
          leftNum++;
          rightNum++;
          html += `<div class="diff-line diff-line--equal">
            <span class="diff-line__nums">${leftNum}<span class="diff-line__num-sep">|</span>${rightNum}</span>
            <span class="diff-line__sign"></span>
            <span class="diff-line__content">${escapeHtml(items[i].left)}</span>
          </div>`;
        }
      }
    }
  });

  // 文字単位モードの場合は変更行に文字ハイライトを追加
  if (mode === 'char') {
    html = applyCharHighlight(diff, html, leftNum);
  }

  html += '</div>';
  container.innerHTML = html;

  // 折りたたみクリックイベント
  container.querySelectorAll('.diff-line--collapsed').forEach(el => {
    el.addEventListener('click', () => {
      const hiddenHtml = el.dataset.hiddenHtml;
      const frag = document.createElement('div');
      frag.innerHTML = hiddenHtml;
      el.replaceWith(...frag.childNodes);
    });
  });

  // テキストコピーボタン
  document.getElementById('copy-diff-btn')?.addEventListener('click', () => {
    copyDiffAsText(diff);
  });
}

/**
 * 文字単位ハイライトを適用した diff HTML を返す（行単位 diff の後処理）
 * ※ 現状は remove+add の対応する行を見つけて文字ハイライトを付与
 */
function applyCharHighlight(diff, html, _unused) {
  // remove/add のペアを探して文字単位 diff を適用
  // シンプルに: 連続する remove/add ペアに適用
  const container = document.createElement('div');
  container.innerHTML = html;

  const lines = Array.from(container.querySelectorAll('.diff-line'));
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i].classList.contains('diff-line--remove') &&
        lines[i + 1].classList.contains('diff-line--add')) {
      const remContent = lines[i].querySelector('.diff-line__content');
      const addContent = lines[i + 1].querySelector('.diff-line__content');
      if (!remContent || !addContent) continue;

      const rawRemove = remContent.textContent;
      const rawAdd    = addContent.textContent;
      const cDiff = charDiff(rawRemove, rawAdd);
      if (!cDiff) continue;

      remContent.innerHTML = cDiff.filter(c => c.type !== 'add')
        .map(c => c.type === 'remove'
          ? `<span class="char-remove">${escapeHtml(c.value)}</span>`
          : escapeHtml(c.value))
        .join('');
      addContent.innerHTML = cDiff.filter(c => c.type !== 'remove')
        .map(c => c.type === 'add'
          ? `<span class="char-add">${escapeHtml(c.value)}</span>`
          : escapeHtml(c.value))
        .join('');
    }
  }
  return container.innerHTML;
}

/**
 * diff をテキスト形式でコピーする
 */
function copyDiffAsText(diff) {
  const lines = diff.map(item => {
    if (item.type === 'add')    return `+ ${item.right}`;
    if (item.type === 'remove') return `- ${item.left}`;
    return `  ${item.left}`;
  });
  navigator.clipboard.writeText(lines.join('\n'))
    .then(() => showSuccess('差分テキストをコピーしました'))
    .catch(() => showError('コピーに失敗しました'));
}

// ==================================================
// イベント初期化
// ==================================================

function init() {
  const compareBtn       = document.getElementById('compare-btn');
  const clearBtn         = document.getElementById('clear-btn');
  const ignoreWsCheck    = document.getElementById('ignore-whitespace');
  const ignoreBlankCheck = document.getElementById('ignore-blank-lines');
  const ignoreTabsCheck  = document.getElementById('ignore-tabs');
  const realtimeCheck    = document.getElementById('realtime-compare');
  const modeToggle       = document.getElementById('mode-toggle');
  const leftInput        = document.getElementById('input-left');
  const rightInput       = document.getElementById('input-right');

  // 初期値をUIに反映
  ignoreWsCheck.checked    = State.ignoreWhitespace;
  ignoreBlankCheck.checked = State.ignoreBlankLines;
  ignoreTabsCheck.checked  = State.ignoreTabs;
  realtimeCheck.checked = State.realtime;
  modeToggle.querySelectorAll('.diff-mode-btn').forEach(btn => {
    btn.classList.toggle('diff-mode-btn--active', btn.dataset.mode === State.mode);
  });

  // 比較ボタン
  compareBtn.addEventListener('click', compare);

  // キーボードショートカット
  document.addEventListener('keydown', e => {
    const isInInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable;

    // Ctrl+Enter: 差分を比較
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      compare();
      return;
    }

    // Ctrl+Shift+C: テキストエリアをクリア
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
      e.preventDefault();
      leftInput.value  = '';
      rightInput.value = '';
      showDiffEmpty();
      return;
    }

    if (isInInput) return;

    // M: モード切替（行単位 ↔ 文字単位）
    if (e.key === 'm' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      State.mode = State.mode === 'line' ? 'char' : 'line';
      saveToStorage(DIFF_MODE_KEY, State.mode);
      modeToggle.querySelectorAll('.diff-mode-btn').forEach(b => {
        b.classList.toggle('diff-mode-btn--active', b.dataset.mode === State.mode);
      });
      if (State.realtime) compare();
      return;
    }
  });

  // クリアボタン
  clearBtn.addEventListener('click', () => {
    leftInput.value  = '';
    rightInput.value = '';
    showDiffEmpty();
  });

  // 空白無視オプション
  ignoreWsCheck.addEventListener('change', () => {
    State.ignoreWhitespace = ignoreWsCheck.checked;
    saveToStorage(DIFF_IGNORE_WS_KEY, String(State.ignoreWhitespace));
    if (State.realtime) compare();
  });

  // 空行無視オプション
  ignoreBlankCheck.addEventListener('change', () => {
    State.ignoreBlankLines = ignoreBlankCheck.checked;
    saveToStorage(DIFF_IGNORE_BLANK_KEY, String(State.ignoreBlankLines));
    if (State.realtime) compare();
  });

  // タブ無視オプション
  ignoreTabsCheck.addEventListener('change', () => {
    State.ignoreTabs = ignoreTabsCheck.checked;
    saveToStorage(DIFF_IGNORE_TABS_KEY, String(State.ignoreTabs));
    if (State.realtime) compare();
  });

  // リアルタイム比較
  realtimeCheck.addEventListener('change', () => {
    State.realtime = realtimeCheck.checked;
    saveToStorage(DIFF_REALTIME_KEY, String(State.realtime));
  });

  // モード切替
  modeToggle.addEventListener('click', e => {
    const btn = e.target.closest('.diff-mode-btn');
    if (!btn) return;
    State.mode = btn.dataset.mode;
    saveToStorage(DIFF_MODE_KEY, State.mode);
    modeToggle.querySelectorAll('.diff-mode-btn').forEach(b => {
      b.classList.toggle('diff-mode-btn--active', b.dataset.mode === State.mode);
    });
    if (State.realtime) compare();
  });

  // テキスト入力時のリアルタイム比較（debounce）
  const onInput = () => {
    if (!State.realtime) return;
    clearTimeout(State.realtimeTimer);
    State.realtimeTimer = setTimeout(compare, 400);
  };
  leftInput.addEventListener('input', onInput);
  rightInput.addEventListener('input', onInput);

  // ショートカットキー一覧登録
  ShortcutHelp.register([
    { name: 'ショートカット', shortcuts: [
      { keys: ['Ctrl', 'Enter'], description: '差分を比較' },
      { keys: ['Ctrl', 'Shift', 'C'], description: 'テキストエリアをクリア' },
      { keys: ['M'], description: 'モード切替（行/文字）' },
      { keys: ['?'], description: 'ショートカット一覧' },
    ]}
  ]);

  // テーマ変更メッセージ受信（親フレームから）
  window.addEventListener('message', e => {
    if (e.data?.type === 'theme-change') {
      document.documentElement.setAttribute('data-theme', e.data.theme);
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
