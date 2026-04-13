// ==================================================
// TimerPage — 定型作業タイマー（React 移行版）
// ==================================================
// Web Worker ベースのカウントダウン、プリセット CRUD、セッション履歴

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useToast } from '../components/Toast';
import { timerDB, type TimerPreset, type TimerSession } from '../db/timer_db';

// ── ストレージキー ─────────────────────────────────
const KEY_ACTIVE_PRESET  = 'timer_active_preset';
const KEY_HISTORY_VIEW   = 'timer_history_view';
const KEY_RUNNING_STATE  = 'timer_running_state';
const KEY_DAILY_GOAL     = 'timer_daily_goal';
const KEY_CUSTOM_FROM    = 'timer_custom_from';
const KEY_CUSTOM_TO      = 'timer_custom_to';

type TimerMode    = 'work' | 'break';
type HistoryView  = 'today' | 'week' | 'month' | 'last-month' | 'custom';

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

const TAG_PALETTE = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316','#3b82f6','#84cc16'];
function tagColor(tag: string) {
  if (!tag) return TAG_PALETTE[0];
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (Math.imul(31, h) + tag.charCodeAt(i)) | 0;
  return TAG_PALETTE[Math.abs(h) % TAG_PALETTE.length];
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

// ================================================================
// プリセット編集モーダル
// ================================================================
function PresetModal({ preset, onSave, onClose }: {
  preset: TimerPreset | null;
  onSave: (name: string, workMin: number, breakMin: number) => void;
  onClose: () => void;
}) {
  const [name, setName]   = useState(preset?.name || '');
  const [work, setWork]   = useState(preset ? Math.round(preset.work_sec / 60) : 25);
  const [brk,  setBreak]  = useState(preset ? Math.round(preset.break_sec / 60) : 5);
  const { error: showError } = useToast();
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { nameRef.current?.focus(); }, []);

  const handleSave = () => {
    if (!name.trim()) { showError('プリセット名を入力してください'); return; }
    if (work < 1) { showError('作業時間は1分以上で入力してください'); return; }
    if (brk < 1)  { showError('休憩時間は1分以上で入力してください'); return; }
    onSave(name.trim(), work, brk);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[var(--c-bg)] rounded-xl border border-[var(--c-border)] shadow-2xl w-full max-w-sm mx-4" onKeyDown={e => { if (e.key === 'Escape') onClose(); if (e.key === 'Enter') handleSave(); }}>
        <div className="px-5 py-4 border-b border-[var(--c-border)] flex justify-between">
          <h2 className="font-semibold">{preset ? 'プリセットを編集' : 'プリセットを追加'}</h2>
          <button onClick={onClose} className="text-[var(--c-text-3)] hover:text-[var(--c-text)]">×</button>
        </div>
        <div className="px-5 py-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--c-text-3)]">プリセット名</label>
            <input ref={nameRef} type="text" value={name} onChange={e => setName(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-[var(--c-border)] bg-[var(--c-bg-2)] text-[var(--c-text)] focus:outline-none focus:border-[var(--c-accent)]" />
          </div>
          <div className="flex gap-4">
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-xs text-[var(--c-text-3)]">作業時間（分）</label>
              <input type="number" min={1} max={120} value={work} onChange={e => setWork(Number(e.target.value))}
                className="px-3 py-2 text-sm rounded-lg border border-[var(--c-border)] bg-[var(--c-bg-2)] text-[var(--c-text)] focus:outline-none focus:border-[var(--c-accent)]" />
            </div>
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-xs text-[var(--c-text-3)]">休憩時間（分）</label>
              <input type="number" min={1} max={60} value={brk} onChange={e => setBreak(Number(e.target.value))}
                className="px-3 py-2 text-sm rounded-lg border border-[var(--c-border)] bg-[var(--c-bg-2)] text-[var(--c-text)] focus:outline-none focus:border-[var(--c-accent)]" />
            </div>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-[var(--c-border)] flex gap-2 justify-end">
          <button onClick={onClose} className="btn btn--ghost btn--sm">キャンセル</button>
          <button onClick={handleSave} className="btn btn--primary btn--sm">保存</button>
        </div>
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
  const [presets, setPresets]   = useState<TimerPreset[]>([]);
  const [sessions, setSessions] = useState<TimerSession[]>([]);
  const [allSessions, setAllSessions] = useState<TimerSession[]>([]);
  const [activePresetId, setActivePresetId] = useState<number | null>(
    () => Number(localStorage.getItem(KEY_ACTIVE_PRESET)) || null
  );

  // ── タイマー状態 ──────────────────────────────────
  const [mode, setMode]         = useState<TimerMode>('work');
  const [remaining, setRemaining] = useState(0);
  const [total, setTotal]       = useState(0);
  const [running, setRunning]   = useState(false);
  const [taskName, setTaskName] = useState('');
  const [tag, setTag]           = useState('');
  const [sessionStartTime, setSessionStartTime] = useState<string | null>(null);
  const [pausedDurationSec, setPausedDuration]  = useState(0);
  const [pauseStartedAt, setPauseStartedAt]     = useState<number | null>(null);
  const [flashing, setFlashing] = useState(false);

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
  const [presetModal, setPresetModal] = useState<TimerPreset | null | 'new'>(null);
  const [showPresetModal, setShowPresetModal] = useState(false);

  // ── Refs ──────────────────────────────────────────
  const workerRef      = useRef<Worker | null>(null);
  const intervalRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const runningRef     = useRef(false);
  const remainingRef   = useRef(0);
  const totalRef       = useRef(0);
  const modeRef        = useRef<TimerMode>('work');
  const sessionStartRef = useRef<string | null>(null);
  const pausedDurRef   = useRef(0);
  const pauseStartRef  = useRef<number | null>(null);
  const taskNameRef    = useRef('');
  const tagRef         = useRef('');
  const activePresetRef = useRef<number | null>(null);

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

  // ── タイマーUI タイトル更新 ───────────────────────
  useEffect(() => {
    if (running) {
      document.title = `${mode === 'work' ? '▶' : '☕'} ${fmtMMSS(remaining)} 定型作業タイマー`;
    } else {
      document.title = '定型作業タイマー';
    }
    return () => { document.title = '定型作業タイマー'; };
  }, [running, remaining, mode]);

  // ── セッション読み込み ────────────────────────────
  const loadSessions = useCallback(async (view: HistoryView, from: string, to: string) => {
    const today = toDateStr(new Date());
    const now   = new Date();
    let loaded: TimerSession[];
    if (view === 'today') {
      loaded = await timerDB.getSessionsByDate(today);
    } else if (view === 'week') {
      const dow = now.getDay() || 7;
      const mon = new Date(now); mon.setDate(now.getDate() - (dow - 1));
      loaded = await timerDB.getSessionsInRange(toDateStr(mon), today);
    } else if (view === 'month') {
      loaded = await timerDB.getSessionsInRange(toDateStr(new Date(now.getFullYear(), now.getMonth(), 1)), today);
    } else if (view === 'last-month') {
      loaded = await timerDB.getSessionsInRange(
        toDateStr(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        toDateStr(new Date(now.getFullYear(), now.getMonth(), 0))
      );
    } else {
      loaded = (from && to) ? await timerDB.getSessionsInRange(from, to) : [];
    }
    setSessions(loaded);
  }, []);

  // ── 初期化 ────────────────────────────────────────
  useEffect(() => {
    workerRef.current = createTimerWorker();

    const init = async () => {
      const pList = await timerDB.getPresets();
      setPresets(pList);

      const all = await timerDB.getAllSessions();
      setAllSessions(all);

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
      setRemaining(rem);
      remainingRef.current = rem;
      saveTimerState();
      if (rem <= 0) handlePhaseEnd();
    };
    w.addEventListener('message', handler);
    return () => w.removeEventListener('message', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── フェーズ終了 ──────────────────────────────────
  const handlePhaseEnd = useCallback(async () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    setRunning(false); runningRef.current = false;

    playBeep();
    setFlashing(true);
    setTimeout(() => setFlashing(false), 2000);

    if (modeRef.current === 'work') {
      await doSaveSession({});
      setMode('break'); modeRef.current = 'break';
      success('作業完了！休憩しましょう');
      try { new Notification('⏰ 作業時間終了', { body: 'お疲れ様でした！休憩しましょう。', tag: 'timer-alert' }); } catch { /* ignore */ }
    } else {
      setMode('work'); modeRef.current = 'work';
      showToast('休憩終了。作業を再開しましょう！', 'info');
      try { new Notification('☕ 休憩終了', { body: '作業を再開しましょう！', tag: 'timer-alert' }); } catch { /* ignore */ }
    }

    // 次フェーズの残り時間をセット
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
    clearTimerState();
    await loadSessions(historyView, customFrom, customTo);
    setAllSessions(await timerDB.getAllSessions());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyView, customFrom, customTo]);

  // ── セッション保存 ────────────────────────────────
  const doSaveSession = useCallback(async ({ minDuration = 5 }: { minDuration?: number }) => {
    if (!sessionStartRef.current) return false;
    const endTime   = new Date().toISOString();
    const wallSec   = Math.round((new Date(endTime).getTime() - new Date(sessionStartRef.current).getTime()) / 1000);
    const durSec    = Math.max(0, wallSec - pausedDurRef.current);
    if (durSec < minDuration) return false;
    const session: Omit<TimerSession, 'id'> = {
      task_name: taskNameRef.current || '（未設定）',
      tag: tagRef.current || '',
      notes: '',
      duration_sec: durSec,
      started_at: sessionStartRef.current,
      ended_at: endTime,
    };
    try {
      await timerDB.addSession(session);
      return true;
    } catch { return false; }
  }, []);

  // ── タイマー開始 ──────────────────────────────────
  const handleStart = useCallback(async () => {
    if (runningRef.current) return;
    const pList = await timerDB.getPresets();
    const preset = getActivePreset(pList, activePresetRef.current);
    if (!preset) { showError('プリセットを選択してください'); return; }

    warmUpAudio();
    if (Notification.permission === 'default') Notification.requestPermission();

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
    } else if (pauseStartRef.current !== null) {
      const addedSec = Math.floor((Date.now() - pauseStartRef.current) / 1000);
      const newPaused = pausedDurRef.current + addedSec;
      setPausedDuration(newPaused); pausedDurRef.current = newPaused;
      setPauseStartedAt(null); pauseStartRef.current = null;
    }

    setRunning(true); runningRef.current = true;

    if (workerRef.current) {
      workerRef.current.postMessage({ cmd: 'start', remaining: remainingRef.current });
    } else {
      const startedAt = Date.now();
      const startRem  = remainingRef.current;
      intervalRef.current = setInterval(() => {
        const rem = Math.max(0, startRem - Math.floor((Date.now() - startedAt) / 1000));
        setRemaining(rem); remainingRef.current = rem;
        saveTimerState();
        if (rem <= 0) handlePhaseEnd();
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
    saveTimerState();
  }, [saveTimerState]);

  // ── 途中終了 ──────────────────────────────────────
  const handleEnd = useCallback(async () => {
    workerRef.current?.postMessage({ cmd: 'stop' });
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    setRunning(false); runningRef.current = false;

    if (modeRef.current === 'work' && sessionStartRef.current) {
      const saved = await doSaveSession({ minDuration: 1 });
      if (saved) success('作業を終了して記録しました');
      await loadSessions(historyView, customFrom, customTo);
      setAllSessions(await timerDB.getAllSessions());
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
    clearTimerState();
  }, [doSaveSession, getActivePreset, historyView, customFrom, customTo, success, clearTimerState, loadSessions]);

  // ── スキップ ──────────────────────────────────────
  const handleSkip = useCallback(async () => {
    if (modeRef.current === 'work' && sessionStartRef.current) {
      await doSaveSession({});
      await loadSessions(historyView, customFrom, customTo);
      setAllSessions(await timerDB.getAllSessions());
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
  }, [doSaveSession, getActivePreset, historyView, customFrom, customTo, saveTimerState, loadSessions]);

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

  // ── プリセット保存 ────────────────────────────────
  const savePreset = useCallback(async (name: string, workMin: number, breakMin: number) => {
    const editing = presetModal && typeof presetModal === 'object' ? presetModal : null;
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
        if (activePresetRef.current === updated.id) {
          const rem = modeRef.current === 'work' ? updated.work_sec : updated.break_sec;
          setRemaining(rem); setTotal(rem);
        }
        success('プリセットを更新しました');
      } else {
        const added = await timerDB.addPreset(preset);
        setPresets(prev => [...prev, added]);
        if (!activePresetRef.current) {
          setActivePresetId(added.id!); activePresetRef.current = added.id!;
          localStorage.setItem(KEY_ACTIVE_PRESET, String(added.id));
          setRemaining(added.work_sec); setTotal(added.work_sec);
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
      if (nextPreset) { setRemaining(nextPreset.work_sec); setTotal(nextPreset.work_sec); }
    }
    success('削除しました');
  }, [presets, activePresetId, success]);

  // ── 履歴ビュー切替 ───────────────────────────────
  const changeView = useCallback((v: HistoryView) => {
    setHistoryView(v);
    localStorage.setItem(KEY_HISTORY_VIEW, v);
    loadSessions(v, customFrom, customTo);
  }, [customFrom, customTo, loadSessions]);

  // ── セッション削除 ────────────────────────────────
  const deleteSession = useCallback(async (id: number) => {
    await timerDB.deleteSession(id);
    setSessions(prev => prev.filter(s => s.id !== id));
    setAllSessions(prev => prev.filter(s => s.id !== id));
  }, []);

  // ── 分析値 ────────────────────────────────────────
  const todayTotalSec = useMemo(() => {
    const today = toDateStr(new Date());
    return allSessions.filter(s => s.started_at.slice(0, 10) === today).reduce((sum, s) => sum + s.duration_sec, 0);
  }, [allSessions]);
  const streakDays = useMemo(() => computeStreak(allSessions, dailyGoalSec), [allSessions, dailyGoalSec]);

  const sessionTotalSec = useMemo(() => sessions.reduce((sum, s) => sum + s.duration_sec, 0), [sessions]);

  // ── 円形プログレス ────────────────────────────────
  const RADIUS = 90;
  const CIRC   = 2 * Math.PI * RADIUS;
  const progress = total > 0 ? remaining / total : 1;
  const strokeDashoffset = CIRC * (1 - progress);
  const strokeColor = mode === 'work' ? 'var(--c-accent)' : 'var(--c-success)';

  // ── 一時停止中かどうか ────────────────────────────
  const isPaused = !running && pauseStartedAt !== null;

  return (
    <div className="flex flex-col gap-4 p-4 overflow-auto">
      {/* タイマーセクション */}
      <div className={`flex flex-col items-center gap-4 p-6 rounded-xl border border-[var(--c-border)] bg-[var(--c-bg-2)] transition-all ${flashing ? 'ring-2 ring-[var(--c-accent)]' : ''}`}>
        {/* モードバッジ */}
        <div className={`text-xs font-semibold px-3 py-1 rounded-full ${mode === 'work' ? 'bg-[var(--c-accent)]/20 text-[var(--c-accent)]' : 'bg-green-500/20 text-green-400'}`}>
          {mode === 'work' ? '作業中' : '休憩中'}
          {isPaused && <span className="ml-2 opacity-70">（一時停止）</span>}
        </div>

        {/* 円形プログレス */}
        <div className="relative">
          <svg width="220" height="220" className="-rotate-90">
            <circle cx="110" cy="110" r={RADIUS} fill="none" stroke="var(--c-border)" strokeWidth="10" />
            <circle cx="110" cy="110" r={RADIUS} fill="none" stroke={strokeColor} strokeWidth="10"
              strokeDasharray={CIRC} strokeDashoffset={strokeDashoffset}
              strokeLinecap="round" style={{ transition: 'stroke-dashoffset 1s linear' }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-5xl font-mono font-bold tabular-nums">{fmtMMSS(remaining)}</span>
          </div>
        </div>

        {/* タスク名・タグ入力 */}
        <div className="flex gap-2 w-full max-w-sm">
          <input type="text" value={taskName} onChange={e => setTaskName(e.target.value)} placeholder="タスク名"
            className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-text)] focus:outline-none focus:border-[var(--c-accent)]" />
          <input type="text" value={tag} onChange={e => setTag(e.target.value)} placeholder="タグ"
            className="w-24 px-3 py-1.5 text-sm rounded-lg border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-text)] focus:outline-none focus:border-[var(--c-accent)]" />
        </div>

        {/* 操作ボタン */}
        <div className="flex gap-3">
          {!running ? (
            <button onClick={handleStart} className="btn btn--primary px-6 py-2 text-base">
              ▶ 開始
            </button>
          ) : (
            <button onClick={handlePause} className="btn btn--secondary px-6 py-2 text-base">
              ⏸ 一時停止
            </button>
          )}
          <button onClick={handleSkip} className="btn btn--ghost px-4 py-2">スキップ</button>
          {mode === 'work' && sessionStartTime && (
            <button onClick={handleEnd} className="btn btn--ghost px-4 py-2 text-red-400 hover:text-red-300">途中終了</button>
          )}
        </div>
      </div>

      {/* プリセットリスト */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm text-[var(--c-text-2)]">プリセット</h3>
          <button onClick={() => { setPresetModal(null); setShowPresetModal(true); }} className="btn btn--ghost btn--sm text-xs">
            + 追加
          </button>
        </div>
        {presets.length === 0 ? (
          <p className="text-sm text-[var(--c-text-3)] text-center py-4">プリセットがありません。追加してください。</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {presets.map(p => (
              <div key={p.id} onClick={() => selectPreset(p.id!)}
                className={`relative rounded-lg border p-3 cursor-pointer transition-all ${activePresetId === p.id ? 'border-[var(--c-accent)] bg-[var(--c-accent)]/10' : 'border-[var(--c-border)] hover:border-[var(--c-accent)]/50 bg-[var(--c-bg-2)]'}`}>
                <div className="font-medium text-sm truncate">{p.name}</div>
                <div className="text-xs text-[var(--c-text-2)] mt-0.5">作業 {fmtDuration(p.work_sec)} / 休憩 {fmtDuration(p.break_sec)}</div>
                <div className="absolute top-1 right-1 flex gap-1 opacity-0 hover:opacity-100 group-hover:opacity-100" onClick={e => e.stopPropagation()}>
                  <button onClick={() => { setPresetModal(p); setShowPresetModal(true); }} className="text-[var(--c-text-3)] hover:text-[var(--c-text)] text-xs p-0.5">✎</button>
                  <button onClick={() => deletePreset(p)} className="text-red-400 hover:text-red-300 text-xs p-0.5">✕</button>
                </div>
                <div className="absolute top-1 right-1 flex gap-1" onClick={e => e.stopPropagation()}>
                  <button onClick={() => { setPresetModal(p); setShowPresetModal(true); }} className="text-[var(--c-text-3)] hover:text-[var(--c-text)] text-xs p-0.5 opacity-60 hover:opacity-100">✎</button>
                  <button onClick={() => deletePreset(p)} className="text-red-400 hover:text-red-300 text-xs p-0.5 opacity-60 hover:opacity-100">✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 履歴・分析 */}
      <div className="flex flex-col gap-3">
        {/* 分析バー */}
        <div className="flex gap-4 p-4 rounded-xl border border-[var(--c-border)] bg-[var(--c-bg-2)] flex-wrap">
          <div className="flex flex-col">
            <span className="text-xs text-[var(--c-text-3)]">今日の合計</span>
            <span className="font-bold">{fmtDuration(todayTotalSec)}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-[var(--c-text-3)]">連続達成</span>
            <span className="font-bold">{streakDays} 日</span>
          </div>
          {dailyGoalSec > 0 && (
            <div className="flex flex-col flex-1 min-w-32">
              <span className="text-xs text-[var(--c-text-3)]">目標達成率 {Math.min(100, Math.round(todayTotalSec / dailyGoalSec * 100))}%</span>
              <div className="mt-1 h-2 rounded-full bg-[var(--c-bg-3)] overflow-hidden">
                <div className="h-full rounded-full bg-[var(--c-accent)] transition-all"
                  style={{ width: `${Math.min(100, Math.round(todayTotalSec / dailyGoalSec * 100))}%` }} />
              </div>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <span className="text-xs text-[var(--c-text-3)]">日次目標</span>
            <select value={dailyGoalSec} onChange={e => {
              const v = Number(e.target.value);
              setDailyGoalSec(v);
              localStorage.setItem(KEY_DAILY_GOAL, String(v));
            }} className="text-xs px-2 py-1 rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-text)]">
              <option value={0}>なし</option>
              {[1,2,3,4,6,8].map(h => <option key={h} value={h * 3600}>{h}時間</option>)}
            </select>
          </div>
        </div>

        {/* 期間切替 */}
        <div className="flex gap-1 flex-wrap">
          {([['today','今日'],['week','今週'],['month','今月'],['last-month','先月'],['custom','カスタム']] as [HistoryView, string][]).map(([v, label]) => (
            <button key={v} onClick={() => changeView(v)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${historyView === v ? 'bg-[var(--c-accent)] text-white border-[var(--c-accent)]' : 'border-[var(--c-border)] text-[var(--c-text-2)] hover:border-[var(--c-accent)]'}`}>
              {label}
            </button>
          ))}
        </div>
        {historyView === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" value={customFrom} onChange={e => { setCustomFrom(e.target.value); localStorage.setItem(KEY_CUSTOM_FROM, e.target.value); loadSessions('custom', e.target.value, customTo); }}
              className="px-2 py-1.5 text-xs rounded-lg border border-[var(--c-border)] bg-[var(--c-bg-2)] text-[var(--c-text)] focus:outline-none focus:border-[var(--c-accent)]" />
            <span className="text-xs text-[var(--c-text-3)]">〜</span>
            <input type="date" value={customTo} onChange={e => { setCustomTo(e.target.value); localStorage.setItem(KEY_CUSTOM_TO, e.target.value); loadSessions('custom', customFrom, e.target.value); }}
              className="px-2 py-1.5 text-xs rounded-lg border border-[var(--c-border)] bg-[var(--c-bg-2)] text-[var(--c-text)] focus:outline-none focus:border-[var(--c-accent)]" />
          </div>
        )}

        {/* セッション一覧 */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-[var(--c-text-2)]">合計: {fmtDuration(sessionTotalSec)}</span>
          <span className="text-xs text-[var(--c-text-3)]">{sessions.length} 件</span>
        </div>
        {sessions.length === 0 ? (
          <p className="text-center text-sm text-[var(--c-text-3)] py-4">記録がありません</p>
        ) : (
          <div className="flex flex-col divide-y divide-[var(--c-border)] rounded-lg border border-[var(--c-border)] overflow-hidden">
            {[...sessions].reverse().map(s => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--c-bg-2)] transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{s.task_name}</span>
                    {s.tag && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full text-white shrink-0"
                        style={{ backgroundColor: tagColor(s.tag) + 'cc' }}>
                        {s.tag}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-[var(--c-text-3)]">{toHHMM(s.started_at)} → {toHHMM(s.ended_at)}</span>
                </div>
                <span className="text-sm font-mono shrink-0">{fmtDuration(s.duration_sec)}</span>
                <button onClick={() => deleteSession(s.id!)} className="text-[var(--c-text-3)] hover:text-red-400 text-xs shrink-0">✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* プリセットモーダル */}
      {showPresetModal && (
        <PresetModal
          preset={presetModal as TimerPreset | null}
          onSave={savePreset}
          onClose={() => setShowPresetModal(false)}
        />
      )}
    </div>
  );
}
