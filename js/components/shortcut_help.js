// ==================================================
// ShortcutHelp — ショートカットキー一覧モーダル
// ==================================================
// 使い方:
//   ShortcutHelp.register(categories)  ページ固有のショートカットを登録
//   ShortcutHelp.show()                モーダルを表示
//   ShortcutHelp.hide()                モーダルを非表示
//
// categories 形式:
//   [{ name: 'カテゴリ名', shortcuts: [{ keys: ['Ctrl', 'K'], description: '説明' }] }]
//
// HTML は初回 show() 時に自動生成（自己挿入型）
// ==================================================

const ShortcutHelp = (() => {
  // 共通ショートカットは自動登録
  let _categories = [
    {
      name: '共通',
      shortcuts: [
        { keys: ['?'], description: 'ショートカット一覧を表示' },
      ],
    },
  ];
  let _mounted = false;

  // Mac 判定（userAgentData → platform → userAgent の順にフォールバック）
  const _isMac = (() => {
    const p = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
    if (p) return /mac/i.test(p);
    return /Macintosh|Mac OS X/i.test(navigator.userAgent);
  })();

  /** キー表記を Mac 向けに変換する */
  function _fmtKey(key) {
    if (_isMac) {
      if (key === 'Ctrl')  return '⌘';
      if (key === 'Alt')   return '⌥';
      if (key === 'Shift') return '⇧';
    }
    return key;
  }

  /** モーダル HTML を body に挿入する（初回のみ） */
  function _mount() {
    if (_mounted) return;
    _mounted = true;

    const overlay = document.createElement('div');
    overlay.className = 'shortcut-help-overlay';
    overlay.id = 'shortcut-help-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="shortcut-help-backdrop"></div>
      <div class="shortcut-help-modal" role="dialog" aria-label="ショートカット一覧" aria-modal="true">
        <div class="shortcut-help-header">
          <h2>ショートカット一覧</h2>
          <button class="shortcut-help-close" aria-label="閉じる">×</button>
        </div>
        <div class="shortcut-help-body" id="shortcut-help-body"></div>
      </div>
    `;

    overlay.querySelector('.shortcut-help-backdrop').addEventListener('click', ShortcutHelp.hide);
    overlay.querySelector('.shortcut-help-close').addEventListener('click', ShortcutHelp.hide);
    document.body.appendChild(overlay);
  }

  /** カテゴリ一覧を body に描画する */
  function _render() {
    const body = document.getElementById('shortcut-help-body');
    if (!body) return;

    body.innerHTML = _categories.map(cat => `
      <div class="shortcut-help-section">
        <h3 class="shortcut-help-category">${escapeHtml(cat.name)}</h3>
        <table class="shortcut-help-table">
          <tbody>
            ${cat.shortcuts.map(sc => `
              <tr>
                <td class="shortcut-help-keys">${sc.keys.map(k => `<kbd>${escapeHtml(_fmtKey(k))}</kbd>`).join('')}</td>
                <td class="shortcut-help-desc">${escapeHtml(sc.description)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `).join('');
  }

  // `?` キーでモーダルを開く（input/textarea/select/[contenteditable] 中は無視）
  document.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    const tag = document.activeElement?.tagName?.toLowerCase();
    if (['input', 'textarea', 'select'].includes(tag)) return;
    if (document.activeElement?.isContentEditable) return;

    const overlay = document.getElementById('shortcut-help-overlay');
    if (e.key === '?') {
      e.preventDefault();
      if (overlay && !overlay.hidden) {
        ShortcutHelp.hide();
      } else {
        ShortcutHelp.show();
      }
    }
    if (e.key === 'Escape' && overlay && !overlay.hidden) {
      ShortcutHelp.hide();
    }
  });

  return {
    /**
     * ページ固有のショートカット定義を登録する
     * @param {Array<{name: string, shortcuts: Array<{keys: string[], description: string}>}>} categories
     */
    register(categories) {
      _categories = [..._categories, ...categories];
    },

    /** モーダルを表示する */
    show() {
      _mount();
      _render();
      const overlay = document.getElementById('shortcut-help-overlay');
      if (overlay) overlay.hidden = false;
    },

    /** モーダルを非表示にする */
    hide() {
      const overlay = document.getElementById('shortcut-help-overlay');
      if (overlay) overlay.hidden = true;
    },
  };
})();
