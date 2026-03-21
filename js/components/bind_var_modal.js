// js/components/bind_var_modal.js
// バインド変数モーダル: 変数名 + プリセット管理の共通 UI コンポーネント
// API: BindVarModal.open(opts) / BindVarModal.close()
// opts: {
//   title: string,
//   varNames: string[],
//   presets: [{id, name, values: {}}],
//   showBarConfig: boolean,
//   uiType: 'tabs'|'select'|'segment',
//   barLabel: string,
//   onAddVar: async (varName) => void,
//   onRemoveVar: async (varName) => void,
//   onSaveBarConfig: async ({uiType, barLabel}) => void,
//   onAddPreset: async (name) => {id, name, values: {}},
//   onUpdatePreset: async (preset) => void,
//   onDeletePreset: async (id) => void,
//   onMovePresetUp: async (presetId) => void,
//   onMovePresetDown: async (presetId) => void,
//   onChange: () => void,
// }

const BindVarModal = (() => {
  // ── 内部状態 ──────────────────────────────────────────
  let _opts = null;
  let _state = null;

  function _initState(opts) {
    return {
      varNames: [...(opts.varNames || [])],
      presets: (opts.presets || []).map(p => ({ ...p, values: { ...(p.values || {}) } })),
      uiType: opts.uiType || 'tabs',
      barLabel: opts.barLabel || '',
      editingPresetId: null,
      addingPreset: false,
    };
  }

  // ── DOM 初期化 ─────────────────────────────────────────
  function _getOrCreateEl() {
    let el = document.getElementById('bvm-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'bvm-overlay';
      el.className = 'bvm-overlay';
      el.setAttribute('hidden', '');
      document.body.appendChild(el);
      el.addEventListener('click', _onClick);
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && _state) close();
      });
    }
    return el;
  }

  // ── 公開 API ──────────────────────────────────────────
  function open(opts) {
    _opts = opts;
    _state = _initState(opts);
    const el = _getOrCreateEl();
    _render(el);
    el.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    const el = document.getElementById('bvm-overlay');
    if (el) el.setAttribute('hidden', '');
    document.body.style.overflow = '';
    _opts = null;
    _state = null;
  }

  // ── レンダリング ──────────────────────────────────────
  function _render(el) {
    const showBarConfig = !!_opts.showBarConfig;
    el.innerHTML = `
      <div class="bvm-backdrop"></div>
      <div class="bvm-dialog" role="dialog" aria-modal="true">
        <div class="bvm-hd">
          <h2 class="bvm-title">${escapeHtml(_opts.title || 'バインド変数設定')}</h2>
          <button class="bvm-close" data-bvm="close" aria-label="閉じる">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="bvm-body">
          <div class="bvm-left">
            ${_buildVarSection()}
            ${showBarConfig ? _buildBarConfigSection() : ''}
          </div>
          <div class="bvm-right">
            ${_state.editingPresetId !== null ? _buildPresetEditor() : _buildPresetList()}
          </div>
        </div>
      </div>`;
    // CustomSelect で select 要素を置換
    if (typeof CustomSelect !== 'undefined') {
      CustomSelect.replaceAll(el);
    }
  }

  function _buildVarSection() {
    const { varNames } = _state;
    const rows = varNames.length > 0
      ? varNames.map(name => `
        <div class="bvm-var-row">
          <code class="bvm-var-badge">{${escapeHtml(name)}}</code>
          <button class="bvm-btn bvm-btn--danger bvm-btn--sm" data-bvm="remove-var" data-var-name="${escapeHtml(name)}">削除</button>
        </div>`).join('')
      : '<p class="bvm-empty">変数が定義されていません</p>';
    return `
      <div class="bvm-section">
        <h3 class="bvm-section-title">変数名の定義</h3>
        <p class="bvm-help">コマンドや値に <code>{変数名}</code> 形式で埋め込めます。例: <code>{IP}</code></p>
        <div id="bvm-var-list">${rows}</div>
        <div class="bvm-add-row">
          <input class="bvm-input" id="bvm-new-var" type="text" placeholder="変数名（例: HOST_NAME）" />
          <button class="bvm-btn bvm-btn--primary" data-bvm="add-var">追加</button>
        </div>
      </div>`;
  }

  function _buildBarConfigSection() {
    const { uiType, barLabel } = _state;
    return `
      <div class="bvm-section">
        <h3 class="bvm-section-title">選択 UI</h3>
        <div class="bvm-form-row">
          <label class="bvm-label">ラベル（空白で非表示）</label>
          <input class="bvm-input" id="bvm-bar-label" type="text" value="${escapeHtml(barLabel)}" placeholder="プリセット" />
        </div>
        <div class="bvm-form-row">
          <label class="bvm-label">表示タイプ</label>
          <select class="cs-target" id="bvm-ui-type">
            <option value="tabs" ${uiType === 'tabs' ? 'selected' : ''}>タブ</option>
            <option value="select" ${uiType === 'select' ? 'selected' : ''}>セレクトボックス</option>
            <option value="segment" ${uiType === 'segment' ? 'selected' : ''}>セグメントコントロール</option>
          </select>
        </div>
        <div class="bvm-form-actions">
          <button class="bvm-btn bvm-btn--primary" data-bvm="save-bar-config">保存</button>
        </div>
      </div>`;
  }

  function _buildPresetList() {
    const { presets, addingPreset } = _state;
    const rows = presets.length > 0
      ? presets.map((p, idx) => `
        <div class="bvm-preset-row">
          <span class="bvm-preset-name">${escapeHtml(p.name)}</span>
          <div class="bvm-preset-actions">
            <button class="bvm-btn bvm-btn--sm" data-bvm="move-preset-up" data-preset-id="${p.id}" ${idx === 0 ? 'disabled' : ''}>↑</button>
            <button class="bvm-btn bvm-btn--sm" data-bvm="move-preset-down" data-preset-id="${p.id}" ${idx === presets.length - 1 ? 'disabled' : ''}>↓</button>
            <button class="bvm-btn bvm-btn--sm bvm-btn--primary" data-bvm="edit-preset" data-preset-id="${p.id}">編集</button>
            <button class="bvm-btn bvm-btn--sm bvm-btn--danger" data-bvm="delete-preset" data-preset-id="${p.id}">削除</button>
          </div>
        </div>`).join('')
      : '<p class="bvm-empty">プリセットが登録されていません</p>';
    const addForm = addingPreset
      ? `<div class="bvm-add-preset-form">
          <div class="bvm-form-row">
            <label class="bvm-label">プリセット名</label>
            <input class="bvm-input" id="bvm-new-preset-name" type="text" placeholder="プリセット名（例: 本番, 開発）" />
          </div>
          <div class="bvm-form-actions">
            <button class="bvm-btn bvm-btn--primary" data-bvm="save-add-preset">追加</button>
            <button class="bvm-btn" data-bvm="cancel-add-preset">キャンセル</button>
          </div>
        </div>`
      : `<button class="bvm-add-btn" data-bvm="show-add-preset">＋ プリセットを追加</button>`;
    return `
      <div class="bvm-section bvm-section--full">
        <h3 class="bvm-section-title">プリセット一覧</h3>
        <div id="bvm-preset-list">${rows}</div>
        ${addForm}
      </div>`;
  }

  function _buildPresetEditor() {
    const preset = _state.presets.find(p => p.id === _state.editingPresetId);
    if (!preset) return '<p class="bvm-empty">プリセットが見つかりません</p>';
    const values = preset.values || {};
    const varFields = _state.varNames.length > 0
      ? _state.varNames.map(name => `
        <div class="bvm-form-row">
          <label class="bvm-label"><code class="bvm-var-badge">{${escapeHtml(name)}}</code></label>
          <input class="bvm-input" id="bvm-ev-${escapeHtml(name)}" type="text"
                 value="${escapeHtml(values[name] || '')}" placeholder="${escapeHtml(name)} の値" />
        </div>`).join('')
      : '<p class="bvm-empty">変数が定義されていません</p>';
    return `
      <div class="bvm-section bvm-section--full">
        <div class="bvm-editor-hd">
          <button class="bvm-back-btn" data-bvm="back-to-list">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="12" height="12">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            一覧に戻る
          </button>
          <h3 class="bvm-section-title">プリセット編集</h3>
        </div>
        <div class="bvm-form-row">
          <label class="bvm-label">プリセット名</label>
          <input class="bvm-input" id="bvm-edit-preset-name" type="text" value="${escapeHtml(preset.name)}" placeholder="プリセット名" />
        </div>
        <div class="bvm-vars-title">バインド変数の値</div>
        ${varFields}
        <div class="bvm-form-actions">
          <button class="bvm-btn bvm-btn--primary" data-bvm="save-edit-preset" data-preset-id="${preset.id}">保存</button>
          <button class="bvm-btn" data-bvm="back-to-list">キャンセル</button>
        </div>
      </div>`;
  }

  // ── イベントハンドラー ────────────────────────────────
  async function _onClick(e) {
    const btn = e.target.closest('[data-bvm]');
    if (!btn) {
      if (e.target.classList.contains('bvm-backdrop')) close();
      return;
    }
    if (!_opts || !_state) return;
    const action = btn.dataset.bvm;
    const presetId = btn.dataset.presetId != null ? Number(btn.dataset.presetId) : null;
    const varName = btn.dataset.varName;
    const el = document.getElementById('bvm-overlay');

    switch (action) {
      case 'close':
        close();
        break;

      case 'add-var': {
        const input = el.querySelector('#bvm-new-var');
        const raw = (input?.value || '').trim();
        const name = raw.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
        if (!name) { alert('変数名を入力してください'); return; }
        if (_state.varNames.includes(name)) { alert('すでに存在する変数名です'); return; }
        try {
          await _opts.onAddVar(name);
          _state.varNames.push(name);
          if (input) input.value = '';
          _render(el);
          if (_opts.onChange) _opts.onChange();
        } catch (err) { console.error(err); }
        break;
      }

      case 'remove-var': {
        if (!confirm(`変数 {${varName}} を削除しますか？`)) return;
        try {
          await _opts.onRemoveVar(varName);
          _state.varNames = _state.varNames.filter(v => v !== varName);
          _render(el);
          if (_opts.onChange) _opts.onChange();
        } catch (err) { console.error(err); }
        break;
      }

      case 'save-bar-config': {
        const selEl = el.querySelector('#bvm-ui-type');
        const uiType = selEl?.value || 'tabs';
        const barLabel = (el.querySelector('#bvm-bar-label')?.value || '').trim();
        try {
          await _opts.onSaveBarConfig({ uiType, barLabel });
          _state.uiType = uiType;
          _state.barLabel = barLabel;
          if (typeof Toast !== 'undefined') Toast.show('保存しました', 'success');
          if (_opts.onChange) _opts.onChange();
        } catch (err) { console.error(err); }
        break;
      }

      case 'show-add-preset':
        _state.addingPreset = true;
        _render(el);
        el.querySelector('#bvm-new-preset-name')?.focus();
        break;

      case 'cancel-add-preset':
        _state.addingPreset = false;
        _render(el);
        break;

      case 'save-add-preset': {
        const nameInput = el.querySelector('#bvm-new-preset-name');
        const name = (nameInput?.value || '').trim();
        if (!name) { alert('プリセット名を入力してください'); return; }
        try {
          const newPreset = await _opts.onAddPreset(name);
          _state.presets.push({ ...newPreset });
          _state.addingPreset = false;
          _render(el);
          if (_opts.onChange) _opts.onChange();
        } catch (err) { console.error(err); }
        break;
      }

      case 'edit-preset':
        _state.editingPresetId = presetId;
        _state.addingPreset = false;
        _render(el);
        break;

      case 'back-to-list':
        _state.editingPresetId = null;
        _render(el);
        break;

      case 'save-edit-preset': {
        const preset = _state.presets.find(p => p.id === presetId);
        if (!preset) return;
        const name = (el.querySelector('#bvm-edit-preset-name')?.value || '').trim();
        if (!name) { alert('プリセット名を入力してください'); return; }
        const values = {};
        _state.varNames.forEach(n => {
          values[n] = (el.querySelector(`#bvm-ev-${n}`)?.value || '').trim();
        });
        preset.name = name;
        preset.values = values;
        try {
          await _opts.onUpdatePreset({ ...preset });
          _state.editingPresetId = null;
          _render(el);
          if (_opts.onChange) _opts.onChange();
          if (typeof Toast !== 'undefined') Toast.show('保存しました', 'success');
        } catch (err) { console.error(err); }
        break;
      }

      case 'delete-preset': {
        if (!confirm('このプリセットを削除しますか？')) return;
        try {
          await _opts.onDeletePreset(presetId);
          _state.presets = _state.presets.filter(p => p.id !== presetId);
          _render(el);
          if (_opts.onChange) _opts.onChange();
        } catch (err) { console.error(err); }
        break;
      }

      case 'move-preset-up': {
        const idx = _state.presets.findIndex(p => p.id === presetId);
        if (idx <= 0) return;
        try {
          await _opts.onMovePresetUp(presetId);
          [_state.presets[idx - 1], _state.presets[idx]] = [_state.presets[idx], _state.presets[idx - 1]];
          _render(el);
        } catch (err) { console.error(err); }
        break;
      }

      case 'move-preset-down': {
        const idx = _state.presets.findIndex(p => p.id === presetId);
        if (idx < 0 || idx >= _state.presets.length - 1) return;
        try {
          await _opts.onMovePresetDown(presetId);
          [_state.presets[idx], _state.presets[idx + 1]] = [_state.presets[idx + 1], _state.presets[idx]];
          _render(el);
        } catch (err) { console.error(err); }
        break;
      }
    }
  }

  return { open, close };
})();
