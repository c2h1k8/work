// ==================================================
// Picker — フローティング検索ピッカー（汎用）
// ==================================================
// 使用例: TODO 依存関係・関連ノート選択、Note の TODOリンク・関連ノート選択

import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

export interface PickerItem {
  id: number;
  label: string;
  sublabel?: string;
}

interface PickerProps {
  items: PickerItem[];
  x: number;
  y: number;
  placeholder?: string;
  emptyText?: string;
  onSelect: (id: number) => void;
  onClose: () => void;
}

export function Picker({
  items, x, y,
  placeholder = '検索…',
  emptyText = '候補がありません',
  onSelect, onClose,
}: PickerProps) {
  const [q, setQ] = useState('');
  const [popStyle, setPopStyle] = useState<React.CSSProperties>({ visibility: 'hidden', position: 'fixed', top: y, left: x, zIndex: 2000 });
  const popRef  = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useLayoutEffect(() => {
    if (!popRef.current) return;
    const W = 260;
    const MARGIN = 8;
    const popH = popRef.current.offsetHeight;
    const left = Math.min(x, window.innerWidth - W - MARGIN);
    const enoughBelow = y + popH + MARGIN <= window.innerHeight;
    setPopStyle({
      position: 'fixed',
      zIndex: 2000,
      width: W,
      left,
      visibility: 'visible',
      ...(enoughBelow ? { top: y } : { bottom: window.innerHeight - y + 4 }),
    });
  }, [x, y]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filtered = q
    ? items.filter((i) => i.label.toLowerCase().includes(q.toLowerCase()))
    : items;

  return createPortal(
    <>
      <div className="fixed inset-0" style={{ zIndex: 1999 }} onClick={onClose} />
      <div
        ref={popRef}
        className="rounded-xl border border-[var(--c-border)] bg-[var(--c-bg)] shadow-[var(--shadow-lg)] p-2"
        style={popStyle}
      >
        <input
          ref={inputRef}
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-text)] outline-none focus:border-[var(--c-accent)] placeholder:text-[var(--c-text-3)] transition-colors"
        />
        <ul className="mt-1.5 max-h-52 overflow-y-auto flex flex-col gap-0.5">
          {filtered.length === 0
            ? <li className="px-2 py-1.5 text-xs text-[var(--c-text-3)] text-center">{emptyText}</li>
            : filtered.map((item) => (
              <li
                key={item.id}
                onClick={() => onSelect(item.id)}
                className="px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-[var(--c-bg-2)] transition-colors"
              >
                <div className="text-xs text-[var(--c-text)] truncate">{item.label}</div>
                {item.sublabel && (
                  <div className="text-[10px] text-[var(--c-text-3)] truncate">{item.sublabel}</div>
                )}
              </li>
            ))
          }
        </ul>
      </div>
    </>,
    document.body,
  );
}
