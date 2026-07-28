// ==================================================
// table_filter ユニットテスト
// ==================================================
import { describe, it, expect } from 'vitest';
import {
  parseTableQuery, findOperator, needsQuote, splitTopLevelTerms, describeTerm, isBalanced,
  type FilterColumn,
} from './table_filter';

const COLS: FilterColumn[] = [
  { id: 'c1', label: 'タイトル' },
  { id: 'c2', label: 'ステータス' },
  { id: 'c3', label: '担当 者' }, // スペース入り
];

// row_data を作るヘルパー
const row = (title = '', status = '', owner = '') => ({ c1: title, c2: status, c3: owner });

function match(query: string, values: Record<string, string>): boolean {
  return parseTableQuery(query, COLS).test(values);
}

describe('findOperator', () => {
  it('2文字演算子を優先する', () => {
    expect(findOperator('a^=b')).toEqual({ idx: 1, op: '^=' });
    expect(findOperator('a$=b')).toEqual({ idx: 1, op: '$=' });
  });
  it('クォート内の演算子は無視する', () => {
    expect(findOperator('"a:b":c')).toEqual({ idx: 5, op: ':' });
  });
  it('演算子なしは null', () => {
    expect(findOperator('abc')).toBeNull();
  });
});

describe('needsQuote', () => {
  it('スペースを含む列はクォートが必要', () => {
    expect(needsQuote('担当 者')).toBe(true);
    expect(needsQuote('タイトル')).toBe(false);
  });
});

describe('parseTableQuery', () => {
  it('空クエリは全件マッチ', () => {
    const r = parseTableQuery('', COLS);
    expect(r.ok).toBe(true);
    expect(r.test(row('x'))).toBe(true);
  });

  it('bare term は全列あいまい検索', () => {
    expect(match('API', row('API設計'))).toBe(true);
    expect(match('API', row('', 'API完了'))).toBe(true);
    expect(match('API', row('無関係'))).toBe(false);
  });

  it('大文字小文字を無視する', () => {
    expect(match('api', row('API'))).toBe(true);
  });

  it('列指定（含む）', () => {
    expect(match('タイトル:API', row('API設計', 'API'))).toBe(true);
    expect(match('タイトル:API', row('無関係', 'API'))).toBe(false);
  });

  it('スペース区切りは AND', () => {
    expect(match('タイトル:API ステータス:完了', row('API', '完了'))).toBe(true);
    expect(match('タイトル:API ステータス:完了', row('API', '進行中'))).toBe(false);
  });

  it('OR', () => {
    expect(match('ステータス:完了 OR ステータス:進行中', row('', '進行中'))).toBe(true);
    expect(match('ステータス:完了 OR ステータス:進行中', row('', '未着手'))).toBe(false);
  });

  it('括弧でグループ化', () => {
    const q = '(ステータス:完了 OR ステータス:進行中) タイトル:API';
    expect(match(q, row('API', '完了'))).toBe(true);
    expect(match(q, row('API', '未着手'))).toBe(false);
    expect(match(q, row('他', '完了'))).toBe(false);
  });

  it('否定（-）', () => {
    expect(match('-ステータス:完了', row('', '進行中'))).toBe(true);
    expect(match('-ステータス:完了', row('', '完了'))).toBe(false);
  });

  it('完全一致 =', () => {
    expect(match('ステータス=完了', row('', '完了'))).toBe(true);
    expect(match('ステータス=完了', row('', '完了予定'))).toBe(false);
  });

  it('前方一致 ^= / 後方一致 $=', () => {
    expect(match('タイトル^=API', row('API設計'))).toBe(true);
    expect(match('タイトル^=API', row('新API'))).toBe(false);
    expect(match('タイトル$=設計', row('API設計'))).toBe(true);
    expect(match('タイトル$=設計', row('設計書'))).toBe(false);
  });

  it('正規表現 ~', () => {
    expect(match('タイトル~/^API.*/', row('API設計'))).toBe(true);
    expect(match('タイトル~v\\d+', row('release v12'))).toBe(true);
    expect(match('タイトル~/^API/', row('新API'))).toBe(false);
  });

  it('不正な正規表現はエラーを返す', () => {
    const r = parseTableQuery('タイトル~/[/', COLS);
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it('empty / !empty', () => {
    expect(match('担当 者:empty', row('a', 'b', ''))).toBe(false); // クォートなし→列名解決されない
    expect(match('"担当 者":empty', row('a', 'b', ''))).toBe(true);
    expect(match('"担当 者":empty', row('a', 'b', '田中'))).toBe(false);
    expect(match('"担当 者":!empty', row('a', 'b', '田中'))).toBe(true);
  });

  it('クォート付き列名', () => {
    expect(match('"担当 者":田中', row('', '', '田中太郎'))).toBe(true);
  });

  it('未知の列名はあいまい検索にフォールバック', () => {
    // 'unknown:値' は列解決できないので全体を全列検索
    expect(match('unknown:値', row('unknown:値あり'))).toBe(true);
  });

  it('括弧未閉じはエラー', () => {
    const r = parseTableQuery('(タイトル:A', COLS);
    expect(r.ok).toBe(false);
  });
});

describe('isBalanced', () => {
  it('クォート・括弧の対応を判定する', () => {
    expect(isBalanced('タイトル:A')).toBe(true);
    expect(isBalanced('(A OR B)')).toBe(true);
    expect(isBalanced('(A OR B')).toBe(false);
    expect(isBalanced('"担当 者:田')).toBe(false); // クォート未閉じ
    expect(isBalanced('"担当 者":田中')).toBe(true);
  });
});

describe('splitTopLevelTerms', () => {
  it('トップレベルのスペースで分割する', () => {
    expect(splitTopLevelTerms('タイトル:A ステータス:完了')).toEqual(['タイトル:A', 'ステータス:完了']);
  });
  it('クォート内・括弧内のスペースでは分割しない', () => {
    expect(splitTopLevelTerms('"担当 者":田中 A')).toEqual(['"担当 者":田中', 'A']);
    expect(splitTopLevelTerms('(A OR B) C')).toEqual(['(A OR B)', 'C']);
  });
  it('OR は 1 要素にまとめる', () => {
    expect(splitTopLevelTerms('A OR B C')).toEqual(['A OR B', 'C']);
    expect(splitTopLevelTerms('A OR B OR C')).toEqual(['A OR B OR C']);
  });
  it('連続スペース・前後の空白を無視する', () => {
    expect(splitTopLevelTerms('  A   B ')).toEqual(['A', 'B']);
    expect(splitTopLevelTerms('')).toEqual([]);
  });
  it('分割して結合すると元のクエリと等価', () => {
    const q = 'タイトル:A (B OR C) -"担当 者":田中';
    expect(splitTopLevelTerms(q).join(' ')).toBe(q);
  });
});

describe('describeTerm', () => {
  it('列指定を分解する', () => {
    expect(describeTerm('タイトル:API', COLS)).toMatchObject({
      kind: 'col', negate: false, colLabel: 'タイトル', opLabel: ':', value: 'API',
    });
  });
  it('否定を検出する', () => {
    expect(describeTerm('-タイトル:API', COLS)).toMatchObject({ kind: 'col', negate: true, value: 'API' });
  });
  it('empty / !empty を日本語化する', () => {
    expect(describeTerm('タイトル:empty', COLS)).toMatchObject({ opLabel: 'は', value: '空' });
    expect(describeTerm('タイトル:!empty', COLS)).toMatchObject({ opLabel: 'は', value: '空でない' });
  });
  it('クォート付き列名のクォートを外す', () => {
    expect(describeTerm('"担当 者":田中', COLS)).toMatchObject({ kind: 'col', colLabel: '担当 者', value: '田中' });
  });
  it('演算子なし・未知の列名は全列あいまい', () => {
    expect(describeTerm('API', COLS)).toMatchObject({ kind: 'free', value: 'API' });
    expect(describeTerm('unknown:値', COLS)).toMatchObject({ kind: 'free', value: 'unknown:値' });
  });
  it('OR・括弧を含むものは式として扱う', () => {
    expect(describeTerm('A OR B', COLS)).toMatchObject({ kind: 'expr', value: 'A OR B' });
    expect(describeTerm('(A OR B)', COLS)).toMatchObject({ kind: 'expr' });
  });
  it('raw は元の断片を保持する（編集時に入力欄へ戻すため）', () => {
    expect(describeTerm('-"担当 者":田中', COLS).raw).toBe('-"担当 者":田中');
  });
});
