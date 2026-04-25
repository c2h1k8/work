// diff.worker.ts — Myers diff 計算を Web Worker で実行

type DiffItem = { type: 'equal' | 'add' | 'remove'; value: string };

interface WorkerRequest {
  id: number;
  left: string;
  right: string;
  opts: { ignoreWs: boolean; ignoreBlank: boolean; ignoreTabs: boolean };
}

interface WorkerResponse {
  id: number;
  result: DiffItem[];
}

// self を最小限の型にキャストして DOM/WebWorker lib 競合を回避
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(data: WorkerResponse): void;
};

function prepareLines(
  text: string,
  opts: WorkerRequest['opts'],
): string[] {
  let lines = text.split('\n');
  if (opts.ignoreBlank) lines = lines.filter((l) => l.trim() !== '');
  if (opts.ignoreTabs)  lines = lines.map((l) => l.replace(/\t/g, ''));
  if (opts.ignoreWs)    lines = lines.map((l) => l.replace(/\s+/g, ' ').trim());
  return lines;
}

function myersDiff(a: string[], b: string[]): DiffItem[] {
  const N = a.length, M = b.length;
  if (N === 0 && M === 0) return [];
  if (N === 0) return b.map((v) => ({ type: 'add' as const, value: v }));
  if (M === 0) return a.map((v) => ({ type: 'remove' as const, value: v }));

  const max = N + M;
  const offset = max;
  const v = new Array<number>(2 * max + 1).fill(0);
  const trace: number[][] = [];

  // trace が肥大化しないよう上限を設ける（≈256MB / 8bytes ≒ 32M エントリ）
  // 超えた場合は全行 remove+add の単純 diff にフォールバック
  const MAX_D = Math.max(20, Math.floor(32_000_000 / (2 * max + 1)));

  outer: for (let d = 0; d <= max; d++) {
    if (d > MAX_D) {
      return [
        ...a.map((value) => ({ type: 'remove' as const, value })),
        ...b.map((value) => ({ type: 'add' as const, value })),
      ];
    }
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

  // バックトレース（push + reverse で O(N) を維持）
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
    while (x > prevX && y > prevY) { x--; y--; result.push({ type: 'equal', value: a[x] }); }
    if (y > prevY) { y--; result.push({ type: 'add', value: b[y] }); }
    else if (x > prevX) { x--; result.push({ type: 'remove', value: a[x] }); }
  }
  if (x > 0 && y > 0) result.push({ type: 'equal', value: a[0] });
  else if (y > 0) result.push({ type: 'add', value: b[0] });
  else if (x > 0) result.push({ type: 'remove', value: a[0] });
  result.reverse();
  return result;
}

ctx.onmessage = (e) => {
  const { id, left, right, opts } = e.data;
  const result = myersDiff(prepareLines(left, opts), prepareLines(right, opts));
  ctx.postMessage({ id, result });
};
