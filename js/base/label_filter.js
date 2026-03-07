// ==================================================
// LabelFilter: 汎用ラベルフィルタードロップダウン
//
// 使い方:
//   const inst = LabelFilter.create(containerEl, {
//     items: [{ id: any, name: string, color?: string }],
//     selected: new Set(),   // 初期選択 ID の Set
//     label: 'ラベル',       // トリガーボタンの表示名
//     icon: '<svg...>',      // ボタンアイコン HTML（省略可）
//     onChange: (selectedSet) => void,
//   });
//   inst.update(items, selected);  // アイテムと選択を更新して再描画
//   inst.clear();                  // 全選択を解除して onChange を発火
//   inst.getSelected();            // 現在の選択 Set を返す
//   inst.destroy();                // DOM を削除してイベントを解除
//
// CSS は css/base/label_filter.css を読み込む。
// ==================================================

const LabelFilter = (() => {
  function create(container, opts = {}) {
    const {
      items = [],
      selected = new Set(),
      label = 'ラベル',
      icon = _defaultIcon(),
      onChange,
    } = opts;

    let _items = [...items];
    let _selected = new Set(selected);

    // ── DOM 構築 ──────────────────────────────────────────
    const wrapper = document.createElement('div');
    wrapper.className = 'lf-dropdown';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'lf-trigger';

    const iconEl = document.createElement('span');
    iconEl.className = 'lf-trigger__icon';
    iconEl.innerHTML = icon;

    const labelEl = document.createElement('span');
    labelEl.className = 'lf-trigger__label';
    labelEl.textContent = label;

    const countEl = document.createElement('span');
    countEl.className = 'lf-trigger__count';
    countEl.hidden = true;

    trigger.append(iconEl, labelEl, countEl);

    const menu = document.createElement('div');
    menu.className = 'lf-menu';
    menu.hidden = true;

    wrapper.append(trigger, menu);
    container.appendChild(wrapper);

    // ── 内部描画 ─────────────────────────────────────────
    function _render() {
      menu.innerHTML = '';
      if (_items.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'lf-menu__empty';
        empty.textContent = '項目がありません';
        menu.appendChild(empty);
      } else {
        for (const item of _items) {
          const active = _selected.has(item.id);
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'lf-item' + (active ? ' lf-item--active' : '');
          btn.dataset.lfId = item.id;

          const check = document.createElement('span');
          check.className = 'lf-item__check';
          check.textContent = '✓';

          const name = document.createElement('span');
          name.className = 'lf-item__name';
          name.textContent = item.name;

          if (item.color) {
            const dot = document.createElement('span');
            dot.className = 'lf-item__dot';
            dot.style.background = item.color;
            btn.append(check, dot, name);
          } else {
            btn.append(check, name);
          }
          menu.appendChild(btn);
        }
      }

      // バッジ更新
      const count = _selected.size;
      countEl.hidden = count === 0;
      countEl.textContent = count;
      trigger.classList.toggle('lf-trigger--active', count > 0);
    }

    // ── イベント ──────────────────────────────────────────
    trigger.addEventListener('click', e => {
      e.stopPropagation();
      menu.hidden = !menu.hidden;
    });

    menu.addEventListener('click', e => {
      const btn = e.target.closest('.lf-item');
      if (!btn) return;
      e.stopPropagation();

      const rawId = btn.dataset.lfId;
      // items の id 型（数値 or 文字列）に合わせてキーを決定
      const item = _items.find(i => String(i.id) === rawId);
      if (!item) return;
      const key = item.id;

      if (_selected.has(key)) {
        _selected.delete(key);
      } else {
        _selected.add(key);
      }
      _render();
      onChange?.(new Set(_selected));
    });

    // 外部クリックでメニューを閉じる
    const _docClose = e => {
      if (!wrapper.contains(e.target)) menu.hidden = true;
    };
    document.addEventListener('click', _docClose);

    _render();

    // ── 公開 API ──────────────────────────────────────────
    return {
      update(newItems, newSelected) {
        _items = [...newItems];
        _selected = new Set(newSelected);
        _render();
      },
      getSelected() {
        return new Set(_selected);
      },
      clear() {
        _selected.clear();
        _render();
        onChange?.(new Set(_selected));
      },
      destroy() {
        document.removeEventListener('click', _docClose);
        wrapper.remove();
      },
    };
  }

  function _defaultIcon() {
    return `<svg viewBox="0 0 16 16" aria-hidden="true" width="12" height="12" fill="currentColor"><path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h11A1.5 1.5 0 0 1 15 2.5v1.586a1.5 1.5 0 0 1-.44 1.06L10.5 9.207V13.5a.75.75 0 0 1-.375.65l-3 1.75A.75.75 0 0 1 6 15.25V9.207L1.44 5.146A1.5 1.5 0 0 1 1 4.086Zm1.5 0v1.586l4.56 4.061a.75.75 0 0 1 .24.544v5.338l1.5-.875V8.69a.75.75 0 0 1 .24-.544L13.5 4.086V2.5Z"/></svg>`;
  }

  return { create };
})();
