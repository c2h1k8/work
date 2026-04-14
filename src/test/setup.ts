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
