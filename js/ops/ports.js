'use strict';

// ==================================================
// 運用ツール — ポート番号リファレンス
// ==================================================
// ポート一覧の読み込み・レンダリング・
// カスタムポートの追加・編集・削除
// ==================================================

// ── 読み込み & レンダリング ───────────────────────
async function loadAndRenderPorts() {
  State.customPorts = await opsDB.getPorts();
  renderPorts();
}

function renderPorts() {
  const query   = State.portsSearch.toLowerCase();
  const filter  = State.portsFilter;
  const tbody   = document.getElementById('ports-tbody');
  const emptyEl = document.getElementById('ports-empty');

  // タブのカウントバッジを更新
  const builtinCount = BUILTIN_PORTS.length;
  const customCount  = State.customPorts.length;
  const allCount     = builtinCount + customCount;
  document.querySelectorAll('.ops-filter-tab').forEach(btn => {
    const counts = { all: allCount, builtin: builtinCount, custom: customCount };
    const n = counts[btn.dataset.filter] ?? 0;
    btn.innerHTML = `${btn.dataset.label}<span class="ops-filter-tab__badge">${n}</span>`;
  });

  // 統合リスト作成（ポート番号昇順）
  let all = [];
  if (filter !== 'custom') all = all.concat(BUILTIN_PORTS);
  if (filter !== 'builtin') all = all.concat(State.customPorts.map(p => ({ ...p, isBuiltIn: false })));
  all.sort((a, b) => a.port - b.port || (a.isBuiltIn ? -1 : 1));

  // 検索フィルター
  if (query) {
    all = all.filter(p =>
      p.port.toString().includes(query) ||
      p.service.toLowerCase().includes(query)
    );
  }

  if (all.length === 0) {
    tbody.innerHTML = '';
    emptyEl.hidden  = false;
    return;
  }
  emptyEl.hidden = true;

  const PROTO_COLOR = { TCP: 'accent', UDP: 'warning', both: 'info' };

  tbody.innerHTML = all.map(p => {
    const color  = PROTO_COLOR[p.protocol] || 'info';
    const isEdit = !p.isBuiltIn;
    return `<tr class="${p.isBuiltIn ? '' : 'ports-table__row--custom'}" data-port-id="${p.id ?? ''}">
      <td class="ports-table__td--port"><code class="ports-port-num">${p.port}</code></td>
      <td class="ports-table__td--proto">
        <span class="ports-proto-badge ports-proto-badge--${color}">${p.protocol}</span>
      </td>
      <td class="ports-table__td--service">${escapeHtml(p.service)}</td>
      <td class="ports-table__td--memo">${escapeHtml(p.memo || '')}</td>
      <td class="ports-table__td--ops">
        ${isEdit
          ? `<button class="btn btn--ghost btn--sm" data-action="edit-port" data-id="${p.id}">編集</button>
             <button class="btn btn--ghost-danger btn--sm" data-action="delete-port" data-id="${p.id}">削除</button>`
          : ''}
      </td>
    </tr>`;
  }).join('');
}

// ── フォーム操作 ──────────────────────────────────
function openPortsForm(port) {
  // port が undefined → 新規追加、Object → 編集
  const formEl = document.getElementById('ports-form');
  State.portsEditingId = port ? port.id : null;

  document.getElementById('ports-form-port').value    = port ? port.port    : '';
  const protoSel = document.getElementById('ports-form-proto');
  protoSel.value = port ? port.protocol : 'TCP';
  protoSel._csInst?.render();
  document.getElementById('ports-form-service').value = port ? port.service : '';
  document.getElementById('ports-form-memo').value    = port ? port.memo    : '';
  formEl.hidden = false;
  document.getElementById('ports-form-port').focus();
}

async function savePortsForm() {
  const portNum = parseInt(document.getElementById('ports-form-port').value, 10);
  const proto   = document.getElementById('ports-form-proto').value;
  const service = document.getElementById('ports-form-service').value.trim();
  const memo    = document.getElementById('ports-form-memo').value.trim();

  if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
    showError('ポート番号は 1〜65535 の範囲で入力してください'); return;
  }
  if (!service) {
    showError('サービス名を入力してください'); return;
  }

  // 重複チェック（編集中の自分自身は除外）
  const allPorts = BUILTIN_PORTS.concat(State.customPorts);
  const dup = allPorts.find(p =>
    p.port === portNum && p.protocol === proto &&
    (!State.portsEditingId || p.id !== State.portsEditingId)
  );
  if (dup) {
    showToast(`ポート ${portNum}/${proto} はすでに登録されています（${dup.service}）`, 'warn'); return;
  }

  const position = State.customPorts.length;
  if (State.portsEditingId) {
    await opsDB.updatePort({ id: State.portsEditingId, port: portNum, protocol: proto, service, memo, position });
  } else {
    await opsDB.addPort({ port: portNum, protocol: proto, service, memo, position });
  }

  State.customPorts = await opsDB.getPorts();
  document.getElementById('ports-form').hidden = true;
  renderPorts();
  showSuccess('保存しました');
}
