// ==================================================
// CustomSelect: カスタムセレクトボックス
//
// 使い方:
//   // 単体
//   CustomSelect.create(selectEl);
//
//   // コンテナ内の全 select.cs-target を一括置換
//   CustomSelect.replaceAll(containerEl);
//
// select 要素に付けるクラス:
//   - cs-target          → 自動置換対象（replaceAll 用）
//   - kn-select--sm      → コンパクトサイズ
//   - kn-select--grow    → flex-grow: 1（幅を伸ばす）
//
// CSS は css/base/custom_select.css を読み込む。
// ==================================================

const CustomSelect = (() => {
  let _open = null;

  function _bindDoc() {
    if (_bindDoc._done) return;
    document.addEventListener('click', e => {
      if (_open && !_open.wrapper.contains(e.target)) _closeInst(_open);
    });
    document.addEventListener('keydown', e => {
      if (!_open) return;
      if (e.key === 'Escape') { _closeInst(_open); return; }
      const items = [..._open.dropdown.querySelectorAll('.cs-item')];
      const focused = _open.dropdown.querySelector('.cs-item:focus');
      const idx = focused ? items.indexOf(focused) : -1;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        items[Math.min(idx + 1, items.length - 1)]?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        items[Math.max(idx - 1, 0)]?.focus();
      }
    });
    _bindDoc._done = true;
  }

  function _closeInst(inst) {
    inst.dropdown.classList.remove('cs-dropdown--open');
    if (_open === inst) _open = null;
  }

  function create(selectEl) {
    _bindDoc();

    const wrapper = document.createElement('div');
    wrapper.className = 'cs-wrapper';

    // サイズ・幅クラスを引き継ぎ
    const isSm   = selectEl.classList.contains('kn-select--sm');
    const isGrow = selectEl.classList.contains('kn-select--grow');
    if (isGrow) wrapper.classList.add('cs-wrapper--grow');

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'cs-trigger' + (isSm ? ' cs-trigger--sm' : '');

    const triggerText = document.createElement('span');
    triggerText.className = 'cs-trigger__text';

    const triggerIcon = document.createElement('span');
    triggerIcon.className = 'cs-trigger__icon';
    triggerIcon.innerHTML = `<svg viewBox="0 0 16 16" fill="currentColor" width="11" height="11"><path d="M4.427 7.427l3.396 3.396a.25.25 0 0 0 .354 0l3.396-3.396A.25.25 0 0 0 11.396 7H4.604a.25.25 0 0 0-.177.427z"/></svg>`;

    trigger.append(triggerText, triggerIcon);

    const dropdown = document.createElement('div');
    dropdown.className = 'cs-dropdown';

    // select を wrapper 内に移動（CSS で非表示化）
    selectEl.parentNode.insertBefore(wrapper, selectEl);
    wrapper.append(trigger, dropdown, selectEl);

    const inst = { wrapper, trigger, triggerText, dropdown, selectEl };

    function render() {
      triggerText.textContent = selectEl.options[selectEl.selectedIndex]?.text ?? '';
      dropdown.innerHTML = '';
      for (const opt of selectEl.options) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'cs-item' + (opt.value === selectEl.value ? ' cs-item--selected' : '');
        item.dataset.csValue = opt.value;
        item.tabIndex = -1;
        item.textContent = opt.text;
        dropdown.appendChild(item);
      }
    }

    inst.render = render;
    // 要素からインスタンスを参照できるように保持（外部からの再描画用）
    selectEl._csInst = inst;
    render();

    trigger.addEventListener('click', e => {
      e.stopPropagation();
      if (_open && _open !== inst) _closeInst(_open);
      const isOpen = dropdown.classList.contains('cs-dropdown--open');
      if (isOpen) {
        _closeInst(inst);
      } else {
        dropdown.classList.add('cs-dropdown--open');
        _open = inst;
      }
    });

    dropdown.addEventListener('click', e => {
      const item = e.target.closest('.cs-item');
      if (!item) return;
      selectEl.value = item.dataset.csValue;
      render();
      _closeInst(inst);
      selectEl.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // プログラムからの value 変更にも対応
    selectEl.addEventListener('change', () => {
      if (!dropdown.classList.contains('cs-dropdown--open')) render();
    });

    return inst;
  }

  // コンテナ内の全 select.cs-target を置換
  function replaceAll(container = document) {
    return [...container.querySelectorAll('select.cs-target')].map(el => create(el));
  }

  return { create, replaceAll };
})();
