'use strict';

// ==================================================
// 設定管理（読み込み・保存・デフォルト生成）
// AppDB は js/db/app_db.js で定義（先に読み込むこと）
// ==================================================

/** TAB_ITEMS からデフォルト設定を生成する */
function getDefaultConfig() {
  return TAB_ITEMS.map((item, i) => ({
    label: item.label,
    pageSrc: item.pageSrc,
    icon: item.icon,
    visible: true,
    position: i,
    isBuiltIn: true,
  }));
}

/** IndexedDB から設定を読み込む（なければデフォルト）。TAB_ITEMS に追加された組み込みタブを自動追加する */
async function loadTabConfig() {
  let saved = await AppDB.get("tab_config");

  if (!saved || !Array.isArray(saved) || saved.length === 0) {
    return getDefaultConfig();
  }

  // 旧パス（ルート直下）から pages/ 配下へのマイグレーション
  let migrated = false;
  const builtInPages = new Set(TAB_ITEMS.map(t => t.pageSrc.replace('pages/', '')));
  for (const item of saved) {
    if (!item.pageSrc.startsWith('pages/') && !item.pageSrc.startsWith('http')) {
      // 組み込みタブ or ダッシュボードタブ（dashboard.html?instance=）をマイグレーション
      if (item.isBuiltIn || item.pageSrc.startsWith('dashboard.html')) {
        item.pageSrc = 'pages/' + item.pageSrc;
        migrated = true;
      }
    }
  }
  if (migrated) await AppDB.set("tab_config", saved);

  // TAB_ITEMS に存在するが保存済み config にない組み込みタブを末尾に追加
  const maxPosition = saved.reduce((m, t) => Math.max(m, t.position ?? 0), 0);
  let offset = 1;
  let added = false;
  for (const item of TAB_ITEMS) {
    if (!saved.some(t => t.pageSrc === item.pageSrc && t.isBuiltIn)) {
      saved.push({
        label: item.label,
        pageSrc: item.pageSrc,
        icon: item.icon,
        visible: true,
        position: maxPosition + offset++,
        isBuiltIn: true,
      });
      added = true;
    }
  }
  if (added) await AppDB.set("tab_config", saved);

  return sortByPosition(saved);
}

/** 設定を IndexedDB に保存する */
async function saveTabConfig(config) {
  await AppDB.set("tab_config", config);
}
