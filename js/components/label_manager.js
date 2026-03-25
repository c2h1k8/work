// ==================================================
// LabelManager: ラベル管理ダイアログ（共通部品）
//
// 使い方:
//   LabelManager.open({
//     title: 'ラベル設定',          // 省略可
//     labels: [{ id, name, color }, ...],
//     onAdd:    async (name, color) => { id, name, color },  // 新ラベルを返す
//     onUpdate: async (id, name, color) => void,
//     onDelete: async (id) => void,
//     onChange: () => void,          // 省略可
//   });
//
//   HTML は初回 open() 時に自動生成・挿入される。
//   CSS は css/components/label_manager.css を読み込む。
// ==================================================

const LabelManager = (() => {
  // HTML エスケープ: js/core/utils.js の escapeHtml を使用
  const _esc = escapeHtml;

  // プリセットカラー（GitHub ライクな発色）
  const PRESET_COLORS = [
    '#f85149', '#fd7e14', '#e3b341', '#3fb950',
    '#58a6ff', '#d2a8ff', '#ff7b72', '#ffa657',
    '#79c0ff', '#db61a2', '#8957e5', '#56d364',
  ];

  let _injected = false;
  let _config = null;
  let _currentColor = PRESET_COLORS[0];
  let _activeColorTarget = null; // 'new' | label id（文字列）

  // --------------------------------------------------
  // DOM 注入（初回のみ）
  // --------------------------------------------------
  function _inject() {
    if (_injected) return;
    _injected = true;

    const el = document.createElement('div');
    el.id = 'label-manager';
    el.className = 'lmgr';
    el.setAttribute('hidden', '');
    el.innerHTML = `
      <div class="lmgr__backdrop"></div>
      <div class="lmgr__dialog" role="dialog" aria-modal="true" aria-labelledby="lmgr-title">
        <div class="lmgr__header">
          <span class="lmgr__header-icon" aria-hidden="true">
            <svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor">
              <path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3.879a1.5 1.5 0 0 1 1.06.44l8.5 8.5a1.5 1.5 0 0 1 0 2.12l-3.878 3.879a1.5 1.5 0 0 1-2.122 0l-8.5-8.5A1.5 1.5 0 0 1 1 6.38Zm1.5 0v3.879l8.5 8.5 3.879-3.878-8.5-8.5ZM6 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"/>
            </svg>
          </span>
          <h2 class="lmgr__title" id="lmgr-title">ラベル設定</h2>
          <button class="lmgr__close" aria-label="閉じる" id="lmgr-close-btn" type="button">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
              <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/>
            </svg>
          </button>
        </div>
        <div class="lmgr__body">
          <!-- 既存ラベル一覧 -->
          <div class="lmgr__section">
            <div class="lmgr__section-header">
              <span class="lmgr__section-title">ラベル一覧</span>
              <span class="lmgr__label-count" id="lmgr-count"></span>
            </div>
            <ul class="lmgr__list" id="lmgr-list"></ul>
          </div>

          <!-- 新規追加フォーム -->
          <div class="lmgr__section lmgr__add-section">
            <div class="lmgr__section-header">
              <span class="lmgr__section-title">新しいラベルを追加</span>
            </div>
            <div class="lmgr__add-preview-wrap">
              <span class="lmgr__add-preview" id="lmgr-add-preview" hidden></span>
            </div>
            <div class="lmgr__add-row">
              <input class="lmgr__add-input" id="lmgr-add-name" type="text"
                     placeholder="ラベル名を入力..." maxlength="30" autocomplete="off">
              <button class="lmgr__add-btn" id="lmgr-add-btn" type="button">
                <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true">
                  <path d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z"/>
                </svg>
                追加
              </button>
            </div>
            <div class="lmgr__palette" id="lmgr-add-palette"></div>
          </div>
        </div>
      </div>
      <!-- カラーポップオーバー（ラベル行のカラー変更用） -->
      <div class="lmgr__color-popover" id="lmgr-color-popover" hidden>
        <div class="lmgr__color-popover-inner" id="lmgr-color-popover-inner"></div>
      </div>
    `;
    document.body.appendChild(el);

    // 新規追加用パレット生成
    _buildPalette(el.querySelector('#lmgr-add-palette'), 'new');

    // イベント登録
    el.querySelector('.lmgr__backdrop').addEventListener('click', close);
    el.querySelector('#lmgr-close-btn').addEventListener('click', close);
    el.querySelector('#lmgr-add-btn').addEventListener('click', () => _onAdd().catch(console.error));
    el.querySelector('#lmgr-add-name').addEventListener('input', _updateAddPreview);
    el.querySelector('#lmgr-add-name').addEventListener('keydown', e => {
      // IME 変換中の Enter は無視
      if (e.key === 'Enter' && !e.isComposing) _onAdd().catch(console.error);
    });
    el.querySelector('#lmgr-list').addEventListener('click', e => _onListClick(e).catch(console.error));

    // ポップオーバー外クリックで閉じる
    document.addEventListener('click', e => {
      const popover = document.getElementById('lmgr-color-popover');
      if (popover && !popover.hidden && !popover.contains(e.target)) {
        const colorBtns = document.querySelectorAll('.lmgr__item-color-btn');
        const clickedColorBtn = [...colorBtns].some(b => b.contains(e.target));
        if (!clickedColorBtn) {
          popover.hidden = true;
          _activeColorTarget = null;
        }
      }
    });

    // ESC で閉じる
    document.addEventListener('keydown', e => {
      const dialog = document.getElementById('label-manager');
      if (e.key === 'Escape' && dialog && !dialog.hasAttribute('hidden')) close();
    });
  }

  // --------------------------------------------------
  // カラーパレット DOM 生成
  // --------------------------------------------------
  function _buildPalette(container, targetId) {
    container.innerHTML = '';
    PRESET_COLORS.forEach((color, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lmgr__swatch';
      btn.dataset.color = color;
      btn.dataset.lmTarget = targetId;
      btn.style.background = color;
      btn.title = color;
      if (i === 0 && targetId === 'new') btn.classList.add('is-active');
      container.appendChild(btn);
    });

    // カスタムカラーラベル
    const customLabel = document.createElement('label');
    customLabel.className = 'lmgr__swatch lmgr__swatch--custom';
    customLabel.title = 'カスタムカラー';
    const customInput = document.createElement('input');
    customInput.type = 'color';
    customInput.className = 'lmgr__custom-color-input';
    customInput.dataset.lmTarget = targetId;
    customInput.value = PRESET_COLORS[0];
    const penSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    penSvg.setAttribute('viewBox', '0 0 16 16');
    penSvg.setAttribute('width', '11');
    penSvg.setAttribute('height', '11');
    penSvg.setAttribute('fill', 'currentColor');
    penSvg.setAttribute('aria-hidden', 'true');
    penSvg.innerHTML = '<path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064Zm1.238-3.763a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354Z"/>';
    customLabel.appendChild(customInput);
    customLabel.appendChild(penSvg);
    container.appendChild(customLabel);

    // スウォッチクリック
    container.addEventListener('click', e => {
      const swatch = e.target.closest('.lmgr__swatch[data-color]');
      if (swatch) _selectColor(swatch.dataset.color, swatch.dataset.lmTarget, container);
    });
    // カスタムカラー入力
    customInput.addEventListener('input', e => {
      _selectColor(e.target.value, targetId, container);
    });
  }

  function _selectColor(color, targetId, paletteEl) {
    if (targetId === 'new') {
      _currentColor = color;
      // アクティブスウォッチ更新
      paletteEl.querySelectorAll('.lmgr__swatch[data-color]').forEach(s => {
        s.classList.toggle('is-active', s.dataset.color === color);
      });
      _updateAddPreview();
    } else {
      // 既存ラベルのカラー変更
      const label = _config?.labels?.find(l => String(l.id) === String(targetId));
      if (!label) return;
      label.color = color;
      _config.onUpdate(label.id, label.name, color)
        .then(() => {
          _config.onChange?.();
          _renderList();
          const popover = document.getElementById('lmgr-color-popover');
          if (popover) popover.hidden = true;
          _activeColorTarget = null;
        })
        .catch(console.error);
    }
  }

  function _updateAddPreview() {
    const preview = document.getElementById('lmgr-add-preview');
    const name = (document.getElementById('lmgr-add-name')?.value || '').trim();
    if (preview && name) {
      preview.textContent = name;
      preview.style.background = _currentColor + '33';
      preview.style.color = _currentColor;
      preview.style.borderColor = _currentColor + '99';
      preview.hidden = false;
    } else if (preview) {
      preview.hidden = true;
    }
  }

  // --------------------------------------------------
  // 公開 API
  // --------------------------------------------------
  function open(config) {
    _inject();
    _config = config;
    _currentColor = PRESET_COLORS[0];

    // タイトル更新
    const titleEl = document.getElementById('lmgr-title');
    if (titleEl) titleEl.textContent = config.title || 'ラベル設定';

    // 新規追加パレットをリセット
    const addPalette = document.getElementById('lmgr-add-palette');
    if (addPalette) {
      addPalette.querySelectorAll('.lmgr__swatch[data-color]').forEach((s, i) => {
        s.classList.toggle('is-active', i === 0);
      });
      const customInput = addPalette.querySelector('.lmgr__custom-color-input');
      if (customInput) customInput.value = PRESET_COLORS[0];
    }

    _renderList();
    _clearAddForm();

    const el = document.getElementById('label-manager');
    el.removeAttribute('hidden');
    requestAnimationFrame(() => {
      el.classList.add('is-open');
      document.getElementById('lmgr-add-name')?.focus();
    });
  }

  function close() {
    const el = document.getElementById('label-manager');
    if (!el) return;
    el.classList.remove('is-open');
    el.addEventListener('transitionend', () => {
      if (!el.classList.contains('is-open')) el.setAttribute('hidden', '');
    }, { once: true });
  }

  function _renderList() {
    const list = document.getElementById('lmgr-list');
    const countEl = document.getElementById('lmgr-count');
    const labels = _config?.labels || [];
    if (countEl) countEl.textContent = `${labels.length} 件`;
    if (!list) return;

    if (labels.length === 0) {
      list.innerHTML = '<li class="lmgr__empty">ラベルがありません。下のフォームから追加してください。</li>';
      return;
    }

    list.innerHTML = labels.map((l, i) => `
      <li class="lmgr__item" data-lm-id="${l.id}">
        <div class="lmgr__item-move">
          <button class="lmgr__move-btn" type="button"
                  data-action="move-label-up" data-lm-id="${_esc(String(l.id))}"
                  title="上へ" ${i === 0 ? 'disabled' : ''}>▲</button>
          <button class="lmgr__move-btn" type="button"
                  data-action="move-label-down" data-lm-id="${_esc(String(l.id))}"
                  title="下へ" ${i === labels.length - 1 ? 'disabled' : ''}>▼</button>
        </div>
        <button class="lmgr__item-color-btn" type="button"
                data-action="change-color" data-lm-id="${_esc(String(l.id))}"
                style="background:${_esc(l.color)}" title="カラーを変更">
        </button>
        <span class="lmgr__item-chip"
              style="background:${_esc(l.color)}33;color:${_esc(l.color)};border-color:${_esc(l.color)}99">
          ${_esc(l.name)}
        </span>
        <span class="lmgr__item-name" data-action="edit-name" data-lm-id="${_esc(String(l.id))}"
              role="button" tabindex="0" title="クリックして名前を変更">
          ${_esc(l.name)}
        </span>
        <button class="lmgr__item-del" type="button"
                data-action="delete-label" data-lm-id="${_esc(String(l.id))}" title="削除">
          <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
            <path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z"/>
          </svg>
        </button>
      </li>
    `).join('');
  }

  async function _onListClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const rawId = btn.dataset.lmId;
    switch (btn.dataset.action) {
      case 'delete-label':    await _onDelete(rawId); break;
      case 'edit-name':       _onEditName(btn, rawId); break;
      case 'change-color':    _onChangeColorBtnClick(e, btn, rawId); break;
      case 'move-label-up':   _onMoveLabel(rawId, 'up'); break;
      case 'move-label-down': _onMoveLabel(rawId, 'down'); break;
    }
  }

  function _onMoveLabel(rawId, dir) {
    const labels = _config?.labels;
    if (!labels) return;
    const idx = labels.findIndex(l => String(l.id) === String(rawId));
    if (idx < 0) return;
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= labels.length) return;
    [labels[idx], labels[swapIdx]] = [labels[swapIdx], labels[idx]];
    _config.onReorder?.(labels);
    _renderList();
  }

  async function _onAdd() {
    const nameInput = document.getElementById('lmgr-add-name');
    const name = (nameInput?.value || '').trim();
    if (!name) { nameInput?.focus(); return; }

    // 重複チェック（LabelManager 側でも弾く）
    const isDuplicate = (_config.labels || []).some(l => l.name === name);
    if (isDuplicate) {
      if (typeof Toast !== 'undefined') Toast.error('同じ名前のラベルがすでに存在します');
      nameInput?.select();
      return;
    }

    const label = await _config.onAdd(name, _currentColor);
    _config.labels.push(label);
    _renderList();
    _clearAddForm();
    _config.onChange?.();
  }

  async function _onDelete(rawId) {
    const label = _config.labels.find(l => String(l.id) === String(rawId));
    if (!label) return;
    if (!confirm(`ラベル「${label.name}」を削除しますか？`)) return;

    await _config.onDelete(label.id);
    _config.labels = _config.labels.filter(l => String(l.id) !== String(rawId));
    _renderList();
    _config.onChange?.();
  }

  function _onEditName(span, rawId) {
    const label = _config.labels.find(l => String(l.id) === String(rawId));
    if (!label) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = label.name;
    input.className = 'lmgr__item-name-input';
    span.replaceWith(input);
    input.focus();
    input.select();

    let done = false;
    const save = async (commit) => {
      if (done) return;
      done = true;
      const newName = input.value.trim();
      if (commit && newName && newName !== label.name) {
        // 重複チェック（他のラベルと同名になる場合は保存しない）
        const isDuplicate = (_config.labels || []).some(
          l => String(l.id) !== String(label.id) && l.name === newName
        );
        if (isDuplicate) {
          if (typeof Toast !== 'undefined') Toast.error('同じ名前のラベルがすでに存在します');
          _renderList();
          return;
        }
        await _config.onUpdate(label.id, newName, label.color);
        label.name = newName;
        _config.onChange?.();
      }
      _renderList();
    };

    input.addEventListener('blur', () => save(true).catch(console.error));
    input.addEventListener('keydown', e => {
      // IME 変換中の Enter は無視
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); save(true).catch(console.error); }
      if (e.key === 'Escape') { save(false).catch(console.error); }
    });
  }

  function _onChangeColorBtnClick(e, btn, rawId) {
    e.stopPropagation();
    const popover = document.getElementById('lmgr-color-popover');
    if (!popover) return;

    // 同じラベルの再クリック → 閉じる
    if (!popover.hidden && _activeColorTarget === rawId) {
      popover.hidden = true;
      _activeColorTarget = null;
      return;
    }

    _activeColorTarget = rawId;

    // ポップオーバー内パレット再構築
    const inner = document.getElementById('lmgr-color-popover-inner');
    if (inner) {
      inner.innerHTML = '';
      _buildPalette(inner, rawId);
      // 現在のカラーをアクティブに
      const label = _config.labels.find(l => String(l.id) === String(rawId));
      if (label) {
        inner.querySelectorAll('.lmgr__swatch[data-color]').forEach(s => {
          s.classList.toggle('is-active', s.dataset.color === label.color);
        });
        const customInput = inner.querySelector('.lmgr__custom-color-input');
        if (customInput) customInput.value = label.color;
      }
    }

    // ポップオーバー位置
    const rect = btn.getBoundingClientRect();
    popover.style.top  = (rect.bottom + 6) + 'px';
    popover.style.left = Math.min(rect.left, window.innerWidth - 216) + 'px';
    popover.hidden = false;
  }

  function _clearAddForm() {
    const nameInput = document.getElementById('lmgr-add-name');
    if (nameInput) nameInput.value = '';
    const preview = document.getElementById('lmgr-add-preview');
    if (preview) preview.hidden = true;
  }

  return { open, close };
})();
