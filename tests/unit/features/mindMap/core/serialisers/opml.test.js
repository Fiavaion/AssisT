import { fromOPML, toOPML } from '../../../../../../src/features/mindMap/core/serialisers/opml.js';
import { MindMapError, validateMap } from '../../../../../../src/features/mindMap/core/map-model.js';
import { walk } from '../../../../../../src/features/mindMap/core/map-ops.js';
import { buildMap, idSource, randomMap, sampleMap } from '../fixtures.js';

function outline(map) {
  const rows = [];
  walk(map, (node, depth) => {
    rows.push({ depth, text: node.text, notes: node.notes, url: node.source ? node.source.url : null });
  });
  return { title: map.title, source: map.source ? map.source.url : null, rows };
}

const roundTrip = map => fromOPML(toOPML(map), { ids: idSource('r') });

const codeOf = run => {
  try {
    run();
  } catch (error) {
    return error.code;
  }
  return null;
};

describe('toOPML', () => {
  it('writes a head with the title and a body of nested outlines', () => {
    const xml = toOPML(sampleMap());
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<opml version="2.0">');
    expect(xml).toContain('<title>Map</title>');
    expect(xml).toContain('<outline text="Root">');
    expect(xml).toContain('<outline text="Alpha one"/>');
    expect(xml.trim().endsWith('</opml>')).toBe(true);
  });

  it('writes notes in _note and a node source in _source', () => {
    const map = buildMap({
      text: 'Root',
      children: [{ text: 'Child', notes: 'a note', source: { url: 'https://example.org/a', quote: '', title: '' } }]
    });
    const xml = toOPML(map);
    expect(xml).toContain('_note="a note"');
    expect(xml).toContain('_source="https://example.org/a"');
  });

  it('escapes the five XML entities everywhere it writes text', () => {
    const map = buildMap({ text: 'Fish & <chips> "best" it’s', children: [] }, { title: 'A & B' });
    const xml = toOPML(map);
    expect(xml).toContain('<title>A &amp; B</title>');
    expect(xml).toContain('text="Fish &amp; &lt;chips&gt; &quot;best&quot; it’s"');
    expect(xml).not.toMatch(/text="[^"]*<chips>/);
  });
});

describe('fromOPML', () => {
  it('reads a standard OPML file', () => {
    const map = fromOPML(
      `<?xml version="1.0"?>
       <opml version="2.0">
         <head><title>Lecture</title></head>
         <body>
           <outline text="Root">
             <outline text="One" _note="a note"/>
             <outline text="Two"></outline>
           </outline>
         </body>
       </opml>`,
      { ids: idSource() }
    );
    expect(map.title).toBe('Lecture');
    expect(outline(map).rows).toEqual([
      { depth: 0, text: 'Root', notes: '', url: null },
      { depth: 1, text: 'One', notes: 'a note', url: null },
      { depth: 1, text: 'Two', notes: '', url: null }
    ]);
    expect(validateMap(map)).toEqual([]);
  });

  it('accepts single quotes, odd whitespace, comments and Windows line endings', () => {
    const map = fromOPML(
      "<opml>\r\n<!-- exported elsewhere -->\r\n<head><title>T</title></head>\r\n" +
        "<body>\r\n<outline\n   text='Root'\n>\r\n<outline text='One' />\r\n</outline>\r\n</body>\r\n</opml>",
      { ids: idSource() }
    );
    expect(outline(map).rows.map(row => row.text)).toEqual(['Root', 'One']);
  });

  it('decodes attribute entity escapes, named and numeric', () => {
    const map = fromOPML(
      '<opml><body><outline text="Fish &amp; &lt;chips&gt; &quot;best&quot; &apos;n &#39;good&#x27; &#65;"/></body></opml>',
      { ids: idSource() }
    );
    expect(map.nodes[map.rootId].text).toBe('Fish & <chips> "best" \'n \'good\' A');
  });

  it('reads an angle bracket inside an attribute without ending the tag', () => {
    const map = fromOPML('<opml><body><outline text="a > b"><outline text="child"/></outline></body></opml>', {
      ids: idSource()
    });
    expect(map.nodes[map.rootId].text).toBe('a > b');
    expect(map.nodes[map.rootId].children).toHaveLength(1);
  });

  it('makes a root from the title when the body has several top-level outlines', () => {
    const map = fromOPML(
      '<opml><head><title>Revision</title></head><body><outline text="One"/><outline text="Two"/></body></opml>',
      { ids: idSource() }
    );
    expect(map.nodes[map.rootId].text).toBe('Revision');
    expect(map.nodes[map.rootId].children).toHaveLength(2);
  });

  it('falls back to the supplied title and an empty body', () => {
    const map = fromOPML('<opml><body></body></opml>', { title: 'Given', ids: idSource() });
    expect(map.title).toBe('Given');
    expect(Object.keys(map.nodes)).toHaveLength(1);
    expect(validateMap(map)).toEqual([]);
  });

  it('rejects a file with no opml element at all', () => {
    expect(codeOf(() => fromOPML('not xml at all', { ids: idSource() }))).toBe('BAD_OPML');
    expect(() => fromOPML('', { ids: idSource() })).toThrow(MindMapError);
  });
});

describe('opml round trip', () => {
  it('preserves text, notes, structure and source urls', () => {
    const map = {
      ...buildMap({
        text: 'Root',
        children: [
          { text: 'Alpha', notes: 'first line\nsecond line', children: [{ text: 'Deep & wide' }] },
          { text: 'Beta', source: { url: 'https://example.org/b?a=1&b=2', quote: '', title: '' } }
        ]
      }),
      source: { url: 'https://example.org/start', title: 'Start' }
    };
    expect(outline(roundTrip(map))).toEqual(outline(map));
  });

  it('preserves generated maps', () => {
    for (const seed of [31, 32, 33, 34]) {
      const map = randomMap(seed, { nodes: 18 });
      expect(outline(roundTrip(map))).toEqual(outline(map));
    }
  });

  it('survives a second pass unchanged', () => {
    const map = randomMap(41, { nodes: 12 });
    const once = toOPML(roundTrip(map));
    expect(toOPML(roundTrip(fromOPML(once, { ids: idSource('s') })))).toBe(once);
  });
});
