// ==================================================
// theme_store: テーマ状態管理（Zustand）
// ==================================================

import { create } from 'zustand';

type Theme = 'light' | 'dark';

interface ThemeStore {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  theme: (localStorage.getItem('mytools_theme') as Theme) ?? 'light',

  setTheme: (theme: Theme) => {
    localStorage.setItem('mytools_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    set({ theme });
  },

  toggle: () => {
    const next: Theme = get().theme === 'light' ? 'dark' : 'light';
    get().setTheme(next);
  },
}));
