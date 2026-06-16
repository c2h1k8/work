import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  XIcon, BoldIcon, ItalicIcon, HeadingIcon, ListIcon, ListOrderedIcon,
  ListChecksIcon, Code2Icon, LinkIcon, QuoteIcon,
} from 'lucide-react';
import { MarkdownBody } from './MarkdownBody';
import styles from '../styles/components/markdown-editor-modal.module.css';

type Props = {
  open: boolean;
  /** ヘッダーに表示するタイトル（例: 「説明を編集」） */
  title?: string;
  /** 開いた時点の初期テキスト */
  initialValue: string;
  placeholder?: string;
  onSave: (value: string) => void;
  onClose: () => void;
};

/**
 * 拡大 Markdown エディタ（左=ソース / 右=ライブプレビューの2ペイン）。
 * 説明欄・コメント新規・コメント編集で共用する。
 * - TaskModal の上に重ねるため createPortal + 高 z-index
 * - Esc は capture フェーズで奪って「最前面だけ」閉じる（背後の TaskModal は維持）
 * - Cmd/Ctrl+Enter で保存
 */
export function MarkdownEditorModal({
  open, title = 'Markdown 編集', initialValue, placeholder, onSave, onClose,
}: Props) {
  const [value, setValue] = useState(initialValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 開くたびに初期値で同期し、textarea にフォーカス
  useEffect(() => {
    if (!open) return;
    setValue(initialValue);
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
    });
  }, [open, initialValue]);

  const handleSave = useCallback(() => {
    onSave(value);
    onClose();
  }, [value, onSave, onClose]);

  // Esc / Cmd+Enter（capture フェーズで最前面が確実に処理）
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        e.preventDefault();
        onClose();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.stopImmediatePropagation();
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose, handleSave]);

  // ── ツールバー：選択範囲を加工して再選択 ──────────────────────
  /** 選択範囲を before/after で囲む（インライン装飾用） */
  const wrap = useCallback((before: string, after = before) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e, value: v } = ta;
    const sel = v.slice(s, e);
    const next = v.slice(0, s) + before + sel + after + v.slice(e);
    setValue(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(s + before.length, e + before.length);
    });
  }, []);

  /** 選択行の先頭にプレフィックスを付ける（リスト・見出し・引用用） */
  const linePrefix = useCallback((prefix: string | ((i: number) => string)) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e, value: v } = ta;
    const lineStart = v.lastIndexOf('\n', s - 1) + 1;
    const block = v.slice(lineStart, e);
    const lines = block.split('\n');
    const out = lines.map((ln, i) => (typeof prefix === 'function' ? prefix(i) : prefix) + ln).join('\n');
    const next = v.slice(0, lineStart) + out + v.slice(e);
    setValue(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(lineStart, lineStart + out.length);
    });
  }, []);

  /** 現在行の見出しレベルを循環: なし→H1→H2→H3→なし */
  const heading = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart: s, value: v } = ta;
    const lineStart = v.lastIndexOf('\n', s - 1) + 1;
    let lineEnd = v.indexOf('\n', s);
    if (lineEnd === -1) lineEnd = v.length;
    const line = v.slice(lineStart, lineEnd);
    const m = /^(#{1,6})\s/.exec(line);
    const cur = m ? m[1].length : 0;
    const next = cur >= 3 ? 0 : cur + 1;      // 3（H3）の次は解除
    const stripped = line.replace(/^#{1,6}\s/, '');
    const newLine = (next === 0 ? '' : '#'.repeat(next) + ' ') + stripped;
    const nextVal = v.slice(0, lineStart) + newLine + v.slice(lineEnd);
    setValue(nextVal);
    requestAnimationFrame(() => {
      ta.focus();
      const caret = lineStart + newLine.length;
      ta.setSelectionRange(caret, caret);
    });
  }, []);

  /** コードブロック（複数行ならフェンス、単一行ならインライン） */
  const code = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e, value: v } = ta;
    if (v.slice(s, e).includes('\n')) wrap('```\n', '\n```');
    else wrap('`');
  }, [wrap]);

  const link = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e, value: v } = ta;
    const sel = v.slice(s, e) || 'テキスト';
    const next = v.slice(0, s) + `[${sel}](url)` + v.slice(e);
    setValue(next);
    requestAnimationFrame(() => {
      ta.focus();
      // url 部分を選択状態に
      const urlStart = s + 1 + sel.length + 2;
      ta.setSelectionRange(urlStart, urlStart + 3);
    });
  }, []);

  if (!open) return null;

  const tools: { key: string; label: string; icon: React.ReactNode; onClick: () => void }[] = [
    { key: 'heading', label: '見出し（クリックで H1→H2→H3→解除）', icon: <HeadingIcon size={15} />, onClick: heading },
    { key: 'bold', label: '太字', icon: <BoldIcon size={15} />, onClick: () => wrap('**') },
    { key: 'italic', label: '斜体', icon: <ItalicIcon size={15} />, onClick: () => wrap('*') },
    { key: 'ul', label: '箇条書き', icon: <ListIcon size={15} />, onClick: () => linePrefix('- ') },
    { key: 'ol', label: '番号付き', icon: <ListOrderedIcon size={15} />, onClick: () => linePrefix((i) => `${i + 1}. `) },
    { key: 'task', label: 'チェックリスト', icon: <ListChecksIcon size={15} />, onClick: () => linePrefix('- [ ] ') },
    { key: 'quote', label: '引用', icon: <QuoteIcon size={15} />, onClick: () => linePrefix('> ') },
    { key: 'code', label: 'コード', icon: <Code2Icon size={15} />, onClick: code },
    { key: 'link', label: 'リンク', icon: <LinkIcon size={15} />, onClick: link },
  ];

  return createPortal(
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={title}>
      <div className={styles.backdrop} onClick={onClose} />
      <div className={styles.modal}>
        {/* ヘッダー */}
        <div className={styles.header}>
          <span className={styles.title}>{title}</span>
          <button type="button" className={styles.close} onClick={onClose} aria-label="閉じる">
            <XIcon size={16} aria-hidden="true" />
          </button>
        </div>

        {/* ツールバー */}
        <div className={styles.toolbar}>
          {tools.map((t) => (
            <button
              key={t.key}
              type="button"
              className={styles['toolbar__btn']}
              onClick={t.onClick}
              title={t.label}
              aria-label={t.label}
              // textarea のフォーカス/選択を維持するため mousedown で既定動作を抑止
              onMouseDown={(e) => e.preventDefault()}
            >
              {t.icon}
            </button>
          ))}
        </div>

        {/* 2ペイン（左=ソース / 右=ライブプレビュー） */}
        <div className={styles.panes}>
          <textarea
            ref={textareaRef}
            className={styles.source}
            value={value}
            placeholder={placeholder ?? 'Markdown で入力…'}
            onChange={(e) => setValue(e.target.value)}
            spellCheck={false}
          />
          <div className={styles.preview}>
            {value.trim()
              ? <MarkdownBody>{value}</MarkdownBody>
              : <span className={styles['preview__empty']}>（プレビューはここに表示されます）</span>}
          </div>
        </div>

        {/* フッター */}
        <div className={styles.footer}>
          <span className={styles.hint}>Esc: 閉じる ・ ⌘/Ctrl+Enter: 保存</span>
          <div className={styles['footer__actions']}>
            <button type="button" className={styles['btn-cancel']} onClick={onClose}>キャンセル</button>
            <button type="button" className={styles['btn-save']} onClick={handleSave}>保存</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
