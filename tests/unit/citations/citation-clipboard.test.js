/**
 * Rich-text clipboard for citations — the "paste into any text box" moment.
 *
 * The contract: copy carries BOTH text/html (italics via <em>, hanging indent for references) and
 * text/plain, so Word/Google Docs/LMS editors get real formatting and plain textareas still work.
 * When the rich ClipboardItem path is unavailable, it degrades to plain writeText — never throws.
 */

import {
  referenceBlockHtml,
  bibliographyDocumentHtml,
  inlineHtml,
  copyRich,
} from '../../../src/features/citations/citation-clipboard.js';

describe('referenceBlockHtml', () => {
  it('wraps a formatted reference in a hanging-indent paragraph, preserving <em>', () => {
    const html = referenceBlockHtml('Smith, J. (2023) <em>Big ideas</em>. London: Press.');
    expect(html).toContain('<em>Big ideas</em>');
    expect(html).toMatch(/^<p\b/);
    expect(html).toContain('text-indent:-2em');
    expect(html).toContain('padding-left:2em');
  });

  it('escapes nothing itself — input is trusted formatter output (documented contract)', () => {
    // The formatters emit only text + <em>; the block wrapper must not double-escape them.
    expect(referenceBlockHtml('A &amp; B')).toContain('A &amp; B');
  });
});

describe('bibliographyDocumentHtml', () => {
  it('joins reference blocks into one fragment', () => {
    const html = bibliographyDocumentHtml(['Ref <em>one</em>.', 'Ref two.']);
    expect(html).toContain('Ref <em>one</em>.');
    expect(html).toContain('Ref two.');
    expect((html.match(/<p\b/g) || []).length).toBe(2);
  });

  it('returns an empty string for an empty list', () => {
    expect(bibliographyDocumentHtml([])).toBe('');
  });
});

describe('inlineHtml', () => {
  it('wraps an in-text citation or quote line in a span (no block styling)', () => {
    const html = inlineHtml('“Words” (Smith, 2023, p. 24)');
    expect(html).toMatch(/^<span\b/);
    expect(html).toContain('(Smith, 2023, p. 24)');
  });
});

describe('copyRich', () => {
  function richDeps() {
    const written = [];
    class FakeItem {
      constructor(parts) {
        this.parts = parts;
      }
    }
    return {
      written,
      deps: {
        clipboard: {
          write: jest.fn(async items => {
            written.push(...items);
          }),
          writeText: jest.fn(async () => {}),
        },
        ClipboardItemCtor: FakeItem,
        BlobCtor: class FakeBlob {
          constructor(bits, opts) {
            this.content = bits.join('');
            this.type = opts.type;
          }
        },
      },
    };
  }

  it('writes BOTH text/html and text/plain flavours', async () => {
    const { deps, written } = richDeps();
    const result = await copyRich({ html: '<p><em>x</em></p>', text: 'x' }, deps);
    expect(result).toEqual({ ok: true, rich: true });
    expect(written).toHaveLength(1);
    const parts = written[0].parts;
    expect(Object.keys(parts).sort()).toEqual(['text/html', 'text/plain']);
    expect(parts['text/html'].content).toBe('<p><em>x</em></p>');
    expect(parts['text/plain'].content).toBe('x');
  });

  it('falls back to plain writeText when ClipboardItem is unavailable', async () => {
    const writeText = jest.fn(async () => {});
    const result = await copyRich(
      { html: '<p>x</p>', text: 'plain x' },
      { clipboard: { writeText }, ClipboardItemCtor: undefined }
    );
    expect(result).toEqual({ ok: true, rich: false });
    expect(writeText).toHaveBeenCalledWith('plain x');
  });

  it('falls back to plain writeText when the rich write REJECTS (permissions, focus)', async () => {
    const writeText = jest.fn(async () => {});
    const { deps } = richDeps();
    deps.clipboard.write = jest.fn(async () => {
      throw new Error('denied');
    });
    deps.clipboard.writeText = writeText;
    const result = await copyRich({ html: '<p>x</p>', text: 'plain x' }, deps);
    expect(result).toEqual({ ok: true, rich: false });
    expect(writeText).toHaveBeenCalledWith('plain x');
  });

  it('reports failure (never throws) when even plain copy fails', async () => {
    const result = await copyRich(
      { html: '<p>x</p>', text: 'x' },
      {
        clipboard: {
          write: jest.fn(async () => {
            throw new Error('no');
          }),
          writeText: jest.fn(async () => {
            throw new Error('no');
          }),
        },
        ClipboardItemCtor: class {},
      }
    );
    expect(result).toEqual({ ok: false, rich: false });
  });
});
