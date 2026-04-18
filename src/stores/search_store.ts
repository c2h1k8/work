// ==================================================
// search_store: グローバル検索ハンドラレジストリ
// ==================================================
// 各ページが register() でハンドラを登録し、
// GlobalSearch が searchAll() で全ページを横断検索する。
// iframe を使わない React 版専用の実装。

export interface ContentSearchResult {
  /** 一意キー（例: "todo-123"） */
  id: string;
  /** 結果を返したページの pageSrc（例: "pages/todo.html"） */
  pageSrc: string;
  /** 結果タイトル */
  title: string;
  /** 検索語周辺の抜粋テキスト */
  excerpt: string;
  /** 結果を選択したときに呼ぶコールバック */
  onSelect: () => void;
}

export type SearchHandler = (query: string) => Promise<ContentSearchResult[]>;

const _handlers = new Map<string, SearchHandler>();

export const searchRegistry = {
  register(key: string, handler: SearchHandler) {
    _handlers.set(key, handler);
  },
  unregister(key: string) {
    _handlers.delete(key);
  },
  async searchAll(query: string): Promise<ContentSearchResult[]> {
    const settled = await Promise.all(
      [..._handlers.values()].map((h) => h(query).catch(() => [] as ContentSearchResult[])),
    );
    return settled.flat();
  },
};
