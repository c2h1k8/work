import { useEffect, useState } from 'react';

// テーマの型
type Theme = 'light' | 'dark';

function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    return (localStorage.getItem('mytools_theme') as Theme) ?? 'light';
  });

  const setTheme = (next: Theme) => {
    localStorage.setItem('mytools_theme', next);
    document.documentElement.setAttribute('data-theme', next);
    setThemeState(next);
  };

  const toggle = () => setTheme(theme === 'light' ? 'dark' : 'light');

  // OS テーマ変更に追随
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem('mytools_theme')) {
        setTheme(e.matches ? 'dark' : 'light');
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return { theme, toggle };
}

export default function App() {
  const { theme, toggle } = useTheme();

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '24px',
        backgroundColor: 'var(--c-bg)',
        color: 'var(--c-text)',
        fontFamily: 'var(--font)',
      }}
    >
      {/* ロゴ */}
      <div style={{ textAlign: 'center' }}>
        <h1
          style={{
            fontSize: 'var(--font-size-3xl)',
            fontWeight: 700,
            color: 'var(--c-accent)',
            margin: 0,
            letterSpacing: '-0.5px',
          }}
        >
          MyTools
        </h1>
        <p
          style={{
            fontSize: 'var(--font-size-md)',
            color: 'var(--c-text-2)',
            margin: '8px 0 0',
          }}
        >
          React + TypeScript + Tailwind への移行中
        </p>
      </div>

      {/* ステータスカード */}
      <div
        style={{
          background: 'var(--c-surface)',
          border: '1px solid var(--c-border)',
          borderRadius: 'var(--radius-lg)',
          padding: '24px 32px',
          boxShadow: 'var(--shadow)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          minWidth: '320px',
        }}
      >
        <StatusItem label="React" value="19" ok />
        <StatusItem label="TypeScript" value="5" ok />
        <StatusItem label="Tailwind CSS" value="v4" ok />
        <StatusItem label="Vite" value="6" ok />
        <StatusItem label="Zustand" value="✓" ok />
        <StatusItem label="TanStack Router" value="✓" ok />
        <StatusItem label="TanStack Query" value="✓" ok />
        <StatusItem label="Dexie.js" value="✓" ok />
        <StatusItem label="dnd-kit" value="✓" ok />
        <StatusItem label="Lucide React" value="✓" ok />
        <StatusItem label="現在のテーマ" value={theme} ok />
      </div>

      {/* テーマ切替ボタン */}
      <button
        onClick={toggle}
        style={{
          backgroundColor: 'var(--c-accent)',
          color: 'var(--c-accent-text)',
          border: 'none',
          borderRadius: 'var(--radius-md)',
          padding: '8px 20px',
          fontSize: 'var(--font-size-md)',
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'var(--t)',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--c-accent-hover)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--c-accent)';
        }}
      >
        {theme === 'light' ? '🌙 ダークモードに切替' : '☀️ ライトモードに切替'}
      </button>

      <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-3)', margin: 0 }}>
        Phase 0 完了 — 環境構築 ✓
      </p>
    </div>
  );
}

function StatusItem({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: 'var(--font-size-sm)',
        gap: '32px',
      }}
    >
      <span style={{ color: 'var(--c-text-2)' }}>{label}</span>
      <span
        style={{
          color: ok ? 'var(--c-success)' : 'var(--c-danger)',
          fontWeight: 600,
          fontFamily: 'var(--font-mono)',
        }}
      >
        {value}
      </span>
    </div>
  );
}
