import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import java from 'react-syntax-highlighter/dist/esm/languages/prism/java';
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css';
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql';
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml';
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup';
import go from 'react-syntax-highlighter/dist/esm/languages/prism/go';
import rust from 'react-syntax-highlighter/dist/esm/languages/prism/rust';
import kotlin from 'react-syntax-highlighter/dist/esm/languages/prism/kotlin';
import swift from 'react-syntax-highlighter/dist/esm/languages/prism/swift';
import markdownLang from 'react-syntax-highlighter/dist/esm/languages/prism/markdown';
import { Opener } from '../core/opener';
import styles from '../styles/components/MarkdownBody.module.css';

SyntaxHighlighter.registerLanguage('javascript', javascript);
SyntaxHighlighter.registerLanguage('js', javascript);
SyntaxHighlighter.registerLanguage('jsx', javascript);
SyntaxHighlighter.registerLanguage('typescript', typescript);
SyntaxHighlighter.registerLanguage('ts', typescript);
SyntaxHighlighter.registerLanguage('tsx', typescript);
SyntaxHighlighter.registerLanguage('python', python);
SyntaxHighlighter.registerLanguage('py', python);
SyntaxHighlighter.registerLanguage('java', java);
SyntaxHighlighter.registerLanguage('bash', bash);
SyntaxHighlighter.registerLanguage('sh', bash);
SyntaxHighlighter.registerLanguage('shell', bash);
SyntaxHighlighter.registerLanguage('json', json);
SyntaxHighlighter.registerLanguage('css', css);
SyntaxHighlighter.registerLanguage('sql', sql);
SyntaxHighlighter.registerLanguage('yaml', yaml);
SyntaxHighlighter.registerLanguage('yml', yaml);
SyntaxHighlighter.registerLanguage('html', markup);
SyntaxHighlighter.registerLanguage('xml', markup);
SyntaxHighlighter.registerLanguage('go', go);
SyntaxHighlighter.registerLanguage('rust', rust);
SyntaxHighlighter.registerLanguage('kotlin', kotlin);
SyntaxHighlighter.registerLanguage('swift', swift);
SyntaxHighlighter.registerLanguage('markdown', markdownLang);
SyntaxHighlighter.registerLanguage('md', markdownLang);

function useDarkMode() {
  const [dark, setDark] = useState(
    () => document.documentElement.getAttribute('data-theme') === 'dark',
  );
  useEffect(() => {
    const obs = new MutationObserver(() => {
      setDark(document.documentElement.getAttribute('data-theme') === 'dark');
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

type Props = {
  children: string;
  className?: string;
  onCheckboxChange?: (index: number, checked: boolean) => void;
};

export function MarkdownBody({ children, className, onCheckboxChange }: Props) {
  const isDark = useDarkMode();
  let cbIdx = 0;

  const cls = [styles['md-body'], className].filter(Boolean).join(' ');

  return (
    <div className={cls}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          // 言語ありコードブロック: SyntaxHighlighter が pre 相当を描画するため pre は素通し
          pre: ({ children: preChildren, node }) => {
            const codeChild = (node as any)?.children?.[0];
            const hasLanguage =
              Array.isArray(codeChild?.properties?.className) &&
              codeChild.properties.className.some((c: string) => c.startsWith('language-'));
            if (hasLanguage) return <>{preChildren}</>;
            return <pre className={styles['md-pre']}>{preChildren}</pre>;
          },
          code: ({ className: codeCls, children: codeChildren }) => {
            const match = /language-(\w+)/.exec(codeCls || '');
            if (match) {
              return (
                <div className="syntax-highlighter-wrap">
                  <SyntaxHighlighter
                    language={match[1]}
                    style={isDark ? oneDark : oneLight}
                    PreTag="div"
                    customStyle={{ margin: 0, borderRadius: '6px', fontSize: '85%' }}
                  >
                    {String(codeChildren).replace(/\n$/, '')}
                  </SyntaxHighlighter>
                </div>
              );
            }
            return <code className={codeCls}>{codeChildren}</code>;
          },
          a: ({ href, children: aChildren }) => (
            <a
              href={href}
              title={href}
              onClick={(e) => {
                e.preventDefault();
                if (href) Opener.open(href);
              }}
            >
              {aChildren}
            </a>
          ),
          input: ({ type, checked }) => {
            if (type === 'checkbox') {
              const idx = cbIdx++;
              return (
                <input
                  type="checkbox"
                  checked={!!checked}
                  className={styles['md-task-checkbox']}
                  onChange={(e) => onCheckboxChange?.(idx, e.target.checked)}
                  readOnly={!onCheckboxChange}
                />
              );
            }
            return <input type={type} readOnly />;
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
