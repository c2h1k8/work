// ==================================================
// SqlPage — SQL Toolkit（React 移行版）
// ==================================================
// タブ: 接続・設定 | 実行計画 & チューニング | テーブル定義メモ

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useToast } from '../components/Toast';
import { DatePicker } from '../components/DatePicker';
import { Select, type SelectOption } from '../components/Select';
import { sqlDB, type SqlEnv, type TableMemo, type TableColumn, type TableIndex } from '../db/sql_db';
import { activityDB } from '../db/activity_db';
import { ActivityLogger } from '../core/activity_logger';
import { Clipboard } from '../core/clipboard';
import { FileSaver } from '../core/file_saver';
import { extractExcerpt } from '../core/utils';
import { useTabStore } from '../stores/tab_store';
import { searchRegistry } from '../stores/search_store';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Copy, Plus, Trash2, Pencil, ChevronRight,
  X, Eye, EyeOff, Search, Download, Upload, Play,
  Settings, Terminal, BarChart2, FileText, Columns,
  ArrowLeftRight, GripVertical, Database,
} from 'lucide-react';

// ================================================================
// 型・定数
// ================================================================

type SqlTab = 'setup' | 'analyze' | 'memo';
type MemoViewMode = 'table' | 'column';

const SK_TAB         = 'sql_active_tab';
const SK_ENV         = 'sql_selected_env';
const SK_PARAM       = 'sql_params';
const SK_TUNE_TAB    = 'sql_tune_tab';
const SK_TUNE_GROUPS = 'sql_tune_groups';
const SK_MEMO_VIEW   = 'sql_memo_view';
const SK_OPTS              = 'sql_sqlplus_opts';
const SK_EXTRA             = 'sql_sqlplus_extra';
const SK_RELATION_EXCLUDE  = 'sql_relation_exclude_cols';

const DEFAULT_EXCLUDE_COLS = ['created_at','updated_at','deleted_at','created_by','updated_by','deleted_by','created_date','updated_date'];

const DEFAULT_ENVS: Omit<SqlEnv, 'id' | 'position'>[] = [
  { key: 'UT',  username: 'xxxx', password: 'xxxx', connect_identifier: '127.0.0.1:1521/xxxx' },
  { key: 'XXX', username: 'xxxx', password: 'xxxx', connect_identifier: '127.0.0.1:1521/xxxx' },
];

const SQLPLUS_OPTIONS = [
  { flag: '-S', desc: 'サイレントモード（ヘッダー・プロンプト非表示）' },
  { flag: '-L', desc: 'ログイン試行を1回のみに制限' },
];

const SESSION_PRESETS = [
  {
    id: 'plan', label: '実行計画',
    commands: 'SET LINESIZE 400\nSET PAGESIZE 0\nSET FEEDBACK ON\nSET TIMING ON\nSET TRIMSPOOL ON\nSET AUTOTRACE TRACEONLY',
  },
  {
    id: 'result', label: '実行結果',
    commands: "SET LINESIZE 400\nSET PAGESIZE 50000\nSET FEEDBACK ON\nSET TIMING ON\nSET TRIMSPOOL ON\nSET NULL '(null)'\nSET NUMWIDTH 15\nSET AUTOTRACE OFF",
  },
] as const;

interface TypeDef { label: string; lenMode: 'required'|'optional'|'none'; isStrings: boolean; nPrefix: boolean; isDate: boolean; defaultLen: string; }
const TYPE_DEFS: Record<string, TypeDef> = {
  VARCHAR2:  { label: 'VARCHAR2',  lenMode: 'required', isStrings: true,  nPrefix: false, isDate: false, defaultLen: '20' },
  NVARCHAR2: { label: 'NVARCHAR2', lenMode: 'required', isStrings: true,  nPrefix: true,  isDate: false, defaultLen: '20' },
  CHAR:      { label: 'CHAR',      lenMode: 'required', isStrings: true,  nPrefix: false, isDate: false, defaultLen: '6'  },
  NUMBER:    { label: 'NUMBER',    lenMode: 'none',     isStrings: false, nPrefix: false, isDate: false, defaultLen: ''   },
  DATE:      { label: 'DATE',      lenMode: 'none',     isStrings: false, nPrefix: false, isDate: true,  defaultLen: ''   },
};
const TYPE_OPTIONS: SelectOption[] = Object.keys(TYPE_DEFS).map(k => ({ value: k, label: k }));

interface TuneItem { op: string; category: string; level: 'ok'|'mid'|'high'|'low'; desc: string; }
const TUNE_ITEMS: TuneItem[] = [
  { op: 'INDEX UNIQUE SCAN', category: 'スキャン', level: 'ok', desc: '等価条件で B-tree インデックスから 1 件取得。最もコストが低い最適なアクセス方法。' },
  { op: 'INDEX RANGE SCAN', category: 'スキャン', level: 'ok', desc: '範囲条件（= / < / > / BETWEEN / LIKE 前方一致）でのインデックス走査。典型的な良好アクセスパス。' },
  { op: 'INDEX RANGE SCAN DESCENDING', category: 'スキャン', level: 'ok', desc: 'INDEX RANGE SCAN の降順版。ORDER BY 列 DESC にインデックスが利用されているとき発生。' },
  { op: 'TABLE ACCESS BY INDEX ROWID', category: 'スキャン', level: 'ok', desc: 'インデックスで特定した ROWID でテーブル行を取得。インデックス経由アクセスの標準的な形。' },
  { op: 'TABLE ACCESS BY INDEX ROWID BATCHED', category: 'スキャン', level: 'ok', desc: '複数 ROWID を一括取得（Oracle 12c 以降）。TABLE ACCESS BY INDEX ROWID よりブロック I/O を削減。' },
  { op: 'INDEX FULL SCAN (MIN/MAX)', category: 'スキャン', level: 'ok', desc: 'MIN / MAX 取得のためにインデックスの先頭または末尾エントリのみを参照。極めて低コスト。' },
  { op: 'PARTITION RANGE SINGLE', category: 'スキャン', level: 'ok', desc: 'WHERE 句にパーティションキーが含まれ、1 つのパーティションに絞り込まれた（プルーニング成功）。' },
  { op: 'TABLE ACCESS FULL', category: 'スキャン', level: 'high', desc: 'テーブル全件スキャン。大テーブルで発生している場合はインデックスの作成・利用を検討する。' },
  { op: 'PARTITION RANGE ALL', category: 'スキャン', level: 'high', desc: '全パーティションを走査。WHERE 句にパーティションキーを含めてプルーニングを効かせる。' },
  { op: 'INDEX FULL SCAN', category: 'スキャン', level: 'mid', desc: 'インデックスの全エントリを順に走査。INDEX RANGE SCAN に絞り込めないか条件を見直す。' },
  { op: 'INDEX FAST FULL SCAN', category: 'スキャン', level: 'mid', desc: 'マルチブロック読み込みによるインデックス全走査。SELECT 列をインデックス列のみに絞れないか確認する。' },
  { op: 'INDEX SKIP SCAN', category: 'スキャン', level: 'mid', desc: '複合インデックスの先頭列が WHERE 条件にない場合に発生。インデックス構成の見直し（先頭列の選択）を検討する。' },
  { op: 'PARTITION RANGE ITERATOR', category: 'スキャン', level: 'mid', desc: '複数パーティションをスキャン。プルーニング条件をさらに絞り込めないか見直す。' },
  { op: 'NESTED LOOPS', category: '結合', level: 'low', desc: '外側ループの各行に対して内側テーブルをアクセス。内側テーブルに適切なインデックスがある小〜中規模結合に有効。' },
  { op: 'NESTED LOOPS OUTER', category: '結合', level: 'low', desc: 'Nested Loops の外部結合版。内側テーブルに一致しない場合も外側の行を返す。' },
  { op: 'NESTED LOOPS SEMI', category: '結合', level: 'ok', desc: 'IN / EXISTS を Nested Loops で処理するセミ結合。内側で最初にマッチした時点でループを打ち切るため効率的。' },
  { op: 'NESTED LOOPS ANTI', category: '結合', level: 'low', desc: 'NOT IN / NOT EXISTS を Nested Loops で処理するアンチ結合。内側テーブルにインデックスがある場合に選択される。' },
  { op: 'HASH JOIN', category: '結合', level: 'low', desc: '小さい方のテーブルをハッシュテーブルに構築して大テーブルと等価結合。pga_aggregate_target の調整でディスクスピルを抑制できる。' },
  { op: 'HASH JOIN OUTER', category: '結合', level: 'low', desc: 'Hash Join の外部結合版。大規模テーブルの LEFT OUTER JOIN で典型的に発生。' },
  { op: 'HASH JOIN SEMI', category: '結合', level: 'ok', desc: 'IN / EXISTS をハッシュ方式で処理するセミ結合。内側でマッチが確認できた時点で外側の行を返す。' },
  { op: 'HASH JOIN ANTI', category: '結合', level: 'low', desc: 'NOT IN / NOT EXISTS をハッシュ方式で処理するアンチ結合。大規模テーブルの NOT IN に有効。NULL 値の扱いに注意。' },
  { op: 'MERGE JOIN', category: '結合', level: 'low', desc: '両テーブルを結合キーでソートしてマージ（ソートマージ結合）。等価・不等価結合に対応。既にソート済みであればコスト低。' },
  { op: 'MERGE JOIN CARTESIAN', category: '結合', level: 'high', desc: 'デカルト積（直積）結合。結合条件の漏れが原因のことが多い。WHERE 句の結合条件を確認する。' },
  { op: 'SORT AGGREGATE', category: '処理', level: 'ok', desc: 'GROUP BY なしの集計処理（COUNT(*) / SUM / MAX / MIN 等）。全件を集約して 1 行を返す。' },
  { op: 'HASH (GROUP BY)', category: '処理', level: 'ok', desc: 'ハッシュ集計による GROUP BY。ソートが不要でメモリ効率が良い。大量データの集計に有効。' },
  { op: 'HASH UNIQUE', category: '処理', level: 'ok', desc: 'ハッシュによる重複排除（DISTINCT 相当）。SORT UNIQUE よりソートコストがない分効率的。' },
  { op: 'COUNT (STOPKEY)', category: '処理', level: 'ok', desc: 'ROWNUM 条件による早期終了（FETCH FIRST / LIMIT 相当）。必要な件数に達した時点で処理を停止。' },
  { op: 'SORT (ORDER BY)', category: '処理', level: 'mid', desc: '行のソート処理。インデックスで ORDER BY を排除できないか条件を見直す。pga_aggregate_target を増やすとディスクスピルを抑制できる。' },
  { op: 'SORT (GROUP BY)', category: '処理', level: 'mid', desc: '集約のためのソート処理。USE_HASH_AGGREGATION ヒントで HASH (GROUP BY) への変換を検討する。' },
  { op: 'SORT (GROUP BY ROLLUP)', category: '処理', level: 'mid', desc: 'ROLLUP / CUBE 集計のソート処理。集計列数・行数が多い場合は PGA メモリに注意する。' },
  { op: 'SORT UNIQUE', category: '処理', level: 'mid', desc: 'DISTINCT 処理のためのソート。HASH UNIQUE に変換できないか確認する。' },
  { op: 'FILTER', category: '処理', level: 'mid', desc: '相関サブクエリによるフィルター。外側クエリの行数分だけ実行される。EXISTS や JOIN への書き換えを検討する。' },
  { op: 'BUFFER SORT', category: '処理', level: 'low', desc: 'MERGE JOIN の内側入力を一時バッファに保存。pga_aggregate_target の調整でメモリ不足を改善できる。' },
  { op: 'WINDOW SORT', category: '処理', level: 'low', desc: '分析関数（ウィンドウ関数）のためのソート。PARTITION BY / ORDER BY の列にインデックスが利用できないか確認する。' },
  { op: 'WINDOW BUFFER', category: '処理', level: 'low', desc: 'ROWS / RANGE 指定を伴う分析関数のバッファリング。pga_aggregate_target に収まるサイズか確認する。' },
  { op: 'VIEW', category: 'その他', level: 'low', desc: 'ビューまたはインラインビューの評価。必要に応じてビューのマージ（View Merging）が発生しているか確認する。' },
  { op: 'UNION-ALL', category: 'その他', level: 'low', desc: '複数の結果セットを UNION ALL で連結。各ブランチが独立して実行される。' },
  { op: 'CONCATENATION', category: 'その他', level: 'mid', desc: 'OR 条件を複数の実行計画に分割して結果を UNION ALL。各ブランチのコストを確認する。' },
  { op: 'CONNECT BY (WITH FILTERING)', category: 'その他', level: 'mid', desc: 'START WITH フィルタリングありの階層クエリ。再帰深度が深い場合はメモリ・CPU に注意する。' },
  { op: 'REMOTE', category: 'その他', level: 'mid', desc: 'DB Link 経由のリモートアクセス。ネットワーク遅延と転送データ量に注意。ローカルでの JOIN を検討する。' },
];

const TUNE_CATEGORIES = ['スキャン', '結合', '処理', 'その他'] as const;

const LEVEL_BADGE: Record<string, string> = {
  ok:   'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  mid:  'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  high: 'bg-red-500/15 text-red-400 border border-red-500/30',
  low:  'bg-sky-500/15 text-sky-400 border border-sky-500/30',
};
const LEVEL_BORDER: Record<string, string> = {
  ok: 'border-l-emerald-500', mid: 'border-l-amber-500', high: 'border-l-red-500', low: 'border-l-sky-500',
};
const LEVEL_LABEL: Record<string, string> = { ok: '良好', mid: '要注意', high: '要改善', low: '参考' };

// ================================================================
// ユーティリティ
// ================================================================

function validateEnv(key: string, user: string, host: string, portRaw: string, service: string): string | null {
  if (!key)  return '環境名を入力してください';
  if (!user) return 'ユーザー名を入力してください';
  if (!/^[A-Za-z][A-Za-z0-9_$#]*$/.test(user)) return 'ユーザー名: 英字始まり、英数字・_・$・# のみ使用できます';
  if (!host) return 'ホスト名またはIPアドレスを入力してください';
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(host)) return 'ホスト名: 英数字・.・- のみ使用できます';
  if (portRaw !== '' && (!/^\d+$/.test(portRaw) || +portRaw < 1 || +portRaw > 65535)) return 'ポート: 1〜65535 の数値を入力してください';
  if (!service) return 'サービス名を入力してください';
  if (!/^[A-Za-z0-9][A-Za-z0-9._]*$/.test(service)) return 'サービス名: 英数字・.・_ のみ使用できます';
  return null;
}

function parseConnIdentifier(ci: string): { host: string; port: string; service: string } {
  const m = (ci ?? '').match(/^([^:/]+)(?::(\d+))?\/(.+)$/);
  if (!m) return { host: ci ?? '', port: '', service: '' };
  return { host: m[1], port: m[2] ?? '', service: m[3] };
}

function buildConnCommand(env: SqlEnv | undefined, opts: Record<string, boolean>, extra: string): string {
  if (!env) return 'sqlplus';
  const flags = SQLPLUS_OPTIONS.filter(o => opts[o.flag]).map(o => o.flag);
  const parts = ['sqlplus', ...flags, `${env.username}/${env.password}@${env.connect_identifier}`];
  if (extra.trim()) parts.push(extra.trim());
  return parts.join(' ');
}

function nowTs(): string {
  const n = new Date(), p = (v: number) => String(v).padStart(2, '0');
  return `${n.getFullYear()}${p(n.getMonth()+1)}${p(n.getDate())}_${p(n.getHours())}${p(n.getMinutes())}`;
}

function hlText(text: string, q: string): React.ReactNode {
  if (!q || !text) return text;
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${esc})`, 'gi'));
  return parts.map((p, i) =>
    p.toLowerCase() === q.toLowerCase()
      ? <mark key={i} className="bg-amber-400/30 text-amber-200 rounded-sm not-italic">{p}</mark>
      : <React.Fragment key={i}>{p}</React.Fragment>
  );
}

// ================================================================
// SQL パーサー（CREATE TABLE → TableMemo 形式）
// ================================================================

interface ParsedMemo { schema_name: string; table_name: string; comment: string; columns: TableColumn[]; indexes: TableIndex[]; }

function splitTopLevel(str: string): string[] {
  const parts: string[] = []; let depth = 0, cur = '';
  for (const ch of str) {
    if (ch === '(') { depth++; cur += ch; }
    else if (ch === ')') { depth--; cur += ch; }
    else if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; }
    else { cur += ch; }
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

function parseColumnDef(def: string, pkCols: Set<string>): TableColumn | null {
  const trimmed = def.trim();
  if (/^(?:CONSTRAINT|PRIMARY|UNIQUE|FOREIGN|CHECK|INDEX)\b/i.test(trimmed)) return null;
  const nm = trimmed.match(/^"?(\w+)"?\s+(.+)/is);
  if (!nm) return null;
  const name = nm[1]; const rest = nm[2];
  const term = rest.match(/\b(?:DEFAULT|NOT\s+NULL|NULL|CONSTRAINT|ENABLE|DISABLE|GENERATED|ENCRYPT|VISIBLE|INVISIBLE)\b/i);
  const type = (term ? rest.substring(0, term.index) : rest).trim().replace(/\s+/g, ' ');
  if (!type) return null;
  const after = rest.substring(term ? (term.index ?? 0) : rest.length);
  const afterUpper = after.toUpperCase();
  const nullable = !/\bNOT\s+NULL\b/.test(afterUpper);
  const pk = /\bPRIMARY\s+KEY\b/.test(afterUpper);
  if (pk) pkCols.add(name.toUpperCase());
  const defMatch = after.match(/\bDEFAULT\s+(.+?)(?:\s+(?:NOT\s+NULL|NULL|CONSTRAINT|ENABLE|DISABLE|GENERATED|ENCRYPT|VISIBLE|INVISIBLE)\b|$)/i);
  const default_value = defMatch ? defMatch[1].trim().replace(/^'([\s\S]*)'$/, '$1') : '';
  return { name, type, nullable, pk, comment: '', default_value };
}

function parseSqlToMemo(sql: string): ParsedMemo {
  const r: ParsedMemo = { schema_name: '', table_name: '', comment: '', columns: [], indexes: [] };
  const pkCols = new Set<string>();
  const cleaned = sql.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
  for (const stmt of cleaned.split(';').map(s => s.trim()).filter(Boolean)) {
    if (/^\s*CREATE\s+(?:GLOBAL\s+TEMPORARY\s+)?TABLE\s+/i.test(stmt)) {
      const nm = stmt.match(/CREATE\s+(?:GLOBAL\s+TEMPORARY\s+)?TABLE\s+([\w."]+)\s*\(/i);
      if (nm) {
        const pts = nm[1].replace(/"/g, '').split('.');
        if (!r.table_name) r.table_name = pts[pts.length - 1];
        if (!r.schema_name && pts.length > 1) r.schema_name = pts[pts.length - 2];
        const start = stmt.indexOf('(');
        if (start !== -1) {
          let depth = 0, end = -1;
          for (let i = start; i < stmt.length; i++) {
            if (stmt[i] === '(') depth++;
            else if (stmt[i] === ')') { depth--; if (depth === 0) { end = i; break; } }
          }
          if (end !== -1) {
            for (const def of splitTopLevel(stmt.substring(start + 1, end))) {
              const t = def.trim(); if (!t) continue;
              if (/^(?:CONSTRAINT\s+\S+\s+)?PRIMARY\s+KEY\s*\(/i.test(t)) {
                const m = t.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);
                if (m) m[1].split(',').forEach(c => pkCols.add(c.trim().replace(/^"|"$/g, '').toUpperCase()));
              } else if (!/^(?:CONSTRAINT\s+\S+\s+)?(?:UNIQUE|FOREIGN\s+KEY|CHECK)\s*/i.test(t)) {
                const col = parseColumnDef(t, pkCols);
                if (col) r.columns.push(col);
              }
            }
          }
        }
      }
    } else if (/^\s*COMMENT\s+ON\s+TABLE\s+/i.test(stmt)) {
      const m = stmt.match(/COMMENT\s+ON\s+TABLE\s+([\w."]+)\s+IS\s+'((?:[^']|'')*)'/i);
      if (m) {
        r.comment = m[2].replace(/''/g, "'");
        if (!r.table_name) { const pts = m[1].replace(/"/g, '').split('.'); r.table_name = pts[pts.length-1]; if (pts.length>1) r.schema_name = pts[pts.length-2]; }
      }
    } else if (/^\s*COMMENT\s+ON\s+COLUMN\s+/i.test(stmt)) {
      const m = stmt.match(/COMMENT\s+ON\s+COLUMN\s+([\w."]+)\s+IS\s+'((?:[^']|'')*)'/i);
      if (m) { const pts = m[1].replace(/"/g, '').split('.'); const cn = pts[pts.length-1].toUpperCase(); const col = r.columns.find(c => c.name.toUpperCase() === cn); if (col) col.comment = m[2].replace(/''/g, "'"); }
    } else if (/^\s*CREATE\s+(?:UNIQUE\s+)?INDEX\s+/i.test(stmt)) {
      const m = stmt.match(/CREATE\s+(UNIQUE\s+)?INDEX\s+"?(\w+)"?\s+ON\s+([\w."]+)\s*\(([^)]+)\)/i);
      if (m) { const cols = m[4].split(',').map(c => c.trim().split(/[\s(]/)[0].replace(/^"|"$/g, '')).filter(Boolean); r.indexes.push({ name: m[2], unique: !!m[1], cols, comment: '' }); }
    } else if (/^\s*ALTER\s+TABLE\s+/i.test(stmt) && /PRIMARY\s+KEY/i.test(stmt)) {
      const m = stmt.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);
      if (m) m[1].split(',').forEach(c => pkCols.add(c.trim().replace(/^"|"$/g, '').toUpperCase()));
    }
  }
  r.columns.forEach(col => { if (pkCols.has(col.name.toUpperCase())) col.pk = true; });
  return r;
}

// ================================================================
// 共通スタイル
// ================================================================

const inp = 'px-2.5 py-1.5 text-xs rounded-lg border border-[var(--c-border)] bg-[var(--c-bg-2)] text-[var(--c-text)] focus:outline-none focus:border-[var(--c-accent)] transition-colors placeholder:text-[var(--c-text-3)]';

function SectionCard({ title, icon: Icon, children, action }: { title: string; icon: React.ElementType; children: React.ReactNode; action?: React.ReactNode; }) {
  return (
    <div className="rounded-xl border border-[var(--c-border)] overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--c-bg-2)] border-b border-[var(--c-border)]">
        <div className="flex items-center gap-2">
          <Icon size={14} className="text-[var(--c-accent)] shrink-0" />
          <span className="font-semibold text-sm text-[var(--c-text)]">{title}</span>
        </div>
        {action && <div className="flex items-center gap-1">{action}</div>}
      </div>
      <div className="bg-[var(--c-bg)]">{children}</div>
    </div>
  );
}

// ================================================================
// Tab 1: 接続・設定
// ================================================================

function SetupTab() {
  return (
    <div className="flex flex-col gap-4 p-4 overflow-auto h-full max-w-3xl mx-auto w-full">
      <EnvSection />
      <SessionSection />
      <BindSection />
    </div>
  );
}

// ── 環境一覧ソータブルアイテム ──────────────────────────────────
function SortableEnvItem({ env, isEditing, onEdit, onDelete }: {
  env: SqlEnv;
  isEditing: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: env.id! });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className={`rounded-lg border transition-colors ${isEditing ? 'border-[var(--c-accent)]' : 'border-[var(--c-border)]'}`}>
      <div className="flex items-center gap-2 px-3 py-2 bg-[var(--c-bg-2)] rounded-lg">
        <button {...attributes} {...listeners} className="text-[var(--c-text-3)] hover:text-[var(--c-text)] cursor-grab active:cursor-grabbing p-0.5 shrink-0">
          <GripVertical size={13} />
        </button>
        <span className={`font-semibold text-xs w-16 shrink-0 ${isEditing ? 'text-[var(--c-accent)]' : 'text-[var(--c-accent)]'}`}>{env.key}</span>
        <span className="text-xs text-[var(--c-text-3)] flex-1 truncate font-mono">{env.username}@{env.connect_identifier}</span>
        <div className="flex gap-1 shrink-0">
          <button onClick={onEdit} className={`btn btn--ghost btn--sm p-1.5 ${isEditing ? 'text-[var(--c-accent)]' : ''}`}>{isEditing ? <X size={12} /> : <Pencil size={12} />}</button>
          <button onClick={onDelete} className="btn btn--ghost btn--sm p-1.5 text-red-400 hover:text-red-300"><Trash2 size={12} /></button>
        </div>
      </div>
    </div>
  );
}

// ── 接続環境セクション ──────────────────────────────────────────
function EnvSection() {
  const { success, error: showError, show: showToast } = useToast();
  const [envs, setEnvs]         = useState<SqlEnv[]>([]);
  const [selKey, setSelKey]     = useState(() => localStorage.getItem(SK_ENV) || '');
  const [opts, setOpts]         = useState<Record<string, boolean>>(() => { try { return JSON.parse(localStorage.getItem(SK_OPTS) || '{}'); } catch { return {}; } });
  const [extra, setExtra]       = useState(() => localStorage.getItem(SK_EXTRA) || '');
  const [showMgr, setShowMgr]   = useState(false);
  const [showAdd, setShowAdd]   = useState(false);
  const [editId, setEditId]     = useState<number | null>(null);
  const [showPass, setShowPass] = useState(false);

  // フォーム状態
  const [fKey, setFKey]       = useState('');
  const [fUser, setFUser]     = useState('');
  const [fPass, setFPass]     = useState('');
  const [fHost, setFHost]     = useState('');
  const [fPort, setFPort]     = useState('');
  const [fSvc, setFSvc]       = useState('');
  const formRef = useRef<HTMLDivElement>(null);

  const loadEnvs = useCallback(async () => {
    const list = await sqlDB.getAllEnvs();
    if (list.length === 0) {
      for (const e of DEFAULT_ENVS) await sqlDB.addEnv({ ...e, position: DEFAULT_ENVS.indexOf(e) });
      const reloaded = await sqlDB.getAllEnvs();
      setEnvs(reloaded);
      const first = reloaded[0]?.key || '';
      setSelKey(first); localStorage.setItem(SK_ENV, first);
    } else {
      setEnvs(list);
      if (!selKey || !list.some(e => e.key === selKey)) {
        const first = list[0]?.key || '';
        setSelKey(first); localStorage.setItem(SK_ENV, first);
      }
    }
  }, [selKey]);

  useEffect(() => { loadEnvs(); }, []);

  const connCmd = useMemo(() => buildConnCommand(envs.find(e => e.key === selKey), opts, extra), [envs, selKey, opts, extra]);

  // Ctrl+Enter でコマンドコピー（Setupタブがマウントされている間だけ有効）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        Clipboard.copy(connCmd).then(() => success('コピーしました'));
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [connCmd, success]);

  const selectEnv = (key: string) => { setSelKey(key); localStorage.setItem(SK_ENV, key); };
  const toggleOpt = (flag: string, checked: boolean) => {
    const next = { ...opts, [flag]: checked };
    setOpts(next); localStorage.setItem(SK_OPTS, JSON.stringify(next));
  };
  const updateExtra = (v: string) => { setExtra(v); localStorage.setItem(SK_EXTRA, v); };

  const envSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleEnvDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeIdx = envs.findIndex(e => e.id === Number(active.id));
    const overIdx   = envs.findIndex(e => e.id === Number(over.id));
    if (activeIdx === -1 || overIdx === -1) return;
    const newOrder = arrayMove(envs, activeIdx, overIdx);
    for (let i = 0; i < newOrder.length; i++) {
      await sqlDB.updateEnv(newOrder[i].id!, { position: i });
    }
    await loadEnvs();
  }, [envs, loadEnvs]);

  const deleteEnv = async (env: SqlEnv) => {
    if (envs.length <= 1) { showError('最後の接続環境は削除できません'); return; }
    if (!confirm(`接続環境「${env.key}」を削除しますか？`)) return;
    activityDB.add({ page: 'sql', action: 'delete', target_type: 'env', target_id: String(env.id), summary: `接続環境「${env.key}」を削除`, created_at: new Date().toISOString() });
    await sqlDB.deleteEnv(env.id!);
    if (selKey === env.key) { const next = envs.filter(e => e.id !== env.id)[0]?.key || ''; setSelKey(next); localStorage.setItem(SK_ENV, next); }
    await loadEnvs();
  };

  const openEdit = (env: SqlEnv) => {
    const { host, port, service } = parseConnIdentifier(env.connect_identifier);
    setFKey(env.key); setFUser(env.username); setFPass(env.password); setFHost(host); setFPort(port); setFSvc(service);
    setEditId(env.id!); setShowAdd(false);
  };
  const openAdd = () => { setFKey(''); setFUser(''); setFPass(''); setFHost(''); setFPort(''); setFSvc(''); setEditId(null); setShowAdd(true); };
  const cancelForm = () => { setEditId(null); setShowAdd(false); };

  useEffect(() => {
    if (showAdd || editId !== null) {
      setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
    }
  }, [showAdd, editId]);

  const saveForm = async () => {
    const err = validateEnv(fKey, fUser, fHost, fPort, fSvc);
    if (err) { showError(err); return; }
    const ci = `${fHost}:${fPort || '1521'}/${fSvc}`;
    if (editId !== null) {
      const old = envs.find(e => e.id === editId);
      if (fKey !== old?.key && (await sqlDB.getAllEnvs()).some(e => e.key === fKey)) { showError(`環境名「${fKey}」はすでに存在します`); return; }
      await sqlDB.updateEnv(editId, { key: fKey, username: fUser, password: fPass, connect_identifier: ci });
      if (selKey === old?.key && fKey !== old?.key) { setSelKey(fKey); localStorage.setItem(SK_ENV, fKey); }
      activityDB.add({ page: 'sql', action: 'update', target_type: 'env', target_id: String(editId), summary: `接続環境「${fKey}」を更新`, created_at: new Date().toISOString() });
      showToast(`「${fKey}」を更新しました`, 'info');
    } else {
      const all = await sqlDB.getAllEnvs();
      if (all.some(e => e.key === fKey)) { showError(`環境名「${fKey}」はすでに存在します`); return; }
      await sqlDB.addEnv({ key: fKey, username: fUser, password: fPass, connect_identifier: ci, position: all.length });
      activityDB.add({ page: 'sql', action: 'create', target_type: 'env', target_id: fKey, summary: `接続環境「${fKey}」を追加`, created_at: new Date().toISOString() });
      showToast(`「${fKey}」を追加しました`, 'success');
    }
    cancelForm(); await loadEnvs();
  };

  const exportEnvs = async () => {
    const all = await sqlDB.getAllEnvs();
    const data = all.map(({ id: _id, position: _p, ...e }) => e);
    await FileSaver.save(JSON.stringify(data, null, 2), `sql_envs_${nowTs()}.json`);
  };

  const importEnvsRef = useRef<HTMLInputElement>(null);
  const importEnvs = async (file: File) => {
    const text = await file.text();
    try {
      const data = JSON.parse(text);
      if (!Array.isArray(data)) throw new Error();
      const all = await sqlDB.getAllEnvs();
      for (const e of all) await sqlDB.deleteEnv(e.id!);
      for (const e of data) await sqlDB.addEnv(e);
      await loadEnvs();
      showToast(`${data.length} 件の環境をインポートしました`);
    } catch { showError('インポートに失敗しました'); }
  };

  const formFields = (
    <div className="rounded-xl border border-[var(--c-accent)]/40 shadow-sm">
      <div className="flex items-center gap-1.5 px-3 py-2 bg-[var(--c-accent)]/5 border-b border-[var(--c-accent)]/20 rounded-t-xl">
        <Pencil size={11} className="text-[var(--c-accent)]" />
        <span className="text-[11px] font-medium text-[var(--c-accent)]">
          {editId !== null ? `編集中: ${fKey}` : '新規追加'}
        </span>
      </div>
      <div className="p-4 flex flex-col gap-3 bg-[var(--c-bg-2)] rounded-b-xl">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <div className="flex flex-col gap-1"><label className="text-xs text-[var(--c-text-3)]">環境名</label><input type="text" value={fKey} onChange={e => setFKey(e.target.value)} placeholder="例: PROD" className={inp} /></div>
          <div className="flex flex-col gap-1"><label className="text-xs text-[var(--c-text-3)]">ユーザー名</label><input type="text" value={fUser} onChange={e => setFUser(e.target.value)} placeholder="例: SCOTT" className={inp} /></div>
          <div className="flex flex-col gap-1 relative"><label className="text-xs text-[var(--c-text-3)]">パスワード</label>
            <div className="relative"><input type={showPass ? 'text' : 'password'} value={fPass} onChange={e => setFPass(e.target.value)} autoComplete="new-password" className={`${inp} w-full pr-8`} />
              <button type="button" onClick={() => setShowPass(p => !p)} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--c-text-3)] hover:text-[var(--c-text)]">{showPass ? <EyeOff size={13} /> : <Eye size={13} />}</button>
            </div>
          </div>
          <div className="flex flex-col gap-1"><label className="text-xs text-[var(--c-text-3)]">ホスト名 / IP</label><input type="text" value={fHost} onChange={e => setFHost(e.target.value)} placeholder="127.0.0.1" className={inp} /></div>
          <div className="flex flex-col gap-1"><label className="text-xs text-[var(--c-text-3)]">ポート</label><input type="text" value={fPort} onChange={e => setFPort(e.target.value)} placeholder="1521" className={inp} /></div>
          <div className="flex flex-col gap-1"><label className="text-xs text-[var(--c-text-3)]">サービス名</label><input type="text" value={fSvc} onChange={e => setFSvc(e.target.value)} placeholder="ORCL" className={inp} /></div>
        </div>
        <div className="flex gap-2"><button onClick={saveForm} className="btn btn--primary btn--sm text-xs">保存</button><button onClick={cancelForm} className="btn btn--ghost btn--sm text-xs">キャンセル</button></div>
      </div>
    </div>
  );

  return (
    <SectionCard title="接続先" icon={Database}
      action={
        <div className="flex gap-1">
          <button onClick={exportEnvs} title="エクスポート" className="btn btn--ghost btn--sm p-1.5"><Download size={13} /></button>
          <button onClick={() => importEnvsRef.current?.click()} title="インポート" className="btn btn--ghost btn--sm p-1.5"><Upload size={13} /></button>
          <input ref={importEnvsRef} type="file" accept=".json" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) { importEnvs(f); e.target.value = ''; } }} />
        </div>
      }
    >
      <div className="p-4 flex flex-col gap-4">
        {/* 環境ピル */}
        <div className="flex gap-0.5 p-[3px] bg-[var(--c-bg)] border border-[var(--c-border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] self-start flex-wrap">
          {envs.map(env => (
            <button key={env.key} onClick={() => selectEnv(env.key)}
              className={`px-3 py-[5px] rounded-[var(--radius-md)] text-xs font-medium transition-colors ${
                selKey === env.key
                  ? 'bg-[var(--c-surface)] text-[var(--c-accent)] font-bold shadow-[var(--shadow-sm)]'
                  : 'text-[var(--c-text-2)] hover:text-[var(--c-text)] hover:bg-[var(--c-bg-2)]'
              }`}>
              {env.key}
            </button>
          ))}
        </div>

        {/* SQL*Plus オプション */}
        <div className="flex items-center gap-4 flex-wrap">
          {SQLPLUS_OPTIONS.map(o => (
            <label key={o.flag} className="toggle-wrap">
              <input type="checkbox" className="toggle-input" checked={!!opts[o.flag]} onChange={e => toggleOpt(o.flag, e.target.checked)} />
              <span className="toggle-track"><span className="toggle-thumb" /></span>
              <code className="text-[10px] bg-[var(--c-bg-2)] px-1.5 py-0.5 rounded border border-[var(--c-border)]">{o.flag}</code>
              <span className="hidden sm:inline text-xs text-[var(--c-text-2)]">{o.desc}</span>
            </label>
          ))}
          <input type="text" value={extra} onChange={e => updateExtra(e.target.value)} placeholder="追加オプション…"
            className={`${inp} text-xs w-36`} />
        </div>

        {/* 接続コマンド */}
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 bg-[var(--c-bg-2)] border border-[var(--c-border)] rounded-lg px-3 py-2 font-mono text-xs overflow-hidden">
            <Terminal size={12} className="text-[var(--c-accent)] shrink-0" />
            <span className="text-[var(--c-text)] truncate flex-1">{connCmd}</span>
          </div>
          <button onClick={() => Clipboard.copy(connCmd).then(() => success('コピーしました'))} className="btn btn--primary btn--sm flex items-center gap-1.5 shrink-0">
            <Copy size={13} /><span className="text-xs">コピー</span>
          </button>
        </div>
        <p className="text-[10px] text-[var(--c-text-3)] -mt-2">Ctrl+Enter でもコピーできます</p>

        {/* 環境管理 */}
        <div>
          <button onClick={() => setShowMgr(p => !p)} className="flex items-center gap-1.5 text-xs text-[var(--c-text-3)] hover:text-[var(--c-text)] transition-colors">
            <ChevronRight size={13} className={`transition-transform ${showMgr ? 'rotate-90' : ''}`} />
            環境一覧を管理
          </button>
          {showMgr && (
            <div className="mt-3 flex flex-col gap-2">
              <div className="flex justify-end">
                <button onClick={openAdd} className="btn btn--ghost btn--sm text-xs flex items-center gap-1"><Plus size={12} />追加</button>
              </div>
              <DndContext sensors={envSensors} collisionDetection={closestCenter} onDragEnd={handleEnvDragEnd}>
                <SortableContext items={envs.map(e => e.id!)} strategy={verticalListSortingStrategy}>
                  <div className="flex flex-col gap-1.5">
                    {envs.map(env => (
                      <SortableEnvItem
                        key={env.id}
                        env={env}
                        isEditing={editId === env.id}
                        onEdit={() => editId === env.id ? cancelForm() : openEdit(env)}
                        onDelete={() => deleteEnv(env)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
              {(showAdd || editId !== null) && <div ref={formRef}>{formFields}</div>}
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

// ── セッション設定セクション ──────────────────────────────────────
function SessionSection() {
  const { success } = useToast();
  const [preview, setPreview] = useState<string | null>(null);

  return (
    <SectionCard title="セッション設定" icon={Settings}>
      <div className="p-4 flex flex-col gap-3">
        <p className="text-xs text-[var(--c-text-3)]">実行前に SQL*Plus で貼り付けて実行してください。</p>
        <div className="flex gap-3 flex-wrap">
          {SESSION_PRESETS.map(preset => (
            <button key={preset.id}
              onClick={() => Clipboard.copy(preset.commands).then(() => success(`${preset.label}設定をコピーしました`))}
              onMouseEnter={() => setPreview(preset.commands)}
              onMouseLeave={() => setPreview(null)}
              className="btn btn--secondary flex items-center gap-2 text-sm">
              <Terminal size={14} />{preset.label}をコピー
            </button>
          ))}
        </div>
        {/* コマンドプレビュー */}
        <div className="grid grid-cols-2 gap-3">
          {SESSION_PRESETS.map(preset => (
            <div key={preset.id}>
              <p className="text-[10px] text-[var(--c-text-3)] mb-1">{preset.label}</p>
              <pre className={`text-[10px] font-mono rounded-lg border px-3 py-2 whitespace-pre leading-relaxed transition-colors ${preview === preset.commands ? 'border-[var(--c-accent)] bg-[var(--c-accent)]/5 text-[var(--c-text)]' : 'border-[var(--c-border)] bg-[var(--c-bg-2)] text-[var(--c-text-2)]'}`}>{preset.commands}</pre>
            </div>
          ))}
        </div>
      </div>
    </SectionCard>
  );
}

// ── バインド変数セクション ──────────────────────────────────────
interface ParamRow { id: number; use: boolean; varname: string; type: string; length: string; value: string; }

function BindSection() {
  const { success, error: showError } = useToast();
  const [params, setParams] = useState<ParamRow[]>(() => {
    try { const s = localStorage.getItem(SK_PARAM); if (s) { const a = JSON.parse(s); if (Array.isArray(a) && a.length) return a.map((r, i) => ({ id: i + 1, ...r })); } } catch { /* ignore */ }
    return [];
  });
  const nextId = useRef(params.length + 1);

  const save = (list: ParamRow[]) => localStorage.setItem(SK_PARAM, JSON.stringify(list.map(({ id: _, ...r }) => r)));
  const addRow = () => { const id = nextId.current++; setParams(p => { const n = [...p, { id, use: false, varname: '', type: 'VARCHAR2', length: '', value: '' }]; save(n); return n; }); };
  const update = (id: number, f: keyof ParamRow, v: string | boolean) => setParams(p => { const n = p.map(r => r.id === id ? { ...r, [f]: v } : r); save(n); return n; });
  const remove = (id: number) => setParams(p => { const n = p.filter(r => r.id !== id); save(n); return n; });
  const clear  = () => { setParams([]); localStorage.removeItem(SK_PARAM); };

  const buildText = () => {
    let text = '';
    for (const r of params) {
      if (!r.use) continue;
      const def = TYPE_DEFS[r.type]; if (!def) continue;
      const vn = r.varname.trim() || `B${r.id}`;
      const lenPart = def.lenMode === 'required' && r.length ? `(${r.length})` : '';
      const varLabel = def.isDate ? 'VARCHAR2(30)' : `${def.label}${lenPart}`;
      text += `VAR ${vn} ${varLabel}\n`;
      if (def.isDate) text += `EXEC :${vn} := TO_DATE('${r.value || 'YYYY-MM-DD'}','YYYY-MM-DD');\n`;
      else if (def.nPrefix) text += `EXEC :${vn} := N'${r.value}';\n`;
      else if (def.isStrings) text += `EXEC :${vn} := '${r.value}';\n`;
      else text += `EXEC :${vn} := ${r.value || '0'};\n`;
    }
    return text;
  };

  const copy = () => { const t = buildText(); if (!t) { showError('使用する変数がありません'); return; } Clipboard.copy(t).then(() => success('コピーしました')); };
  const generated = buildText();

  return (
    <SectionCard title="バインド変数" icon={FileText}
      action={
        <div className="flex gap-1">
          <button onClick={addRow} className="btn btn--ghost btn--sm text-xs flex items-center gap-1"><Plus size={12} />行追加</button>
          <button onClick={copy} className="btn btn--primary btn--sm text-xs flex items-center gap-1.5"><Copy size={12} />VAR/EXEC コピー</button>
          {params.length > 0 && <button onClick={clear} className="btn btn--ghost btn--sm text-xs text-red-400 hover:text-red-300">全クリア</button>}
        </div>
      }
    >
      {params.length === 0 ? (
        <p className="text-xs text-[var(--c-text-3)] text-center py-6">「行追加」でバインド変数を設定できます</p>
      ) : (
        <div className="p-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <div className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 items-center px-2 text-[10px] text-[var(--c-text-3)] font-medium uppercase tracking-wider">
              <span>使用</span><span>変数名</span><span>型</span><span>桁数</span><span>値</span><span />
            </div>
            {params.map(r => {
              const def = TYPE_DEFS[r.type];
              const showLen = def?.lenMode === 'required' || def?.lenMode === 'optional';
              return (
                <div key={r.id} className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 items-center px-2">
                  <label className="toggle-wrap">
                    <input type="checkbox" className="toggle-input" checked={r.use} onChange={e => update(r.id, 'use', e.target.checked)} />
                    <span className="toggle-track"><span className="toggle-thumb" /></span>
                  </label>
                  <input type="text" value={r.varname} onChange={e => update(r.id, 'varname', e.target.value)} placeholder={`B${r.id}`} className={`${inp} w-full`} />
                  <Select
                    options={TYPE_OPTIONS}
                    value={r.type}
                    onChange={v => update(r.id, 'type', v)}
                  />
                  <input type="text" value={r.length} onChange={e => update(r.id, 'length', e.target.value)} placeholder={def?.defaultLen || '—'} disabled={!showLen} className={`${inp} w-full ${!showLen ? 'opacity-30 cursor-not-allowed' : ''}`} />
                  {def?.isDate ? (
                    <DatePicker
                      value={r.value}
                      onChange={v => update(r.id, 'value', v)}
                      onClear={() => update(r.id, 'value', '')}
                      className="w-full"
                      placeholder="日付を選択"
                    />
                  ) : (
                    <input type="text" value={r.value} onChange={e => update(r.id, 'value', e.target.value)} placeholder="値" className={`${inp} w-full`} />
                  )}
                  <button onClick={() => remove(r.id)} className="btn btn--ghost btn--sm p-1 text-[var(--c-text-3)] hover:text-red-400"><X size={13} /></button>
                </div>
              );
            })}
          </div>
          {generated && (
            <div className="flex flex-col gap-1">
              <p className="text-[10px] text-[var(--c-text-3)] font-medium uppercase tracking-wider">生成テキスト</p>
              <pre className="text-xs font-mono bg-[var(--c-bg-2)] border border-[var(--c-border)] rounded-lg px-3 py-2.5 whitespace-pre overflow-x-auto text-[var(--c-text)] leading-relaxed">{generated}</pre>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

// ================================================================
// Tab 2: 実行計画 & チューニング
// ================================================================

function AnalyzeTab() {
  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex flex-col overflow-hidden border-r border-[var(--c-border)]" style={{ width: '44%', minWidth: 320 }}>
        <PlanPane />
      </div>
      <div className="flex-1 overflow-hidden">
        <TunePane />
      </div>
    </div>
  );
}

// ── 実行計画解析ペイン ──────────────────────────────────────────
interface AnalyzeEntry { op: string; name: string; count: number; tuneItem?: TuneItem; }

function PlanPane() {
  const { error: showError } = useToast();
  const [input, setInput]   = useState('');
  const [results, setResults] = useState<AnalyzeEntry[]>([]);
  const [analyzed, setAnalyzed] = useState(false);

  const analyze = () => {
    if (!input.trim()) { showError('実行計画を入力してください'); return; }
    const lines = input.split('\n');
    let opIdx = 2, nameIdx = 3;
    for (const line of lines) {
      if (/\|\s*Id/i.test(line) && /Operation/i.test(line)) {
        const parts = line.split('|');
        const oi = parts.findIndex(p => /^\s*Operation\s*$/i.test(p));
        const ni = parts.findIndex(p => /^\s*Name\s*$/i.test(p));
        if (oi >= 1) opIdx = oi;
        if (ni >= 1) nameIdx = ni;
        break;
      }
    }
    const opMap = new Map<string, { op: string; names: Set<string>; count: number }>();
    for (const line of lines) {
      if (!line.includes('|') || /Operation/i.test(line) || /^[\s|\-+]+$/.test(line)) continue;
      const parts = line.split('|');
      if (opIdx >= parts.length) continue;
      const op = parts[opIdx].trim().replace(/^\*?\s*/, '');
      if (!op || op.length <= 1) continue;
      const name = nameIdx < parts.length ? parts[nameIdx].trim() : '';
      const key  = op.toUpperCase();
      if (!opMap.has(key)) opMap.set(key, { op, names: new Set(), count: 0 });
      const entry = opMap.get(key)!;
      entry.count++;
      if (name) entry.names.add(name);
    }
    const out: AnalyzeEntry[] = [];
    for (const [, entry] of opMap) {
      const tuneItem = TUNE_ITEMS.find(t => t.op.toUpperCase() === entry.op.toUpperCase());
      for (const name of (entry.names.size ? entry.names : [''])) {
        out.push({ op: entry.op, name, count: entry.count, tuneItem });
      }
    }
    // 要改善 → 要注意 → 参考 → 良好 の順にソート
    const order: Record<string, number> = { high: 0, mid: 1, low: 2, ok: 3 };
    out.sort((a, b) => (order[a.tuneItem?.level ?? 'low'] ?? 2) - (order[b.tuneItem?.level ?? 'low'] ?? 2));
    setResults(out);
    setAnalyzed(true);
  };

  const reset = () => { setInput(''); setResults([]); setAnalyzed(false); };

  const highCount = results.filter(r => r.tuneItem?.level === 'high').length;
  const midCount  = results.filter(r => r.tuneItem?.level === 'mid').length;

  return (
    <div className="flex flex-col h-full">
      {/* ヘッダー */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-[var(--c-bg-2)] border-b border-[var(--c-border)] shrink-0">
        <BarChart2 size={14} className="text-[var(--c-accent)]" />
        <span className="font-semibold text-sm text-[var(--c-text)]">実行計画を解析</span>
        {analyzed && (
          <div className="flex gap-1.5 ml-auto">
            {highCount > 0 && <span className={`text-[10px] px-1.5 py-0.5 rounded border ${LEVEL_BADGE.high}`}>{highCount} 要改善</span>}
            {midCount  > 0 && <span className={`text-[10px] px-1.5 py-0.5 rounded border ${LEVEL_BADGE.mid}`}>{midCount} 要注意</span>}
          </div>
        )}
      </div>

      {/* テキストエリア */}
      <div className="p-3 shrink-0">
        <textarea value={input} onChange={e => setInput(e.target.value)}
          placeholder="DBMS_XPLAN / AUTOTRACE の出力を貼り付けてください"
          className="w-full h-36 px-3 py-2.5 text-xs font-mono rounded-lg border border-[var(--c-border)] bg-[var(--c-bg-2)] text-[var(--c-text)] resize-none focus:outline-none focus:border-[var(--c-accent)] transition-colors placeholder:text-[var(--c-text-3)] leading-relaxed" />
        <div className="flex gap-2 mt-2">
          <button onClick={analyze} className="btn btn--primary btn--sm flex items-center gap-1.5 text-xs"><Play size={12} />解析</button>
          <button onClick={reset} className="btn btn--ghost btn--sm text-xs">クリア</button>
        </div>
      </div>

      {/* 結果 */}
      <div className="flex-1 overflow-auto px-3 pb-3 flex flex-col gap-2">
        {analyzed && results.length === 0 && (
          <p className="text-xs text-[var(--c-text-3)] text-center py-4">解析できる操作が見つかりませんでした</p>
        )}
        {results.map((r, i) => (
          <div key={i} className={`rounded-lg border border-[var(--c-border)] border-l-4 bg-[var(--c-bg-2)] px-3 py-2.5 ${LEVEL_BORDER[r.tuneItem?.level || 'low']}`}>
            <div className="flex items-start gap-2 flex-wrap">
              <code className="font-mono text-xs font-bold text-[var(--c-text)] leading-snug">{r.op}</code>
              {r.name && <span className="text-xs text-[var(--c-text-3)]">({r.name})</span>}
              {r.count > 1 && <span className="text-xs text-[var(--c-text-3)]">×{r.count}</span>}
              {r.tuneItem && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ml-auto shrink-0 ${LEVEL_BADGE[r.tuneItem.level]}`}>{LEVEL_LABEL[r.tuneItem.level]}</span>
              )}
            </div>
            {r.tuneItem && <p className="text-xs text-[var(--c-text-2)] mt-1 leading-relaxed">{r.tuneItem.desc}</p>}
            {!r.tuneItem && <p className="text-xs text-[var(--c-text-3)] mt-1">ガイドに該当なし</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── チューニングガイドペイン ──────────────────────────────────────
function TunePane() {
  const [tab, setTab]       = useState(() => localStorage.getItem(SK_TUNE_TAB) || 'all');
  const [query, setQuery]   = useState('');
  const [openCats, setOpenCats] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem(SK_TUNE_GROUPS) || '{}'); } catch { return {}; }
  });

  const switchTab = (t: string) => { setTab(t); localStorage.setItem(SK_TUNE_TAB, t); };
  const toggleCat = (cat: string) => setOpenCats(prev => { const n = { ...prev, [cat]: !prev[cat] }; localStorage.setItem(SK_TUNE_GROUPS, JSON.stringify(n)); return n; });
  const isOpen = (cat: string) => openCats[cat] !== false;

  const q = query.toLowerCase();
  const filtered = useMemo(() => TUNE_ITEMS.filter(item => {
    if (tab !== 'all' && item.category !== tab) return false;
    if (!q) return true;
    return item.op.toLowerCase().includes(q) || item.desc.includes(q);
  }), [tab, q]);

  const grouped = useMemo(() => {
    const map = new Map<string, TuneItem[]>();
    for (const cat of TUNE_CATEGORIES) map.set(cat, []);
    for (const item of filtered) { const a = map.get(item.category); if (a) a.push(item); }
    return map;
  }, [filtered]);

  const tabs = [{ id: 'all', label: 'すべて' }, ...TUNE_CATEGORIES.map(c => ({ id: c, label: c }))];

  return (
    <div className="flex flex-col h-full">
      {/* ヘッダー */}
      <div className="px-4 py-2.5 bg-[var(--c-bg-2)] border-b border-[var(--c-border)] shrink-0 flex items-center gap-2">
        <BarChart2 size={14} className="text-[var(--c-accent)]" />
        <span className="font-semibold text-sm text-[var(--c-text)]">チューニングガイド</span>
      </div>

      {/* タブ + 検索 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--c-border)] shrink-0 flex-wrap bg-[var(--c-bg)]">
        <div className="flex gap-0.5 p-[3px] bg-[var(--c-bg)] border border-[var(--c-border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] flex-wrap">
          {tabs.map(t => {
            const cnt = t.id === 'all' ? TUNE_ITEMS.length : TUNE_ITEMS.filter(i => i.category === t.id).length;
            return (
              <button key={t.id} onClick={() => switchTab(t.id)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-[4px] rounded-[var(--radius-md)] text-xs font-medium transition-colors ${
                  tab === t.id
                    ? 'bg-[var(--c-surface)] text-[var(--c-accent)] font-bold shadow-[var(--shadow-sm)]'
                    : 'text-[var(--c-text-2)] hover:text-[var(--c-text)] hover:bg-[var(--c-bg-2)]'
                }`}>
                {t.label}
                <span className={`inline-flex items-center justify-center px-[4px] min-w-[16px] h-4 rounded-full text-[10px] font-bold font-mono ${
                  tab === t.id ? 'bg-[var(--c-accent-dim)] text-[var(--c-accent)]' : 'bg-[var(--c-bg-2)] text-[var(--c-text-3)]'
                }`}>{cnt}</span>
              </button>
            );
          })}
        </div>
        <div className="relative flex-1 min-w-24">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--c-text-3)]" />
          <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="操作名・説明で検索…"
            className={`${inp} w-full pl-7 py-1`} />
        </div>
      </div>

      {/* アイテム一覧 */}
      <div className="flex-1 overflow-auto px-3 py-3 flex flex-col gap-3">
        {tab === 'all' ? (
          TUNE_CATEGORIES.map(cat => {
            const items = grouped.get(cat) || [];
            if (items.length === 0) return null;
            return (
              <div key={cat}>
                <button onClick={() => toggleCat(cat)} className="flex items-center gap-1.5 text-xs font-semibold text-[var(--c-text-2)] hover:text-[var(--c-text)] mb-2 transition-colors w-full text-left">
                  <ChevronRight size={12} className={`transition-transform ${isOpen(cat) ? 'rotate-90' : ''}`} />
                  {cat}
                  <span className="text-[10px] text-[var(--c-text-3)] ml-1">{items.length}</span>
                </button>
                {isOpen(cat) && (
                  <div className="flex flex-col gap-1.5 pl-4">
                    {items.map(item => <TuneCard key={item.op} item={item} q={q} />)}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="flex flex-col gap-1.5">
            {filtered.map(item => <TuneCard key={item.op} item={item} q={q} />)}
          </div>
        )}
        {filtered.length === 0 && <p className="text-center text-xs text-[var(--c-text-3)] py-8">該当するアイテムが見つかりません</p>}
      </div>
    </div>
  );
}

function TuneCard({ item, q }: { item: TuneItem; q: string }) {
  return (
    <div className={`rounded-lg border border-[var(--c-border)] border-l-4 bg-[var(--c-bg-2)] px-3 py-2.5 hover:bg-[var(--c-bg)] transition-colors ${LEVEL_BORDER[item.level]}`}>
      <div className="flex items-start gap-2 flex-wrap">
        <code className="font-mono text-xs font-bold text-[var(--c-text)] break-all leading-snug">{hlText(item.op, q)}</code>
        <div className="flex gap-1 ml-auto shrink-0">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--c-bg)] border border-[var(--c-border)] text-[var(--c-text-3)]">{item.category}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${LEVEL_BADGE[item.level]}`}>{LEVEL_LABEL[item.level]}</span>
        </div>
      </div>
      <p className="text-xs text-[var(--c-text-2)] mt-1.5 leading-relaxed">{hlText(item.desc, q)}</p>
    </div>
  );
}

// ================================================================
// Tab 3: テーブル定義メモ
// ================================================================

function SortableColRow({ id, col, i, updCol, remCol }: {
  id: string; col: TableColumn; i: number;
  updCol: (i: number, f: keyof TableColumn, v: string | boolean) => void;
  remCol: (i: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="grid grid-cols-[auto_1fr_1fr_auto_auto_1fr_1fr_auto] gap-1.5 items-center">
      <button type="button" {...attributes} {...listeners}
        className="text-[var(--c-text-3)] hover:text-[var(--c-text)] cursor-grab active:cursor-grabbing p-0.5">
        <GripVertical size={13} />
      </button>
      <input type="text" value={col.name} onChange={e => updCol(i, 'name', e.target.value)} placeholder="列名" className={inp} />
      <input type="text" value={col.type} onChange={e => updCol(i, 'type', e.target.value)} placeholder="型" className={inp} />
      <button type="button" onClick={() => updCol(i, 'nullable', col.nullable === false)}
        className={`text-[10px] px-2 py-0.5 rounded border font-medium transition-colors whitespace-nowrap ${!col.nullable ? 'bg-amber-500/20 border-amber-500/50 text-amber-400' : 'border-[var(--c-border)] text-[var(--c-text-3)] hover:border-[var(--c-text-3)]'}`}>
        NN
      </button>
      <button type="button" onClick={() => updCol(i, 'pk', !col.pk)}
        className={`text-[10px] px-2 py-0.5 rounded border font-medium transition-colors whitespace-nowrap ${col.pk ? 'bg-[var(--c-accent)]/20 border-[var(--c-accent)]/50 text-[var(--c-accent)]' : 'border-[var(--c-border)] text-[var(--c-text-3)] hover:border-[var(--c-text-3)]'}`}>
        PK
      </button>
      <input type="text" value={col.default_value ?? ''} onChange={e => updCol(i, 'default_value', e.target.value)} placeholder="デフォルト値" className={inp} />
      <input type="text" value={col.comment} onChange={e => updCol(i, 'comment', e.target.value)} placeholder="コメント" className={inp} />
      <button type="button" onClick={() => remCol(i)} className="btn btn--ghost btn--sm p-1 text-[var(--c-text-3)] hover:text-red-400"><X size={13} /></button>
    </div>
  );
}

function MemoTab({ pendingSelId, onClearPending }: { pendingSelId?: number | null; onClearPending?: () => void }) {
  const { success, error: showError } = useToast();
  const [memos, setMemos]       = useState<TableMemo[]>([]);
  const [selId, setSelId]       = useState<number | null>(null);

  // 検索結果からのジャンプ: pendingSelId が来たら選択して通知
  useEffect(() => {
    if (pendingSelId != null) {
      setSelId(pendingSelId);
      onClearPending?.();
    }
  }, [pendingSelId, onClearPending]);
  const [view, setView]         = useState<MemoViewMode>(() => (localStorage.getItem(SK_MEMO_VIEW) as MemoViewMode) || 'table');
  const [query, setQuery]       = useState('');
  const [editMemo, setEditMemo] = useState<TableMemo | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showSqlImport, setShowSqlImport] = useState(false);
  const [sqlInput, setSqlInput] = useState('');
  const [showCompare, setShowCompare] = useState(false);
  const [excludeCols, setExcludeCols] = useState<string[]>(() => {
    const stored = localStorage.getItem(SK_RELATION_EXCLUDE);
    if (stored !== null) { try { return JSON.parse(stored); } catch { return []; } }
    return DEFAULT_EXCLUDE_COLS;
  });
  const [showExcludeSettings, setShowExcludeSettings] = useState(false);
  const [excludeInput, setExcludeInput] = useState('');

  const load = useCallback(async () => { setMemos(await sqlDB.getAllTableMemos()); }, []);
  useEffect(() => { load(); }, [load]);

  const switchView = (v: MemoViewMode) => { setView(v); localStorage.setItem(SK_MEMO_VIEW, v); };

  const selected = useMemo(() => memos.find(m => m.id === selId) ?? null, [memos, selId]);

  const q = query.toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return memos;
    return memos.filter(m => {
      const fullName = m.schema_name ? `${m.schema_name}.${m.table_name}` : m.table_name;
      if (fullName.toLowerCase().includes(q) || m.comment.toLowerCase().includes(q)) return true;
      if (m.columns.some(c => c.name.toLowerCase().includes(q) || c.type.toLowerCase().includes(q) || c.comment.toLowerCase().includes(q))) return true;
      if (m.memo.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [memos, q]);

  // カラム一覧（全テーブルフラット展開）
  const allColumns = useMemo(() => {
    const rows: { tblName: string; memoId: number; col: TableColumn }[] = [];
    for (const m of filtered) {
      if (!m.columns.length) continue;
      const tblName = m.schema_name ? `${m.schema_name}.${m.table_name}` : m.table_name;
      for (const col of m.columns) rows.push({ tblName, memoId: m.id!, col });
    }
    return rows;
  }, [filtered]);

  // テーブル間リレーション（同名カラム、isPk: 相手側がPKか）
  const relations = useMemo(() => {
    const map: Record<string, { tblName: string; memoId: number; isPk: boolean }[]> = {};
    for (const m of memos) {
      if (!m.columns.length) continue;
      const tblName = m.schema_name ? `${m.schema_name}.${m.table_name}` : m.table_name;
      for (const col of m.columns) {
        const key = col.name.toLowerCase();
        if (!map[key]) map[key] = [];
        map[key].push({ tblName, memoId: m.id!, isPk: !!col.pk });
      }
    }
    return map;
  }, [memos]);

  const excludeSet = useMemo(() => new Set(excludeCols.map(c => c.toLowerCase())), [excludeCols]);
  const updateExcludeCols = (next: string[]) => {
    setExcludeCols(next);
    localStorage.setItem(SK_RELATION_EXCLUDE, JSON.stringify(next));
  };
  const addExcludeCol = () => {
    const col = excludeInput.trim().toLowerCase();
    if (!col || excludeCols.includes(col)) { setExcludeInput(''); return; }
    updateExcludeCols([...excludeCols, col]);
    setExcludeInput('');
  };
  const removeExcludeCol = (col: string) => updateExcludeCols(excludeCols.filter(c => c !== col));

  const openAdd = () => {
    setEditMemo({ id: undefined, schema_name: '', table_name: '', comment: '', columns: [], indexes: [], memo: '', created_at: '', updated_at: '' });
    setShowForm(true); setShowSqlImport(false);
  };
  const openEdit = (m: TableMemo) => { setEditMemo({ ...m, columns: [...m.columns], indexes: [...m.indexes] }); setShowForm(true); setShowSqlImport(false); };
  const cancelForm = () => { setEditMemo(null); setShowForm(false); setShowSqlImport(false); setSqlInput(''); };

  const saveMemo = async () => {
    if (!editMemo) return;
    if (!editMemo.table_name.trim()) { showError('テーブル名を入力してください'); return; }
    if (editMemo.id !== undefined) {
      await sqlDB.updateTableMemo(editMemo.id, editMemo);
      ActivityLogger.log('sql', 'update', 'table_memo', editMemo.id, `テーブル定義「${editMemo.table_name}」を更新`);
    } else {
      const id = await sqlDB.addTableMemo(editMemo);
      ActivityLogger.log('sql', 'create', 'table_memo', id, `テーブル定義「${editMemo.table_name}」を追加`);
      setSelId(id);
    }
    await load(); cancelForm(); success('保存しました');
  };

  const deleteMemo = async (m: TableMemo) => {
    if (!confirm(`「${m.table_name}」を削除しますか？`)) return;
    ActivityLogger.log('sql', 'delete', 'table_memo', m.id!, `テーブル定義「${m.table_name}」を削除`);
    await sqlDB.deleteTableMemo(m.id!);
    setMemos(prev => prev.filter(x => x.id !== m.id));
    if (selId === m.id) setSelId(null);
    success('削除しました');
  };

  const colSensors = useSensors(useSensor(PointerSensor));
  const upd = (f: keyof TableMemo, v: unknown) => setEditMemo(p => p ? { ...p, [f]: v } : p);
  const addCol = () => upd('columns', [...(editMemo?.columns || []), { name: '', type: '', nullable: true, pk: false, comment: '', default_value: '' }]);
  const remCol = (i: number) => upd('columns', editMemo?.columns.filter((_, j) => j !== i) || []);
  const updCol = (i: number, f: keyof TableColumn, v: string | boolean) => upd('columns', editMemo?.columns.map((c, j) => j === i ? { ...c, [f]: v } : c) || []);
  const handleColDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id || !editMemo) return;
    upd('columns', arrayMove(editMemo.columns, Number(active.id), Number(over.id)));
  };
  const addIdx = () => upd('indexes', [...(editMemo?.indexes || []), { name: '', unique: false, cols: [], comment: '' }]);
  const remIdx = (i: number) => upd('indexes', editMemo?.indexes.filter((_, j) => j !== i) || []);
  const updIdx = (i: number, f: keyof TableIndex, v: string | boolean | string[]) => upd('indexes', editMemo?.indexes.map((x, j) => j === i ? { ...x, [f]: v } : x) || []);

  const parseSql = () => {
    if (!sqlInput.trim()) { showError('SQLを入力してください'); return; }
    const p = parseSqlToMemo(sqlInput);
    if (!p.table_name) { showError('テーブル名が見つかりませんでした。CREATE TABLE 文を含めてください。'); return; }
    setEditMemo(prev => prev ? { ...prev, schema_name: p.schema_name || prev.schema_name, table_name: p.table_name || prev.table_name, comment: p.comment || prev.comment, columns: p.columns.length ? p.columns : prev.columns, indexes: p.indexes.length ? p.indexes : prev.indexes } : prev);
    setShowSqlImport(false); setSqlInput(''); success('SQLを取り込みました');
  };

  const exportMemos = async () => {
    const all = await sqlDB.getAllTableMemos();
    await FileSaver.save(JSON.stringify({ type: 'sql_table_memos_export', version: 1, memos: all }, null, 2), `sql_memos_${nowTs()}.json`);
  };
  const importRef = useRef<HTMLInputElement>(null);
  const importMemos = async (file: File) => {
    const text = await file.text();
    try {
      const data = JSON.parse(text);
      const arr = data.memos ?? data;
      if (!Array.isArray(arr)) throw new Error();
      for (const m of arr) await sqlDB.addTableMemo(m);
      await load(); success(`${arr.length} 件をインポートしました`);
    } catch { showError('インポートに失敗しました'); }
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* サイドバー */}
      <div className="flex flex-col shrink-0 border-r border-[var(--c-border)] bg-[var(--c-bg)]" style={{ width: 400 }}>
        {/* ツールバー */}
        <div className="px-3 py-2 border-b border-[var(--c-border)] flex items-center gap-1.5 bg-[var(--c-bg-2)]">
          <div className="relative flex-1">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--c-text-3)]" />
            <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="検索…" className={`${inp} w-full pl-6 py-1 text-[11px]`} />
          </div>
          <div className="seg-ctrl shrink-0">
            <button onClick={() => switchView('table')} className={`seg-btn seg-btn--sm${view === 'table' ? ' seg-btn--active' : ''}`}>テーブル</button>
            <button onClick={() => switchView('column')} className={`seg-btn seg-btn--sm${view === 'column' ? ' seg-btn--active' : ''}`}>カラム</button>
          </div>
        </div>
        <div className="px-3 py-2 border-b border-[var(--c-border)] flex items-center gap-1">
          <span className="text-[10px] text-[var(--c-text-3)] flex-1">{filtered.length} 件</span>
          <button onClick={openAdd} title="追加" className="btn btn--ghost btn--sm p-1.5"><Plus size={12} /></button>
          <button onClick={exportMemos} title="エクスポート" className="btn btn--ghost btn--sm p-1.5"><Download size={12} /></button>
          <button onClick={() => importRef.current?.click()} title="インポート" className="btn btn--ghost btn--sm p-1.5"><Upload size={12} /></button>
          <button onClick={() => setShowCompare(true)} title="テーブル比較" disabled={memos.length < 2} className="btn btn--ghost btn--sm p-1.5 disabled:opacity-30"><ArrowLeftRight size={12} /></button>
          <button onClick={() => setShowExcludeSettings(v => !v)} title="同名カラム除外設定"
            className={`btn btn--ghost btn--sm p-1.5 ${showExcludeSettings ? 'text-[var(--c-accent)]' : ''}`}><Settings size={12} /></button>
          <input ref={importRef} type="file" accept=".json" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) { importMemos(f); e.target.value = ''; } }} />
        </div>
        {showExcludeSettings && (
          <div className="px-3 py-2.5 border-b border-[var(--c-border)] bg-[var(--c-bg-2)] flex flex-col gap-2">
            <p className="text-[10px] text-[var(--c-text-2)] font-medium">同名カラム検出の除外対象（全テーブル共通）</p>
            <div className="flex flex-wrap gap-1">
              {excludeCols.map(c => (
                <span key={c} className="flex items-center gap-0.5 text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--c-bg)] border border-[var(--c-border)] text-[var(--c-text-2)]">
                  {c}
                  <button onClick={() => removeExcludeCol(c)} className="ml-0.5 text-[var(--c-text-3)] hover:text-[var(--c-text)]"><X size={9} /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-1.5">
              <input value={excludeInput} onChange={e => setExcludeInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addExcludeCol(); } }}
                placeholder="カラム名を追加（Enter で確定）"
                className="flex-1 text-xs px-2 py-1 rounded border border-[var(--c-border)] bg-[var(--c-surface)] focus:outline-none focus:border-[var(--c-accent)]" />
              <button onClick={addExcludeCol} className="btn btn--ghost btn--sm px-2 text-xs">追加</button>
            </div>
            <button onClick={() => updateExcludeCols(DEFAULT_EXCLUDE_COLS)}
              className="text-[10px] text-[var(--c-text-3)] hover:text-[var(--c-text)] text-left self-start">デフォルトに戻す</button>
          </div>
        )}

        {/* リスト */}
        <div className="flex-1 overflow-auto">
          {view === 'table' ? (
            filtered.length === 0
              ? <p className="p-4 text-center text-xs text-[var(--c-text-3)]">{q ? '該当なし' : 'テーブルが登録されていません'}</p>
              : filtered.map(m => {
                  const fullName = m.schema_name ? `${m.schema_name}.${m.table_name}` : m.table_name;
                  return (
                    <div key={m.id} onClick={() => { setSelId(m.id!); setShowForm(false); }}
                      className={`mx-1.5 my-0.5 px-3 py-2 rounded-lg cursor-pointer transition-colors ring-1 ${selId === m.id ? 'bg-[var(--c-accent)]/10 ring-[var(--c-accent)]/40' : 'ring-[var(--c-border)] hover:bg-[var(--c-bg-2)]'}`}>
                      <div className="font-mono text-xs font-semibold truncate">{hlText(fullName, q)}</div>
                      {m.comment && <div className="text-[10px] text-[var(--c-text-2)] truncate mt-0.5">{hlText(m.comment, q)}</div>}
                      <div className="flex items-center gap-1 mt-1 text-[var(--c-text-3)]">
                        <Columns size={9} className="shrink-0" />
                        <span className="text-[9px] font-mono">{m.columns.length}</span>
                      </div>
                    </div>
                  );
                })
          ) : (
            // カラム一覧ビュー
            allColumns.length === 0
              ? <p className="p-4 text-center text-xs text-[var(--c-text-3)]">{q ? '該当なし' : 'カラムが登録されていません'}</p>
              : <div className="text-[10px]">
                  <div className="grid grid-cols-[3fr_auto_2fr] gap-x-2 px-3 py-1.5 bg-[var(--c-bg-2)] border-b border-[var(--c-border)] text-[var(--c-text-3)] font-medium sticky top-0">
                    <span>テーブル.カラム</span><span>PK</span><span>型</span>
                  </div>
                  {allColumns.map((r, i) => (
                    <div key={i} onClick={() => { setSelId(r.memoId); setShowForm(false); }}
                      className={`grid grid-cols-[3fr_auto_2fr] gap-x-2 px-3 py-1.5 border-b border-[var(--c-border)] cursor-pointer transition-colors ${selId === r.memoId ? 'bg-[var(--c-accent)]/10' : 'hover:bg-[var(--c-bg-2)]'}`}>
                      <span className="font-mono truncate"><span className="text-[var(--c-text-3)]">{r.tblName}.</span><span className="text-[var(--c-text)]">{hlText(r.col.name, q)}</span></span>
                      <span className="text-[var(--c-accent)] font-bold">{r.col.pk ? '●' : ''}</span>
                      <span className="font-mono text-[var(--c-text-2)] truncate">{hlText(r.col.type, q)}</span>
                    </div>
                  ))}
                </div>
          )}
        </div>
      </div>

      {/* メインエリア */}
      <div className="flex-1 overflow-auto bg-[var(--c-bg)]">
        {showForm && editMemo ? (
          // ── 編集フォーム ──
          <div className="p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">{editMemo.id !== undefined ? 'テーブル編集' : '新規テーブル追加'}</h3>
              <div className="flex gap-2">
                <button onClick={() => setShowSqlImport(p => !p)} className={`btn btn--ghost btn--sm text-xs flex items-center gap-1.5 ${showSqlImport ? 'border-[var(--c-accent)] text-[var(--c-accent)]' : ''}`}>
                  <Terminal size={12} />SQL取り込み
                </button>
                <button onClick={saveMemo} className="btn btn--primary btn--sm text-xs">保存</button>
                <button onClick={cancelForm} className="btn btn--ghost btn--sm text-xs">キャンセル</button>
              </div>
            </div>

            {/* SQL取り込みパネル */}
            {showSqlImport && (
              <div className="rounded-lg border border-[var(--c-border)] p-3 bg-[var(--c-bg-2)] flex flex-col gap-2">
                <p className="text-xs text-[var(--c-text-2)]">CREATE TABLE / COMMENT ON / CREATE INDEX 文を貼り付けると自動でフォームに反映します。</p>
                <textarea value={sqlInput} onChange={e => setSqlInput(e.target.value)} placeholder="CREATE TABLE ..." rows={5}
                  className="w-full px-3 py-2 text-xs font-mono rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-text)] resize-y focus:outline-none focus:border-[var(--c-accent)]" />
                <div className="flex gap-2">
                  <button onClick={parseSql} className="btn btn--primary btn--sm text-xs">解析して反映</button>
                  <button onClick={() => { setShowSqlImport(false); setSqlInput(''); }} className="btn btn--ghost btn--sm text-xs">閉じる</button>
                </div>
              </div>
            )}

            {/* 基本情報 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1"><label className="text-xs text-[var(--c-text-3)]">スキーマ名</label><input type="text" value={editMemo.schema_name} onChange={e => upd('schema_name', e.target.value)} className={inp} /></div>
              <div className="flex flex-col gap-1"><label className="text-xs text-[var(--c-text-3)]">テーブル名 *</label><input type="text" value={editMemo.table_name} onChange={e => upd('table_name', e.target.value)} className={inp} /></div>
              <div className="col-span-2 flex flex-col gap-1"><label className="text-xs text-[var(--c-text-3)]">テーブルコメント</label><input type="text" value={editMemo.comment} onChange={e => upd('comment', e.target.value)} className={inp} /></div>
            </div>

            {/* カラム定義 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-[var(--c-text-2)]">カラム定義</h4>
                <button onClick={addCol} className="btn btn--ghost btn--sm text-xs flex items-center gap-1"><Plus size={11} />追加</button>
              </div>
              {(editMemo.columns || []).length === 0 && <p className="text-xs text-[var(--c-text-3)] py-2">カラムがありません</p>}
              <DndContext sensors={colSensors} collisionDetection={closestCenter} onDragEnd={handleColDragEnd}>
                <SortableContext items={(editMemo.columns || []).map((_, i) => String(i))} strategy={verticalListSortingStrategy}>
                  <div className="flex flex-col gap-1.5">
                    {(editMemo.columns || []).map((col, i) => (
                      <SortableColRow key={i} id={String(i)} col={col} i={i} updCol={updCol} remCol={remCol} />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>

            {/* インデックス */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-[var(--c-text-2)]">インデックス</h4>
                <button onClick={addIdx} className="btn btn--ghost btn--sm text-xs flex items-center gap-1"><Plus size={11} />追加</button>
              </div>
              {(editMemo.indexes || []).length === 0 && <p className="text-xs text-[var(--c-text-3)] py-2">インデックスがありません</p>}
              <div className="flex flex-col gap-1.5">
                {(editMemo.indexes || []).map((idx, i) => (
                  <div key={i} className="grid grid-cols-[1fr_auto_1fr_1fr_auto] gap-1.5 items-center">
                    <input type="text" value={idx.name} onChange={e => updIdx(i, 'name', e.target.value)} placeholder="インデックス名" className={inp} />
                    <button onClick={() => updIdx(i, 'unique', !idx.unique)}
                      className={`text-[10px] px-2 py-0.5 rounded border font-medium transition-colors whitespace-nowrap ${idx.unique ? 'bg-[var(--c-accent)]/20 border-[var(--c-accent)]/50 text-[var(--c-accent)]' : 'border-[var(--c-border)] text-[var(--c-text-3)] hover:border-[var(--c-text-3)]'}`}>
                      UQ
                    </button>
                    <input type="text" value={idx.cols.join(', ')} onChange={e => updIdx(i, 'cols', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} placeholder="列名(カンマ区切り)" className={inp} />
                    <input type="text" value={idx.comment} onChange={e => updIdx(i, 'comment', e.target.value)} placeholder="コメント" className={inp} />
                    <button onClick={() => remIdx(i)} className="btn btn--ghost btn--sm p-1 text-[var(--c-text-3)] hover:text-red-400"><X size={13} /></button>
                  </div>
                ))}
              </div>
            </div>

            {/* メモ */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[var(--c-text-3)]">メモ</label>
              <textarea value={editMemo.memo} onChange={e => upd('memo', e.target.value)} rows={3}
                className="px-3 py-2 text-xs rounded-lg border border-[var(--c-border)] bg-[var(--c-bg-2)] text-[var(--c-text)] resize-y focus:outline-none focus:border-[var(--c-accent)]" />
            </div>
          </div>
        ) : selected ? (
          // ── 詳細表示 ──
          <div className="p-4 flex flex-col gap-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="font-mono font-bold text-base">{selected.schema_name ? `${selected.schema_name}.${selected.table_name}` : selected.table_name}</h2>
                {selected.comment && <p className="text-sm text-[var(--c-text-2)] mt-0.5">{selected.comment}</p>}
                <p className="text-[10px] text-[var(--c-text-3)] mt-1">更新: {selected.updated_at ? new Date(selected.updated_at).toLocaleString('ja-JP') : '—'}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => openEdit(selected)} className="btn btn--ghost btn--sm text-xs flex items-center gap-1.5"><Pencil size={12} />編集</button>
                <button onClick={() => deleteMemo(selected)} className="btn btn--ghost btn--sm text-xs text-red-400"><Trash2 size={12} /></button>
              </div>
            </div>

            {/* カラムテーブル */}
            {selected.columns.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-[var(--c-border)]">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[var(--c-bg-2)] text-[var(--c-text-3)] text-[10px] uppercase tracking-wider">
                      <th className="text-left px-3 py-2 font-medium">列名</th>
                      <th className="text-left px-3 py-2 font-medium">型</th>
                      <th className="text-center px-3 py-2 font-medium">NN</th>
                      <th className="text-center px-3 py-2 font-medium">PK</th>
                      <th className="text-left px-3 py-2 font-medium">デフォルト値</th>
                      <th className="text-left px-3 py-2 font-medium">コメント</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--c-border)]">
                    {selected.columns.map((col, i) => (
                      <tr key={i} className="hover:bg-[var(--c-bg-2)] transition-colors">
                        <td className="px-3 py-2 font-mono font-medium">{col.name}</td>
                        <td className="px-3 py-2 font-mono text-[var(--c-text-2)]">{col.type}</td>
                        <td className="px-3 py-2 text-center">{!col.nullable ? <span className="text-amber-400 font-bold">●</span> : ''}</td>
                        <td className="px-3 py-2 text-center">{col.pk ? <span className="text-[var(--c-accent)] font-bold">●</span> : ''}</td>
                        <td className="px-3 py-2 font-mono text-[var(--c-text-3)] text-[11px]">{col.default_value || ''}</td>
                        <td className="px-3 py-2 text-[var(--c-text-2)]">{col.comment}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* インデックステーブル */}
            {selected.indexes.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-[var(--c-text-2)] mb-2">インデックス</h4>
                <div className="overflow-x-auto rounded-xl border border-[var(--c-border)]">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-[var(--c-bg-2)] text-[var(--c-text-3)] text-[10px] uppercase tracking-wider">
                        <th className="text-left px-3 py-2 font-medium">インデックス名</th>
                        <th className="text-center px-3 py-2 font-medium">UQ</th>
                        <th className="text-left px-3 py-2 font-medium">列</th>
                        <th className="text-left px-3 py-2 font-medium">コメント</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--c-border)]">
                      {selected.indexes.map((idx, i) => (
                        <tr key={i} className="hover:bg-[var(--c-bg-2)] transition-colors">
                          <td className="px-3 py-2 font-mono font-medium">{idx.name}</td>
                          <td className="px-3 py-2 text-center">{idx.unique ? <span className="text-[var(--c-accent)] font-bold">●</span> : ''}</td>
                          <td className="px-3 py-2 font-mono text-[var(--c-text-2)]">{idx.cols.join(', ')}</td>
                          <td className="px-3 py-2 text-[var(--c-text-2)]">{idx.comment}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 関連テーブル */}
            {(() => {
              const refTo      = new Map<string, { tblName: string; cols: string[] }>();
              const refBy      = new Map<string, { tblName: string; cols: string[] }>();
              const refRelated = new Map<string, { tblName: string; cols: string[] }>();
              const goTo = (tbl: string, col: string, map: Map<string, { tblName: string; cols: string[] }>) => {
                const e = map.get(tbl); if (e) e.cols.push(col); else map.set(tbl, { tblName: tbl, cols: [col] });
              };
              for (const col of selected.columns) {
                const key = col.name.toLowerCase();
                if (excludeSet.has(key)) continue;
                for (const rel of (relations[key] || [])) {
                  if (rel.memoId === selected.id) continue;
                  if (rel.isPk) goTo(rel.tblName, col.name, refTo);
                  else if (col.pk) goTo(rel.tblName, col.name, refBy);
                  else goTo(rel.tblName, col.name, refRelated);
                }
              }
              if (refTo.size === 0 && refBy.size === 0 && refRelated.size === 0) return null;
              const jump = (tblName: string) => { const m = memos.find(m2 => (m2.schema_name ? `${m2.schema_name}.${m2.table_name}` : m2.table_name) === tblName); if (m) setSelId(m.id!); };
              const renderCard = (tblName: string, cols: string[], borderCls: string, sym: string, symCls: string) => (
                <button key={tblName} onClick={() => jump(tblName)}
                  className={`text-left w-full rounded-lg border border-[var(--c-border)] border-l-4 bg-[var(--c-bg-2)] px-3 py-2 transition-colors hover:bg-[var(--c-bg)] ${borderCls}`}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className={`text-[11px] font-bold ${symCls}`}>{sym}</span>
                    <span className="text-xs font-mono font-semibold">{tblName}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {cols.map(c => <span key={c} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--c-bg)] border border-[var(--c-border)] text-[var(--c-text-2)]">{c}</span>)}
                  </div>
                </button>
              );
              const renderGroup = (title: string, titleCls: string, map: Map<string, { tblName: string; cols: string[] }>, borderCls: string, sym: string, symCls: string) =>
                map.size === 0 ? null : (
                  <div className="flex flex-col gap-1.5">
                    <p className={`text-[10px] font-medium ${titleCls}`}>{title}</p>
                    {Array.from(map.values()).map(r => renderCard(r.tblName, r.cols, borderCls, sym, symCls))}
                  </div>
                );
              return (
                <div className="flex flex-col gap-3">
                  <h4 className="text-xs font-semibold text-[var(--c-text-2)]">関連テーブル</h4>
                  {renderGroup('参照（FK推測）', 'text-[var(--c-accent)]', refTo, 'border-l-[var(--c-accent)]', '→', 'text-[var(--c-accent)]')}
                  {renderGroup('被参照', 'text-emerald-400', refBy, 'border-l-emerald-500', '←', 'text-emerald-400')}
                  {renderGroup('同名カラム', 'text-amber-400', refRelated, 'border-l-amber-500', '=', 'text-amber-400')}
                </div>
              );
            })()}

            {/* フリーメモ */}
            {selected.memo && (
              <div className="rounded-xl border border-[var(--c-border)] p-3 text-xs text-[var(--c-text-2)] whitespace-pre-wrap bg-[var(--c-bg-2)] leading-relaxed">{selected.memo}</div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-[var(--c-text-3)] text-sm gap-2">
            <FileText size={32} className="opacity-20" />
            <p>左のリストからテーブルを選択してください</p>
            <button onClick={openAdd} className="btn btn--ghost btn--sm text-xs flex items-center gap-1.5 mt-2"><Plus size={12} />新規追加</button>
          </div>
        )}
      </div>

      {/* テーブル比較モーダル */}
      {showCompare && <CompareModal memos={memos} onClose={() => setShowCompare(false)} />}
    </div>
  );
}

// ── テーブル比較モーダル ──────────────────────────────────────────
function CompareModal({ memos, onClose }: { memos: TableMemo[]; onClose: () => void; }) {
  const [idA, setIdA] = useState<string>(String(memos[0]?.id ?? 0));
  const [idB, setIdB] = useState<string>(String(memos[1]?.id ?? 0));

  const memoOptions: SelectOption[] = memos.map(m => ({
    value: String(m.id),
    label: m.schema_name ? `${m.schema_name}.${m.table_name}` : m.table_name,
  }));

  interface DiffRow {
    colName: string;
    typeA: string; typeB: string; typeDiff: boolean;
    nnA: boolean;  nnB: boolean;  nnDiff: boolean;
    pkA: boolean;  pkB: boolean;  pkDiff: boolean;
    status: 'same' | 'diff' | 'only-a' | 'only-b';
  }

  const rows = useMemo<DiffRow[]>(() => {
    const numA = Number(idA); const numB = Number(idB);
    if (numA === numB) return [];
    const mA = memos.find(m => m.id === numA); const mB = memos.find(m => m.id === numB);
    if (!mA || !mB) return [];
    const allCols = new Set([...mA.columns.map(c => c.name.toUpperCase()), ...mB.columns.map(c => c.name.toUpperCase())]);
    const result: DiffRow[] = [];
    for (const cn of allCols) {
      const cA = mA.columns.find(c => c.name.toUpperCase() === cn);
      const cB = mB.columns.find(c => c.name.toUpperCase() === cn);
      const typeDiff = !!cA && !!cB && cA.type.toUpperCase() !== cB.type.toUpperCase();
      const nnDiff   = !!cA && !!cB && !!cA.nullable !== !!cB.nullable;
      const pkDiff   = !!cA && !!cB && !!cA.pk !== !!cB.pk;
      let status: DiffRow['status'];
      if (cA && cB) status = (typeDiff || nnDiff || pkDiff) ? 'diff' : 'same';
      else if (cA) status = 'only-a';
      else status = 'only-b';
      result.push({
        colName: cA?.name || cB?.name || cn,
        typeA: cA?.type || '—', typeB: cB?.type || '—', typeDiff,
        nnA: cA ? !cA.nullable : false, nnB: cB ? !cB.nullable : false, nnDiff,
        pkA: !!cA?.pk, pkB: !!cB?.pk, pkDiff,
        status,
      });
    }
    return result;
  }, [idA, idB, memos]);

  const mA = memos.find(m => m.id === Number(idA));
  const mB = memos.find(m => m.id === Number(idB));
  const nameA = mA ? (mA.schema_name ? `${mA.schema_name}.${mA.table_name}` : mA.table_name) : '';
  const nameB = mB ? (mB.schema_name ? `${mB.schema_name}.${mB.table_name}` : mB.table_name) : '';
  const sameCount = rows.filter(r => r.status === 'same').length;
  const diffCount = rows.filter(r => r.status === 'diff').length;
  const onlyA     = rows.filter(r => r.status === 'only-a').length;
  const onlyB     = rows.filter(r => r.status === 'only-b').length;

  const hlCell = (diff: boolean) => diff ? 'bg-amber-500/15' : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-[var(--c-bg)] border border-[var(--c-border)] rounded-2xl shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--c-border)] bg-[var(--c-bg-2)]">
          <div className="flex items-center gap-2"><ArrowLeftRight size={15} className="text-[var(--c-accent)]" /><span className="font-semibold text-sm">テーブル比較</span></div>
          <button onClick={onClose} className="text-[var(--c-text-3)] hover:text-[var(--c-text)]"><X size={16} /></button>
        </div>
        <div className="p-4 flex flex-col gap-4 overflow-auto">
          <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
            <Select options={memoOptions} value={idA} onChange={setIdA} />
            <span className="text-xs text-[var(--c-text-3)]">vs</span>
            <Select options={memoOptions} value={idB} onChange={setIdB} />
          </div>
          {rows.length > 0 && (
            <>
              <div className="flex gap-3 flex-wrap text-xs">
                <span className="text-[var(--c-text-3)]">一致: <strong className="text-[var(--c-text)]">{sameCount}</strong></span>
                {diffCount > 0 && <span className={`px-2 py-0.5 rounded ${LEVEL_BADGE.mid}`}>差異: <strong>{diffCount}</strong></span>}
                {onlyA > 0 && <span className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-400 border border-sky-500/30">{nameA} のみ: <strong>{onlyA}</strong></span>}
                {onlyB > 0 && <span className="px-2 py-0.5 rounded bg-violet-500/15 text-violet-400 border border-violet-500/30">{nameB} のみ: <strong>{onlyB}</strong></span>}
              </div>
              <div className="overflow-x-auto rounded-xl border border-[var(--c-border)]">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[var(--c-bg-2)] text-[var(--c-text-3)] text-[10px] uppercase tracking-wider">
                      <th className="text-left px-3 py-2">列名</th>
                      <th className="text-left px-3 py-2" colSpan={3}>{nameA}</th>
                      <th className="text-left px-3 py-2" colSpan={3}>{nameB}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--c-border)]">
                    {rows.map((r, i) => (
                      <tr key={i} className={r.status === 'only-a' ? 'bg-sky-500/10' : r.status === 'only-b' ? 'bg-violet-500/10' : ''}>
                        <td className="px-3 py-2 font-mono font-medium">{r.colName}</td>
                        <td className={`px-3 py-2 font-mono text-[var(--c-text-2)] ${hlCell(r.typeDiff)}`}>{r.typeA}</td>
                        <td className={`px-3 py-2 text-center ${hlCell(r.nnDiff)}`}>{r.nnA ? <span className="text-amber-400 text-[10px]">NN</span> : ''}</td>
                        <td className={`px-3 py-2 text-center ${hlCell(r.pkDiff)}`}>{r.pkA ? <span className="text-[var(--c-accent)] text-[10px]">PK</span> : ''}</td>
                        <td className={`px-3 py-2 font-mono text-[var(--c-text-2)] ${hlCell(r.typeDiff)}`}>{r.typeB}</td>
                        <td className={`px-3 py-2 text-center ${hlCell(r.nnDiff)}`}>{r.nnB ? <span className="text-amber-400 text-[10px]">NN</span> : ''}</td>
                        <td className={`px-3 py-2 text-center ${hlCell(r.pkDiff)}`}>{r.pkB ? <span className="text-[var(--c-accent)] text-[10px]">PK</span> : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {Number(idA) === Number(idB) && (
            <p className="text-xs text-center text-[var(--c-text-3)]">異なるテーブルを選択してください</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ================================================================
// メイン: SqlPage
// ================================================================

const TABS: { id: SqlTab; label: string; icon: React.ElementType }[] = [
  { id: 'setup',   label: '接続・設定',              icon: Settings   },
  { id: 'analyze', label: '実行計画 & チューニング',  icon: BarChart2  },
  { id: 'memo',    label: 'テーブル定義メモ',         icon: FileText   },
];

export function SqlPage() {
  const [activeTab, setActiveTab] = useState<SqlTab>(() => {
    const s = localStorage.getItem(SK_TAB);
    return (s === 'setup' || s === 'analyze' || s === 'memo') ? s : 'setup';
  });
  const [pendingMemoId, setPendingMemoId] = useState<number | null>(null);

  const { config: tabConfig, setActiveTab: setGlobalTab } = useTabStore();

  const switchTab = (t: SqlTab) => { setActiveTab(t); localStorage.setItem(SK_TAB, t); };

  // グローバル検索登録
  useEffect(() => {
    const sqlLabel = tabConfig.find(t => t.pageSrc === 'pages/sql.html')?.label ?? '';

    searchRegistry.register('sql-nav', async (query) => {
      const q = query.toLowerCase();
      return TABS
        .filter(t => t.label.toLowerCase().includes(q))
        .map(t => ({
          id: `sql-nav-${t.id}`,
          pageSrc: 'pages/sql.html',
          title: t.label,
          excerpt: '',
          onSelect: () => { if (sqlLabel) setGlobalTab(sqlLabel); switchTab(t.id); },
        }));
    });

    searchRegistry.register('sql-memo', async (query) => {
      const q = query.toLowerCase();
      const all = await sqlDB.getAllTableMemos();
      return all
        .filter(m =>
          m.table_name?.toLowerCase().includes(q) ||
          m.schema_name?.toLowerCase().includes(q) ||
          m.comment?.toLowerCase().includes(q) ||
          m.memo?.toLowerCase().includes(q) ||
          m.columns.some(c => c.name.toLowerCase().includes(q) || c.comment?.toLowerCase().includes(q))
        )
        .slice(0, 10)
        .map(m => {
          const fullName = m.schema_name ? `${m.schema_name}.${m.table_name}` : m.table_name;
          const excerptBase = m.comment || m.memo || m.columns.map(c => c.name).join(' ');
          return {
            id: `sql-memo-${m.id}`,
            pageSrc: 'pages/sql.html',
            title: fullName,
            excerpt: extractExcerpt(excerptBase, query),
            onSelect: () => {
              if (sqlLabel) setGlobalTab(sqlLabel);
              switchTab('memo');
              setPendingMemoId(m.id!);
            },
          };
        });
    });
    return () => {
      searchRegistry.unregister('sql-nav');
      searchRegistry.unregister('sql-memo');
    };
  }, [tabConfig, setGlobalTab]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* タブバー */}
      <div className="flex gap-0 px-3 pt-2 border-b border-[var(--c-border)] bg-[var(--c-bg)] shrink-0">
        {TABS.map(t => (
          <button key={t.id} onClick={() => switchTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm rounded-t-lg transition-colors border-b-2 -mb-px ${
              activeTab === t.id
                ? 'border-[var(--c-accent)] text-[var(--c-accent)] bg-[var(--c-bg-2)] font-medium'
                : 'border-transparent text-[var(--c-text-2)] hover:text-[var(--c-text)] hover:bg-[var(--c-bg-2)]'
            }`}>
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {/* コンテンツ（条件付きレンダリング: タブ切替でマウント/アンマウント） */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'setup'   && <SetupTab />}
        {activeTab === 'analyze' && <AnalyzeTab />}
        {activeTab === 'memo'    && <MemoTab pendingSelId={pendingMemoId} onClearPending={() => setPendingMemoId(null)} />}
      </div>
    </div>
  );
}
