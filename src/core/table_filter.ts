// ==================================================
// table_filter — ダッシュボード table セクションの
// クエリ言語パーサ
// ==================================================
// 対応構文（テキストのみ・型推定なし）:
//   API                  全データ列に部分一致（あいまい検索）
//   タイトル:API         「タイトル」列が含む（列指定）
//   A B                  スペース区切り = AND
//   A OR B               OR（大文字小文字無視）
//   (A OR B) C           括弧でグループ化
//   -担当:田中           先頭 - で否定（NOT）
//   "列 名":値           スペースを含む列名はダブルクォートで囲む
//
// テキスト演算子（列指定と組み合わせ）:
//   :       含む（デフォルト）
//   =       完全一致
//   ^=      前方一致
//   $=      後方一致
//   ~/.../  正規表現（前後のスラッシュは任意）
//   :empty  / :!empty   空 / 空でない
//
// マッチ対象は item.row_data の生値（バインド変数解決前）。

export interface FilterColumn {
  id: string;
  label: string;
}

export interface ParseResult {
  ok: boolean;
  error?: string;
  /** row_data（列id→値）を渡して真偽を返す述語。空クエリは常に true */
  test: (values: Record<string, string>) => boolean;
}

type RowTest = (values: Record<string, string>) => boolean;

/** クォート外で最初に現れる演算子を探す */
export function findOperator(raw: string): { idx: number; op: string } | null {
  let inQ = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === '"') { inQ = !inQ; continue; }
    if (inQ) continue;
    const two = raw.slice(i, i + 2);
    if (two === '^=' || two === '$=') return { idx: i, op: two };
    if (c === '=') return { idx: i, op: '=' };
    if (c === '~') return { idx: i, op: '~' };
    if (c === ':') return { idx: i, op: ':' };
  }
  return null;
}

/** 列名指定で使うダブルクォートを除去 */
function stripQuotes(s: string): string {
  return s.replace(/"/g, '');
}

/** 列ラベルにクォートが必要か（スペースや演算子記号を含む） */
export function needsQuote(label: string): boolean {
  return /[\s:=^$~()]/.test(label);
}

// ── トークナイザ ────────────────────────────────────────────
type TokType = 'OR' | 'LP' | 'RP' | 'TERM';
interface Tok { type: TokType; raw: string }

function tokenize(q: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < q.length) {
    const c = q[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    if (c === '(') { toks.push({ type: 'LP', raw: '(' }); i++; continue; }
    if (c === ')') { toks.push({ type: 'RP', raw: ')' }); i++; continue; }
    // term（クォート内のスペース・括弧は区切りとみなさない）
    let buf = '';
    let inQ = false;
    while (i < q.length) {
      const ch = q[i];
      if (ch === '"') { inQ = !inQ; buf += ch; i++; continue; }
      if (!inQ && (ch === ' ' || ch === '\t' || ch === '(' || ch === ')')) break;
      buf += ch; i++;
    }
    if (!inQ && buf.toUpperCase() === 'OR') toks.push({ type: 'OR', raw: buf });
    else toks.push({ type: 'TERM', raw: buf });
  }
  return toks;
}

// ── 単一 term → 述語 ────────────────────────────────────────
function makeColTest(
  colId: string,
  op: string,
  val: string,
  setErr: (e: string) => void,
): RowTest {
  const lv = val.toLowerCase();
  const get = (v: Record<string, string>) => (v[colId] ?? '');
  if (op === ':') {
    if (val === 'empty') return (v) => get(v).trim() === '';
    if (val === '!empty') return (v) => get(v).trim() !== '';
    return (v) => get(v).toLowerCase().includes(lv);
  }
  if (op === '=') return (v) => get(v).toLowerCase() === lv;
  if (op === '^=') return (v) => get(v).toLowerCase().startsWith(lv);
  if (op === '$=') return (v) => get(v).toLowerCase().endsWith(lv);
  if (op === '~') {
    let src = val;
    if (src.length > 1 && src.startsWith('/') && src.endsWith('/')) src = src.slice(1, -1);
    let re: RegExp | null = null;
    try { re = new RegExp(src, 'i'); } catch { setErr('正規表現が不正です'); }
    return (v) => (re ? re.test(get(v)) : false);
  }
  return () => true;
}

function buildTerm(
  raw: string,
  columns: FilterColumn[],
  labelMap: Map<string, string>,
  setErr: (e: string) => void,
): RowTest {
  let negate = false;
  let r = raw;
  if (r.startsWith('-') && r.length > 1) { negate = true; r = r.slice(1); }

  const anyContains = (term: string): RowTest => {
    if (!term) return () => true;
    return (v) => columns.some((c) => (v[c.id] ?? '').toLowerCase().includes(term));
  };

  let test: RowTest;
  const opInfo = findOperator(r);
  if (opInfo) {
    const colRaw = stripQuotes(r.slice(0, opInfo.idx)).trim().toLowerCase();
    const colId = labelMap.get(colRaw);
    if (colId) {
      const val = stripQuotes(r.slice(opInfo.idx + opInfo.op.length));
      test = makeColTest(colId, opInfo.op, val, setErr);
    } else {
      // 未知の列名 → term 全体を全列あいまい検索にフォールバック
      test = anyContains(stripQuotes(r).toLowerCase());
    }
  } else {
    test = anyContains(stripQuotes(r).toLowerCase());
  }
  return negate ? (v) => !test(v) : test;
}

// ── パーサ（再帰下降） ──────────────────────────────────────
export function parseTableQuery(query: string, columns: FilterColumn[]): ParseResult {
  const q = query.trim();
  if (!q) return { ok: true, test: () => true };

  const labelMap = new Map<string, string>();
  for (const c of columns) {
    labelMap.set(c.label.toLowerCase(), c.id);
    labelMap.set(c.id.toLowerCase(), c.id);
  }

  const toks = tokenize(q);
  let pos = 0;
  let error: string | undefined;
  const setErr = (e: string) => { if (!error) error = e; };
  const peek = () => toks[pos];

  function parseOr(): RowTest {
    let node = parseAnd();
    while (peek() && peek().type === 'OR') {
      pos++;
      const right = parseAnd();
      const l = node;
      node = (v) => l(v) || right(v);
    }
    return node;
  }

  function parseAnd(): RowTest {
    const tests: RowTest[] = [];
    while (peek() && peek().type !== 'OR' && peek().type !== 'RP') {
      tests.push(parsePrimary());
    }
    if (tests.length === 0) return () => true;
    return (v) => tests.every((t) => t(v));
  }

  function parsePrimary(): RowTest {
    const t = peek();
    if (!t) return () => true;
    if (t.type === 'LP') {
      pos++;
      const inner = parseOr();
      if (peek() && peek().type === 'RP') pos++;
      else setErr('括弧が閉じられていません');
      return inner;
    }
    if (t.type === 'RP') { pos++; return () => true; }
    pos++;
    return buildTerm(t.raw, columns, labelMap, setErr);
  }

  const test = parseOr();
  if (pos < toks.length) setErr('クエリを解釈できません');
  return { ok: !error, error, test };
}
