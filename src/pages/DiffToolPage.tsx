// ==================================================
// DiffToolPage: 差分比較ツール
// ==================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { Clipboard } from '../core/clipboard';
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

  // バックトラック
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

function charDiff(left: string, right: string): DiffItem[] {
  return myersDiff([...left], [...right]);
}

// --------------------------------------------------
// 前処理ユーティリティ
// --------------------------------------------------
function prepareLines(text: string, opts: { ignoreWs: boolean; ignoreBlank: boolean; ignoreTabs: boolean }): string[] {
  let lines = text.split('\n');
  if (opts.ignoreBlank) lines = lines.filter((l) => l.trim() !== '');
  if (opts.ignoreTabs) lines = lines.map((l) => l.replace(/\t/g, ''));
  if (opts.ignoreWs) lines = lines.map((l) => l.replace(/\s+/g, ' ').trim());
  return lines;
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// --------------------------------------------------
// Diff 結果表示コンポーネント
// --------------------------------------------------
const CONTEXT = 3;

type DiffLine =
  | { kind: 'equal'; left: string; ln: number; rn: number }
  | { kind: 'add';   right: string; rn: number }
  | { kind: 'remove'; left: string; ln: number }
  | { kind: 'collapsed'; items: { left: string; ln: number; rn: number }[]; }

function buildLines(diff: DiffItem[]): DiffLine[] {
  type EqBuf = { left: string; ln: number; rn: number }[];
  const groups: ({ type: 'change'; item: DiffItem } | { type: 'eq-block'; items: EqBuf })[] = [];
  let eqBuf: EqBuf = [];
  let ln = 0, rn = 0;

  // まず行番号を計算しながら diff を走査
  const numberedDiff = diff.map((item) => {
    if (item.type === 'remove') { ln++; return { ...item, ln, rn: 0 }; }
    if (item.type === 'add')    { rn++; return { ...item, ln: 0, rn }; }
    ln++; rn++;
    return { ...item, ln, rn };
  });

  for (const item of numberedDiff) {
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
      if (item.type === 'remove') lines.push({ kind: 'remove', left: item.value, ln: (item as any).ln });
      else lines.push({ kind: 'add', right: item.value, rn: (item as any).rn });
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

function applyCharHighlight(lines: DiffLine[]): DiffLine[] {
  const result: DiffLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i];
    const nxt = lines[i + 1];
    if (cur.kind === 'remove' && nxt?.kind === 'add') {
      const cd = charDiff(cur.left, nxt.right);
      const removeHtml = cd.filter((c) => c.type !== 'add')
        .map((c) => c.type === 'remove'
          ? `<span class="char-remove">${escapeHtml(c.value)}</span>`
          : escapeHtml(c.value))
        .join('');
      const addHtml = cd.filter((c) => c.type !== 'remove')
        .map((c) => c.type === 'add'
          ? `<span class="char-add">${escapeHtml(c.value)}</span>`
          : escapeHtml(c.value))
        .join('');
      result.push({ ...cur, left: removeHtml } as any);
      result.push({ ...nxt, right: addHtml } as any);
      i++;
    } else {
      result.push(cur);
    }
  }
  return result;
}

function DiffResult({
  diff,
  mode,
  onCopy,
}: {
  diff: DiffItem[];
  mode: 'line' | 'char';
  onCopy: () => void;
}) {
  const [expandedIdx, setExpandedIdx] = useState<Set<number>>(new Set());
  const addCount    = diff.filter((d) => d.type === 'add').length;
  const removeCount = diff.filter((d) => d.type === 'remove').length;
  const equalCount  = diff.filter((d) => d.type === 'equal').length;

  let lines = buildLines(diff);
  if (mode === 'char') lines = applyCharHighlight(lines);

  const toggleExpand = (i: number) =>
    setExpandedIdx((prev) => { const s = new Set(prev); s.has(i) ? s.delete(i) : s.add(i); return s; });

  return (
    <div>
      <div className="diff-summary">
        <span className="diff-summary__label">差分結果</span>
        <span className="diff-summary__add">+{addCount} 行追加</span>
        <span className="diff-summary__remove">−{removeCount} 行削除</span>
        <span className="diff-summary__equal">{equalCount} 行一致</span>
        <button type="button" className="btn btn--ghost btn--sm diff-copy-btn" onClick={onCopy}>
          テキストコピー
        </button>
      </div>
      <div className="diff-lines">
        {lines.map((line, i) => {
          if (line.kind === 'equal') {
            return (
              <div key={i} className="diff-line diff-line--equal">
                <span className="diff-line__nums">{line.ln}<span className="diff-line__num-sep">|</span>{line.rn}</span>
                <span className="diff-line__sign" />
                <span className="diff-line__content">{escapeHtml(line.left)}</span>
              </div>
            );
          }
          if (line.kind === 'remove') {
            return (
              <div key={i} className="diff-line diff-line--remove">
                <span className="diff-line__nums">{line.ln}<span className="diff-line__num-sep" /></span>
                <span className="diff-line__sign diff-line__sign--remove">−</span>
                <span className="diff-line__content" dangerouslySetInnerHTML={{ __html: escapeHtml(line.left) }} />
              </div>
            );
          }
          if (line.kind === 'add') {
            return (
              <div key={i} className="diff-line diff-line--add">
                <span className="diff-line__nums"><span className="diff-line__num-sep" />{line.rn}</span>
                <span className="diff-line__sign diff-line__sign--add">+</span>
                <span className="diff-line__content" dangerouslySetInnerHTML={{ __html: escapeHtml(line.right) }} />
              </div>
            );
          }
          // collapsed
          const expanded = expandedIdx.has(i);
          if (expanded) {
            return line.items.map((it, j) => (
              <div key={`${i}-${j}`} className="diff-line diff-line--equal">
                <span className="diff-line__nums">{it.ln}<span className="diff-line__num-sep">|</span>{it.rn}</span>
                <span className="diff-line__sign" />
                <span className="diff-line__content">{escapeHtml(it.left)}</span>
              </div>
            ));
          }
          return (
            <div key={i} className="diff-line diff-line--collapsed" onClick={() => toggleExpand(i)}>
              … {line.items.length} 行省略（クリックして展開）…
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --------------------------------------------------
// DiffToolPage 本体
// --------------------------------------------------
const SHORTCUTS = [{
  name: 'ショートカット',
  shortcuts: [
    { keys: ['Ctrl', 'Enter'], description: '差分を比較' },
    { keys: ['Ctrl', 'Shift', 'C'], description: 'テキストエリアをクリア' },
    { keys: ['M'], description: 'モード切替（行/文字）' },
  ],
}];

export function DiffToolPage() {
  const [left, setLeft]   = useState('');
  const [right, setRight] = useState('');
  const [mode, setMode]   = useState<'line' | 'char'>(
    () => (localStorage.getItem('diff_mode') as 'line' | 'char') || 'line'
  );
  const [ignoreWs,    setIgnoreWs]    = useState(() => localStorage.getItem('diff_ignore_whitespace') === 'true');
  const [ignoreBlank, setIgnoreBlank] = useState(() => localStorage.getItem('diff_ignore_blank_lines') === 'true');
  const [ignoreTabs,  setIgnoreTabs]  = useState(() => localStorage.getItem('diff_ignore_tabs') === 'true');
  const [realtime,    setRealtime]    = useState(() => localStorage.getItem('diff_realtime') === 'true');
  const [diff, setDiff]   = useState<DiffItem[] | null>(null);
  const realtimeRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const compare = useCallback(() => {
    const opts = { ignoreWs, ignoreBlank, ignoreTabs };
    const a = prepareLines(left, opts);
    const b = prepareLines(right, opts);
    setDiff(myersDiff(a, b));
  }, [left, right, ignoreWs, ignoreBlank, ignoreTabs]);

  // リアルタイム比較
  useEffect(() => {
    if (!realtime) return;
    realtimeRef.current = setTimeout(compare, 400);
    return () => { if (realtimeRef.current) clearTimeout(realtimeRef.current); };
  }, [realtime, left, right, compare]);

  const handleCopy = useCallback(() => {
    if (!diff) return;
    const text = diff.map((d) =>
      d.type === 'add' ? `+ ${d.value}` : d.type === 'remove' ? `- ${d.value}` : `  ${d.value}`
    ).join('\n');
    Clipboard.copy(text)
      .then(() => Toast.success('差分テキストをコピーしました'))
      .catch(() => Toast.error('コピーに失敗しました'));
  }, [diff]);

  // キーボードショートカット
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === 'Enter') { e.preventDefault(); compare(); return; }
      if (mod && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        setLeft(''); setRight(''); setDiff(null); return;
      }
      const tag = (document.activeElement as HTMLElement)?.tagName?.toLowerCase();
      if (['input', 'textarea', 'select'].includes(tag ?? '')) return;
      if (e.key === 'm' && !mod) {
        e.preventDefault();
        setMode((m) => { const nm = m === 'line' ? 'char' : 'line'; localStorage.setItem('diff_mode', nm); return nm; });
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [compare]);

  const handleToggle = (_key: string, setter: (v: boolean) => void, storageKey: string) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setter(e.target.checked);
      localStorage.setItem(storageKey, String(e.target.checked));
    };

  return (
    <div className="diff-page">
      <ShortcutHelp categories={SHORTCUTS} />

      {/* オプションバー */}
      <div className="diff-toolbar">
        <div className="diff-mode-toggle" id="mode-toggle">
          {(['line', 'char'] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={`diff-mode-btn${mode === m ? ' diff-mode-btn--active' : ''}`}
              onClick={() => { setMode(m); localStorage.setItem('diff_mode', m); }}
            >
              {m === 'line' ? '行単位' : '文字単位'}
            </button>
          ))}
        </div>
        <label className="diff-check">
          <input type="checkbox" checked={ignoreWs}    onChange={handleToggle('ignoreWs',    setIgnoreWs,    'diff_ignore_whitespace')} />
          空白を無視
        </label>
        <label className="diff-check">
          <input type="checkbox" checked={ignoreBlank} onChange={handleToggle('ignoreBlank', setIgnoreBlank, 'diff_ignore_blank_lines')} />
          空行を無視
        </label>
        <label className="diff-check">
          <input type="checkbox" checked={ignoreTabs}  onChange={handleToggle('ignoreTabs',  setIgnoreTabs,  'diff_ignore_tabs')} />
          タブを無視
        </label>
        <label className="diff-check diff-check--realtime">
          <input type="checkbox" checked={realtime}    onChange={(e) => { setRealtime(e.target.checked); localStorage.setItem('diff_realtime', String(e.target.checked)); }} />
          リアルタイム
        </label>
        <div className="diff-toolbar__actions">
          <button
            type="button"
            className="btn btn--primary btn--sm"
            id="compare-btn"
            onClick={compare}
          >
            差分を比較
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            id="clear-btn"
            onClick={() => { setLeft(''); setRight(''); setDiff(null); }}
          >
            クリア
          </button>
        </div>
      </div>

      {/* 入力エリア */}
      <div className="diff-inputs">
        <div className="diff-input-wrap">
          <label className="diff-input-label">変更前</label>
          <textarea
            id="input-left"
            className="diff-textarea"
            placeholder="変更前のテキストを貼り付け..."
            value={left}
            onChange={(e) => setLeft(e.target.value)}
            spellCheck={false}
          />
        </div>
        <div className="diff-input-wrap">
          <label className="diff-input-label">変更後</label>
          <textarea
            id="input-right"
            className="diff-textarea"
            placeholder="変更後のテキストを貼り付け..."
            value={right}
            onChange={(e) => setRight(e.target.value)}
            spellCheck={false}
          />
        </div>
      </div>

      {/* 結果 */}
      <div className="diff-result-area">
        {diff === null ? (
          <div id="diff-empty" className="diff-empty">
            テキストを入力して「差分を比較」ボタンを押すか、リアルタイムモードを有効にしてください。
          </div>
        ) : diff.length === 0 ? (
          <div className="diff-empty diff-empty--equal">差分がありません（完全に一致）</div>
        ) : (
          <div id="diff-content">
            <DiffResult diff={diff} mode={mode} onCopy={handleCopy} />
          </div>
        )}
      </div>
    </div>
  );
}
