// ==================================================
// LabelFilter: 汎用ラベルフィルタードロップダウン
// ==================================================
// 使い方:
//   <LabelFilter
//     items={[{ id: 1, name: 'バグ', color: '#f85149' }]}
//     selected={new Set([1])}
//     label="ラベル"
//     onChange={(selected: Set<number>) => void}
//   />

import { useCallback, useEffect, useRef, useState } from 'react';

export interface LabelFilterItem {
  id: number | string;
  name: string;
  color?: string;
}

interface LabelFilterProps {
  items: LabelFilterItem[];
  selected: Set<number | string>;
  label?: string;
  onChange: (selected: Set<number | string>) => void;
}

const DEFAULT_ICON = (
  <svg viewBox="0 0 16 16" aria-hidden="true" width="12" height="12" fill="currentColor">
    <path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h11A1.5 1.5 0 0 1 15 2.5v1.586a1.5 1.5 0 0 1-.44 1.06L10.5 9.207V13.5a.75.75 0 0 1-.375.65l-3 1.75A.75.75 0 0 1 6 15.25V9.207L1.44 5.146A1.5 1.5 0 0 1 1 4.086Zm1.5 0v1.586l4.56 4.061a.75.75 0 0 1 .24.544v5.338l1.5-.875V8.69a.75.75 0 0 1 .24-.544L13.5 4.086V2.5Z" />
  </svg>
);

export function LabelFilter({
  items,
  selected,
  label = 'ラベル',
  onChange,
}: LabelFilterProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // 外部クリックでメニューを閉じる
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [open]);

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen((v) => !v);
  }, []);

  const handleItemClick = useCallback((e: React.MouseEvent, item: LabelFilterItem) => {
    e.stopPropagation();
    const next = new Set(selected);
    if (next.has(item.id)) {
      next.delete(item.id);
    } else {
      next.add(item.id);
    }
    onChange(next);
  }, [selected, onChange]);

  const count = selected.size;
  const isActive = count > 0;

  return (
    <div ref={wrapperRef} className="lf-dropdown">
      <button
        type="button"
        className={`lf-trigger${isActive ? ' lf-trigger--active' : ''}`}
        onClick={handleToggle}
      >
        <span className="lf-trigger__icon">{DEFAULT_ICON}</span>
        <span className="lf-trigger__label">{label}</span>
        {isActive && (
          <span className="lf-trigger__count">{count}</span>
        )}
      </button>
      {open && (
        <div className="lf-menu">
          {items.length === 0 ? (
            <p className="lf-menu__empty">項目がありません</p>
          ) : (
            items.map((item) => {
              const active = selected.has(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`lf-item${active ? ' lf-item--active' : ''}`}
                  onClick={(e) => handleItemClick(e, item)}
                >
                  <span className="lf-item__check">✓</span>
                  {item.color && (
                    <span className="lf-item__dot" style={{ background: item.color }} />
                  )}
                  <span className="lf-item__name">{item.name}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
