/**
 * `fromXMind` reads a file a student did not write and AssisT cannot vouch for, so alongside the
 * two hand-written fixtures this suite drives the reader with the shapes a damaged, hostile or
 * merely very large archive produces.
 */

import { DecompressionStream as NodeDecompressionStream } from 'node:stream/web';
import { fromXMind } from '../../../../../../src/features/mindMap/core/serialisers/xmind.js';
import {
  MindMapError,
  validateMap,
} from '../../../../../../src/features/mindMap/core/map-model.js';
import { walk } from '../../../../../../src/features/mindMap/core/map-ops.js';
import { readZip } from '../../../../../../src/utils/zip-reader.js';
import { buildZip } from '../../../../utils/zip-fixtures.js';
import { idSource } from '../fixtures.js';
import { describeImportCaps } from './import-caps.js';
import { CURRENT_CONTENT_JSON, LEGACY_CONTENT_XML } from './xmind-fixtures.js';

const read = (parts, options = {}) => fromXMind(parts, { ids: idSource('x'), ...options });

/** The outline as rows, so the two formats can be compared against one expectation. */
function outline(map) {
  const rows = [];
  walk(map, (node, depth) => {
    rows.push({
      depth,
      text: node.text,
      notes: node.notes,
      url: node.source ? node.source.url : null,
      symbol: node.symbol,
      done: node.done,
      collapsed: node.collapsed,
    });
  });
  return rows;
}

const row = (depth, text, extra = {}) => ({
  depth,
  text,
  notes: '',
  url: null,
  symbol: null,
  done: false,
  collapsed: false,
  ...extra,
});

const EXPECTED_OUTLINE = [
  row(0, 'Climate policy essay'),
  row(1, 'Introduction', {
    notes: 'Open with the 2026 target.',
    symbol: '\u2757',
  }),
  row(2, 'Hook', { url: 'https://example.org/hook' }),
  row(2, 'Thesis'),
  row(1, 'Evidence', { collapsed: true, done: true, symbol: '⭐' }),
  row(2, 'IPCC AR7'),
  row(2, '<script>alert(1)</script> Email the tutor', { url: 'mailto:tutor@example.ac.uk' }),
  row(1, 'Floating topics'),
  row(2, 'Ask the tutor about word count'),
];

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

const textOf = (map, text) => Object.values(map.nodes).find(node => node.text === text);

describe('fromXMind — current content.json', () => {
  it('reads titles, order, notes, links, markers, folded branches and floating topics', () => {
    const { map } = read({ contentJson: CURRENT_CONTENT_JSON });
    expect(outline(map)).toEqual(EXPECTED_OUTLINE);
  });

  it('returns a map the model accepts', () => {
    const { map } = read({ contentJson: CURRENT_CONTENT_JSON });
    expect(validateMap(map)).toEqual([]);
  });

  // The count is what the import sentence needs: "the first of 3 sheets". The sheet's own name was
  // returned beside it and nothing ever read it — the sentence names the map, whose title is that
  // same name — so the result holds the count and the map, and nothing a caller has to ignore.
  it('hands back the map and the sheet count, and nothing else', () => {
    expect(Object.keys(read({ contentJson: CURRENT_CONTENT_JSON })).sort()).toEqual([
      'map',
      'sheetCount',
    ]);
  });

  it('reports how many sheets the file holds and which one was imported', () => {
    const result = read({ contentJson: CURRENT_CONTENT_JSON });
    expect(result.sheetCount).toBe(2);
    expect(result.map.title).toBe('Essay plan');
    expect(textOf(result.map, 'Reading')).toBeUndefined();
  });

  it('drops a link in a scheme the browser must not follow', () => {
    const { map } = read({ contentJson: CURRENT_CONTENT_JSON });
    expect(textOf(map, 'Thesis').source).toBeNull();
    expect(textOf(map, 'Hook').source).toEqual({
      url: 'https://example.org/hook',
      quote: '',
      title: '',
    });
  });

  it.each([
    ['javascript:alert(1)', null],
    [' JavaScript:alert(1)', null],
    ['file:///C:/notes.txt', null],
    ['xmind:#12345', null],
    ['data:text/html,<script>', null],
    ['HTTPS://Example.org/a', 'HTTPS://Example.org/a'],
    ['http://example.org/a', 'http://example.org/a'],
    ['mailto:a@b.c', 'mailto:a@b.c'],
  ])('keeps %s as %s', (href, expected) => {
    const json = JSON.stringify([
      { id: 's', title: 'S', rootTopic: { id: 'r', title: 'Root', href } },
    ]);
    const { map } = read({ contentJson: json });
    expect(map.nodes[map.rootId].source && map.nodes[map.rootId].source.url).toBe(expected);
  });

  it('snaps a topic fill to the nearest branch colour and inherits when there is none', () => {
    const { map } = read({ contentJson: CURRENT_CONTENT_JSON });
    expect(map.nodes[map.rootId].colour).toBe(0);
    expect(textOf(map, 'IPCC AR7').colour).toBe(3);
    expect(textOf(map, 'Hook').colour).toBeNull();
  });

  it('turns a relationship into a cross-link and drops one whose end is missing', () => {
    const { map } = read({ contentJson: CURRENT_CONTENT_JSON });
    expect(map.links).toHaveLength(1);
    expect(map.links[0].from).toBe(textOf(map, 'Thesis').id);
    expect(map.links[0].to).toBe(textOf(map, 'IPCC AR7').id);
    expect(map.links[0].label).toBe('supported by');
  });

  it('maps only the markers it has a symbol for, and the first of several', () => {
    const marked = markers => {
      const json = JSON.stringify([
        {
          id: 's',
          title: 'S',
          rootTopic: {
            id: 'r',
            title: 'Root',
            markerRefs: markers.map(markerId => ({ markerId })),
          },
        },
      ]);
      return read({ contentJson: json }).map;
    };
    expect(marked(['flag-red']).nodes.x2.symbol).toBe('\u{1f3af}');
    expect(marked(['people-orange']).nodes.x2.symbol).toBeNull();
    expect(marked(['people-orange', 'star-green']).nodes.x2.symbol).toBe('⭐');
    expect(marked(['task-done']).nodes.x2.done).toBe(true);
    expect(marked(['task-oct']).nodes.x2.done).toBe(false);
  });

  it('reads the markers key XMind 2021 writes as well as markerRefs', () => {
    const json = JSON.stringify([
      {
        id: 's',
        title: 'S',
        rootTopic: { id: 'r', title: 'Root', markers: [{ markerId: 'task-done' }] },
      },
    ]);
    expect(read({ contentJson: json }).map.nodes.x2.done).toBe(true);
  });

  it.each(['constructor', 'toString', 'hasOwnProperty', 'valueOf', '__proto__', 'prototype'])(
    'reads the marker id %s as no symbol, and the map it makes can be stored',
    markerId => {
      const json = JSON.stringify([
        {
          id: 's',
          title: 'S',
          rootTopic: {
            id: 'r',
            title: 'Root',
            markerRefs: [{ markerId }, { markerId: 'star-red' }],
          },
        },
      ]);
      const { map } = read({ contentJson: json });
      expect(map.nodes.x2.symbol).toBe('\u2b50');
      expect(validateMap(map)).toEqual([]);
      expect(() => structuredClone(map)).not.toThrow();
    }
  );

  it('keeps labels, which are the student’s own words, at the end of the notes', () => {
    const json = JSON.stringify([
      {
        id: 's',
        title: 'S',
        rootTopic: {
          id: 'r',
          title: 'Root',
          labels: ['exam', ' week 4 ', '', 7, null],
          children: {
            attached: [
              { id: 'a', title: 'One', labels: ['todo'], notes: { plain: { content: 'a note' } } },
              { id: 'b', title: 'Two', labels: 'not a list' },
            ],
          },
        },
      },
    ]);
    const { map } = read({ contentJson: json });
    expect(map.nodes[map.rootId].notes).toBe('Labels: exam, week 4');
    expect(textOf(map, 'One').notes).toBe('a note\n\nLabels: todo');
    expect(textOf(map, 'Two').notes).toBe('');
  });

  it('names an untitled sheet and an untitled topic without leaving undefined in the map', () => {
    const json = JSON.stringify([{ id: 's', rootTopic: { id: 'r', children: {} } }]);
    const result = read({ contentJson: json, contentXml: '' }, { title: 'Imported map' });
    expect(result.map.title).toBe('Imported map');
    expect(result.map.nodes[result.map.rootId].text).toBe('Imported map');
  });

  it('adds no Floating topics node when the sheet has none', () => {
    const json = JSON.stringify([
      { id: 's', title: 'S', rootTopic: { id: 'r', title: 'Root', children: { detached: [] } } },
    ]);
    const { map } = read({ contentJson: json });
    expect(outline(map).map(entry => entry.text)).toEqual(['Root']);
  });
});

describe('fromXMind — legacy content.xml', () => {
  it('reads the same map out of the legacy layout', () => {
    const { map } = read({ contentXml: LEGACY_CONTENT_XML });
    expect(outline(map)).toEqual(EXPECTED_OUTLINE);
    expect(validateMap(map)).toEqual([]);
  });

  it('reports the sheet count and names the map after the first sheet, not after a topic', () => {
    const result = read({ contentXml: LEGACY_CONTENT_XML });
    expect(result.sheetCount).toBe(2);
    expect(result.map.title).toBe('Essay plan');
  });

  it('carries the relationship across', () => {
    const { map } = read({ contentXml: LEGACY_CONTENT_XML });
    expect(map.links).toHaveLength(1);
    expect(map.links[0].label).toBe('supported by');
  });

  it('leaves markup in a title as text rather than as a tag', () => {
    const { map } = read({ contentXml: LEGACY_CONTENT_XML });
    expect(textOf(map, '<script>alert(1)</script> Email the tutor')).toBeDefined();
  });

  it('takes the text of a title and ignores any element inside it', () => {
    const xml = `<xmap-content><sheet><topic><title>Bold <b>claim</b> here</title></topic></sheet></xmap-content>`;
    const { map } = read({ contentXml: xml });
    expect(map.nodes[map.rootId].text).toBe('Bold claim here');
  });

  it('refuses a file that declares its own entities, before reading a topic', () => {
    const xml = `<?xml version="1.0"?>
      <!DOCTYPE xmap-content [
        <!ENTITY lol "lol">
        <!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
      ]>
      <xmap-content><sheet><topic><title>&lol2;</title></topic></sheet></xmap-content>`;
    expect(codeOf(() => read({ contentXml: xml }))).toBe('UNSAFE_XML');
  });

  it('does not read an entity value as document content when it holds an angle bracket', () => {
    const xml =
      '<!DOCTYPE xmap-content [<!ENTITY x "a > <sheet><topic><title>smuggled</title></topic></sheet>">]>' +
      '<xmap-content><sheet><topic><title>real</title></topic></sheet></xmap-content>';
    expect(codeOf(() => read({ contentXml: xml }))).toBe('UNSAFE_XML');
  });

  it('leaves an entity nobody declared as the letters it was written with', () => {
    const xml =
      '<xmap-content><sheet><topic><title>&lol2; &amp; co</title></topic></sheet></xmap-content>';
    expect(read({ contentXml: xml }).map.nodes.x2.text).toBe('&lol2; & co');
  });

  it('refuses content.xml that is cut short rather than importing the half that arrived', () => {
    const xml = '<xmap-content><sheet><topic><title>Root</title><children><topics>';
    expect(codeOf(() => read({ contentXml: xml }))).toBe('BAD_XML');
  });

  it('reads element names that carry a namespace prefix', () => {
    const xml =
      '<xm:xmap-content xmlns:xm="urn:xmind:xmap:xmlns:content:2.0" xmlns:xlink="http://www.w3.org/1999/xlink">' +
      '<xm:sheet><xm:topic id="r"><xm:title>Root</xm:title><xm:children><xm:topics type="attached">' +
      '<xm:topic id="a" xlink:href="https://example.org/a"><xm:title>One</xm:title>' +
      '<xm:notes><xm:plain>a note</xm:plain></xm:notes></xm:topic>' +
      '</xm:topics></xm:children></xm:topic><xm:title>Sheet</xm:title></xm:sheet></xm:xmap-content>';
    const result = read({ contentXml: xml });
    expect(result.map.title).toBe('Sheet');
    expect(outline(result.map)).toEqual([
      row(0, 'Root'),
      row(1, 'One', { notes: 'a note', url: 'https://example.org/a' }),
    ]);
  });

  it('keeps labels, which are the student’s own words, at the end of the notes', () => {
    const xml =
      '<xmap-content><sheet><topic><title>Root</title><labels><label>exam</label><label>week 4</label></labels>' +
      '<children><topics type="attached"><topic><title>One</title><notes><plain>a note</plain></notes>' +
      '<labels><label>todo</label></labels></topic></topics></children></topic></sheet></xmap-content>';
    const { map } = read({ contentXml: xml });
    expect(map.nodes[map.rootId].notes).toBe('Labels: exam, week 4');
    expect(textOf(map, 'One').notes).toBe('a note\n\nLabels: todo');
  });

  it('decodes the five XML entities and numeric escapes', () => {
    const xml = `<xmap-content><sheet><topic><title>Fish &amp; chips &#8212; &quot;best&quot;</title></topic></sheet></xmap-content>`;
    const { map } = read({ contentXml: xml });
    expect(map.nodes[map.rootId].text).toBe('Fish & chips — "best"');
  });
});

describe('fromXMind — choosing a source', () => {
  it('prefers content.json when both are present', () => {
    const json = JSON.stringify([
      { id: 's', title: 'From JSON', rootTopic: { id: 'r', title: 'JSON root' } },
    ]);
    const result = read({ contentJson: json, contentXml: LEGACY_CONTENT_XML });
    expect(result.map.nodes[result.map.rootId].text).toBe('JSON root');
  });

  it('falls back to content.xml when content.json will not parse', () => {
    const result = read({ contentJson: '[{"id": ', contentXml: LEGACY_CONTENT_XML });
    expect(result.map.title).toBe('Essay plan');
  });

  it('falls back to content.xml when content.json holds no sheets', () => {
    const result = read({ contentJson: '[]', contentXml: LEGACY_CONTENT_XML });
    expect(result.map.title).toBe('Essay plan');
  });
});

describe('fromXMind — refusals', () => {
  it('refuses a file with neither part', () => {
    expect(codeOf(() => read({}))).toBe('BAD_XMIND');
  });

  it('refuses content.json that will not parse when there is no fallback', () => {
    expect(codeOf(() => read({ contentJson: '[{"id": ' }))).toBe('BAD_JSON');
  });

  it('refuses content.json that is not an array of sheets', () => {
    expect(codeOf(() => read({ contentJson: '{"sheet": 1}' }))).toBe('BAD_XMIND');
    expect(codeOf(() => read({ contentJson: '[]' }))).toBe('BAD_XMIND');
  });

  it('refuses a first sheet with no central topic', () => {
    expect(codeOf(() => read({ contentJson: '[{"id":"s","title":"S"}]' }))).toBe('BAD_XMIND');
  });

  it('refuses content.xml with no topic', () => {
    expect(codeOf(() => read({ contentXml: '<xmap-content></xmap-content>' }))).toBe('BAD_XMIND');
  });

  it('refuses XML nested past any sane depth without reading to the end of it', () => {
    const xml = `<xmap-content><sheet>${'<topic><children><topics>'.repeat(600)}<topic><title>deep</title></topic>`;
    expect(codeOf(() => read({ contentXml: xml }))).toBe('TOO_DEEP');
  });
});

/** `{"title": …, "children": {"attached": [ … ]}}`, nested by hand because stringify recurses. */
const nestedJson = levels =>
  `[{"id":"s","title":"S","rootTopic":${'{"title":"d","children":{"attached":['.repeat(levels - 1)}{"title":"deepest"}${']}}'.repeat(levels - 1)}}]`;

describe('fromXMind — content.json, by the thousand', () => {
  describeImportCaps({
    read: (contentJson, options) => read({ contentJson }, options).map,
    flat: count =>
      JSON.stringify([
        {
          id: 's',
          title: 'S',
          rootTopic: {
            id: 'r',
            title: 'Root',
            children: {
              attached: Array.from({ length: count - 1 }, (_unused, at) => ({
                id: `t${at}`,
                title: `Topic ${at}`,
              })),
            },
          },
        },
      ]),
    nested: nestedJson,
    unnamed: () =>
      JSON.stringify([
        {
          rootTopic: {
            id: 'r',
            children: {
              attached: [{ id: 'a' }, { id: 'b', title: '  ' }, { id: 'c', title: null }],
            },
          },
        },
      ]),
  });

  it('names a topic that has no title', () => {
    const { map } = read({
      contentJson: JSON.stringify([
        { title: 'S', rootTopic: { title: 'Root', children: { attached: [{ id: 'a' }] } } },
      ]),
    });
    expect(map.nodes[map.nodes[map.rootId].children[0]].text).toBe('(untitled)');
  });

  it('counts floating topics, and the node that holds them, against the cap', () => {
    const topics = length => Array.from({ length }, (_unused, at) => ({ title: `t${at}` }));
    const sheet = (attached, detached) =>
      JSON.stringify([
        {
          title: 'S',
          rootTopic: {
            title: 'Root',
            children: { attached: topics(attached), detached: topics(detached) },
          },
        },
      ]);
    expect(Object.keys(read({ contentJson: sheet(4000, 998) }).map.nodes)).toHaveLength(5000);
    expect(codeOf(() => read({ contentJson: sheet(4000, 999) }))).toBe('TOO_MANY_NODES');
  });

  it('refuses two hundred thousand floating topics with the sentence, not a stack error', () => {
    const detached = `[${'{"title":"t"},'.repeat(199999)}{"title":"t"}]`;
    const json = `[{"title":"S","rootTopic":{"title":"Root","children":{"detached":${detached}}}}]`;
    expect(codeOf(() => read({ contentJson: json }))).toBe('TOO_MANY_NODES');
  });

  it('keeps a floating topic that hangs from another floating topic', () => {
    const json = JSON.stringify([
      {
        title: 'S',
        rootTopic: {
          title: 'Root',
          children: {
            detached: [{ title: 'Loose', children: { detached: [{ title: 'Looser' }] } }],
          },
        },
      },
    ]);
    expect(
      outline(read({ contentJson: json }).map).map(entry => [entry.depth, entry.text])
    ).toEqual([
      [0, 'Root'],
      [1, 'Floating topics'],
      [2, 'Loose'],
      [2, 'Looser'],
    ]);
  });
});

describe('fromXMind — content.xml, by the thousand', () => {
  describeImportCaps({
    read: (contentXml, options) => read({ contentXml }, options).map,
    flat: count =>
      `<xmap-content><sheet><topic><title>Root</title><children><topics type="attached">${'<topic><title>n</title></topic>'.repeat(count - 1)}</topics></children></topic></sheet></xmap-content>`,
    nested: levels =>
      `<xmap-content><sheet>${'<topic><title>d</title><children><topics type="attached">'.repeat(levels - 1)}<topic><title>deepest</title></topic>${'</topics></children></topic>'.repeat(levels - 1)}</sheet></xmap-content>`,
    unnamed: () =>
      '<xmap-content><sheet><topic><children><topics type="attached"><topic/><topic><title> </title></topic></topics></children></topic></sheet></xmap-content>',
  });
});

describe('fromXMind — from a real archive', () => {
  it('reads a whole .xmind through the zip reader without touching its attachments', async () => {
    const file = buildZip([
      { name: 'content.json', data: CURRENT_CONTENT_JSON, method: 8 },
      { name: 'content.xml', data: LEGACY_CONTENT_XML, method: 8 },
      { name: 'metadata.json', data: '{"creator":{"name":"XMind"}}', method: 8 },
      { name: 'attachments/lecture.bin', data: 'a'.repeat(400000), method: 8 },
    ]);

    const wanted = new Set(['content.json', 'content.xml']);
    const archive = await readZip(file, {
      decompressionStream: NodeDecompressionStream,
      include: name => wanted.has(name),
      // Low enough that the attachment would be refused if it were ever unpacked.
      maxTotalBytes: 64 * 1024,
    });

    const result = fromXMind(
      { contentJson: archive.text('content.json'), contentXml: archive.text('content.xml') },
      { ids: idSource('x') }
    );

    expect(archive.names).toContain('attachments/lecture.bin');
    expect(archive.has('attachments/lecture.bin')).toBe(false);
    expect(result.sheetCount).toBe(2);
    expect(result.map.title).toBe('Essay plan');
    expect(outline(result.map)).toEqual(EXPECTED_OUTLINE);
  });
});
