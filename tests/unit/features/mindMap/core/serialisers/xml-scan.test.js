/**
 * The one XML scanner every importer reads through. `core/` has no DOM, but this suite runs in
 * jsdom, so what the scanner writes and accepts is checked against a real XML parser here.
 */

import {
  escapeXml,
  safeLink,
  scanXml,
} from '../../../../../../src/features/mindMap/core/serialisers/xml-scan.js';
import { MindMapError } from '../../../../../../src/features/mindMap/core/map-model.js';

const events = xml => {
  const seen = [];
  scanXml(xml, {
    open: (name, attributes) => seen.push(['open', name, attributes]),
    close: name => seen.push(['close', name]),
    text: value => seen.push(['text', value]),
  });
  return seen;
};

/** A value as the scanner decodes it, which has to be the same in text and in an attribute. */
const decoded = value => {
  const seen = events(`<a t="${value}">${value}</a>`);
  const text = seen
    .filter(event => event[0] === 'text')
    .map(event => event[1])
    .join('');
  expect(seen[0][2].t).toBe(text);
  return text;
};

const codeOf = run => {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(MindMapError);
    expect(error.message).toMatch(/^[A-Z].*\.$/s);
    return error.code;
  }
  return null;
};

const parses = xml =>
  new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('parsererror')
    .length === 0;

describe('scanXml', () => {
  it('announces elements, attributes and text in document order, names lower-cased', () => {
    expect(events('<A One="1" two=\'2\'>hi<b/></A>')).toEqual([
      ['open', 'a', { one: '1', two: '2' }],
      ['text', 'hi'],
      ['open', 'b', {}],
      ['close', 'b'],
      ['close', 'a'],
    ]);
  });

  it('reads an angle bracket inside an attribute without ending the tag', () => {
    expect(events('<a t="x > y"/>')[0]).toEqual(['open', 'a', { t: 'x > y' }]);
  });

  it('folds a literal newline in an attribute to a space and keeps an escaped one', () => {
    expect(events('<a t="one\ntwo&#10;three"/>')[0][2].t).toBe('one two\nthree');
  });

  it('reads CDATA as text and skips comments and processing instructions', () => {
    expect(events('<?xml version="1.0"?><!-- c --><a><![CDATA[x < y]]></a>')).toEqual([
      ['open', 'a', {}],
      ['text', 'x < y'],
      ['close', 'a'],
    ]);
  });

  it('steps past a DOCTYPE that declares nothing', () => {
    expect(events('<!DOCTYPE opml SYSTEM "a>b.dtd"><a/>')).toHaveLength(2);
  });

  it('refuses a DOCTYPE with an internal subset before reading anything else', () => {
    const seen = [];
    const xml = '<!DOCTYPE a [<!ENTITY x "a > b">]><a>&x;</a>';
    expect(
      codeOf(() => scanXml(xml, { open: name => seen.push(name), close() {}, text() {} }))
    ).toBe('UNSAFE_XML');
    expect(seen).toEqual([]);
  });

  it.each([
    ['an unclosed comment', '<a><!-- never'],
    ['an unclosed CDATA section', '<a><![CDATA[never'],
    ['an unclosed processing instruction', '<?xml never'],
    ['an unclosed tag', '<a t="1"'],
    ['an unclosed element', '<a><b></b>'],
    ['a mismatched close', '<a></b>'],
    ['a close with nothing open', '</a>'],
    ['an unquoted attribute', '<a t=1/>'],
    ['an attribute with no value', '<a t/>'],
    ['an unclosed attribute value', '<a t="1/>'],
    ['a tag with no name', '< a/>'],
    ['a stray slash', '<a / >'],
    ['an unclosed declaration', '<!DOCTYPE a'],
  ])('refuses %s', (_label, xml) => {
    expect(codeOf(() => events(xml))).toBe('BAD_XML');
  });

  it('does not recurse, however deep the document', () => {
    const depth = 200000;
    let deepest = 0;
    let open = 0;
    scanXml('<a>'.repeat(depth) + '</a>'.repeat(depth), {
      open() {
        open += 1;
        deepest = Math.max(deepest, open);
      },
      close() {
        open -= 1;
      },
      text() {},
    });
    expect(deepest).toBe(depth);
  });
});

describe('decoding, as scanXml hands text and attribute values over', () => {
  it('decodes the five predefined entities, nbsp and numeric references', () => {
    expect(decoded('&amp;&lt;&gt;&quot;&apos;&nbsp;&#65;&#x42;&#X43;&#x1F4A1;')).toBe(
      '&<>"\'\u00a0ABC\u{1f4a1}'
    );
  });

  it('leaves an entity it does not define as it was written', () => {
    expect(decoded('&sigma; &lol9; &#zz; &#12a; & alone')).toBe(
      '&sigma; &lol9; &#zz; &#12a; & alone'
    );
  });

  it('keeps tab, line feed and carriage return references', () => {
    expect(decoded('a&#9;b&#10;c&#13;d')).toBe('a\tb\nc\rd');
  });

  it.each([
    ['NUL', '&#0;'],
    ['a C0 control', '&#1;'],
    ['a vertical tab', '&#11;'],
    ['a form feed', '&#x0C;'],
    ['unit separator', '&#x1F;'],
    ['a high surrogate', '&#xD800;'],
    ['a low surrogate', '&#xDFFF;'],
    ['a non-character', '&#xFFFE;'],
    ['a code point past Unicode', '&#x110000;'],
    ['an absurd digit string', `&#${'9'.repeat(400)};`],
    ['an absurd hex string', `&#x${'F'.repeat(400)};`],
  ])('drops %s rather than admitting it', (_label, reference) => {
    expect(decoded(`a${reference}b`)).toBe('ab');
  });

  it('drops a raw control character and a lone surrogate that arrived unescaped', () => {
    expect(decoded('a\u000bb\u0000c\ud800d\udc00e\u{1f4a1}f')).toBe('abcde\u{1f4a1}f');
  });
});

describe('escapeXml', () => {
  it('escapes markup, quotes and the whitespace an attribute would fold', () => {
    expect(escapeXml('a & <b> "c"\td\ne\rf')).toBe(
      'a &amp; &lt;b&gt; &quot;c&quot;&#9;d&#10;e&#13;f'
    );
  });

  it('writes nothing XML 1.0 forbids', () => {
    const hostile =
      'x\u0000\u0001\u0008\u000b\u000c\u000e\u001f\ufffe\uffff\ud800y\udfffz ]]> \u{1f4a1} \u200f';
    const escaped = escapeXml(hostile);
    expect(escaped).toBe('xyz ]]&gt; \u{1f4a1} \u200f');
    expect(parses(`<a t="${escaped}">${escaped}</a>`)).toBe(true);
  });

  it('round trips through the scanner for everything XML can carry', () => {
    const value = 'Fish & <chips> "best" \'n\' \t\n\r \u00a0 \u{1f4a1} ]]> &amp; &#0;';
    expect(decoded(escapeXml(value))).toBe(value);
  });
});

describe('safeLink', () => {
  it.each([
    ['https://example.org/a', 'https://example.org/a'],
    ['HTTPS://Example.org/a', 'HTTPS://Example.org/a'],
    ['http://example.org/a', 'http://example.org/a'],
    ['mailto:a@b.c', 'mailto:a@b.c'],
    ['  https://example.org/a \n', 'https://example.org/a'],
    ['http://a b/c', 'http://a b/c'],
    // A URL parser ignores a tab or a newline inside the scheme, so the test does too; what is kept
    // is still the link as written.
    ['ht\ttps://example.org/a', 'ht\ttps://example.org/a'],
    ['javascript:alert(1)', null],
    [' JavaScript:alert(1)', null],
    ['java\tscript:alert(1)', null],
    ['\u0001javascript:alert(1)', null],
    ['file:///C:/notes.txt', null],
    ['xmind:#12345', null],
    ['data:text/html,<script>', null],
    ['other.mm', null],
    ['', null],
    [null, null],
    [42, null],
  ])('reads %j as %j', (url, expected) => {
    expect(safeLink(url)).toBe(expected);
  });
});
