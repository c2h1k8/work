// DatePicker — 統合日付選択コンポーネント
// 自己完結モード（open prop なし）: トリガーボタン + インラインドロップダウン
// 外部制御モード（open prop あり）: createPortal でモーダル表示、決定ボタンで確定
//
// 使い方（自己完結）:
//   <DatePicker value={dueDate} onChange={setDueDate} onClear={() => setDueDate('')} />
// 使い方（外部制御）:
//   <DatePicker open={isOpen} value={date} onChange={setDate} onClear={clearDate} onClose={close} />

import '../styles/components/date-picker.css';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, XIcon } from 'lucide-react';

export interface DatePickerProps {
  /** 選択中の日付（YYYY-MM-DD 形式 or ''） */
  value: string;
  /** 日付確定時のコールバック */
  onChange: (date: string) => void;
  /** クリア時のコールバック */
  onClear: () => void;
  /** 時刻選択を表示するか（外部制御モードのみ有効） */
  showTime?: boolean;

  // ── 自己完結モード専用 ──
  /** トリガーボタンの表示テキスト（省略時は value をフォーマット） */
  displayText?: string;
  /** 期日ステータスに応じたスタイル */
  status?: '' | 'overdue' | 'today' | 'normal';
  /** 未選択時のプレースホルダー */
  placeholder?: string;
  /** ラッパーに追加する className */
  className?: string;
  /** 完了カラムなど変更不可の場合に true */
  disabled?: boolean;

  // ── 外部制御モード専用 ──
  /** true のとき表示。undefined のとき自己完結モードになる */
  open?: boolean;
  /** モーダルを閉じるコールバック */
  onClose?: () => void;
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

  // 固定祝日
  add(1, 1); add(2, 11);
  if (year >= 2020) add(2, 23);
  add(4, 29); add(5, 3); add(5, 4); add(5, 5);
  if (year >= 2016) add(8, 11);
  add(11, 3); add(11, 23);

  // ハッピーマンデー
  add(1,  nthWeekday(1,  2));
  add(7,  nthWeekday(7,  3));
  add(9,  nthWeekday(9,  3));
  add(10, nthWeekday(10, 2));

  // 春分・秋分（近似式）
  const i = year - 1980;
  const vernal   = Math.floor(20.8431 + 0.242194 * i - Math.floor(i / 4));
  const autumnal = Math.floor(23.2488 + 0.242194 * i - Math.floor(i / 4));
  add(3, vernal); add(9, autumnal);

  // 国民の休日（敬老の日と秋分の日に挟まれた平日）
  const agingDay = nthWeekday(9, 3);
  if (autumnal - agingDay === 2) {
    const midDay = agingDay + 1;
    if (new Date(year, 8, midDay).getDay() !== 0) add(9, midDay);
  }

  // 振替休日
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

function parseDate(iso: string) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return { year: y, month: m, day: d };
}

function formatDisplay(iso: string): string {
  const p = parseDate(iso);
  if (!p) return '';
  return `${p.year}/${p.month}/${p.day}`;
}

// --------------------------------------------------
// カレンダーグリッド（祝日対応）
// --------------------------------------------------
interface GridProps {
  year: number;
  month: number;
  /** 選択済み YYYY-MM-DD（自己完結モードでは value、外部モードでは内部 selected） */
  selected: string;
  holidays: Set<string>; // MM-DD 形式
  onPick: (iso: string) => void;
}

function CalendarGrid({ year, month, selected, holidays, onPick }: GridProps) {
  const today = todayStr();
  const pad = (n: number) => String(n).padStart(2, '0');

  const firstDow   = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const prevDays   = new Date(year, month - 1, 0).getDate();

  // 曜日ヘッダー
  const headers = WEEKDAYS.map((w, i) => (
    <span key={`wk-${w}`} className={`dp-weekday${i === 0 ? ' is-sun' : i === 6 ? ' is-sat' : ''}`}>{w}</span>
  ));

  // 前月（薄表示）
  const prevCells = Array.from({ length: firstDow }, (_, i) => {
    const d = prevDays - (firstDow - 1 - i);
    const m = month === 1 ? 12 : month - 1;
    const y = month === 1 ? year - 1 : year;
    return (
      <button key={`p${i}`} type="button" className="dp-day is-other"
        onClick={() => onPick(`${y}-${pad(m)}-${pad(d)}`)}>
        {d}
      </button>
    );
  });

  // 当月
  const curCells = Array.from({ length: daysInMonth }, (_, idx) => {
    const d   = idx + 1;
    const dow = (firstDow + idx) % 7;
    const iso = `${year}-${pad(month)}-${pad(d)}`;
    const mmdd = `${pad(month)}-${pad(d)}`;
    const isHoliday = holidays.has(mmdd);
    return (
      <button
        key={iso}
        type="button"
        className={[
          'dp-day',
          iso === selected ? 'is-selected' : '',
          iso === today    ? 'is-today'    : '',
          dow === 0 || isHoliday ? 'is-sun' : '',
          dow === 6               ? 'is-sat' : '',
        ].filter(Boolean).join(' ')}
        onClick={() => onPick(iso)}
        aria-label={iso}
        aria-selected={iso === selected}
      >
        {d}
      </button>
    );
  });

  // 次月（42マス埋め）
  const nextCount = 42 - firstDow - daysInMonth;
  const nextCells = Array.from({ length: nextCount }, (_, i) => {
    const d = i + 1;
    const m = month === 12 ? 1 : month + 1;
    const y = month === 12 ? year + 1 : year;
    return (
      <button key={`n${i}`} type="button" className="dp-day is-other"
        onClick={() => onPick(`${y}-${pad(m)}-${pad(d)}`)}>
        {d}
      </button>
    );
  });

  return (
    <div className="dp-grid">
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
  open: externalOpen,
  onClose,
}: DatePickerProps) {
  const isExternalMode = externalOpen !== undefined;

  // 自己完結モード用の開閉状態
  const [internalOpen, setInternalOpen] = useState(false);

  // カレンダー表示月
  const initParsed = useMemo(() => parseDate(value), [value]);
  const [viewYear,  setViewYear]  = useState(() => initParsed?.year  ?? new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => initParsed?.month ?? new Date().getMonth() + 1);

  // 外部制御モード用：内部選択（確定前のハイライト）
  const [pendingDate, setPendingDate] = useState(value);
  const [hour,   setHour]   = useState(0);
  const [minute, setMinute] = useState(0);

  // 祝日キャッシュ
  const [holidays, setHolidays] = useState<Set<string>>(() => computeHolidays(viewYear));
  const cachedYearRef = useRef(viewYear);

  const refreshHolidays = useCallback((y: number) => {
    if (cachedYearRef.current !== y) {
      setHolidays(computeHolidays(y));
      cachedYearRef.current = y;
    }
  }, []);

  // value が変わったら自己完結モードの表示月も追随
  useEffect(() => {
    if (isExternalMode) return;
    const p = parseDate(value);
    if (p) { setViewYear(p.year); setViewMonth(p.month); refreshHolidays(p.year); }
  }, [value, isExternalMode, refreshHolidays]);

  // 外部制御モード：open になったら内部状態を初期化
  useEffect(() => {
    if (!isExternalMode || !externalOpen) return;
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
    setViewYear(ny); setViewMonth(nm);
    setPendingDate(datePart);
    setHour(h); setMinute(m);
    refreshHolidays(ny);
  }, [isExternalMode, externalOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // 自己完結モード：外側クリックで閉じる
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isExternalMode || !internalOpen) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setInternalOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [isExternalMode, internalOpen]);

  // 月ナビ
  function prevMonth() {
    if (viewMonth === 1) { const y = viewYear - 1; setViewYear(y); setViewMonth(12); refreshHolidays(y); }
    else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 12) { const y = viewYear + 1; setViewYear(y); setViewMonth(1); refreshHolidays(y); }
    else setViewMonth((m) => m + 1);
  }

  // 自己完結モード：日付クリックで即確定
  function handlePickSelf(iso: string) {
    onChange(iso);
    setInternalOpen(false);
  }

  // 自己完結モード：今日ボタン
  function handleTodaySelf() {
    onChange(todayStr());
    setInternalOpen(false);
  }

  // 外部制御モード：ハイライト更新
  const handlePickExternal = useCallback((iso: string) => {
    setPendingDate(iso);
    const p = parseDate(iso);
    if (p) { setViewYear(p.year); setViewMonth(p.month); refreshHolidays(p.year); }
  }, [refreshHolidays]);

  // 外部制御モード：クイックボタン
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
    const pad = (n: number) => String(n).padStart(2, '0');
    const iso = `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}`;
    setPendingDate(iso);
    setViewYear(target.getFullYear());
    setViewMonth(target.getMonth() + 1);
    refreshHolidays(target.getFullYear());
  }, [refreshHolidays]);

  // 外部制御モード：確定
  const handleConfirm = useCallback(() => {
    if (!pendingDate) return;
    const pad = (n: number) => String(n).padStart(2, '0');
    if (showTime) {
      onChange(`${pendingDate}T${pad(hour)}:${pad(minute)}`);
    } else {
      onChange(pendingDate);
    }
    onClose?.();
  }, [pendingDate, showTime, hour, minute, onChange, onClose]);

  // 外部制御モード：キーボード
  useEffect(() => {
    if (!isExternalMode || !externalOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose?.(); return; }
      if (e.key === 'Enter')  { e.preventDefault(); handleConfirm(); return; }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isExternalMode, externalOpen, handleConfirm, onClose]);

  // ── 外部制御モード ──
  if (isExternalMode) {
    if (!externalOpen) return null;
    const timeStr = `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
    return createPortal(
      <div className="datepicker is-open">
        <div className="datepicker__backdrop" onClick={onClose} />
        <div className="datepicker__dialog">
          <div className="datepicker__quickbtns">
            <button type="button" onClick={() => handleQuick('today')}>今日</button>
            <button type="button" onClick={() => handleQuick('tomorrow')}>明日</button>
            <button type="button" onClick={() => handleQuick('month-end')}>月末</button>
            <button type="button" className="datepicker__btn--danger" onClick={() => { onClear(); onClose?.(); }}>クリア</button>
          </div>
          <div className="dp-header">
            <button type="button" className="dp-nav" onClick={prevMonth} aria-label="前の月">
              <ChevronLeftIcon size={14} aria-hidden="true" />
            </button>
            <span className="dp-month-label">{viewYear}年 {MONTHS[viewMonth - 1]}</span>
            <button type="button" className="dp-nav" onClick={nextMonth} aria-label="次の月">
              <ChevronRightIcon size={14} aria-hidden="true" />
            </button>
          </div>
          <CalendarGrid
            year={viewYear}
            month={viewMonth}
            selected={pendingDate}
            holidays={holidays}
            onPick={handlePickExternal}
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

  // ── 自己完結モード ──
  const btnText = displayText ?? (value ? formatDisplay(value) : placeholder);

  if (disabled) {
    return (
      <div className={`dp-wrap${className ? ` ${className}` : ''}`}>
        <div className="modal__date-picker-wrap">
          <button type="button" className="modal__date-display modal__date-display--disabled" disabled
            title="完了済みカラムでは期日を変更できません">
            <CalendarIcon size={13} aria-hidden="true" />
            <span>{btnText}</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className={`dp-wrap${className ? ` ${className}` : ''}`}>
      <div className="modal__date-picker-wrap">
        <button
          type="button"
          className={[
            'modal__date-display',
            status === 'overdue' ? 'modal__date-display--overdue' : '',
            status === 'today'   ? 'modal__date-display--today'   : '',
          ].filter(Boolean).join(' ')}
          onClick={() => setInternalOpen((o) => !o)}
          aria-haspopup="true"
          aria-expanded={internalOpen}
        >
          <CalendarIcon size={13} aria-hidden="true" />
          <span>{btnText}</span>
        </button>
        {value && (
          <button
            type="button"
            className="modal__date-clear"
            onClick={() => { onClear(); setInternalOpen(false); }}
            aria-label="期日をクリア"
          >
            <XIcon size={12} aria-hidden="true" />
          </button>
        )}
      </div>

      {internalOpen && (
        <div className="dp-popup" role="dialog" aria-label="日付を選択">
          <div className="dp-header">
            <button type="button" className="dp-nav" onClick={prevMonth} aria-label="前の月">
              <ChevronLeftIcon size={14} aria-hidden="true" />
            </button>
            <span className="dp-month-label">{viewYear}年 {MONTHS[viewMonth - 1]}</span>
            <button type="button" className="dp-nav" onClick={nextMonth} aria-label="次の月">
              <ChevronRightIcon size={14} aria-hidden="true" />
            </button>
          </div>
          <CalendarGrid
            year={viewYear}
            month={viewMonth}
            selected={value}
            holidays={holidays}
            onPick={handlePickSelf}
          />
          <div className="dp-footer">
            <button type="button" className="dp-today-btn" onClick={handleTodaySelf}>
              今日
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
