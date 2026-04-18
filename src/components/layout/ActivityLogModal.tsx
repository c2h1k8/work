// ==================================================
// ActivityLogModal: アクティビティログモーダル
// ==================================================

import '../../styles/components/activity-log.css';
import { useCallback, useEffect, useRef, useState } from 'react';
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

const ACTION_LABEL: Record<string, string> = {
  create:   '追加',
  delete:   '削除',
  archive:  'アーカイブ',
  complete: '完了',
  update:   '更新',
  move:     '移動',
};

const LIMIT = 50;

interface ActivityLogModalProps {
  open: boolean;
  onClose: () => void;
}

export function ActivityLogModal({ open, onClose }: ActivityLogModalProps) {
  const [logs, setLogs]           = useState<ActivityLog[]>([]);
  const [hasMore, setHasMore]     = useState(true);
  const [loading, setLoading]     = useState(false);
  const [pages, setPages]         = useState<Set<ActivityPage>>(
    new Set(Object.keys(PAGE_META) as ActivityPage[])
  );
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate]     = useState('');
  const offsetRef  = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const batch = await activityDB.query({
        pages: Array.from(pages) as ActivityPage[],
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        offset: offsetRef.current,
        limit: LIMIT,
      });
      setLogs((prev) => [...prev, ...batch]);
      offsetRef.current += batch.length;
      setHasMore(batch.length === LIMIT);
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, pages, startDate, endDate]);

  const reset = useCallback(() => {
    setLogs([]);
    offsetRef.current = 0;
    setHasMore(true);
  }, []);

  // open したら読み込み開始
  useEffect(() => {
    if (!open) return;
    reset();
  }, [open, pages, startDate, endDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // reset 後に loadMore を起動
  useEffect(() => {
    if (open && logs.length === 0 && hasMore && !loading) {
      loadMore();
    }
  }, [open, logs.length, hasMore, loading, loadMore]);

  // IntersectionObserver で無限スクロール
  useEffect(() => {
    if (!open || !sentinelRef.current) return;
    observerRef.current = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { threshold: 0.1 }
    );
    observerRef.current.observe(sentinelRef.current);
    return () => observerRef.current?.disconnect();
  }, [open, loadMore]);

  // ESC で閉じる
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

  if (!open) return null;

  return createPortal(
    <div className="actlog-overlay" role="dialog" aria-modal="true" aria-label="アクティビティログ">
      <div className="actlog-backdrop" onClick={onClose} />
      <div className="actlog-modal">
        <div className="actlog-modal__header">
          <h2 className="actlog-modal__title">アクティビティログ</h2>
          <button
            type="button"
            className="actlog-modal__close"
            aria-label="閉じる"
            onClick={onClose}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
              <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
            </svg>
          </button>
        </div>

        {/* フィルター */}
        <div className="actlog-modal__filters">
          <div className="actlog-filters__row">
            <span className="actlog-filters__label">日付</span>
            <div className="actlog-filters__dates">
              <DatePicker
                value={startDate}
                onChange={(d) => { setStartDate(d); reset(); }}
                onClear={() => { setStartDate(''); reset(); }}
                placeholder="開始日"
                className="actlog-datepicker"
              />
              <span className="actlog-filters__sep">〜</span>
              <DatePicker
                value={endDate}
                onChange={(d) => { setEndDate(d); reset(); }}
                onClear={() => { setEndDate(''); reset(); }}
                placeholder="終了日"
                className="actlog-datepicker"
              />
            </div>
          </div>
          <div className="actlog-filters__row">
            <span className="actlog-filters__label">ページ</span>
            <div className="actlog-filters__pages">
              {(Object.entries(PAGE_META) as [ActivityPage, { label: string; color: string }][]).map(
                ([page, meta]) => (
                  <label key={page} className="actlog-page-chip">
                    <input
                      type="checkbox"
                      checked={pages.has(page)}
                      onChange={() => togglePage(page)}
                    />
                    <span className="actlog-page-chip__badge" style={{ background: meta.color }} />
                    <span>{meta.label}</span>
                  </label>
                )
              )}
            </div>
          </div>
        </div>

        {/* ログ一覧 */}
        <div className="actlog-modal__body">
          {logs.length === 0 && !loading ? (
            <p className="actlog-empty">ログがありません</p>
          ) : (
            <ul className="actlog-list">
              {logs.map((log) => {
                const meta = PAGE_META[log.page as ActivityPage];
                return (
                  <li key={log.id} className="actlog-item">
                    <span
                      className="actlog-item__badge"
                      style={{ background: meta?.color ?? '#888' }}
                    >
                      {meta?.label ?? log.page}
                    </span>
                    <span className="actlog-item__action">
                      {ACTION_LABEL[log.action] ?? log.action}
                    </span>
                    <span className="actlog-item__summary">{log.summary}</span>
                    <span className="actlog-item__date">
                      {new Date(log.created_at).toLocaleString('ja-JP', {
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {loading && <div className="actlog-loading">読み込み中…</div>}
          <div ref={sentinelRef} style={{ height: 1 }} />
        </div>
      </div>

    </div>,
    document.body,
  );
}
