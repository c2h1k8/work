'use strict';

// ==================================================
// 運用ツール — 定数定義
// ==================================================
// ログレベル・タイムスタンプパターン、曜日・月名、
// HTTPステータスコード、ポート番号のデータ定義
// ==================================================

// ── ログビューア: レベル検出パターン ──────────────
const LOG_LEVEL_PATTERNS = [
  { level: 'ERROR', regex: /\b(ERROR|FATAL|SEVERE|CRITICAL)\b/i, color: 'error' },
  { level: 'WARN',  regex: /\b(WARN|WARNING)\b/i,                color: 'warn'  },
  { level: 'INFO',  regex: /\b(INFO|NOTICE)\b/i,                 color: 'info'  },
  { level: 'DEBUG', regex: /\b(DEBUG|TRACE|FINE|FINER|FINEST)\b/i, color: 'debug' },
];

// ── ログビューア: タイムスタンプ検出パターン ──────
const TIMESTAMP_PATTERNS = [
  /\d{4}[-/]\d{2}[-/]\d{2}[T ]\d{2}:\d{2}:\d{2}/,
  /\d{2}[-/]\d{2}[-/]\d{4} \d{2}:\d{2}:\d{2}/,
  /\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}/,
  /\d{2}:\d{2}:\d{2}[.,]\d{3}/,
];

// ── cron式: 曜日・月名（日本語） ─────────────────
const DOW_JA  = ['日','月','火','水','木','金','土'];
const MON_JA  = ['1','2','3','4','5','6','7','8','9','10','11','12'];

// ── HTTPステータスコード: カテゴリ定義 ────────────
const STATUS_CATEGORIES = [
  { prefix: '1xx', label: 'Informational', colorVar: '--c-info',    desc: '情報レスポンス' },
  { prefix: '2xx', label: 'Success',       colorVar: '--c-success', desc: '成功レスポンス' },
  { prefix: '3xx', label: 'Redirection',   colorVar: '--c-warning', desc: 'リダイレクト' },
  { prefix: '4xx', label: 'Client Error',  colorVar: '--c-danger',  desc: 'クライアントエラー' },
  { prefix: '5xx', label: 'Server Error',  colorVar: '--c-danger',  desc: 'サーバエラー' },
];

// ── HTTPステータスコード: コード一覧 ──────────────
const HTTP_STATUS_CODES = [
  // 1xx
  { code: 100, name: 'Continue',             category: '1xx', description: 'リクエストの継続を許可', cause: 'クライアントがリクエスト継続の確認を求めた', solution: '残りのリクエストを送信する' },
  { code: 101, name: 'Switching Protocols',  category: '1xx', description: 'プロトコルを切り替える', cause: 'Upgrade ヘッダーで別プロトコルへの切替をリクエスト', solution: 'WebSocket 接続などで正常' },
  { code: 102, name: 'Processing',           category: '1xx', description: 'サーバが処理中', cause: 'WebDAV リクエストなど長時間処理', solution: '完了を待つ' },
  { code: 103, name: 'Early Hints',          category: '1xx', description: 'プリロードヒントを返す', cause: 'Link ヘッダーを先送りしてブラウザに事前ロードさせる', solution: 'パフォーマンス最適化として正常' },
  // 2xx
  { code: 200, name: 'OK',                   category: '2xx', description: 'リクエスト成功', cause: '正常に処理された', solution: '特に対処不要', starred: true },
  { code: 201, name: 'Created',              category: '2xx', description: 'リソース作成成功', cause: 'POST/PUT でリソースが新規作成された', solution: 'Location ヘッダーで新リソース URL を確認' },
  { code: 202, name: 'Accepted',             category: '2xx', description: '受付済み（処理未完了）', cause: '非同期処理のキューに追加された', solution: '別途完了通知を待つ' },
  { code: 204, name: 'No Content',           category: '2xx', description: '成功・レスポンスボディなし', cause: 'DELETE や一部 PUT で正常', solution: '特に対処不要' },
  { code: 206, name: 'Partial Content',      category: '2xx', description: '部分コンテンツ', cause: 'Range ヘッダーで一部リクエストした', solution: '分割ダウンロード・動画ストリーミングで正常' },
  // 3xx
  { code: 301, name: 'Moved Permanently',    category: '3xx', description: '恒久リダイレクト', cause: 'URL が永続的に変更された', solution: 'Location ヘッダーの URL に更新する', starred: true },
  { code: 302, name: 'Found',                category: '3xx', description: '一時リダイレクト', cause: 'URL が一時的に変更された', solution: 'Location ヘッダーの URL にアクセス（元 URL は維持）', starred: true },
  { code: 303, name: 'See Other',            category: '3xx', description: 'GET でリダイレクト', cause: 'POST 後の結果を GET で取得する', solution: 'PRG パターンとして正常' },
  { code: 304, name: 'Not Modified',         category: '3xx', description: 'キャッシュ有効', cause: '条件付きGETでキャッシュが最新', solution: 'キャッシュを使用する（正常）' },
  { code: 307, name: 'Temporary Redirect',   category: '3xx', description: '一時リダイレクト（メソッド維持）', cause: 'POST など元のメソッドを維持したリダイレクト', solution: 'Location ヘッダーの URL に同じメソッドでアクセス' },
  { code: 308, name: 'Permanent Redirect',   category: '3xx', description: '恒久リダイレクト（メソッド維持）', cause: 'メソッドを維持したまま永続的に移動', solution: 'Location ヘッダーの URL に更新する' },
  // 4xx
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
  // 5xx
  { code: 500, name: 'Internal Server Error', category: '5xx', description: 'サーバ内部エラー', cause: 'サーバ側でエラーが発生した', solution: 'サーバログを確認する', starred: true },
  { code: 501, name: 'Not Implemented',      category: '5xx', description: '未実装のメソッド', cause: 'サーバが要求されたメソッドをサポートしていない', solution: '対応するメソッドを使用する' },
  { code: 502, name: 'Bad Gateway',          category: '5xx', description: 'ゲートウェイエラー', cause: 'プロキシ・ロードバランサが上流サーバから不正な応答を受けた', solution: '上流サーバを確認する', starred: true },
  { code: 503, name: 'Service Unavailable',  category: '5xx', description: 'サービス利用不可', cause: 'サーバの過負荷・メンテナンス中', solution: 'Retry-After ヘッダーを確認して待機する', starred: true },
  { code: 504, name: 'Gateway Timeout',      category: '5xx', description: 'ゲートウェイタイムアウト', cause: 'プロキシが上流サーバからのレスポンスをタイムアウト', solution: '上流サーバの応答時間を確認する' },
  { code: 507, name: 'Insufficient Storage', category: '5xx', description: 'ストレージ不足', cause: 'サーバのディスクが満杯', solution: 'ディスクを確保する' },
];

// ── ポート番号: 定番ポート一覧 ────────────────────
const BUILTIN_PORTS = [
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
