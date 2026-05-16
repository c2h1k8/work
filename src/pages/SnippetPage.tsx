// ==================================================
// SnippetPage — コードスニペット管理（React 移行版）
// ==================================================

import { useState, useEffect, useMemo, useRef } from 'react';
import { codeToHtml } from 'shiki';
import { SearchIcon, DownloadIcon, UploadIcon } from 'lucide-react';
import { useToast } from '../components/Toast';
import { Select, type SelectOption } from '../components/Select';
import { ShortcutHelp } from '../components/ShortcutHelp';
import { Tooltip } from '../components/Tooltip';
import { getTagColor, extractExcerpt } from '../core/utils';
import { snippetDB, type Snippet } from '../db/snippet_db';
import { ActivityLogger } from '../core/activity_logger';
import { Clipboard } from '../core/clipboard';
import { FileSaver } from '../core/file_saver';
import { useIsActiveTab } from '../contexts/TabContext';
import { useThemeStore } from '../stores/theme_store';
import { useTabStore } from '../stores/tab_store';
import { searchRegistry } from '../stores/search_store';
import styles from '../styles/pages/snippet.module.css';

// ── ストレージキー ─────────────────────────────────
const KEY_SELECTED    = 'snippet_selected_id';
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

// ── 言語リスト ────────────────────────────────────
const LANGUAGES = [
  '', 'sql', 'javascript', 'typescript', 'python', 'bash', 'shell',
  'java', 'go', 'rust', 'yaml', 'json', 'xml', 'html', 'css', 'markdown', 'text',
];

const LANG_OPTIONS: SelectOption[] = LANGUAGES.map(l => ({ value: l, label: l || 'すべての言語' }));

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
    const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<pre><code>${escaped}</code></pre>`;
  }
}

// ── 日時フォーマット ──────────────────────────────
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const y  = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  const h  = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${y}/${mo}/${da} ${h}:${mi}`;
}

// ── 検索抜粋生成 ──────────────────────────────────
// ================================================================
// タグバッジ（ハッシュカラー）
// ================================================================
function TagBadge({ tag, small = false }: { tag: string; small?: boolean }) {
  const color = getTagColor(tag);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap',
      padding: small ? '1px 6px' : '2px 7px',
      borderRadius: 'var(--radius-sm)',
      fontSize: small ? '10px' : '11px',
      backgroundColor: color + '22',
      color,
      border: `1px solid ${color}44`,
    }}>
      {tag}
    </span>
  );
}

// ================================================================
// コードビューワー
// ================================================================
function CodeView({ code, language, theme }: { code: string; language: string; theme: string }) {
  const [html, setHtml] = useState('');

  useEffect(() => {
    let cancelled = false;
    setHtml('');
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
// タグ入力（オートコンプリート付き）
// ================================================================
function TagInput({ value, onChange, allTags }: { value: string; onChange: (v: string) => void; allTags: string[] }) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [activeIdx, setActiveIdx]     = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef  = useRef<HTMLDivElement>(null);

  const updateSuggestions = (v: string) => {
    const parts = v.split(',');
    const last  = parts[parts.length - 1].trim();
    const used  = new Set(parts.slice(0, -1).map(p => p.trim()).filter(Boolean));
    setSuggestions(
      last ? allTags.filter(t => t.toLowerCase().startsWith(last.toLowerCase()) && !used.has(t)).slice(0, 6) : []
    );
    setActiveIdx(-1);
  };

  const handleChange = (v: string) => {
    onChange(v);
    updateSuggestions(v);
  };

  const selectTag = (tag: string) => {
    const parts = value.split(',');
    parts[parts.length - 1] = ' ' + tag;
    onChange(parts.join(',') + ', ');
    setSuggestions([]);
    setActiveIdx(-1);
    setTimeout(() => {
      const el = inputRef.current;
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!suggestions.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, -1)); }
    else if ((e.key === 'Enter' || e.key === 'Tab') && activeIdx >= 0) { e.preventDefault(); selectTag(suggestions[activeIdx]); }
    else if (e.key === 'Escape') {
      // サジェスト表示中は候補を閉じるだけ（モーダルは閉じない）
      e.preventDefault();
      e.stopPropagation();
      setSuggestions([]);
    }
  };

  // サジェスト外クリックで閉じる
  useEffect(() => {
    if (!suggestions.length) return;
    const handler = (e: MouseEvent) => {
      if (!inputRef.current?.contains(e.target as Node) && !dropRef.current?.contains(e.target as Node)) {
        setSuggestions([]);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [suggestions.length]);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="tag1, tag2"
        className={styles['form-input']}
        autoComplete="off"
      />
      {suggestions.length > 0 && (
        <div
          ref={dropRef}
          className="absolute z-20 left-0 right-0 top-full mt-0.5 bg-[var(--c-bg)] border border-[var(--c-border)] rounded-lg shadow-lg overflow-hidden"
        >
          {suggestions.map((tag, i) => (
            <div
              key={tag}
              onMouseDown={e => { e.preventDefault(); selectTag(tag); }}
              className={`px-3 py-1.5 text-xs cursor-pointer flex items-center gap-2 transition-colors ${i === activeIdx ? 'bg-[var(--c-accent)]/10 text-[var(--c-accent)]' : 'hover:bg-[var(--c-bg-2)]'}`}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getTagColor(tag) }} />
              {tag}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ================================================================
// スニペット追加/編集モーダル（X ボタンなし・キャンセルボタンのみ）
// ================================================================
interface SnippetModalProps {
  snippet: Snippet | null;
  allTags: string[];
  onSave: (data: Omit<Snippet, 'id' | 'created_at' | 'updated_at' | 'position'>) => void;
  onClose: () => void;
}

function SnippetModal({ snippet, allTags, onSave, onClose }: SnippetModalProps) {
  const [title, setTitle]      = useState(snippet?.title || '');
  const [language, setLang]    = useState(snippet?.language || '');
  const [tags, setTags]        = useState((snippet?.tags || []).join(', '));
  const [description, setDesc] = useState(snippet?.description || '');
  const [code, setCode]        = useState(snippet?.code || '');
  const { error: showError }   = useToast();
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => { titleRef.current?.focus(); }, []);

  const handleSubmit = () => {
    if (!title.trim()) { showError('タイトルを入力してください'); titleRef.current?.focus(); return; }
    if (!code.trim())  { showError('コードを入力してください'); return; }
    const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
    onSave({ title: title.trim(), language: language.trim(), tags: tagList, description: description.trim(), code });
  };

  // Escape でモーダルを閉じる（TagInput 内で stopPropagation 済みのため競合しない）
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleSubmit();
  };

  return (
    <div className={styles['modal-backdrop']} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles['modal-panel']} onKeyDown={handleKeyDown}>
        <div className={styles['modal-header']}>
          <h2 className={styles['modal-title']}>{snippet ? 'スニペットを編集' : '新しいスニペット'}</h2>
        </div>
        <div className={styles['modal-body']}>
          <div className={`${styles['form-row']} ${styles['form-row--2col']}`}>
            <div className={styles['form-row']}>
              <label className={styles['form-label']}>タイトル <span className={styles['required']}>*</span></label>
              <input
                ref={titleRef}
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className={styles['form-input']}
              />
            </div>
            <div className={styles['form-row']}>
              <label className={styles['form-label']}>言語</label>
              <Select options={LANG_OPTIONS} value={language} onChange={setLang} placeholder="言語を選択" />
            </div>
          </div>
          <div className={styles['form-row']}>
            <label className={styles['form-label']}>タグ（カンマ区切り）</label>
            <TagInput value={tags} onChange={setTags} allTags={allTags} />
          </div>
          <div className={styles['form-row']}>
            <label className={styles['form-label']}>説明</label>
            <input
              type="text"
              value={description}
              onChange={e => setDesc(e.target.value)}
              className={styles['form-input']}
            />
          </div>
          <div className={styles['form-row']} style={{ flex: 1 }}>
            <label className={styles['form-label']}>コード <span className={styles['required']}>*</span></label>
            <textarea
              value={code}
              onChange={e => setCode(e.target.value)}
              className={`${styles['form-input']} ${styles['form-code-textarea']}`}
              spellCheck={false}
            />
          </div>
        </div>
        <div className={styles['modal-footer']}>
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
  const isActive = useIsActiveTab();
  const theme    = useThemeStore(s => s.theme);
  const { config: tabConfig, setActiveTab } = useTabStore();

  const [snippets, setSnippets]     = useState<Snippet[]>([]);
  const [selectedId, setSelected]   = useState<number | null>(null);
  const [search, setSearch]         = useState(() => localStorage.getItem(KEY_SEARCH) || '');
  const [filterLang, setFilterLang] = useState(() => localStorage.getItem(KEY_FILTER_LANG) || '');
  const [filterTag, setFilterTag]   = useState(() => localStorage.getItem(KEY_FILTER_TAG) || '');
  const [modalSnippet, setModal]    = useState<Snippet | null>(null);
  const [showModal, setShowModal]   = useState(false);
  const searchRef     = useRef<HTMLInputElement>(null);

  // 初回ロード
  useEffect(() => {
    snippetDB.getAllSnippets().then(all => {
      setSnippets(all);

      // 保存されたフィルタ値が現在のスニペットに存在しない場合はリセット
      const langs = new Set(all.map(s => s.language).filter(Boolean));
      const storedLang = localStorage.getItem(KEY_FILTER_LANG) || '';
      if (storedLang && !langs.has(storedLang)) {
        setFilterLang('');
        localStorage.removeItem(KEY_FILTER_LANG);
      }
      const tagSet = new Set(all.flatMap(s => s.tags || []));
      const storedTag = localStorage.getItem(KEY_FILTER_TAG) || '';
      if (storedTag && !tagSet.has(storedTag)) {
        setFilterTag('');
        localStorage.removeItem(KEY_FILTER_TAG);
      }

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

  const langOptions: SelectOption[] = useMemo(() => [
    { value: '', label: 'すべての言語' },
    ...allLangs.map(l => ({ value: l, label: l })),
  ], [allLangs]);

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
    if (modalSnippet) {
      const updated = { ...modalSnippet, ...data, updated_at: now };
      await snippetDB.updateSnippet(updated);
      setSnippets(prev => prev.map(s => s.id === updated.id ? updated : s));
      ActivityLogger.log('snippet', 'update', 'snippet', updated.id!, `スニペット「${updated.title}」を更新`);
      success('スニペットを更新しました');
    } else {
      const added = await snippetDB.addSnippet({ ...data, created_at: now, updated_at: now, position: snippets.length });
      setSnippets(prev => [...prev, added]);
      setSelected(added.id!);
      localStorage.setItem(KEY_SELECTED, String(added.id));
      // 追加したスニペットが現在のフィルタに一致しない場合はフィルタをクリアして表示する
      if (filterLang && added.language !== filterLang) {
        setFilterLang('');
        localStorage.removeItem(KEY_FILTER_LANG);
      }
      if (filterTag && !(added.tags || []).includes(filterTag)) {
        setFilterTag('');
        localStorage.removeItem(KEY_FILTER_TAG);
      }
      ActivityLogger.log('snippet', 'create', 'snippet', added.id!, `スニペット「${added.title}」を追加`);
      success('スニペットを追加しました');
    }
    setShowModal(false);
  };

  const handleDelete = async (s: Snippet) => {
    if (!confirm(`「${s.title}」を削除しますか？`)) return;
    ActivityLogger.log('snippet', 'delete', 'snippet', s.id!, `スニペット「${s.title}」を削除`);
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
    try {
      const data = await snippetDB.exportAll();
      const json = JSON.stringify(data, null, 2);
      const saved = await FileSaver.save(json, `snippets_${new Date().toISOString().slice(0, 10)}.json`);
      if (saved) success('エクスポートしました');
    } catch { showError('エクスポートに失敗しました'); }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const replace = confirm('既存のスニペットをすべて削除してインポートしますか？\n「キャンセル」を押すと追記インポートします。');
      const count = await snippetDB.importAll(data, replace);
      setSnippets(await snippetDB.getAllSnippets());
      success(`${count} 件をインポートしました`);
    } catch { showError('インポートに失敗しました'); }
    e.target.value = '';
  };

  // グローバル検索登録
  useEffect(() => {
    const snippetLabel = tabConfig.find(t => t.pageSrc === 'pages/snippet.html')?.label ?? '';
    searchRegistry.register('snippet', async (query) => {
      const q   = query.toLowerCase();
      const all = await snippetDB.getAllSnippets();
      return all
        .filter(s =>
          s.title?.toLowerCase().includes(q) ||
          s.description?.toLowerCase().includes(q) ||
          s.code?.toLowerCase().includes(q)
        )
        .slice(0, 10)
        .map(s => ({
          id: `snippet-${s.id}`,
          pageSrc: 'pages/snippet.html',
          title: s.title,
          excerpt: s.description?.toLowerCase().includes(q)
            ? extractExcerpt(s.description, query)
            : extractExcerpt(s.code, query),
          onSelect: () => {
            if (snippetLabel) setActiveTab(snippetLabel);
            handleSelect(s.id!);
          },
        }));
    });
    return () => searchRegistry.unregister('snippet');
  }, [tabConfig, setActiveTab]);

  // キーボードショートカット
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!isActive || showModal) return;
      const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as Element).tagName) || (e.target as HTMLElement).isContentEditable;
      if (e.key === 'Escape' && isInput) { (e.target as HTMLElement).blur(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); searchRef.current?.focus(); return; }
      if (isInput) return;
      if (e.key === 'n') { e.preventDefault(); openNew(); return; }
      if (e.key === 'Enter' && selectedSnippet) { e.preventDefault(); handleCopy(selectedSnippet); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const idx = filtered.findIndex(s => s.id === selectedId);
        const next = e.key === 'ArrowDown' ? idx + 1 : idx - 1;
        if (next >= 0 && next < filtered.length) {
          const nextId = filtered[next].id!;
          handleSelect(nextId);
          document.querySelector(`[data-snippet-id="${nextId}"]`)?.scrollIntoView({ block: 'nearest' });
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [showModal, filtered, selectedId, selectedSnippet, isActive]);

  return (
    <div className="flex h-full overflow-hidden">
      {/* 左パネル */}
      <div className="w-[300px] flex flex-col border-r border-[var(--c-border)] shrink-0 bg-[var(--c-surface)]">
        {/* 検索・フィルター */}
        <div className="p-3 flex flex-col gap-2 border-b border-[var(--c-border)]">
          <div className="flex gap-2">
            <div className="relative flex-1 min-w-0">
              <SearchIcon size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--c-text-3)] pointer-events-none" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={e => handleSearch(e.target.value)}
                placeholder="検索… (Ctrl+F)"
                className="w-full pl-7 pr-3 py-1.5 text-xs rounded-lg border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-text)] focus:outline-none focus:border-[var(--c-accent)] focus:shadow-[0_0_0_3px_var(--c-accent-dim)] transition-[border-color,box-shadow]"
              />
            </div>
            <Tooltip content="新規追加 (N)">
              <button onClick={openNew} className="btn btn--primary btn--sm text-xs px-2 shrink-0">+</button>
            </Tooltip>
          </div>
          {/* 言語フィルター */}
          <Select options={langOptions} value={filterLang} onChange={handleLangFilter} placeholder="すべての言語" />
          {/* タグフィルター（ハッシュカラー付き） */}
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {allTags.map(tag => {
                const color   = getTagColor(tag);
                const active  = filterTag === tag;
                return (
                  <button
                    key={tag}
                    onClick={() => handleTagFilter(tag)}
                    className="text-xs px-2 py-0.5 rounded-full border transition-colors font-medium"
                    style={active
                      ? { backgroundColor: color + '33', color, borderColor: color }
                      : { backgroundColor: 'transparent', color, borderColor: color + '66' }
                    }
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          )}
          <div className="text-xs text-[var(--c-text-3)]">{filtered.length} 件</div>
        </div>

        {/* スニペット一覧 */}
        <div className="flex-1 overflow-auto">
          {filtered.length === 0 ? (
            <div className={styles['snippet-list__empty']}>スニペットが見つかりません</div>
          ) : (
            filtered.map(s => (
              <div
                key={s.id}
                data-snippet-id={s.id}
                tabIndex={0}
                onClick={() => handleSelect(s.id!)}
                onKeyDown={e => e.key === 'Enter' && handleSelect(s.id!)}
                className={`${styles['snippet-item']}${selectedId === s.id ? ' ' + styles['snippet-item--active'] : ''}`}
              >
                <div className={styles['snippet-item__header']}>
                  <span className={styles['snippet-item__title']}>{s.title}</span>
                  {s.language && (
                    <span
                      className={styles['lang-badge']}
                      style={{ '--lang-color': getLangColor(s.language) } as React.CSSProperties}
                    >
                      {s.language}
                    </span>
                  )}
                </div>
                {s.description && <div className={styles['snippet-item__desc']}>{s.description}</div>}
                {(s.tags || []).length > 0 && (
                  <div className={styles['snippet-item__tags']}>
                    {s.tags.map(t => <TagBadge key={t} tag={t} small />)}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* フッター: エクスポート・インポート アイコンボタン */}
        <div className="px-2 py-1.5 border-t border-[var(--c-border)] flex justify-end gap-0.5">
          <Tooltip content="エクスポート">
            <button
              onClick={handleExport}
              className="p-1.5 rounded-lg text-[var(--c-text-3)] hover:text-[var(--c-text)] hover:bg-[var(--c-bg-2)] transition-colors"
            >
              <DownloadIcon size={14} />
            </button>
          </Tooltip>
          <Tooltip content="インポート">
            <label className="p-1.5 rounded-lg text-[var(--c-text-3)] hover:text-[var(--c-text)] hover:bg-[var(--c-bg-2)] transition-colors cursor-pointer">
              <UploadIcon size={14} />
              <input type="file" accept=".json" className="hidden" onChange={handleImportFile} />
            </label>
          </Tooltip>
        </div>
      </div>

      {/* 右パネル（詳細） */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedSnippet ? (
          <div className="flex-1 flex flex-col items-center justify-center text-[var(--c-text-3)] gap-3">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="48" height="48" style={{ opacity: 0.35 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5"/>
            </svg>
            <p className="text-sm">左のリストからスニペットを選択してください</p>
          </div>
        ) : (
          <>
            {/* ヘッダー */}
            <div className={styles['snippet-detail__header']}>
              <div className={styles['snippet-detail__title-row']}>
                <h2 className={styles['snippet-detail__title']}>{selectedSnippet.title}</h2>
                {selectedSnippet.language && (
                  <span
                    className={styles['lang-badge']}
                    style={{ '--lang-color': getLangColor(selectedSnippet.language) } as React.CSSProperties}
                  >
                    {selectedSnippet.language}
                  </span>
                )}
              </div>
              {(selectedSnippet.tags || []).length > 0 && (
                <div className={styles['snippet-detail__tags']}>
                  {selectedSnippet.tags.map(t => <TagBadge key={t} tag={t} />)}
                </div>
              )}
              <div className={styles['snippet-detail__actions']}>
                <button onClick={() => handleCopy(selectedSnippet)} className="btn btn--primary btn--sm text-xs">
                  コピー (Enter)
                </button>
                <button onClick={() => openEdit(selectedSnippet)} className="btn btn--ghost btn--sm text-xs">編集</button>
                <button
                  onClick={() => handleDelete(selectedSnippet)}
                  className="btn btn--ghost btn--sm text-xs"
                  style={{ color: 'var(--c-danger)' }}
                >
                  削除
                </button>
              </div>
            </div>
            {/* 説明 */}
            {selectedSnippet.description && (
              <div className={styles['snippet-detail__desc']}>{selectedSnippet.description}</div>
            )}
            {/* コード */}
            <div className={styles['snippet-detail__code']}>
              <CodeView code={selectedSnippet.code} language={selectedSnippet.language} theme={theme} />
            </div>
            {/* メタ: 更新日時のみ表示、作成日はツールチップ */}
            <div className={styles['snippet-detail__meta']}>
              <Tooltip content={`作成: ${formatDateTime(selectedSnippet.created_at)}`}>
                <span>更新: {formatDateTime(selectedSnippet.updated_at)}</span>
              </Tooltip>
            </div>
          </>
        )}
      </div>

      {/* モーダル */}
      {showModal && (
        <SnippetModal
          snippet={modalSnippet}
          allTags={allTags}
          onSave={handleSave}
          onClose={() => setShowModal(false)}
        />
      )}

      {/* ショートカットヘルプ */}
      <ShortcutHelp categories={[
        { name: 'ショートカット', shortcuts: [
          { keys: ['N'],          description: '新規スニペット追加' },
          { keys: ['Enter'],      description: '選択中のコードをコピー' },
          { keys: ['Ctrl', 'F'],  description: '検索にフォーカス' },
          { keys: ['↑', '↓'],   description: '一覧を上下移動' },
          { keys: ['Escape'],     description: 'モーダルを閉じる' },
        ]},
      ]} />
    </div>
  );
}
