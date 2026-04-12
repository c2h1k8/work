// ==================================================
// DatePicker: カスタムカレンダー日付選択部品
// ==================================================
// 使い方:
//   <DatePicker
//     open={true}
//     value="2025-03-15"
//     onSelect={(dateStr) => void}   // YYYY-MM-DD or YYYY-MM-DDTHH:MM
//     onClear={() => void}
//     showTime={false}
//   />

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface DatePickerProps {
  open: boolean;
  value?: string;        // YYYY-MM-DD or YYYY-MM-DDTHH:MM
  onSelect: (dateStr: string) => void;
  onClear: () => void;
  onClose?: () => void;
  showTime?: boolean;
}

// --------------------------------------------------
// 日本の祝日計算（1980〜2099年対応）
// --------------------------------------------------
function computeHolidays(year: number): Set<string> {
  const h = new Set<string>();
  const pad = (n: number) => String(n).padStart(2, '0');
  const key = (m: number, d: number) => `${pad(m)}-${pad(d)}`;
  const addKey = (m: number, d: number) => h.add(key(m, d));

  // 第 n 曜日（dow: 0=日, 1=月, ...）の日を返す
  const nthWeekday = (mon: number, n: number, dow = 1): number => {
    const firstDow = new Date(year, mon - 1, 1).getDay();
    return 1 + ((dow - firstDow + 7) % 7) + (n - 1) * 7;
  };

  // 固定祝日
  addKey(1, 1);
  addKey(2, 11);
  if (year >= 2020) addKey(2, 23);
  addKey(4, 29);
  addKey(5, 3);
  addKey(5, 4);
  addKey(5, 5);
  if (year >= 2016) addKey(8, 11);
  addKey(11, 3);
  addKey(11, 23);

  // ハッピーマンデー
  addKey(1,  nthWeekday(1,  2)); // 成人の日
  addKey(7,  nthWeekday(7,  3)); // 海の日
  addKey(9,  nthWeekday(9,  3)); // 敬老の日
  addKey(10, nthWeekday(10, 2)); // スポーツの日

  // 春分の日・秋分の日（近似式 1980〜2099年）
  const i = year - 1980;
  const vernal   = Math.floor(20.8431 + 0.242194 * i - Math.floor(i / 4));
  const autumnal = Math.floor(23.2488 + 0.242194 * i - Math.floor(i / 4));
  addKey(3, vernal);
  addKey(9, autumnal);

  // 国民の休日（敬老の日と秋分の日に挟まれた平日）
  const agingDay = nthWeekday(9, 3);
  if (autumnal - agingDay === 2) {
    const midDay = agingDay + 1;
    if (new Date(year, 8, midDay).getDay() !== 0) {
      addKey(9, midDay);
    }
  }

  // 振替休日（日曜が祝日 → 翌非祝日平日が振替）
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
// カレンダーグリッド
// --------------------------------------------------
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function CalendarGrid({
  year,
  month,
  selected,
  holidays,
  onPick,
}: {
  year: number;
  month: number;
  selected: Date | null;
  holidays: Set<string>;
  onPick: (dateStr: string) => void;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay();

  const selTime = selected ? (() => { const d = new Date(selected); d.setHours(0,0,0,0); return d.getTime(); })() : null;

  const cells: React.ReactNode[] = [];

  // 曜日ヘッダー
  for (const wd of WEEKDAYS) {
    cells.push(<div key={`wd-${wd}`} className="dp-weekday">{wd}</div>);
  }

  // 前月の空セル
  for (let i = 0; i < startDow; i++) {
    cells.push(<div key={`blank-${i}`} className="dp-day dp-day--other" />);
  }

  // 当月の日付ボタン
  for (let day = 1; day <= lastDay.getDate(); day++) {
    const date = new Date(year, month, day);
    date.setHours(0, 0, 0, 0);
    const dow  = date.getDay();
    const mm   = String(month + 1).padStart(2, '0');
    const dd   = String(day).padStart(2, '0');
    const mmdd = `${mm}-${dd}`;
    const dateStr = `${year}-${mm}-${dd}`;
    const isHoliday = holidays.has(mmdd);

    let cls = 'dp-day';
    if (dow === 0 || isHoliday) cls += ' dp-day--sunday';
    else if (dow === 6)         cls += ' dp-day--saturday';
    if (selTime !== null && date.getTime() === selTime) cls += ' dp-day--selected';
    if (date.getTime() === today.getTime()) cls += ' dp-day--today';

    cells.push(
      <button
        key={dateStr}
        type="button"
        className={cls}
        onClick={() => onPick(dateStr)}
      >
        {day}
      </button>
    );
  }

  return <div className="datepicker__grid">{cells}</div>;
}

// --------------------------------------------------
// DatePicker 本体
// --------------------------------------------------
export function DatePicker({ open, value = '', onSelect, onClear, onClose, showTime = false }: DatePickerProps) {
  const parseInitial = () => {
    let datePart = value;
    let hour = 0, minute = 0;
    if (datePart.includes('T')) {
      const [d, t] = datePart.split('T');
      datePart = d;
      const [h, m] = t.split(':').map(Number);
      hour   = isNaN(h) ? 0 : Math.max(0, Math.min(23, h));
      minute = isNaN(m) ? 0 : Math.max(0, Math.min(59, m));
    }
    let year: number, month: number, selected: Date | null;
    if (datePart) {
      const d = new Date(datePart + 'T00:00:00');
      year = d.getFullYear(); month = d.getMonth(); selected = new Date(datePart + 'T00:00:00');
    } else {
      const t = new Date();
      year = t.getFullYear(); month = t.getMonth(); selected = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    }
    return { year, month, selected, hour, minute };
  };

  const initial = parseInitial();
  const [year, setYear]       = useState(initial.year);
  const [month, setMonth]     = useState(initial.month);
  const [selected, setSelected] = useState<Date | null>(initial.selected);
  const [hour, setHour]       = useState(initial.hour);
  const [minute, setMinute]   = useState(initial.minute);
  const [holidays, setHolidays] = useState<Set<string>>(() => computeHolidays(initial.year));
  const cachedYearRef = useRef(initial.year);

  // open が変化したら状態を初期化
  useEffect(() => {
    if (!open) return;
    const init = parseInitial();
    setYear(init.year);
    setMonth(init.month);
    setSelected(init.selected);
    setHour(init.hour);
    setMinute(init.minute);
    if (cachedYearRef.current !== init.year) {
      setHolidays(computeHolidays(init.year));
      cachedYearRef.current = init.year;
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshHolidays = useCallback((y: number) => {
    if (cachedYearRef.current !== y) {
      setHolidays(computeHolidays(y));
      cachedYearRef.current = y;
    }
  }, []);

  const navigateMonth = useCallback((delta: number) => {
    setMonth((m) => {
      let nm = m + delta;
      let ny = year;
      if (nm < 0)  { nm = 11; ny = year - 1; }
      if (nm > 11) { nm = 0;  ny = year + 1; }
      if (ny !== year) { setYear(ny); refreshHolidays(ny); }
      // 選択日を同月同日にクランプ
      setSelected((sel) => {
        if (!sel) return sel;
        const maxDay = new Date(ny, nm + 1, 0).getDate();
        return new Date(ny, nm, Math.min(sel.getDate(), maxDay));
      });
      return nm;
    });
  }, [year, refreshHolidays]);

  const navigateYear = useCallback((delta: number) => {
    setYear((y) => {
      const ny = y + delta;
      refreshHolidays(ny);
      setSelected((sel) => {
        if (!sel) return sel;
        const maxDay = new Date(ny, month + 1, 0).getDate();
        return new Date(ny, month, Math.min(sel.getDate(), maxDay));
      });
      return ny;
    });
  }, [month, refreshHolidays]);

  const handlePick = useCallback((dateStr: string) => {
    setSelected(new Date(dateStr + 'T00:00:00'));
  }, []);

  const handleQuick = useCallback((action: 'today' | 'tomorrow' | 'month-end') => {
    const t = new Date();
    let target: Date;
    if (action === 'today') {
      target = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    } else if (action === 'tomorrow') {
      t.setDate(t.getDate() + 1);
      target = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    } else {
      target = new Date(t.getFullYear(), t.getMonth() + 1, 0);
    }
    setSelected(target);
    const ny = target.getFullYear();
    const nm = target.getMonth();
    setYear(ny); setMonth(nm);
    refreshHolidays(ny);
  }, [refreshHolidays]);

  const handleConfirm = useCallback(() => {
    if (selected) {
      const yr = selected.getFullYear();
      const mo = String(selected.getMonth() + 1).padStart(2, '0');
      const dy = String(selected.getDate()).padStart(2, '0');
      if (showTime) {
        const h  = String(hour).padStart(2, '0');
        const mn = String(minute).padStart(2, '0');
        onSelect(`${yr}-${mo}-${dy}T${h}:${mn}`);
      } else {
        onSelect(`${yr}-${mo}-${dy}`);
      }
    }
    onClose?.();
  }, [selected, showTime, hour, minute, onSelect, onClose]);

  const handleClear = useCallback(() => {
    onClear();
    onClose?.();
  }, [onClear, onClose]);

  // キーボードナビゲーション
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose?.(); return; }
      if (e.key === 'Enter')  { e.preventDefault(); handleConfirm(); return; }
      if (e.ctrlKey) {
        const dayDelta: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
        const delta = dayDelta[e.key];
        if (delta !== undefined) {
          e.preventDefault();
          setSelected((sel) => {
            const base = sel ? new Date(sel) : new Date(year, month, 1);
            base.setDate(base.getDate() + delta);
            const ny = base.getFullYear();
            const nm = base.getMonth();
            if (ny !== year || nm !== month) {
              setYear(ny); setMonth(nm); refreshHolidays(ny);
            }
            return new Date(base.getFullYear(), base.getMonth(), base.getDate());
          });
        }
        return;
      }
      const map: Record<string, () => void> = {
        ArrowLeft:  () => navigateMonth(-1),
        ArrowRight: () => navigateMonth(1),
        ArrowUp:    () => navigateYear(-1),
        ArrowDown:  () => navigateYear(1),
      };
      if (map[e.key]) { e.preventDefault(); map[e.key](); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, year, month, navigateMonth, navigateYear, refreshHolidays, handleConfirm, onClose]);

  // ホイールで月移動
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    navigateMonth(e.deltaY < 0 ? -1 : 1);
  }, [navigateMonth]);

  if (!open) return null;

  const timeStr = `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;

  return createPortal(
    <div className="datepicker is-open" onWheel={handleWheel}>
      <div className="datepicker__backdrop" onClick={onClose} />
      <div className="datepicker__dialog">
        <div className="datepicker__quickbtns">
          <button type="button" onClick={() => handleQuick('today')}>今日</button>
          <button type="button" onClick={() => handleQuick('tomorrow')}>明日</button>
          <button type="button" onClick={() => handleQuick('month-end')}>月末</button>
          <button type="button" className="datepicker__btn--danger" onClick={handleClear}>クリア</button>
        </div>
        <div className="datepicker__nav">
          <span>{year}年 {month + 1}月</span>
        </div>
        <CalendarGrid
          year={year}
          month={month}
          selected={selected}
          holidays={holidays}
          onPick={handlePick}
        />
        {showTime && (
          <div className="datepicker__time">
            <span className="datepicker__time-label">
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" width="13" height="13">
                <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M8 4.5V8l2.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              時刻
            </span>
            <input
              type="time"
              className="datepicker__time-input"
              value={timeStr}
              onChange={(e) => {
                const [h, m] = e.target.value.split(':').map(Number);
                setHour(isNaN(h) ? 0 : h);
                setMinute(isNaN(m) ? 0 : m);
              }}
            />
          </div>
        )}
        <div className="datepicker__footer">
          <button type="button" className="btn btn--sm btn--primary" onClick={handleConfirm}>決定</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
