// ==================================================
// Toast: トースト通知コンポーネント
// ==================================================
// 使い方:
//   <ToastContainer /> をルートに配置
//   useToast().success('メッセージ') で表示

import '../styles/components/toast.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type ToastType = 'success' | 'error' | 'info' | '';

interface ToastState {
  message: string;
  type: ToastType;
  visible: boolean;
  hiding: boolean;
}

// シングルトンの setter をモジュールスコープで保持
type ShowFn = (message: string, type?: ToastType) => void;
let _globalShow: ShowFn | null = null;

/** グローバル Toast API（コンポーネント外から呼び出す用） */
export const Toast = {
  show: (message: string, type: ToastType = '') => _globalShow?.(message, type),
  success: (message: string) => _globalShow?.(message, 'success'),
  error: (message: string) => _globalShow?.(message, 'error'),
  info: (message: string) => _globalShow?.(message, 'info'),
};

/** アプリルートに1つだけ配置するコンテナ */
export function ToastContainer() {
  const [state, setState] = useState<ToastState>({
    message: '',
    type: '',
    visible: false,
    hiding: false,
  });
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((message: string, type: ToastType = '') => {
    // 既存タイマーをクリア
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (fadeTimer.current) clearTimeout(fadeTimer.current);

    setState({ message, type, visible: true, hiding: false });

    hideTimer.current = setTimeout(() => {
      setState((prev) => ({ ...prev, hiding: true }));
      fadeTimer.current = setTimeout(() => {
        setState((prev) => ({ ...prev, visible: false, hiding: false }));
      }, 220);
    }, 2780);
  }, []);

  // グローバル参照を登録
  useEffect(() => {
    _globalShow = show;
    return () => {
      _globalShow = null;
    };
  }, [show]);

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
    };
  }, []);

  if (!state.visible) return null;

  const typeClass = state.type ? ` toast--${state.type}` : '';
  const hidingClass = state.hiding ? ' toast--hiding' : '';

  return createPortal(
    <div
      className={`toast${typeClass}${hidingClass}`}
      role="status"
      aria-live="polite"
    >
      {state.message}
    </div>,
    document.body,
  );
}

/** コンポーネント内で使う hook */
export function useToast() {
  return {
    show: (message: string, type?: ToastType) => Toast.show(message, type),
    success: (message: string) => Toast.success(message),
    error: (message: string) => Toast.error(message),
    info: (message: string) => Toast.info(message),
  };
}
