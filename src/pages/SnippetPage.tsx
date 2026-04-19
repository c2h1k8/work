// ==================================================
// SnippetPage — コードスニペット管理（React 移行版）
// ==================================================

import { useState, useEffect, useMemo, useRef } from 'react';
import { codeToHtml } from 'shiki';
import { useToast } from '../components/Toast';
import { snippetDB, type Snippet } from '../db/snippet_db';
import { activityDB } from '../db/activity_db';
import { Clipboard } from '../core/clipboard';

// ── ストレージキー ─────────────────────────────────
const KEY_SELECTED = 'snippet_selected_id';
const KEY_FILTER_LANG = 'snippet_filter_lang';
const KEY_FILTER_TAG  = 'snippet_filter_tag';
const KEY_SEARCH      = 'snippet_search';

// ── 言語色マップ ──────────────────────────────────
const LANG_COLORS: Record<string, string> = {
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

function getLangColor(lang: string) {
  return LANG_COLORS[(lang || '').toLowerCase()] || '#8b95b8';
}

// ── shiki でハイライト済み HTML を生成 ────────────
const SHIKI_LANG_MAP: Record<string, string> = {
  javascript: 'javascript', typescript: 'typescript',
  python: 'python', bash: 'bash', shell: 'sh',
  java: 'java', go: 'go', rust: 'rust',
  yaml: 'yaml', json: 'json', xml: 'xml',
  html: 'html', css: 'css', markdown: 'markdown',
  sql: 'sql', text: 'text',
};

async function highlight(code: string, lang: string, theme: string): Promise<string> {
  const shikiLang = SHIKI_LANG_MAP[lang?.toLowerCase() || ''] || 'text';
  try {
    return await codeToHtml(code, {
      lang: shikiLang,
      theme: theme === 'dark' ? 'github-dark' : 'github-light',
    });
  } catch {
    // フォールバック: プレーンテキスト
    const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<pre><code>${escaped}</code></pre>`;
  }
}

// ================================================================
// コードビューワー
// ================================================================
function CodeView({ code, language }: { code: string; language: string }) {
  const [html, setHtml] = useState('');
  const theme = document.documentElement.getAttribute('data-theme') || 'light';

  useEffect(() => {
    let cancelled = false;
    highlight(code, language, theme).then(h => { if (!cancelled) setHtml(h); });
    return () => { cancelled = true; };
  }, [code, language, theme]);

  if (!html) {
    return (
      <pre className="text-xs font-mono p-4 overflow-auto whitespace-pre-wrap break-all text-[var(--c-text)] bg-[var(--c-bg-2)]">
        {code}
      </pre>
    );
  }

  return (
    <div
      className="text-xs overflow-auto [&>pre]:p-4 [&>pre]:rounded-none [&>pre]:!bg-transparent [&>pre]:overflow-auto"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// ================================================================
// スニペット追加/編集モーダル
// ================================================================
interface SnippetModalProps {
  snippet: Snippet | null;
  onSave: (data: Omit<Snippet, 'id' | 'created_at' | 'updated_at' | 'position'>) => void;
  onClose: () => void;
}

const LANGUAGES = [
  '', 'sql', 'javascript', 'typescript', 'python', 'bash', 'shell',
  'java', 'go', 'rust', 'yaml', 'json', 'xml', 'html', 'css', 'markdown', 'text',
];

function SnippetModal({ snippet, onSave, onClose }: SnippetModalProps) {
  const [title, setTitle]       = useState(snippet?.title || '');
  const [language, setLang]     = useState(snippet?.language || '');
  const [tags, setTags]         = useState((snippet?.tags || []).join(', '));
  const [description, setDesc]  = useState(snippet?.description || '');
  const [code, setCode]         = useState(snippet?.code || '');
  const { error: showError }    = useToast();
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => { titleRef.current?.focus(); }, []);

  const handleSubmit = () => {
    if (!title.trim()) { showError('タイトルを入力してください'); titleRef.current?.focus(); return; }
    if (!code.trim())  { showError('コードを入力してください'); return; }
    const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
    onSave({ title: title.trim(), language: language.trim(), tags: tagList, description: description.trim(), code });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleSubmit();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[var(--c-bg)] rounded-xl border border-[var(--c-border)] shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]" onKeyDown={handleKeyDown}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--c-border)] shrink-0">
          <h2 className="font-semibold">{snippet ? 'スニペットを編集' : '新しいスニペット'}</h2>
          <button onClick={onClose} className="text-[var(--c-text-3)] hover:text-[var(--c-text)] text-xl leading-none">×</button>
        </div>
        <div className="overflow-auto flex-1 px-5 py-4 flex flex-col gap-4">
          <div className="flex gap-3">
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-xs text-[var(--c-text-3)]">タイトル *</label>
              <input ref={titleRef} type="text" value={title} onChange={e => setTitle(e.target.value)}
                className="px-3 py-2 text-sm rounded-lg border border-[var(--c-border)] bg-[var(--c-bg-2)] text-[var(--c-text)] focus:outline-none focus:border-[var(--c-accent)]" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[var(--c-text-3)]">言語</label>
              <select value={language} onChange={e => setLang(e.target.value)}
                className="px-3 py-2 text-sm rounded-lg border border-[var(--c-border)] bg-[var(--c-bg-2)] text-[var(--c-text)] focus:outline-none focus:border-[var(--c-accent)]">
                {LANGUAGES.map(l => <option key={l} value={l}>{l || 'すべての言語'}</option>)}
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--c-text-3)]">タグ（カンマ区切り）</label>
            <input type="text" value={tags} onChange={e => setTags(e.target.value)} placeholder="tag1, tag2"
              className="px-3 py-2 text-sm rounded-lg border border-[var(--c-border)] bg-[var(--c-bg-2)] text-[var(--c-text)] focus:outline-none focus:border-[var(--c-accent)]" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--c-text-3)]">説明</label>
            <input type="text" value={description} onChange={e => setDesc(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-[var(--c-border)] bg-[var(--c-bg-2)] text-[var(--c-text)] focus:outline-none focus:border-[var(--c-accent)]" />
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs text-[var(--c-text-3)]">コード *</label>
            <textarea value={code} onChange={e => setCode(e.target.value)}
              className="flex-1 min-h-48 px-3 py-2 text-xs font-mono rounded-lg border border-[var(--c-border)] bg-[var(--c-bg-2)] text-[var(--c-text)] focus:outline-none focus:border-[var(--c-accent)] resize-y"
              spellCheck={false} />
          </div>
        </div>
        <div className="flex gap-2 px-5 py-4 border-t border-[var(--c-border)] shrink-0 justify-end">
          <button onClick={onClose} className="btn btn--ghost btn--sm">キャンセル</button>
          <button onClick={handleSubmit} className="btn btn--primary btn--sm">保存</button>
        </div>
      </div>
    </div>
  );
}

// ================================================================
// SnippetPage メイン
// ================================================================
export function SnippetPage() {
  const { success, error: showError } = useToast();
  const [snippets, setSnippets]   = useState<Snippet[]>([]);
  const [selectedId, setSelected] = useState<number | null>(null);
  const [search, setSearch]       = useState(() => localStorage.getItem(KEY_SEARCH) || '');
  const [filterLang, setFilterLang] = useState(() => localStorage.getItem(KEY_FILTER_LANG) || '');
  const [filterTag, setFilterTag]   = useState(() => localStorage.getItem(KEY_FILTER_TAG) || '');
  const [modalSnippet, setModal]    = useState<Snippet | null | 'new'>('new' as never);
  const [showModal, setShowModal]   = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // 初回ロード
  useEffect(() => {
    snippetDB.getAllSnippets().then(all => {
      setSnippets(all);
      const savedId = Number(localStorage.getItem(KEY_SELECTED));
      const found = savedId && all.some(s => s.id === savedId);
      setSelected(found ? savedId : (all[0]?.id ?? null));
    });
  }, []);

  // フィルタリング
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return snippets.filter(s => {
      if (filterLang && s.language !== filterLang) return false;
      if (filterTag  && !(s.tags || []).includes(filterTag)) return false;
      if (q) {
        const haystack = [s.title, s.language, s.description, s.code, ...(s.tags || [])].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [snippets, search, filterLang, filterTag]);

  const allTags  = useMemo(() => [...new Set(snippets.flatMap(s => s.tags || []))].sort(), [snippets]);
  const allLangs = useMemo(() => [...new Set(snippets.map(s => s.language).filter(Boolean))].sort(), [snippets]);

  const selectedSnippet = useMemo(() => snippets.find(s => s.id === selectedId) ?? null, [snippets, selectedId]);

  const handleSelect = (id: number) => {
    setSelected(id);
    localStorage.setItem(KEY_SELECTED, String(id));
  };

  const handleSearch = (v: string) => {
    setSearch(v);
    localStorage.setItem(KEY_SEARCH, v);
  };
  const handleLangFilter = (v: string) => {
    setFilterLang(v);
    localStorage.setItem(KEY_FILTER_LANG, v);
  };
  const handleTagFilter = (tag: string) => {
    const next = filterTag === tag ? '' : tag;
    setFilterTag(next);
    localStorage.setItem(KEY_FILTER_TAG, next);
  };

  const openNew  = () => { setModal(null); setShowModal(true); };
  const openEdit = (s: Snippet) => { setModal(s); setShowModal(true); };

  const handleSave = async (data: Omit<Snippet, 'id' | 'created_at' | 'updated_at' | 'position'>) => {
    const now = new Date().toISOString();
    if (modalSnippet && typeof modalSnippet === 'object') {
      const updated = { ...modalSnippet, ...data, updated_at: now };
      await snippetDB.updateSnippet(updated);
      setSnippets(prev => prev.map(s => s.id === updated.id ? updated : s));
      activityDB.add({ page: 'snippet', action: 'update', target_type: 'snippet', target_id: String(updated.id), summary: `スニペット「${updated.title}」を更新`, created_at: now });
      success('スニペットを更新しました');
    } else {
      const added = await snippetDB.addSnippet({ ...data, created_at: now, updated_at: now, position: snippets.length });
      setSnippets(prev => [...prev, added]);
      setSelected(added.id!);
      localStorage.setItem(KEY_SELECTED, String(added.id));
      activityDB.add({ page: 'snippet', action: 'create', target_type: 'snippet', target_id: String(added.id), summary: `スニペット「${added.title}」を追加`, created_at: now });
      success('スニペットを追加しました');
    }
    setShowModal(false);
  };

  const handleDelete = async (s: Snippet) => {
    if (!confirm(`「${s.title}」を削除しますか？`)) return;
    const now = new Date().toISOString();
    activityDB.add({ page: 'snippet', action: 'delete', target_type: 'snippet', target_id: String(s.id), summary: `スニペット「${s.title}」を削除`, created_at: now });
    await snippetDB.deleteSnippet(s.id!);
    setSnippets(prev => prev.filter(x => x.id !== s.id));
    if (selectedId === s.id) {
      const next = filtered.find(x => x.id !== s.id)?.id ?? null;
      setSelected(next);
      localStorage.setItem(KEY_SELECTED, next ? String(next) : '');
    }
    success('削除しました');
  };

  const handleCopy = (s: Snippet) => {
    Clipboard.copy(s.code)
      .then(() => success('コードをコピーしました'))
      .catch(() => showError('コピーに失敗しました'));
  };

  const handleExport = async () => {
    const data = await snippetDB.exportAll();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `snippets_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    success('エクスポートしました');
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const replace = confirm('既存のスニペットをすべて削除してインポートしますか？\n「キャンセル」を押すと追記インポートします。');
        const count = await snippetDB.importAll(data, replace);
        const all = await snippetDB.getAllSnippets();
        setSnippets(all);
        success(`${count} 件をインポートしました`);
      } catch { showError('インポートに失敗しました'); }
    };
    input.click();
  };

  // キーボードショートカット
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (showModal) return;
      const isInput = ['INPUT','TEXTAREA','SELECT'].includes((e.target as Element).tagName) || (e.target as HTMLElement).isContentEditable;
      if (e.key === 'Escape' && isInput) { (e.target as HTMLElement).blur(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); searchRef.current?.focus(); return; }
      if (isInput) return;
      if (e.key === 'n') { e.preventDefault(); openNew(); return; }
      if (e.key === 'Enter' && selectedSnippet) { e.preventDefault(); handleCopy(selectedSnippet); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const idx = filtered.findIndex(s => s.id === selectedId);
        const next = e.key === 'ArrowDown' ? idx + 1 : idx - 1;
        if (next >= 0 && next < filtered.length) handleSelect(filtered[next].id!);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [showModal, filtered, selectedId, selectedSnippet]);

  return (
    <div className="flex h-full overflow-hidden">
      {/* 左パネル */}
      <div className="w-72 flex flex-col border-r border-[var(--c-border)] shrink-0">
        {/* 検索・フィルター */}
        <div className="p-3 flex flex-col gap-2 border-b border-[var(--c-border)]">
          <div className="flex gap-2">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={e => handleSearch(e.target.value)}
              placeholder="検索… (Ctrl+F)"
              className="flex-1 min-w-0 px-3 py-1.5 text-xs rounded-lg border border-[var(--c-border)] bg-[var(--c-bg-2)] text-[var(--c-text)] focus:outline-none focus:border-[var(--c-accent)]"
            />
            <button onClick={openNew} className="btn btn--primary btn--sm text-xs px-2 shrink-0" title="新規追加 (N)">+</button>
          </div>
          <select value={filterLang} onChange={e => handleLangFilter(e.target.value)}
            className="w-full px-2 py-1.5 text-xs rounded-lg border border-[var(--c-border)] bg-[var(--c-bg-2)] text-[var(--c-text)] focus:outline-none focus:border-[var(--c-accent)]">
            <option value="">すべての言語</option>
            {allLangs.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {allTags.map(tag => (
                <button key={tag} onClick={() => handleTagFilter(tag)}
                  className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${filterTag === tag ? 'bg-[var(--c-accent)] text-white border-[var(--c-accent)]' : 'border-[var(--c-border)] text-[var(--c-text-2)] hover:border-[var(--c-accent)]'}`}>
                  {tag}
                </button>
              ))}
            </div>
          )}
          <div className="text-xs text-[var(--c-text-3)]">{filtered.length} 件</div>
        </div>
        {/* スニペット一覧 */}
        <div className="flex-1 overflow-auto">
          {filtered.length === 0 ? (
            <div className="p-4 text-center text-sm text-[var(--c-text-3)]">スニペットが見つかりません</div>
          ) : (
            filtered.map(s => (
              <div key={s.id} onClick={() => handleSelect(s.id!)}
                className={`px-3 py-2.5 cursor-pointer border-b border-[var(--c-border)] transition-colors ${selectedId === s.id ? 'bg-[var(--c-accent)]/10 border-l-2 border-l-[var(--c-accent)]' : 'hover:bg-[var(--c-bg-2)]'}`}>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate flex-1">{s.title}</span>
                  {s.language && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-mono shrink-0"
                      style={{ backgroundColor: getLangColor(s.language) + '22', color: getLangColor(s.language), border: `1px solid ${getLangColor(s.language)}44` }}>
                      {s.language}
                    </span>
                  )}
                </div>
                {s.description && <div className="text-xs text-[var(--c-text-2)] truncate mt-0.5">{s.description}</div>}
                {(s.tags || []).length > 0 && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {s.tags.map(t => <span key={t} className="text-[10px] px-1 bg-[var(--c-bg-3)] text-[var(--c-text-2)] rounded">{t}</span>)}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
        {/* フッター */}
        <div className="p-2 border-t border-[var(--c-border)] flex gap-1">
          <button onClick={handleExport} className="flex-1 btn btn--ghost btn--sm text-xs">エクスポート</button>
          <button onClick={handleImport} className="flex-1 btn btn--ghost btn--sm text-xs">インポート</button>
        </div>
      </div>

      {/* 右パネル（詳細） */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedSnippet ? (
          <div className="flex-1 flex flex-col items-center justify-center text-[var(--c-text-3)] gap-3">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="48" height="48">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5"/>
            </svg>
            <p className="text-sm">左のリストからスニペットを選択してください</p>
          </div>
        ) : (
          <>
            {/* ヘッダー */}
            <div className="px-4 py-3 border-b border-[var(--c-border)] flex items-start gap-3 shrink-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-semibold text-base">{selectedSnippet.title}</h2>
                  {selectedSnippet.language && (
                    <span className="text-xs px-2 py-0.5 rounded font-mono"
                      style={{ backgroundColor: getLangColor(selectedSnippet.language) + '22', color: getLangColor(selectedSnippet.language), border: `1px solid ${getLangColor(selectedSnippet.language)}44` }}>
                      {selectedSnippet.language}
                    </span>
                  )}
                </div>
                {(selectedSnippet.tags || []).length > 0 && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {selectedSnippet.tags.map(t => <span key={t} className="text-xs px-1.5 py-0.5 bg-[var(--c-bg-3)] text-[var(--c-text-2)] rounded">{t}</span>)}
                  </div>
                )}
                {selectedSnippet.description && (
                  <p className="text-sm text-[var(--c-text-2)] mt-1">{selectedSnippet.description}</p>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => handleCopy(selectedSnippet)} className="btn btn--primary btn--sm text-xs">コピー (Enter)</button>
                <button onClick={() => openEdit(selectedSnippet)} className="btn btn--ghost btn--sm text-xs">編集</button>
                <button onClick={() => handleDelete(selectedSnippet)} className="btn btn--ghost btn--sm text-xs text-red-400 hover:text-red-300">削除</button>
              </div>
            </div>
            {/* コード表示 */}
            <div className="flex-1 overflow-auto bg-[var(--c-bg-2)]">
              <CodeView code={selectedSnippet.code} language={selectedSnippet.language} />
            </div>
            {/* メタ情報 */}
            <div className="px-4 py-2 border-t border-[var(--c-border)] flex gap-4 text-xs text-[var(--c-text-3)] shrink-0">
              <span>作成: {new Date(selectedSnippet.created_at).toLocaleDateString('ja-JP')}</span>
              <span>更新: {new Date(selectedSnippet.updated_at).toLocaleDateString('ja-JP')}</span>
            </div>
          </>
        )}
      </div>

      {/* モーダル */}
      {showModal && (
        <SnippetModal
          snippet={modalSnippet as Snippet | null}
          onSave={handleSave}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
