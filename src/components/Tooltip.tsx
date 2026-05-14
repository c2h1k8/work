// Tooltip — カーソル追従型カスタムツールチップ（Vanilla JS版 tooltip.js の移行実装）
// 使い方: <Tooltip content="..." type="danger"><要素 /></Tooltip>
// ・マウス移動に追従（cursor.x + 12, cursor.y - 32）
// ・遅延なし即時表示（移行前と同じ挙動）

import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';

export interface TooltipProps {
  content: string;
  type?: 'default' | 'danger' | 'warning';
  children: React.ReactNode;
  className?: string;
}

export function Tooltip({ content, type = 'default', children, className = '' }: TooltipProps) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  void wrapRef; // 位置計算の拡張用に保持

  const handleMouseOver = useCallback((e: React.MouseEvent) => {
    if (!content) return;
    setPos({ x: e.clientX, y: e.clientY });
  }, [content]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!content) return;
    setPos({ x: e.clientX, y: e.clientY });
  }, [content]);

  const handleMouseOut = useCallback(() => {
    setPos(null);
  }, []);

  // content が変わった瞬間（編集開始・終了など）に必ず非表示にする
  useEffect(() => {
    setPos(null);
  }, [content]);

  if (!content) return <>{children}</>;

  const borderCls = type === 'danger'
    ? 'border-l-[var(--c-danger,#ef4444)]'
    : type === 'warning'
      ? 'border-l-[var(--c-warning,#f59e0b)]'
      : 'border-l-transparent';

  const bgCls = type === 'danger'
    ? 'bg-[color-mix(in_srgb,var(--c-danger,#ef4444)_12%,var(--c-tooltip-bg,#1e1e1e))]'
    : type === 'warning'
      ? 'bg-[color-mix(in_srgb,var(--c-warning,#f59e0b)_12%,var(--c-tooltip-bg,#1e1e1e))]'
      : 'bg-[var(--c-tooltip-bg,#1e1e1e)]';

  return (
    <div
      ref={wrapRef}
      className={`contents ${className}`}
      onMouseOver={handleMouseOver}
      onMouseMove={handleMouseMove}
      onMouseOut={handleMouseOut}
    >
      {children}
      {pos && createPortal(
        <div
          className={`fixed z-[900] px-[10px] py-[5px] text-[11px] leading-relaxed whitespace-pre-line pointer-events-none rounded-[var(--radius-sm)] border-l-[3px] font-[tabular-nums] shadow-[var(--shadow-md,0_4px_12px_rgba(0,0,0,0.3))] text-[var(--c-tooltip-text,#e5e5e5)] ${borderCls} ${bgCls}`}
          style={{ left: pos.x + 12, top: pos.y - 32 }}
        >
          {content}
        </div>,
        document.body,
      )}
    </div>
  );
}
