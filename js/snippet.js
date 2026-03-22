// ==================================================
// コードスニペット管理 メインスクリプト
// ==================================================

const showToast = (msg, type) => Toast.show(msg, type);

// ローカルストレージキー
const SNIPPET_SELECTED_KEY   = 'snippet_selected_id';
const SNIPPET_FILTER_LANG    = 'snippet_filter_lang';
const SNIPPET_FILTER_TAG     = 'snippet_filter_tag';
const SNIPPET_SEARCH_KEY     = 'snippet_search';

// 言語の表示色マップ
const LANG_COLORS = {
  sql:        '#3b82f6',
  javascript: '#f59e0b',
  typescript: '#3b82f6',
  python:     '#10b981',
  bash:       '#6b7280',
  shell:      '#6b7280',
  java:       '#ef4444',
  go:         '#06b6d4',
  rust:       '#f97316',
  yaml:       '#8b5cf6',
  json:       '#84cc16',
  xml:        '#ec4899',
  html:       '#f97316',
  css:        '#3b82f6',
  markdown:   '#6366f1',
  text:       '#9ca3af',
};

// 状態
const State = {
  db: null,
  snippets: [],
  filteredSnippets: [],
  selectedId: null,
  searchQuery: loadFromStorage(SNIPPET_SEARCH_KEY) || '',
  filterLanguage: loadFromStorage(SNIPPET_FILTER_LANG) || '',
  filterTag: loadFromStorage(SNIPPET_FILTER_TAG) || '',
  editingId: null,  // null=新規, number=編集
};

// ==================================================
// フィルタ・検索
// ==================================================

/** フィルタを適用してfilteredSnippetsを更新 */
function applyFilter() {
  const q    = State.searchQuery.toLowerCase();
  const lang = State.filterLanguage;
  const tag  = State.filterTag;

  State.filteredSnippets = State.snippets.filter(s => {
    if (lang && s.language !== lang) return false;
    if (tag  && !(s.tags || []).includes(tag)) return false;
    if (q) {
      const haystack = [s.title, s.language, s.description, s.code, ...(s.tags || [])].join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

// ==================================================
// レンダリング
// ==================================================

/** 言語に対応した色を取得 */
function getLangColor(lang) {
  return LANG_COLORS[(lang || '').toLowerCase()] || '#8b95b8';
}

/** 言語バッジHTMLを生成 */
function langBadgeHtml(lang) {
  if (!lang) return '';
  const color = getLangColor(lang);
  return `<span class="lang-badge" style="--lang-color:${color}">${escapeHtml(lang)}</span>`;
}

/** タグバッジ群のHTMLを生成 */
function tagBadgesHtml(tags) {
  if (!tags || !tags.length) return '';
  return tags.map(t => `<span class="tag-badge">${escapeHtml(t)}</span>`).join('');
}

/** スニペット一覧を描画 */
function renderList() {
  const el    = document.getElementById('snippet-list');
  const count = document.getElementById('snippet-count');
  count.textContent = `${State.filteredSnippets.length} 件`;

  if (!State.filteredSnippets.length) {
    el.innerHTML = `<div class="snippet-list__empty">
      <p>スニペットが見つかりません</p>
    </div>`;
    return;
  }

  el.innerHTML = State.filteredSnippets.map(s => {
    const active = s.id === State.selectedId ? ' snippet-item--active' : '';
    return `<div class="snippet-item${active}" data-id="${s.id}" tabindex="0">
      <div class="snippet-item__header">
        <span class="snippet-item__title">${escapeHtml(s.title)}</span>
        ${langBadgeHtml(s.language)}
      </div>
      ${s.description ? `<div class="snippet-item__desc">${escapeHtml(s.description)}</div>` : ''}
      ${(s.tags && s.tags.length) ? `<div class="snippet-item__tags">${tagBadgesHtml(s.tags)}</div>` : ''}
    </div>`;
  }).join('');
}

/** タグフィルタボタンを描画 */
function renderTagFilter() {
  const el   = document.getElementById('tag-filter-bar');
  const tags = [...new Set(State.snippets.flatMap(s => s.tags || []))].sort();

  if (!tags.length) {
    el.innerHTML = '';
    return;
  }

  el.innerHTML = tags.map(t =>
    `<button class="tag-filter-btn${State.filterTag === t ? ' tag-filter-btn--active' : ''}" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`
  ).join('');
}

/** 言語セレクトのオプションを更新 */
function updateLangSelect() {
  const sel  = document.getElementById('lang-filter');
  const langs = [...new Set(State.snippets.map(s => s.language).filter(Boolean))].sort();
  const cur  = sel.value;

  sel.innerHTML = '<option value="">すべての言語</option>' +
    langs.map(l => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('');
  sel.value = langs.includes(cur) ? cur : '';
  // CustomSelect の表示を同期
  sel._csInst?.render();
}

/** 詳細パネルを描画 */
function renderDetail() {
  const panel = document.getElementById('snippet-detail');

  if (!State.selectedId) {
    panel.innerHTML = `<div class="snippet-detail__empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5"/>
      </svg>
      <p>左のリストからスニペットを選択してください</p>
    </div>`;
    return;
  }

  const s = State.snippets.find(x => x.id === State.selectedId);
  if (!s) { State.selectedId = null; renderDetail(); return; }

  const langClass = s.language ? `language-${s.language}` : '';
  const createdAt = new Date(s.created_at).toLocaleDateString('ja-JP');
  const updatedAt = new Date(s.updated_at).toLocaleDateString('ja-JP');

  panel.innerHTML = `
    <div class="snippet-detail__header">
      <div class="snippet-detail__title-row">
        <h2 class="snippet-detail__title">${escapeHtml(s.title)}</h2>
        ${langBadgeHtml(s.language)}
      </div>
      ${(s.tags && s.tags.length) ? `<div class="snippet-detail__tags">${tagBadgesHtml(s.tags)}</div>` : ''}
      <div class="snippet-detail__actions">
        <button class="btn btn--primary btn--sm copy-code-main-btn" data-id="${s.id}">
          ${Icons.copyFill} コードをコピー
        </button>
        <button class="btn btn--ghost btn--sm snippet-edit-btn" data-id="${s.id}">
          ${Icons.edit} 編集
        </button>
        <button class="btn btn--ghost-danger btn--sm snippet-delete-btn" data-id="${s.id}">
          ${Icons.close} 削除
        </button>
      </div>
    </div>
    ${s.description ? `<div class="snippet-detail__desc">${escapeHtml(s.description)}</div>` : ''}
    <div class="snippet-detail__code">
      <pre><code class="${langClass}" id="code-view">${escapeHtml(s.code)}</code></pre>
    </div>
    <div class="snippet-detail__meta">
      <span>作成: ${createdAt}</span>
      <span>更新: ${updatedAt}</span>
    </div>
  `;

  // シンタックスハイライト適用
  const codeEl = document.getElementById('code-view');
  if (codeEl && window.hljs) {
    hljs.highlightElement(codeEl);
  }
}

/** 全体を再描画 */
function renderAll() {
  applyFilter();
  renderList();
  renderTagFilter();
  updateLangSelect();
  renderDetail();
}

// ==================================================
// モーダル
// ==================================================

/** スニペット追加/編集モーダルを開く */
function openModal(id = null) {
  State.editingId = id;
  const modal  = document.getElementById('snippet-modal');
  const title  = document.getElementById('modal-title-text');
  const form   = document.getElementById('snippet-form');

  if (id) {
    const s = State.snippets.find(x => x.id === id);
    if (!s) return;
    title.textContent = 'スニペットを編集';
    form['modal-title'].value       = s.title;
    form['modal-language'].value    = s.language || '';
    form['modal-tags'].value        = (s.tags || []).join(', ');
    form['modal-description'].value = s.description || '';
    form['modal-code'].value        = s.code || '';
  } else {
    title.textContent = '新しいスニペット';
    form.reset();
  }

  modal.hidden = false;
  // CustomSelect の表示を選択値に同期
  document.getElementById('modal-language-input')._csInst?.render();
  form['modal-title'].focus();
}

/** モーダルを閉じる */
function closeModal() {
  document.getElementById('snippet-modal').hidden = true;
  State.editingId = null;
}

/** モーダルの保存処理 */
async function saveSnippet() {
  const form = document.getElementById('snippet-form');
  const title = form['modal-title'].value.trim();
  const code  = form['modal-code'].value;

  if (!title) { showToast('タイトルを入力してください', 'error'); form['modal-title'].focus(); return; }
  if (!code)  { showToast('コードを入力してください', 'error'); form['modal-code'].focus(); return; }

  const now  = new Date().toISOString();
  const tags = form['modal-tags'].value.split(',').map(t => t.trim()).filter(Boolean);

  try {
    if (State.editingId) {
      // 更新
      const old = State.snippets.find(x => x.id === State.editingId);
      const updated = {
        ...old,
        title,
        language:    form['modal-language'].value.trim(),
        tags,
        description: form['modal-description'].value.trim(),
        code,
        updated_at:  now,
      };
      await State.db.updateSnippet(updated);
      const idx = State.snippets.findIndex(x => x.id === State.editingId);
      State.snippets[idx] = updated;
      showToast('スニペットを更新しました', 'success');
    } else {
      // 追加
      const snippet = {
        title,
        language:    form['modal-language'].value.trim(),
        tags,
        description: form['modal-description'].value.trim(),
        code,
        created_at:  now,
        updated_at:  now,
      };
      const added = await State.db.addSnippet(snippet);
      State.snippets.push(added);
      State.selectedId = added.id;
      saveToStorage(SNIPPET_SELECTED_KEY, String(added.id));
      showToast('スニペットを追加しました', 'success');
    }
    closeModal();
    renderAll();
  } catch (err) {
    console.error(err);
    showToast('保存に失敗しました', 'error');
  }
}

/** スニペットを削除する */
async function deleteSnippet(id) {
  const s = State.snippets.find(x => x.id === id);
  if (!s) return;
  if (!confirm(`「${s.title}」を削除しますか？`)) return;

  try {
    await State.db.deleteSnippet(id);
    State.snippets = State.snippets.filter(x => x.id !== id);
    if (State.selectedId === id) {
      State.selectedId = State.filteredSnippets.find(x => x.id !== id)?.id || null;
      saveToStorage(SNIPPET_SELECTED_KEY, State.selectedId ? String(State.selectedId) : '');
    }
    showToast('削除しました', 'success');
    renderAll();
  } catch (err) {
    console.error(err);
    showToast('削除に失敗しました', 'error');
  }
}

// ==================================================
// コードコピー
// ==================================================

/** 指定IDのコードをクリップボードにコピー */
function copyCode(id) {
  const s = State.snippets.find(x => x.id === id);
  if (!s) return;
  navigator.clipboard.writeText(s.code)
    .then(() => showToast('コードをコピーしました', 'success'))
    .catch(() => showToast('コピーに失敗しました', 'error'));
}

// ==================================================
// エクスポート/インポート
// ==================================================

async function exportSnippets() {
  try {
    const data = await State.db.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `snippets_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('エクスポートしました', 'success');
  } catch (err) {
    console.error(err);
    showToast('エクスポートに失敗しました', 'error');
  }
}

function importSnippets() {
  const input = document.createElement('input');
  input.type  = 'file';
  input.accept = '.json';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const replace = confirm('既存のスニペットをすべて削除してインポートしますか？\n「キャンセル」を押すと追記インポートします。');
      const count = await State.db.importAll(data, replace);
      State.snippets = await State.db.getAllSnippets();
      renderAll();
      showToast(`${count} 件をインポートしました`, 'success');
    } catch (err) {
      console.error(err);
      showToast('インポートに失敗しました', 'error');
    }
  };
  input.click();
}

// ==================================================
// highlight.js テーマ切替
// ==================================================

function applyHljsTheme(theme) {
  const darkLink  = document.getElementById('hljs-dark');
  const lightLink = document.getElementById('hljs-light');
  if (!darkLink || !lightLink) return;
  if (theme === 'dark') {
    lightLink.disabled = true;
    darkLink.disabled  = false;
  } else {
    lightLink.disabled = false;
    darkLink.disabled  = true;
  }
}

// ==================================================
// イベント設定
// ==================================================

function setupEvents() {
  // 検索
  const searchInput = document.getElementById('search-input');
  searchInput.value = State.searchQuery;
  let searchTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      State.searchQuery = searchInput.value;
      saveToStorage(SNIPPET_SEARCH_KEY, State.searchQuery);
      applyFilter();
      renderList();
    }, 200);
  });

  // 言語フィルタ・モーダル言語フィールド（CustomSelect に変換）
  const langFilter = document.getElementById('lang-filter');
  CustomSelect.replaceAll(document.querySelector('.snippet-list-panel__top'));
  CustomSelect.replaceAll(document.getElementById('snippet-modal'));
  langFilter.addEventListener('change', () => {
    State.filterLanguage = langFilter.value;
    saveToStorage(SNIPPET_FILTER_LANG, State.filterLanguage);
    applyFilter();
    renderList();
  });
  langFilter.value = State.filterLanguage;
  langFilter._csInst?.render();

  // タグフィルタ（イベント委譲）
  document.getElementById('tag-filter-bar').addEventListener('click', e => {
    const btn = e.target.closest('.tag-filter-btn');
    if (!btn) return;
    const tag = btn.dataset.tag;
    State.filterTag = State.filterTag === tag ? '' : tag;
    saveToStorage(SNIPPET_FILTER_TAG, State.filterTag);
    applyFilter();
    renderList();
    renderTagFilter();
  });

  // スニペット一覧クリック
  document.getElementById('snippet-list').addEventListener('click', e => {
    const item = e.target.closest('.snippet-item');
    if (!item) return;
    const id = Number(item.dataset.id);
    State.selectedId = id;
    saveToStorage(SNIPPET_SELECTED_KEY, String(id));
    renderList();
    renderDetail();
  });

  // キーボード（↑↓で一覧ナビ）
  document.getElementById('snippet-list').addEventListener('keydown', e => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const items = State.filteredSnippets;
    const idx   = items.findIndex(x => x.id === State.selectedId);
    const next  = e.key === 'ArrowDown' ? idx + 1 : idx - 1;
    if (next < 0 || next >= items.length) return;
    State.selectedId = items[next].id;
    saveToStorage(SNIPPET_SELECTED_KEY, String(State.selectedId));
    renderList();
    renderDetail();
    document.querySelector(`.snippet-item[data-id="${State.selectedId}"]`)?.focus();
  });

  // 新規追加ボタン
  document.getElementById('add-snippet-btn').addEventListener('click', () => openModal());

  // 詳細パネルのボタン（イベント委譲）
  document.getElementById('snippet-detail').addEventListener('click', e => {
    const copyBtn   = e.target.closest('.copy-code-main-btn');
    const editBtn   = e.target.closest('.snippet-edit-btn');
    const deleteBtn = e.target.closest('.snippet-delete-btn');
    if (copyBtn)   copyCode(Number(copyBtn.dataset.id));
    if (editBtn)   openModal(Number(editBtn.dataset.id));
    if (deleteBtn) deleteSnippet(Number(deleteBtn.dataset.id));
  });

  // モーダル
  document.getElementById('modal-cancel-btn').addEventListener('click', closeModal);
  document.getElementById('modal-save-btn').addEventListener('click', saveSnippet);
  document.getElementById('snippet-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });
  document.getElementById('snippet-form').addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveSnippet();
  });

  // エクスポート/インポート
  document.getElementById('export-btn').addEventListener('click', exportSnippets);
  document.getElementById('import-btn').addEventListener('click', importSnippets);

  // テーマ変更
  window.addEventListener('message', e => {
    if (e.data?.type === 'theme-change') {
      document.documentElement.setAttribute('data-theme', e.data.theme);
      applyHljsTheme(e.data.theme);
      // 再ハイライト
      const codeEl = document.getElementById('code-view');
      if (codeEl && window.hljs) {
        codeEl.removeAttribute('data-highlighted');
        hljs.highlightElement(codeEl);
      }
    }
  });

  // グローバル検索: snippet_db のスニペットを検索して結果を返す
  window.addEventListener('message', async (e) => {
    const { type, query, searchId } = e.data || {};
    if (type !== 'global-search' || !query) return;
    try {
      const db = new SnippetDB();
      await db.open();
      const snippets = await db.getAllSnippets();
      const q = query.toLowerCase();
      const results = snippets
        .filter(s =>
          s.title?.toLowerCase().includes(q) ||
          s.description?.toLowerCase().includes(q) ||
          s.code?.toLowerCase().includes(q)
        )
        .slice(0, 10)
        .map(s => {
          let excerpt = '';
          if (s.description?.toLowerCase().includes(q)) {
            const idx = s.description.toLowerCase().indexOf(q);
            const start = Math.max(0, idx - 20);
            excerpt = (start > 0 ? '…' : '') + s.description.slice(start, idx + query.length + 30);
          } else if (s.code?.toLowerCase().includes(q)) {
            const idx = s.code.toLowerCase().indexOf(q);
            const start = Math.max(0, idx - 20);
            excerpt = (start > 0 ? '…' : '') + s.code.slice(start, idx + query.length + 30).replace(/\n/g, ' ');
          }
          return { id: s.id, title: s.title || '', excerpt };
        });
      parent.postMessage({ type: 'global-search-result', searchId, page: 'スニペット', pageSrc: 'pages/snippet.html', results }, '*');
    } catch (err) {
      parent.postMessage({ type: 'global-search-result', searchId, page: 'スニペット', pageSrc: 'pages/snippet.html', results: [] }, '*');
    }
  });

  // グローバル検索フォーカス: 指定 ID のスニペットを選択・表示する
  window.addEventListener('message', (e) => {
    const { type, targetId } = e.data || {};
    if (type !== 'global-search-focus' || !targetId) return;
    const snippet = State.snippets.find(s => s.id === targetId);
    if (!snippet) return;
    State.selectedId = targetId;
    renderAll();
    document.querySelector(`[data-id="${targetId}"]`)?.scrollIntoView({ block: 'nearest' });
  });
}

// ==================================================
// 初期化
// ==================================================

async function init() {
  // DBを開く
  const db = new SnippetDB();
  await db.open();
  State.db = db;

  // スニペットを読み込む
  State.snippets = await db.getAllSnippets();

  // 最後に選択していたIDを復元
  const savedId = Number(loadFromStorage(SNIPPET_SELECTED_KEY));
  if (savedId && State.snippets.some(s => s.id === savedId)) {
    State.selectedId = savedId;
  } else if (State.snippets.length) {
    State.selectedId = State.snippets[0].id;
  }

  // 言語フィルタを復元
  State.filterLanguage = loadFromStorage(SNIPPET_FILTER_LANG) || '';
  State.filterTag      = loadFromStorage(SNIPPET_FILTER_TAG) || '';

  // 初期テーマ適用
  const theme = document.documentElement.getAttribute('data-theme') || 'light';
  applyHljsTheme(theme);

  // イベント設定・描画
  setupEvents();
  renderAll();
}

document.addEventListener('DOMContentLoaded', init);
