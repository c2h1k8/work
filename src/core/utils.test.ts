// ==================================================
// utils ユニットテスト
// ==================================================
import { describe, it, expect } from 'vitest';
import { escapeHtml, sortByPosition, getString, isValidUrl } from './utils';

// ---- escapeHtml ----

describe('escapeHtml', () => {
  it('アンパサンドをエスケープする', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('<> をエスケープする', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('" と \' をエスケープする', () => {
    expect(escapeHtml('"hello" & \'world\'')).toBe('&quot;hello&quot; &amp; &#39;world&#39;');
  });

  it('エスケープ対象がなければそのまま返す', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });

  it('null / undefined は空文字を返す', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('数値は文字列に変換する', () => {
    expect(escapeHtml(42)).toBe('42');
  });
});

// ---- sortByPosition ----

describe('sortByPosition', () => {
  it('position の昇順に並べる', () => {
    const items = [
      { id: 1, position: 3 },
      { id: 2, position: 1 },
      { id: 3, position: 2 },
    ];
    const sorted = sortByPosition(items);
    expect(sorted.map((i) => i.id)).toEqual([2, 3, 1]);
  });

  it('元の配列を変更しない（コピーを返す）', () => {
    const items = [
      { position: 2 },
      { position: 1 },
    ];
    const sorted = sortByPosition(items);
    expect(sorted).not.toBe(items);
    expect(items[0].position).toBe(2); // 元は変わらない
  });

  it('空配列はそのまま返す', () => {
    expect(sortByPosition([])).toEqual([]);
  });
});

// ---- getString ----

describe('getString', () => {
  it('プレースホルダーを置換する', () => {
    // JSON キーはそのままの文字列（{} のエスケープ不要）
    expect(getString('Hello {NAME}', '{"{NAME}": "World"}')).toBe('Hello World');
  });

  it('params が undefined のときはそのまま返す', () => {
    expect(getString('Hello {NAME}')).toBe('Hello {NAME}');
  });

  it('複数プレースホルダーを置換する', () => {
    const result = getString(
      '{A} + {B}',
      '{"{A}": "1", "{B}": "2"}',
    );
    expect(result).toBe('1 + 2');
  });
});

// ---- isValidUrl ----

describe('isValidUrl', () => {
  it('https URL は有効', () => {
    expect(isValidUrl('https://example.com')).toBe(true);
  });

  it('http URL は有効', () => {
    expect(isValidUrl('http://localhost:3000')).toBe(true);
  });

  it('パスなし文字列は無効', () => {
    expect(isValidUrl('not a url')).toBe(false);
  });

  it('空文字は無効', () => {
    expect(isValidUrl('')).toBe(false);
  });

  it('プロトコルなしは無効', () => {
    expect(isValidUrl('example.com')).toBe(false);
  });
});
