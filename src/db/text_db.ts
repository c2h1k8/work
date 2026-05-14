// ==================================================
// TextDB - テキスト処理ツール共通 IndexedDB（Dexie.js）
// ==================================================
// DB名: tools_db  version: 1
//
// ストア:
//   regex_patterns: id*, name, pattern, flags, test_text, created_at, position

import Dexie, { type Table } from 'dexie';

export interface RegexPattern {
  id?: number;
  name: string;
  pattern: string;
  flags: string;
  test_text: string;
  created_at: string;
  position: number;
}

class TextDatabase extends Dexie {
  regex_patterns!: Table<RegexPattern, number>;

  constructor() {
    super('tools_db');
    this.version(1).stores({
      regex_patterns: '++id, position',
    });
  }

  async getAllPatterns(): Promise<RegexPattern[]> {
    return this.regex_patterns.orderBy('position').toArray();
  }

  async addPattern(obj: Omit<RegexPattern, 'id'>): Promise<number> {
    return this.regex_patterns.add(obj as RegexPattern);
  }

  async deletePattern(id: number): Promise<void> {
    await this.regex_patterns.delete(id);
  }
}

export const textDB = new TextDatabase();
