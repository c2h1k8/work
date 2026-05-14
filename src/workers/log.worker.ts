// log.worker.ts — ログ解析を Web Worker で実行

interface LogLine {
  lineNo: number;
  text: string;
  textLower: string;
  level: string;
  color: string;
  timestamp: Date | null;
}

interface WorkerRequest  { id: number; text: string; }
interface WorkerResponse { id: number; lines: LogLine[]; }

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(data: WorkerResponse): void;
};

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

function detectLevel(lineText: string): { level: string; color: string } {
  for (const p of LOG_LEVEL_PATTERNS) {
    if (p.regex.test(lineText)) return { level: p.level, color: p.color };
  }
  return { level: 'OTHER', color: 'other' };
}

function detectTimestamp(lineText: string): Date | null {
  for (const pat of TIMESTAMP_PATTERNS) {
    const m = lineText.match(pat);
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

ctx.onmessage = (e) => {
  const { id, text } = e.data;
  const lines: LogLine[] = text.split('\n').map((lineText, i) => {
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
  ctx.postMessage({ id, lines });
};
