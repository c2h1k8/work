// ==================================================
// DiffToolPage: 差分比較ツール
// ==================================================

import styles from '../styles/pages/diff_tool.module.css';
import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Upload } from 'lucide-react';
import { Clipboard } from '../core/clipboard';
import { useIsActiveTab } from '../contexts/TabContext';
import { Toast } from '../components/Toast';
import { ShortcutHelp } from '../components/ShortcutHelp';

// --------------------------------------------------
// Myers diff アルゴリズム
// --------------------------------------------------
type DiffItem = { type: 'equal' | 'add' | 'remove'; value: string };

function myersDiff(a: string[], b: string[]): DiffItem[] {
  const N = a.length, M = b.length;
  if (N === 0 && M === 0) return [];
  if (N === 0) return b.map((v) => ({ type: 'add', value: v }));
  if (M === 0) return a.map((v) => ({ type: 'remove', value: v }));

  const max = N + M;
  const offset = max;
  const v = new Array(2 * max + 1).fill(0);
  const trace: number[][] = [];

  outer: for (let d = 0; d <= max; d++) {
    for (let k = -d; k <= d; k += 2) {
      let x =
        k === -d || (k !== d && v[k - 1 + offset] < v[k + 1 + offset])
          ? v[k + 1 + offset]
          : v[k - 1 + offset] + 1;
      let y = x - k;
      while (x < N && y < M && a[x] === b[y]) { x++; y++; }
      v[k + offset] = x;
      if (x >= N && y >= M) { trace.push([...v]); break outer; }
    }
    trace.push([...v]);
  }

  const result: DiffItem[] = [];
  let x = N, y = M;
  for (let d = trace.length - 1; d >= 1; d--) {
    const vp = trace[d - 1];
    const k = x - y;
    const prevK =
      k === -d || (k !== d && (vp[k - 1 + offset] ?? 0) < (vp[k + 1 + offset] ?? 0))
        ? k + 1 : k - 1;
    const prevX = vp[prevK + offset] ?? 0;
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) { x--; y--; result.unshift({ type: 'equal', value: a[x] }); }
    if (y > prevY) { y--; result.unshift({ type: 'add', value: b[y] }); }
    else if (x > prevX) { x--; result.unshift({ type: 'remove', value: a[x] }); }
  }
  if (x > 0 && y > 0) result.unshift({ type: 'equal', value: a[0] });
  else if (y > 0) result.unshift({ type: 'add', value: b[0] });
  else if (x > 0) result.unshift({ type: 'remove', value: a[0] });
  return result;
}

// 長い文字列はスキップ（パフォーマンス対策）
function charDiff(left: string, right: string): DiffItem[] | null {
  if (left.length + right.length > 2000) return null;
  return myersDiff([...left], [...right]);
}

const DIFF_MAX_FILE_SIZE = 5 * 1024 * 1024;  // 5MB
const DIFF_MAX_LINES     = 30_000;            // 片側上限（Worker メモリ安全）

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// --------------------------------------------------
// 統合ビュー用の型と構築
// --------------------------------------------------
const CONTEXT = 3;

type DiffLine =
  | { kind: 'equal';    left: string; ln: number; rn: number }
  | { kind: 'add';      right: string; rn: number; isHtml?: true }
  | { kind: 'remove';   left: string; ln: number; isHtml?: true }
  | { kind: 'collapsed'; items: { left: string; ln: number; rn: number }[] };

function buildLines(diff: DiffItem[]): DiffLine[] {
  type EqBuf = { left: string; ln: number; rn: number }[];
  const groups: ({ type: 'change'; item: DiffItem & { ln: number; rn: number } } | { type: 'eq-block'; items: EqBuf })[] = [];
  let eqBuf: EqBuf = [];
  let ln = 0, rn = 0;

  const numbered = diff.map((item) => {
    if (item.type === 'remove') { ln++; return { ...item, ln, rn: 0 }; }
    if (item.type === 'add')    { rn++; return { ...item, ln: 0, rn }; }
    ln++; rn++;
    return { ...item, ln, rn };
  });

  for (const item of numbered) {
    if (item.type === 'equal') {
      eqBuf.push({ left: item.value, ln: item.ln, rn: item.rn });
    } else {
      if (eqBuf.length) { groups.push({ type: 'eq-block', items: eqBuf }); eqBuf = []; }
      groups.push({ type: 'change', item });
    }
  }
  if (eqBuf.length) groups.push({ type: 'eq-block', items: eqBuf });

  const lines: DiffLine[] = [];
  for (const g of groups) {
    if (g.type === 'change') {
      const { item } = g;
      if (item.type === 'remove') lines.push({ kind: 'remove', left: item.value, ln: item.ln });
      else lines.push({ kind: 'add', right: item.value, rn: item.rn });
    } else {
      const items = g.items;
      if (items.length <= CONTEXT * 2) {
        items.forEach((it) => lines.push({ kind: 'equal', ...it }));
      } else {
        items.slice(0, CONTEXT).forEach((it) => lines.push({ kind: 'equal', ...it }));
        lines.push({ kind: 'collapsed', items: items.slice(CONTEXT, -CONTEXT) });
        items.slice(-CONTEXT).forEach((it) => lines.push({ kind: 'equal', ...it }));
      }
    }
  }
  return lines;
}

// 統合ビュー: 隣接する remove+add に文字単位ハイライトを適用
function applyCharHighlight(lines: DiffLine[]): DiffLine[] {
  const result: DiffLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i];
    const nxt = lines[i + 1];
    if (cur.kind === 'remove' && nxt?.kind === 'add') {
      const cd = charDiff(cur.left, nxt.right);
      if (!cd) {
        result.push(cur, nxt);
      } else {
        const removeHtml = cd.filter(c => c.type !== 'add')
          .map(c => c.type === 'remove' ? `<span class="char-remove">${escapeHtml(c.value)}</span>` : escapeHtml(c.value))
          .join('');
        const addHtml = cd.filter(c => c.type !== 'remove')
          .map(c => c.type === 'add' ? `<span class="char-add">${escapeHtml(c.value)}</span>` : escapeHtml(c.value))
          .join('');
        result.push({ kind: 'remove', left: removeHtml, ln: cur.ln, isHtml: true });
        result.push({ kind: 'add',    right: addHtml,   rn: nxt.rn, isHtml: true });
      }
      i++;
    } else {
      result.push(cur);
    }
  }
  return result;
}

// --------------------------------------------------
// 分割ビュー用の型と構築
// --------------------------------------------------
type SideBySideRow =
  | { kind: 'equal';    leftNum: number;  leftContent: string;    rightNum: number;  rightContent: string }
  | { kind: 'change';   leftNum?: number; leftContent?: string; leftHtml?: true; rightNum?: number; rightContent?: string; rightHtml?: true }
  | { kind: 'collapsed'; items: { left: string; ln: number; rn: number }[] };

function buildSideBySideRows(lines: DiffLine[]): SideBySideRow[] {
  const rows: SideBySideRow[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.kind === 'equal') {
      rows.push({ kind: 'equal', leftNum: line.ln, leftContent: line.left, rightNum: line.rn, rightContent: line.left });
      i++;
      continue;
    }
    if (line.kind === 'collapsed') {
      rows.push({ kind: 'collapsed', items: line.items });
      i++;
      continue;
    }

    // 変更ブロック: 連続する remove / add をまとめて対で表示
    const removes: { num: number; content: string }[] = [];
    const adds:    { num: number; content: string }[] = [];

    while (i < lines.length && (lines[i].kind === 'remove' || lines[i].kind === 'add')) {
      const l = lines[i];
      if (l.kind === 'remove') removes.push({ num: l.ln, content: l.left });
      else if (l.kind === 'add') adds.push({ num: l.rn, content: l.right });
      i++;
    }

    const maxLen = Math.max(removes.length, adds.length);
    for (let j = 0; j < maxLen; j++) {
      const rem = removes[j];
      const add = adds[j];
      const row: SideBySideRow = { kind: 'change' };
      if (rem) { (row as any).leftNum = rem.num; (row as any).leftContent = rem.content; }
      if (add) { (row as any).rightNum = add.num; (row as any).rightContent = add.content; }
      rows.push(row);
    }
  }
  return rows;
}

// 分割ビュー: 対になった change 行に文字単位ハイライトを適用
function applySideBySideCharHighlight(rows: SideBySideRow[]): SideBySideRow[] {
  return rows.map((row): SideBySideRow => {
    if (row.kind !== 'change' || !row.leftContent || !row.rightContent) return row;
    const cd = charDiff(row.leftContent, row.rightContent);
    if (!cd) return row;

    const leftHtml = cd.filter(c => c.type !== 'add')
      .map(c => c.type === 'remove' ? `<span class="char-remove">${escapeHtml(c.value)}</span>` : escapeHtml(c.value))
      .join('');
    const rightHtml = cd.filter(c => c.type !== 'remove')
      .map(c => c.type === 'add' ? `<span class="char-add">${escapeHtml(c.value)}</span>` : escapeHtml(c.value))
      .join('');

    return { kind: 'change', leftNum: row.leftNum, leftContent: leftHtml, leftHtml: true, rightNum: row.rightNum, rightContent: rightHtml, rightHtml: true };
  });
}

// --------------------------------------------------
// 統合ビュー レンダラー
// --------------------------------------------------
function UnifiedLines({
  lines,
  expandedIdx,
  toggleExpand,
}: {
  lines: DiffLine[];
  expandedIdx: Set<number>;
  toggleExpand: (i: number) => void;
}) {
  return (
    <div className={styles['diff-lines']}>
      {lines.flatMap((line, i) => {
        if (line.kind === 'equal') {
          return [(
            <div key={i} className={clsx(styles['diff-line'], styles['diff-line--equal'])}>
              <span className={styles['diff-line__nums']}>{line.ln}<span className={styles['diff-line__num-sep']}>|</span>{line.rn}</span>
              <span className={styles['diff-line__sign']} />
              <span className={styles['diff-line__content']}>{line.left}</span>
            </div>
          )];
        }
        if (line.kind === 'remove') {
          return [(
            <div key={i} className={clsx(styles['diff-line'], styles['diff-line--remove'])}>
              <span className={styles['diff-line__nums']}>{line.ln}<span className={styles['diff-line__num-sep']} /></span>
              <span className={clsx(styles['diff-line__sign'], styles['diff-line__sign--remove'])}>−</span>
              {line.isHtml
                ? <span className={styles['diff-line__content']} dangerouslySetInnerHTML={{ __html: line.left }} />
                : <span className={styles['diff-line__content']}>{line.left}</span>}
            </div>
          )];
        }
        if (line.kind === 'add') {
          return [(
            <div key={i} className={clsx(styles['diff-line'], styles['diff-line--add'])}>
              <span className={styles['diff-line__nums']}><span className={styles['diff-line__num-sep']} />{line.rn}</span>
              <span className={clsx(styles['diff-line__sign'], styles['diff-line__sign--add'])}>+</span>
              {line.isHtml
                ? <span className={styles['diff-line__content']} dangerouslySetInnerHTML={{ __html: line.right }} />
                : <span className={styles['diff-line__content']}>{line.right}</span>}
            </div>
          )];
        }
        // collapsed
        if (expandedIdx.has(i)) {
          return line.items.map((it, j) => (
            <div key={`${i}-${j}`} className={clsx(styles['diff-line'], styles['diff-line--equal'])}>
              <span className={styles['diff-line__nums']}>{it.ln}<span className={styles['diff-line__num-sep']}>|</span>{it.rn}</span>
              <span className={styles['diff-line__sign']} />
              <span className={styles['diff-line__content']}>{it.left}</span>
            </div>
          ));
        }
        return [(
          <div key={i} className={clsx(styles['diff-line'], styles['diff-line--collapsed'])} onClick={() => toggleExpand(i)}>
            … {line.items.length} 行省略（クリックして展開）…
          </div>
        )];
      })}
    </div>
  );
}

// --------------------------------------------------
// 分割ビュー レンダラー
// --------------------------------------------------
function SplitHalf({
  num, content, html, side,
}: {
  num?: number; content?: string; html?: boolean;
  side: 'equal' | 'remove' | 'add' | 'empty';
}) {
  const halfClass = {
    equal:  styles['diff-split-half--equal'],
    remove: styles['diff-split-half--remove'],
    add:    styles['diff-split-half--add'],
    empty:  styles['diff-split-half--empty'],
  }[side];

  return (
    <div className={clsx(styles['diff-split-half'], halfClass)}>
      <span className={styles['diff-split-num']}>{num ?? ''}</span>
      <span className={clsx(
        styles['diff-split-sign'],
        side === 'remove' && styles['diff-split-sign--remove'],
        side === 'add'    && styles['diff-split-sign--add'],
      )}>
        {side === 'remove' ? '−' : side === 'add' ? '+' : ''}
      </span>
      {html
        ? <span className={styles['diff-split-content']} dangerouslySetInnerHTML={{ __html: content ?? '' }} />
        : <span className={styles['diff-split-content']}>{content ?? ''}</span>}
    </div>
  );
}

function SplitLines({
  rows,
  expandedIdx,
  toggleExpand,
}: {
  rows: SideBySideRow[];
  expandedIdx: Set<number>;
  toggleExpand: (i: number) => void;
}) {
  return (
    <div className={styles['diff-split']}>
      {rows.flatMap((row, i) => {
        if (row.kind === 'collapsed') {
          if (expandedIdx.has(i)) {
            return row.items.map((it, j) => (
              <div key={`${i}-${j}`} className={styles['diff-split-row']}>
                <SplitHalf num={it.ln} content={it.left} side="equal" />
                <SplitHalf num={it.rn} content={it.left} side="equal" />
              </div>
            ));
          }
          return [(
            <div key={i} className={styles['diff-split-collapsed']} onClick={() => toggleExpand(i)}>
              … {row.items.length} 行省略（クリックして展開）…
            </div>
          )];
        }
        if (row.kind === 'equal') {
          return [(
            <div key={i} className={styles['diff-split-row']}>
              <SplitHalf num={row.leftNum}  content={row.leftContent}  side="equal" />
              <SplitHalf num={row.rightNum} content={row.rightContent} side="equal" />
            </div>
          )];
        }
        // change
        return [(
          <div key={i} className={styles['diff-split-row']}>
            <SplitHalf
              num={row.leftNum} content={row.leftContent} html={row.leftHtml}
              side={row.leftContent !== undefined ? 'remove' : 'empty'}
            />
            <SplitHalf
              num={row.rightNum} content={row.rightContent} html={row.rightHtml}
              side={row.rightContent !== undefined ? 'add' : 'empty'}
            />
          </div>
        )];
      })}
    </div>
  );
}

// --------------------------------------------------
// DiffResult コンポーネント
// --------------------------------------------------
function DiffResult({
  diff,
  mode,
  viewMode,
  onCopy,
}: {
  diff: DiffItem[];
  mode: 'line' | 'char';
  viewMode: 'unified' | 'split';
  onCopy: () => void;
}) {
  const [unifiedExpanded, setUnifiedExpanded] = useState<Set<number>>(new Set());
  const [splitExpanded,   setSplitExpanded]   = useState<Set<number>>(new Set());

  const addCount    = diff.filter(d => d.type === 'add').length;
  const removeCount = diff.filter(d => d.type === 'remove').length;
  const equalCount  = diff.filter(d => d.type === 'equal').length;

  const baseLines = useMemo(() => buildLines(diff), [diff]);

  const unifiedLines = useMemo(
    () => mode === 'char' ? applyCharHighlight(baseLines) : baseLines,
    [baseLines, mode],
  );

  const splitRows = useMemo(() => {
    const rows = buildSideBySideRows(baseLines);
    return mode === 'char' ? applySideBySideCharHighlight(rows) : rows;
  }, [baseLines, mode]);

  const toggleUnified = useCallback((i: number) =>
    setUnifiedExpanded(prev => { const s = new Set(prev); s.has(i) ? s.delete(i) : s.add(i); return s; }), []);

  const toggleSplit = useCallback((i: number) =>
    setSplitExpanded(prev => { const s = new Set(prev); s.has(i) ? s.delete(i) : s.add(i); return s; }), []);

  return (
    <div>
      <div className={styles['diff-summary']}>
        <span className={styles['diff-summary__label']}>差分結果</span>
        <span className={styles['diff-summary__add']}>+{addCount} 行追加</span>
        <span className={styles['diff-summary__remove']}>−{removeCount} 行削除</span>
        <span className={styles['diff-summary__equal']}>{equalCount} 行一致</span>
        <button type="button" className={clsx('btn btn--ghost btn--sm', styles['diff-copy-btn'])} onClick={onCopy}>
          <Copy size={13} />
          テキストコピー
        </button>
      </div>
      {viewMode === 'unified' ? (
        <UnifiedLines lines={unifiedLines} expandedIdx={unifiedExpanded} toggleExpand={toggleUnified} />
      ) : (
        <SplitLines rows={splitRows} expandedIdx={splitExpanded} toggleExpand={toggleSplit} />
      )}
    </div>
  );
}

// --------------------------------------------------
// DiffToolPage 本体
// --------------------------------------------------
const SHORTCUTS = [{
  name: 'ショートカット',
  shortcuts: [
    { keys: ['Ctrl', 'Enter'],       description: '差分を比較' },
    { keys: ['Ctrl', 'Shift', 'C'],  description: 'テキストエリアをクリア' },
    { keys: ['M'],                   description: '比較モード切替（行/文字）' },
    { keys: ['V'],                   description: '表示切替（統合/分割）' },
  ],
}];

export function DiffToolPage() {
  const isActive = useIsActiveTab();
  const [left,  setLeft]  = useState('');
  const [right, setRight] = useState('');
  const [mode,     setMode]     = useState<'line' | 'char'>(() => (localStorage.getItem('diff_mode') as 'line' | 'char') || 'line');
  const [viewMode, setViewMode] = useState<'unified' | 'split'>(() => (localStorage.getItem('diff_view_mode') as 'unified' | 'split') || 'unified');
  const [ignoreWs,    setIgnoreWs]    = useState(() => localStorage.getItem('diff_ignore_whitespace') === 'true');
  const [ignoreBlank, setIgnoreBlank] = useState(() => localStorage.getItem('diff_ignore_blank_lines') === 'true');
  const [ignoreTabs,  setIgnoreTabs]  = useState(() => localStorage.getItem('diff_ignore_tabs') === 'true');
  const [realtime,    setRealtime]    = useState(() => localStorage.getItem('diff_realtime') === 'true');
  const [diff,          setDiff]          = useState<DiffItem[] | null>(null);
  const [isComparing,   setIsComparing]   = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [dragOver,       setDragOver]       = useState<'left' | 'right' | null>(null);
  const realtimeRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const compareGen     = useRef(0);
  const diffWorkerRef  = useRef<Worker | null>(null);
  // ドラッグ中の enter/leave カウンタ（子要素移動時のちらつき防止）
  const globalDragCount = useRef(0);
  const leftDragCount   = useRef(0);
  const rightDragCount  = useRef(0);

  // diff Worker のライフサイクル
  useEffect(() => {
    let worker: Worker | null = null;
    try {
      worker = new Worker(new URL('../workers/diff.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => {
        const { id, result } = e.data as { id: number; result: DiffItem[] };
        if (id !== compareGen.current) return;
        setDiff(result);
        setIsComparing(false);
      };
      worker.onerror = () => {
        setIsComparing(false);
        Toast.error('比較処理でエラーが発生しました');
      };
      diffWorkerRef.current = worker;
    } catch { /* Worker 未対応環境は無視 */ }
    return () => { worker?.terminate(); };
  }, []);

  const compare = useCallback(() => {
    // raw count で保守的な上限チェック（ignoreBlank で実際は少なくなる場合あり）
    if (left.split('\n').length > DIFF_MAX_LINES || right.split('\n').length > DIFF_MAX_LINES) {
      Toast.error(`行数が多すぎます（上限 ${DIFF_MAX_LINES.toLocaleString()} 行）`);
      return;
    }
    const opts = { ignoreWs, ignoreBlank, ignoreTabs };
    setIsComparing(true);
    const id = ++compareGen.current;
    diffWorkerRef.current?.postMessage({ id, left, right, opts });
  }, [left, right, ignoreWs, ignoreBlank, ignoreTabs]);

  // リアルタイム比較
  useEffect(() => {
    if (!realtime) return;
    realtimeRef.current = setTimeout(compare, 400);
    return () => { if (realtimeRef.current) clearTimeout(realtimeRef.current); };
  }, [realtime, left, right, compare]);

  // テキストコピー
  const handleCopy = useCallback(() => {
    if (!diff) return;
    const text = diff.map(d =>
      d.type === 'add' ? `+ ${d.value}` : d.type === 'remove' ? `- ${d.value}` : `  ${d.value}`
    ).join('\n');
    Clipboard.copy(text)
      .then(() => Toast.success('差分テキストをコピーしました'))
      .catch(() => Toast.error('コピーに失敗しました'));
  }, [diff]);

  // キーボードショートカット
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!isActive) return;
      const mod = e.ctrlKey || e.metaKey;
      const tag = (document.activeElement as HTMLElement)?.tagName?.toLowerCase();
      const isInInput = ['input', 'textarea', 'select'].includes(tag ?? '');

      if (e.key === 'Escape' && isInInput) { (document.activeElement as HTMLElement).blur(); return; }
      if (mod && e.key === 'Enter') { e.preventDefault(); compare(); return; }
      if (mod && e.shiftKey && e.key === 'C') { e.preventDefault(); setLeft(''); setRight(''); setDiff(null); return; }
      if (isInInput) return;

      if (e.key === 'm' && !mod) {
        e.preventDefault();
        setMode(m => { const nm = m === 'line' ? 'char' : 'line'; localStorage.setItem('diff_mode', nm); return nm; });
      }
      if (e.key === 'v' && !mod) {
        e.preventDefault();
        setViewMode(v => { const nv = v === 'unified' ? 'split' : 'unified'; localStorage.setItem('diff_view_mode', nv); return nv; });
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isActive, compare]);

  const handleToggle = (setter: (v: boolean) => void, key: string) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setter(e.target.checked);
      localStorage.setItem(key, String(e.target.checked));
    };

  // ページレベルのファイルドラッグ検知（タブがアクティブな間だけ登録）
  useEffect(() => {
    if (!isActive) return;

    const isFileDrag = (e: DragEvent) =>
      Array.from(e.dataTransfer?.types ?? []).includes('Files');

    const resetAll = () => {
      globalDragCount.current = 0;
      leftDragCount.current   = 0;
      rightDragCount.current  = 0;
      setIsDraggingFile(false);
      setDragOver(null);
    };

    const onEnter = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      globalDragCount.current++;
      setIsDraggingFile(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!isFileDrag(e) && globalDragCount.current === 0) return;
      globalDragCount.current = Math.max(0, globalDragCount.current - 1);
      if (globalDragCount.current === 0) {
        setIsDraggingFile(false);
        setDragOver(null);
      }
    };

    document.addEventListener('dragenter', onEnter);
    document.addEventListener('dragleave', onLeave);
    document.addEventListener('drop', resetAll);
    return () => {
      document.removeEventListener('dragenter', onEnter);
      document.removeEventListener('dragleave', onLeave);
      document.removeEventListener('drop', resetAll);
      resetAll();
    };
  }, [isActive]);

  // ラッパー別ドラッグハンドラ（カウンタ方式で子要素移動時のちらつきを防ぐ）
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleWrapperEnter = useCallback((side: 'left' | 'right') => () => {
    if (side === 'left') { leftDragCount.current++;  setDragOver('left'); }
    else                 { rightDragCount.current++; setDragOver('right'); }
  }, []);

  const handleWrapperLeave = useCallback((side: 'left' | 'right') => () => {
    if (side === 'left') {
      leftDragCount.current = Math.max(0, leftDragCount.current - 1);
      if (leftDragCount.current === 0) setDragOver(prev => prev === 'left' ? null : prev);
    } else {
      rightDragCount.current = Math.max(0, rightDragCount.current - 1);
      if (rightDragCount.current === 0) setDragOver(prev => prev === 'right' ? null : prev);
    }
  }, []);

  const readFile = useCallback((side: 'left' | 'right', e: React.DragEvent) => {
    e.preventDefault();
    leftDragCount.current = 0;
    rightDragCount.current = 0;
    setDragOver(null);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (file.size > DIFF_MAX_FILE_SIZE) {
      Toast.error(`ファイルが大きすぎます（上限 5MB、${(file.size / 1024 / 1024).toFixed(1)} MB）`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        if (side === 'left') setLeft(reader.result);
        else setRight(reader.result);
      }
    };
    reader.readAsText(file);
  }, []);

  return (
    <div className={styles['diff-page']}>
      <ShortcutHelp categories={SHORTCUTS} />

      {/* ツールバー */}
      <div className={styles['diff-toolbar']}>
        {/* 表示切替: 統合/分割 */}
        <div className={styles['diff-mode-toggle']}>
          {(['unified', 'split'] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={clsx(styles['diff-mode-btn'], viewMode === v && styles['diff-mode-btn--active'])}
              onClick={() => { setViewMode(v); localStorage.setItem('diff_view_mode', v); }}
            >
              {v === 'unified' ? '統合' : '分割'}
            </button>
          ))}
        </div>

        {/* 比較モード: 行単位/文字単位 */}
        <div className={styles['diff-mode-toggle']}>
          {(['line', 'char'] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={clsx(styles['diff-mode-btn'], mode === m && styles['diff-mode-btn--active'])}
              onClick={() => { setMode(m); localStorage.setItem('diff_mode', m); }}
            >
              {m === 'line' ? '行単位' : '文字単位'}
            </button>
          ))}
        </div>

        <span className={styles['diff-toolbar-sep']} />

        <label className={styles['diff-check']}>
          <input type="checkbox" checked={ignoreWs}    onChange={handleToggle(setIgnoreWs,    'diff_ignore_whitespace')} />
          空白を無視
        </label>
        <label className={styles['diff-check']}>
          <input type="checkbox" checked={ignoreBlank} onChange={handleToggle(setIgnoreBlank, 'diff_ignore_blank_lines')} />
          空行を無視
        </label>
        <label className={styles['diff-check']}>
          <input type="checkbox" checked={ignoreTabs}  onChange={handleToggle(setIgnoreTabs,  'diff_ignore_tabs')} />
          タブを無視
        </label>
        <label className={styles['diff-check']}>
          <input type="checkbox" checked={realtime}    onChange={(e) => { setRealtime(e.target.checked); localStorage.setItem('diff_realtime', String(e.target.checked)); }} />
          リアルタイム
        </label>

        <div className={styles['diff-toolbar__actions']}>
          <button type="button" className="btn btn--primary btn--sm" onClick={compare}>差分を比較</button>
          <button type="button" className="btn btn--ghost btn--sm"   onClick={() => { setLeft(''); setRight(''); setDiff(null); }}>クリア</button>
        </div>
      </div>

      {/* 入力エリア */}
      <div className={styles['diff-inputs']}>
        {/* 変更前 */}
        <div
          className={styles['diff-input-wrap']}
          onDragOver={handleDragOver}
          onDragEnter={handleWrapperEnter('left')}
          onDragLeave={handleWrapperLeave('left')}
          onDrop={(e) => readFile('left', e)}
        >
          <label className={styles['diff-input-label']}>
            変更前
            <span className={styles['diff-drop-hint']}>ファイルドロップ可</span>
          </label>
          <div className={styles['diff-textarea-container']}>
            <textarea
              className={clsx(styles['diff-textarea'], isDraggingFile && styles['diff-textarea--drag-ready'])}
              placeholder="変更前のテキストを貼り付け..."
              value={left}
              onChange={(e) => setLeft(e.target.value)}
              spellCheck={false}
            />
            {dragOver === 'left' && (
              <div className={styles['diff-drop-overlay']}>
                <Upload size={22} />
                ファイルをドロップ
              </div>
            )}
          </div>
        </div>

        {/* 変更後 */}
        <div
          className={styles['diff-input-wrap']}
          onDragOver={handleDragOver}
          onDragEnter={handleWrapperEnter('right')}
          onDragLeave={handleWrapperLeave('right')}
          onDrop={(e) => readFile('right', e)}
        >
          <label className={styles['diff-input-label']}>
            変更後
            <span className={styles['diff-drop-hint']}>ファイルドロップ可</span>
          </label>
          <div className={styles['diff-textarea-container']}>
            <textarea
              className={clsx(styles['diff-textarea'], isDraggingFile && styles['diff-textarea--drag-ready'])}
              placeholder="変更後のテキストを貼り付け..."
              value={right}
              onChange={(e) => setRight(e.target.value)}
              spellCheck={false}
            />
            {dragOver === 'right' && (
              <div className={styles['diff-drop-overlay']}>
                <Upload size={22} />
                ファイルをドロップ
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 結果 */}
      <div className={styles['diff-result-area']}>
        {isComparing ? (
          <div className={styles['diff-empty']}>
            比較中…
          </div>
        ) : diff === null ? (
          <div className={styles['diff-empty']}>
            テキストを入力して「差分を比較」を押すか、リアルタイムモードを有効にしてください。
          </div>
        ) : !diff.some(d => d.type !== 'equal') ? (
          <div className={clsx(styles['diff-empty'], styles['diff-empty--equal'])}>
            差分がありません（完全に一致）
          </div>
        ) : (
          <DiffResult diff={diff} mode={mode} viewMode={viewMode} onCopy={handleCopy} />
        )}
      </div>
    </div>
  );
}
