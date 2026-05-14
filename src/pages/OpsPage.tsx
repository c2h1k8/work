// ==================================================
// OpsPage — 運用インフラツール（React 移行版）
// ==================================================
// セクション: log-viewer | cron | http-status | ports
// ==================================================

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTabStore } from '../stores/tab_store';
import { searchRegistry } from '../stores/search_store';
import { Toast, useToast } from '../components/Toast';
import { DatePicker } from '../components/DatePicker';
import { Select } from '../components/Select';
import { opsDB, type OpsPort, type PortProtocol } from '../db/ops_db';
import { HelpCircleIcon, XIcon, Upload } from 'lucide-react';

// ── ストレージキー ─────────────────────────────────
const LOG_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const LOG_MAX_LINES     = 200_000;

const STORAGE_ACTIVE_SECTION = 'ops_active_section';
const STORAGE_CRON_TZ        = 'ops_cron_tz';
const STORAGE_PORTS_FILTER   = 'ops_ports_filter';
const STORAGE_HTTP_STAR_ONLY  = 'ops_http_star_only';
const STORAGE_HTTP_OPEN_CATS  = 'ops_http_open_cats';
const STORAGE_PORTS_OPEN_CATS   = 'ops_ports_open_cats';
const STORAGE_CRON_BUILDER_OPEN = 'ops_cron_builder_open';

type Section = 'log-viewer' | 'cron' | 'http-status' | 'ports';

// ================================================================
// 定数
// ================================================================

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

const PORT_CATEGORIES = [
  { id: 'web',    label: 'ウェブ・HTTP',      colorClass: 'text-blue-400'              },
  { id: 'mail',   label: 'メール',            colorClass: 'text-green-400'             },
  { id: 'db',     label: 'データベース',       colorClass: 'text-yellow-400'            },
  { id: 'remote', label: 'リモートアクセス',   colorClass: 'text-red-400'               },
  { id: 'dns',    label: 'DNS・DHCP',         colorClass: 'text-purple-400'            },
  { id: 'file',   label: 'ファイル転送・共有', colorClass: 'text-orange-400'            },
  { id: 'msg',    label: 'メッセージング',     colorClass: 'text-pink-400'              },
  { id: 'dev',    label: '開発・監視',         colorClass: 'text-cyan-400'              },
  { id: 'custom', label: 'カスタム',           colorClass: 'text-[var(--c-accent)]'    },
] as const;

type PortCategoryId    = typeof PORT_CATEGORIES[number]['id'];
type BuiltinCategoryId = Exclude<PortCategoryId, 'custom'>;

interface BuiltinPort {
  port: number; protocol: PortProtocol; service: string; memo: string; isBuiltIn: true;
  category: BuiltinCategoryId;
}
const BUILTIN_PORTS: BuiltinPort[] = [
  { port: 20,    protocol: 'TCP',  service: 'FTP (データ)',        memo: 'ファイル転送（データ接続）',     isBuiltIn: true, category: 'file'   },
  { port: 21,    protocol: 'TCP',  service: 'FTP',                memo: 'ファイル転送（制御接続）',       isBuiltIn: true, category: 'file'   },
  { port: 22,    protocol: 'TCP',  service: 'SSH',                memo: 'セキュアシェル',                isBuiltIn: true, category: 'remote' },
  { port: 23,    protocol: 'TCP',  service: 'Telnet',             memo: 'リモート接続（非暗号化）',       isBuiltIn: true, category: 'remote' },
  { port: 25,    protocol: 'TCP',  service: 'SMTP',               memo: 'メール送信',                    isBuiltIn: true, category: 'mail'   },
  { port: 53,    protocol: 'both', service: 'DNS',                memo: '名前解決',                      isBuiltIn: true, category: 'dns'    },
  { port: 67,    protocol: 'UDP',  service: 'DHCP (サーバ)',       memo: 'IPアドレス自動割当',             isBuiltIn: true, category: 'dns'    },
  { port: 68,    protocol: 'UDP',  service: 'DHCP (クライアント)', memo: 'IPアドレス自動取得',             isBuiltIn: true, category: 'dns'    },
  { port: 80,    protocol: 'TCP',  service: 'HTTP',               memo: 'Webサーバ',                     isBuiltIn: true, category: 'web'    },
  { port: 110,   protocol: 'TCP',  service: 'POP3',               memo: 'メール受信',                    isBuiltIn: true, category: 'mail'   },
  { port: 143,   protocol: 'TCP',  service: 'IMAP',               memo: 'メール受信（サーバ管理）',       isBuiltIn: true, category: 'mail'   },
  { port: 443,   protocol: 'TCP',  service: 'HTTPS',              memo: 'Web（TLS/SSL）',                isBuiltIn: true, category: 'web'    },
  { port: 445,   protocol: 'TCP',  service: 'SMB',                memo: 'ファイル共有（Windows）',        isBuiltIn: true, category: 'file'   },
  { port: 465,   protocol: 'TCP',  service: 'SMTPS',              memo: 'メール送信（SSL）',              isBuiltIn: true, category: 'mail'   },
  { port: 514,   protocol: 'UDP',  service: 'Syslog',             memo: 'ログ転送',                      isBuiltIn: true, category: 'file'   },
  { port: 587,   protocol: 'TCP',  service: 'SMTP (Submission)',  memo: 'メール送信（認証付き）',         isBuiltIn: true, category: 'mail'   },
  { port: 993,   protocol: 'TCP',  service: 'IMAPS',              memo: 'IMAP over SSL',                 isBuiltIn: true, category: 'mail'   },
  { port: 995,   protocol: 'TCP',  service: 'POP3S',              memo: 'POP3 over SSL',                 isBuiltIn: true, category: 'mail'   },
  { port: 1433,  protocol: 'TCP',  service: 'SQL Server',         memo: 'Microsoft SQL Server',          isBuiltIn: true, category: 'db'     },
  { port: 1521,  protocol: 'TCP',  service: 'Oracle DB',          memo: 'Oracle Database リスナー',       isBuiltIn: true, category: 'db'     },
  { port: 3000,  protocol: 'TCP',  service: 'Dev Server',         memo: '開発サーバ（Node.js 等）',       isBuiltIn: true, category: 'dev'    },
  { port: 3306,  protocol: 'TCP',  service: 'MySQL',              memo: 'MySQL / MariaDB',               isBuiltIn: true, category: 'db'     },
  { port: 3389,  protocol: 'TCP',  service: 'RDP',                memo: 'リモートデスクトップ',           isBuiltIn: true, category: 'remote' },
  { port: 5432,  protocol: 'TCP',  service: 'PostgreSQL',         memo: 'PostgreSQL',                    isBuiltIn: true, category: 'db'     },
  { port: 5672,  protocol: 'TCP',  service: 'RabbitMQ',           memo: 'メッセージキュー（AMQP）',       isBuiltIn: true, category: 'msg'    },
  { port: 6379,  protocol: 'TCP',  service: 'Redis',              memo: 'インメモリ KVS',                 isBuiltIn: true, category: 'msg'    },
  { port: 8080,  protocol: 'TCP',  service: 'Tomcat / Proxy',     memo: 'HTTP プロキシ / AP サーバ',      isBuiltIn: true, category: 'web'    },
  { port: 8443,  protocol: 'TCP',  service: 'HTTPS (Alt)',        memo: 'HTTPS 代替ポート',              isBuiltIn: true, category: 'web'    },
  { port: 9090,  protocol: 'TCP',  service: 'Prometheus',         memo: '監視ツール',                    isBuiltIn: true, category: 'dev'    },
  { port: 9200,  protocol: 'TCP',  service: 'Elasticsearch',      memo: '検索エンジン（REST API）',      isBuiltIn: true, category: 'db'     },
  { port: 27017, protocol: 'TCP',  service: 'MongoDB',            memo: 'ドキュメント DB',                isBuiltIn: true, category: 'db'     },
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
    if (dowD !== '毎曜日') desc += dowD + ' ';
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
  const [textFilter, setTextFilter]       = useState('');
  const [debouncedText, setDebouncedText] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [startTime, setStartTime]         = useState('');
  const [endTime, setEndTime]             = useState('');
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [dragOver,       setDragOver]       = useState(false);
  const [isParsing,      setIsParsing]      = useState(false);
  const globalDragCount = useRef(0);
  const areaDragCount   = useRef(0);
  const parseGenRef     = useRef(0);
  const logWorkerRef    = useRef<Worker | null>(null);

  // log Worker のライフサイクル
  useEffect(() => {
    let worker: Worker | null = null;
    try {
      worker = new Worker(new URL('../workers/log.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => {
        const { id, lines } = e.data as { id: number; lines: LogLine[] };
        if (id !== parseGenRef.current) return;
        setLogLines(lines);
        setIsParsing(false);
      };
      worker.onerror = () => {
        setIsParsing(false);
        Toast.error('ログ解析でエラーが発生しました');
      };
      logWorkerRef.current = worker;
    } catch { /* Worker 未対応環境は無視 */ }
    return () => { worker?.terminate(); };
  }, []);

  const [vsStart, setVsStart] = useState(0);
  const [vsEnd, setVsEnd]     = useState(50);
  const outputRef = useRef<HTMLDivElement>(null);
  const rafRef    = useRef<number | null>(null);

  // フィルタリング
  useEffect(() => {
    const needle = debouncedText.toLowerCase();
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
  }, [logLines, levels, debouncedText, startTime, endTime]);

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

  // ページレベルのファイルドラッグ検知（ブラウザウィンドウに入った瞬間から強調）
  useEffect(() => {
    const isFileDrag = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const resetAll = () => {
      globalDragCount.current = 0;
      areaDragCount.current   = 0;
      setIsDraggingFile(false);
      setDragOver(false);
    };
    const onEnter = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      globalDragCount.current++;
      setIsDraggingFile(true);
    };
    const onLeave = () => {
      globalDragCount.current = Math.max(0, globalDragCount.current - 1);
      if (globalDragCount.current === 0) setIsDraggingFile(false);
    };
    document.addEventListener('dragenter', onEnter);
    document.addEventListener('dragleave', onLeave);
    document.addEventListener('drop', resetAll);
    return () => {
      document.removeEventListener('dragenter', onEnter);
      document.removeEventListener('dragleave', onLeave);
      document.removeEventListener('drop', resetAll);
    };
  }, []);

  const handleLogDragOver  = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; };
  const handleLogAreaEnter = () => { areaDragCount.current++; setDragOver(true); };
  const handleLogAreaLeave = () => {
    areaDragCount.current = Math.max(0, areaDragCount.current - 1);
    if (areaDragCount.current === 0) setDragOver(false);
  };
  const handleLogDrop = (e: React.DragEvent) => {
    e.preventDefault();
    areaDragCount.current   = 0;
    globalDragCount.current = 0;
    setDragOver(false);
    setIsDraggingFile(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (file.size > LOG_MAX_FILE_SIZE) {
      Toast.error(`ファイルが大きすぎます（上限 10MB、${(file.size / 1024 / 1024).toFixed(1)} MB）`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === 'string') onInput(reader.result); };
    reader.readAsText(file);
  };

  const onInput = (text: string) => {
    setLogText(text);
    if (!text.trim()) { setLogLines([]); setIsParsing(false); return; }

    if (text.split('\n').length > LOG_MAX_LINES) {
      Toast.error(`行数が多すぎます（上限 ${LOG_MAX_LINES.toLocaleString()} 行）`);
      setLogLines([]);
      return;
    }

    setIsParsing(true);
    const id = ++parseGenRef.current;
    logWorkerRef.current?.postMessage({ id, text });
  };

  const toggleLevel = (lv: string) => setLevels(prev => ({ ...prev, [lv]: !prev[lv] }));

  const hasLog = logLines.length > 0;

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* 入力エリア */}
      <div
        className="relative"
        onDragOver={handleLogDragOver}
        onDragEnter={handleLogAreaEnter}
        onDragLeave={handleLogAreaLeave}
        onDrop={handleLogDrop}
      >
        <textarea
          className={`w-full h-36 px-3 py-2 font-mono text-xs resize-none rounded-lg border bg-[var(--c-bg-2)] text-[var(--c-text)] placeholder-[var(--c-text-3)] focus:outline-none transition-all ${
            isDraggingFile
              ? 'border-2 border-dashed border-[var(--c-accent)] shadow-[0_0_0_3px_var(--c-accent-dim)] focus:border-[var(--c-accent)]'
              : 'border-[var(--c-border)] focus:border-[var(--c-accent)]'
          }`}
          placeholder="ログテキストをここに貼り付けてください…（ファイルドロップ可）"
          value={logText}
          onChange={e => onInput(e.target.value)}
        />
        {dragOver && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-[var(--c-accent-light)] border-2 border-dashed border-[var(--c-accent)] pointer-events-none text-[var(--c-accent)] font-semibold text-sm">
            <Upload size={22} />
            ファイルをドロップ
          </div>
        )}
      </div>

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
            onChange={e => {
              const v = e.target.value;
              setTextFilter(v);
              if (debounceRef.current) clearTimeout(debounceRef.current);
              debounceRef.current = setTimeout(() => setDebouncedText(v), 300);
            }}
          />
          <DatePicker
            showTime
            compact
            value={startTime}
            onChange={setStartTime}
            onClear={() => setStartTime('')}
            placeholder="開始時刻"
            displayText={startTime ? startTime.replace('T', ' ') : undefined}
          />
          <span className="text-xs text-[var(--c-text-3)]">〜</span>
          <DatePicker
            showTime
            compact
            value={endTime}
            onChange={setEndTime}
            onClear={() => setEndTime('')}
            placeholder="終了時刻"
            displayText={endTime ? endTime.replace('T', ' ') : undefined}
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

      {isParsing && (
        <div className="flex-1 flex items-center justify-center text-[var(--c-text-3)] text-sm">
          解析中…
        </div>
      )}
      {!hasLog && !isParsing && (
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

function formatDowField(val: string): string {
  if (!val || val === '*') return val || '–';
  // "1-5" 範囲表記
  const rangeMatch = val.match(/^(\d)-(\d)$/);
  if (rangeMatch) {
    const lo = parseInt(rangeMatch[1], 10);
    const hi = parseInt(rangeMatch[2], 10);
    if (lo >= 0 && lo <= 6 && hi >= 0 && hi <= 6) return `${DOW_JA[lo]}〜${DOW_JA[hi]}`;
  }
  // カンマ区切り "1,2,3,4,5"
  if (val.includes(',')) {
    const nums = val.split(',').map(Number).filter(n => !isNaN(n) && n >= 0 && n <= 6);
    const sorted = [...nums].sort((a, b) => a - b);
    const isContiguous = sorted.length > 2 && sorted.every((v, i) => i === 0 || v - sorted[i - 1] === 1);
    if (isContiguous) return `${DOW_JA[sorted[0]]}〜${DOW_JA[sorted[sorted.length - 1]]}`;
    return sorted.map(n => DOW_JA[n]).join('');
  }
  // 単一数値
  const n = parseInt(val, 10);
  if (!isNaN(n) && n >= 0 && n <= 6) return DOW_JA[n];
  return val;
}

const CRON_PRESETS = [
  { label: '毎分',     expr: '* * * * *'   },
  { label: '毎時0分',  expr: '0 * * * *'   },
  { label: '毎日9時',  expr: '0 9 * * *'   },
  { label: '平日9時',  expr: '0 9 * * 1-5' },
  { label: '毎週月曜', expr: '0 9 * * 1'   },
  { label: '毎月1日',  expr: '0 9 1 * *'   },
] as const;

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
  const [showGuide, setShowGuide]     = useState(false);
  const [showBuilder, setShowBuilder] = useState(() => localStorage.getItem(STORAGE_CRON_BUILDER_OPEN) !== 'false');

  const guiInitRef = useRef(true);

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

  // GUI ビルダー → cron 式へ自動反映
  useEffect(() => {
    if (guiInitRef.current) { guiInitRef.current = false; return; }
    const minF   = minMode  === '*' ? '*' : minMode  === 'step' ? `*/${minStep}`  : minFix;
    const hourF  = hourMode === '*' ? '*' : hourMode === 'step' ? `*/${hourStep}` : hourFix;
    const dayF   = dayMode  === '*' ? '*' : dayFix;
    const monthF = monthAll ? '*' : months.size ? [...months].sort((a,b)=>a-b).join(',') : '*';
    const dowF   = dowAll   ? '*' : dows.size   ? [...dows].sort((a,b)=>a-b).join(',')   : '*';
    setExpr(`${minF} ${hourF} ${dayF} ${monthF} ${dowF}`);
  }, [minMode, minStep, minFix, hourMode, hourStep, hourFix, dayMode, dayFix, monthAll, months, dowAll, dows]);

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

  const exprFields = expr.trim().split(/\s+/);
  const FIELD_LABELS = ['分', '時', '日', '月', '曜日'];

  return (
    <div className="flex flex-col gap-4">

      {/* ─── 入力カード ─── */}
      <div className="rounded-lg border border-[var(--c-border)] overflow-hidden">
        {/* フィールドラベル行 + TZ切替 */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2 bg-[var(--c-bg-2)] border-b border-[var(--c-border)]">
          <div className="flex gap-4">
            {FIELD_LABELS.map((lbl, i) => {
              const raw = exprFields[i] ?? '';
              const displayVal = i === 4 ? formatDowField(raw) : (raw || '–');
              const isWild = displayVal === '*' || displayVal === '–' || displayVal === '';
              return (
                <div key={lbl} className="flex flex-col items-center gap-0.5 min-w-[32px]">
                  <span className="text-[10px] text-[var(--c-text-3)]">{lbl}</span>
                  <code className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded transition-colors ${isWild ? 'text-[var(--c-text-3)]' : 'text-[var(--c-accent)] bg-[var(--c-accent)]/10'}`}>
                    {displayVal}
                  </code>
                </div>
              );
            })}
          </div>
          <div className="flex gap-0.5 p-0.5 bg-[var(--c-bg)] border border-[var(--c-border)] rounded">
            {(['UTC','JST'] as CronTz[]).map(t => (
              <button key={t} onClick={() => handleTzChange(t)}
                className={`px-2.5 py-0.5 text-[10px] rounded font-mono transition-colors ${tz === t ? 'bg-[var(--c-accent)] text-white' : 'text-[var(--c-text-2)] hover:text-[var(--c-text)]'}`}>
                {t}
              </button>
            ))}
          </div>
        </div>
        {/* cron 式入力 */}
        <div className="p-3">
          <input
            type="text"
            value={expr}
            onChange={e => setExpr(e.target.value)}
            className="w-full px-3 py-2.5 font-mono text-sm tracking-wider rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-text)] focus:outline-none focus:border-[var(--c-accent)]"
            placeholder="* * * * *"
          />
        </div>
        {/* 説明バッジ / エラー */}
        <div className="px-4 pb-3 min-h-[32px] flex items-center">
          {error ? (
            <span className="inline-flex items-center text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-2.5 py-1 rounded-full">{error}</span>
          ) : desc ? (
            <span className="inline-flex items-center text-xs text-[var(--c-accent)] bg-[var(--c-accent)]/10 border border-[var(--c-accent)]/20 px-2.5 py-1 rounded-full font-medium">{desc}</span>
          ) : (
            <span className="text-xs text-[var(--c-text-3)]">cron 式を入力してください</span>
          )}
        </div>
      </div>

      {/* ─── プリセット ─── */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs text-[var(--c-text-3)] shrink-0 mr-0.5">プリセット</span>
        {CRON_PRESETS.map(p => (
          <button
            key={p.expr}
            onClick={() => setExpr(p.expr)}
            className={`px-2.5 py-1 text-xs rounded-full border font-mono transition-colors ${
              expr === p.expr
                ? 'bg-[var(--c-accent)]/15 text-[var(--c-accent)] border-[var(--c-accent)]/40 font-bold'
                : 'text-[var(--c-text-2)] border-[var(--c-border)] hover:text-[var(--c-text)] hover:border-[var(--c-text-3)]'
            }`}
          >{p.label}</button>
        ))}
        <button
          onClick={() => setShowGuide(g => !g)}
          className={`ml-auto flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${showGuide ? 'text-[var(--c-accent)]' : 'text-[var(--c-text-3)] hover:text-[var(--c-text)]'}`}
        >
          <HelpCircleIcon size={12} />特殊文字
        </button>
      </div>

      {/* 特殊文字ガイド */}
      {showGuide && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs px-3 py-2.5 rounded-lg border border-[var(--c-border)] bg-[var(--c-bg-2)]">
          {([['*','すべて'], [',','列挙 (1,3,5)'], ['-','範囲 (1-5)'], ['/','ステップ (*/5)']] as const).map(([char, desc]) => (
            <span key={char} className="flex items-center gap-1.5">
              <code className="text-[var(--c-accent)] font-bold text-sm">{char}</code>
              <span className="text-[var(--c-text-3)]">{desc}</span>
            </span>
          ))}
        </div>
      )}

      {/* ─── GUI ビルダー ─── */}
      <div className="rounded-lg border border-[var(--c-border)]">
        <button
          onClick={() => setShowBuilder(b => { localStorage.setItem(STORAGE_CRON_BUILDER_OPEN, String(!b)); return !b; })}
          className={`w-full flex items-center gap-2 px-4 py-3 bg-[var(--c-bg-2)] hover:bg-[var(--c-bg-3)] transition-colors text-left ${showBuilder ? 'rounded-t-lg' : 'rounded-lg'}`}
        >
          <span className="text-sm font-medium text-[var(--c-text)]">GUI ビルダー</span>
          <span className={`ml-auto text-[var(--c-text-3)] text-xs transition-transform inline-block ${showBuilder ? 'rotate-90' : ''}`}>▶</span>
        </button>
        {showBuilder && (
          <div className="px-4 py-4 flex flex-col gap-4 border-t border-[var(--c-border)]">

            {/* 分 */}
            <div className="flex items-start gap-3">
              <span className="text-xs font-bold text-[var(--c-text-3)] w-8 pt-[7px] shrink-0 text-right">分</span>
              <div className="flex gap-0.5 p-0.5 bg-[var(--c-bg-2)] border border-[var(--c-border)] rounded-md">
                <button type="button" onClick={() => setMinMode('*')}
                  className={`px-2.5 py-1 text-xs rounded transition-colors ${minMode === '*' ? 'bg-[var(--c-surface)] text-[var(--c-accent)] shadow-sm font-semibold' : 'text-[var(--c-text-2)] hover:text-[var(--c-text)]'}`}>
                  毎分
                </button>
                <button type="button" onClick={() => setMinMode('step')}
                  className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded transition-colors ${minMode === 'step' ? 'bg-[var(--c-surface)] text-[var(--c-accent)] shadow-sm font-semibold' : 'text-[var(--c-text-2)] hover:text-[var(--c-text)]'}`}>
                  ごとに
                  <input type="number" min={1} max={59} value={minStep}
                    onClick={e => e.stopPropagation()}
                    onFocus={e => { setMinMode('step'); e.target.select(); }}
                    onChange={e => setMinStep(e.target.value)}
                    className="w-10 text-center bg-[var(--c-bg)] border border-[var(--c-border)] rounded text-[var(--c-text)] text-xs py-0.5 px-0 focus:outline-none focus:border-[var(--c-accent)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
                  分
                </button>
                <button type="button" onClick={() => setMinMode('fix')}
                  className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded transition-colors ${minMode === 'fix' ? 'bg-[var(--c-surface)] text-[var(--c-accent)] shadow-sm font-semibold' : 'text-[var(--c-text-2)] hover:text-[var(--c-text)]'}`}>
                  指定
                  <input type="number" min={0} max={59} value={minFix}
                    onClick={e => e.stopPropagation()}
                    onFocus={e => { setMinMode('fix'); e.target.select(); }}
                    onChange={e => setMinFix(e.target.value)}
                    className="w-10 text-center bg-[var(--c-bg)] border border-[var(--c-border)] rounded text-[var(--c-text)] text-xs py-0.5 px-0 focus:outline-none focus:border-[var(--c-accent)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
                  分
                </button>
              </div>
            </div>

            {/* 時 */}
            <div className="flex items-start gap-3">
              <span className="text-xs font-bold text-[var(--c-text-3)] w-8 pt-[7px] shrink-0 text-right">時</span>
              <div className="flex gap-0.5 p-0.5 bg-[var(--c-bg-2)] border border-[var(--c-border)] rounded-md">
                <button type="button" onClick={() => setHourMode('*')}
                  className={`px-2.5 py-1 text-xs rounded transition-colors ${hourMode === '*' ? 'bg-[var(--c-surface)] text-[var(--c-accent)] shadow-sm font-semibold' : 'text-[var(--c-text-2)] hover:text-[var(--c-text)]'}`}>
                  毎時
                </button>
                <button type="button" onClick={() => setHourMode('step')}
                  className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded transition-colors ${hourMode === 'step' ? 'bg-[var(--c-surface)] text-[var(--c-accent)] shadow-sm font-semibold' : 'text-[var(--c-text-2)] hover:text-[var(--c-text)]'}`}>
                  ごとに
                  <input type="number" min={1} max={23} value={hourStep}
                    onClick={e => e.stopPropagation()}
                    onFocus={e => { setHourMode('step'); e.target.select(); }}
                    onChange={e => setHourStep(e.target.value)}
                    className="w-10 text-center bg-[var(--c-bg)] border border-[var(--c-border)] rounded text-[var(--c-text)] text-xs py-0.5 px-0 focus:outline-none focus:border-[var(--c-accent)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
                  時間
                </button>
                <button type="button" onClick={() => setHourMode('fix')}
                  className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded transition-colors ${hourMode === 'fix' ? 'bg-[var(--c-surface)] text-[var(--c-accent)] shadow-sm font-semibold' : 'text-[var(--c-text-2)] hover:text-[var(--c-text)]'}`}>
                  指定
                  <input type="number" min={0} max={23} value={hourFix}
                    onClick={e => e.stopPropagation()}
                    onFocus={e => { setHourMode('fix'); e.target.select(); }}
                    onChange={e => setHourFix(e.target.value)}
                    className="w-10 text-center bg-[var(--c-bg)] border border-[var(--c-border)] rounded text-[var(--c-text)] text-xs py-0.5 px-0 focus:outline-none focus:border-[var(--c-accent)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
                  時
                </button>
              </div>
            </div>

            {/* 日 */}
            <div className="flex items-start gap-3">
              <span className="text-xs font-bold text-[var(--c-text-3)] w-8 pt-[7px] shrink-0 text-right">日</span>
              <div className="flex gap-0.5 p-0.5 bg-[var(--c-bg-2)] border border-[var(--c-border)] rounded-md">
                <button type="button" onClick={() => setDayMode('*')}
                  className={`px-2.5 py-1 text-xs rounded transition-colors ${dayMode === '*' ? 'bg-[var(--c-surface)] text-[var(--c-accent)] shadow-sm font-semibold' : 'text-[var(--c-text-2)] hover:text-[var(--c-text)]'}`}>
                  毎日
                </button>
                <button type="button" onClick={() => setDayMode('fix')}
                  className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded transition-colors ${dayMode === 'fix' ? 'bg-[var(--c-surface)] text-[var(--c-accent)] shadow-sm font-semibold' : 'text-[var(--c-text-2)] hover:text-[var(--c-text)]'}`}>
                  指定
                  <input type="number" min={1} max={31} value={dayFix}
                    onClick={e => e.stopPropagation()}
                    onFocus={e => { setDayMode('fix'); e.target.select(); }}
                    onChange={e => setDayFix(e.target.value)}
                    className="w-10 text-center bg-[var(--c-bg)] border border-[var(--c-border)] rounded text-[var(--c-text)] text-xs py-0.5 px-0 focus:outline-none focus:border-[var(--c-accent)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
                  日
                </button>
              </div>
            </div>

            {/* 月 */}
            <div className="flex items-start gap-3">
              <span className="text-xs text-[var(--c-text-3)] w-8 pt-1.5 shrink-0 text-right">月</span>
              <div className="flex gap-1 flex-wrap">
                <button
                  onClick={() => { setMonthAll(true); setMonths(new Set()); }}
                  className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${monthAll ? 'bg-[var(--c-accent)]/15 text-[var(--c-accent)] border-[var(--c-accent)]/40 font-bold' : 'text-[var(--c-text-2)] border-[var(--c-border)] hover:text-[var(--c-text)]'}`}>
                  毎月
                </button>
                {Array.from({length: 12}, (_, i) => i + 1).map(m => (
                  <button key={m} onClick={() => toggleMonth(m)}
                    className={`w-8 py-1 text-xs rounded-full border font-mono transition-colors text-center ${months.has(m) ? 'bg-[var(--c-accent)]/15 text-[var(--c-accent)] border-[var(--c-accent)]/40 font-bold' : 'text-[var(--c-text-2)] border-[var(--c-border)] hover:text-[var(--c-text)]'}`}>
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* 曜日 */}
            <div className="flex items-start gap-3">
              <span className="text-xs text-[var(--c-text-3)] w-8 pt-1.5 shrink-0 text-right">曜日</span>
              <div className="flex gap-1 flex-wrap">
                <button
                  onClick={() => { setDowAll(true); setDows(new Set()); }}
                  className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${dowAll ? 'bg-[var(--c-accent)]/15 text-[var(--c-accent)] border-[var(--c-accent)]/40 font-bold' : 'text-[var(--c-text-2)] border-[var(--c-border)] hover:text-[var(--c-text)]'}`}>
                  毎日
                </button>
                <button
                  onClick={() => { setDowAll(false); setDows(new Set([1,2,3,4,5])); }}
                  className="px-2.5 py-1 text-xs rounded-full border border-[var(--c-border)] text-[var(--c-text-2)] hover:text-[var(--c-text)] transition-colors">
                  平日
                </button>
                {DOW_JA.map((name, i) => {
                  const active = dows.has(i);
                  const cls = i === 0 ? 'bg-red-500/15 text-red-400 border-red-500/40'
                            : i === 6 ? 'bg-blue-500/15 text-blue-400 border-blue-500/40'
                            : 'bg-[var(--c-accent)]/15 text-[var(--c-accent)] border-[var(--c-accent)]/40';
                  return (
                    <button key={i} onClick={() => toggleDow(i)}
                      className={`w-8 py-1 text-xs rounded-full border font-medium text-center transition-colors ${active ? cls : 'text-[var(--c-text-2)] border-[var(--c-border)] hover:text-[var(--c-text)]'}`}>
                      {name}
                    </button>
                  );
                })}
              </div>
            </div>

          </div>
        )}
      </div>

      {/* ─── 次回実行一覧 ─── */}
      {nexts.length > 0 && (
        <div className="rounded-lg border border-[var(--c-border)] overflow-hidden">
          <div className="flex items-center px-4 py-2.5 bg-[var(--c-bg-2)] border-b border-[var(--c-border)]">
            <span className="text-xs font-semibold text-[var(--c-text-2)]">次回実行予定</span>
            <span className="ml-2 text-xs text-[var(--c-text-3)]">（{mainTzLabel}）</span>
          </div>
          <div>
            {nexts.map((d, i) => (
              <div key={i} className={`flex items-center gap-3 px-4 py-2.5 border-b border-[var(--c-border)] last:border-0 ${i === 0 ? 'bg-[var(--c-accent)]/5' : i % 2 === 1 ? 'bg-[var(--c-bg-2)]/40' : ''}`}>
                <span className={`text-xs font-mono w-4 text-right shrink-0 ${i === 0 ? 'text-[var(--c-accent)] font-bold' : 'text-[var(--c-text-3)]'}`}>{i + 1}</span>
                <span className={`font-mono text-sm ${i === 0 ? 'text-[var(--c-accent)] font-medium' : 'text-[var(--c-text)]'}`}>
                  {formatInTz(d, mainTzOffset, mainTzLabel)}
                </span>
                <span className="text-xs text-[var(--c-text-3)] ml-auto font-mono">{formatInTz(d, subTzOffset, subTzLabel)}</span>
              </div>
            ))}
          </div>
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
        <button
          onClick={() => handleStarOnly(!starOnly)}
          className={`inline-flex items-center gap-1 px-3 py-[7px] rounded-full text-xs font-medium border transition-colors ${
            starOnly
              ? 'bg-yellow-400/15 text-yellow-400 border-yellow-400/40'
              : 'bg-transparent text-[var(--c-text-2)] border-[var(--c-border)] hover:text-[var(--c-text)] hover:border-[var(--c-text-3)]'
          }`}
        >
          ★ のみ
        </button>
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
  category: PortCategoryId;
}

function PortsSection() {
  const { success, error: showError, show: showToast } = useToast();
  const [filter, setFilter]       = useState<PortsFilter>(() => (localStorage.getItem(STORAGE_PORTS_FILTER) as PortsFilter) || 'all');
  const [search, setSearch]       = useState('');
  const [customPorts, setCustom]  = useState<OpsPort[]>([]);
  const [showForm, setShowForm]   = useState(false);
  const [editingPort, setEditing] = useState<OpsPort | null>(null);
  const [openCats, setOpenCats]   = useState<Set<PortCategoryId>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PORTS_OPEN_CATS);
      return saved ? new Set(JSON.parse(saved)) : new Set(PORT_CATEGORIES.map(c => c.id));
    } catch { return new Set(PORT_CATEGORIES.map(c => c.id)); }
  });

  const [fPort, setFPort]       = useState('');
  const [fProto, setFProto]     = useState<PortProtocol>('TCP');
  const [fService, setFService] = useState('');
  const [fMemo, setFMemo]       = useState('');

  useEffect(() => { opsDB.getPorts().then(setCustom); }, []);

  const handleFilterChange = (f: PortsFilter) => {
    setFilter(f);
    localStorage.setItem(STORAGE_PORTS_FILTER, f);
  };

  const toggleCat = (id: PortCategoryId) => {
    setOpenCats(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      localStorage.setItem(STORAGE_PORTS_OPEN_CATS, JSON.stringify([...s]));
      return s;
    });
  };

  const q = search.toLowerCase();

  const grouped = useMemo<Map<PortCategoryId, DisplayPort[]>>(() => {
    const map = new Map<PortCategoryId, DisplayPort[]>();
    for (const cat of PORT_CATEGORIES) map.set(cat.id, []);
    if (filter !== 'custom') {
      for (const p of BUILTIN_PORTS) {
        if (q && !p.port.toString().includes(q) && !p.service.toLowerCase().includes(q) && !p.memo.toLowerCase().includes(q)) continue;
        map.get(p.category)!.push({ ...p });
      }
    }
    if (filter !== 'builtin') {
      for (const p of customPorts) {
        if (q && !p.port.toString().includes(q) && !p.service.toLowerCase().includes(q) && !p.memo.toLowerCase().includes(q)) continue;
        map.get('custom')!.push({ ...p, isBuiltIn: false, category: 'custom' as const });
      }
    }
    return map;
  }, [filter, q, customPorts]);

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
    const allPorts: DisplayPort[] = [
      ...BUILTIN_PORTS.map(p => ({ ...p })),
      ...customPorts.map(p => ({ ...p, isBuiltIn: false as const, category: 'custom' as const })),
    ];
    const dup = allPorts.find(p => p.port === portNum && p.protocol === fProto && (!editingPort?.id || p.id !== editingPort.id));
    if (dup) { showToast(`ポート ${portNum}/${fProto} はすでに登録されています（${dup.service}）`, 'info'); return; }
    if (editingPort?.id !== undefined) {
      await opsDB.updatePort({ id: editingPort.id, port: portNum, protocol: fProto, service: fService.trim(), memo: fMemo.trim(), position: editingPort.position });
    } else {
      await opsDB.addPort({ port: portNum, protocol: fProto, service: fService.trim(), memo: fMemo.trim(), position: customPorts.length });
    }
    setCustom(await opsDB.getPorts());
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

  const visibleCats = PORT_CATEGORIES.filter(cat => {
    if (filter === 'builtin' && cat.id === 'custom') return false;
    if (filter === 'custom'  && cat.id !== 'custom') return false;
    return true;
  });

  return (
    <div className="flex flex-col">
      {/* ─── ツールバー ─── */}
      <div className="px-4 pt-4 pb-3 flex flex-col gap-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-0.5 p-[3px] bg-[var(--c-bg)] border border-[var(--c-border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)]">
            {([['all','全て'], ['builtin','定番'], ['custom','カスタム']] as [PortsFilter, string][]).map(([f, label]) => {
              const cnt = f === 'all' ? BUILTIN_PORTS.length + customPorts.length
                        : f === 'builtin' ? BUILTIN_PORTS.length : customPorts.length;
              return (
                <button
                  key={f}
                  onClick={() => handleFilterChange(f)}
                  className={`inline-flex items-center gap-1.5 px-3 py-[5px] rounded-[var(--radius-md)] text-xs font-medium transition-colors ${
                    filter === f
                      ? 'bg-[var(--c-surface)] text-[var(--c-accent)] font-bold shadow-[var(--shadow-sm)]'
                      : 'text-[var(--c-text-2)] hover:text-[var(--c-text)] hover:bg-[var(--c-bg-2)]'
                  }`}
                >
                  {label}
                  <span className={`inline-flex items-center justify-center px-[5px] min-w-[18px] h-4 rounded-full text-[10px] font-bold font-mono ${
                    filter === f ? 'bg-[var(--c-accent-dim)] text-[var(--c-accent)]' : 'bg-[var(--c-bg-2)] text-[var(--c-text-3)]'
                  }`}>{cnt}</span>
                </button>
              );
            })}
          </div>
          <button onClick={() => openForm()} className="btn btn--primary btn--sm ml-auto shrink-0">
            + カスタム追加
          </button>
        </div>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="ポート番号・サービス名で検索…"
          className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--c-border)] bg-[var(--c-bg-2)] text-[var(--c-text)] focus:outline-none focus:border-[var(--c-accent)]"
        />
      </div>

      {/* ─── コンテンツ ─── */}
      <div className="px-4 pb-4 pt-3 flex flex-col gap-2">
        {/* フォーム */}
        {showForm && (
          <div className="rounded-lg border border-[var(--c-accent)]/40 bg-[var(--c-bg-2)] mb-1">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--c-border)]">
              <span className="text-sm font-semibold">{editingPort ? 'ポート編集' : 'カスタムポート追加'}</span>
              <button onClick={closeForm} className="p-1 rounded text-[var(--c-text-3)] hover:text-[var(--c-text)] hover:bg-[var(--c-bg-3)] transition-colors">
                <XIcon size={14} />
              </button>
            </div>
            <div className="px-4 py-3 flex gap-3 flex-wrap">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[var(--c-text-3)]">ポート番号</label>
                <input type="number" min={1} max={65535} value={fPort} onChange={e => setFPort(e.target.value)}
                  className="w-28 px-2 py-1.5 text-sm rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-text)] focus:outline-none focus:border-[var(--c-accent)]" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[var(--c-text-3)]">プロトコル</label>
                <Select
                  value={fProto}
                  onChange={v => setFProto(v as PortProtocol)}
                  options={[{ value: 'TCP', label: 'TCP' }, { value: 'UDP', label: 'UDP' }, { value: 'both', label: 'both' }]}
                />
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
            <div className="flex justify-end gap-2 px-4 py-2.5 border-t border-[var(--c-border)] bg-[var(--c-bg)] rounded-b-lg">
              <button onClick={closeForm} className="btn btn--ghost btn--sm">キャンセル</button>
              <button onClick={saveForm}  className="btn btn--primary btn--sm">保存</button>
            </div>
          </div>
        )}

        {/* アコーディオン */}
        {visibleCats.map(cat => {
          const ports  = grouped.get(cat.id) || [];
          const isOpen = openCats.has(cat.id);
          return (
            <div key={cat.id} className="rounded-lg border border-[var(--c-border)] overflow-hidden">
              <button
                onClick={() => toggleCat(cat.id)}
                className="w-full flex items-center gap-3 px-4 py-3 bg-[var(--c-bg-2)] hover:bg-[var(--c-bg-3)] transition-colors text-left"
              >
                <span className={`font-bold text-sm ${cat.colorClass}`}>{cat.label}</span>
                <span className="ml-auto text-xs text-[var(--c-text-3)]">{ports.length} 件</span>
                <span className={`text-[var(--c-text-3)] text-xs transition-transform inline-block ${isOpen ? 'rotate-90' : ''}`}>▶</span>
              </button>
              {isOpen && (
                ports.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-[var(--c-text-3)]">
                    {cat.id === 'custom' ? 'カスタムポートがまだありません' : '該当なし'}
                  </p>
                ) : (
                  <div className="divide-y divide-[var(--c-border)]">
                    {ports.map((p, idx) => (
                      <div
                        key={`${p.port}-${p.protocol}-${idx}`}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--c-bg-2)] transition-colors"
                      >
                        <code className="font-mono font-bold text-sm w-12 shrink-0">{p.port}</code>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-mono shrink-0 ${PROTO_COLOR[p.protocol] || ''}`}>
                          {p.protocol}
                        </span>
                        <span className="text-sm font-medium text-[var(--c-text)] shrink-0">{p.service}</span>
                        <span className="text-xs text-[var(--c-text-2)] flex-1 min-w-0 truncate">{p.memo}</span>
                        {!p.isBuiltIn && p.id !== undefined && (
                          <div className="flex gap-1 shrink-0">
                            <button onClick={() => openForm(p as unknown as OpsPort)} className="btn btn--ghost btn--sm text-xs">編集</button>
                            <button onClick={() => deletePort(p.id!)} className="btn btn--ghost btn--sm text-xs text-red-400 hover:text-red-300">削除</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>
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

  const switchSection = useCallback((s: Section) => {
    setActive(s);
    localStorage.setItem(STORAGE_ACTIVE_SECTION, s);
  }, []);

  const { config, setActiveTab: setGlobalTab } = useTabStore();
  useEffect(() => {
    const label = config.find(t => t.pageSrc === 'pages/ops.html')?.label;
    searchRegistry.register('ops-nav', async (query) => {
      const q = query.toLowerCase();
      return SECTIONS
        .filter(s => s.label.toLowerCase().includes(q))
        .map(s => ({
          id: `ops-nav-${s.id}`,
          pageSrc: 'pages/ops.html',
          title: s.label,
          excerpt: '',
          onSelect: () => { if (label) setGlobalTab(label); switchSection(s.id); },
        }));
    });
    return () => searchRegistry.unregister('ops-nav');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, setGlobalTab]);

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
      <div className="flex-1 overflow-auto">
        {active === 'log-viewer'  && <div className="p-4 h-full flex flex-col"><LogViewer /></div>}
        {active === 'cron'        && <div className="p-4"><CronSection /></div>}
        {active === 'http-status' && <div className="p-4"><HttpStatusSection /></div>}
        {active === 'ports'       && <PortsSection />}
      </div>
    </div>
  );
}
