import { describe, it, expect } from 'vitest';
import { sanitizeEditorHtml } from '../admin/RichTextEditor';

describe('rich text editor cleaning', () => {
  it('wraps loose text in a paragraph', () => {
    expect(sanitizeEditorHtml('First line<h2>Title</h2><p>Next</p>')).toBe('<p>First line</p><h2>Title</h2><p>Next</p>');
  });

  it('removes scripts, event handlers and unsafe links', () => {
    const html = sanitizeEditorHtml('<p onclick="x()">Hi<script>alert(1)</script> <a href="javascript:alert(1)">bad</a> <a href="https://aictig.org">ok</a></p>');
    expect(html).not.toMatch(/script|onclick|javascript/);
    expect(html).toContain('<a href="https://aictig.org" target="_blank" rel="noopener noreferrer">ok</a>');
  });

  it('keeps headings, lists, quotes and images, and drops styling', () => {
    const html = sanitizeEditorHtml('<div style="color:red"><b>Bold</b></div><ul><li>One</li></ul><blockquote>Q</blockquote><img src="/documents/a.jpg" onerror="x">');
    expect(html).toBe('<p><strong>Bold</strong></p><ul><li>One</li></ul><blockquote>Q</blockquote><p><img src="/documents/a.jpg" alt=""></p>');
  });
});
