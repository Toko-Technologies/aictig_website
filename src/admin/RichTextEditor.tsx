/**
 * A small, dependable rich-text editor for news and publications.
 *
 * Toolbar: text style (paragraph / heading / subheading), bold, italic, lists,
 * quote, link, image and file attachment. The editing area uses the same
 * styles as the public website (.wp-content), so what you see is what visitors
 * see. Everything typed or pasted is cleaned to a short list of safe tags.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ListBulletIcon,
  NumberedListIcon,
  PhotoIcon,
  LinkIcon,
  LinkSlashIcon,
  PaperClipIcon,
  ChatBubbleBottomCenterTextIcon,
} from '@heroicons/react/24/outline';
import { Spinner } from './ui';

const ALLOWED_TAGS = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'A', 'H2', 'H3', 'H4', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'IMG', 'FIGURE', 'FIGCAPTION']);
const RENAME: Record<string, string> = { B: 'strong', I: 'em', H1: 'h2', DIV: 'p' };
const SAFE_URL = /^(https?:\/\/|mailto:|\/(?!\/))/i;

/** Keep only safe tags and attributes; unwrap anything else. */
export function sanitizeEditorHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const clean = (node: Node, into: Node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        into.appendChild(doc.createTextNode(child.textContent || ''));
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      const el = child as HTMLElement;
      if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'META', 'LINK'].includes(el.tagName)) return;
      const tag = RENAME[el.tagName] ? RENAME[el.tagName].toUpperCase() : el.tagName;
      if (!ALLOWED_TAGS.has(tag)) {
        clean(el, into); // unwrap: keep the text, drop the tag
        return;
      }
      const out = doc.createElement(tag.toLowerCase());
      if (tag === 'A') {
        const href = el.getAttribute('href') || '';
        if (SAFE_URL.test(href)) out.setAttribute('href', href);
        if (/^https?:\/\//i.test(href)) {
          out.setAttribute('target', '_blank');
          out.setAttribute('rel', 'noopener noreferrer');
        }
      }
      if (tag === 'IMG') {
        const src = el.getAttribute('src') || '';
        if (!SAFE_URL.test(src)) return;
        out.setAttribute('src', src);
        out.setAttribute('alt', el.getAttribute('alt') || '');
      }
      clean(el, out);
      into.appendChild(out);
    });
  };
  const container = doc.createElement('div');
  clean(doc.body, container);

  // Loose text at the top level (typically the first line typed) goes into a
  // paragraph, so it gets the same spacing as the rest of the article.
  const BLOCKS = new Set(['P', 'H2', 'H3', 'H4', 'UL', 'OL', 'BLOCKQUOTE', 'FIGURE']);
  const normalized = doc.createElement('div');
  let paragraph: HTMLElement | null = null;
  Array.from(container.childNodes).forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE && BLOCKS.has((node as HTMLElement).tagName)) {
      paragraph = null;
      normalized.appendChild(node);
      return;
    }
    if (node.nodeType === Node.TEXT_NODE && !node.textContent?.trim() && !paragraph) return;
    if ((node as HTMLElement).tagName === 'BR' && !paragraph) return;
    if (!paragraph) {
      paragraph = doc.createElement('p');
      normalized.appendChild(paragraph);
    }
    paragraph.appendChild(node);
  });
  return normalized.innerHTML.replace(/<p>(\s|<br>)*<\/p>/g, '').trim();
}

function ToolButton({ label, onClick, children, active = false }: { label: string; onClick: () => void; children: ReactNode; active?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(e) => e.preventDefault()} // keep the text selection
      onClick={onClick}
      className={`inline-flex h-8 min-w-[2rem] items-center justify-center rounded px-1.5 text-sm font-semibold transition-colors ${
        active ? 'bg-primary-100 text-primary-700' : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
      }`}
    >
      {children}
    </button>
  );
}

export default function RichTextEditor({
  value,
  onChange,
  onUpload,
  placeholder = 'Write the text here…',
  invalid = false,
}: {
  value: string;
  onChange: (html: string) => void;
  /** Upload a file to WordPress; returns its public URL. */
  onUpload: (file: File) => Promise<{ url: string }>;
  placeholder?: string;
  invalid?: boolean;
}) {
  const editor = useRef<HTMLDivElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const savedRange = useRef<Range | null>(null);
  const [uploading, setUploading] = useState(false);
  const [empty, setEmpty] = useState(!value);
  const [, setTick] = useState(0); // re-render to update active toolbar states

  // Load the value into the editor, but never while the person is typing.
  useEffect(() => {
    const el = editor.current;
    if (!el || document.activeElement === el) return;
    if (sanitizeEditorHtml(el.innerHTML) !== value) {
      el.innerHTML = value;
      setEmpty(!el.textContent?.trim() && !el.querySelector('img'));
    }
  }, [value]);

  useEffect(() => {
    document.execCommand('defaultParagraphSeparator', false, 'p');
    const onSelection = () => {
      const sel = window.getSelection();
      if (sel && sel.rangeCount && editor.current?.contains(sel.anchorNode)) {
        savedRange.current = sel.getRangeAt(0).cloneRange();
        setTick((t) => t + 1);
      }
    };
    document.addEventListener('selectionchange', onSelection);
    return () => document.removeEventListener('selectionchange', onSelection);
  }, []);

  const emit = () => {
    const el = editor.current;
    if (!el) return;
    setEmpty(!el.textContent?.trim() && !el.querySelector('img'));
    onChange(sanitizeEditorHtml(el.innerHTML));
  };

  const restoreSelection = () => {
    const el = editor.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (savedRange.current && sel) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
  };

  const run = (command: string, arg?: string) => {
    restoreSelection();
    document.execCommand(command, false, arg);
    emit();
  };

  const isActive = (command: string) => {
    try {
      return document.queryCommandState(command);
    } catch {
      return false;
    }
  };
  const blockType = (() => {
    try {
      return String(document.queryCommandValue('formatBlock') || '').toLowerCase();
    } catch {
      return '';
    }
  })();

  const addLink = () => {
    const url = window.prompt('Web address for the link (for example https://www.example.org):', 'https://');
    if (!url || url === 'https://') return;
    if (!SAFE_URL.test(url.trim())) {
      window.alert('Please enter a full web address starting with https://');
      return;
    }
    restoreSelection();
    const sel = window.getSelection();
    if (sel && sel.isCollapsed) {
      document.execCommand('insertHTML', false, `<a href="${url.trim().replace(/"/g, '&quot;')}">${url.trim()}</a>`);
    } else {
      document.execCommand('createLink', false, url.trim());
    }
    emit();
  };

  const insertUpload = async (file: File | undefined, kind: 'image' | 'file') => {
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await onUpload(file);
      restoreSelection();
      const safeName = file.name.replace(/[<>&"]/g, '');
      const html = kind === 'image'
        ? `<p><img src="${url}" alt="${safeName.replace(/\.[^.]+$/, '')}"></p>`
        : `<p><a href="${url}">${safeName}</a></p>`;
      document.execCommand('insertHTML', false, html);
      emit();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'The upload failed.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={`overflow-hidden rounded-md border bg-white shadow-sm focus-within:ring-2 focus-within:ring-primary-500 ${invalid ? 'border-danger-400' : 'border-neutral-300'}`}>
      <div className="flex flex-wrap items-center gap-0.5 border-b border-neutral-200 bg-neutral-50 px-2 py-1.5" role="toolbar" aria-label="Formatting">
        <select
          aria-label="Text style"
          value={['h2', 'h3'].includes(blockType) ? blockType : 'p'}
          onMouseDown={() => { /* keep selection */ }}
          onChange={(e) => run('formatBlock', e.target.value)}
          className="mr-1 h-8 rounded border border-neutral-300 bg-white px-2 text-sm text-neutral-700 focus:outline-none"
        >
          <option value="p">Paragraph</option>
          <option value="h2">Heading</option>
          <option value="h3">Subheading</option>
        </select>
        <ToolButton label="Bold" onClick={() => run('bold')} active={isActive('bold')}><span className="font-bold">B</span></ToolButton>
        <ToolButton label="Italic" onClick={() => run('italic')} active={isActive('italic')}><span className="italic font-serif">I</span></ToolButton>
        <span className="mx-1 h-5 w-px bg-neutral-300" aria-hidden="true" />
        <ToolButton label="Bulleted list" onClick={() => run('insertUnorderedList')} active={isActive('insertUnorderedList')}><ListBulletIcon className="h-4 w-4" /></ToolButton>
        <ToolButton label="Numbered list" onClick={() => run('insertOrderedList')} active={isActive('insertOrderedList')}><NumberedListIcon className="h-4 w-4" /></ToolButton>
        <ToolButton label="Quote" onClick={() => run('formatBlock', blockType === 'blockquote' ? 'p' : 'blockquote')} active={blockType === 'blockquote'}><ChatBubbleBottomCenterTextIcon className="h-4 w-4" /></ToolButton>
        <span className="mx-1 h-5 w-px bg-neutral-300" aria-hidden="true" />
        <ToolButton label="Add link" onClick={addLink}><LinkIcon className="h-4 w-4" /></ToolButton>
        <ToolButton label="Remove link" onClick={() => run('unlink')}><LinkSlashIcon className="h-4 w-4" /></ToolButton>
        <ToolButton label="Insert image" onClick={() => imageInput.current?.click()}><PhotoIcon className="h-4 w-4" /></ToolButton>
        <ToolButton label="Attach a PDF or Word file" onClick={() => fileInput.current?.click()}><PaperClipIcon className="h-4 w-4" /></ToolButton>
        {uploading && <span className="ml-2 inline-flex items-center gap-1.5 text-xs text-neutral-500"><Spinner className="h-3.5 w-3.5" /> Uploading…</span>}
        <input ref={imageInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
          onChange={(e) => { insertUpload(e.target.files?.[0], 'image'); e.target.value = ''; }} />
        <input ref={fileInput} type="file" accept=".pdf,.doc,.docx,application/pdf" className="hidden"
          onChange={(e) => { insertUpload(e.target.files?.[0], 'file'); e.target.value = ''; }} />
      </div>
      <div className="relative">
        {empty && <p className="pointer-events-none absolute left-4 top-3 text-neutral-400">{placeholder}</p>}
        <div
          ref={editor}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label="Text"
          onInput={emit}
          onBlur={emit}
          onPaste={(e) => {
            e.preventDefault();
            const html = e.clipboardData.getData('text/html');
            const text = e.clipboardData.getData('text/plain');
            const safe = html
              ? sanitizeEditorHtml(html)
              : text.split(/\n{2,}/).map((p) => `<p>${p.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]!).replace(/\n/g, '<br>')}</p>`).join('');
            document.execCommand('insertHTML', false, safe);
            emit();
          }}
          className="wp-content min-h-[320px] max-h-[70vh] overflow-y-auto px-4 py-3 !text-base focus:outline-none"
        />
      </div>
    </div>
  );
}
