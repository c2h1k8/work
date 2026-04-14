// ==================================================
// SqlPage — SQL Toolkit（React 移行版）
// ==================================================
// タブ: 接続環境 | バインド変数 | チューニングガイド | テーブル定義メモ

import '../styles/pages/sql.css';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useToast } from '../components/Toast';
import { sqlDB, type SqlEnv, type TableMemo, type TableColumn, type TableIndex } from '../db/sql_db';
import { activityDB } from '../db/activity_db';
import { Clipboard } from '../core/clipboard';

type SqlTab = 'env' | 'bind' | 'tune' | 'memo';
const STORAGE_TAB       = 'sql_active_tab';
const STORAGE_SELECTED_ENV = 'sql_selected_env';
const STORAGE_PARAM     = 'sql_params';
const STORAGE_TUNE_TAB  = 'sql_tune_tab';
const STORAGE_TUNE_GROUPS = 'sql_tune_groups';

// ================================================================
// 定数
// ================================================================
const DEFAULT_ENVS: Omit<SqlEnv, 'id' | 'position'>[] = [
  { key: 'UT',  username: 'xxxx', password: 'xxxx', connect_identifier: '127.0.0.1:1521/xxxx' },
  { key: 'XXX', username: 'xxxx', password: 'xxxx', connect_identifier: '127.0.0.1:1521/xxxx' },
];

const SQLPLUS_OPTIONS = [
  { id: 'opt-silent',     flag: '-S', label: '-S', desc: 'サイレントモード（ヘッダー・プロンプト非表示）' },
  { id: 'opt-login-once', flag: '-L', label: '-L', desc: 'ログイン試行を1回のみに制限' },
];

interface TypeDef {
  label: string; lenMode: 'required'|'optional'|'none';
  isStrings: boolean; nPrefix: boolean; isDate: boolean; defaultLen: string;
}
const TYPE_DEFS: Record<string, TypeDef> = {
  VARCHAR2:  { label: 'VARCHAR2',  lenMode: 'required', isStrings: true,  nPrefix: false, isDate: false, defaultLen: '20' },
  NVARCHAR2: { label: 'NVARCHAR2', lenMode: 'required', isStrings: true,  nPrefix: true,  isDate: false, defaultLen: '20' },
  CHAR:      { label: 'CHAR',      lenMode: 'required', isStrings: true,  nPrefix: false, isDate: false, defaultLen: '6'  },
  NUMBER:    { label: 'NUMBER',    lenMode: 'optional', isStrings: false, nPrefix: false, isDate: false, defaultLen: ''   },
  DATE:      { label: 'DATE',      lenMode: 'none',     isStrings: false, nPrefix: false, isDate: true,  defaultLen: ''   },
};

interface TuneItem { op: string; category: string; level: 'ok'|'mid'|'high'|'low'; desc: string; }
const TUNE_ITEMS: TuneItem[] = [
  { op: 'INDEX UNIQUE SCAN', category: 'スキャン', level: 'ok', desc: '等価条件で B-tree インデックスから 1 件取得。最もコストが低い最適なアクセス方法。' },
  { op: 'INDEX RANGE SCAN', category: 'スキャン', level: 'ok', desc: '範囲条件でのインデックス走査。典型的な良好アクセスパス。' },
  { op: 'INDEX RANGE SCAN DESCENDING', category: 'スキャン', level: 'ok', desc: 'INDEX RANGE SCAN の降順版。ORDER BY 列 DESC にインデックスが利用されているとき発生。' },
  { op: 'TABLE ACCESS BY INDEX ROWID', category: 'スキャン', level: 'ok', desc: 'インデックスで特定した ROWID でテーブル行を取得。インデックス経由アクセスの標準的な形。' },
  { op: 'TABLE ACCESS BY INDEX ROWID BATCHED', category: 'スキャン', level: 'ok', desc: '複数 ROWID を一括取得（Oracle 12c 以降）。ブロック I/O を削減。' },
  { op: 'INDEX FULL SCAN (MIN/MAX)', category: 'スキャン', level: 'ok', desc: 'MIN / MAX 取得のためにインデックスの先頭または末尾エントリのみを参照。極めて低コスト。' },
  { op: 'PARTITION RANGE SINGLE', category: 'スキャン', level: 'ok', desc: 'WHERE 句にパーティションキーが含まれ、1 つのパーティションに絞り込まれた（プルーニング成功）。' },
  { op: 'TABLE ACCESS FULL', category: 'スキャン', level: 'high', desc: 'テーブル全件スキャン。大テーブルで発生している場合はインデックスの作成・利用を検討する。' },
  { op: 'PARTITION RANGE ALL', category: 'スキャン', level: 'high', desc: '全パーティションを走査。WHERE 句にパーティションキーを含めてプルーニングを効かせる。' },
  { op: 'INDEX FULL SCAN', category: 'スキャン', level: 'mid', desc: 'インデックスの全エントリを順に走査。INDEX RANGE SCAN に絞り込めないか条件を見直す。' },
  { op: 'INDEX FAST FULL SCAN', category: 'スキャン', level: 'mid', desc: 'マルチブロック読み込みによるインデックス全走査。SELECT 列をインデックス列のみに絞れないか確認する。' },
  { op: 'INDEX SKIP SCAN', category: 'スキャン', level: 'mid', desc: '複合インデックスの先頭列が WHERE 条件にない場合に発生。インデックス構成の見直しを検討する。' },
  { op: 'PARTITION RANGE ITERATOR', category: 'スキャン', level: 'mid', desc: '複数パーティションをスキャン。プルーニング条件をさらに絞り込めないか見直す。' },
  { op: 'NESTED LOOPS', category: '結合', level: 'low', desc: '外側ループの各行に対して内側テーブルをアクセス。内側テーブルに適切なインデックスがある小〜中規模結合に有効。' },
  { op: 'NESTED LOOPS OUTER', category: '結合', level: 'low', desc: 'Nested Loops の外部結合版。内側テーブルに一致しない場合も外側の行を返す。' },
  { op: 'NESTED LOOPS SEMI', category: '結合', level: 'ok', desc: 'IN / EXISTS を Nested Loops で処理するセミ結合。内側で最初にマッチした時点でループを打ち切るため効率的。' },
  { op: 'NESTED LOOPS ANTI', category: '結合', level: 'low', desc: 'NOT IN / NOT EXISTS を Nested Loops で処理するアンチ結合。内側テーブルにインデックスがある場合に選択される。' },
  { op: 'HASH JOIN', category: '結合', level: 'low', desc: '小さい方のテーブルをハッシュテーブルに構築して大テーブルと等価結合。pga_aggregate_target の調整でディスクスピルを抑制できる。' },
  { op: 'HASH JOIN OUTER', category: '結合', level: 'low', desc: 'Hash Join の外部結合版。大規模テーブルの LEFT OUTER JOIN で典型的に発生。' },
  { op: 'HASH JOIN SEMI', category: '結合', level: 'ok', desc: 'IN / EXISTS をハッシュ方式で処理するセミ結合。内側でマッチが確認できた時点で外側の行を返す。' },
  { op: 'HASH JOIN ANTI', category: '結合', level: 'low', desc: 'NOT IN / NOT EXISTS をハッシュ方式で処理するアンチ結合。NULL 値の扱いに注意。' },
  { op: 'MERGE JOIN', category: '結合', level: 'low', desc: '両テーブルを結合キーでソートしてマージ。等価・不等価結合に対応。既にソート済みであればコスト低。' },
  { op: 'MERGE JOIN CARTESIAN', category: '結合', level: 'high', desc: 'デカルト積（直積）結合。結合条件の漏れが原因のことが多い。WHERE 句の結合条件を確認する。' },
  { op: 'SORT AGGREGATE', category: '処理', level: 'ok', desc: 'GROUP BY なしの集計処理（COUNT(*) / SUM / MAX / MIN 等）。全件を集約して 1 行を返す。' },
  { op: 'HASH (GROUP BY)', category: '処理', level: 'ok', desc: 'ハッシュ集計による GROUP BY。ソートが不要でメモリ効率が良い。' },
  { op: 'HASH UNIQUE', category: '処理', level: 'ok', desc: 'ハッシュによる重複排除（DISTINCT 相当）。SORT UNIQUE よりソートコストがない分効率的。' },
  { op: 'COUNT (STOPKEY)', category: '処理', level: 'ok', desc: 'ROWNUM 条件による早期終了（FETCH FIRST / LIMIT 相当）。必要な件数に達した時点で処理を停止。' },
  { op: 'SORT (ORDER BY)', category: '処理', level: 'mid', desc: '行のソート処理。インデックスで ORDER BY を排除できないか条件を見直す。' },
  { op: 'SORT (GROUP BY)', category: '処理', level: 'mid', desc: '集約のためのソート処理。USE_HASH_AGGREGATION ヒントで HASH (GROUP BY) への変換を検討する。' },
  { op: 'SORT (GROUP BY ROLLUP)', category: '処理', level: 'mid', desc: 'ROLLUP / CUBE 集計のソート処理。集計列数・行数が多い場合は PGA メモリに注意する。' },
  { op: 'SORT UNIQUE', category: '処理', level: 'mid', desc: 'DISTINCT 処理のためのソート。HASH UNIQUE に変換できないか確認する。' },
  { op: 'FILTER', category: '処理', level: 'mid', desc: '相関サブクエリによるフィルター。外側クエリの行数分だけ実行される。EXISTS や JOIN への書き換えを検討する。' },
  { op: 'BUFFER SORT', category: '処理', level: 'low', desc: 'MERGE JOIN の内側入力を一時バッファに保存。pga_aggregate_target の調整でメモリ不足を改善できる。' },
  { op: 'WINDOW SORT', category: '処理', level: 'low', desc: '分析関数（ウィンドウ関数）のためのソート。PARTITION BY / ORDER BY の列にインデックスが利用できないか確認する。' },
  { op: 'WINDOW BUFFER', category: '処理', level: 'low', desc: 'ROWS / RANGE 指定を伴う分析関数のバッファリング。pga_aggregate_target に収まるサイズか確認する。' },
  { op: 'VIEW', category: 'その他', level: 'low', desc: 'ビューまたはインラインビューの評価。必要に応じてビューのマージが発生しているか確認する。' },
  { op: 'UNION-ALL', category: 'その他', level: 'low', desc: '複数の結果セットを UNION ALL で連結。各ブランチが独立して実行される。' },
  { op: 'CONCATENATION', category: 'その他', level: 'mid', desc: 'OR 条件を複数の実行計画に分割して結果を UNION ALL。各ブランチのコストを確認する。' },
  { op: 'CONNECT BY (WITH FILTERING)', category: 'その他', level: 'mid', desc: 'START WITH フィルタリングありの階層クエリ。再帰深度が深い場合はメモリ・CPU に注意する。' },
  { op: 'REMOTE', category: 'その他', level: 'mid', desc: 'DB Link 経由のリモートアクセス。ネットワーク遅延と転送データ量に注意。ローカルでの JOIN を検討する。' },
];

const TUNE_CATEGORIES = ['スキャン', '結合', '処理', 'その他'];
const LEVEL_STYLES: Record<string, string> = {
  ok:   'bg-green-500/15 text-green-400 border border-green-500/30',
  mid:  'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
  high: 'bg-red-500/15 text-red-400 border border-red-500/30',
  low:  'bg-blue-500/15 text-blue-400 border border-blue-500/30',
};
const LEVEL_LABELS: Record<string, string> = { ok: '良好', mid: '要注意', high: '要改善', low: '参考' };
const LEVEL_CARD: Record<string, string> = {
  ok:   'border-l-green-500/50',
  mid:  'border-l-yellow-500/50',
  high: 'border-l-red-500/50',
  low:  'border-l-blue-500/50',
};

// ── バリデーション ───────────────────────────────
function validateEnv({ key, user, host, portRaw, service }: { key: string; user: string; host: string; portRaw: string; service: string }): string | null {
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

// ================================================================
// 接続環境タブ
// ================================================================
function EnvTab() {
  const { success, error: showError, show: showToast } = useToast();
  const [envs, setEnvs]               = useState<SqlEnv[]>([]);
  const [selectedKey, setSelectedKey] = useState(() => localStorage.getItem(STORAGE_SELECTED_ENV) || '');
  const [editingId, setEditingId]     = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [sqlplusOpts, setSqlplusOpts] = useState<Record<string, boolean>>({});
  const [sqlplusExtra, setSqlplusExtra] = useState('');

  // 編集フォーム状態
  const [eKey, setEKey]       = useState('');
  const [eUser, setEUser]     = useState('');
  const [ePass, setEPass]     = useState('');
  const [eHost, setEHost]     = useState('');
  const [ePort, setEPort]     = useState('');
  const [eService, setEService] = useState('');

  const loadEnvs = useCallback(async () => {
    const list = await sqlDB.getAllEnvs();
    if (list.length === 0) {
      for (const e of DEFAULT_ENVS) await sqlDB.addEnv({ ...e, position: DEFAULT_ENVS.indexOf(e) });
      const reloaded = await sqlDB.getAllEnvs();
      setEnvs(reloaded);
      const first = reloaded[0]?.key || '';
      setSelectedKey(first);
      localStorage.setItem(STORAGE_SELECTED_ENV, first);
    } else {
      setEnvs(list);
      if (!selectedKey || !list.some(e => e.key === selectedKey)) {
        const first = list[0]?.key || '';
        setSelectedKey(first);
        localStorage.setItem(STORAGE_SELECTED_ENV, first);
      }
    }
  }, [selectedKey]);

  useEffect(() => { loadEnvs(); }, []);

  const selectEnv = (key: string) => {
    setSelectedKey(key);
    localStorage.setItem(STORAGE_SELECTED_ENV, key);
  };

  const moveEnv = async (id: number, dir: -1 | 1) => {
    const idx   = envs.findIndex(e => e.id === id);
    const swapI = idx + dir;
    if (swapI < 0 || swapI >= envs.length) return;
    const p1 = envs[idx].position; const p2 = envs[swapI].position;
    await sqlDB.updateEnv(envs[idx].id!,   { position: p2 });
    await sqlDB.updateEnv(envs[swapI].id!, { position: p1 });
    await loadEnvs();
  };

  const deleteEnv = async (env: SqlEnv) => {
    if (envs.length <= 1) { showError('最後の接続環境は削除できません'); return; }
    if (!confirm(`接続環境「${env.key}」を削除しますか？`)) return;
    activityDB.add({ page: 'sql', action: 'delete', target_type: 'env', target_id: String(env.id), summary: `接続環境「${env.key}」を削除`, created_at: new Date().toISOString() });
    await sqlDB.deleteEnv(env.id!);
    if (selectedKey === env.key) {
      const rest = envs.filter(e => e.id !== env.id);
      const next = rest[0]?.key || '';
      setSelectedKey(next);
      localStorage.setItem(STORAGE_SELECTED_ENV, next);
    }
    await loadEnvs();
  };

  const openEdit = (env: SqlEnv) => {
    const { host, port, service } = parseConnIdentifier(env.connect_identifier);
    setEKey(env.key); setEUser(env.username); setEPass(env.password);
    setEHost(host); setEPort(port); setEService(service);
    setEditingId(env.id!);
    setShowAddForm(false);
  };

  const openAdd = () => {
    setEKey(''); setEUser(''); setEPass(''); setEHost(''); setEPort(''); setEService('');
    setEditingId(null);
    setShowAddForm(true);
  };

  const cancelForm = () => { setEditingId(null); setShowAddForm(false); };

  const saveForm = async () => {
    const err = validateEnv({ key: eKey, user: eUser, host: eHost, portRaw: ePort, service: eService });
    if (err) { showError(err); return; }
    const port = ePort || '1521';
    const connect_identifier = `${eHost}:${port}/${eService}`;
    if (editingId !== null) {
      const oldEnv = envs.find(e => e.id === editingId);
      const allEnvs = await sqlDB.getAllEnvs();
      if (eKey !== oldEnv?.key && allEnvs.some(e => e.key === eKey)) { showError(`環境名「${eKey}」はすでに存在します`); return; }
      await sqlDB.updateEnv(editingId, { key: eKey, username: eUser, password: ePass, connect_identifier });
      if (selectedKey === oldEnv?.key && eKey !== oldEnv?.key) { setSelectedKey(eKey); localStorage.setItem(STORAGE_SELECTED_ENV, eKey); }
      activityDB.add({ page: 'sql', action: 'update', target_type: 'env', target_id: String(editingId), summary: `接続環境「${eKey}」を更新`, created_at: new Date().toISOString() });
      showToast(`「${eKey}」を更新しました`, 'info');
    } else {
      const allEnvs = await sqlDB.getAllEnvs();
      if (allEnvs.some(e => e.key === eKey)) { showError(`環境名「${eKey}」はすでに存在します`); return; }
      await sqlDB.addEnv({ key: eKey, username: eUser, password: ePass, connect_identifier, position: allEnvs.length });
    }
    cancelForm();
    await loadEnvs();
  };

  // 接続コマンド生成
  const connCommand = useMemo(() => {
    const env = envs.find(e => e.key === selectedKey) || envs[0];
    if (!env) return 'sqlplus';
    const opts = SQLPLUS_OPTIONS.filter(o => sqlplusOpts[o.flag]).map(o => o.flag);
    const connStr = `${env.username}/${env.password}@${env.connect_identifier}`;
    return ['sqlplus', ...opts, connStr, ...(sqlplusExtra.trim() ? [sqlplusExtra.trim()] : [])].join(' ');
  }, [envs, selectedKey, sqlplusOpts, sqlplusExtra]);

  const copyConn = () => {
    Clipboard.copy(connCommand).then(() => success('コピーしました'));
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 環境セレクター */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-[var(--c-text-3)]">接続先:</span>
        {envs.map(env => (
          <label key={env.key} className="flex items-center gap-1 cursor-pointer">
            <input type="radio" name="env-select" value={env.key} checked={selectedKey === env.key} onChange={() => selectEnv(env.key)} className="accent-[var(--c-accent)]" />
            <span className={`text-sm px-2 py-0.5 rounded ${selectedKey === env.key ? 'text-[var(--c-accent)] font-semibold' : 'text-[var(--c-text-2)]'}`}>{env.key}</span>
          </label>
        ))}
      </div>

      {/* SQL*Plus オプション + コマンドプレビュー */}
      <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-bg-2)] p-4 flex flex-col gap-3">
        <div className="flex gap-4 flex-wrap">
          {SQLPLUS_OPTIONS.map(opt => (
            <label key={opt.flag} className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={!!sqlplusOpts[opt.flag]} onChange={e => setSqlplusOpts(prev => ({ ...prev, [opt.flag]: e.target.checked }))} className="accent-[var(--c-accent)]" />
              <code className="text-xs bg-[var(--c-bg-3)] px-1.5 rounded">{opt.label}</code>
              <span className="text-xs text-[var(--c-text-2)]">{opt.desc}</span>
            </label>
          ))}
          <input type="text" value={sqlplusExtra} onChange={e => setSqlplusExtra(e.target.value)} placeholder="追加オプション"
            className="px-2 py-1 text-xs rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-text)] focus:outline-none focus:border-[var(--c-accent)]" />
        </div>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs font-mono bg-[var(--c-bg)] px-3 py-2 rounded border border-[var(--c-border)] text-[var(--c-text)] overflow-x-auto whitespace-nowrap">
            {connCommand}
          </code>
          <button onClick={copyConn} className="btn btn--primary btn--sm text-xs shrink-0">コピー</button>
        </div>
      </div>

      {/* 環境一覧 */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm text-[var(--c-text-2)]">接続環境一覧</h3>
        <button onClick={openAdd} className="btn btn--ghost btn--sm text-xs">+ 追加</button>
      </div>

      {/* 追加フォーム */}
      {showAddForm && (
        <EnvForm
          eKey={eKey} eUser={eUser} ePass={ePass} eHost={eHost} ePort={ePort} eService={eService}
          setEKey={setEKey} setEUser={setEUser} setEPass={setEPass} setEHost={setEHost} setEPort={setEPort} setEService={setEService}
          onSave={saveForm} onCancel={cancelForm}
        />
      )}

      <div className="flex flex-col gap-2">
        {envs.length === 0 ? (
          <p className="text-sm text-[var(--c-text-3)] text-center py-4">登録された接続環境がありません</p>
        ) : (
          envs.map((env, idx) => (
            <div key={env.id} className="rounded-lg border border-[var(--c-border)] overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-2.5 bg-[var(--c-bg-2)]">
                <div className="flex flex-col gap-0.5">
                  <button onClick={() => moveEnv(env.id!, -1)} disabled={idx === 0} className="text-[var(--c-text-3)] hover:text-[var(--c-text)] disabled:opacity-30 text-xs leading-none">▲</button>
                  <button onClick={() => moveEnv(env.id!, 1)} disabled={idx === envs.length - 1} className="text-[var(--c-text-3)] hover:text-[var(--c-text)] disabled:opacity-30 text-xs leading-none">▼</button>
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-semibold text-sm text-[var(--c-accent)]">{env.key}</span>
                  <span className="text-xs text-[var(--c-text-2)] ml-2">{env.username}@{env.connect_identifier}</span>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => editingId === env.id ? cancelForm() : openEdit(env)} className="btn btn--ghost btn--sm text-xs">
                    {editingId === env.id ? 'キャンセル' : '編集'}
                  </button>
                  <button onClick={() => deleteEnv(env)} className="btn btn--ghost btn--sm text-xs text-red-400 hover:text-red-300">削除</button>
                </div>
              </div>
              {editingId === env.id && (
                <div className="border-t border-[var(--c-border)]">
                  <EnvForm
                    eKey={eKey} eUser={eUser} ePass={ePass} eHost={eHost} ePort={ePort} eService={eService}
                    setEKey={setEKey} setEUser={setEUser} setEPass={setEPass} setEHost={setEHost} setEPort={setEPort} setEService={setEService}
                    onSave={saveForm} onCancel={cancelForm}
                  />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function EnvForm({ eKey, eUser, ePass, eHost, ePort, eService, setEKey, setEUser, setEPass, setEHost, setEPort, setEService, onSave, onCancel }: {
  eKey: string; eUser: string; ePass: string; eHost: string; ePort: string; eService: string;
  setEKey: (v: string) => void; setEUser: (v: string) => void; setEPass: (v: string) => void;
  setEHost: (v: string) => void; setEPort: (v: string) => void; setEService: (v: string) => void;
  onSave: () => void; onCancel: () => void;
}) {
  const inp = "px-2 py-1.5 text-xs rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-text)] focus:outline-none focus:border-[var(--c-accent)]";
  return (
    <div className="p-4 flex flex-col gap-3 bg-[var(--c-bg)]">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <div className="flex flex-col gap-1"><label className="text-xs text-[var(--c-text-3)]">環境名</label><input type="text" value={eKey} onChange={e => setEKey(e.target.value)} placeholder="例: PROD" className={inp} /></div>
        <div className="flex flex-col gap-1"><label className="text-xs text-[var(--c-text-3)]">ユーザー名</label><input type="text" value={eUser} onChange={e => setEUser(e.target.value)} placeholder="例: SCOTT" className={inp} /></div>
        <div className="flex flex-col gap-1"><label className="text-xs text-[var(--c-text-3)]">パスワード</label><input type="password" value={ePass} onChange={e => setEPass(e.target.value)} autoComplete="new-password" className={inp} /></div>
        <div className="flex flex-col gap-1"><label className="text-xs text-[var(--c-text-3)]">ホスト名 / IP</label><input type="text" value={eHost} onChange={e => setEHost(e.target.value)} placeholder="例: 127.0.0.1" className={inp} /></div>
        <div className="flex flex-col gap-1"><label className="text-xs text-[var(--c-text-3)]">ポート</label><input type="text" value={ePort} onChange={e => setEPort(e.target.value)} placeholder="1521" className={inp} /></div>
        <div className="flex flex-col gap-1"><label className="text-xs text-[var(--c-text-3)]">サービス名</label><input type="text" value={eService} onChange={e => setEService(e.target.value)} placeholder="例: ORCL" className={inp} /></div>
      </div>
      <div className="flex gap-2">
        <button onClick={onSave} className="btn btn--primary btn--sm text-xs">保存</button>
        <button onClick={onCancel} className="btn btn--ghost btn--sm text-xs">キャンセル</button>
      </div>
    </div>
  );
}

// ================================================================
// バインド変数タブ
// ================================================================
interface ParamRow { id: number; use: boolean; varname: string; type: string; length: string; value: string; }

function BindTab() {
  const { success } = useToast();
  const [params, setParams] = useState<ParamRow[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_PARAM);
      if (stored) {
        const arr = JSON.parse(stored);
        if (Array.isArray(arr) && arr.length > 0) return arr.map((s, i) => ({ id: i + 1, ...s }));
      }
    } catch { /* ignore */ }
    return [];
  });
  const nextId = useRef(params.length + 1);

  const saveToStorage = (list: ParamRow[]) => {
    localStorage.setItem(STORAGE_PARAM, JSON.stringify(list.map(({ id: _id, ...rest }) => rest)));
  };

  const addRow = () => {
    const id = nextId.current++;
    setParams(prev => { const next = [...prev, { id, use: false, varname: '', type: 'VARCHAR2', length: '', value: '' }]; saveToStorage(next); return next; });
  };

  const updateRow = (id: number, field: keyof ParamRow, value: string | boolean) => {
    setParams(prev => { const next = prev.map(r => r.id === id ? { ...r, [field]: value } : r); saveToStorage(next); return next; });
  };

  const removeRow = (id: number) => {
    setParams(prev => { const next = prev.filter(r => r.id !== id); saveToStorage(next); return next; });
  };

  const clearRows = () => { setParams([]); localStorage.removeItem(STORAGE_PARAM); };

  const buildText = () => {
    let text = '';
    for (const r of params) {
      if (!r.use) continue;
      const def = TYPE_DEFS[r.type];
      if (!def) continue;
      const varname = r.varname.trim() || `B${r.id}`;
      const lenPart = def.lenMode === 'required' && r.length ? `(${r.length})` : '';
      const varLabel = def.isDate ? 'VARCHAR2(30)' : `${def.label}${lenPart}`;
      text += `VAR ${varname} ${varLabel}\n`;
      if (def.isDate) {
        const dv = r.value || new Date().toISOString().slice(0, 10);
        text += `EXEC :${varname} := TO_DATE('${dv}','YYYY-MM-DD');\n`;
      } else if (def.nPrefix) {
        text += `EXEC :${varname} := N'${r.value}';\n`;
      } else if (def.isStrings) {
        text += `EXEC :${varname} := '${r.value}';\n`;
      } else {
        text += `EXEC :${varname} := ${r.value || '0'};\n`;
      }
    }
    return text;
  };

  const copyParams = () => {
    const text = buildText();
    if (!text) return;
    Clipboard.copy(text).then(() => success('コピーしました'));
  };

  const inp = "px-2 py-1.5 text-xs rounded border border-[var(--c-border)] bg-[var(--c-bg-2)] text-[var(--c-text)] focus:outline-none focus:border-[var(--c-accent)]";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <button onClick={addRow} className="btn btn--ghost btn--sm text-xs">+ 行を追加</button>
        <button onClick={copyParams} className="btn btn--primary btn--sm text-xs">VAR/EXEC をコピー</button>
        {params.length > 0 && <button onClick={clearRows} className="btn btn--ghost btn--sm text-xs text-red-400">全クリア</button>}
      </div>

      {params.length === 0 ? (
        <p className="text-sm text-[var(--c-text-3)] text-center py-8">「行を追加」でバインド変数を設定できます</p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-[auto_1fr_1fr_1fr_1fr_auto] gap-2 items-center text-xs text-[var(--c-text-3)] px-2">
            <span>使用</span><span>変数名</span><span>型</span><span>桁数</span><span>値</span><span></span>
          </div>
          {params.map(r => {
            const def = TYPE_DEFS[r.type];
            const showLen = def?.lenMode === 'required' || def?.lenMode === 'optional';
            return (
              <div key={r.id} className="grid grid-cols-[auto_1fr_1fr_1fr_1fr_auto] gap-2 items-center px-2">
                <input type="checkbox" checked={r.use} onChange={e => updateRow(r.id, 'use', e.target.checked)} className="accent-[var(--c-accent)]" />
                <input type="text" value={r.varname} onChange={e => updateRow(r.id, 'varname', e.target.value)} placeholder={`B${r.id}`} className={inp} />
                <select value={r.type} onChange={e => updateRow(r.id, 'type', e.target.value)} className={inp}>
                  {Object.keys(TYPE_DEFS).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input type="text" value={r.length} onChange={e => updateRow(r.id, 'length', e.target.value)} placeholder={def?.defaultLen || '-'} disabled={!showLen} className={`${inp} ${!showLen ? 'opacity-40 cursor-not-allowed' : ''}`} />
                <input type="text" value={r.value} onChange={e => updateRow(r.id, 'value', e.target.value)} placeholder="値" className={inp} />
                <button onClick={() => removeRow(r.id)} className="text-[var(--c-text-3)] hover:text-red-400 text-xs">✕</button>
              </div>
            );
          })}
        </div>
      )}

      {/* プレビュー */}
      {params.some(r => r.use) && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold text-[var(--c-text-2)]">生成テキスト</h3>
          <pre className="text-xs font-mono bg-[var(--c-bg-2)] border border-[var(--c-border)] rounded-lg p-3 whitespace-pre overflow-x-auto text-[var(--c-text)]">
            {buildText()}
          </pre>
        </div>
      )}
    </div>
  );
}

// ================================================================
// チューニングガイドタブ
// ================================================================
function TuneTab() {
  const [tuneTab, setTuneTab]     = useState(() => localStorage.getItem(STORAGE_TUNE_TAB) || 'all');
  const [tuneSearch, setTuneSearch] = useState('');
  const [openCats, setOpenCats]   = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_TUNE_GROUPS) || '{}'); } catch { return {}; }
  });
  const [planInput, setPlanInput] = useState('');
  const [analyzeResult, setAnalyzeResult] = useState<{ op: string; name: string; count: number; tuneItem?: TuneItem }[]>([]);
  const [showAnalyze, setShowAnalyze] = useState(false);
  const { error: showError } = useToast();

  const toggleCat = (cat: string) => {
    setOpenCats(prev => {
      const next = { ...prev, [cat]: !prev[cat] };
      localStorage.setItem(STORAGE_TUNE_GROUPS, JSON.stringify(next));
      return next;
    });
  };
  const isOpen = (cat: string) => openCats[cat] !== false;

  const switchTab = (tab: string) => {
    setTuneTab(tab);
    localStorage.setItem(STORAGE_TUNE_TAB, tab);
  };

  const q = tuneSearch.toLowerCase();
  const filteredItems = useMemo(() => {
    return TUNE_ITEMS.filter(item => {
      if (tuneTab !== 'all' && item.category !== tuneTab) return false;
      if (!q) return true;
      return item.op.toLowerCase().includes(q) || item.desc.includes(q);
    });
  }, [tuneTab, q]);

  const grouped = useMemo(() => {
    const map = new Map<string, TuneItem[]>();
    for (const cat of TUNE_CATEGORIES) map.set(cat, []);
    for (const item of filteredItems) {
      const arr = map.get(item.category);
      if (arr) arr.push(item);
    }
    return map;
  }, [filteredItems]);

  // 実行計画解析
  const analyzePlan = () => {
    if (!planInput.trim()) { showError('実行計画を入力してください'); return; }
    const lines = planInput.split('\n');
    let opColIdx = 2, nameColIdx = 3;
    for (const line of lines) {
      if (/\|\s*Id/i.test(line) && /Operation/i.test(line)) {
        const parts = line.split('|');
        const oi = parts.findIndex(p => /^\s*Operation\s*$/i.test(p));
        const ni = parts.findIndex(p => /^\s*Name\s*$/i.test(p));
        if (oi >= 1) opColIdx = oi;
        if (ni >= 1) nameColIdx = ni;
        break;
      }
    }
    const opMap = new Map<string, { op: string; names: Set<string>; count: number }>();
    for (const line of lines) {
      if (!line.includes('|') || /Operation/i.test(line) || /^[\s|\-+]+$/.test(line)) continue;
      const parts = line.split('|');
      if (opColIdx >= parts.length) continue;
      const op = parts[opColIdx].trim();
      if (!op || op.length <= 1) continue;
      const name = nameColIdx < parts.length ? parts[nameColIdx].trim() : '';
      const key  = op.toUpperCase();
      if (!opMap.has(key)) opMap.set(key, { op, names: new Set(), count: 0 });
      const entry = opMap.get(key)!;
      entry.count++;
      if (name) entry.names.add(name);
    }
    const results = [];
    for (const [, entry] of opMap) {
      const tuneItem = TUNE_ITEMS.find(t => t.op.toUpperCase() === entry.op.toUpperCase());
      for (const name of (entry.names.size ? entry.names : [''])) {
        results.push({ op: entry.op, name, count: entry.count, tuneItem });
      }
    }
    setAnalyzeResult(results);
  };

  const tabs = [{ id: 'all', label: 'すべて' }, ...TUNE_CATEGORIES.map(c => ({ id: c, label: c }))];

  return (
    <div className="flex flex-col gap-4">
      {/* タブ + 検索 */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1">
          {tabs.map(t => {
            const cnt = t.id === 'all' ? TUNE_ITEMS.length : TUNE_ITEMS.filter(i => i.category === t.id).length;
            return (
              <button key={t.id} onClick={() => switchTab(t.id)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${tuneTab === t.id ? 'bg-[var(--c-accent)] text-white border-[var(--c-accent)]' : 'border-[var(--c-border)] text-[var(--c-text-2)] hover:border-[var(--c-accent)]'}`}>
                {t.label} <span className="opacity-70">{cnt}</span>
              </button>
            );
          })}
        </div>
        <input type="text" value={tuneSearch} onChange={e => setTuneSearch(e.target.value)} placeholder="操作名・説明で検索…"
          className="flex-1 min-w-32 px-3 py-1.5 text-sm rounded-lg border border-[var(--c-border)] bg-[var(--c-bg-2)] text-[var(--c-text)] focus:outline-none focus:border-[var(--c-accent)]" />
        <button onClick={() => setShowAnalyze(!showAnalyze)}
          className={`btn btn--ghost btn--sm text-xs ${showAnalyze ? 'border-[var(--c-accent)] text-[var(--c-accent)]' : ''}`}>
          実行計画を解析
        </button>
      </div>

      {/* 実行計画解析パネル */}
      {showAnalyze && (
        <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-bg-2)] p-4 flex flex-col gap-3">
          <textarea value={planInput} onChange={e => setPlanInput(e.target.value)} placeholder="DBMS_XPLAN / AUTOTRACE の出力を貼り付けてください"
            className="w-full h-32 px-3 py-2 text-xs font-mono rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-text)] resize-y focus:outline-none focus:border-[var(--c-accent)]" />
          <div className="flex gap-2">
            <button onClick={analyzePlan} className="btn btn--primary btn--sm text-xs">解析</button>
            <button onClick={() => { setPlanInput(''); setAnalyzeResult([]); }} className="btn btn--ghost btn--sm text-xs">クリア</button>
          </div>
          {analyzeResult.length > 0 && (
            <div className="flex flex-col gap-2">
              {analyzeResult.map((r, i) => (
                <div key={i} className={`rounded-lg border-l-4 p-3 bg-[var(--c-bg)] ${LEVEL_CARD[r.tuneItem?.level || 'low'] || 'border-l-gray-500/50'}`}>
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-xs font-bold">{r.op}</code>
                    {r.name && <span className="text-xs text-[var(--c-text-3)]">({r.name})</span>}
                    {r.count > 1 && <span className="text-xs text-[var(--c-text-3)]">×{r.count}</span>}
                    {r.tuneItem && (
                      <span className={`text-xs px-1.5 py-0.5 rounded ${LEVEL_STYLES[r.tuneItem.level]}`}>
                        {LEVEL_LABELS[r.tuneItem.level]}
                      </span>
                    )}
                  </div>
                  {r.tuneItem && <p className="text-xs text-[var(--c-text-2)] mt-1">{r.tuneItem.desc}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* アイテムグリッド */}
      {tuneTab === 'all' ? (
        TUNE_CATEGORIES.map(cat => {
          const items = grouped.get(cat) || [];
          if (items.length === 0) return null;
          return (
            <div key={cat} className="flex flex-col gap-2">
              <button onClick={() => toggleCat(cat)}
                className="flex items-center gap-2 text-sm font-semibold text-left text-[var(--c-text-2)] hover:text-[var(--c-text)] transition-colors">
                <span className={`text-xs transition-transform ${isOpen(cat) ? 'rotate-90' : ''}`}>▶</span>
                {cat}
                <span className="text-xs text-[var(--c-text-3)]">{items.length}</span>
              </button>
              {isOpen(cat) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {items.map(item => <TuneCard key={item.op} item={item} />)}
                </div>
              )}
            </div>
          );
        })
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {filteredItems.map(item => <TuneCard key={item.op} item={item} />)}
        </div>
      )}
      {filteredItems.length === 0 && (
        <p className="text-center text-sm text-[var(--c-text-3)] py-8">該当するアイテムが見つかりません</p>
      )}
    </div>
  );
}

function TuneCard({ item }: { item: TuneItem }) {
  return (
    <div className={`rounded-lg border border-[var(--c-border)] border-l-4 p-3 bg-[var(--c-bg-2)] ${LEVEL_CARD[item.level]}`}>
      <div className="flex items-start gap-2 flex-wrap">
        <code className="font-mono text-xs font-bold text-[var(--c-text)] break-all">{item.op}</code>
        <div className="flex gap-1 ml-auto shrink-0">
          <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--c-bg-3)] text-[var(--c-text-3)]">{item.category}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded ${LEVEL_STYLES[item.level]}`}>{LEVEL_LABELS[item.level]}</span>
        </div>
      </div>
      <p className="text-xs text-[var(--c-text-2)] mt-2 leading-relaxed">{item.desc}</p>
    </div>
  );
}

// ================================================================
// テーブル定義メモタブ
// ================================================================
function MemoTab() {
  const { success, error: showError } = useToast();
  const [memos, setMemos]       = useState<TableMemo[]>([]);
  const [selectedId, setSelected] = useState<number | null>(null);
  const [editingMemo, setEditing] = useState<TableMemo | null>(null);
  const [showForm, setShowForm]   = useState(false);

  useEffect(() => { sqlDB.getAllTableMemos().then(setMemos); }, []);

  const selected = useMemo(() => memos.find(m => m.id === selectedId) ?? null, [memos, selectedId]);

  const openAdd = () => {
    setEditing({ id: undefined, schema_name: '', table_name: '', comment: '', columns: [], indexes: [], memo: '', created_at: '', updated_at: '' });
    setShowForm(true);
  };
  const openEdit = (m: TableMemo) => { setEditing({ ...m, columns: m.columns || [], indexes: m.indexes || [] }); setShowForm(true); };
  const cancelEdit = () => { setEditing(null); setShowForm(false); };

  const saveMemo = async () => {
    if (!editingMemo) return;
    if (!editingMemo.table_name.trim()) { showError('テーブル名を入力してください'); return; }
    if (editingMemo.id !== undefined) {
      await sqlDB.updateTableMemo(editingMemo.id, editingMemo);
    } else {
      await sqlDB.addTableMemo(editingMemo);
    }
    const all = await sqlDB.getAllTableMemos();
    setMemos(all);
    cancelEdit();
    success('保存しました');
  };

  const deleteMemo = async (m: TableMemo) => {
    if (!confirm(`「${m.table_name}」を削除しますか？`)) return;
    await sqlDB.deleteTableMemo(m.id!);
    setMemos(prev => prev.filter(x => x.id !== m.id));
    if (selectedId === m.id) setSelected(null);
    success('削除しました');
  };

  const updateEditing = (field: keyof TableMemo, value: unknown) => {
    setEditing(prev => prev ? { ...prev, [field]: value } : prev);
  };

  const addCol = () => updateEditing('columns', [...(editingMemo?.columns || []), { name: '', type: '', nullable: true, pk: false, comment: '' }]);
  const removeCol = (i: number) => updateEditing('columns', editingMemo?.columns.filter((_, j) => j !== i) || []);
  const updateCol = (i: number, f: keyof TableColumn, v: string | boolean) =>
    updateEditing('columns', editingMemo?.columns.map((c, j) => j === i ? { ...c, [f]: v } : c) || []);

  const addIdx = () => updateEditing('indexes', [...(editingMemo?.indexes || []), { name: '', unique: false, cols: [], comment: '' }]);
  const removeIdx = (i: number) => updateEditing('indexes', editingMemo?.indexes.filter((_, j) => j !== i) || []);
  const updateIdx = (i: number, f: keyof TableIndex, v: string | boolean | string[]) =>
    updateEditing('indexes', editingMemo?.indexes.map((x, j) => j === i ? { ...x, [f]: v } : x) || []);

  const inp = "px-2 py-1.5 text-xs rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-text)] focus:outline-none focus:border-[var(--c-accent)]";

  return (
    <div className="flex gap-4 h-full">
      {/* 一覧 */}
      <div className="w-64 flex flex-col shrink-0 border-r border-[var(--c-border)]">
        <div className="p-3 border-b border-[var(--c-border)] flex items-center justify-between">
          <span className="text-xs text-[var(--c-text-3)]">{memos.length} 件</span>
          <button onClick={openAdd} className="btn btn--ghost btn--sm text-xs">+ 追加</button>
        </div>
        <div className="flex-1 overflow-auto">
          {memos.length === 0 ? (
            <p className="p-4 text-center text-sm text-[var(--c-text-3)]">テーブル定義がありません</p>
          ) : (
            memos.map(m => (
              <div key={m.id} onClick={() => setSelected(m.id!)}
                className={`px-3 py-2.5 cursor-pointer border-b border-[var(--c-border)] transition-colors ${selectedId === m.id ? 'bg-[var(--c-accent)]/10 border-l-2 border-l-[var(--c-accent)]' : 'hover:bg-[var(--c-bg-2)]'}`}>
                <div className="font-mono text-xs font-medium">{m.schema_name ? `${m.schema_name}.${m.table_name}` : m.table_name}</div>
                {m.comment && <div className="text-xs text-[var(--c-text-2)] truncate">{m.comment}</div>}
                <div className="text-[10px] text-[var(--c-text-3)]">{m.columns.length} 列</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 詳細 or フォーム */}
      <div className="flex-1 overflow-auto">
        {showForm && editingMemo ? (
          <div className="flex flex-col gap-4 p-1">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">{editingMemo.id !== undefined ? '編集' : '新規追加'}</h3>
              <div className="flex gap-2">
                <button onClick={saveMemo} className="btn btn--primary btn--sm text-xs">保存</button>
                <button onClick={cancelEdit} className="btn btn--ghost btn--sm text-xs">キャンセル</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1"><label className="text-xs text-[var(--c-text-3)]">スキーマ名</label><input type="text" value={editingMemo.schema_name} onChange={e => updateEditing('schema_name', e.target.value)} className={inp} /></div>
              <div className="flex flex-col gap-1"><label className="text-xs text-[var(--c-text-3)]">テーブル名 *</label><input type="text" value={editingMemo.table_name} onChange={e => updateEditing('table_name', e.target.value)} className={inp} /></div>
              <div className="col-span-2 flex flex-col gap-1"><label className="text-xs text-[var(--c-text-3)]">テーブルコメント</label><input type="text" value={editingMemo.comment} onChange={e => updateEditing('comment', e.target.value)} className={inp} /></div>
            </div>

            {/* カラム */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-[var(--c-text-2)]">カラム定義</h4>
                <button onClick={addCol} className="btn btn--ghost btn--sm text-xs">+ 追加</button>
              </div>
              {(editingMemo.columns || []).map((col, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto_auto_1fr_auto] gap-1.5 mb-1.5 items-center">
                  <input type="text" value={col.name} onChange={e => updateCol(i, 'name', e.target.value)} placeholder="列名" className={inp} />
                  <input type="text" value={col.type} onChange={e => updateCol(i, 'type', e.target.value)} placeholder="型" className={inp} />
                  <label className="flex items-center gap-1 text-xs cursor-pointer whitespace-nowrap"><input type="checkbox" checked={!col.nullable} onChange={e => updateCol(i, 'nullable', !e.target.checked)} className="accent-[var(--c-accent)]" />NN</label>
                  <label className="flex items-center gap-1 text-xs cursor-pointer whitespace-nowrap"><input type="checkbox" checked={col.pk} onChange={e => updateCol(i, 'pk', e.target.checked)} className="accent-[var(--c-accent)]" />PK</label>
                  <input type="text" value={col.comment} onChange={e => updateCol(i, 'comment', e.target.value)} placeholder="コメント" className={inp} />
                  <button onClick={() => removeCol(i)} className="text-[var(--c-text-3)] hover:text-red-400 text-xs">✕</button>
                </div>
              ))}
            </div>

            {/* インデックス */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-[var(--c-text-2)]">インデックス</h4>
                <button onClick={addIdx} className="btn btn--ghost btn--sm text-xs">+ 追加</button>
              </div>
              {(editingMemo.indexes || []).map((idx, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto_1fr_1fr_auto] gap-1.5 mb-1.5 items-center">
                  <input type="text" value={idx.name} onChange={e => updateIdx(i, 'name', e.target.value)} placeholder="インデックス名" className={inp} />
                  <label className="flex items-center gap-1 text-xs cursor-pointer whitespace-nowrap"><input type="checkbox" checked={idx.unique} onChange={e => updateIdx(i, 'unique', e.target.checked)} className="accent-[var(--c-accent)]" />UQ</label>
                  <input type="text" value={idx.cols.join(', ')} onChange={e => updateIdx(i, 'cols', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} placeholder="列名(カンマ区切り)" className={inp} />
                  <input type="text" value={idx.comment} onChange={e => updateIdx(i, 'comment', e.target.value)} placeholder="コメント" className={inp} />
                  <button onClick={() => removeIdx(i)} className="text-[var(--c-text-3)] hover:text-red-400 text-xs">✕</button>
                </div>
              ))}
            </div>

            {/* メモ */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[var(--c-text-3)]">メモ</label>
              <textarea value={editingMemo.memo} onChange={e => updateEditing('memo', e.target.value)} rows={3}
                className="px-3 py-2 text-xs rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-text)] resize-y focus:outline-none focus:border-[var(--c-accent)]" />
            </div>
          </div>
        ) : selected ? (
          <div className="flex flex-col gap-4 p-1">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-mono font-bold">{selected.schema_name ? `${selected.schema_name}.${selected.table_name}` : selected.table_name}</h2>
                {selected.comment && <p className="text-sm text-[var(--c-text-2)]">{selected.comment}</p>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => openEdit(selected)} className="btn btn--ghost btn--sm text-xs">編集</button>
                <button onClick={() => deleteMemo(selected)} className="btn btn--ghost btn--sm text-xs text-red-400">削除</button>
              </div>
            </div>
            {selected.columns.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-[var(--c-border)]">
                <table className="w-full text-xs">
                  <thead><tr className="bg-[var(--c-bg-2)] text-[var(--c-text-2)]">
                    <th className="text-left px-3 py-2">列名</th>
                    <th className="text-left px-3 py-2">型</th>
                    <th className="text-center px-3 py-2">NN</th>
                    <th className="text-center px-3 py-2">PK</th>
                    <th className="text-left px-3 py-2">コメント</th>
                  </tr></thead>
                  <tbody className="divide-y divide-[var(--c-border)]">
                    {selected.columns.map((col, i) => (
                      <tr key={i} className="hover:bg-[var(--c-bg-2)]">
                        <td className="px-3 py-1.5 font-mono font-medium">{col.name}</td>
                        <td className="px-3 py-1.5 font-mono text-[var(--c-text-2)]">{col.type}</td>
                        <td className="px-3 py-1.5 text-center">{!col.nullable ? '●' : ''}</td>
                        <td className="px-3 py-1.5 text-center text-[var(--c-accent)]">{col.pk ? '●' : ''}</td>
                        <td className="px-3 py-1.5 text-[var(--c-text-2)]">{col.comment}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {selected.memo && (
              <div className="rounded-lg border border-[var(--c-border)] p-3 text-sm text-[var(--c-text-2)] whitespace-pre-wrap">{selected.memo}</div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-[var(--c-text-3)] text-sm gap-3">
            <p>左のリストからテーブル定義を選択してください</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ================================================================
// SqlPage メイン
// ================================================================
const TABS: { id: SqlTab; label: string }[] = [
  { id: 'env',  label: '接続環境'       },
  { id: 'bind', label: 'バインド変数'   },
  { id: 'tune', label: 'チューニングガイド' },
  { id: 'memo', label: 'テーブル定義メモ' },
];

export function SqlPage() {
  const [activeTab, setActiveTab] = useState<SqlTab>(
    () => (localStorage.getItem(STORAGE_TAB) as SqlTab) || 'env'
  );
  const switchTab = (t: SqlTab) => { setActiveTab(t); localStorage.setItem(STORAGE_TAB, t); };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* タブバー */}
      <div className="flex gap-1 px-4 pt-3 border-b border-[var(--c-border)] bg-[var(--c-bg)] shrink-0">
        {TABS.map(t => (
          <button key={t.id} onClick={() => switchTab(t.id)}
            className={`px-4 py-2 text-sm rounded-t transition-colors border-b-2 ${
              activeTab === t.id
                ? 'border-[var(--c-accent)] text-[var(--c-accent)] bg-[var(--c-bg-2)]'
                : 'border-transparent text-[var(--c-text-2)] hover:text-[var(--c-text)] hover:bg-[var(--c-bg-2)]'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* コンテンツ */}
      <div className={`flex-1 overflow-auto ${activeTab === 'memo' ? '' : 'p-4'}`}>
        {activeTab === 'env'  && <EnvTab />}
        {activeTab === 'bind' && <BindTab />}
        {activeTab === 'tune' && <TuneTab />}
        {activeTab === 'memo' && <div className="h-full p-4"><MemoTab /></div>}
      </div>
    </div>
  );
}
