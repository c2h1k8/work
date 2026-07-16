// ==================================================
// dashboard_resolve — ダッシュボードのバインド変数解決ロジック
// ==================================================
// DashboardPage から抽出した純関数群。
// 解決チェーン: resolveColumnRefs（table セルのみ・行依存・先頭）
//             → resolveSectionVars → resolveBindVars → resolveDateVars
// 日付変数: {TODAY} / {NOW} / {DATE:±N単位:Fmt}
// 列値バインド: {@列名}（同じ行の他列の生値を埋め込む）

import type { DashboardSection, DashboardItem, DashboardPreset, SectionPreset } from '../db/dashboard_db';
import { lsJson } from './utils';

// ── セクション固有プリセットのアクティブID localStorage プレフィックス ──
export const TABLE_ACTIVE_PRESET_PFX = 'dashboard_table_active_preset_';
export const LIST_ACTIVE_PRESET_PFX  = 'dashboard_list_active_preset_';
export const GRID_ACTIVE_PRESET_PFX  = 'dashboard_grid_active_preset_';

// ── 日付変数解決 ───────────────────────────────────────────
const DAY_SHORT = ['日', '月', '火', '水', '木', '金', '土'];
const DAY_LONG  = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];

export function formatDate(d: Date, fmt = 'YYYY/MM/DD'): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yy  = String(d.getFullYear()).slice(-2);
  return fmt
    // 長いトークンを先に処理して短縮形との競合を防ぐ
    .replace('dddd', DAY_LONG[d.getDay()])
    .replace('ddd',  DAY_SHORT[d.getDay()])
    .replace('YYYY', String(d.getFullYear()))
    .replace('YY',   yy)
    .replace('MM',   pad(d.getMonth() + 1))
    .replace('DD',   pad(d.getDate()))
    .replace('HH',   pad(d.getHours()))
    .replace('mm',   pad(d.getMinutes()))
    .replace('ss',   pad(d.getSeconds()))
    // ゼロ埋めなし（ダブル処理後に適用）
    .replace('M',    String(d.getMonth() + 1))
    .replace('D',    String(d.getDate()))
    .replace('H',    String(d.getHours()))
    .replace('m',    String(d.getMinutes()))
    .replace('s',    String(d.getSeconds()));
}

export function applyOffset(date: Date, offset: string): Date {
  const m = offset.match(/^([+-])(\d+)([dwMyhm])$/);
  if (!m) return date;
  const sign = m[1] === '+' ? 1 : -1;
  const n = parseInt(m[2], 10) * sign;
  const d = new Date(date);
  if      (m[3] === 'd') d.setDate(d.getDate() + n);
  else if (m[3] === 'w') d.setDate(d.getDate() + n * 7);
  else if (m[3] === 'M') d.setMonth(d.getMonth() + n);
  else if (m[3] === 'y') d.setFullYear(d.getFullYear() + n);
  else if (m[3] === 'h') d.setHours(d.getHours() + n);
  else if (m[3] === 'm') d.setMinutes(d.getMinutes() + n);
  return d;
}

export function resolveDateVars(str: string): string {
  if (!str) return str;
  const now = new Date();
  // フォーマット文字列がコロンを含む場合（例: HH:mm）に対応するため、
  // 最初の : 以降をすべて1つのキャプチャグループで受け取り、DATE のみ内部で分割する
  return str.replace(
    /\{(TODAY|NOW|DATE)(?::([^}]*))?\}/g,
    (_m, type, arg1) => {
      if (type === 'TODAY') return formatDate(now, arg1 || 'YYYY/MM/DD');
      if (type === 'NOW')   return formatDate(now, arg1 || 'YYYY/MM/DD HH:mm');
      if (type === 'DATE') {
        const sep    = (arg1 || '').indexOf(':');
        const offset = sep >= 0 ? arg1.slice(0, sep) : (arg1 || '+0d');
        const fmt    = sep >= 0 ? arg1.slice(sep + 1) : 'YYYY/MM/DD';
        return formatDate(applyOffset(now, offset || '+0d'), fmt);
      }
      return _m;
    },
  );
}

// ── 列値バインド（同じ行の他列を参照） ─────────────────────────
// {@列名} を同じ行の該当列の生値で1回だけ置換する（再帰しない）。
// 列名（label）優先、なければ列 id でマッチ。スペース入りは {@"列 名"}。
// 未定義の列参照は {@...} のまま残す（タイプミスを可視化）。1パスのみなので
// 循環参照（A→B→A）でも無限ループしない。
export function resolveColumnRefs(
  str: string,
  item: DashboardItem,
  columns: { id: string; label: string }[],
): string {
  if (!str || str.indexOf('{@') < 0) return str || '';
  const data = item.row_data || {};
  return str.replace(/\{@(?:"([^"]+)"|([^}]+))\}/g, (m, quoted, bare) => {
    const name = (quoted ?? bare).trim();
    const col = columns.find((c) => c.label === name) || columns.find((c) => c.id === name);
    if (!col) return m;                     // 未定義はそのまま残す
    return data[col.id] ?? '';
  });
}

// ── バインド変数解決 ───────────────────────────────────────
// ① グローバルプリセットで置換。globalVarNames に含まれるキーのみ対象。
//    プリセット選択中: 値があれば値、なければ '' / 未選択: 変えない
export function resolveBindVars(
  str: string,
  globalVarNames: string[],
  presets: DashboardPreset[],
  activePresetId: number | null,
): string {
  if (!str) return str || '';
  const preset = presets.find((p) => p.id === activePresetId);
  if (!preset) return str;
  const varSet = new Set(globalVarNames);
  return str.replace(/\{([^}]+)\}/g, (m, key) => {
    if (key === 'INPUT') return m;
    if (!varSet.has(key)) return m;  // グローバルスコープ外は触らない
    return (preset.values && preset.values[key] !== undefined) ? preset.values[key] : '';
  });
}

// ② セクション固有プリセットで置換（グローバルより優先）。
//    section bind_vars に含まれるキーのみ対象。未マッチは {key} のまま残す。
export function resolveSectionVars(str: string, section: DashboardSection): { result: string; hadPreset: boolean } {
  if (!str) return { result: str || '', hadPreset: false };
  let sPresets: SectionPreset[] = [];
  let activePfx = '';
  let bindVars: string[] = [];
  if      (section.type === 'table') { sPresets = section.table_presets || []; activePfx = TABLE_ACTIVE_PRESET_PFX; bindVars = section.table_bind_vars || []; }
  else if (section.type === 'list')  { sPresets = section.list_presets  || []; activePfx = LIST_ACTIVE_PRESET_PFX;  bindVars = section.list_bind_vars  || []; }
  else if (section.type === 'grid')  { sPresets = section.grid_presets  || []; activePfx = GRID_ACTIVE_PRESET_PFX;  bindVars = section.grid_bind_vars  || []; }
  else return { result: str, hadPreset: false };
  if (sPresets.length === 0) return { result: str, hadPreset: false };
  const activeId = lsJson<string | number>(activePfx + section.id);
  const preset = activeId != null ? sPresets.find((p) => String(p.id) === String(activeId)) : null;
  if (!preset) return { result: str, hadPreset: false };
  const vals = preset.values || {};
  const varSet = new Set(bindVars);
  return {
    result: str.replace(/\{([^}]+)\}/g, (m, key) => {
      if (!varSet.has(key)) return m;        // セクションスコープ外は触らない
      return key in vals ? vals[key] : '';   // スコープ内: 値 or ''
    }),
    hadPreset: true,
  };
}

// ③ チェーン: セクション（優先）→ グローバル（フォールバック）→ 日付
//    {U}（どちらの bind_vars にも未定義）は常にそのまま残る
export function resolveAll(
  str: string,
  section: DashboardSection,
  globalVarNames: string[],
  presets: DashboardPreset[],
  activePresetId: number | null,
): string {
  const { result: afterSection } = resolveSectionVars(str, section);
  const afterGlobal = resolveBindVars(afterSection, globalVarNames, presets, activePresetId);
  return resolveDateVars(afterGlobal);
}

// ── URL 判定 ───────────────────────────────────────────────
export function isUrl(str: string): boolean {
  try { new URL(str); return true; } catch { return /^https?:\/\//.test(str); }
}

// ── 営業日計算（countdown 用） ─────────────────────────────
export function countCalendarDays(from: Date, to: Date): number {
  // Date.UTC でローカル年月日を正規化することで DST/タイムゾーン誤差を排除
  const fromUTC = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const toUTC   = Date.UTC(to.getFullYear(),   to.getMonth(),   to.getDate());
  return Math.round((toUTC - fromUTC) / 86400000);
}

export function countBusinessDaysSimple(from: Date, to: Date): number {
  // Vanilla JS 版と同ロジック: 常に小→大方向に順方向カウントして最後に符号付与
  const sign  = to >= from ? 1 : -1;
  const start = sign === 1 ? new Date(from) : new Date(to);
  const end   = sign === 1 ? new Date(to)   : new Date(from);
  let count = 0;
  const cur = new Date(start);
  while (cur < end) {
    if (cur.getDay() !== 0 && cur.getDay() !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count * sign;
}

// ── チェックリストリセット周期キー（vanilla JS と同ロジック）─
export function getResetPeriodKey(reset: string): string {
  const now = new Date();
  if (reset === 'daily')   return now.toISOString().slice(0, 10);
  if (reset === 'weekly') {
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
  }
  if (reset === 'monthly') return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  if (reset === 'yearly')  return String(now.getFullYear());
  return '';
}
