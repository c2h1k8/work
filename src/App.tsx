// ==================================================
// App: アプリルートコンポーネント（AppShell）
// ==================================================

import { useEffect } from 'react';
import { ToastContainer } from './components/Toast';
import { ShortcutHelp } from './components/ShortcutHelp';
import { TopNav } from './components/layout/TopNav';
import { SettingsPanel } from './components/layout/SettingsPanel';
import { ActivityLogModal } from './components/layout/ActivityLogModal';
import { useTabStore } from './stores/tab_store';
import { useThemeStore } from './stores/theme_store';
import { activityDB } from './db/activity_db';

// ナビゲーション共通ショートカット定義
const NAV_SHORTCUT_CATEGORIES = [
  {
    name: 'ナビゲーション',
    shortcuts: [
      { keys: ['Ctrl', 'K'],          description: '検索バーにフォーカス' },
      { keys: ['Ctrl', '1~9'],        description: 'タブ N に切替' },
      { keys: ['Ctrl', '['],          description: '前のタブに切替' },
      { keys: ['Ctrl', ']'],          description: '次のタブに切替' },
      { keys: ['Ctrl', ','],          description: 'タブ設定を開く' },
      { keys: ['Ctrl', 'Shift', 'E'], description: '全データ一括バックアップ' },
    ],
  },
];

// --------------------------------------------------
// タブコンテンツエリア（Phase 4 でページコンポーネントに置き換え）
// --------------------------------------------------
function TabContent() {
  const { config, activeTabId, isLoading } = useTabStore();

  if (isLoading) {
    return (
      <div className="tab-viewport tab-viewport--loading">
        <span>読み込み中…</span>
      </div>
    );
  }

  const activeLabel = activeTabId.replace('TAB-', '');
  const activeTab = config.find((t) => t.label === activeLabel);

  return (
    <main className="tab-viewport" role="main">
      {config.map((tab) => (
        <div
          key={tab.label}
          className={`tab-frame${tab.label === activeLabel ? ' tab-frame--active' : ''}`}
          role="tabpanel"
          aria-label={tab.label}
          hidden={tab.label !== activeLabel}
        >
          {/* Phase 4 でページコンポーネントに置き換え */}
          <div className="tab-placeholder">
            <div
              className="tab-placeholder__icon"
              dangerouslySetInnerHTML={{ __html: tab.icon }}
            />
            <h2>{tab.label}</h2>
            <p>このページは Phase 4 で React コンポーネントに移行予定です。</p>
            <p className="tab-placeholder__src">{tab.pageSrc}</p>
          </div>
        </div>
      ))}
      {!activeTab && (
        <div className="tab-placeholder">
          <p>タブが見つかりません</p>
        </div>
      )}
    </main>
  );
}

// --------------------------------------------------
// App 本体
// --------------------------------------------------
export default function App() {
  const { loadConfig, activityLogOpen, closeActivityLog } = useTabStore();
  const { theme } = useThemeStore();

  // 起動時にタブ設定をロード & 古いアクティビティログを削除
  useEffect(() => {
    loadConfig();
    activityDB.cleanup(90).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // テーマを data-theme 属性に反映（Zustand store と同期）
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <div className="app-shell">
      <TopNav />
      <TabContent />

      {/* グローバルオーバーレイ類 */}
      <SettingsPanel />
      <ActivityLogModal open={activityLogOpen} onClose={closeActivityLog} />
      <ShortcutHelp categories={NAV_SHORTCUT_CATEGORIES} />
      <ToastContainer />
    </div>
  );
}
