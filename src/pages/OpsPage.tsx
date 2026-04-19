// ==================================================
// OpsPage — 運用インフラツール（React 移行版）
// ==================================================
// セクション: log-viewer | cron | http-status | ports
// ==================================================

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useToast } from '../components/Toast';
import { opsDB, type OpsPort, type PortProtocol } from '../db/ops_db';

// ── ストレージキー ─────────────────────────────────
const STORAGE_ACTIVE_SECTION = 'ops_active_section';
const STORAGE_CRON_TZ        = 'ops_cron_tz';
const STORAGE_PORTS_FILTER   = 'ops_ports_filter';
const STORAGE_HTTP_STAR_ONLY = 'ops_http_star_only';
const STORAGE_HTTP_OPEN_CATS = 'ops_http_open_cats';

type Section = 'log-viewer' | 'cron' | 'http-status' | 'ports';

// ================================================================
// 定数
// ================================================================

const LOG_LEVEL_PATTERNS = [
  { level: 'ERROR', regex: /\b(ERROR|FATAL|SEVERE|CRITICAL)\b/i, color: 'error' },
  { level: 'WARN',  regex: /\b(WARN|WARNING)\b/i,                color: 'warn'  },
  { level: 'INFO',  regex: /\b(INFO|NOTICE)\b/i,                 color: 'info'  },
  { level: 'DEBUG', regex: /\b(DEBUG|TRACE|FINE|FINER|FINEST)\b/i, color: 'debug' },
] as const;

const TIMESTAMP_PATTERNS = [
  /\d{4}[-/]\d{2}[-/]\d{2}[T ]\d{2}:\d{2}:\d{2}/,
  /\d{2}[-/]\d{2}[-/]\d{4} \d{2}:\d{2}:\d{2}/,
  /\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}/,
  /\d{2}:\d{2}:\d{2}[.,]\d{3}/,
];

const DOW_JA = ['日','月','火','水','木','金','土'];

const STATUS_CATEGORIES = [
  { prefix: '1xx', label: 'Informational', colorClass: 'text-blue-400',  desc: '情報レスポンス' },
  { prefix: '2xx', label: 'Success',       colorClass: 'text-green-400', desc: '成功レスポンス' },
  { prefix: '3xx', label: 'Redirection',   colorClass: 'text-yellow-400',desc: 'リダイレクト'   },
  { prefix: '4xx', label: 'Client Error',  colorClass: 'text-red-400',   desc: 'クライアントエラー' },
  { prefix: '5xx', label: 'Server Error',  colorClass: 'text-red-500',   desc: 'サーバエラー'   },
] as const;

interface HttpStatusEntry {
  code: number; name: string; category: string;
  description: string; cause: string; solution: string;
  starred?: boolean;
}
const HTTP_STATUS_CODES: HttpStatusEntry[] = [
  { code: 100, name: 'Continue',             category: '1xx', description: 'リクエストの継続を許可', cause: 'クライアントがリクエスト継続の確認を求めた', solution: '残りのリクエストを送信する' },
  { code: 101, name: 'Switching Protocols',  category: '1xx', description: 'プロトコルを切り替える', cause: 'Upgrade ヘッダーで別プロトコルへの切替をリクエスト', solution: 'WebSocket 接続などで正常' },
  { code: 102, name: 'Processing',           category: '1xx', description: 'サーバが処理中', cause: 'WebDAV リクエストなど長時間処理', solution: '完了を待つ' },
  { code: 103, name: 'Early Hints',          category: '1xx', description: 'プリロードヒントを返す', cause: 'Link ヘッダーを先送りしてブラウザに事前ロードさせる', solution: 'パフォーマンス最適化として正常' },
  { code: 200, name: 'OK',                   category: '2xx', description: 'リクエスト成功', cause: '正常に処理された', solution: '特に対処不要', starred: true },
  { code: 201, name: 'Created',              category: '2xx', description: 'リソース作成成功', cause: 'POST/PUT でリソースが新規作成された', solution: 'Location ヘッダーで新リソース URL を確認' },
  { code: 202, name: 'Accepted',             category: '2xx', description: '受付済み（処理未完了）', cause: '非同期処理のキューに追加された', solution: '別途完了通知を待つ' },
  { code: 204, name: 'No Content',           category: '2xx', description: '成功・レスポンスボディなし', cause: 'DELETE や一部 PUT で正常', solution: '特に対処不要' },
  { code: 206, name: 'Partial Content',      category: '2xx', description: '部分コンテンツ', cause: 'Range ヘッダーで一部リクエストした', solution: '分割ダウンロード・動画ストリーミングで正常' },
  { code: 301, name: 'Moved Permanently',    category: '3xx', description: '恒久リダイレクト', cause: 'URL が永続的に変更された', solution: 'Location ヘッダーの URL に更新する', starred: true },
  { code: 302, name: 'Found',                category: '3xx', description: '一時リダイレクト', cause: 'URL が一時的に変更された', solution: 'Location ヘッダーの URL にアクセス（元 URL は維持）', starred: true },
  { code: 303, name: 'See Other',            category: '3xx', description: 'GET でリダイレクト', cause: 'POST 後の結果を GET で取得する', solution: 'PRG パターンとして正常' },
  { code: 304, name: 'Not Modified',         category: '3xx', description: 'キャッシュ有効', cause: '条件付きGETでキャッシュが最新', solution: 'キャッシュを使用する（正常）' },
  { code: 307, name: 'Temporary Redirect',   category: '3xx', description: '一時リダイレクト（メソッド維持）', cause: 'POST など元のメソッドを維持したリダイレクト', solution: 'Location ヘッダーの URL に同じメソッドでアクセス' },
  { code: 308, name: 'Permanent Redirect',   category: '3xx', description: '恒久リダイレクト（メソッド維持）', cause: 'メソッドを維持したまま永続的に移動', solution: 'Location ヘッダーの URL に更新する' },
  { code: 400, name: 'Bad Request',          category: '4xx', description: '不正なリクエスト', cause: 'リクエスト構文・パラメータが不正', solution: 'リクエスト内容を修正する', starred: true },
  { code: 401, name: 'Unauthorized',         category: '4xx', description: '認証が必要', cause: '認証情報がない・無効', solution: 'ログイン・トークン取得を行う', starred: true },
  { code: 403, name: 'Forbidden',            category: '4xx', description: 'アクセス禁止', cause: '認証済みでもリソースへのアクセス権限がない', solution: '権限設定を確認する', starred: true },
  { code: 404, name: 'Not Found',            category: '4xx', description: 'リソースが見つからない', cause: 'URL が誤っている・リソースが削除された', solution: 'URL を確認する', starred: true },
  { code: 405, name: 'Method Not Allowed',   category: '4xx', description: '許可されていない HTTP メソッド', cause: 'GET のみ許可の URL に POST した等', solution: 'Allow ヘッダーで許可メソッドを確認' },
  { code: 408, name: 'Request Timeout',      category: '4xx', description: 'リクエストタイムアウト', cause: 'クライアントがリクエスト送信に時間がかかりすぎた', solution: '再試行する・ネットワークを確認' },
  { code: 409, name: 'Conflict',             category: '4xx', description: 'リソースの競合', cause: 'リソースの現在の状態と矛盾するリクエスト', solution: '最新状態を取得して再試行' },
  { code: 413, name: 'Content Too Large',    category: '4xx', description: 'リクエストサイズ超過', cause: 'ファイルサイズやリクエストボディが上限を超えた', solution: 'ファイルサイズを縮小・サーバの上限を引き上げる' },
  { code: 414, name: 'URI Too Long',         category: '4xx', description: 'URL が長すぎる', cause: 'GET パラメータが多すぎる', solution: 'POST に変更するか URL を短くする' },
  { code: 415, name: 'Unsupported Media Type', category: '4xx', description: 'サポート外のメディアタイプ', cause: 'Content-Type が不正', solution: 'Content-Type ヘッダーを修正する' },
  { code: 422, name: 'Unprocessable Entity', category: '4xx', description: '処理不可能なエンティティ', cause: 'バリデーションエラー（形式は正しいが内容が不正）', solution: 'リクエストボディの値を修正する' },
  { code: 429, name: 'Too Many Requests',    category: '4xx', description: 'レートリミット超過', cause: 'API 呼び出し回数が制限を超えた', solution: 'Retry-After ヘッダーを確認して待機する' },
  { code: 451, name: 'Unavailable For Legal Reasons', category: '4xx', description: '法的理由によりアクセス不可', cause: '法的規制・著作権・地域制限', solution: '法的手続きを確認する' },
  { code: 500, name: 'Internal Server Error', category: '5xx', description: 'サーバ内部エラー', cause: 'サーバ側でエラーが発生した', solution: 'サーバログを確認する', starred: true },
  { code: 501, name: 'Not Implemented',      category: '5xx', description: '未実装のメソッド', cause: 'サーバが要求されたメソッドをサポートしていない', solution: '対応するメソッドを使用する' },
  { code: 502, name: 'Bad Gateway',          category: '5xx', description: 'ゲートウェイエラー', cause: 'プロキシ・ロードバランサが上流サーバから不正な応答を受けた', solution: '上流サーバを確認する', starred: true },
  { code: 503, name: 'Service Unavailable',  category: '5xx', description: 'サービス利用不可', cause: 'サーバの過負荷・メンテナンス中', solution: 'Retry-After ヘッダーを確認して待機する', starred: true },
  { code: 504, name: 'Gateway Timeout',      category: '5xx', description: 'ゲートウェイタイムアウト', cause: 'プロキシが上流サーバからのレスポンスをタイムアウト', solution: '上流サーバの応答時間を確認する' },
  { code: 507, name: 'Insufficient Storage', category: '5xx', description: 'ストレージ不足', cause: 'サーバのディスクが満杯', solution: 'ディスクを確保する' },
];

interface BuiltinPort {
  port: number; protocol: PortProtocol; service: string; memo: string; isBuiltIn: true;
}
const BUILTIN_PORTS: BuiltinPort[] = [
  { port: 20,    protocol: 'TCP',  service: 'FTP (データ)',        memo: 'ファイル転送（データ接続）',     isBuiltIn: true },
  { port: 21,    protocol: 'TCP',  service: 'FTP',                memo: 'ファイル転送（制御接続）',       isBuiltIn: true },
  { port: 22,    protocol: 'TCP',  service: 'SSH',                memo: 'セキュアシェル',                isBuiltIn: true },
  { port: 23,    protocol: 'TCP',  service: 'Telnet',             memo: 'リモート接続（非暗号化）',       isBuiltIn: true },
  { port: 25,    protocol: 'TCP',  service: 'SMTP',               memo: 'メール送信',                    isBuiltIn: true },
  { port: 53,    protocol: 'both', service: 'DNS',                memo: '名前解決',                      isBuiltIn: true },
  { port: 67,    protocol: 'UDP',  service: 'DHCP (サーバ)',       memo: 'IPアドレス自動割当',             isBuiltIn: true },
  { port: 68,    protocol: 'UDP',  service: 'DHCP (クライアント)', memo: 'IPアドレス自動取得',             isBuiltIn: true },
  { port: 80,    protocol: 'TCP',  service: 'HTTP',               memo: 'Webサーバ',                     isBuiltIn: true },
  { port: 110,   protocol: 'TCP',  service: 'POP3',               memo: 'メール受信',                    isBuiltIn: true },
  { port: 143,   protocol: 'TCP',  service: 'IMAP',               memo: 'メール受信（サーバ管理）',       isBuiltIn: true },
  { port: 443,   protocol: 'TCP',  service: 'HTTPS',              memo: 'Web（TLS/SSL）',                isBuiltIn: true },
  { port: 445,   protocol: 'TCP',  service: 'SMB',                memo: 'ファイル共有（Windows）',        isBuiltIn: true },
  { port: 465,   protocol: 'TCP',  service: 'SMTPS',              memo: 'メール送信（SSL）',              isBuiltIn: true },
  { port: 514,   protocol: 'UDP',  service: 'Syslog',             memo: 'ログ転送',                      isBuiltIn: true },
  { port: 587,   protocol: 'TCP',  service: 'SMTP (Submission)',  memo: 'メール送信（認証付き）',         isBuiltIn: true },
  { port: 993,   protocol: 'TCP',  service: 'IMAPS',              memo: 'IMAP over SSL',                 isBuiltIn: true },
  { port: 995,   protocol: 'TCP',  service: 'POP3S',              memo: 'POP3 over SSL',                 isBuiltIn: true },
  { port: 1433,  protocol: 'TCP',  service: 'SQL Server',         memo: 'Microsoft SQL Server',          isBuiltIn: true },
  { port: 1521,  protocol: 'TCP',  service: 'Oracle DB',          memo: 'Oracle Database リスナー',       isBuiltIn: true },
  { port: 3000,  protocol: 'TCP',  service: 'Dev Server',         memo: '開発サーバ（Node.js 等）',       isBuiltIn: true },
  { port: 3306,  protocol: 'TCP',  service: 'MySQL',              memo: 'MySQL / MariaDB',               isBuiltIn: true },
  { port: 3389,  protocol: 'TCP',  service: 'RDP',                memo: 'リモートデスクトップ',           isBuiltIn: true },
  { port: 5432,  protocol: 'TCP',  service: 'PostgreSQL',         memo: 'PostgreSQL',                    isBuiltIn: true },
  { port: 5672,  protocol: 'TCP',  service: 'RabbitMQ',           memo: 'メッセージキュー（AMQP）',       isBuiltIn: true },
  { port: 6379,  protocol: 'TCP',  service: 'Redis',              memo: 'インメモリ KVS',                 isBuiltIn: true },
  { port: 8080,  protocol: 'TCP',  service: 'Tomcat / Proxy',     memo: 'HTTP プロキシ / AP サーバ',      isBuiltIn: true },
  { port: 8443,  protocol: 'TCP',  service: 'HTTPS (Alt)',        memo: 'HTTPS 代替ポート',              isBuiltIn: true },
  { port: 9090,  protocol: 'TCP',  service: 'Prometheus',         memo: '監視ツール',                    isBuiltIn: true },
  { port: 9200,  protocol: 'TCP',  service: 'Elasticsearch',      memo: '検索エンジン（REST API）',      isBuiltIn: true },
  { port: 27017, protocol: 'TCP',  service: 'MongoDB',            memo: 'ドキュメント DB',                isBuiltIn: true },
];

// ================================================================
// cron ユーティリティ
// ================================================================

function parseCronField(field: string, min: number, max: number): Set<number> {
  const values = new Set<number>();
  for (const part of field.split(',')) {
    if (part === '*') {
      for (let i = min; i <= max; i++) values.add(i);
    } else if (part.includes('/')) {
      const [range, step] = part.split('/');
      const s = parseInt(step, 10);
      if (isNaN(s) || s <= 0) throw new Error(`不正なステップ: ${part}`);
      const start = range === '*' ? min : parseInt(range, 10);
      for (let i = start; i <= max; i += s) values.add(i);
    } else if (part.includes('-')) {
      const [lo, hi] = part.split('-').map(Number);
      for (let i = lo; i <= hi; i++) values.add(i);
    } else {
      const n = parseInt(part, 10);
      if (isNaN(n)) throw new Error(`不正な値: ${part}`);
      values.add(n);
    }
  }
  for (const v of values) {
    if (v < min || v > max) throw new Error(`範囲外の値: ${v}（${min}-${max}）`);
  }
  return values;
}

function parseCron(expr: string) {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error('cron 式は 5 フィールドで入力してください（例: 0 9 * * *）');
  const [minF, hourF, dayF, monthF, dowF] = parts;
  return {
    min:   parseCronField(minF,   0, 59),
    hour:  parseCronField(hourF,  0, 23),
    day:   parseCronField(dayF,   1, 31),
    month: parseCronField(monthF, 1, 12),
    dow:   parseCronField(dowF,   0, 6),
  };
}

function getNextExecutions(expr: string, count: number, fromDate: Date, tzOffsetHours: number): Date[] {
  const { min, hour, day, month, dow } = parseCron(expr);
  const results: Date[] = [];
  const tzMs = tzOffsetHours * 3600000;
  let fakeMs = Math.floor((fromDate.getTime() + tzMs) / 60000) * 60000 + 60000;
  const limitMs = fakeMs + 2 * 365 * 24 * 3600000;

  while (fakeMs < limitMs && results.length < count) {
    const d  = new Date(fakeMs);
    const mo = d.getUTCMonth() + 1;
    const dy = d.getUTCDate();
    const dw = d.getUTCDay();
    const h  = d.getUTCHours();
    const mn = d.getUTCMinutes();

    if (!month.has(mo)) { fakeMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); continue; }
    if (!day.has(dy) || !dow.has(dw)) { fakeMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1); continue; }
    if (!hour.has(h)) { fakeMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours() + 1); continue; }
    if (!min.has(mn)) { fakeMs += 60000; continue; }

    results.push(new Date(fakeMs - tzMs));
    fakeMs += 60000;
  }
  return results;
}

function formatInTz(date: Date, tzOffsetHours: number, tzLabel: string): string {
  const DOW_SHORT = ['日','月','火','水','木','金','土'];
  const d = new Date(date.getTime() + tzOffsetHours * 3600000);
  const dow = DOW_SHORT[d.getUTCDay()];
  const yyyy = d.getUTCFullYear();
  const mo   = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dy   = String(d.getUTCDate()).padStart(2, '0');
  const h    = String(d.getUTCHours()).padStart(2, '0');
  const mn   = String(d.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}/${mo}/${dy} (${dow}) ${h}:${mn} ${tzLabel}`;
}

function setToDesc(set: Set<number>, min: number, max: number, unit: string, names?: string[]): string {
  if (set.size === max - min + 1) return `毎${unit}`;
  const arr = [...set].sort((a, b) => a - b);
  if (arr.length > 2) {
    const step = arr[1] - arr[0];
    if (step > 1 && arr.every((v, i) => i === 0 || v - arr[i - 1] === step)) return `${step}${unit}ごと`;
  }
  return arr.map(v => names ? names[v - min] : `${v}`).join('、') + unit;
}

function describeCron(expr: string): string | null {
  try {
    const { min, hour, day, month, dow } = parseCron(expr);
    const minD  = setToDesc(min,   0, 59, '分');
    const hourD = setToDesc(hour,  0, 23, '時');
    const dayD  = setToDesc(day,   1, 31, '日');
    const monD  = setToDesc(month, 1, 12, '月', ['1','2','3','4','5','6','7','8','9','10','11','12']);
    const dowD  = setToDesc(dow,   0, 6,  '曜日', DOW_JA);

    let desc = '';
    if (monD !== '毎月') desc += monD + ' の ';
    if (dayD !== '毎日' && dowD === '毎曜日') desc += dayD + ' ';
    if (dowD !== '毎曜日') desc += DOW_JA[Math.min(...dow)] + '曜日 ';
    if (hourD === '毎時') {
      desc += `毎時 ${minD}`;
    } else if (min.size === 60) {
      desc += `${hourD} 毎分`;
    } else {
      const hArr = [...hour].sort((a, b) => a - b);
      const mArr = [...min].sort((a, b) => a - b);
      desc += hArr.map(h => mArr.map(m => `${h}:${String(m).padStart(2, '0')}`).join(' ')).join(' ');
    }
    return desc.trim() || '毎分';
  } catch {
    return null;
  }
}

// ================================================================
// ログビューア
// ================================================================

interface LogLine {
  lineNo: number;
  text: string;
  textLower: string;
  level: string;
  color: string;
  timestamp: Date | null;
}

type LogLevelFilter = Record<string, boolean>;

const LOG_ROW_HEIGHT = 24;
const LOG_OVERSCAN   = 20;

function detectLevel(text: string): { level: string; color: string } {
  for (const pat of LOG_LEVEL_PATTERNS) {
    if (pat.regex.test(text)) return { level: pat.level, color: pat.color };
  }
  return { level: 'OTHER', color: 'other' };
}

function detectTimestamp(text: string): Date | null {
  for (const pat of TIMESTAMP_PATTERNS) {
    const m = text.match(pat);
    if (m) {
      try {
        let raw = m[0];
        if (/^\w{3}\s+\d/.test(raw)) raw = `${new Date().getFullYear()} ${raw}`;
        const d = new Date(raw);
        if (!isNaN(d.getTime())) return d;
      } catch { /* パース失敗は無視 */ }
    }
  }
  return null;
}

function parseLogLines(text: string): LogLine[] {
  return text.split('\n').map((lineText, i) => {
    const { level, color } = detectLevel(lineText);
    return {
      lineNo: i + 1,
      text: lineText,
      textLower: lineText.toLowerCase(),
      level,
      color,
      timestamp: detectTimestamp(lineText),
    };
  });
}

const LEVEL_BADGE_STYLES: Record<string, string> = {
  error: 'bg-red-500/20 text-red-400 border border-red-500/40',
  warn:  'bg-yellow-500/20 text-yellow-400 border border-yellow-500/40',
  info:  'bg-blue-500/20 text-blue-400 border border-blue-500/40',
  debug: 'bg-purple-500/20 text-purple-400 border border-purple-500/40',
};

const LEVEL_LINE_STYLES: Record<string, string> = {
  error: 'bg-red-500/5 text-red-300',
  warn:  'bg-yellow-500/5 text-yellow-200',
  info:  'text-[var(--c-text)]',
  debug: 'text-[var(--c-text-3)]',
  other: 'text-[var(--c-text-2)]',
};

function LogViewer() {
  const [logText, setLogText]     = useState('');
  const [logLines, setLogLines]   = useState<LogLine[]>([]);
  const [filtered, setFiltered]   = useState<LogLine[]>([]);
  const [counts, setCounts]       = useState<Record<string, number>>({});
  const [levels, setLevels]       = useState<LogLevelFilter>({ ERROR: true, WARN: true, INFO: true, DEBUG: true, OTHER: true });
  const [textFilter, setTextFilter] = useState('');
  const [startTime, setStartTime]   = useState('');
  const [endTime, setEndTime]       = useState('');

  const [vsStart, setVsStart] = useState(0);
  const [vsEnd, setVsEnd]     = useState(50);
  const outputRef = useRef<HTMLDivElement>(null);
  const rafRef    = useRef<number | null>(null);

  // フィルタリング
  useEffect(() => {
    const needle = textFilter.toLowerCase();
    const startMs = startTime ? new Date(startTime).getTime() : null;
    const endMs   = endTime   ? new Date(endTime).getTime()   : null;
    const newCounts: Record<string, number> = { ERROR: 0, WARN: 0, INFO: 0, DEBUG: 0, OTHER: 0 };
    const result: LogLine[] = [];

    for (const line of logLines) {
      if (!levels[line.level]) continue;
      if (needle && !line.textLower.includes(needle)) continue;
      if (line.timestamp) {
        const ts = line.timestamp.getTime();
        if (startMs !== null && ts < startMs) continue;
        if (endMs   !== null && ts > endMs)   continue;
      }
      result.push(line);
      newCounts[line.level] = (newCounts[line.level] || 0) + 1;
    }
    setFiltered(result);
    setCounts(newCounts);
    // スクロールをトップに
    if (outputRef.current) outputRef.current.scrollTop = 0;
    setVsStart(0);
    setVsEnd(Math.min(50, result.length));
  }, [logLines, levels, textFilter, startTime, endTime]);

  // 仮想スクロール計算
  const recalcVs = useCallback(() => {
    const el = outputRef.current;
    if (!el) return;
    const scrollTop  = el.scrollTop;
    const viewHeight = el.clientHeight;
    const s = Math.max(0, Math.floor(scrollTop / LOG_ROW_HEIGHT) - LOG_OVERSCAN);
    const e = Math.min(filtered.length, Math.ceil((scrollTop + viewHeight) / LOG_ROW_HEIGHT) + LOG_OVERSCAN);
    setVsStart(s);
    setVsEnd(e);
  }, [filtered.length]);

  const onScroll = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      recalcVs();
      rafRef.current = null;
    });
  }, [recalcVs]);

  useEffect(() => { recalcVs(); }, [filtered, recalcVs]);

  const onInput = (text: string) => {
    setLogText(text);
    if (!text.trim()) { setLogLines([]); return; }
    setLogLines(parseLogLines(text));
  };

  const toggleLevel = (lv: string) => setLevels(prev => ({ ...prev, [lv]: !prev[lv] }));

  const hasLog = logLines.length > 0;

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* 入力エリア */}
      <textarea
        className="w-full h-36 px-3 py-2 font-mono text-xs resize-none rounded-lg border border-[var(--c-border)] bg-[var(--c-bg-2)] text-[var(--c-text)] placeholder-[var(--c-text-3)] focus:outline-none focus:border-[var(--c-accent)]"
        placeholder="ログテキストをここに貼り付けてください…"
        value={logText}
        onChange={e => onInput(e.target.value)}
      />

      {/* サマリー & フィルター */}
      {hasLog && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[var(--c-text-2)]">
            {filtered.length.toLocaleString()} / {logLines.length.toLocaleString()} 行
          </span>
          {['ERROR','WARN','INFO','DEBUG','OTHER'].map(lv => {
            const color = lv.toLowerCase();
            const cnt = counts[lv] || 0;
            return (
              <button
                key={lv}
                onClick={() => toggleLevel(lv)}
                className={`text-xs px-2 py-0.5 rounded font-mono border transition-opacity ${
                  LEVEL_BADGE_STYLES[color] || 'bg-[var(--c-bg-3)] border-[var(--c-border)] text-[var(--c-text-2)]'
                } ${!levels[lv] ? 'opacity-40' : ''}`}
              >
                {lv}: {cnt.toLocaleString()}
              </button>
            );
          })}
          <input
            type="text"
            className="ml-auto px-2 py-1 text-xs rounded border border-[var(--c-border)] bg-[var(--c-bg-2)] text-[var(--c-text)] focus:outline-none focus:border-[var(--c-accent)] w-40"
            placeholder="テキスト検索…"
            value={textFilter}
            onChange={e => setTextFilter(e.target.value)}
          />
          <input
            type="datetime-local"
            className="px-2 py-1 text-xs rounded border border-[var(--c-border)] bg-[var(--c-bg-2)] text-[var(--c-text)] focus:outline-none focus:border-[var(--c-accent)]"
            value={startTime}
            onChange={e => setStartTime(e.target.value)}
            title="開始時刻フィルター"
          />
          <span className="text-xs text-[var(--c-text-3)]">〜</span>
          <input
            type="datetime-local"
            className="px-2 py-1 text-xs rounded border border-[var(--c-border)] bg-[var(--c-bg-2)] text-[var(--c-text)] focus:outline-none focus:border-[var(--c-accent)]"
            value={endTime}
            onChange={e => setEndTime(e.target.value)}
            title="終了時刻フィルター"
          />
        </div>
      )}

      {/* 仮想スクロールログ出力 */}
      {hasLog && (
        <div
          ref={outputRef}
          onScroll={onScroll}
          className="flex-1 overflow-auto relative font-mono text-xs rounded-lg border border-[var(--c-border)] bg-[var(--c-bg-2)]"
          style={{ minHeight: 200 }}
        >
          {/* スペーサー（全体高さ確保） */}
          <div style={{ height: filtered.length * LOG_ROW_HEIGHT, position: 'relative' }}>
            {filtered.slice(vsStart, vsEnd).map((line, i) => {
              const absIdx = vsStart + i;
              const lineStyle = LEVEL_LINE_STYLES[line.color] || '';
              return (
                <div
                  key={line.lineNo}
                  className={`absolute left-0 right-0 flex items-center gap-2 px-2 ${lineStyle}`}
                  style={{ top: absIdx * LOG_ROW_HEIGHT, height: LOG_ROW_HEIGHT }}
                >
                  <span className="text-[var(--c-text-3)] w-10 text-right shrink-0 select-none">{line.lineNo}</span>
                  {line.level !== 'OTHER' && (
                    <span className={`text-[10px] px-1 py-px rounded shrink-0 ${LEVEL_BADGE_STYLES[line.color] || ''}`}>
                      {line.level}
                    </span>
                  )}
                  <span className="truncate">{line.text}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!hasLog && (
        <div className="flex-1 flex items-center justify-center text-[var(--c-text-3)] text-sm">
          ログを貼り付けると、レベル別のフィルタリングと仮想スクロール表示ができます
        </div>
      )}
    </div>
  );
}

// ================================================================
// cron エディタ
// ================================================================

type CronTz = 'UTC' | 'JST';
type MinMode  = '*' | 'step' | 'fix';
type HourMode = '*' | 'step' | 'fix';
type DayMode  = '*' | 'fix';

function CronSection() {
  const [expr, setExpr]     = useState('0 9 * * 1-5');
  const [tz, setTz]         = useState<CronTz>(() => (localStorage.getItem(STORAGE_CRON_TZ) as CronTz) || 'UTC');
  const [error, setError]   = useState<string | null>(null);
  const [desc, setDesc]     = useState<string>('');
  const [nexts, setNexts]   = useState<Date[]>([]);

  // GUI ビルダー状態
  const [minMode, setMinMode]   = useState<MinMode>('fix');
  const [minStep, setMinStep]   = useState('5');
  const [minFix, setMinFix]     = useState('0');
  const [hourMode, setHourMode] = useState<HourMode>('fix');
  const [hourStep, setHourStep] = useState('2');
  const [hourFix, setHourFix]   = useState('9');
  const [dayMode, setDayMode]   = useState<DayMode>('*');
  const [dayFix, setDayFix]     = useState('1');
  const [months, setMonths]     = useState<Set<number>>(() => new Set());
  const [dows, setDows]         = useState<Set<number>>(() => new Set([1,2,3,4,5]));
  const [monthAll, setMonthAll] = useState(true);
  const [dowAll, setDowAll]     = useState(false);

  // cron 式 → 結果を更新
  useEffect(() => {
    if (!expr.trim()) return;
    try {
      const d = describeCron(expr);
      setDesc(d || expr);
      setError(null);
      const isJst = tz === 'JST';
      const offset = isJst ? 9 : 0;
      setNexts(getNextExecutions(expr, 10, new Date(), offset));
    } catch (e) {
      setDesc('');
      setError(e instanceof Error ? e.message : String(e));
      setNexts([]);
    }
  }, [expr, tz]);

  // TZ 保存
  const handleTzChange = (newTz: CronTz) => {
    setTz(newTz);
    localStorage.setItem(STORAGE_CRON_TZ, newTz);
  };

  // GUI → expr
  const buildExprFromGui = () => {
    const minF  = minMode  === '*' ? '*' : minMode  === 'step' ? `*/${minStep}`  : minFix;
    const hourF = hourMode === '*' ? '*' : hourMode === 'step' ? `*/${hourStep}` : hourFix;
    const dayF  = dayMode  === '*' ? '*' : dayFix;
    const monthF = monthAll ? '*' : months.size ? [...months].sort((a,b)=>a-b).join(',') : '*';
    const dowF   = dowAll   ? '*' : dows.size   ? [...dows].sort((a,b)=>a-b).join(',')   : '*';
    return `${minF} ${hourF} ${dayF} ${monthF} ${dowF}`;
  };

  const applyGui = () => setExpr(buildExprFromGui());

  const toggleDow = (d: number) => {
    setDowAll(false);
    setDows(prev => { const s = new Set(prev); s.has(d) ? s.delete(d) : s.add(d); return s; });
  };
  const toggleMonth = (m: number) => {
    setMonthAll(false);
    setMonths(prev => { const s = new Set(prev); s.has(m) ? s.delete(m) : s.add(m); return s; });
  };

  const isJst = tz === 'JST';
  const mainTzOffset = isJst ? 9  : 0;
  const mainTzLabel  = isJst ? 'JST' : 'UTC';
  const subTzOffset  = isJst ? 0  : 9;
  const subTzLabel   = isJst ? 'UTC' : 'JST';

  return (
    <div className="flex flex-col gap-4">
      {/* TZ 切替 & 入力 */}
      <div className="flex items-center gap-3">
        <div className="flex gap-1 bg-[var(--c-bg-2)] rounded p-0.5 border border-[var(--c-border)]">
          {(['UTC','JST'] as CronTz[]).map(t => (
            <button
              key={t}
              onClick={() => handleTzChange(t)}
              className={`px-3 py-1 text-xs rounded transition-colors ${tz === t ? 'bg-[var(--c-accent)] text-white' : 'text-[var(--c-text-2)] hover:text-[var(--c-text)]'}`}
            >{t}</button>
          ))}
        </div>
        <input
          type="text"
          value={expr}
          onChange={e => setExpr(e.target.value)}
          className="flex-1 px-3 py-2 font-mono text-sm rounded-lg border border-[var(--c-border)] bg-[var(--c-bg-2)] text-[var(--c-text)] focus:outline-none focus:border-[var(--c-accent)]"
          placeholder="cron式（例: 0 9 * * 1-5）"
        />
      </div>

      {/* 説明 / エラー */}
      {error ? (
        <p className="text-red-400 text-sm">{error}</p>
      ) : desc ? (
        <p className="text-[var(--c-accent)] font-medium">{desc}</p>
      ) : null}

      {/* GUI ビルダー */}
      <details className="group">
        <summary className="cursor-pointer text-xs text-[var(--c-text-2)] hover:text-[var(--c-text)] select-none flex items-center gap-1">
          <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
          GUI ビルダー
        </summary>
        <div className="mt-3 p-3 rounded-lg border border-[var(--c-border)] bg-[var(--c-bg-2)] flex flex-col gap-3 text-sm">
          {/* 分 */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="w-6 text-xs text-[var(--c-text-3)]">分</span>
            {(['*','step','fix'] as MinMode[]).map(m => (
              <label key={m} className="flex items-center gap-1 text-xs cursor-pointer">
                <input type="radio" checked={minMode === m} onChange={() => setMinMode(m)} className="accent-[var(--c-accent)]" />
                <span>{m === '*' ? '毎分' : m === 'step' ? 'ステップ' : '固定'}</span>
              </label>
            ))}
            {minMode === 'step' && (
              <select value={minStep} onChange={e => setMinStep(e.target.value)} className="px-2 py-1 text-xs rounded border border-[var(--c-border)] bg-[var(--c-bg)]">
                {[1,2,3,5,10,15,20,30].map(n => <option key={n} value={n}>{n}分ごと</option>)}
              </select>
            )}
            {minMode === 'fix' && (
              <input type="number" min={0} max={59} value={minFix} onChange={e => setMinFix(e.target.value)}
                className="w-16 px-2 py-1 text-xs rounded border border-[var(--c-border)] bg-[var(--c-bg)]" />
            )}
          </div>
          {/* 時 */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="w-6 text-xs text-[var(--c-text-3)]">時</span>
            {(['*','step','fix'] as HourMode[]).map(m => (
              <label key={m} className="flex items-center gap-1 text-xs cursor-pointer">
                <input type="radio" checked={hourMode === m} onChange={() => setHourMode(m)} className="accent-[var(--c-accent)]" />
                <span>{m === '*' ? '毎時' : m === 'step' ? 'ステップ' : '固定'}</span>
              </label>
            ))}
            {hourMode === 'step' && (
              <select value={hourStep} onChange={e => setHourStep(e.target.value)} className="px-2 py-1 text-xs rounded border border-[var(--c-border)] bg-[var(--c-bg)]">
                {[1,2,3,4,6,8,12].map(n => <option key={n} value={n}>{n}時間ごと</option>)}
              </select>
            )}
            {hourMode === 'fix' && (
              <input type="number" min={0} max={23} value={hourFix} onChange={e => setHourFix(e.target.value)}
                className="w-16 px-2 py-1 text-xs rounded border border-[var(--c-border)] bg-[var(--c-bg)]" />
            )}
          </div>
          {/* 日 */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="w-6 text-xs text-[var(--c-text-3)]">日</span>
            {(['*','fix'] as DayMode[]).map(m => (
              <label key={m} className="flex items-center gap-1 text-xs cursor-pointer">
                <input type="radio" checked={dayMode === m} onChange={() => setDayMode(m)} className="accent-[var(--c-accent)]" />
                <span>{m === '*' ? '毎日' : '固定'}</span>
              </label>
            ))}
            {dayMode === 'fix' && (
              <select value={dayFix} onChange={e => setDayFix(e.target.value)} className="px-2 py-1 text-xs rounded border border-[var(--c-border)] bg-[var(--c-bg)]">
                {Array.from({length: 31}, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}日</option>)}
              </select>
            )}
          </div>
          {/* 月 */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="w-6 text-xs text-[var(--c-text-3)]">月</span>
            <label className="flex items-center gap-1 text-xs cursor-pointer">
              <input type="checkbox" checked={monthAll} onChange={e => { setMonthAll(e.target.checked); if (e.target.checked) setMonths(new Set()); }} className="accent-[var(--c-accent)]" />
              <span>毎月</span>
            </label>
            {Array.from({length: 12}, (_, i) => i + 1).map(m => (
              <label key={m} className="flex items-center gap-1 text-xs cursor-pointer">
                <input type="checkbox" checked={months.has(m)} onChange={() => toggleMonth(m)} className="accent-[var(--c-accent)]" />
                <span>{m}月</span>
              </label>
            ))}
          </div>
          {/* 曜日 */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="w-6 text-xs text-[var(--c-text-3)]">曜日</span>
            <label className="flex items-center gap-1 text-xs cursor-pointer">
              <input type="checkbox" checked={dowAll} onChange={e => { setDowAll(e.target.checked); if (e.target.checked) setDows(new Set()); }} className="accent-[var(--c-accent)]" />
              <span>毎日</span>
            </label>
            {DOW_JA.map((name, i) => (
              <label key={i} className="flex items-center gap-1 text-xs cursor-pointer">
                <input type="checkbox" checked={dows.has(i)} onChange={() => toggleDow(i)} className="accent-[var(--c-accent)]" />
                <span>{name}</span>
              </label>
            ))}
          </div>
          <button onClick={applyGui} className="self-start btn btn--primary btn--sm text-xs">
            cron 式に反映
          </button>
        </div>
      </details>

      {/* 次回実行一覧 */}
      {nexts.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-[var(--c-text-2)] mb-2">次回実行予定（{mainTzLabel}）</h3>
          <ol className="flex flex-col gap-1">
            {nexts.map((d, i) => (
              <li key={i} className="flex items-center gap-3 text-sm py-1 border-b border-[var(--c-border)] last:border-0">
                <span className="text-[var(--c-text-3)] text-xs w-4 text-right">{i + 1}</span>
                <span className="font-mono">{formatInTz(d, mainTzOffset, mainTzLabel)}</span>
                <span className="text-xs text-[var(--c-text-3)] ml-auto font-mono">{formatInTz(d, subTzOffset, subTzLabel)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

// ================================================================
// HTTP ステータスリファレンス
// ================================================================

function HttpStatusSection() {
  const [search, setSearch]     = useState('');
  const [starOnly, setStarOnly] = useState(() => localStorage.getItem(STORAGE_HTTP_STAR_ONLY) === 'true');
  const [openCats, setOpenCats] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_HTTP_OPEN_CATS);
      return saved ? new Set(JSON.parse(saved)) : new Set(['1xx','2xx','3xx','4xx','5xx']);
    } catch { return new Set(['1xx','2xx','3xx','4xx','5xx']); }
  });
  const [expandedCode, setExpandedCode] = useState<number | null>(null);

  const toggleCat = (prefix: string) => {
    setOpenCats(prev => {
      const s = new Set(prev);
      s.has(prefix) ? s.delete(prefix) : s.add(prefix);
      localStorage.setItem(STORAGE_HTTP_OPEN_CATS, JSON.stringify([...s]));
      return s;
    });
  };
  const handleStarOnly = (v: boolean) => {
    setStarOnly(v);
    localStorage.setItem(STORAGE_HTTP_STAR_ONLY, String(v));
  };

  const q = search.toLowerCase();
  const filtered = useMemo(() => {
    return HTTP_STATUS_CODES.filter(s => {
      if (starOnly && !s.starred) return false;
      if (!q) return true;
      return String(s.code).includes(q) || s.name.toLowerCase().includes(q) || s.description.includes(q);
    });
  }, [q, starOnly]);

  const grouped = useMemo(() => {
    const map = new Map<string, HttpStatusEntry[]>();
    for (const cat of STATUS_CATEGORIES) map.set(cat.prefix, []);
    for (const s of filtered) {
      const arr = map.get(s.category);
      if (arr) arr.push(s);
    }
    return map;
  }, [filtered]);

  return (
    <div className="flex flex-col gap-4">
      {/* 検索 & フィルター */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="コード・名前・説明で検索…"
          className="flex-1 px-3 py-2 text-sm rounded-lg border border-[var(--c-border)] bg-[var(--c-bg-2)] text-[var(--c-text)] focus:outline-none focus:border-[var(--c-accent)]"
        />
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input type="checkbox" checked={starOnly} onChange={e => handleStarOnly(e.target.checked)} className="accent-[var(--c-accent)]" />
          <span className="text-yellow-400">★ のみ</span>
        </label>
      </div>

      {/* カテゴリ別アコーディオン */}
      <div className="flex flex-col gap-2">
        {STATUS_CATEGORIES.map(cat => {
          const codes = grouped.get(cat.prefix) || [];
          const isOpen = openCats.has(cat.prefix);
          return (
            <div key={cat.prefix} className="rounded-lg border border-[var(--c-border)] overflow-hidden">
              <button
                onClick={() => toggleCat(cat.prefix)}
                className="w-full flex items-center gap-3 px-4 py-3 bg-[var(--c-bg-2)] hover:bg-[var(--c-bg-3)] transition-colors text-left"
              >
                <span className={`font-bold text-sm ${cat.colorClass}`}>{cat.prefix}</span>
                <span className="font-medium text-sm text-[var(--c-text)]">{cat.label}</span>
                <span className="text-xs text-[var(--c-text-3)]">{cat.desc}</span>
                <span className="ml-auto text-xs text-[var(--c-text-3)]">{codes.length} 件</span>
                <span className={`text-[var(--c-text-3)] text-xs transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
              </button>
              {isOpen && codes.length > 0 && (
                <div className="divide-y divide-[var(--c-border)]">
                  {codes.map(s => (
                    <div key={s.code}>
                      <button
                        onClick={() => setExpandedCode(expandedCode === s.code ? null : s.code)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--c-bg-2)] transition-colors text-left"
                      >
                        <code className={`font-mono font-bold text-sm w-10 ${cat.colorClass}`}>{s.code}</code>
                        {s.starred && <span className="text-yellow-400 text-xs">★</span>}
                        <span className="font-medium text-sm text-[var(--c-text)]">{s.name}</span>
                        <span className="text-xs text-[var(--c-text-2)] ml-2">{s.description}</span>
                        <span className={`ml-auto text-[var(--c-text-3)] text-xs transition-transform ${expandedCode === s.code ? 'rotate-90' : ''}`}>▶</span>
                      </button>
                      {expandedCode === s.code && (
                        <div className="px-4 pb-3 pt-1 bg-[var(--c-bg-2)] text-sm flex flex-col gap-1">
                          <div><span className="text-xs text-[var(--c-text-3)]">原因: </span><span className="text-[var(--c-text-2)]">{s.cause}</span></div>
                          <div><span className="text-xs text-[var(--c-text-3)]">対処: </span><span className="text-[var(--c-text-2)]">{s.solution}</span></div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {isOpen && codes.length === 0 && (
                <p className="px-4 py-2 text-sm text-[var(--c-text-3)]">該当なし</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ================================================================
// ポート番号リファレンス
// ================================================================

type PortsFilter = 'all' | 'builtin' | 'custom';

interface DisplayPort {
  id?: number;
  port: number;
  protocol: PortProtocol;
  service: string;
  memo: string;
  isBuiltIn: boolean;
}

function PortsSection() {
  const { success, error: showError, show: showToast } = useToast();
  const [filter, setFilter]       = useState<PortsFilter>(() => (localStorage.getItem(STORAGE_PORTS_FILTER) as PortsFilter) || 'all');
  const [search, setSearch]       = useState('');
  const [customPorts, setCustom]  = useState<OpsPort[]>([]);
  const [showForm, setShowForm]   = useState(false);
  const [editingPort, setEditing] = useState<OpsPort | null>(null);

  // フォーム状態
  const [fPort, setFPort]     = useState('');
  const [fProto, setFProto]   = useState<PortProtocol>('TCP');
  const [fService, setFService] = useState('');
  const [fMemo, setFMemo]     = useState('');

  useEffect(() => {
    opsDB.getPorts().then(setCustom);
  }, []);

  const handleFilterChange = (f: PortsFilter) => {
    setFilter(f);
    localStorage.setItem(STORAGE_PORTS_FILTER, f);
  };

  const displayPorts = useMemo<DisplayPort[]>(() => {
    const q = search.toLowerCase();
    let all: DisplayPort[] = [];
    if (filter !== 'custom')  all = all.concat(BUILTIN_PORTS.map(p => ({ ...p, isBuiltIn: true })));
    if (filter !== 'builtin') all = all.concat(customPorts.map(p => ({ ...p, isBuiltIn: false })));
    all.sort((a, b) => a.port - b.port || (a.isBuiltIn ? -1 : 1));
    if (q) all = all.filter(p => p.port.toString().includes(q) || p.service.toLowerCase().includes(q));
    return all;
  }, [filter, search, customPorts]);

  const openForm = (port?: OpsPort) => {
    setEditing(port || null);
    setFPort(port ? String(port.port) : '');
    setFProto(port ? port.protocol : 'TCP');
    setFService(port ? port.service : '');
    setFMemo(port ? port.memo : '');
    setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditing(null); };

  const saveForm = async () => {
    const portNum = parseInt(fPort, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      showError('ポート番号は 1〜65535 の範囲で入力してください'); return;
    }
    if (!fService.trim()) { showError('サービス名を入力してください'); return; }

    // 重複チェック
    const allPorts: DisplayPort[] = [...BUILTIN_PORTS.map(p => ({ ...p, isBuiltIn: true })), ...customPorts.map(p => ({ ...p, isBuiltIn: false }))];
    const dup = allPorts.find(p => p.port === portNum && p.protocol === fProto && (!editingPort?.id || p.id !== editingPort.id));
    if (dup) { showToast(`ポート ${portNum}/${fProto} はすでに登録されています（${dup.service}）`, 'info'); return; }

    if (editingPort?.id !== undefined) {
      await opsDB.updatePort({ id: editingPort.id, port: portNum, protocol: fProto, service: fService.trim(), memo: fMemo.trim(), position: editingPort.position });
    } else {
      await opsDB.addPort({ port: portNum, protocol: fProto, service: fService.trim(), memo: fMemo.trim(), position: customPorts.length });
    }
    const updated = await opsDB.getPorts();
    setCustom(updated);
    closeForm();
    success('保存しました');
  };

  const deletePort = async (id: number) => {
    await opsDB.deletePort(id);
    setCustom(await opsDB.getPorts());
    success('削除しました');
  };

  const PROTO_COLOR: Record<string, string> = {
    TCP:  'bg-[var(--c-accent)]/15 text-[var(--c-accent)] border border-[var(--c-accent)]/30',
    UDP:  'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
    both: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  };

  return (
    <div className="flex flex-col gap-4">
      {/* フィルタータブ & 検索 */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 bg-[var(--c-bg-2)] rounded p-0.5 border border-[var(--c-border)]">
          {([['all','全て'], ['builtin','組み込み'], ['custom','カスタム']] as [PortsFilter, string][]).map(([f, label]) => {
            const cnt = f === 'all' ? BUILTIN_PORTS.length + customPorts.length
                       : f === 'builtin' ? BUILTIN_PORTS.length
                       : customPorts.length;
            return (
              <button
                key={f}
                onClick={() => handleFilterChange(f)}
                className={`px-3 py-1 text-xs rounded transition-colors ${filter === f ? 'bg-[var(--c-accent)] text-white' : 'text-[var(--c-text-2)] hover:text-[var(--c-text)]'}`}
              >{label} <span className="opacity-70">{cnt}</span></button>
            );
          })}
        </div>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="ポート番号・サービス名で検索…"
          className="flex-1 min-w-40 px-3 py-2 text-sm rounded-lg border border-[var(--c-border)] bg-[var(--c-bg-2)] text-[var(--c-text)] focus:outline-none focus:border-[var(--c-accent)]"
        />
        <button onClick={() => openForm()} className="btn btn--primary btn--sm text-xs shrink-0">
          + カスタム追加
        </button>
      </div>

      {/* フォーム */}
      {showForm && (
        <div className="p-4 rounded-lg border border-[var(--c-accent)]/40 bg-[var(--c-bg-2)] flex flex-col gap-3">
          <h3 className="text-sm font-semibold">{editingPort ? 'ポート編集' : 'カスタムポート追加'}</h3>
          <div className="flex gap-3 flex-wrap">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[var(--c-text-3)]">ポート番号</label>
              <input type="number" min={1} max={65535} value={fPort} onChange={e => setFPort(e.target.value)}
                className="w-28 px-2 py-1.5 text-sm rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-text)] focus:outline-none focus:border-[var(--c-accent)]" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[var(--c-text-3)]">プロトコル</label>
              <select value={fProto} onChange={e => setFProto(e.target.value as PortProtocol)}
                className="px-2 py-1.5 text-sm rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-text)] focus:outline-none focus:border-[var(--c-accent)]">
                <option value="TCP">TCP</option>
                <option value="UDP">UDP</option>
                <option value="both">both</option>
              </select>
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-32">
              <label className="text-xs text-[var(--c-text-3)]">サービス名</label>
              <input type="text" value={fService} onChange={e => setFService(e.target.value)}
                className="px-2 py-1.5 text-sm rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-text)] focus:outline-none focus:border-[var(--c-accent)]" />
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-32">
              <label className="text-xs text-[var(--c-text-3)]">メモ（任意）</label>
              <input type="text" value={fMemo} onChange={e => setFMemo(e.target.value)}
                className="px-2 py-1.5 text-sm rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-text)] focus:outline-none focus:border-[var(--c-accent)]" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={saveForm} className="btn btn--primary btn--sm text-xs">保存</button>
            <button onClick={closeForm} className="btn btn--ghost btn--sm text-xs">キャンセル</button>
          </div>
        </div>
      )}

      {/* テーブル */}
      {displayPorts.length === 0 ? (
        <p className="text-center text-[var(--c-text-3)] text-sm py-8">該当するポートが見つかりません</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--c-border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--c-bg-2)] text-[var(--c-text-2)] text-xs">
                <th className="text-left px-3 py-2">ポート</th>
                <th className="text-left px-3 py-2">プロトコル</th>
                <th className="text-left px-3 py-2">サービス</th>
                <th className="text-left px-3 py-2">メモ</th>
                <th className="px-3 py-2 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--c-border)]">
              {displayPorts.map((p, idx) => (
                <tr key={`${p.port}-${p.protocol}-${idx}`} className={`hover:bg-[var(--c-bg-2)] transition-colors ${!p.isBuiltIn ? 'text-[var(--c-accent)]' : ''}`}>
                  <td className="px-3 py-2"><code className="font-mono font-bold">{p.port}</code></td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${PROTO_COLOR[p.protocol] || ''}`}>{p.protocol}</span>
                  </td>
                  <td className="px-3 py-2">{p.service}</td>
                  <td className="px-3 py-2 text-[var(--c-text-2)] text-xs">{p.memo}</td>
                  <td className="px-3 py-2">
                    {!p.isBuiltIn && p.id !== undefined && (
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => openForm(p as unknown as OpsPort)} className="btn btn--ghost btn--sm text-xs">編集</button>
                        <button onClick={() => deletePort(p.id!)} className="btn btn--ghost btn--sm text-xs text-red-400 hover:text-red-300">削除</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ================================================================
// OpsPage メイン
// ================================================================

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'log-viewer',  label: 'ログビューア'       },
  { id: 'cron',        label: 'cron式エディタ'     },
  { id: 'http-status', label: 'HTTPステータス'     },
  { id: 'ports',       label: 'ポート番号'          },
];

export function OpsPage() {
  const [active, setActive] = useState<Section>(
    () => (localStorage.getItem(STORAGE_ACTIVE_SECTION) as Section) || 'log-viewer'
  );

  const switchSection = (s: Section) => {
    setActive(s);
    localStorage.setItem(STORAGE_ACTIVE_SECTION, s);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* タブバー */}
      <div className="flex gap-1 px-4 pt-3 pb-0 border-b border-[var(--c-border)] bg-[var(--c-bg)] shrink-0">
        {SECTIONS.map(s => (
          <button
            key={s.id}
            onClick={() => switchSection(s.id)}
            className={`px-4 py-2 text-sm rounded-t transition-colors border-b-2 ${
              active === s.id
                ? 'border-[var(--c-accent)] text-[var(--c-accent)] bg-[var(--c-bg-2)]'
                : 'border-transparent text-[var(--c-text-2)] hover:text-[var(--c-text)] hover:bg-[var(--c-bg-2)]'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* コンテンツ */}
      <div className="flex-1 overflow-auto p-4">
        {active === 'log-viewer'  && <LogViewer />}
        {active === 'cron'        && <CronSection />}
        {active === 'http-status' && <HttpStatusSection />}
        {active === 'ports'       && <PortsSection />}
      </div>
    </div>
  );
}
