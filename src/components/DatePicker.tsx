// DatePicker — 統一日付選択コンポーネント
// トリガーボタンを内包し、クリックするとポータルでカレンダーをトリガー直下に表示。
// キーボード: ←/→ 月移動, ↑/↓ 年移動, Ctrl+←/→ ±1日, Ctrl+↑/↓ ±7日, Enter 確定, Esc 閉じる

import clsx from 'clsx';
import styles from '../styles/components/date-picker.module.css';
import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, XIcon } from 'lucide-react';

export interface DatePickerProps {
  value: string;
  onChange: (date: string) => void;
  onClear: () => void;
  showTime?: boolean;
  displayText?: string;
  status?: '' | 'overdue' | 'today' | 'normal';
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  compact?: boolean;
}

// --------------------------------------------------
// 祝日計算（1980〜2099年対応）
// --------------------------------------------------
function computeHolidays(year: number): Set<string> {
  const h = new Set<string>();
  const pad = (n: number) => String(n).padStart(2, '0');
  const key = (m: number, d: number) => `${pad(m)}-${pad(d)}`;
  const add = (m: number, d: number) => h.add(key(m, d));

  const nthWeekday = (mon: number, n: number, dow = 1): number => {
    const firstDow = new Date(year, mon - 1, 1).getDay();
    return 1 + ((dow - firstDow + 7) % 7) + (n - 1) * 7;
  };

  add(1, 1); add(2, 11);
  if (year >= 2020) add(2, 23);
  add(4, 29); add(5, 3); add(5, 4); add(5, 5);
  if (year >= 2016) add(8, 11);
  add(11, 3); add(11, 23);

  add(1,  nthWeekday(1,  2));
  add(7,  nthWeekday(7,  3));
  add(9,  nthWeekday(9,  3));
  add(10, nthWeekday(10, 2));

  const i = year - 1980;
  const vernal   = Math.floor(20.8431 + 0.242194 * i - Math.floor(i / 4));
  const autumnal = Math.floor(23.2488 + 0.242194 * i - Math.floor(i / 4));
  add(3, vernal); add(9, autumnal);

  const agingDay = nthWeekday(9, 3);
  if (autumnal - agingDay === 2) {
    const midDay = agingDay + 1;
    if (new Date(year, 8, midDay).getDay() !== 0) add(9, midDay);
  }

  const origHolidays = new Set(h);
  const toAdd: string[] = [];
  for (const mmdd of origHolidays) {
    const [m, d] = mmdd.split('-').map(Number);
    if (new Date(year, m - 1, d).getDay() !== 0) continue;
    const sub = new Date(year, m - 1, d);
    sub.setDate(sub.getDate() + 1);
    while (
      origHolidays.has(key(sub.getMonth() + 1, sub.getDate())) ||
      toAdd.includes(key(sub.getMonth() + 1, sub.getDate()))
    ) {
      sub.setDate(sub.getDate() + 1);
    }
    toAdd.push(key(sub.getMonth() + 1, sub.getDate()));
  }
  for (const k of toAdd) h.add(k);
  return h;
}

// --------------------------------------------------
// ユーティリティ
// --------------------------------------------------
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const MONTHS   = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDate(iso: string) {
  if (!iso) return null;
  const datePart = iso.includes('T') ? iso.split('T')[0] : iso;
  const [y, m, d] = datePart.split('-').map(Number);
  return { year: y, month: m, day: d };
}

function formatDisplay(iso: string): string {
  const p = parseDate(iso);
  if (!p) return '';
  return `${p.year}/${p.month}/${p.day}`;
}

// --------------------------------------------------
// カレンダーグリッド
// --------------------------------------------------
interface GridProps {
  year: number;
  month: number;
  selected: string;
  holidays: Set<string>;
  onPick: (iso: string) => void;
}

function CalendarGrid({ year, month, selected, holidays, onPick }: GridProps) {
  const today    = todayStr();
  const pad      = (n: number) => String(n).padStart(2, '0');
  const firstDow = new Date(year, month - 1, 1).getDay();
  const daysInMonth  = new Date(year, month, 0).getDate();
  const prevDays = new Date(year, month - 1, 0).getDate();

  const headers = WEEKDAYS.map((w, i) => (
    <span
      key={`wk-${w}`}
      className={clsx(styles['dp-weekday'], i === 0 && styles['is-sun'], i === 6 && styles['is-sat'])}
    >{w}</span>
  ));

  const prevCells = Array.from({ length: firstDow }, (_, i) => {
    const d = prevDays - (firstDow - 1 - i);
    const m = month === 1 ? 12 : month - 1;
    const y = month === 1 ? year - 1 : year;
    return (
      <button key={`p${i}`} type="button" className={clsx(styles['dp-day'], styles['is-other'])}
        onClick={() => onPick(`${y}-${pad(m)}-${pad(d)}`)}>
        {d}
      </button>
    );
  });

  const curCells = Array.from({ length: daysInMonth }, (_, idx) => {
    const d    = idx + 1;
    const dow  = (firstDow + idx) % 7;
    const iso  = `${year}-${pad(month)}-${pad(d)}`;
    const mmdd = `${pad(month)}-${pad(d)}`;
    const isHoliday = holidays.has(mmdd);
    return (
      <button
        key={iso}
        type="button"
        className={clsx(
          styles['dp-day'],
          iso === selected && styles['is-selected'],
          iso === today    && styles['is-today'],
          (dow === 0 || isHoliday) && styles['is-sun'],
          dow === 6                && styles['is-sat'],
        )}
        onClick={() => onPick(iso)}
        aria-label={iso}
        aria-selected={iso === selected}
      >
        {d}
      </button>
    );
  });

  const lastDow   = (firstDow + daysInMonth - 1) % 7;
  const nextCount = lastDow === 6 ? 0 : 6 - lastDow;
  const nextCells = Array.from({ length: nextCount }, (_, i) => {
    const d = i + 1;
    const m = month === 12 ? 1 : month + 1;
    const y = month === 12 ? year + 1 : year;
    return (
      <button key={`n${i}`} type="button" className={clsx(styles['dp-day'], styles['is-other'])}
        onClick={() => onPick(`${y}-${pad(m)}-${pad(d)}`)}>
        {d}
      </button>
    );
  });

  return (
    <div className={styles['dp-grid']}>
      {headers}
      {prevCells}
      {curCells}
      {nextCells}
    </div>
  );
}

// --------------------------------------------------
// DatePicker 本体
// --------------------------------------------------
export function DatePicker({
  value,
  onChange,
  onClear,
  showTime = false,
  displayText,
  status = '',
  placeholder = '未設定',
  className = '',
  disabled = false,
  compact = false,
}: DatePickerProps) {
  const [open, setOpen]             = useState(false);
  const [pendingDate, setPendingDate] = useState(() => parseDate(value) ? value.split('T')[0] : '');
  const [hour,   setHour]   = useState(0);
  const [minute, setMinute] = useState(0);

  const initParsed = useMemo(() => parseDate(value), [value]);
  const [viewYear,  setViewYear]  = useState(() => initParsed?.year  ?? new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => initParsed?.month ?? new Date().getMonth() + 1);

  const [holidays, setHolidays]   = useState<Set<string>>(() => computeHolidays(viewYear));
  const cachedYearRef = useRef(viewYear);

  const refreshHolidays = useCallback((y: number) => {
    if (cachedYearRef.current !== y) {
      setHolidays(computeHolidays(y));
      cachedYearRef.current = y;
    }
  }, []);

  // popup 位置
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({ visibility: 'hidden' });
  const triggerRef = useRef<HTMLDivElement>(null);
  const popupRef   = useRef<HTMLDivElement>(null);

  // open したら pendingDate・時刻・表示月を初期化して位置計算
  useLayoutEffect(() => {
    if (!open) return;

    // 日付・時刻初期化
    let datePart = value;
    let h = 0, m = 0;
    if (datePart.includes('T')) {
      const [d, t] = datePart.split('T');
      datePart = d;
      const [ph, pm] = t.split(':').map(Number);
      h = isNaN(ph) ? 0 : Math.max(0, Math.min(23, ph));
      m = isNaN(pm) ? 0 : Math.max(0, Math.min(59, pm));
    }
    const p = parseDate(datePart);
    const ny = p?.year  ?? new Date().getFullYear();
    const nm = p?.month ?? new Date().getMonth() + 1;
    setPendingDate(datePart || todayStr());
    setViewYear(ny); setViewMonth(nm);
    setHour(h); setMinute(m);
    refreshHolidays(ny);

    // 位置計算
    if (!triggerRef.current) return;
    const rect      = triggerRef.current.getBoundingClientRect();
    const POPUP_W   = 320;
    const POPUP_H   = 360;
    const GAP       = 4;
    const MARGIN    = 8;

    let left = rect.left;
    if (left + POPUP_W > window.innerWidth - MARGIN) {
      left = Math.max(MARGIN, window.innerWidth - POPUP_W - MARGIN);
    }

    const spaceBelow = window.innerHeight - rect.bottom - MARGIN;
    const openUp     = spaceBelow < POPUP_H && rect.top > POPUP_H;

    setPopupStyle(
      openUp
        ? { position: 'fixed', bottom: window.innerHeight - rect.top + GAP, left, zIndex: 2000 }
        : { position: 'fixed', top: rect.bottom + GAP, left, zIndex: 2000 }
    );
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // 外部クリックで閉じる
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !popupRef.current?.contains(t)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // キーボード操作
  const pendingRef  = useRef(pendingDate);
  const viewYearRef = useRef(viewYear);
  const viewMonRef  = useRef(viewMonth);
  pendingRef.current  = pendingDate;
  viewYearRef.current = viewYear;
  viewMonRef.current  = viewMonth;

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false); return; }

      // Ctrl/Meta + 矢印: 日付移動
      if (e.ctrlKey || e.metaKey) {
        const delta = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[e.key];
        if (delta !== undefined) {
          e.preventDefault();
          const base = pendingRef.current
            ? new Date(pendingRef.current + 'T00:00:00')
            : new Date(viewYearRef.current, viewMonRef.current - 1, 1);
          base.setDate(base.getDate() + delta);
          const iso = toIsoDate(base);
          setPendingDate(iso);
          setViewYear(base.getFullYear());
          setViewMonth(base.getMonth() + 1);
          refreshHolidays(base.getFullYear());
          return;
        }
      }

      // 矢印: 月・年ナビ（pending を同じ日付で追随）
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const cy = viewYearRef.current;
        const cm = viewMonRef.current;
        let ny = cy, nm = cm;
        if (e.key === 'ArrowLeft')  { nm = cm === 1  ? 12 : cm - 1; if (nm === 12) ny = cy - 1; }
        if (e.key === 'ArrowRight') { nm = cm === 12 ? 1  : cm + 1; if (nm === 1)  ny = cy + 1; }
        if (e.key === 'ArrowUp')    { ny = cy - 1; }
        if (e.key === 'ArrowDown')  { ny = cy + 1; }
        // pending を新しい月の同じ日（末日クランプ）に移動
        const p = parseDate(pendingRef.current);
        if (p) {
          const maxDay = new Date(ny, nm, 0).getDate();
          const pad = (n: number) => String(n).padStart(2, '0');
          const newIso = `${ny}-${pad(nm)}-${pad(Math.min(p.day, maxDay))}`;
          setPendingDate(newIso);
        }
        setViewYear(ny); setViewMonth(nm); refreshHolidays(ny);
      }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const d = pendingRef.current;
        if (d) confirm(d);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // 月ナビ
  function prevMonth() {
    if (viewMonth === 1) { const y = viewYear - 1; setViewYear(y); setViewMonth(12); refreshHolidays(y); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 12) { const y = viewYear + 1; setViewYear(y); setViewMonth(1); refreshHolidays(y); }
    else setViewMonth(m => m + 1);
  }


  // 確定
  function confirm(date: string) {
    if (!date) return;
    const pad = (n: number) => String(n).padStart(2, '0');
    if (showTime) {
      onChange(`${date}T${pad(hour)}:${pad(minute)}`);
    } else {
      onChange(date);
    }
    setOpen(false);
  }

  // 日付クリック（showTime なら pending のみ更新、あとは即確定）
  function handlePickDay(iso: string) {
    setPendingDate(iso);
    const p = parseDate(iso);
    if (p) { setViewYear(p.year); setViewMonth(p.month); refreshHolidays(p.year); }
    if (!showTime) confirm(iso);
  }

  // クイックボタン
  function handleQuick(action: 'today' | 'tomorrow' | 'weekend') {
    const t   = new Date();
    let target: Date;
    if (action === 'today') {
      target = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    } else if (action === 'tomorrow') {
      target = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1);
    } else {
      const day = t.getDay();
      const daysToSat = day === 6 ? 0 : 6 - day;
      target = new Date(t.getFullYear(), t.getMonth(), t.getDate() + daysToSat);
    }
    const iso = toIsoDate(target);
    setPendingDate(iso);
    setViewYear(target.getFullYear());
    setViewMonth(target.getMonth() + 1);
    refreshHolidays(target.getFullYear());
  }

  // トリガーボタンの表示テキスト
  const btnText = displayText ?? (value ? formatDisplay(value) : placeholder);

  // ポップアップ
  const popup = open ? createPortal(
    <div
      ref={popupRef}
      className={styles['dp-popup']}
      role="dialog"
      aria-label="日付を選択"
      style={popupStyle}
    >
      {/* クイックボタン */}
      <div className={styles['dp-quickbtns']}>
        <button type="button" className={styles['dp-quickbtn']} onClick={() => handleQuick('today')}>今日</button>
        <button type="button" className={styles['dp-quickbtn']} onClick={() => handleQuick('tomorrow')}>明日</button>
        <button type="button" className={styles['dp-quickbtn']} onClick={() => handleQuick('weekend')}>今週末</button>
        {value && (
          <button type="button" className={clsx(styles['dp-quickbtn'], styles['dp-quickbtn--clear'])}
            onClick={() => { onClear(); setOpen(false); }}>
            クリア
          </button>
        )}
      </div>

      {/* 月ヘッダー */}
      <div className={styles['dp-header']}>
        <button type="button" className={styles['dp-nav']} onClick={prevMonth} aria-label="前の月">
          <ChevronLeftIcon size={14} aria-hidden="true" />
        </button>
        <span className={styles['dp-month-label']}>{viewYear}年 {MONTHS[viewMonth - 1]}</span>
        <button type="button" className={styles['dp-nav']} onClick={nextMonth} aria-label="次の月">
          <ChevronRightIcon size={14} aria-hidden="true" />
        </button>
      </div>

      {/* カレンダーグリッド */}
      <CalendarGrid
        year={viewYear}
        month={viewMonth}
        selected={pendingDate}
        holidays={holidays}
        onPick={handlePickDay}
      />

      {/* 時刻（showTime のみ） */}
      {showTime && (
        <>
          <div className={styles['dp-time']}>
            <span className={styles['dp-time__label']}>
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" width="13" height="13">
                <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M8 4.5V8l2.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              時刻
            </span>
            <input
              type="time"
              className={styles['dp-time__input']}
              value={`${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`}
              onChange={(e) => {
                const [h, m] = e.target.value.split(':').map(Number);
                setHour(isNaN(h) ? 0 : h);
                setMinute(isNaN(m) ? 0 : m);
              }}
            />
          </div>
          <div className={styles['dp-footer']}>
            <button type="button" className="btn btn--sm btn--primary"
              onClick={() => confirm(pendingDate)}>
              決定
            </button>
          </div>
        </>
      )}
    </div>,
    document.body,
  ) : null;

  if (disabled) {
    return (
      <div className={clsx(styles['dp-wrap'], className)}>
        <button type="button" className={clsx(styles['dp-trigger'], styles['dp-trigger--disabled'])} disabled>
          <CalendarIcon size={13} aria-hidden="true" />
          <span>{btnText}</span>
        </button>
      </div>
    );
  }

  return (
    <div ref={triggerRef} className={clsx(styles['dp-wrap'], className)}>
      <div className={styles['dp-trigger-wrap']}>
        <button
          type="button"
          className={clsx(
            styles['dp-trigger'],
            compact              && styles['dp-trigger--compact'],
            status === 'overdue' && styles['dp-trigger--overdue'],
            status === 'today'   && styles['dp-trigger--today'],
            open                 && styles['dp-trigger--open'],
          )}
          onClick={() => setOpen(o => !o)}
          aria-haspopup="true"
          aria-expanded={open}
        >
          {!compact && <CalendarIcon size={13} aria-hidden="true" />}
          <span>{btnText}</span>
        </button>
        {value && (
          <button
            type="button"
            className={styles['dp-clear']}
            onClick={() => { onClear(); setOpen(false); }}
            aria-label="期日をクリア"
          >
            <XIcon size={12} aria-hidden="true" />
          </button>
        )}
      </div>
      {popup}
    </div>
  );
}
