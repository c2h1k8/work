// ==================================================
// Vitest グローバルセットアップ
// ==================================================
import '@testing-library/jest-dom';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';

// Dexie.js が使う IndexedDB をインメモリ実装に差し替え
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;
g.indexedDB  = new IDBFactory();
g.IDBKeyRange = IDBKeyRange;

// テスト環境の localStorage はメソッドを持たない不完全なオブジェクトのため
// インメモリ実装に差し替え（getItem/setItem/removeItem/clear/key/length）
const _lsStore = new Map<string, string>();
const memoryLocalStorage: Storage = {
  getItem: (k: string) => (_lsStore.has(k) ? _lsStore.get(k)! : null),
  setItem: (k: string, v: string) => { _lsStore.set(String(k), String(v)); },
  removeItem: (k: string) => { _lsStore.delete(k); },
  clear: () => { _lsStore.clear(); },
  key: (i: number) => [..._lsStore.keys()][i] ?? null,
  get length() { return _lsStore.size; },
};
Object.defineProperty(g, 'localStorage', { value: memoryLocalStorage, writable: true, configurable: true });
if (g.window && g.window !== g) {
  Object.defineProperty(g.window, 'localStorage', { value: memoryLocalStorage, writable: true, configurable: true });
}
