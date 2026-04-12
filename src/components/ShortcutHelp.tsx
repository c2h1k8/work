// ==================================================
// ShortcutHelp: ショートカットキー一覧モーダル
// ==================================================
// 使い方:
//   <ShortcutHelpProvider categories={[...]} /> をページに配置
//   ? キーで開く / Escape で閉じる

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { escapeHtml } from '../core/utils';

export interface ShortcutItem {
  keys: string[];
  description: string;
}

export interface ShortcutCategory {
  name: string;
  shortcuts: ShortcutItem[];
}

interface ShortcutHelpProps {
  /** ページ固有のショートカット定義 */
  categories?: ShortcutCategory[];
}

const _isMac = (() => {
  const p =
    (navigator as Navigator & { userAgentData?: { platform: string } }).userAgentData?.platform ??
    navigator.platform ??
    '';
  return p ? /mac/i.test(p) : /Macintosh|Mac OS X/i.test(navigator.userAgent);
})();

function fmtKey(key: string): string {
  if (_isMac) {
    if (key === 'Ctrl')  return '⌘';
    if (key === 'Alt')   return '⌥';
    if (key === 'Shift') return '⇧';
  }
  return key;
}

const COMMON_CATEGORIES: ShortcutCategory[] = [
  {
    name: '共通',
    shortcuts: [{ keys: ['?'], description: 'ショートカット一覧を表示' }],
  },
];

export function ShortcutHelp({ categories = [] }: ShortcutHelpProps) {
  const [open, setOpen] = useState(false);

  const toggle = useCallback(() => setOpen((v) => !v), []);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      const tag = (document.activeElement as HTMLElement)?.tagName?.toLowerCase();
      if (['input', 'textarea', 'select'].includes(tag ?? '')) return;
      if ((document.activeElement as HTMLElement)?.isContentEditable) return;

      if (e.key === '?') {
        e.preventDefault();
        toggle();
      }
      if (e.key === 'Escape' && open) {
        close();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, toggle, close]);

  if (!open) return null;

  const allCategories = [...COMMON_CATEGORIES, ...categories];

  return createPortal(
    <div
      className="shortcut-help-overlay"
      role="dialog"
      aria-label="ショートカット一覧"
      aria-modal="true"
    >
      <div className="shortcut-help-backdrop" onClick={close} />
      <div className="shortcut-help-modal">
        <div className="shortcut-help-header">
          <h2>ショートカット一覧</h2>
          <button
            className="shortcut-help-close"
            aria-label="閉じる"
            onClick={close}
            type="button"
          >
            ×
          </button>
        </div>
        <div className="shortcut-help-body">
          {allCategories.map((cat) => (
            <div key={cat.name} className="shortcut-help-section">
              <h3 className="shortcut-help-category">{cat.name}</h3>
              <table className="shortcut-help-table">
                <tbody>
                  {cat.shortcuts.map((sc, i) => (
                    <tr key={i}>
                      <td className="shortcut-help-keys">
                        {sc.keys.map((k) => (
                          <kbd key={k}
                            dangerouslySetInnerHTML={{ __html: escapeHtml(fmtKey(k)) }}
                          />
                        ))}
                      </td>
                      <td className="shortcut-help-desc">{sc.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
