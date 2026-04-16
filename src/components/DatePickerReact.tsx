// ==================================================
// DatePickerReact — React 版カスタム日付ピッカー
// ==================================================
// 使い方:
//   <DatePickerReact value={dueDate} onChange={setDueDate} onClear={() => setDueDate('')} />

import { useState, useEffect, useRef, useMemo } from 'react';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, XIcon } from 'lucide-react';

interface DatePickerReactProps {
  /** 選択中の日付（YYYY-MM-DD 形式 or ''） */
  value: string;
  /** 日付を選択したときのコールバック（YYYY-MM-DD） */
  onChange: (date: string) => void;
  /** クリアボタンを押したときのコールバック */
  onClear: () => void;
  /** ボタンに表示するラベル（省略時は value をフォーマット） */
  displayText?: string;
  /** 期日ステータスに応じたスタイル */
  status?: '' | 'overdue' | 'today' | 'normal';
  /** 未選択時のプレースホルダー */
  placeholder?: string;
  /** ボタンに追加する className */
  className?: string;
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const MONTHS   = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

/** YYYY-MM-DD → { year, month(1-12), day } */
function parseDate(iso: string) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return { year: y, month: m, day: d };
}

/** 今日の YYYY-MM-DD */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** カレンダーグリッド用セル（前月・当月・次月の日） */
interface Cell {
  day:   number;
  kind:  'prev' | 'cur' | 'next';
  iso:   string;
  dow:   number; // 0=日 6=土
}

function buildCells(year: number, month: number): Cell[] {
  const firstDow = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const prevDays    = new Date(year, month - 1, 0).getDate();

  const cells: Cell[] = [];
  const pad = (n: number) => String(n).padStart(2, '0');

  // 前月
  for (let i = firstDow - 1; i >= 0; i--) {
    const d   = prevDays - i;
    const m   = month === 1 ? 12 : month - 1;
    const y   = month === 1 ? year - 1 : year;
    const dow = (firstDow - 1 - i);
    cells.push({ day: d, kind: 'prev', iso: `${y}-${pad(m)}-${pad(d)}`, dow });
  }

  // 当月
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = (firstDow + d - 1) % 7;
    cells.push({ day: d, kind: 'cur', iso: `${year}-${pad(month)}-${pad(d)}`, dow });
  }

  // 次月（6行 × 7列 = 42 セルになるまで埋める）
  let next = 1;
  while (cells.length < 42) {
    const m   = month === 12 ? 1 : month + 1;
    const y   = month === 12 ? year + 1 : year;
    const dow = cells.length % 7;
    cells.push({ day: next, kind: 'next', iso: `${y}-${pad(m)}-${pad(next)}`, dow });
    next++;
  }

  return cells;
}

export function DatePickerReact({
  value,
  onChange,
  onClear,
  displayText,
  status = '',
  placeholder = '未設定',
  className = '',
}: DatePickerReactProps) {
  const today = todayStr();

  // カレンダーの表示月
  const [viewYear,  setViewYear]  = useState<number>(() => parseDate(value)?.year  ?? new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(() => parseDate(value)?.month ?? new Date().getMonth() + 1);
  const [open,      setOpen]      = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);

  // value が外から変わったら表示月も追随
  useEffect(() => {
    const parsed = parseDate(value);
    if (parsed) { setViewYear(parsed.year); setViewMonth(parsed.month); }
  }, [value]);

  // 外側クリックで閉じる
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const cells = useMemo(() => buildCells(viewYear, viewMonth), [viewYear, viewMonth]);

  function prevMonth() {
    if (viewMonth === 1) { setViewYear((y) => y - 1); setViewMonth(12); }
    else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 12) { setViewYear((y) => y + 1); setViewMonth(1); }
    else setViewMonth((m) => m + 1);
  }

  function goToday() {
    onChange(today);
    setOpen(false);
  }

  function select(iso: string) {
    onChange(iso);
    setOpen(false);
  }

  // ボタン表示テキスト
  const btnText = displayText ?? (value ? formatDisplay(value) : placeholder);

  return (
    <div ref={wrapRef} className={`dp-wrap${className ? ` ${className}` : ''}`}>
      {/* トリガーボタン行 */}
      <div className="modal__date-picker-wrap">
        <button
          type="button"
          className={[
            'modal__date-display',
            status === 'overdue' ? 'modal__date-display--overdue' : '',
            status === 'today'   ? 'modal__date-display--today'   : '',
          ].filter(Boolean).join(' ')}
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="true"
          aria-expanded={open}
        >
          <CalendarIcon size={13} aria-hidden="true" />
          <span>{btnText}</span>
        </button>
        {value && (
          <button
            type="button"
            className="modal__date-clear"
            onClick={() => { onClear(); setOpen(false); }}
            aria-label="期日をクリア"
          >
            <XIcon size={12} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* カレンダーポップアップ */}
      {open && (
        <div className="dp-popup" role="dialog" aria-label="日付を選択">
          {/* ヘッダー：月ナビ */}
          <div className="dp-header">
            <button type="button" className="dp-nav" onClick={prevMonth} aria-label="前の月">
              <ChevronLeftIcon size={14} aria-hidden="true" />
            </button>
            <span className="dp-month-label">{viewYear}年 {MONTHS[viewMonth - 1]}</span>
            <button type="button" className="dp-nav" onClick={nextMonth} aria-label="次の月">
              <ChevronRightIcon size={14} aria-hidden="true" />
            </button>
          </div>

          {/* 曜日ヘッダー */}
          <div className="dp-grid">
            {WEEKDAYS.map((w, i) => (
              <span
                key={w}
                className={`dp-weekday${i === 0 ? ' is-sun' : i === 6 ? ' is-sat' : ''}`}
              >{w}</span>
            ))}

            {/* 日付セル */}
            {cells.map((cell, idx) => (
              <button
                key={idx}
                type="button"
                className={[
                  'dp-day',
                  cell.kind !== 'cur'   ? 'is-other'    : '',
                  cell.iso === value    ? 'is-selected' : '',
                  cell.iso === today    ? 'is-today'    : '',
                  cell.dow === 0        ? 'is-sun'      : '',
                  cell.dow === 6        ? 'is-sat'      : '',
                ].filter(Boolean).join(' ')}
                onClick={() => select(cell.iso)}
                aria-label={cell.iso}
                aria-selected={cell.iso === value}
              >
                {cell.day}
              </button>
            ))}
          </div>

          {/* フッター */}
          <div className="dp-footer">
            <button type="button" className="dp-today-btn" onClick={goToday}>
              今日
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** YYYY-MM-DD → "YYYY/M/D" 形式 */
function formatDisplay(iso: string): string {
  const p = parseDate(iso);
  if (!p) return '';
  return `${p.year}/${p.month}/${p.day}`;
}
