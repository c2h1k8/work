// ==================================================
// GlobalSearch: グローバル検索バー
// ==================================================
// Ctrl+K でフォーカス。タブ名をインクリメンタル検索する。
// Phase 4 以降でページ内コンテンツ検索を追加予定。

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTabStore } from '../../stores/tab_store';
import type { TabConfig } from '../../constants/tabs';

const isMac = (() => {
  const p =
    (navigator as Navigator & { userAgentData?: { platform: string } }).userAgentData?.platform ??
    navigator.platform ?? '';
  return p ? /mac/i.test(p) : /Macintosh|Mac OS X/i.test(navigator.userAgent);
})();

interface SearchResult {
  type: 'tab';
  label: string;
  icon: string;
  tab: TabConfig;
}

export function GlobalSearch() {
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState<SearchResult[]>([]);
  const [focusIdx, setFocusIdx] = useState(-1);
  const [open, setOpen]         = useState(false);
  const inputRef  = useRef<HTMLInputElement>(null);
  const wrapRef   = useRef<HTMLDivElement>(null);

  const { config, setActiveTab } = useTabStore();

  // クエリに応じてタブ候補を検索
  const search = useCallback((q: string) => {
    if (!q.trim()) { setResults([]); setOpen(false); return; }
    const lower = q.toLowerCase();
    const matched: SearchResult[] = config
      .filter((t) => t.visible && t.label.toLowerCase().includes(lower))
      .map((t) => ({ type: 'tab', label: t.label, icon: t.icon, tab: t }));
    setResults(matched);
    setOpen(matched.length > 0);
    setFocusIdx(-1);
  }, [config]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setQuery(q);
    search(q);
  }, [search]);

  const handleSelect = useCallback((result: SearchResult) => {
    setActiveTab(result.label);
    setQuery('');
    setResults([]);
    setOpen(false);
    inputRef.current?.blur();
  }, [setActiveTab]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      if (focusIdx >= 0 && results[focusIdx]) {
        handleSelect(results[focusIdx]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
      inputRef.current?.blur();
    }
  }, [open, results, focusIdx, handleSelect]);

  // Ctrl+K でフォーカス
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // 外部クリックで閉じる
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [open]);

  return (
    <div ref={wrapRef} className="global-search" id="global-search-wrap">
      <svg className="global-search__icon" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z" />
      </svg>
      <input
        ref={inputRef}
        id="global-search-input"
        className="global-search__input"
        type="text"
        placeholder={`検索 (${isMac ? '⌘' : 'Ctrl'}+K)`}
        autoComplete="off"
        aria-label="全ページを検索"
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onFocus={() => query && setOpen(results.length > 0)}
      />
      <span className="global-search__kbd">{isMac ? '⌘K' : 'Ctrl+K'}</span>
      {open && results.length > 0 && (
        <div className="global-search__results" id="global-search-results">
          {results.map((r, i) => (
            <button
              key={r.label}
              type="button"
              className={`global-search__item${i === focusIdx ? ' global-search__item--focused' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(r); }}
            >
              <span
                className="global-search__item-icon"
                dangerouslySetInnerHTML={{ __html: r.icon }}
              />
              <span className="global-search__item-label">{r.label}</span>
              <span className="global-search__item-type">タブ</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
