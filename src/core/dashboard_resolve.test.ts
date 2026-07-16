// ==================================================
// dashboard_resolve ユニットテスト
// ==================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatDate, applyOffset, resolveDateVars, resolveColumnRefs,
  resolveBindVars, resolveSectionVars, resolveAll, isUrl,
  countCalendarDays, countBusinessDaysSimple, getResetPeriodKey,
  TABLE_ACTIVE_PRESET_PFX, LIST_ACTIVE_PRESET_PFX,
} from './dashboard_resolve';
import type { DashboardSection, DashboardItem, DashboardPreset } from '../db/dashboard_db';

// ── テスト用ファクトリ ─────────────────────────────────────
function makeSection(patch: Partial<DashboardSection> = {}): DashboardSection {
  return {
    id: 1, instance_id: 'default', title: 'テスト', icon: '📄',
    type: 'table', position: 0, width: 'auto', ...patch,
  };
}

function makeItem(rowData: Record<string, string> = {}): DashboardItem {
  return {
    id: 1, section_id: 1, position: 0, item_type: 'row',
    label: '', value: '', row_data: rowData,
  };
}

const GLOBAL_PRESETS: DashboardPreset[] = [
  { id: 10, instance_id: 'default', name: '本番', position: 0, values: { ENV: 'prod', HOST: 'prod.example.com' } },
  { id: 11, instance_id: 'default', name: '検証', position: 1, values: { ENV: 'stg' } },
];

// ── formatDate ─────────────────────────────────────────────
describe('formatDate', () => {
  const d = new Date(2026, 6, 5, 9, 3, 7); // 2026-07-05 (日) 09:03:07

  it('デフォルトフォーマット YYYY/MM/DD', () => {
    expect(formatDate(d)).toBe('2026/07/05');
  });

  it('ゼロ埋めあり・なしのトークンを両方解決する', () => {
    expect(formatDate(d, 'YYYY-MM-DD HH:mm:ss')).toBe('2026-07-05 09:03:07');
    expect(formatDate(d, 'M/D H:m:s')).toBe('7/5 9:3:7');
  });

  it('曜日トークン（dddd が ddd より優先）', () => {
    expect(formatDate(d, 'ddd')).toBe('日');
    expect(formatDate(d, 'dddd')).toBe('日曜日');
  });

  it('YY は下2桁', () => {
    expect(formatDate(d, 'YY/MM')).toBe('26/07');
  });
});

// ── applyOffset ────────────────────────────────────────────
describe('applyOffset', () => {
  const base = new Date(2026, 0, 31, 12, 0, 0); // 2026-01-31 12:00

  it('日・週・月・年のオフセット', () => {
    expect(applyOffset(base, '+1d').getDate()).toBe(1);        // 2/1
    expect(applyOffset(base, '-1d').getDate()).toBe(30);
    expect(applyOffset(base, '+1w').getDate()).toBe(7);        // 2/7
    expect(applyOffset(base, '+1y').getFullYear()).toBe(2027);
  });

  it('時・分のオフセット', () => {
    expect(applyOffset(base, '+3h').getHours()).toBe(15);
    expect(applyOffset(base, '-30m').getMinutes()).toBe(30);
  });

  it('不正なオフセットは元の日付を返す', () => {
    expect(applyOffset(base, 'abc')).toBe(base);
    expect(applyOffset(base, '+1x')).toBe(base);
  });
});

// ── resolveDateVars ────────────────────────────────────────
describe('resolveDateVars', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 16, 14, 30, 0)); // 2026-07-16 (木) 14:30
  });
  afterEach(() => vi.useRealTimers());

  it('{TODAY} / {NOW} のデフォルトフォーマット', () => {
    expect(resolveDateVars('{TODAY}')).toBe('2026/07/16');
    expect(resolveDateVars('{NOW}')).toBe('2026/07/16 14:30');
  });

  it('{TODAY:Fmt} のカスタムフォーマット（コロン入り Fmt も可）', () => {
    expect(resolveDateVars('{TODAY:YYYY-MM-DD}')).toBe('2026-07-16');
    expect(resolveDateVars('{NOW:HH:mm}')).toBe('14:30');
  });

  it('{DATE:±N単位:Fmt} のオフセット付き解決', () => {
    expect(resolveDateVars('{DATE:+1d:YYYY/MM/DD}')).toBe('2026/07/17');
    expect(resolveDateVars('{DATE:-1M:YYYY/MM}')).toBe('2026/06');
    expect(resolveDateVars('{DATE}')).toBe('2026/07/16');
  });

  it('日付変数以外の {VAR} は変更しない', () => {
    expect(resolveDateVars('echo {ENV} {TODAY}')).toBe('echo {ENV} 2026/07/16');
  });

  it('空文字はそのまま', () => {
    expect(resolveDateVars('')).toBe('');
  });
});

// ── resolveColumnRefs ──────────────────────────────────────
describe('resolveColumnRefs', () => {
  const COLS = [
    { id: 'c1', label: 'ホスト' },
    { id: 'c2', label: 'ポート' },
    { id: 'c3', label: '備考 欄' },
  ];
  const item = makeItem({ c1: 'db01', c2: '5432', c3: 'メモ' });

  it('{@列ラベル} を同じ行の生値で置換する', () => {
    expect(resolveColumnRefs('ssh {@ホスト} -p {@ポート}', item, COLS)).toBe('ssh db01 -p 5432');
  });

  it('列 id でもマッチする（label 優先）', () => {
    expect(resolveColumnRefs('{@c2}', item, COLS)).toBe('5432');
  });

  it('スペース入り列名は {@"列 名"} でクォート', () => {
    expect(resolveColumnRefs('{@"備考 欄"}', item, COLS)).toBe('メモ');
  });

  it('未定義の列参照はそのまま残す（タイプミス可視化）', () => {
    expect(resolveColumnRefs('{@存在しない}', item, COLS)).toBe('{@存在しない}');
  });

  it('row_data に値がない列は空文字', () => {
    expect(resolveColumnRefs('{@ホスト}', makeItem({}), COLS)).toBe('');
  });

  it('再帰しない（1パスのみ）: 参照先の {VAR} はそのまま残る', () => {
    const it2 = makeItem({ c1: '{@ポート}' });
    expect(resolveColumnRefs('{@ホスト}', it2, COLS)).toBe('{@ポート}');
  });
});

// ── resolveBindVars ────────────────────────────────────────
describe('resolveBindVars', () => {
  const VARS = ['ENV', 'HOST'];

  it('アクティブプリセットの値で置換する', () => {
    expect(resolveBindVars('deploy {ENV} to {HOST}', VARS, GLOBAL_PRESETS, 10))
      .toBe('deploy prod to prod.example.com');
  });

  it('プリセットに値がない変数は空文字（スコープ内）', () => {
    expect(resolveBindVars('{ENV}/{HOST}', VARS, GLOBAL_PRESETS, 11)).toBe('stg/');
  });

  it('プリセット未選択なら変更しない', () => {
    expect(resolveBindVars('{ENV}', VARS, GLOBAL_PRESETS, null)).toBe('{ENV}');
  });

  it('スコープ外の変数と {INPUT} は触らない', () => {
    expect(resolveBindVars('{OTHER} {INPUT} {ENV}', VARS, GLOBAL_PRESETS, 10))
      .toBe('{OTHER} {INPUT} prod');
  });
});

// ── resolveSectionVars ─────────────────────────────────────
describe('resolveSectionVars', () => {
  beforeEach(() => localStorage.clear());

  const section = makeSection({
    type: 'table',
    table_bind_vars: ['ENV'],
    table_presets: [
      { id: 'p1', name: 'A', values: { ENV: 'section-prod' } },
      { id: 'p2', name: 'B', values: {} },
    ],
  });

  it('アクティブプリセット選択中はセクション値で置換する', () => {
    localStorage.setItem(TABLE_ACTIVE_PRESET_PFX + section.id, JSON.stringify('p1'));
    const { result, hadPreset } = resolveSectionVars('{ENV}/{OTHER}', section);
    expect(result).toBe('section-prod/{OTHER}');
    expect(hadPreset).toBe(true);
  });

  it('スコープ内で値がないキーは空文字', () => {
    localStorage.setItem(TABLE_ACTIVE_PRESET_PFX + section.id, JSON.stringify('p2'));
    expect(resolveSectionVars('{ENV}', section).result).toBe('');
  });

  it('プリセット未選択なら hadPreset=false で変更しない', () => {
    const { result, hadPreset } = resolveSectionVars('{ENV}', section);
    expect(result).toBe('{ENV}');
    expect(hadPreset).toBe(false);
  });

  it('プリセットを持たないタイプ（memo 等）は対象外', () => {
    const memo = makeSection({ type: 'memo' });
    expect(resolveSectionVars('{ENV}', memo).hadPreset).toBe(false);
  });

  it('list タイプは list_presets / list_bind_vars を参照する', () => {
    const list = makeSection({
      id: 2, type: 'list',
      list_bind_vars: ['V'],
      list_presets: [{ id: 1, name: 'L', values: { V: 'from-list' } }],
    });
    localStorage.setItem(LIST_ACTIVE_PRESET_PFX + list.id, JSON.stringify(1));
    expect(resolveSectionVars('{V}', list).result).toBe('from-list');
  });
});

// ── resolveAll（チェーン） ─────────────────────────────────
describe('resolveAll', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 16));
  });
  afterEach(() => vi.useRealTimers());

  it('セクション（優先）→ グローバル → 日付 の順で解決する', () => {
    const section = makeSection({
      table_bind_vars: ['ENV'],
      table_presets: [{ id: 'p1', name: 'A', values: { ENV: 'sec-env' } }],
    });
    localStorage.setItem(TABLE_ACTIVE_PRESET_PFX + section.id, JSON.stringify('p1'));
    // ENV はセクション側が優先。HOST はグローバルで解決。TODAY は日付変数
    expect(resolveAll('{ENV} {HOST} {TODAY}', section, ['ENV', 'HOST'], GLOBAL_PRESETS, 10))
      .toBe('sec-env prod.example.com 2026/07/16');
  });

  it('どちらの bind_vars にも未定義の {U} はそのまま残る', () => {
    const section = makeSection({});
    expect(resolveAll('{U}', section, ['ENV'], GLOBAL_PRESETS, 10)).toBe('{U}');
  });
});

// ── isUrl ──────────────────────────────────────────────────
describe('isUrl', () => {
  it('http(s) URL を判定する', () => {
    expect(isUrl('https://example.com/path')).toBe(true);
    expect(isUrl('http://localhost:3000')).toBe(true);
  });
  it('URL でない文字列は false', () => {
    expect(isUrl('echo hello')).toBe(false);
    expect(isUrl('')).toBe(false);
  });
});

// ── 日数計算 ───────────────────────────────────────────────
describe('countCalendarDays', () => {
  it('暦日差を返す（順方向・逆方向）', () => {
    expect(countCalendarDays(new Date(2026, 6, 16), new Date(2026, 6, 20))).toBe(4);
    expect(countCalendarDays(new Date(2026, 6, 20), new Date(2026, 6, 16))).toBe(-4);
    expect(countCalendarDays(new Date(2026, 6, 16), new Date(2026, 6, 16))).toBe(0);
  });

  it('時刻成分は無視される', () => {
    expect(countCalendarDays(new Date(2026, 6, 16, 23, 59), new Date(2026, 6, 17, 0, 1))).toBe(1);
  });
});

describe('countBusinessDaysSimple', () => {
  // 2026-07-16(木) → 07-20(月): 木・金の2営業日（土日除外、終端日は含まない）
  it('土日を除いてカウントする', () => {
    expect(countBusinessDaysSimple(new Date(2026, 6, 16), new Date(2026, 6, 20))).toBe(2);
  });

  it('逆方向は負の値', () => {
    expect(countBusinessDaysSimple(new Date(2026, 6, 20), new Date(2026, 6, 16))).toBe(-2);
  });

  it('同日は 0', () => {
    expect(countBusinessDaysSimple(new Date(2026, 6, 16), new Date(2026, 6, 16))).toBe(0);
  });
});

// ── getResetPeriodKey ──────────────────────────────────────
describe('getResetPeriodKey', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 0)); // 2026-01-01 (木)
  });
  afterEach(() => vi.useRealTimers());

  it('daily は YYYY-MM-DD', () => {
    expect(getResetPeriodKey('daily')).toBe('2026-01-01');
  });

  it('weekly は ISO 週番号（2026-01-01 は W01）', () => {
    expect(getResetPeriodKey('weekly')).toBe('2026-W01');
  });

  it('monthly / yearly / never', () => {
    expect(getResetPeriodKey('monthly')).toBe('2026-01');
    expect(getResetPeriodKey('yearly')).toBe('2026');
    expect(getResetPeriodKey('never')).toBe('');
  });
});
