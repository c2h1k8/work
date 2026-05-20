// ==================================================
// TimerPage — MyTools（React 移行版）
// ==================================================

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Download, Upload, FileDown } from 'lucide-react';
import { Tooltip } from '../components/Tooltip';
import { DatePicker } from '../components/DatePicker';
import { useToast } from '../components/Toast';
import { getTagColor } from '../core/utils';
import { timerDB, type TimerPreset, type TimerSession } from '../db/timer_db';
import { useTabStore } from '../stores/tab_store';
import { searchRegistry } from '../stores/search_store';
import { ShortcutHelp } from '../components/ShortcutHelp';
import { FileSaver } from '../core/file_saver';

const TIMER_SHORTCUTS = [{
  name: 'ショートカット',
  shortcuts: [
    { keys: ['Space'], description: 'タイマー開始/停止' },
    { keys: ['R'],     description: 'タイマーリセット' },
    { keys: ['Ctrl', '←'], description: '前のプリセット' },
    { keys: ['Ctrl', '→'], description: '次のプリセット' },
  ],
}];

// ── ストレージキー ─────────────────────────────────
const KEY_ACTIVE_PRESET = 'timer_active_preset';
const KEY_HISTORY_VIEW  = 'timer_history_view';
const KEY_RUNNING_STATE = 'timer_running_state';
const KEY_DAILY_GOAL    = 'timer_daily_goal';
const KEY_CUSTOM_FROM   = 'timer_custom_from';
const KEY_CUSTOM_TO     = 'timer_custom_to';

type TimerMode   = 'work' | 'break';
type HistoryView = 'today' | 'yesterday' | 'week' | 'last-week' | 'month' | 'last-month' | 'last-7' | 'last-30' | 'quarter' | 'year' | 'custom';

// ── ユーティリティ ────────────────────────────────
function fmtMMSS(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function fmtDuration(sec: number) {
  if (sec < 60) return `${sec}秒`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}時間${m > 0 ? m + '分' : ''}`;
  return `${m}分`;
}
function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function toHHMM(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const tagColor = getTagColor;

// Tauri 環境ではネイティブウィンドウタイトルも同時に更新する
// document.title だけでは Tauri のウィンドウタイトルに反映されないため
function setWindowTitle(title: string) {
  document.title = title;
  type TauriWindow = { getCurrentWindow: () => { setTitle: (t: string) => Promise<void> } };
  const tw = (window as unknown as { __TAURI__?: { window?: TauriWindow } }).__TAURI__?.window;
  tw?.getCurrentWindow().setTitle(title).catch(() => {});
}

// macOS Dock バッジ / Windows タスクバーオーバーレイアイコンを更新する
// label: "MM:SS" 形式 → 表示、null → クリア
type TauriCore = { invoke: (cmd: string, args?: unknown) => Promise<void> };
function setTimerBadge(label: string | null) {
  const invoke = (window as unknown as { __TAURI__?: { core?: TauriCore } }).__TAURI__?.core?.invoke;
  if (!invoke) return;
  invoke('set_timer_badge', { label }).catch(() => {});
}

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

function fmtDateHeader(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}月${d.getDate()}日（${DAY_NAMES[d.getDay()]}）`;
}

// ── Web Worker インライン生成 ─────────────────────
function createTimerWorker(): Worker | null {
  try {
    const code = `
      let iid=null,startedAt=0,startRem=0;
      self.onmessage=function(e){
        if(e.data.cmd==='start'){
          if(iid)clearInterval(iid);
          startedAt=Date.now();startRem=e.data.remaining;
          iid=setInterval(function(){
            var r=Math.max(0,startRem-Math.floor((Date.now()-startedAt)/1000));
            self.postMessage({remaining:r});
            if(r<=0){clearInterval(iid);iid=null;}
          },1000);
        }else if(e.data.cmd==='stop'){if(iid){clearInterval(iid);iid=null;}}
      };`;
    const blob = new Blob([code], { type: 'application/javascript' });
    const url  = URL.createObjectURL(blob);
    const w    = new Worker(url);
    URL.revokeObjectURL(url);
    return w;
  } catch { return null; }
}

// ── AudioContext ビープ ───────────────────────────
let _audioCtx: AudioContext | null = null;
function playBeepOnce(freq = 880, dur = 0.18, offset = 0) {
  try {
    if (!_audioCtx) _audioCtx = new AudioContext();
    const osc = _audioCtx.createOscillator();
    const gain = _audioCtx.createGain();
    osc.connect(gain); gain.connect(_audioCtx.destination);
    const t = _audioCtx.currentTime + offset;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.start(t); osc.stop(t + dur + 0.05);
  } catch { /* ignore */ }
}
async function playBeep() {
  try {
    if (!_audioCtx) _audioCtx = new AudioContext();
    if (_audioCtx.state === 'suspended') await _audioCtx.resume();
  } catch { /* ignore */ }
  playBeepOnce(880, 0.18, 0.0);
  playBeepOnce(880, 0.18, 0.3);
  playBeepOnce(1047, 0.3, 0.6);
}
async function warmUpAudio() {
  try {
    if (!_audioCtx) _audioCtx = new AudioContext();
    if (_audioCtx.state === 'suspended') await _audioCtx.resume();
  } catch { /* ignore */ }
}

// ── ストリーク計算 ────────────────────────────────
function computeStreak(sessions: TimerSession[], goalSec: number): number {
  const byDate: Record<string, number> = {};
  sessions.forEach(s => { const d = s.started_at.slice(0, 10); byDate[d] = (byDate[d] || 0) + s.duration_sec; });
  const threshold = goalSec > 0 ? goalSec : 1;
  const cur = new Date();
  if ((byDate[toDateStr(cur)] || 0) < threshold) cur.setDate(cur.getDate() - 1);
  let streak = 0;
  while (streak < 1000) {
    const d = toDateStr(cur);
    if ((byDate[d] || 0) >= threshold) { streak++; cur.setDate(cur.getDate() - 1); }
    else break;
  }
  return streak;
}

// ── 日付リスト生成（チャート用） ──────────────────
function getDateList(historyView: HistoryView, customFrom: string, customTo: string): string[] {
  const today = toDateStr(new Date());
  const now   = new Date();
  if (historyView === 'today' || historyView === 'yesterday') return [];
  if (historyView === 'week') {
    const dow = now.getDay() || 7;
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now); d.setDate(now.getDate() - (dow - 1) + i); return toDateStr(d);
    });
  }
  if (historyView === 'last-week') {
    const dow = now.getDay() || 7;
    const lastMon = new Date(now); lastMon.setDate(now.getDate() - (dow - 1) - 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(lastMon); d.setDate(lastMon.getDate() + i); return toDateStr(d);
    });
  }
  if (historyView === 'last-7') {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now); d.setDate(now.getDate() - 6 + i); return toDateStr(d);
    });
  }
  if (historyView === 'last-30') {
    return Array.from({ length: 30 }, (_, i) => {
      const d = new Date(now); d.setDate(now.getDate() - 29 + i); return toDateStr(d);
    });
  }
  if (historyView === 'quarter') {
    const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    const list: string[] = [];
    const d = new Date(qStart);
    while (toDateStr(d) <= today) { list.push(toDateStr(d)); d.setDate(d.getDate() + 1); }
    return list;
  }
  if (historyView === 'year') {
    const list: string[] = [];
    const d = new Date(now.getFullYear(), 0, 1);
    while (toDateStr(d) <= today) { list.push(toDateStr(d)); d.setDate(d.getDate() + 1); }
    return list;
  }
  if (historyView === 'month') {
    const list: string[] = [];
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    while (toDateStr(d) <= today) { list.push(toDateStr(d)); d.setDate(d.getDate() + 1); }
    return list;
  }
  if (historyView === 'last-month') {
    const list: string[] = [];
    const d   = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    while (d <= end) { list.push(toDateStr(d)); d.setDate(d.getDate() + 1); }
    return list;
  }
  if (historyView === 'custom' && (customFrom || customTo)) {
    const f   = customFrom || customTo;
    const t   = customTo   || toDateStr(new Date());
    const list: string[] = [];
    const d   = new Date(f);
    const end = new Date(t);
    while (d <= end) { list.push(toDateStr(d)); d.setDate(d.getDate() + 1); }
    return list;
  }
  return [];
}

// ── CSV エクスポート ──────────────────────────────
async function exportCSV() {
  const all = await timerDB.getAllSessions();
  if (!all.length) return false;
  const header = ['id','task_name','tag','duration_sec','duration_min','started_at','ended_at','notes'];
  const rows = [...all]
    .sort((a, b) => a.started_at.localeCompare(b.started_at))
    .map(s => [
      s.id,
      `"${(s.task_name || '').replace(/"/g, '""')}"`,
      `"${(s.tag || '').replace(/"/g, '""')}"`,
      s.duration_sec || 0,
      Math.round((s.duration_sec || 0) / 60),
      s.started_at || '',
      s.ended_at   || '',
      `"${(s.notes || '').replace(/"/g, '""')}"`,
    ].join(','));
  const bom = '\uFEFF';
  const csv = bom + [header.join(','), ...rows].join('\n');
  return FileSaver.save(csv, `timer_sessions_${toDateStr(new Date())}.csv`, {
    mimeType: 'text/csv',
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  });
}

// ================================================================
// オートコンプリートフック
// ================================================================
function useAutocomplete(onSelect: (v: string) => void) {
  const [open, setOpen]     = useState(false);
  const [activeIdx, setIdx] = useState(-1);

  const show = useCallback((items: string[]) => {
    setIdx(-1);
    setOpen(items.length > 0);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, items: string[]) => {
    if (!open || !items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIdx(i => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIdx(i => Math.max(i - 1, -1));
    } else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      if (activeIdx >= 0) { e.preventDefault(); onSelect(items[activeIdx]); setOpen(false); setIdx(-1); }
    } else if (e.key === 'Escape') {
      setOpen(false); setIdx(-1);
    }
  }, [open, activeIdx, onSelect]);

  return { open, setOpen, activeIdx, show, handleKeyDown };
}

// ================================================================
// プリセット編集モーダル
// ================================================================
function PresetModal({ preset, onSave, onClose }: {
  preset: TimerPreset | null;
  onSave: (name: string, workMin: number, breakMin: number) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(preset?.name || '');
  const [work, setWork] = useState(preset ? Math.round(preset.work_sec / 60) : 25);
  const [brk,  setBreak] = useState(preset ? Math.round(preset.break_sec / 60) : 5);
  const { error: showError } = useToast();
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { nameRef.current?.focus(); }, []);

  const handleSave = () => {
    if (!name.trim()) { showError('プリセット名を入力してください'); return; }
    if (work < 1)     { showError('作業時間は1分以上で入力してください'); return; }
    if (brk < 1)      { showError('休憩時間は1分以上で入力してください'); return; }
    onSave(name.trim(), work, brk);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[var(--c-bg)] rounded-xl border border-[var(--c-border)] shadow-2xl w-full max-w-sm mx-4"
        onKeyDown={e => { if (e.key === 'Escape') onClose(); if (e.key === 'Enter') handleSave(); }}>
        <div className="px-5 py-4 border-b border-[var(--c-border)] flex justify-between">
          <h2 className="font-semibold">{preset ? 'プリセットを編集' : 'プリセットを追加'}</h2>
          <button onClick={onClose} className="text-[var(--c-fg-3)] hover:text-[var(--c-fg)]">×</button>
        </div>
        <div className="px-5 py-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--c-fg-3)]">プリセット名</label>
            <input ref={nameRef} type="text" value={name} onChange={e => setName(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-[var(--c-border)] bg-[var(--c-bg-2)] text-[var(--c-fg)] focus:outline-none focus:border-[var(--c-accent)]" />
          </div>
          <div className="flex gap-4">
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-xs text-[var(--c-fg-3)]">作業時間（分）</label>
              <input type="number" min={1} max={120} value={work} onChange={e => setWork(Number(e.target.value))}
                className="px-3 py-2 text-sm rounded-lg border border-[var(--c-border)] bg-[var(--c-bg-2)] text-[var(--c-fg)] focus:outline-none focus:border-[var(--c-accent)]" />
            </div>
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-xs text-[var(--c-fg-3)]">休憩時間（分）</label>
              <input type="number" min={1} max={60} value={brk} onChange={e => setBreak(Number(e.target.value))}
                className="px-3 py-2 text-sm rounded-lg border border-[var(--c-border)] bg-[var(--c-bg-2)] text-[var(--c-fg)] focus:outline-none focus:border-[var(--c-accent)]" />
            </div>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-[var(--c-border)] flex justify-end">
          <button onClick={handleSave} className="btn btn--primary btn--sm">保存</button>
        </div>
      </div>
    </div>
  );
}

// ================================================================
// 分析チャートコンポーネント
// ================================================================

// 日別推移グラフ
// 日別推移グラフ
function DailyChart({ sessions, historyView, customFrom, customTo, goalSec }: {
  sessions: TimerSession[];
  historyView: HistoryView;
  customFrom: string;
  customTo: string;
  goalSec: number;
}) {
  const dateList = getDateList(historyView, customFrom, customTo);
  if (!dateList.length) return null;

  const byDate: Record<string, number> = {};
  sessions.forEach(s => { const d = s.started_at.slice(0, 10); byDate[d] = (byDate[d] || 0) + s.duration_sec; });

  const maxSec     = Math.max(...dateList.map(d => byDate[d] || 0), 1);
  const today      = toDateStr(new Date());
  const activeDays = dateList.filter(d => byDate[d] > 0).length;
  const totalSec   = sessions.reduce((s, x) => s + x.duration_sec, 0);
  const avgSec     = activeDays > 0 ? Math.round(totalSec / activeDays) : 0;

  function dayLabel(dateStr: string) {
    const d   = new Date(dateStr);
    const day = d.getDate();
    if (dateList.length <= 7)  return DAY_NAMES[d.getDay()];
    if (dateList.length <= 31) return (day === 1 || day % 5 === 0) ? String(day) : '';
    return day === 1 ? `${d.getMonth() + 1}月` : '';
  }

  return (
    <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-bg)] p-3">
      <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--c-fg-3)] mb-2.5">日別推移</div>
      <div className="flex items-end gap-px" style={{ height: 72 }}>
        {dateList.map(d => {
          const sec      = byDate[d] || 0;
          const pct      = maxSec > 0 ? Math.round(sec / maxSec * 100) : 0;
          const isToday  = d === today;
          const overGoal = goalSec > 0 && sec >= goalSec;
          const tipText  = sec > 0 ? `${fmtDuration(sec)}（${d}）` : d;
          const barColor = sec === 0
            ? 'var(--c-border)'
            : overGoal
              ? 'var(--c-success, #10b981)'
              : isToday
                ? 'var(--c-accent)'
                : 'color-mix(in srgb, var(--c-accent) 55%, transparent)';
          return (
            <div key={d} className="flex flex-col items-center flex-1 h-full justify-end" title={tipText}>
              <div className="w-full rounded-sm transition-all"
                style={{ height: `${Math.max(pct, sec > 0 ? 4 : 0)}%`, background: barColor }} />
              <span className={`text-[9px] mt-1 text-center leading-none ${isToday ? 'font-bold text-[var(--c-accent)]' : 'text-[var(--c-fg-3)]'}`}>
                {dayLabel(d)}
              </span>
            </div>
          );
        })}
      </div>
      {avgSec > 0 && (
        <div className="text-[11px] text-[var(--c-fg-3)] text-right mt-2">
          記録がある日の平均: {fmtDuration(avgSec)}/日
        </div>
      )}
    </div>
  );
}

// 今日のタイムライン（今日ビュー専用）
function TodayTimeline({ sessions, goalSec }: {
  sessions: TimerSession[];
  goalSec: number;
}) {
  const nowMs = Date.now();
  if (!sessions.length) return null;

  const totalSec = sessions.reduce((s, x) => s + x.duration_sec, 0);
  const startMsList = sessions.map(s => new Date(s.started_at).getTime());
  const endMsList   = sessions.map(s =>
    s.ended_at ? new Date(s.ended_at).getTime() : new Date(s.started_at).getTime() + s.duration_sec * 1000
  );
  const minMs     = Math.min(...startMsList);
  const maxMs     = Math.max(...endMsList);
  const range     = Math.max(maxMs - minMs, 1800 * 1000);
  const padMs     = range * 0.05;
  const axisMin   = minMs - padMs;
  const axisMax   = maxMs + padMs;
  const axisRange = axisMax - axisMin;

  const pct = (ms: number) => (ms - axisMin) / axisRange * 100;

  const hasPauseData = sessions.some(s => s.pause_intervals && s.pause_intervals.length > 0);
  const showNow = nowMs >= axisMin && nowMs <= axisMax;

  // 作業セグメントとツールチップ内容を生成
  function getWorkSegments(s: TimerSession) {
    const sMs   = new Date(s.started_at).getTime();
    const eMs   = s.ended_at ? new Date(s.ended_at).getTime() : sMs + s.duration_sec * 1000;
    const color = s.tag ? tagColor(s.tag) : 'var(--c-accent)';

    if (!s.pause_intervals || s.pause_intervals.length === 0) {
      const tip = `${s.task_name}\n${toHHMM(s.started_at)}〜${toHHMM(s.ended_at || new Date(eMs).toISOString())}（${fmtDuration(s.duration_sec)}）`;
      return [{ sMs, eMs, color, tip }];
    }

    const segs: { sMs: number; eMs: number; color: string; tip: string }[] = [];
    let cursor = sMs;
    for (const iv of s.pause_intervals) {
      const ps = new Date(iv.started_at).getTime();
      const pe = new Date(iv.ended_at).getTime();
      if (ps > cursor) {
        const dur = Math.round((ps - cursor) / 1000);
        segs.push({ sMs: cursor, eMs: ps, color, tip: `${s.task_name}\n${toHHMM(new Date(cursor).toISOString())}〜${toHHMM(new Date(ps).toISOString())}（${fmtDuration(dur)}）` });
      }
      cursor = pe;
    }
    if (cursor < eMs) {
      const dur = Math.round((eMs - cursor) / 1000);
      segs.push({ sMs: cursor, eMs, color, tip: `${s.task_name}\n${toHHMM(new Date(cursor).toISOString())}〜${toHHMM(new Date(eMs).toISOString())}（${fmtDuration(dur)}）` });
    }
    return segs;
  }

  return (
    <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-bg)] p-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--c-fg-3)]">今日のタイムライン</span>
        <div className="flex items-center gap-2.5">
          {goalSec > 0 && (
            <span className="text-[11px] text-[var(--c-fg-3)]">目標 {Math.min(100, Math.round(totalSec / goalSec * 100))}%</span>
          )}
          <span className="text-[12px] font-bold" style={{ color: 'var(--c-accent)' }}>{fmtDuration(totalSec)}</span>
        </div>
      </div>

      {/* トラック */}
      <div className="relative rounded-lg overflow-hidden" style={{ height: 40, background: 'var(--c-bg-2)' }}>
        {/* セッションエンベロープ（一時停止データありのみ：薄い色で全期間を示す） */}
        {sessions.filter(s => s.pause_intervals && s.pause_intervals.length > 0).map(s => {
          const sMs   = new Date(s.started_at).getTime();
          const eMs   = s.ended_at ? new Date(s.ended_at).getTime() : sMs + s.duration_sec * 1000;
          const color = s.tag ? tagColor(s.tag) : 'var(--c-accent)';
          const l = pct(sMs);
          const w = Math.max(pct(eMs) - l, 0.3);
          return (
            <div key={`env-${s.id}`} className="absolute" style={{
              left: `${l}%`, width: `${w}%`, top: 4, bottom: 4,
              background: color, opacity: 0.18, borderRadius: 3,
            }} />
          );
        })}

        {/* 作業セグメント（Tooltip付き） */}
        {sessions.flatMap(s =>
          getWorkSegments(s).map((seg, i) => {
            const l = pct(seg.sMs);
            const w = Math.max(pct(seg.eMs) - l, 0.3);
            return (
              <Tooltip key={`${s.id}-${i}`} content={seg.tip}>
                <div className="absolute" style={{
                  left: `${l}%`, width: `${w}%`, top: 4, bottom: 4,
                  background: seg.color,
                  boxShadow: `0 1px 4px ${seg.color}55`,
                  borderRadius: 3,
                }} />
              </Tooltip>
            );
          })
        )}

        {/* 現在時刻マーカー */}
        {showNow && (
          <div className="absolute top-0 bottom-0 w-px" style={{ left: `${pct(nowMs)}%`, background: 'var(--c-fg-2)', opacity: 0.5 }} />
        )}
      </div>

      {/* 時刻軸 */}
      <div className="flex justify-between mt-1.5">
        <span className="text-[9px] text-[var(--c-fg-3)] tabular-nums">{toHHMM(new Date(axisMin).toISOString())}</span>
        <span className="text-[9px] text-[var(--c-fg-3)] tabular-nums">{toHHMM(new Date((axisMin + axisMax) / 2).toISOString())}</span>
        <span className="text-[9px] text-[var(--c-fg-3)] tabular-nums">{toHHMM(new Date(axisMax).toISOString())}</span>
      </div>

      {/* 凡例（一時停止データがある場合のみ） */}
      {hasPauseData && (
        <div className="flex items-center gap-4 mt-3 pt-2.5 border-t border-[var(--c-border)]">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-4 rounded-sm" style={{ background: 'var(--c-accent)' }} />
            <span className="text-[10px] text-[var(--c-fg-3)]">作業</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-4 rounded-sm" style={{ background: 'var(--c-accent)', opacity: 0.18 }} />
            <span className="text-[10px] text-[var(--c-fg-3)]">一時停止</span>
          </div>
        </div>
      )}
    </div>
  );
}

// 横棒チャート（タグ別・タスク別・曜日別 共通）
function HBarChart({ title, entries, colorFn, barColor }: {
  title: string;
  entries: [string, number][];
  colorFn?: (label: string) => string;
  barColor?: string;
}) {
  if (!entries.length) return null;
  const max = Math.max(...entries.map(([, v]) => v), 1);
  return (
    <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-bg)] p-3">
      <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--c-fg-3)] mb-2.5">{title}</div>
      <div className="flex flex-col gap-2">
        {entries.map(([label, sec]) => {
          const color = colorFn ? colorFn(label) : (barColor ?? 'var(--c-accent)');
          const pct   = max > 0 ? Math.round(sec / max * 100) : 0;
          return (
            <div key={label} className="flex items-center gap-2">
              <Tooltip content={label}>
                <div className="flex items-center gap-1.5 w-32 shrink-0">
                  {colorFn && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />}
                  <span className="text-xs text-[var(--c-fg-2)] truncate">{label}</span>
                </div>
              </Tooltip>
              <div className="flex-1 h-[3px] rounded-full overflow-hidden" style={{ background: 'var(--c-bg-2)' }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
              </div>
              <span className="text-xs text-[var(--c-fg-3)] w-14 text-right shrink-0">
                {sec > 0 ? fmtDuration(sec) : '—'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ================================================================
// セッション行コンポーネント
// ================================================================
function SessionRow({ session: s, onDelete, maxSec }: {
  session: TimerSession;
  onDelete: (id: number) => void;
  maxSec: number;
}) {
  const wallSec     = s.ended_at
    ? Math.round((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 1000)
    : s.duration_sec;
  const pausedSec   = Math.max(0, wallSec - s.duration_sec);
  const hasPause    = pausedSec >= 30;
  const workPct     = wallSec > 0 ? Math.round(s.duration_sec / wallSec * 100) : 100;
  const barWidthPct = maxSec > 0 ? Math.min(100, Math.round(s.duration_sec / maxSec * 100)) : 100;
  const tagCol      = s.tag ? tagColor(s.tag) : 'var(--c-accent)';

  return (
    <div className="flex flex-col px-3 py-2.5 hover:bg-[var(--c-bg-2)] transition-colors group border-b border-[var(--c-border)] last:border-b-0">
      <div className="flex items-center gap-2.5">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: tagCol }} />
        <span className="text-[13px] font-medium text-[var(--c-fg)] truncate flex-1 min-w-0">
          {s.task_name}
        </span>
        {s.tag && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0 leading-none"
            style={{ background: tagColor(s.tag) + '22', color: tagColor(s.tag) }}>
            {s.tag}
          </span>
        )}
        {hasPause && (
          <span className="text-[10px] shrink-0 tabular-nums"
            style={{ color: 'var(--c-warning, #f59e0b)' }}
            title={`停止: ${fmtDuration(pausedSec)}`}>
            ⏸ {fmtDuration(pausedSec)}
          </span>
        )}
        <span className="text-[11px] text-[var(--c-fg-3)] shrink-0 tabular-nums">
          {toHHMM(s.started_at)}
          {s.ended_at && <span className="opacity-60">→{toHHMM(s.ended_at)}</span>}
        </span>
        <span className="text-sm font-bold shrink-0 tabular-nums text-right"
          style={{ color: 'var(--c-accent)', minWidth: '2.5rem' }}>
          {fmtDuration(s.duration_sec)}
        </span>
        <button onClick={() => onDelete(s.id!)}
          className="w-5 h-5 flex items-center justify-center rounded text-transparent group-hover:text-[var(--c-fg-3)] hover:!text-red-400 hover:!bg-red-400/10 text-xs transition-colors shrink-0">
          ✕
        </button>
      </div>
      {/* デュレーションバー */}
      <div className="mt-1.5 overflow-hidden rounded-full" style={{ height: 2, background: 'var(--c-bg-2)' }}>
        {hasPause ? (
          <div className="flex h-full" style={{ width: `${barWidthPct}%` }}>
            <div style={{ flex: workPct, background: 'var(--c-accent)', minWidth: 2 }} />
            <div style={{ flex: 100 - workPct, background: 'var(--c-warning, #f59e0b)', opacity: 0.7, minWidth: 2 }} />
          </div>
        ) : (
          <div className="h-full rounded-full" style={{ width: `${barWidthPct}%`, background: tagCol }} />
        )}
      </div>
    </div>
  );
}

// ================================================================
// TimerPage メイン
// ================================================================
export function TimerPage() {
  const { success, show: showToast, error: showError } = useToast();

  // ── プリセット & セッション ───────────────────────
  const [presets, setPresets]     = useState<TimerPreset[]>([]);
  const [sessions, setSessions]   = useState<TimerSession[]>([]);
  const [allSessions, setAllSessions] = useState<TimerSession[]>([]);
  const [activePresetId, setActivePresetId] = useState<number | null>(
    () => Number(localStorage.getItem(KEY_ACTIVE_PRESET)) || null
  );

  // ── タイマー状態 ──────────────────────────────────
  const [mode, setMode]           = useState<TimerMode>('work');
  const [remaining, setRemaining] = useState(0);
  const [total, setTotal]         = useState(0);
  const [running, setRunning]     = useState(false);
  const [taskName, setTaskName]   = useState('');
  const [tag, setTag]             = useState('');
  const [sessionStartTime, setSessionStartTime] = useState<string | null>(null);
  const [pausedDurationSec, setPausedDuration]  = useState(0);
  const [pauseStartedAt, setPauseStartedAt]     = useState<number | null>(null);
  const [flashing, setFlashing]   = useState(false);

  // ── 履歴・分析 ────────────────────────────────────
  const [historyView, setHistoryView] = useState<HistoryView>(
    () => (localStorage.getItem(KEY_HISTORY_VIEW) as HistoryView) || 'today'
  );
  const [dailyGoalSec, setDailyGoalSec] = useState(
    () => Number(localStorage.getItem(KEY_DAILY_GOAL)) || 0
  );
  const [customFrom, setCustomFrom] = useState(() => localStorage.getItem(KEY_CUSTOM_FROM) || '');
  const [customTo,   setCustomTo]   = useState(() => localStorage.getItem(KEY_CUSTOM_TO)   || '');

  // ── モーダル ──────────────────────────────────────
  const [presetModal, setPresetModal]     = useState<TimerPreset | null>(null);
  const [showPresetModal, setShowPresetModal] = useState(false);

  // ── オートコンプリート ────────────────────────────
  const [taskCandidates, setTaskCandidates] = useState<string[]>([]);
  const [tagCandidates,  setTagCandidates]  = useState<string[]>([]);
  const taskInputRef = useRef<HTMLInputElement>(null);
  const tagInputRef  = useRef<HTMLInputElement>(null);

  const allTagSet     = useRef<Set<string>>(new Set());
  const recentTasks   = useRef<string[]>([]);

  const acTask = useAutocomplete(v => { setTaskName(v); setTaskCandidates([]); });
  const acTag  = useAutocomplete(v => { setTag(v);      setTagCandidates([]); });

  // ── Refs ──────────────────────────────────────────
  const workerRef       = useRef<Worker | null>(null);
  const intervalRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const runningRef      = useRef(false);
  const remainingRef    = useRef(0);
  const totalRef        = useRef(0);
  const modeRef         = useRef<TimerMode>('work');
  const sessionStartRef   = useRef<string | null>(null);
  const pausedDurRef      = useRef(0);
  const pauseStartRef     = useRef<number | null>(null);
  const pauseIntervalsRef = useRef<{ started_at: number; ended_at: number }[]>([]);
  const taskNameRef       = useRef('');
  const tagRef            = useRef('');
  const activePresetRef   = useRef<number | null>(null);
  const handlePhaseEndRef = useRef<() => void>(() => {});

  // ref を state と同期
  useEffect(() => { runningRef.current = running; }, [running]);
  useEffect(() => { remainingRef.current = remaining; }, [remaining]);
  useEffect(() => { totalRef.current = total; }, [total]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { sessionStartRef.current = sessionStartTime; }, [sessionStartTime]);
  useEffect(() => { pausedDurRef.current = pausedDurationSec; }, [pausedDurationSec]);
  useEffect(() => { pauseStartRef.current = pauseStartedAt; }, [pauseStartedAt]);
  useEffect(() => { taskNameRef.current = taskName; }, [taskName]);
  useEffect(() => { tagRef.current = tag; }, [tag]);
  useEffect(() => { activePresetRef.current = activePresetId; }, [activePresetId]);

  // ── 状態保存 ──────────────────────────────────────
  const saveTimerState = useCallback(() => {
    let pausedSec = pausedDurRef.current;
    if (!runningRef.current && pauseStartRef.current !== null) {
      pausedSec += Math.floor((Date.now() - pauseStartRef.current) / 1000);
    }
    localStorage.setItem(KEY_RUNNING_STATE, JSON.stringify({
      activePresetId: activePresetRef.current,
      mode: modeRef.current,
      remaining: remainingRef.current,
      total: totalRef.current,
      running: runningRef.current,
      taskName: taskNameRef.current,
      tag: tagRef.current,
      sessionStartTime: sessionStartRef.current,
      pausedDurationSec: pausedSec,
      pauseIntervals: pauseIntervalsRef.current,
      savedAt: Date.now(),
    }));
  }, []);

  const clearTimerState = useCallback(() => {
    localStorage.removeItem(KEY_RUNNING_STATE);
  }, []);

  // ── アクティブプリセット取得 ──────────────────────
  const getActivePreset = useCallback((pList: TimerPreset[], id: number | null) => {
    return pList.find(p => p.id === id) || pList[0] || null;
  }, []);

  // ── ページタイトル・バッジ更新 ──────────────────────
  useEffect(() => {
    if (running) {
      const timeStr = fmtMMSS(remaining);
      setWindowTitle(`${mode === 'work' ? '▶' : '☕'} ${timeStr} MyTools`);
      setTimerBadge(timeStr);
    } else {
      setWindowTitle('MyTools');
      setTimerBadge(null);
    }
    return () => {
      setWindowTitle('MyTools');
      setTimerBadge(null);
    };
  }, [running, remaining, mode]);

  // ── セッション読み込み ────────────────────────────
  const loadSessions = useCallback(async (view: HistoryView, from: string, to: string) => {
    const today = toDateStr(new Date());
    const now   = new Date();
    let loaded: TimerSession[];
    if (view === 'today') {
      loaded = await timerDB.getSessionsByDate(today);
    } else if (view === 'yesterday') {
      const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
      loaded = await timerDB.getSessionsByDate(toDateStr(yesterday));
    } else if (view === 'week') {
      const dow = now.getDay() || 7;
      const mon = new Date(now); mon.setDate(now.getDate() - (dow - 1));
      loaded = await timerDB.getSessionsInRange(toDateStr(mon), today);
    } else if (view === 'last-week') {
      const dow = now.getDay() || 7;
      const lastMon = new Date(now); lastMon.setDate(now.getDate() - (dow - 1) - 7);
      const lastSun = new Date(lastMon); lastSun.setDate(lastMon.getDate() + 6);
      loaded = await timerDB.getSessionsInRange(toDateStr(lastMon), toDateStr(lastSun));
    } else if (view === 'last-7') {
      const from7 = new Date(now); from7.setDate(now.getDate() - 6);
      loaded = await timerDB.getSessionsInRange(toDateStr(from7), today);
    } else if (view === 'last-30') {
      const from30 = new Date(now); from30.setDate(now.getDate() - 29);
      loaded = await timerDB.getSessionsInRange(toDateStr(from30), today);
    } else if (view === 'quarter') {
      const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      loaded = await timerDB.getSessionsInRange(toDateStr(qStart), today);
    } else if (view === 'year') {
      loaded = await timerDB.getSessionsInRange(`${now.getFullYear()}-01-01`, today);
    } else if (view === 'month') {
      loaded = await timerDB.getSessionsInRange(toDateStr(new Date(now.getFullYear(), now.getMonth(), 1)), today);
    } else if (view === 'last-month') {
      loaded = await timerDB.getSessionsInRange(
        toDateStr(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        toDateStr(new Date(now.getFullYear(), now.getMonth(), 0))
      );
    } else {
      if (from || to) {
        const f = from || to;
        const t = to   || toDateStr(new Date());
        loaded = await timerDB.getSessionsInRange(f, t);
      } else {
        loaded = [];
      }
    }
    setSessions(loaded);
  }, []);

  // ── オートコンプリート候補キャッシュ更新 ──────────
  const updateAutocompleteCaches = useCallback((all: TimerSession[]) => {
    allTagSet.current = new Set(all.map(s => s.tag).filter(Boolean));
    const seen = new Set<string>();
    recentTasks.current = all
      .filter(s => s.task_name && s.task_name !== '（未設定）')
      .sort((a, b) => b.started_at.localeCompare(a.started_at))
      .map(s => s.task_name)
      .filter(t => !seen.has(t) && seen.add(t))
      .slice(0, 5);
  }, []);

  // ── 初期化 ────────────────────────────────────────
  useEffect(() => {
    workerRef.current = createTimerWorker();

    const init = async () => {
      const pList = await timerDB.getPresets();
      setPresets(pList);

      const all = await timerDB.getAllSessions();
      setAllSessions(all);
      updateAutocompleteCaches(all);

      const savedIdStr = localStorage.getItem(KEY_ACTIVE_PRESET);
      const savedId    = savedIdStr ? Number(savedIdStr) : null;
      const preset     = getActivePreset(pList, savedId);
      const pid        = preset?.id ?? null;
      setActivePresetId(pid);
      activePresetRef.current = pid;

      await loadSessions(historyView, customFrom, customTo);

      if (preset) {
        const rem = preset.work_sec;
        setRemaining(rem); remainingRef.current = rem;
        setTotal(rem);     totalRef.current     = rem;
      }

      // タイマー状態の復元
      const raw = localStorage.getItem(KEY_RUNNING_STATE);
      if (raw) {
        clearTimerState();
        try {
          const data = JSON.parse(raw);
          if (data?.savedAt && data.activePresetId === pid) {
            if (data.running && data.remaining !== data.total) {
              const elapsed = Math.floor((Date.now() - data.savedAt) / 1000);
              const rem = Math.max(0, data.remaining - elapsed);
              setMode(data.mode || 'work'); modeRef.current = data.mode || 'work';
              setTotal(data.total || 0);   totalRef.current = data.total || 0;
              setSessionStartTime(data.sessionStartTime); sessionStartRef.current = data.sessionStartTime;
              setTaskName(data.taskName || ''); taskNameRef.current = data.taskName || '';
              setTag(data.tag || '');           tagRef.current = data.tag || '';
              setPausedDuration(data.pausedDurationSec || 0); pausedDurRef.current = data.pausedDurationSec || 0;
              setPauseStartedAt(null); pauseStartRef.current = null;
              pauseIntervalsRef.current = data.pauseIntervals || [];
              setRemaining(rem); remainingRef.current = rem;
            }
          }
        } catch { /* ignore */ }
      }
    };

    init();

    return () => {
      workerRef.current?.terminate();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Worker メッセージ受信
  useEffect(() => {
    const w = workerRef.current;
    if (!w) return;
    const handler = (e: MessageEvent) => {
      const rem = e.data.remaining as number;
      setRemaining(rem); remainingRef.current = rem;
      saveTimerState();
      if (rem <= 0) handlePhaseEndRef.current();
    };
    w.addEventListener('message', handler);
    return () => w.removeEventListener('message', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ページ離脱時にタイマー状態を保存
  useEffect(() => {
    const onHide = () => {
      if (runningRef.current || remainingRef.current !== totalRef.current) saveTimerState();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onHide);
    };
  }, [saveTimerState]);

  // ── フェーズ終了 ──────────────────────────────────
  const handlePhaseEnd = useCallback(async () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    setRunning(false); runningRef.current = false;

    playBeep();
    setFlashing(true);
    setTimeout(() => setFlashing(false), 2000);

    if (modeRef.current === 'work') {
      await doSaveSession({});
      pauseIntervalsRef.current = [];
      setMode('break'); modeRef.current = 'break';
      success('作業完了！休憩しましょう 🎉');
      try {
        const taskLabel = taskNameRef.current ? `「${taskNameRef.current}」` : '';
        new Notification('⏰ 作業時間終了', { body: `${taskLabel}お疲れ様でした！休憩しましょう。`, tag: 'timer-alert', requireInteraction: true });
      } catch { /* ignore */ }
    } else {
      setMode('work'); modeRef.current = 'work';
      showToast('休憩終了。作業を再開しましょう！', 'info');
      try { new Notification('☕ 休憩終了', { body: '作業を再開しましょう！', tag: 'timer-alert', requireInteraction: true }); } catch { /* ignore */ }
    }

    const pList = await timerDB.getPresets();
    const preset = getActivePreset(pList, activePresetRef.current);
    if (preset) {
      const rem = modeRef.current === 'work' ? preset.work_sec : preset.break_sec;
      setRemaining(rem); remainingRef.current = rem;
      setTotal(rem);     totalRef.current     = rem;
    }
    setSessionStartTime(null); sessionStartRef.current = null;
    setPausedDuration(0);      pausedDurRef.current = 0;
    setPauseStartedAt(null);   pauseStartRef.current = null;
    pauseIntervalsRef.current = [];
    clearTimerState();

    const all = await timerDB.getAllSessions();
    setAllSessions(all);
    updateAutocompleteCaches(all);
    await loadSessions(historyView, customFrom, customTo);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyView, customFrom, customTo]);
  // handlePhaseEnd は historyView/customFrom/customTo が変わるたびに再生成される。
  // Worker・setInterval のクロージャが古い版を掴まないよう常に最新を ref に保持する。
  handlePhaseEndRef.current = handlePhaseEnd;

  // ── セッション保存 ────────────────────────────────
  const doSaveSession = useCallback(async ({ minDuration = 5 }: { minDuration?: number }) => {
    if (!sessionStartRef.current) return false;
    const endTime = new Date().toISOString();
    const wallSec = Math.round((new Date(endTime).getTime() - new Date(sessionStartRef.current).getTime()) / 1000);
    const durSec  = Math.max(0, wallSec - pausedDurRef.current);
    if (durSec < minDuration) return false;
    const completedIntervals = pauseIntervalsRef.current.filter(p => p.ended_at > 0);
    const session: Omit<TimerSession, 'id'> = {
      task_name: taskNameRef.current || '（未設定）',
      tag: tagRef.current || '',
      notes: '',
      duration_sec: durSec,
      started_at: sessionStartRef.current,
      ended_at: endTime,
      pause_intervals: completedIntervals.length > 0
        ? completedIntervals.map(p => ({
            started_at: new Date(p.started_at).toISOString(),
            ended_at: new Date(p.ended_at).toISOString(),
          }))
        : undefined,
    };
    try { await timerDB.addSession(session); return true; } catch { return false; }
  }, []);

  // ── タイマーリセット ──────────────────────────────
  const handleReset = useCallback(async () => {
    workerRef.current?.postMessage({ cmd: 'stop' });
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    setRunning(false); runningRef.current = false;
    setMode('work'); modeRef.current = 'work';
    setSessionStartTime(null); sessionStartRef.current = null;
    setPausedDuration(0); pausedDurRef.current = 0;
    setPauseStartedAt(null); pauseStartRef.current = null;
    pauseIntervalsRef.current = [];
    const pList = await timerDB.getPresets();
    const preset = getActivePreset(pList, activePresetRef.current);
    if (preset) {
      setRemaining(preset.work_sec); remainingRef.current = preset.work_sec;
      setTotal(preset.work_sec);     totalRef.current     = preset.work_sec;
    }
    clearTimerState();
    setWindowTitle('MyTools');
  }, [getActivePreset, clearTimerState]);

  // ── タイマー開始 ──────────────────────────────────
  const handleStart = useCallback(async () => {
    if (runningRef.current) return;

    // 楽観的即時 UI 更新 — ボタン切替のちらつきを防ぐ
    setRunning(true); runningRef.current = true;

    warmUpAudio();
    if (Notification.permission === 'default') Notification.requestPermission();

    const pList = await timerDB.getPresets();
    const preset = getActivePreset(pList, activePresetRef.current);
    if (!preset) {
      setRunning(false); runningRef.current = false;
      showError('プリセットを選択してください');
      return;
    }

    if (remainingRef.current <= 0) {
      const rem = modeRef.current === 'work' ? preset.work_sec : preset.break_sec;
      setRemaining(rem); remainingRef.current = rem;
      setTotal(rem);     totalRef.current     = rem;
    }

    if (modeRef.current === 'work' && !sessionStartRef.current) {
      const now = new Date().toISOString();
      setSessionStartTime(now); sessionStartRef.current = now;
      setPausedDuration(0); pausedDurRef.current = 0;
      setPauseStartedAt(null); pauseStartRef.current = null;
      pauseIntervalsRef.current = [];
    } else if (pauseStartRef.current !== null) {
      const resumeMs = Date.now();
      const addedSec = Math.floor((resumeMs - pauseStartRef.current) / 1000);
      const newPaused = pausedDurRef.current + addedSec;
      setPausedDuration(newPaused); pausedDurRef.current = newPaused;
      setPauseStartedAt(null); pauseStartRef.current = null;
      // 最後の一時停止インターバルを閉じる
      const last = pauseIntervalsRef.current[pauseIntervalsRef.current.length - 1];
      if (last && last.ended_at === 0) last.ended_at = resumeMs;
    }

    if (workerRef.current) {
      workerRef.current.postMessage({ cmd: 'start', remaining: remainingRef.current });
    } else {
      const startedAt = Date.now();
      const startRem  = remainingRef.current;
      intervalRef.current = setInterval(() => {
        const rem = Math.max(0, startRem - Math.floor((Date.now() - startedAt) / 1000));
        setRemaining(rem); remainingRef.current = rem;
        saveTimerState();
        if (rem <= 0) handlePhaseEndRef.current();
      }, 1000);
    }
    saveTimerState();
  }, [getActivePreset, showError, saveTimerState, handlePhaseEnd]);

  // ── 一時停止 ──────────────────────────────────────
  const handlePause = useCallback(() => {
    if (!runningRef.current) return;
    workerRef.current?.postMessage({ cmd: 'stop' });
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    setRunning(false); runningRef.current = false;
    const now = Date.now();
    setPauseStartedAt(now); pauseStartRef.current = now;
    pauseIntervalsRef.current.push({ started_at: now, ended_at: 0 });
    saveTimerState();
  }, [saveTimerState]);

  // ── 途中終了 ──────────────────────────────────────
  const handleEnd = useCallback(async () => {
    workerRef.current?.postMessage({ cmd: 'stop' });
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    setRunning(false); runningRef.current = false;

    if (modeRef.current === 'work' && sessionStartRef.current) {
      const saved = await doSaveSession({ minDuration: 1 });
      pauseIntervalsRef.current = [];
      if (saved) success('作業を終了して記録しました');
      const all = await timerDB.getAllSessions();
      setAllSessions(all);
      updateAutocompleteCaches(all);
      await loadSessions(historyView, customFrom, customTo);
    }

    setMode('work'); modeRef.current = 'work';
    const pList = await timerDB.getPresets();
    const preset = getActivePreset(pList, activePresetRef.current);
    if (preset) {
      setRemaining(preset.work_sec); remainingRef.current = preset.work_sec;
      setTotal(preset.work_sec);     totalRef.current     = preset.work_sec;
    }
    setSessionStartTime(null); sessionStartRef.current = null;
    setPausedDuration(0); pausedDurRef.current = 0;
    setPauseStartedAt(null); pauseStartRef.current = null;
    pauseIntervalsRef.current = [];
    clearTimerState();
  }, [doSaveSession, getActivePreset, historyView, customFrom, customTo, success, clearTimerState, loadSessions, updateAutocompleteCaches]);

  // ── スキップ ──────────────────────────────────────
  const handleSkip = useCallback(async () => {
    if (modeRef.current === 'work' && sessionStartRef.current) {
      await doSaveSession({});
      pauseIntervalsRef.current = [];
      const all = await timerDB.getAllSessions();
      setAllSessions(all);
      updateAutocompleteCaches(all);
      await loadSessions(historyView, customFrom, customTo);
    }
    workerRef.current?.postMessage({ cmd: 'stop' });
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    setRunning(false); runningRef.current = false;

    const nextMode = modeRef.current === 'work' ? 'break' : 'work';
    setMode(nextMode); modeRef.current = nextMode;

    const pList = await timerDB.getPresets();
    const preset = getActivePreset(pList, activePresetRef.current);
    if (preset) {
      const rem = nextMode === 'work' ? preset.work_sec : preset.break_sec;
      setRemaining(rem); remainingRef.current = rem;
      setTotal(rem);     totalRef.current     = rem;
    }
    setSessionStartTime(null); sessionStartRef.current = null;
    setPausedDuration(0); pausedDurRef.current = 0;
    setPauseStartedAt(null); pauseStartRef.current = null;
    saveTimerState();
  }, [doSaveSession, getActivePreset, historyView, customFrom, customTo, saveTimerState, loadSessions, updateAutocompleteCaches]);

  // ── プリセット選択 ────────────────────────────────
  const selectPreset = useCallback(async (id: number) => {
    if (runningRef.current) return;
    setActivePresetId(id); activePresetRef.current = id;
    localStorage.setItem(KEY_ACTIVE_PRESET, String(id));
    const pList = await timerDB.getPresets();
    const preset = getActivePreset(pList, id);
    if (preset) {
      const rem = modeRef.current === 'work' ? preset.work_sec : preset.break_sec;
      setRemaining(rem); remainingRef.current = rem;
      setTotal(rem);     totalRef.current     = rem;
    }
    clearTimerState();
  }, [getActivePreset, clearTimerState]);

  // ── グローバル検索登録（プリセット） ───────────────
  const { config: timerTabConfig, setActiveTab: setGlobalTab } = useTabStore();
  useEffect(() => {
    const label = timerTabConfig.find(t => t.pageSrc === 'pages/timer.html')?.label;
    searchRegistry.register('timer-presets', async (query) => {
      const q = query.toLowerCase();
      const all = await timerDB.getPresets();
      return all
        .filter(p => p.name.toLowerCase().includes(q))
        .slice(0, 10)
        .map(p => ({
          id: `timer-preset-${p.id}`,
          pageSrc: 'pages/timer.html',
          title: p.name,
          excerpt: `作業 ${Math.round(p.work_sec / 60)}分 / 休憩 ${Math.round(p.break_sec / 60)}分`,
          onSelect: async () => {
            if (label) setGlobalTab(label);
            if (runningRef.current) return;
            setActivePresetId(p.id!);
            activePresetRef.current = p.id!;
            localStorage.setItem(KEY_ACTIVE_PRESET, String(p.id!));
            const freshPresets = await timerDB.getPresets();
            const preset = freshPresets.find(x => x.id === p.id);
            if (preset) {
              const rem = modeRef.current === 'work' ? preset.work_sec : preset.break_sec;
              setRemaining(rem); remainingRef.current = rem;
              setTotal(rem); totalRef.current = rem;
            }
          },
        }));
    });
    return () => searchRegistry.unregister('timer-presets');
  }, [timerTabConfig, setGlobalTab]);

  // ── プリセット保存 ────────────────────────────────
  const savePreset = useCallback(async (name: string, workMin: number, breakMin: number) => {
    const editing = presetModal;
    const preset: Omit<TimerPreset, 'id'> = {
      name,
      work_sec:  workMin * 60,
      break_sec: breakMin * 60,
      position:  editing ? (editing.position ?? Date.now()) : Date.now(),
    };
    try {
      if (editing) {
        const updated = { ...editing, ...preset };
        await timerDB.updatePreset(updated);
        setPresets(prev => prev.map(p => p.id === updated.id ? updated : p));
        if (activePresetRef.current === updated.id && !runningRef.current) {
          const rem = modeRef.current === 'work' ? updated.work_sec : updated.break_sec;
          setRemaining(rem); setTotal(rem);
          remainingRef.current = rem; totalRef.current = rem;
        }
        success('プリセットを更新しました');
      } else {
        const added = await timerDB.addPreset(preset);
        setPresets(prev => [...prev, added]);
        if (!activePresetRef.current) {
          setActivePresetId(added.id!); activePresetRef.current = added.id!;
          localStorage.setItem(KEY_ACTIVE_PRESET, String(added.id));
          setRemaining(added.work_sec); setTotal(added.work_sec);
          remainingRef.current = added.work_sec; totalRef.current = added.work_sec;
        }
        success('プリセットを追加しました');
      }
      setShowPresetModal(false);
    } catch { showError('保存に失敗しました'); }
  }, [presetModal, success, showError]);

  // ── プリセット削除 ────────────────────────────────
  const deletePreset = useCallback(async (p: TimerPreset) => {
    if (!confirm(`「${p.name}」を削除しますか？`)) return;
    await timerDB.deletePreset(p.id!);
    const newList = presets.filter(x => x.id !== p.id);
    setPresets(newList);
    if (activePresetId === p.id) {
      const next = newList[0]?.id ?? null;
      setActivePresetId(next); activePresetRef.current = next;
      localStorage.setItem(KEY_ACTIVE_PRESET, next ? String(next) : '');
      const nextPreset = newList[0];
      if (nextPreset) {
        setRemaining(nextPreset.work_sec); setTotal(nextPreset.work_sec);
        remainingRef.current = nextPreset.work_sec; totalRef.current = nextPreset.work_sec;
      }
    }
    success('削除しました');
  }, [presets, activePresetId, success]);

  // ── 履歴ビュー切替 ───────────────────────────────
  const changeView = useCallback((v: HistoryView) => {
    let newFrom = customFrom;
    let newTo   = customTo;

    // カスタムへの切替時、元ビューの範囲を初期値として設定
    if (v === 'custom' && historyView !== 'custom') {
      const now   = new Date();
      const today = toDateStr(now);
      if (historyView === 'today') {
        newFrom = today;
        newTo   = today;
      } else if (historyView === 'yesterday') {
        const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
        newFrom = toDateStr(yesterday);
        newTo   = toDateStr(yesterday);
      } else if (historyView === 'week') {
        const dow = now.getDay() || 7;
        const mon = new Date(now); mon.setDate(now.getDate() - (dow - 1));
        const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
        newFrom = toDateStr(mon);
        newTo   = toDateStr(sun);
      } else if (historyView === 'last-week') {
        const dow = now.getDay() || 7;
        const lastMon = new Date(now); lastMon.setDate(now.getDate() - (dow - 1) - 7);
        const lastSun = new Date(lastMon); lastSun.setDate(lastMon.getDate() + 6);
        newFrom = toDateStr(lastMon);
        newTo   = toDateStr(lastSun);
      } else if (historyView === 'last-7') {
        const from7 = new Date(now); from7.setDate(now.getDate() - 6);
        newFrom = toDateStr(from7);
        newTo   = today;
      } else if (historyView === 'last-30') {
        const from30 = new Date(now); from30.setDate(now.getDate() - 29);
        newFrom = toDateStr(from30);
        newTo   = today;
      } else if (historyView === 'quarter') {
        const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        newFrom = toDateStr(qStart);
        newTo   = today;
      } else if (historyView === 'year') {
        newFrom = `${now.getFullYear()}-01-01`;
        newTo   = today;
      } else if (historyView === 'month') {
        newFrom = toDateStr(new Date(now.getFullYear(), now.getMonth(), 1));
        newTo   = today;
      } else if (historyView === 'last-month') {
        newFrom = toDateStr(new Date(now.getFullYear(), now.getMonth() - 1, 1));
        newTo   = toDateStr(new Date(now.getFullYear(), now.getMonth(), 0));
      }
      setCustomFrom(newFrom);
      setCustomTo(newTo);
      localStorage.setItem(KEY_CUSTOM_FROM, newFrom);
      localStorage.setItem(KEY_CUSTOM_TO,   newTo);
    }

    setHistoryView(v);
    localStorage.setItem(KEY_HISTORY_VIEW, v);
    loadSessions(v, newFrom, newTo);
  }, [historyView, customFrom, customTo, loadSessions]);

  // ── セッション削除 ────────────────────────────────
  const deleteSession = useCallback(async (id: number) => {
    await timerDB.deleteSession(id);
    setSessions(prev => prev.filter(s => s.id !== id));
    const all = await timerDB.getAllSessions();
    setAllSessions(all);
    updateAutocompleteCaches(all);
  }, [updateAutocompleteCaches]);

  // ── JSON エクスポート ─────────────────────────────
  const handleExportJSON = useCallback(async () => {
    try {
      const data = await timerDB.exportAll();
      const json = JSON.stringify(data, null, 2);
      const ok = await FileSaver.save(json, `timer_${toDateStr(new Date())}.json`);
      if (ok) success('エクスポートしました');
    } catch { showError('エクスポートに失敗しました'); }
  }, [success, showError]);

  // ── JSON インポート ───────────────────────────────
  const handleImportJSON = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text    = await file.text();
        const data    = JSON.parse(text);
        const replace = confirm('既存のデータをすべて削除してインポートしますか？\n「キャンセル」を押すと追記インポートします。');
        await timerDB.importAll(data, replace);
        const pList = await timerDB.getPresets();
        setPresets(pList);
        if (!pList.some(p => p.id === activePresetRef.current)) {
          const next = pList[0]?.id ?? null;
          setActivePresetId(next); activePresetRef.current = next;
          if (pList[0]) { setRemaining(pList[0].work_sec); setTotal(pList[0].work_sec); }
        }
        const all = await timerDB.getAllSessions();
        setAllSessions(all);
        updateAutocompleteCaches(all);
        await loadSessions(historyView, customFrom, customTo);
        success('インポートしました');
      } catch { showError('インポートに失敗しました'); }
    };
    input.click();
  }, [historyView, customFrom, customTo, loadSessions, success, showError, updateAutocompleteCaches]);

  // ── CSV エクスポート ──────────────────────────────
  const handleExportCSV = useCallback(async () => {
    try {
      const ok = await exportCSV();
      if (ok) { const all = await timerDB.getAllSessions(); success(`${all.length}件のセッションをエクスポートしました`); }
      else showError('エクスポートするデータがありません');
    } catch { showError('CSVエクスポートに失敗しました'); }
  }, [success, showError]);

  // ── キーボードショートカット ──────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const inInput = ['INPUT','TEXTAREA','SELECT'].includes((e.target as HTMLElement).tagName)
        || (e.target as HTMLElement).isContentEditable;
      if (e.key === 'Escape' && inInput) { (e.target as HTMLElement).blur(); return; }
      if (showPresetModal) return;
      if (inInput) return;

      if (e.key === ' ') {
        e.preventDefault();
        runningRef.current ? handlePause() : handleStart();
      } else if (e.key === 'r' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        handleReset();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        e.preventDefault();
        setPresets(prev => {
          const idx  = prev.findIndex(p => p.id === activePresetRef.current);
          const next = e.key === 'ArrowRight' ? idx + 1 : idx - 1;
          if (next >= 0 && next < prev.length) {
            const id = prev[next].id!;
            setActivePresetId(id); activePresetRef.current = id;
            localStorage.setItem(KEY_ACTIVE_PRESET, String(id));
            if (!runningRef.current) {
              const rem = modeRef.current === 'work' ? prev[next].work_sec : prev[next].break_sec;
              setRemaining(rem); remainingRef.current = rem;
              setTotal(rem);     totalRef.current     = rem;
            }
          }
          return prev;
        });
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [handleStart, handlePause, handleReset, showPresetModal]);

  // ── 分析値 ────────────────────────────────────────
  const todayTotalSec = useMemo(() => {
    const today = toDateStr(new Date());
    return allSessions.filter(s => s.started_at.slice(0, 10) === today).reduce((sum, s) => sum + s.duration_sec, 0);
  }, [allSessions]);
  const streakDays = useMemo(() => computeStreak(allSessions, dailyGoalSec), [allSessions, dailyGoalSec]);
  const sessionTotalSec = useMemo(() => sessions.reduce((sum, s) => sum + s.duration_sec, 0), [sessions]);

  // タグ別集計
  const tagChartEntries = useMemo((): [string, number][] => {
    const map: Record<string, number> = {};
    sessions.forEach(s => { const k = s.tag || '（なし）'; map[k] = (map[k] || 0) + s.duration_sec; });
    const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
    if (!entries.length || (entries.length === 1 && entries[0][0] === '（なし）')) return [];
    return entries;
  }, [sessions]);

  // タスク別集計（上位10件）
  const taskChartEntries = useMemo((): [string, number][] => {
    const map: Record<string, number> = {};
    sessions.forEach(s => { const k = s.task_name || '（未設定）'; map[k] = (map[k] || 0) + s.duration_sec; });
    const entries = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (!entries.length || (entries.length === 1 && entries[0][0] === '（未設定）')) return [];
    return entries;
  }, [sessions]);

  // 曜日別平均（月曜始まり）
  const weekdayEntries = useMemo((): [string, number][] => {
    if (historyView === 'today' || historyView === 'yesterday') return [];
    const dateList = getDateList(historyView, customFrom, customTo);
    const byDate: Record<string, number> = {};
    sessions.forEach(s => { const d = s.started_at.slice(0, 10); byDate[d] = (byDate[d] || 0) + s.duration_sec; });
    const totals = [0,0,0,0,0,0,0];
    const counts = [0,0,0,0,0,0,0];
    dateList.forEach(d => {
      if (byDate[d]) { const dow = new Date(d).getDay(); totals[dow] += byDate[d]; counts[dow]++; }
    });
    const avgs = totals.map((t, i) => counts[i] > 0 ? Math.round(t / counts[i]) : 0);
    if (!avgs.some(v => v > 0)) return [];
    // 月・火・水・木・金・土・日 の順（JS: 1,2,3,4,5,6,0）
    return [1,2,3,4,5,6,0].map(dow => [`${DAY_NAMES[dow]}曜`, avgs[dow]]);
  }, [sessions, historyView, customFrom, customTo]);

  // ── 円形プログレス ────────────────────────────────
  const RADIUS = 90;
  const CIRC   = 2 * Math.PI * RADIUS;
  const progress = total > 0 ? remaining / total : 1;
  const strokeDashoffset = CIRC * (1 - progress);
  const strokeColor = mode === 'work' ? 'var(--c-accent)' : 'var(--c-success, #22c55e)';

  const isPaused = !running && pauseStartedAt !== null;
  const isIdle   = !running && !sessionStartTime && remaining === total;

  // ── セッションリスト（日付区切り付き） ────────────
  const sortedSessions = useMemo(() => [...sessions].sort((a, b) => b.started_at.localeCompare(a.started_at)), [sessions]);
  const groupedSessions = useMemo(() => {
    const map: Record<string, { totalSec: number; items: TimerSession[] }> = {};
    sortedSessions.forEach(s => {
      const d = s.started_at.slice(0, 10);
      if (!map[d]) map[d] = { totalSec: 0, items: [] };
      map[d].totalSec += s.duration_sec;
      map[d].items.push(s);
    });
    return Object.entries(map)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, data]) => ({ date, ...data }));
  }, [sortedSessions]);

  // ── タスク名入力（オートコンプリート付き） ───────
  const TaskInput = (
    <div className="relative flex-[3] min-w-0">
      <input
        ref={taskInputRef}
        type="text" value={taskName}
        onChange={e => {
          setTaskName(e.target.value);
          const q = e.target.value.trim();
          const cands = q
            ? recentTasks.current.filter(t => t.toLowerCase().includes(q.toLowerCase()))
            : recentTasks.current;
          setTaskCandidates(cands); acTask.show(cands);
        }}
        onFocus={() => { const c = recentTasks.current; setTaskCandidates(c); acTask.show(c); }}
        onBlur={() => setTimeout(() => setTaskCandidates([]), 150)}
        onKeyDown={e => acTask.handleKeyDown(e, taskCandidates)}
        placeholder="タスク名（任意）"
        className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] focus:outline-none focus:border-[var(--c-accent)] focus:shadow-[0_0_0_3px_var(--c-accent-dim,rgba(99,102,241,0.15))] transition-shadow"
      />
      {acTask.open && taskCandidates.length > 0 && (
        <ul className="absolute z-20 top-full left-0 right-0 mt-1 bg-[var(--c-bg)] border border-[var(--c-border)] rounded-lg shadow-lg overflow-hidden py-1">
          {taskCandidates.map((t, i) => (
            <li key={t} onMouseDown={e => { e.preventDefault(); setTaskName(t); setTaskCandidates([]); }}
              className={`px-3 py-1.5 text-sm cursor-pointer ${i === acTask.activeIdx ? 'bg-[var(--c-bg-2)] text-[var(--c-accent)]' : 'hover:bg-[var(--c-bg-2)]'}`}>
              {t}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  // ── タグ入力（オートコンプリート付き） ───────────
  const TagInput = (
    <div className="relative flex-[1] min-w-0">
      <input
        ref={tagInputRef}
        type="text" value={tag}
        onChange={e => {
          setTag(e.target.value);
          const q = e.target.value.trim();
          if (!q) { setTagCandidates([]); return; }
          const c = [...allTagSet.current].filter(t => t.toLowerCase().includes(q.toLowerCase())).sort().slice(0, 8);
          setTagCandidates(c); acTag.show(c);
        }}
        onFocus={() => {
          const q = tag.trim();
          if (q) { const c = [...allTagSet.current].filter(t => t.toLowerCase().includes(q.toLowerCase())).sort().slice(0, 8); setTagCandidates(c); acTag.show(c); }
        }}
        onBlur={() => setTimeout(() => setTagCandidates([]), 150)}
        onKeyDown={e => acTag.handleKeyDown(e, tagCandidates)}
        placeholder="タグ"
        className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] focus:outline-none focus:border-[var(--c-accent)] focus:shadow-[0_0_0_3px_var(--c-accent-dim,rgba(99,102,241,0.15))] transition-shadow"
      />
      {acTag.open && tagCandidates.length > 0 && (
        <ul className="absolute z-20 top-full left-0 right-0 mt-1 bg-[var(--c-bg)] border border-[var(--c-border)] rounded-lg shadow-lg overflow-hidden py-1">
          {tagCandidates.map((t, i) => (
            <li key={t} onMouseDown={e => { e.preventDefault(); setTag(t); setTagCandidates([]); }}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer ${i === acTag.activeIdx ? 'bg-[var(--c-bg-2)] text-[var(--c-accent)]' : 'hover:bg-[var(--c-bg-2)]'}`}>
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: tagColor(t) }} />
              {t}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── 2カラムレイアウト ─── */}
      <div className="flex gap-4 p-4 overflow-auto items-start flex-1">

        {/* 左カラム（sticky） */}
        <div className="sticky top-0 flex flex-col gap-4 shrink-0" style={{ width: 460 }}>

          {/* タイマーカード */}
          <div className={`flex flex-col items-center gap-3 p-5 rounded-xl border border-[var(--c-border)] bg-[var(--c-bg)] shadow-sm text-center transition-all ${flashing ? 'ring-2 ring-[var(--c-accent)]' : ''}`}>
            {/* モードバッジ */}
            <div className={`text-[11px] font-bold px-3 py-0.5 rounded-full transition-colors min-w-[5.5rem] text-center ${
              isIdle   ? 'bg-[var(--c-bg-2)] text-[var(--c-fg-3)]' :
              isPaused ? 'bg-amber-500/15 text-amber-500' :
              mode === 'work' ? 'bg-[var(--c-accent)]/15 text-[var(--c-accent)]' :
                                'bg-green-500/15 text-green-500'
            }`}>
              {isIdle ? '待機中' : isPaused ? '一時停止中' : mode === 'work' ? '作業中' : '休憩中'}
            </div>

            {/* 円形プログレス */}
            <div className="relative">
              <svg width="200" height="200" className="-rotate-90">
                <circle cx="100" cy="100" r={RADIUS} fill="none" stroke="var(--c-bg-2)" strokeWidth="8" />
                <circle cx="100" cy="100" r={RADIUS} fill="none" stroke={strokeColor} strokeWidth="8"
                  strokeDasharray={CIRC} strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.8s linear, stroke 0.4s ease' }} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
                <span className="font-extrabold tabular-nums leading-none tracking-tight" style={{ fontSize: '3rem' }}>
                  {fmtMMSS(remaining)}
                </span>
              </div>
            </div>

            {/* タスク名・タグ入力 */}
            <div className="flex gap-2 w-full">
              {TaskInput}
              {TagInput}
            </div>

            {/* 操作ボタン */}
            <div className="flex flex-col items-center gap-2 w-full">
              {/* メインボタン（開始/再開/一時停止） — 同一スタイル・固定幅でレイアウト安定 */}
              <div className="w-full flex justify-center">
                <button onClick={running ? handlePause : handleStart}
                  className="w-44 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-lg border border-[var(--c-border)] bg-[var(--c-accent)]/8 text-[var(--c-fg)] hover:bg-[var(--c-accent)]/15 hover:border-[var(--c-accent)]/60 hover:text-[var(--c-accent)] active:scale-95 transition-all">
                  {running ? '⏸ 一時停止' : isPaused ? '▶ 再開' : '▶ 開始'}
                </button>
              </div>
              {/* サブボタン行 — 非活性時は invisible でスペース確保しレイアウト固定 */}
              <div className="flex items-center justify-center gap-2">
                <button onClick={handleSkip}
                  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded border border-[var(--c-border)] text-[var(--c-fg-2)] hover:bg-[var(--c-bg-2)] hover:text-[var(--c-fg)] hover:border-[var(--c-accent)]/40 active:scale-95 transition-all">
                  ⏭ スキップ
                </button>
                <button
                  onClick={!isIdle ? handleReset : undefined}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded border border-[var(--c-border)] transition-all ${
                    isIdle
                      ? 'invisible pointer-events-none select-none'
                      : 'text-[var(--c-fg-2)] hover:bg-[var(--c-bg-2)] hover:text-[var(--c-fg)] hover:border-[var(--c-accent)]/40 active:scale-95'
                  }`}>
                  ↺ リセット
                </button>
                <button
                  onClick={mode === 'work' && sessionStartTime ? handleEnd : undefined}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded border transition-all ${
                    mode === 'work' && sessionStartTime
                      ? 'border-red-400/50 text-red-400 hover:bg-red-400/10 hover:border-red-400/70 active:scale-95'
                      : 'invisible pointer-events-none select-none'
                  }`}>
                  ⏹ 終了
                </button>
              </div>
            </div>

          </div>

          {/* プリセットカード */}
          <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-bg)] shadow-sm">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--c-border)]">
              <h2 className="text-sm font-bold flex-1 text-[var(--c-fg)]">プリセット</h2>
              <button onClick={() => { setPresetModal(null); setShowPresetModal(true); }}
                className="btn btn--ghost btn--sm text-xs">＋ 追加</button>
            </div>
            <div className="p-3">
              {presets.length === 0 ? (
                <p className="text-xs text-[var(--c-fg-3)] text-center py-3">プリセットがありません</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {presets.map(p => (
                    <div key={p.id} onClick={() => selectPreset(p.id!)}
                      className={`relative flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-all group ${activePresetId === p.id ? 'border-[var(--c-accent)] bg-[var(--c-accent)]/10' : 'border-[var(--c-border)] hover:border-[var(--c-accent)]/50 hover:bg-[var(--c-bg-2)]'}`}>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{p.name}</div>
                        <div className="text-[11px] text-[var(--c-fg-3)]">作業 {fmtDuration(p.work_sec)} / 休憩 {fmtDuration(p.break_sec)}</div>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                        <button onClick={() => { setPresetModal(p); setShowPresetModal(true); }}
                          className="w-6 h-6 flex items-center justify-center rounded text-[var(--c-fg-3)] hover:text-[var(--c-fg)] hover:bg-[var(--c-bg-2)] text-xs">✎</button>
                        <button onClick={() => deletePreset(p)}
                          className="w-6 h-6 flex items-center justify-center rounded text-red-400 hover:text-red-300 hover:bg-red-400/10 text-xs">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>{/* /左カラム */}

        {/* 右カラム（ログ・分析） */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">

          {/* goal-stats カード */}
          <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-bg)] shadow-sm px-4 py-3">
            <div className="flex items-center gap-3">
              {/* ストリーク */}
              <div className="flex flex-col items-center gap-0.5 shrink-0" style={{ minWidth: 52 }}>
                <span
                  className={`font-extrabold tabular-nums leading-none ${streakDays >= 7 ? 'text-[var(--c-accent)]' : 'text-[var(--c-fg)]'}`}
                  style={{
                    fontSize: 26,
                    ...(streakDays >= 7 ? { filter: 'drop-shadow(0 0 6px color-mix(in srgb, var(--c-accent) 60%, transparent))' } : {}),
                  }}
                >{streakDays}</span>
                <span className="text-[10px] font-semibold text-[var(--c-fg-2)]">日連続</span>
                {streakDays > 0 && <span style={{ fontSize: 12, lineHeight: 1 }}>🔥</span>}
              </div>

              <div className="w-px self-stretch bg-[var(--c-border)] shrink-0" />

              {/* 今日の合計 / 目標プログレス */}
              {dailyGoalSec > 0 && historyView === 'today' ? (
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--c-bg-2)' }}>
                    <div className="h-full rounded-full transition-all" style={{
                      width: `${Math.min(100, Math.round(todayTotalSec / dailyGoalSec * 100))}%`,
                      background: 'var(--c-accent)',
                    }} />
                  </div>
                  <div className="flex items-center gap-1 text-xs">
                    <span className="font-semibold text-[var(--c-fg)]">{fmtDuration(todayTotalSec)}</span>
                    <span className="text-[var(--c-fg-3)]">/ {fmtDuration(dailyGoalSec)}</span>
                    <span className="ml-auto font-bold text-[var(--c-accent)]">
                      {Math.min(100, Math.round(todayTotalSec / dailyGoalSec * 100))}%
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span className="text-base font-bold leading-none text-[var(--c-fg)]">{fmtDuration(todayTotalSec)}</span>
                  <span className="text-[10px] text-[var(--c-fg-3)]">今日の作業時間</span>
                </div>
              )}

              <div className="w-px self-stretch bg-[var(--c-border)] shrink-0" />

              {/* 目標設定 */}
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[11px] text-[var(--c-fg-3)]">目標</span>
                <select value={dailyGoalSec} onChange={e => { const v = Number(e.target.value); setDailyGoalSec(v); localStorage.setItem(KEY_DAILY_GOAL, String(v)); }}
                  className="text-xs px-2 py-1 rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)]">
                  <option value={0}>設定しない</option>
                  {[1,2,3,4,6,8].map(h => <option key={h} value={h * 3600}>{h}時間</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* 作業ログカード */}
          <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-bg)] shadow-sm">
            {/* ヘッダー */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--c-border)]">
              <h2 className="text-sm font-bold flex-1 text-[var(--c-fg)]">作業ログ</h2>
              {sessions.length > 0 && (
                <span className="text-xs font-semibold text-[var(--c-accent)]">合計: {fmtDuration(sessionTotalSec)}</span>
              )}
              <button onClick={handleExportCSV}
                className="btn btn--icon btn--sm"
                title="全セッションをCSV出力">
                <FileDown size={14} aria-hidden="true" />
              </button>
              <button onClick={handleExportJSON}
                className="btn btn--icon btn--sm"
                title="JSONエクスポート">
                <Download size={14} aria-hidden="true" />
              </button>
              <button onClick={handleImportJSON}
                className="btn btn--icon btn--sm"
                title="JSONインポート">
                <Upload size={14} aria-hidden="true" />
              </button>
            </div>

            {/* 期間タブ */}
            <div className="flex items-center gap-1 px-4 py-2.5 border-b border-[var(--c-border)] flex-wrap">
              {([['today','今日'],['yesterday','昨日'],['week','今週'],['last-week','先週'],['month','今月'],['last-month','先月'],['last-7','過去7日'],['last-30','過去30日'],['quarter','今四半期'],['year','今年'],['custom','期間']] as [HistoryView, string][]).map(([v, label]) => (
                <button key={v} onClick={() => changeView(v)}
                  className={`text-xs px-2.5 py-1 rounded border transition-colors ${historyView === v ? 'bg-[var(--c-accent)] text-white border-[var(--c-accent)]' : 'border-[var(--c-border)] text-[var(--c-fg-2)] hover:bg-[var(--c-bg-2)]'}`}>
                  {label}
                </button>
              ))}
            </div>

            {/* カスタム期間 */}
            {historyView === 'custom' && (
              <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--c-border)]">
                <DatePicker
                  compact
                  value={customFrom}
                  placeholder="開始日"
                  onChange={v => { setCustomFrom(v); localStorage.setItem(KEY_CUSTOM_FROM, v); loadSessions('custom', v, customTo); }}
                  onClear={() => { setCustomFrom(''); localStorage.setItem(KEY_CUSTOM_FROM, ''); loadSessions('custom', '', customTo); }}
                />
                <span className="text-xs text-[var(--c-fg-3)]">〜</span>
                <DatePicker
                  compact
                  value={customTo}
                  placeholder="終了日"
                  onChange={v => { setCustomTo(v); localStorage.setItem(KEY_CUSTOM_TO, v); loadSessions('custom', customFrom, v); }}
                  onClear={() => { setCustomTo(''); localStorage.setItem(KEY_CUSTOM_TO, ''); loadSessions('custom', customFrom, ''); }}
                />
              </div>
            )}

            {/* 分析チャート */}
            <div className="flex flex-col gap-4 p-4">
              {(historyView === 'today' || historyView === 'yesterday') ? (
                <TodayTimeline sessions={sessions} goalSec={dailyGoalSec} />
              ) : (
                <DailyChart sessions={sessions} historyView={historyView} customFrom={customFrom} customTo={customTo} goalSec={dailyGoalSec} />
              )}
              {tagChartEntries.length > 0 && (
                <HBarChart title="タグ別集計" entries={tagChartEntries} colorFn={tagColor} />
              )}
              {taskChartEntries.length > 0 && (
                <HBarChart title="タスク別集計" entries={taskChartEntries} barColor="var(--c-success, #10b981)" />
              )}
              {weekdayEntries.length > 0 && (
                <HBarChart title="曜日別平均" entries={weekdayEntries} barColor="var(--c-warning, #f59e0b)" />
              )}
            </div>

            {/* セッション一覧 */}
            {sessions.length === 0 ? (
              <div className="px-4 pb-6 text-center text-sm text-[var(--c-fg-3)]">記録がありません</div>
            ) : (
              <div className="flex flex-col gap-2 px-3 pb-3">
                {(historyView === 'today' || historyView === 'yesterday') ? (() => {
                  const maxSec = Math.max(...sortedSessions.map(s => s.duration_sec), 1);
                  return (
                    <div className="rounded-xl border border-[var(--c-border)] overflow-hidden">
                      {sortedSessions.map(s => (
                        <SessionRow key={s.id} session={s} onDelete={deleteSession} maxSec={maxSec} />
                      ))}
                    </div>
                  );
                })() : (
                  groupedSessions.map(group => {
                    const maxSec = Math.max(...group.items.map(s => s.duration_sec), 1);
                    return (
                      <div key={group.date} className="rounded-xl border border-[var(--c-border)] overflow-hidden">
                        <div className="flex items-center gap-2 px-3 py-2.5 bg-[var(--c-bg-2)] border-b border-[var(--c-border)]">
                          <span className="text-[11px] font-bold text-[var(--c-fg-2)]">
                            {fmtDateHeader(group.date)}
                          </span>
                          <span className="text-[10px] text-[var(--c-fg-3)]">{group.items.length}件</span>
                          <span className="ml-auto text-xs font-bold" style={{ color: 'var(--c-accent)' }}>
                            {fmtDuration(group.totalSec)}
                          </span>
                        </div>
                        {group.items.map(s => (
                          <SessionRow key={s.id} session={s} onDelete={deleteSession} maxSec={maxSec} />
                        ))}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

        </div>{/* /右カラム */}
      </div>{/* /2カラム */}

      {/* プリセットモーダル */}
      {showPresetModal && (
        <PresetModal
          preset={presetModal}
          onSave={savePreset}
          onClose={() => setShowPresetModal(false)}
        />
      )}

      <ShortcutHelp categories={TIMER_SHORTCUTS} />
    </div>
  );
}
