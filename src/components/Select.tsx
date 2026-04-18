import '../styles/components/select.css';
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
    <div ref={wrapRef} className={`cs-wrapper${open ? ' cs-wrapper--open' : ''} ${className}`}>
      <button
        type="button"
        className={`cs-trigger${multiple && values.length > 0 ? ' cs-trigger--active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {icon && <span className="cs-trigger__icon-lead">{icon}</span>}
        {selected?.color && (
          <span className="cs-trigger__swatch" style={{ background: selected.color }} />
        )}
        <span className="cs-trigger__text">{triggerText}</span>
        {multiple && values.length > 0 && (
          <span className="filter-count-badge">{values.length}</span>
        )}
        <span className="cs-trigger__icon">
          <ChevronDownIcon size={12} aria-hidden="true" />
        </span>
      </button>

      {open && (
        <ul className="cs-dropdown cs-dropdown--open" role="listbox">
          {options.map((o) => {
            const isSelected = multiple ? values.includes(o.value) : o.value === value;
            return (
              <li
                key={o.value}
                role="option"
                aria-selected={isSelected}
                className={`cs-option${isSelected ? ' cs-option--selected' : ''}`}
                onClick={() => handleSelect(o.value)}
              >
                {o.color && <span className="cs-option__swatch" style={{ background: o.color }} />}
                <span className="cs-option__label">{o.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
