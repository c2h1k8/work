// ==================================================
// SnippetDB - コードスニペット管理 IndexedDB（Dexie.js）
// ==================================================
// DB名: snippet_db  version: 1
//
// ストア:
//   snippets: id*, title, language, tags, description, code,
//             created_at, updated_at, position

import Dexie, { type Table } from 'dexie';

export interface Snippet {
  id?: number;
  title: string;
  language: string;
  tags: string[];
  description: string;
  code: string;
  created_at: string;
  updated_at: string;
  position: number;
}

export interface SnippetExportData {
  type: 'snippet_export';
  version: 1;
  snippets: Snippet[];
}

class SnippetDatabase extends Dexie {
  snippets!: Table<Snippet, number>;

  constructor() {
    super('snippet_db');
    this.version(1).stores({
      snippets: '++id, language, updated_at',
    });
  }

  async addSnippet(snippet: Omit<Snippet, 'id'>): Promise<Snippet> {
    const id = await this.snippets.add(snippet as Snippet);
    return { ...snippet, id };
  }

  async updateSnippet(snippet: Snippet): Promise<Snippet> {
    await this.snippets.put(snippet);
    return snippet;
  }

  async deleteSnippet(id: number): Promise<void> {
    await this.snippets.delete(id);
  }

  async getAllSnippets(): Promise<Snippet[]> {
    const all = await this.snippets.toArray();
    return all.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  }

  async exportAll(): Promise<SnippetExportData> {
    const snippets = await this.getAllSnippets();
    return { type: 'snippet_export', version: 1, snippets };
  }

  async importAll(data: SnippetExportData, replace = false): Promise<number> {
    if (data.type !== 'snippet_export') throw new Error('フォーマットが不正です');
    const snippets = data.snippets ?? [];

    await this.transaction('rw', this.snippets, async () => {
      if (replace) await this.snippets.clear();
      await this.snippets.bulkAdd(
        snippets.map(({ id: _id, ...rest }) => rest as Snippet),
      );
    });

    return snippets.length;
  }
}

export const snippetDB = new SnippetDatabase();
