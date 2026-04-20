// タブコンテキスト — 各ページコンポーネントに自タブの label（instanceId）を提供する
import { createContext, useContext } from 'react';
import { useTabStore } from '../stores/tab_store';

export const TabContext = createContext<string>('');

/** 現在のタブラベル（dashboard の instanceId として使用）を取得する */
export function useTabLabel(): string {
  return useContext(TabContext);
}

/** 現在のタブがアクティブ（表示中）かどうかを返す。
 *  全タブが同時マウントされているため、グローバルキーハンドラはこれで絞る必要がある */
export function useIsActiveTab(): boolean {
  const label = useTabLabel();
  const activeTabId = useTabStore(s => s.activeTabId);
  return activeTabId === `TAB-${label}`;
}
