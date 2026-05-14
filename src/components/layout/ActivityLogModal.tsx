// ==================================================
// ActivityLogModal: アクティビティログモーダル
// ==================================================

import styles from '../../styles/components/activity-log.module.css';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { activityDB } from '../../db/activity_db';
import type { ActivityLog, ActivityPage } from '../../db/activity_db';
import { DatePicker } from '../DatePicker';

const PAGE_META: Record<ActivityPage, { label: string; color: string }> = {
  todo:      { label: 'TODO',           color: '#4f80ff' },
  note:      { label: 'ノート',         color: '#22c55e' },
  snippet:   { label: 'スニペット',     color: '#a855f7' },
  dashboard: { label: 'ダッシュボード', color: '#f97316' },
  sql:       { label: 'SQL',            color: '#ef4444' },
  wbs:       { label: 'WBS',            color: '#14b8a6' },
};

const LIMIT = 50;

// --------------------------------------------------
// 日時フォーマット
// --------------------------------------------------
function formatDateLabel(isoStr: string): string {
  const d         = new Date(isoStr);
  const today     = new Date();
  const todayDay  = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const targetDay = new Date(d.getFullYear(),     d.getMonth(),     d.getDate());
  const diff      = Math.round((todayDay.getTime() - targetDay.getTime()) / 86400000);
  if (diff === 0) return '今日';
  if (diff === 1) return '昨日';
  if (d.getFullYear() === today.getFullYear()) {
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function formatTime(isoStr: string): string {
  const d = new Date(isoStr);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

interface ActivityLogModalProps {
  open: boolean;
  onClose: () => void;
}

export function ActivityLogModal({ open, onClose }: ActivityLogModalProps) {
  const [logs, setLogs]       = useState<ActivityLog[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [pages, setPages]     = useState<Set<ActivityPage>>(
    new Set(Object.keys(PAGE_META) as ActivityPage[])
  );
  const [startDate, setStartDate] = useState('');
  const [endDate,   setEndDate]   = useState('');
  const offsetRef    = useRef(0);
  const bodyRef      = useRef<HTMLDivElement>(null);
  const sentinelRef  = useRef<HTMLDivElement>(null);
  const observerRef  = useRef<IntersectionObserver | null>(null);
  const loadMoreRef  = useRef<() => void>(() => {});

  const fetchLock = useRef(false);

  const loadMore = useCallback(async () => {
    if (fetchLock.current || !hasMore) return;
    fetchLock.current = true;
    setLoading(true);
    try {
      const batch = await activityDB.query({
        pages: Array.from(pages) as ActivityPage[],
        startDate: startDate || undefined,
        endDate:   endDate   || undefined,
        offset: offsetRef.current,
        limit:  LIMIT,
      });
      setLogs((prev) => [...prev, ...batch]);
      offsetRef.current += batch.length;
      setHasMore(batch.length === LIMIT);
    } finally {
      setLoading(false);
      fetchLock.current = false;
    }
  }, [hasMore, pages, startDate, endDate]);

  const reset = useCallback(() => {
    setLogs([]);
    offsetRef.current = 0;
    setHasMore(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    reset();
  }, [open, pages, startDate, endDate]); // eslint-disable-line react-hooks/exhaustive-deps

  loadMoreRef.current = loadMore;

  // reset後に hasMore が true に戻ったタイミングで初回ロードを起動
  useEffect(() => {
    if (open && logs.length === 0 && hasMore && !fetchLock.current) loadMoreRef.current();
  }, [open, logs.length, hasMore]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || !sentinelRef.current || !bodyRef.current) return;
    observerRef.current = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMoreRef.current(); },
      { root: bodyRef.current, threshold: 0.1 }
    );
    observerRef.current.observe(sentinelRef.current);
    return () => observerRef.current?.disconnect();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const togglePage = useCallback((page: ActivityPage) => {
    setPages((prev) => {
      const next = new Set(prev);
      if (next.has(page)) { next.delete(page); } else { next.add(page); }
      return next;
    });
    reset();
  }, [reset]);

  // 日付ラベルでグループ化
  const grouped: { label: string; items: ActivityLog[] }[] = [];
  for (const log of logs) {
    const label = formatDateLabel(log.created_at);
    const last  = grouped[grouped.length - 1];
    if (!last || last.label !== label) {
      grouped.push({ label, items: [log] });
    } else {
      last.items.push(log);
    }
  }

  if (!open) return null;

  return createPortal(
    <div className={styles['actlog-overlay']} role="dialog" aria-modal="true" aria-label="アクティビティログ">
      <div className={styles['actlog-backdrop']} onClick={onClose} />
      <div className={styles['actlog-modal']}>

        {/* ヘッダー */}
        <div className={styles['actlog-modal__header']}>
          <h2 className={styles['actlog-modal__title']}>アクティビティログ</h2>
          <button type="button" className={styles['actlog-modal__close']} aria-label="閉じる" onClick={onClose}>
            <svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
              <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
            </svg>
          </button>
        </div>

        {/* フィルター */}
        <div className={styles['actlog-modal__filters']}>
          <div className={styles['actlog-filters__row']}>
            <span className={styles['actlog-filters__label']}>日付</span>
            <div className={styles['actlog-filters__dates']}>
              <DatePicker
                value={startDate}
                onChange={(d) => { setStartDate(d); reset(); }}
                onClear={() => { setStartDate(''); reset(); }}
                placeholder="開始日"
                className="actlog-datepicker"
              />
              <span className={styles['actlog-filters__sep']}>〜</span>
              <DatePicker
                value={endDate}
                onChange={(d) => { setEndDate(d); reset(); }}
                onClear={() => { setEndDate(''); reset(); }}
                placeholder="終了日"
                className="actlog-datepicker"
              />
            </div>
          </div>
          <div className={styles['actlog-filters__row']}>
            <span className={styles['actlog-filters__label']}>ページ</span>
            <div className={styles['actlog-filters__pages']}>
              {(Object.entries(PAGE_META) as [ActivityPage, { label: string; color: string }][]).map(
                ([page, meta]) => (
                  <label key={page} className={styles['actlog-page-chip']}>
                    <input type="checkbox" checked={pages.has(page)} onChange={() => togglePage(page)} />
                    <span className={styles['actlog-page-chip__badge']} style={{ background: meta.color }} />
                    <span>{meta.label}</span>
                  </label>
                )
              )}
            </div>
          </div>
        </div>

        {/* ログ一覧 */}
        <div ref={bodyRef} className={styles['actlog-modal__body']}>
          {logs.length === 0 && !loading ? (
            <p className={styles['actlog-empty']}>ログがありません</p>
          ) : (
            <ul className={styles['actlog-list']}>
              {grouped.map((group) => (
                <React.Fragment key={group.label}>
                  <li className={styles['actlog-date-group']}>{group.label}</li>
                  {group.items.map((log) => {
                    const meta = PAGE_META[log.page as ActivityPage];
                    return (
                      <li key={log.id} className={styles['actlog-item']}>
                        <span className={styles['actlog-item__badge']} style={{ background: meta?.color ?? '#888' }}>
                          {meta?.label ?? log.page}
                        </span>
                        <span className={styles['actlog-item__summary']}>{log.summary}</span>
                        <span className={styles['actlog-item__time']}>{formatTime(log.created_at)}</span>
                      </li>
                    );
                  })}
                </React.Fragment>
              ))}
            </ul>
          )}
          {loading && (
            <div className={styles['actlog-loading']}>
              <span className={styles['actlog-loading__dot']} />
              <span className={styles['actlog-loading__dot']} />
              <span className={styles['actlog-loading__dot']} />
            </div>
          )}
          <div ref={sentinelRef} style={{ height: 1 }} />
        </div>

      </div>
    </div>,
    document.body,
  );
}
