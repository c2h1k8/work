import clsx from 'clsx';
import styles from '../styles/components/select.module.css';
import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDownIcon } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  color?: string;
}

interface SelectProps {
  options: SelectOption[];
  className?: string;
  placeholder?: string;
  icon?: React.ReactNode;
  dropdownAlign?: 'left' | 'right';

  // 単一選択
  value?: string;
  onChange?: (value: string) => void;

  // 複数選択
  multiple?: boolean;
  values?: string[];
  onChangeMultiple?: (values: string[]) => void;
}

export function Select({
  options, className = '', placeholder, icon,
  dropdownAlign = 'left',
  value, onChange,
  multiple, values = [], onChangeMultiple,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const [dropStyle, setDropStyle] = useState<React.CSSProperties>({ visibility: 'hidden' });
  const wrapRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLUListElement>(null);

  const selected = !multiple ? options.find((o) => o.value === value) : null;

  // ドロップダウン位置をポータルで計算（overflow: hidden 親でも切れない）
  useLayoutEffect(() => {
    if (!open || !wrapRef.current) return;
    const rect    = wrapRef.current.getBoundingClientRect();
    const MARGIN  = 8;
    const MAX_H   = 224;
    const dropW   = rect.width;

    const spaceBelow = window.innerHeight - rect.bottom - MARGIN;
    const up         = spaceBelow < MAX_H && rect.top > MAX_H;
    setOpenUp(up);

    let left = dropdownAlign === 'right' ? rect.right - dropW : rect.left;
    if (left + dropW > window.innerWidth - MARGIN) left = Math.max(MARGIN, window.innerWidth - dropW - MARGIN);
    if (left < MARGIN) left = MARGIN;

    // トリガーのボーダーと接続して見せるため 1px 重ねる
    const connectedRadius = up
      ? { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottom: 'none' }
      : { borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTop: 'none' };

    setDropStyle(
      up
        ? { position: 'fixed', bottom: window.innerHeight - rect.top, left, width: dropW, zIndex: 2000, visibility: 'visible', ...connectedRadius }
        : { position: 'fixed', top: rect.bottom, left, width: dropW, zIndex: 2000, visibility: 'visible', ...connectedRadius },
    );
  }, [open, dropdownAlign]);

  // 外部クリック / スクロールで閉じる
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!wrapRef.current?.contains(t) && !dropRef.current?.contains(t)) setOpen(false);
    };
    const scroll = (e: Event) => {
      if (dropRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', scroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', scroll, { capture: true });
    };
  }, [open]);

  function handleSelect(v: string) {
    if (multiple) {
      const next = values.includes(v) ? values.filter((x) => x !== v) : [...values, v];
      onChangeMultiple?.(next);
    } else {
      onChange?.(v);
      setOpen(false);
    }
  }

  const triggerText = multiple
    ? (placeholder ?? '選択')
    : (selected?.label ?? placeholder ?? '選択');

  const dropdown = open ? createPortal(
    <ul
      ref={dropRef}
      className={styles['cs-dropdown-portal']}
      role="listbox"
      style={dropStyle}
    >
      {options.map((o) => {
        const isSelected = multiple ? values.includes(o.value) : o.value === value;
        return (
          <li
            key={o.value}
            role="option"
            aria-selected={isSelected}
            className={clsx(styles['cs-option'], isSelected && styles['cs-option--selected'])}
            onClick={() => handleSelect(o.value)}
          >
            {o.color && <span className={styles['cs-option__swatch']} style={{ background: o.color }} />}
            <span className={styles['cs-option__label']}>{o.label}</span>
          </li>
        );
      })}
    </ul>,
    document.body,
  ) : null;

  return (
    <div ref={wrapRef} className={clsx(
      styles['cs-wrapper'],
      open && styles['cs-wrapper--open'],
      open && (openUp ? styles['cs-wrapper--open-up'] : styles['cs-wrapper--open-down']),
      className,
    )}>
      <button
        type="button"
        className={clsx(styles['cs-trigger'], multiple && values.length > 0 && styles['cs-trigger--active'])}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {icon && <span className={styles['cs-trigger__icon-lead']}>{icon}</span>}
        {selected?.color && (
          <span className={styles['cs-trigger__swatch']} style={{ background: selected.color }} />
        )}
        <span className={styles['cs-trigger__text']}>{triggerText}</span>
        {multiple && values.length > 0 && (
          <span className={styles['filter-count-badge']}>{values.length}</span>
        )}
        <span className={styles['cs-trigger__icon']}>
          <ChevronDownIcon size={12} aria-hidden="true" />
        </span>
      </button>
      {dropdown}
    </div>
  );
}
