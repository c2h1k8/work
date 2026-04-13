// タブコンテキスト — 各ページコンポーネントに自タブの label（instanceId）を提供する
import { createContext, useContext } from 'react';

export const TabContext = createContext<string>('');

/** 現在のタブラベル（dashboard の instanceId として使用）を取得する */
export function useTabLabel(): string {
  return useContext(TabContext);
}
