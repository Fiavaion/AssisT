/**
 * Tests for the OCR Markdown renderer (Phase 5, B2).
 *
 * Renders the constrained Markdown subset that layout reconstruction (B1) and cloud-vision (B3)
 * produce into safe HTML. Security is enforced by escaping ALL text before introducing any tag, so
 * untrusted OCR / AI output can never inject markup. Pure and deterministic (no DOMPurify dependency);
 * the call site adds DOMPurify as defense-in-depth.
 */

import {
  renderMarkdownToHtml,
  escapeHtml,
  stripMarkdownForSpeech,
} from '../../../src/features/ocr/ocr-markdown.js';

describe('escapeHtml', () => {
  it('escapes HTML-significant characters', () => {
    expect(escapeHtml('<script>alert("x")&\'</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&amp;&#39;&lt;/script&gt;'
    );
  });
});

describe('renderMarkdownToHtml', () => {
  it('returns empty string for empty/whitespace input', () => {
    expect(renderMarkdownToHtml('')).toBe('');
    expect(renderMarkdownToHtml('   \n  ')).toBe('');
    expect(renderMarkdownToHtml(null)).toBe('');
  });

  it('renders headings h1–h3', () => {
    expect(renderMarkdownToHtml('# Title')).toBe('<h1>Title</h1>');
    expect(renderMarkdownToHtml('## Sub')).toBe('<h2>Sub</h2>');
    expect(renderMarkdownToHtml('### Deep')).toBe('<h3>Deep</h3>');
  });

  it('renders paragraphs separated by blank lines', () => {
    expect(renderMarkdownToHtml('First para\n\nSecond para')).toBe(
      '<p>First para</p>\n<p>Second para</p>'
    );
  });

  it('reflows single newlines within a paragraph into spaces', () => {
    expect(renderMarkdownToHtml('line one\nline two')).toBe('<p>line one line two</p>');
  });

  it('renders a heading followed by a paragraph', () => {
    expect(renderMarkdownToHtml('# Title\n\nBody text here')).toBe(
      '<h1>Title</h1>\n<p>Body text here</p>'
    );
  });

  it('renders inline bold and italic', () => {
    expect(renderMarkdownToHtml('a **bold** and *italic* word')).toBe(
      '<p>a <strong>bold</strong> and <em>italic</em> word</p>'
    );
  });

  it('escapes HTML in body text so OCR/AI output cannot inject markup', () => {
    const html = renderMarkdownToHtml('Visit <script>alert(1)</script> now');
    expect(html).toBe('<p>Visit &lt;script&gt;alert(1)&lt;/script&gt; now</p>');
    expect(html).not.toContain('<script>');
  });

  it('escapes HTML inside headings too', () => {
    expect(renderMarkdownToHtml('# <img src=x onerror=alert(1)>')).toBe(
      '<h1>&lt;img src=x onerror=alert(1)&gt;</h1>'
    );
  });
});

describe('stripMarkdownForSpeech', () => {
  it('returns empty for empty input', () => {
    expect(stripMarkdownForSpeech('')).toBe('');
    expect(stripMarkdownForSpeech(null)).toBe('');
    expect(stripMarkdownForSpeech('   ')).toBe('');
  });

  it('removes heading markers so the reader does not say "hash"', () => {
    expect(stripMarkdownForSpeech('# Title')).toBe('Title');
    expect(stripMarkdownForSpeech('### Deep heading')).toBe('Deep heading');
  });

  it('removes emphasis, keeping the words', () => {
    expect(stripMarkdownForSpeech('a **bold** and *italic* and _under_ word')).toBe(
      'a bold and italic and under word'
    );
  });

  it('keeps the visible text of links and images', () => {
    expect(stripMarkdownForSpeech('See [Wikipedia](https://w.org) now')).toBe('See Wikipedia now');
    expect(stripMarkdownForSpeech('![a cat](cat.png)')).toBe('a cat');
  });

  it('removes list, quote markers, inline code, and horizontal rules', () => {
    expect(stripMarkdownForSpeech('- item one')).toBe('item one');
    expect(stripMarkdownForSpeech('1. first')).toBe('first');
    expect(stripMarkdownForSpeech('> quoted')).toBe('quoted');
    expect(stripMarkdownForSpeech('use `code` here')).toBe('use code here');
    expect(stripMarkdownForSpeech('---')).toBe('');
  });

  it('preserves paragraph breaks for natural pauses', () => {
    expect(stripMarkdownForSpeech('# Title\n\nBody one\n\nBody two')).toBe(
      'Title\n\nBody one\n\nBody two'
    );
  });
});
