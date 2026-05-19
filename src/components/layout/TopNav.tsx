// ==================================================
// TopNav: ヘッダーナビゲーション
// ==================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTabStore } from '../../stores/tab_store';
import { useThemeStore } from '../../stores/theme_store';
import { GlobalSearch } from './GlobalSearch';

// More ボタンの予約幅（実測値に近い定数）
const MORE_BTN_WIDTH = 72;
const TAB_GAP = 2;

export function TopNav() {
  const {
    config,
    activeTabId,
    setActiveTab,
    switchTabRelative,
    openSettings,
    openActivityLog,
  } = useTabStore();
  const { theme, toggle: toggleTheme } = useThemeStore();

  const visibleTabs = useMemo(() => config.filter((t) => t.visible), [config]);

  // ── overflow 計算 ──────────────────────────────────────────
  const [hiddenLabels, setHiddenLabels]   = useState<Set<string>>(new Set());
  const [moreOpen, setMoreOpen]           = useState(false);
  // ポータルドロップダウンの表示位置（viewport 座標）
  const [dropdownPos, setDropdownPos]     = useState<{ top: number; right: number }>({ top: 0, right: 0 });

  const navRef        = useRef<HTMLElement>(null);
  const moreBtnRef    = useRef<HTMLDivElement>(null);
  const dropdownRef   = useRef<HTMLDivElement>(null);
  // 画面外に配置したゴーストボタン群（幅計測専用）
  const ghostRefs     = useRef<Map<string, HTMLButtonElement>>(new Map());

  const computeOverflow = useCallback(() => {
    const nav = navRef.current;
    if (!nav || visibleTabs.length === 0) {
      setHiddenLabels((prev) => (prev.size === 0 ? prev : new Set()));
      return;
    }

    const containerWidth = nav.clientWidth;
    if (containerWidth === 0) return;

    // ゴースト要素から自然幅を取得（position:fixed で常に正確）
    const tabWidths = visibleTabs.map((t) => {
      const el = ghostRefs.current.get(t.label);
      return el ? el.getBoundingClientRect().width : 0;
    });

    if (tabWidths.some((w) => w === 0)) return; // ゴースト未マウント

    const totalWidth = tabWidths.reduce(
      (s, w, i) => s + w + (i > 0 ? TAB_GAP : 0),
      0,
    );

    const next = new Set<string>();

    if (totalWidth > containerWidth) {
      const available = containerWidth - MORE_BTN_WIDTH - TAB_GAP;
      let used = 0;
      for (let i = 0; i < visibleTabs.length; i++) {
        const w = tabWidths[i] + (i > 0 ? TAB_GAP : 0);
        if (used + w <= available) {
          used += w;
        } else {
          next.add(visibleTabs[i].label);
        }
      }

      // アクティブタブは常に表示エリアに置く
      const activeLabel = activeTabId.replace('TAB-', '');
      if (next.has(activeLabel)) {
        const displayed = visibleTabs.filter((t) => !next.has(t.label));
        const displaced  = displayed[displayed.length - 1];
        if (displaced && displaced.label !== activeLabel) {
          next.add(displaced.label);
          next.delete(activeLabel);
        }
      }
    }

    setHiddenLabels((prev) => {
      if (prev.size === next.size && [...next].every((l) => prev.has(l))) return prev;
      return next;
    });
  }, [visibleTabs, activeTabId]);

  // 初回 + リサイズで再計算
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    computeOverflow();
    const obs = new ResizeObserver(computeOverflow);
    obs.observe(nav);
    return () => obs.disconnect();
  }, [computeOverflow]);

  // More ドロップダウン外クリックで閉じる（ポータル外 = ボタンでも dropdown でもない）
  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (e: MouseEvent) => {
      const inBtn      = moreBtnRef.current?.contains(e.target as Node);
      const inDropdown = dropdownRef.current?.contains(e.target as Node);
      if (!inBtn && !inDropdown) setMoreOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMoreOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [moreOpen]);

  // ── キーボードショートカット ──────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key >= '1' && e.key <= '9') {
        const idx = parseInt(e.key, 10) - 1;
        if (idx < visibleTabs.length) { e.preventDefault(); setActiveTab(visibleTabs[idx].label); }
        return;
      }
      if (e.key === '[') { e.preventDefault(); switchTabRelative(-1); return; }
      if (e.key === ']') { e.preventDefault(); switchTabRelative(1);  return; }
      if (e.key === ',') { e.preventDefault(); openSettings(); return; }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [visibleTabs, setActiveTab, switchTabRelative, openSettings]);

  const handleTabClick = useCallback((label: string) => {
    setActiveTab(label);
    setMoreOpen(false);
  }, [setActiveTab]);

  const hiddenTabs   = visibleTabs.filter((t) =>  hiddenLabels.has(t.label));
  const hasOverflow  = hiddenTabs.length > 0;
  const activeInMore = hiddenTabs.some((t) => `TAB-${t.label}` === activeTabId);

  return (
    <header className="top-nav" role="banner">
      {/*
       * ゴースト計測コンテナ: position:fixed で画面外（left:-9999px）に配置。
       * visibility:hidden のため描画されないが幅は正確に計測できる。
       * display:none ではないので getBoundingClientRect().width が必ず取れる。
       */}
      <div className="tab-ghost" aria-hidden="true">
        {visibleTabs.map((tab) => (
          <button
            key={tab.label}
            ref={(el) => { if (el) ghostRefs.current.set(tab.label, el); else ghostRefs.current.delete(tab.label); }}
            className="tab-btn"
            tabIndex={-1}
          >
            <span dangerouslySetInnerHTML={{ __html: tab.icon }} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="top-nav__inner">
        {/* ブランド */}
        <div className="top-nav__brand">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 13.25 15H2.75A1.75 1.75 0 0 1 1 13.25Zm1.5.25v4.5h4.5V3Zm6 0v4.5h4.5V3Zm4.5 6h-4.5v4.5h4.5Zm-6 4.5V9H3v4.5Z" />
          </svg>
          <span>MyTools</span>
        </div>

        {/* タブナビ */}
        <nav ref={navRef} className="top-nav__tabs" role="tablist" aria-label="メインナビゲーション">
          {visibleTabs.map((tab) => {
            if (hiddenLabels.has(tab.label)) return null;
            const isActive = activeTabId === `TAB-${tab.label}`;
            return (
              <button
                key={tab.label}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`tab-btn${isActive ? ' tab-btn--active' : ''}`}
                onClick={() => handleTabClick(tab.label)}
              >
                <span dangerouslySetInnerHTML={{ __html: tab.icon }} />
                <span>{tab.label}</span>
              </button>
            );
          })}

          {/* More ボタン */}
          {hasOverflow && (
            <div ref={moreBtnRef} className="tab-more-wrap">
              <button
                type="button"
                className={`tab-more-btn${moreOpen ? ' tab-more-btn--open' : ''}${activeInMore ? ' tab-more-btn--active-in-more' : ''}`}
                onClick={() => {
                  if (!moreOpen && moreBtnRef.current) {
                    const r = moreBtnRef.current.getBoundingClientRect();
                    setDropdownPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
                  }
                  setMoreOpen((v) => !v);
                }}
                aria-haspopup="listbox"
                aria-expanded={moreOpen}
                title="他のタブを表示"
              >
                <span className="tab-more-dots">
                  <span /><span /><span />
                </span>
                <span className="tab-more-count">{hiddenTabs.length}</span>
              </button>
            </div>
          )}
        </nav>

        {/* アクションボタン群 */}
        <div className="top-nav__actions">
          <GlobalSearch />

          {/* テーマトグル */}
          <button type="button" className="nav-icon-btn" id="theme-toggle-btn"
            title="ダークモード切替" aria-label="テーマ切替" onClick={toggleTheme}>
            {theme === 'dark' ? (
              <svg className="icon-sun" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
            ) : (
              <svg className="icon-moon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>

          {/* アクティビティログ */}
          <button type="button" className="nav-icon-btn" id="activity-log-btn"
            title="アクティビティログ" aria-label="アクティビティログ" onClick={openActivityLog}>
            <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M1.5 1.75V13.5h13.75a.75.75 0 0 1 0 1.5H.75a.75.75 0 0 1-.75-.75V1.75a.75.75 0 0 1 1.5 0Zm14.28 2.53-5.25 5.25a.75.75 0 0 1-1.06 0L7 7.06 4.28 9.78a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042l3.25-3.25a.75.75 0 0 1 1.06 0L9 7.94l4.72-4.72a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042Z" />
            </svg>
          </button>

          {/* 設定 */}
          <button type="button" className="nav-icon-btn" title="タブ設定" aria-label="タブ設定" onClick={openSettings}>
            <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 0a8.2 8.2 0 0 1 .701.031C9.444.095 9.99.645 10.16 1.29l.288 1.107c.018.066.079.158.212.224.231.114.454.243.668.386.123.082.233.09.299.071l1.103-.303c.644-.176 1.392.021 1.82.63.27.385.506.792.704 1.218.315.675.111 1.422-.364 1.891l-.814.806c-.049.048-.098.147-.088.294.016.257.016.515 0 .772-.01.147.038.246.088.294l.814.806c.475.469.679 1.216.364 1.891a7.977 7.977 0 0 1-.704 1.217c-.428.61-1.176.807-1.82.63l-1.102-.302c-.067-.019-.177-.011-.3.071a5.909 5.909 0 0 1-.668.386c-.133.066-.194.158-.211.224l-.29 1.106c-.168.646-.715 1.196-1.458 1.26a8.006 8.006 0 0 1-1.402 0c-.743-.064-1.289-.614-1.458-1.26l-.289-1.106c-.018-.066-.079-.158-.212-.224a5.738 5.738 0 0 1-.668-.386c-.123-.082-.233-.09-.299-.071l-1.103.303c-.644.176-1.392-.021-1.82-.63a8.12 8.12 0 0 1-.704-1.218c-.315-.675-.111-1.422.363-1.891l.815-.806c.05-.048.098-.147.088-.294a6.214 6.214 0 0 1 0-.772c.01-.147-.038-.246-.088-.294l-.815-.806C.635 6.045.431 5.298.746 4.623a7.92 7.92 0 0 1 .704-1.217c.428-.61 1.176-.807 1.82-.63l1.102.302c.067.019.177.011.3-.071.214-.143.437-.272.668-.386.133-.066.194-.158.211-.224l.29-1.106C6.009.645 6.556.095 7.299.03 7.53.01 7.764 0 8 0Zm-.571 1.525c-.036.003-.108.036-.137.146l-.289 1.105c-.147.561-.549.967-.998 1.189-.173.086-.34.183-.5.29-.417.278-.97.423-1.529.27l-1.103-.303c-.109-.03-.175.016-.195.045-.22.312-.412.644-.573.99-.014.031-.021.11.059.19l.815.806c.411.406.562.957.53 1.456a4.709 4.709 0 0 0 0 .582c.032.499-.119 1.05-.53 1.456l-.815.806c-.081.08-.073.159-.059.19.162.346.353.677.573.989.02.03.085.076.195.046l1.102-.303c.56-.153 1.113-.008 1.53.27.161.107.328.204.501.29.447.222.85.629.997 1.189l.289 1.105c.029.109.101.143.137.146a6.6 6.6 0 0 0 1.142 0c.036-.003.108-.036.137-.146l.289-1.105c.147-.561.549-.967.998-1.189.173-.086.34-.183.5-.29.417-.278.97-.423 1.529-.27l1.103.303c.109.029.175-.016.195-.045.22-.313.411-.644.573-.99.014-.031.021-.11-.059-.19l-.815-.806c-.411-.406-.562-.957-.53-1.456a4.709 4.709 0 0 0 0-.582c-.032-.499.119-1.05.53-1.456l.815-.806c.081-.08.073-.159.059-.19a6.464 6.464 0 0 0-.573-.989c-.02-.03-.085-.076-.195-.046l-1.102.303c-.56.153-1.113.008-1.53-.27a4.44 4.44 0 0 0-.501-.29c-.447-.222-.85-.629-.997-1.189l-.289-1.105c-.029-.11-.101-.143-.137-.146a6.6 6.6 0 0 0-1.142 0ZM11 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM9.5 8a1.5 1.5 0 1 0-3.001.001A1.5 1.5 0 0 0 9.5 8Z" />
            </svg>
          </button>
        </div>
      </div>

      {/* ドロップダウンをポータルで body 直下に描画（overflow:hidden のクリップを回避） */}
      {moreOpen && createPortal(
        <div
          ref={dropdownRef}
          className="tab-more-dropdown"
          style={{ position: 'fixed', top: dropdownPos.top, right: dropdownPos.right }}
          role="listbox"
          aria-label="追加のタブ"
        >
          <div className="tab-more-dropdown__inner">
            {hiddenTabs.map((tab) => {
              const isActive = activeTabId === `TAB-${tab.label}`;
              return (
                <button
                  key={tab.label}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  className={`tab-more-item${isActive ? ' tab-more-item--active' : ''}`}
                  onClick={() => handleTabClick(tab.label)}
                >
                  <span className="tab-more-item__icon" dangerouslySetInnerHTML={{ __html: tab.icon }} />
                  <span className="tab-more-item__label">{tab.label}</span>
                  {isActive && <span className="tab-more-item__dot" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </header>
  );
}
