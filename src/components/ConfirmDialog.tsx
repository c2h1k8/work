// ==================================================
// ConfirmDialog: 確認ダイアログ（native confirm() の代替）
// ==================================================
// 使い方:
//   <ConfirmHost /> を App に1つマウント
//   const ok = await confirmDialog('削除しますか？');
//   const ok = await confirmDialog({ message, okLabel, cancelLabel, danger });
// デザイントークン準拠（ダークモード対応）。Enter=OK / Esc・背景クリック=キャンセル

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface ConfirmOptions {
  message: string;
  /** OK ボタンのラベル（デフォルト: OK） */
  okLabel?: string;
  /** キャンセルボタンのラベル（デフォルト: キャンセル） */
  cancelLabel?: string;
  /** 破壊的操作（OK ボタンを btn--danger に） */
  danger?: boolean;
}

type ActiveConfirm = Required<ConfirmOptions> & { resolve: (ok: boolean) => void };

// ConfirmHost がマウント時に登録するシングルトン
let _show: ((c: ActiveConfirm) => void) | null = null;

/** 確認ダイアログを表示し、OK なら true を resolve する */
export function confirmDialog(opts: string | ConfirmOptions): Promise<boolean> {
  const o = typeof opts === 'string' ? { message: opts } : opts;
  return new Promise<boolean>((resolve) => {
    if (!_show) {
      // ホスト未マウント時のフォールバック（テスト環境等）
      resolve(window.confirm(o.message));
      return;
    }
    _show({
      message: o.message,
      okLabel: o.okLabel ?? 'OK',
      cancelLabel: o.cancelLabel ?? 'キャンセル',
      danger: o.danger ?? false,
      resolve,
    });
  });
}

export function ConfirmHost() {
  const [active, setActive] = useState<ActiveConfirm | null>(null);
  const activeRef = useRef<ActiveConfirm | null>(null);
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    _show = (c) => {
      // 表示中に新しい確認が来たら前のものはキャンセル扱い（通常は起こらない）
      activeRef.current?.resolve(false);
      activeRef.current = c;
      setActive(c);
    };
    return () => { _show = null; };
  }, []);

  function close(ok: boolean) {
    activeRef.current?.resolve(ok);
    activeRef.current = null;
    setActive(null);
  }

  // Enter=OK / Esc=キャンセル。capture + stopPropagation で
  // 下層のグローバルキーハンドラ（モーダルの Esc 等）に漏らさない
  useEffect(() => {
    if (!active) return;
    okRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.isComposing) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); close(true); }
    }
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (!active) return null;

  return createPortal(
    <div className="fixed inset-0 z-[900] flex items-center justify-center" role="alertdialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={() => close(false)} />
      <div className="relative bg-[var(--c-bg)] border border-[var(--c-border)] rounded-xl shadow-[var(--shadow-lg,0_12px_40px_rgba(0,0,0,.25))] w-[380px] max-w-[calc(100vw-32px)] p-5">
        <p className="text-sm text-[var(--c-fg)] whitespace-pre-line leading-relaxed">{active.message}</p>
        <div className="flex justify-end gap-2 mt-5">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => close(false)}>
            {active.cancelLabel}
          </button>
          <button type="button" ref={okRef}
            className={`btn btn--sm ${active.danger ? 'btn--danger' : 'btn--primary'}`}
            onClick={() => close(true)}>
            {active.okLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
