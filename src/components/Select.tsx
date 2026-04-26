import clsx from 'clsx';
import styles from '../styles/components/select.module.css';
import { useState, useRef, useEffect } from 'react';
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
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = !multiple ? options.find((o) => o.value === value) : null;

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
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

  return (
    <div ref={wrapRef} className={clsx(styles['cs-wrapper'], open && styles['cs-wrapper--open'], className)}>
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

      {open && (
        <ul className={clsx(styles['cs-dropdown'], styles['cs-dropdown--open'], dropdownAlign === 'right' && styles['cs-dropdown--right'])} role="listbox">
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
        </ul>
      )}
    </div>
  );
}
