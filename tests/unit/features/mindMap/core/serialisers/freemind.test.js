import fs from 'node:fs';
import path from 'node:path';

import {
  fromFreeMind,
  toFreeMind
} from '../../../../../../src/features/mindMap/core/serialisers/freemind.js';
import { MindMapError, validateMap } from '../../../../../../src/features/mindMap/core/map-model.js';
import {
  addLink,
  setDone,
  setSymbol,
  walk
} from '../../../../../../src/features/mindMap/core/map-ops.js';
import { BRANCH_COLOURS } from '../../../../../../src/features/mindMap/core/palette.js';
import { buildMap, idSource, randomMap, sampleMap } from '../fixtures.js';
import { describeImportCaps } from './import-caps.js';

const fixture = name => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

/** Everything the round trip promises to keep, in outline order. */
function shape(map) {
  const rows = [];
  const label = {};
  walk(map, (node, depth) => {
    label[node.id] = node.text;
    rows.push({
      depth,
      text: node.text,
      notes: node.notes,
      colour: node.colour,
      symbol: node.symbol,
      done: node.done,
      collapsed: node.collapsed,
      url: node.source ? node.source.url : null
    });
  });
  return {
    rows,
    links: map.links.map(link => [label[link.from], label[link.to]]).sort()
  };
}

const roundTrip = map => fromFreeMind(toFreeMind(map), { ids: idSource('r') });

const codeOf = run => {
  try {
    run();
  } catch (error) {
    return error.code;
  }
  return null;
};

const messageOf = run => {
  try {
    run();
  } catch (error) {
    return error.message;
  }
  return '';
};

const nodeNamed = (map, text) => Object.values(map.nodes).find(node => node.text === text);

/** A map exercising every field the mapping table in ADR 0003 claims to carry. */
function richMap() {
  let map = buildMap({
    text: 'Dissertation',
    children: [
      {
        text: 'Method & design',
        notes: 'Interviews come first.\nThe survey follows in week four.',
        colour: 3,
        children: [
          { text: 'Ethics approval', collapsed: true },
          { text: 'Consent form', source: { url: 'https://example.ac.uk/c', quote: '', title: '' } }
        ]
      },
      { text: 'Literature', colour: 2, children: [{ text: 'Gaps in the field' }] }
    ]
  });
  const idOf = text => nodeNamed(map, text).id;
  map = setSymbol(map, { id: idOf('Method & design'), symbol: '\u{1f4a1}' });
  map = setSymbol(map, { id: idOf('Literature'), symbol: '\u2753' });
  map = setDone(map, { id: idOf('Ethics approval'), done: true });
  return addLink(map, { from: idOf('Literature'), to: idOf('Method & design') });
}

describe('toFreeMind', () => {
  it('writes a FreeMind 1.0.1 map with one nested node element per node', () => {
    const xml = toFreeMind(sampleMap());
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<map version="1.0.1">');
    expect(xml).toContain('TEXT="Root"');
    expect(xml).toContain('TEXT="Alpha one"');
    expect(xml.match(/<node\b/g)).toHaveLength(6);
    expect(xml.trim().endsWith('</map>')).toBe(true);
  });

  it('gives every node a unique ID attribute', () => {
    const ids = [...toFreeMind(sampleMap()).matchAll(/\bID="([^"]+)"/g)].map(match => match[1]);
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
  });

  it('escapes the five predefined entities in attribute values', () => {
    const xml = toFreeMind(buildMap({ text: 'Fish & <chips> "best"', children: [] }));
    expect(xml).toContain('TEXT="Fish &amp; &lt;chips&gt; &quot;best&quot;"');
    expect(xml).not.toMatch(/TEXT="[^"]*<chips>/);
  });

  it('alternates POSITION right and left on the children of the root only', () => {
    const map = buildMap({
      text: 'Root',
      children: [
        { text: 'One', children: [{ text: 'Deep' }] },
        { text: 'Two' },
        { text: 'Three' }
      ]
    });
    const xml = toFreeMind(map);
    const positionOf = text => {
      const tag = xml.match(new RegExp(`<node[^>]*TEXT="${text}"[^>]*>`))[0];
      return (tag.match(/POSITION="(\w+)"/) || [])[1];
    };
    expect([positionOf('One'), positionOf('Two'), positionOf('Three')]).toEqual([
      'right',
      'left',
      'right'
    ]);
    expect(positionOf('Deep')).toBeUndefined();
  });

  it('writes FOLDED only for a collapsed node', () => {
    const map = buildMap({
      text: 'Root',
      children: [{ text: 'Shut', collapsed: true }, { text: 'Open' }]
    });
    const xml = toFreeMind(map);
    expect(xml).toMatch(/<node[^>]*TEXT="Shut"[^>]*FOLDED="true"/);
    expect(xml).not.toMatch(/<node[^>]*TEXT="Open"[^>]*FOLDED=/);
  });

  it('writes the palette fill and ink for a coloured node and nothing for an inheriting one', () => {
    const map = buildMap({
      text: 'Root',
      children: [{ text: 'Green', colour: 3 }, { text: 'Same' }]
    });
    const xml = toFreeMind(map);
    expect(xml).toMatch(
      new RegExp(`TEXT="Green"[^>]*BACKGROUND_COLOR="${BRANCH_COLOURS[3].fill}"[^>]*COLOR="#ffffff"`)
    );
    expect(xml).not.toMatch(/<node[^>]*TEXT="Same"[^>]*COLOR=/);
  });

  it('writes notes as a NOTE richcontent with one escaped paragraph per line', () => {
    const map = buildMap({
      text: 'Root',
      children: [{ text: 'Child', notes: 'first & best\nsecond' }]
    });
    const xml = toFreeMind(map);
    expect(xml).toContain('<richcontent TYPE="NOTE">');
    expect(xml).toContain('<p>first &amp; best</p>');
    expect(xml).toContain('<p>second</p>');
  });

  it('writes a captured quote and source title into the note, because .mm has nowhere else', () => {
    const map = buildMap({
      text: 'Root',
      children: [
        {
          text: 'Quoted',
          notes: 'my gloss',
          source: { url: 'https://example.org/a', quote: 'the words', title: 'The paper' }
        }
      ]
    });
    const xml = toFreeMind(map);
    expect(xml).toContain('<p>my gloss</p>');
    expect(xml).toContain('<p>\u201cthe words\u201d</p>');
    expect(xml).toContain('<p>Source: The paper</p>');
  });

  it('writes an icon for done and for a mappable symbol, and drops one with no equivalent', () => {
    let map = buildMap({ text: 'Root', children: [{ text: 'A' }, { text: 'B' }, { text: 'C' }] });
    const idOf = text => nodeNamed(map, text).id;
    map = setDone(map, { id: idOf('A'), done: true });
    map = setSymbol(map, { id: idOf('B'), symbol: '\u{1f4a1}' });
    map = setSymbol(map, { id: idOf('C'), symbol: '\u{1f389}' });
    const xml = toFreeMind(map);
    expect(xml).toContain('<icon BUILTIN="button_ok"/>');
    expect(xml).toContain('<icon BUILTIN="idea"/>');
    expect(xml.match(/<icon\b/g)).toHaveLength(2);
  });

  it('writes LINK only for an http, https or mailto source', () => {
    const urls = ['https://example.org/a', 'mailto:tutor@example.ac.uk', 'file:///C:/secret.txt'];
    const map = buildMap({
      text: 'Root',
      children: urls.map((url, at) => ({ text: `n${at}`, source: { url, quote: '', title: '' } }))
    });
    const xml = toFreeMind(map);
    expect(xml).toContain('LINK="https://example.org/a"');
    expect(xml).toContain('LINK="mailto:tutor@example.ac.uk"');
    expect(xml).not.toContain('secret.txt');
  });

  it('writes an arrowlink on the source node of each cross-link', () => {
    const xml = toFreeMind(richMap());
    const destination = xml.match(/<arrowlink DESTINATION="([^"]+)"/);
    expect(destination).not.toBeNull();
    expect(xml).toContain(`ID="${destination[1]}"`);
    expect(xml.match(/<arrowlink\b/g)).toHaveLength(1);
  });
});

describe('fromFreeMind', () => {
  it('reads a minimal file into a valid map', () => {
    const map = fromFreeMind(
      '<map version="1.0.1"><node TEXT="Root"><node TEXT="One"/></node></map>',
      { ids: idSource() }
    );
    expect(map.title).toBe('Root');
    expect(map.nodes[map.rootId].text).toBe('Root');
    expect(map.nodes[map.rootId].children).toHaveLength(1);
    expect(validateMap(map)).toEqual([]);
  });

  it('reads NODE richcontent as the label, and NOTE then DETAILS richcontent as notes', () => {
    const map = fromFreeMind(fixture('freeplane-1.9.mm'), { ids: idSource() });
    const method = nodeNamed(map, 'Method & design');
    expect(method).toBeDefined();
    expect(method.notes).toBe(
      'Interviews come first.\nThe survey follows in week four.\n\nTwelve participants, two rounds.'
    );
  });

  it('keeps Freeplane details when a node has no note, and the note first whatever the file order', () => {
    const details =
      '<richcontent TYPE="DETAILS"><html><body><p>the detail</p></body></html></richcontent>';
    const note = '<richcontent TYPE="NOTE"><html><body><p>the note</p></body></html></richcontent>';
    const map = fromFreeMind(
      `<map><node TEXT="R"><node TEXT="only">${details}</node>` +
        `<node TEXT="both">${details}${note}</node></node></map>`,
      { ids: idSource() }
    );
    expect(nodeNamed(map, 'only').notes).toBe('the detail');
    expect(nodeNamed(map, 'both').notes).toBe('the note\n\nthe detail');
  });

  it('gives an un-renamed Freeplane centre a readable name instead of an empty one', () => {
    const map = fromFreeMind(
      '<map version="freeplane 1.9.13"><node LOCALIZED_TEXT="new_mindmap" ID="a">' +
        '<node TEXT="One"/></node></map>',
      { title: 'week 4', ids: idSource() }
    );
    expect(map.nodes[map.rootId].text).toBe('week 4');
    expect(map.title).toBe('week 4');
  });

  it('prefers the text a centre does have over its LOCALIZED_TEXT key', () => {
    const map = fromFreeMind(
      '<map><node LOCALIZED_TEXT="new_mindmap" TEXT="Photosynthesis"/></map>',
      { title: 'week 4', ids: idSource() }
    );
    expect(map.nodes[map.rootId].text).toBe('Photosynthesis');
  });

  describe('what sits inside a hook or any other container is not the node’s own', () => {
    const styled = inner =>
      '<map><node TEXT="R" ID="a"><hook NAME="MapStyle"><map_styles>' +
      `<stylenode LOCALIZED_TEXT="styles.important">${inner}</stylenode>` +
      '</map_styles></hook><node TEXT="One" ID="b"/></node></map>';

    it('ignores a style’s icon, so the centre gains no symbol', () => {
      const map = fromFreeMind(styled('<icon BUILTIN="yes"/>'), { ids: idSource() });
      expect(map.nodes[map.rootId].symbol).toBeNull();
    });

    it('ignores a style’s button_ok, so the centre is not ticked off', () => {
      const map = fromFreeMind(styled('<icon BUILTIN="button_ok"/>'), { ids: idSource() });
      expect(map.nodes[map.rootId].done).toBe(false);
    });

    it('ignores a style’s arrowlink, so no cross-link appears from nowhere', () => {
      const map = fromFreeMind(styled('<arrowlink DESTINATION="b"/>'), { ids: idSource() });
      expect(map.links).toEqual([]);
    });

    it('ignores a style’s richcontent, so the centre keeps its own text and notes', () => {
      const rich = type =>
        `<richcontent TYPE="${type}"><html><body><p>from the style</p></body></html></richcontent>`;
      const map = fromFreeMind(styled(rich('NODE') + rich('NOTE') + rich('DETAILS')), {
        ids: idSource()
      });
      expect(map.nodes[map.rootId]).toMatchObject({ text: 'R', notes: '' });
    });

    it('ignores a node element inside a container it does not know', () => {
      const map = fromFreeMind(
        '<map><node TEXT="R"><future_thing><node TEXT="ghost"><icon BUILTIN="yes"/></node>' +
          '<icon BUILTIN="help"/></future_thing><node TEXT="One"/></node></map>',
        { ids: idSource() }
      );
      expect(Object.values(map.nodes).map(node => node.text)).toEqual(['R', 'One']);
      expect(map.nodes[map.rootId].symbol).toBeNull();
    });

    it('still reads what is a direct child of the node, after the container closes', () => {
      const map = fromFreeMind(
        '<map><node TEXT="R" ID="a"><hook NAME="MapStyle"><map_styles><stylenode>' +
          '<icon BUILTIN="yes"/></stylenode></map_styles></hook><icon BUILTIN="help"/>' +
          '<node TEXT="One" ID="b"><arrowlink DESTINATION="a"/></node></node></map>',
        { ids: idSource() }
      );
      expect(map.nodes[map.rootId].symbol).toBe('❓');
      expect(map.links).toHaveLength(1);
    });

    it('reads the structurally faithful Freeplane file without taking anything from its styles', () => {
      const map = fromFreeMind(fixture('freeplane-1.9.mm'), { ids: idSource() });
      expect(nodeNamed(map, 'Dissertation')).toMatchObject({ symbol: null, done: false, notes: '' });
      expect(Object.keys(map.nodes)).toHaveLength(6);
      expect(map.links).toHaveLength(1);
    });
  });

  it('keeps the paragraph breaks of a note and drops the indentation around them', () => {
    const map = fromFreeMind(
      '<map><node TEXT="R"><richcontent TYPE="NOTE"><html><head/><body>\n' +
        '  <p>one</p>\n  <p></p>\n  <p>two</p>\n</body></html></richcontent></node></map>',
      { ids: idSource() }
    );
    expect(map.nodes[map.rootId].notes).toBe('one\n\ntwo');
  });

  it('accepts a LINK only when it is http, https or mailto', () => {
    const map = fromFreeMind(
      '<map><node TEXT="R">' +
        '<node TEXT="ok" LINK="https://example.org/a"/>' +
        '<node TEXT="mail" LINK="mailto:a@b.ac.uk"/>' +
        '<node TEXT="js" LINK="javascript:alert(1)"/>' +
        '<node TEXT="spaced" LINK=" java&#9;script:alert(1)"/>' +
        '<node TEXT="rel" LINK="other.mm"/>' +
        '</node></map>',
      { ids: idSource() }
    );
    const urlOf = text => (nodeNamed(map, text).source || {}).url || null;
    expect(urlOf('ok')).toBe('https://example.org/a');
    expect(urlOf('mail')).toBe('mailto:a@b.ac.uk');
    expect(urlOf('js')).toBeNull();
    expect(urlOf('spaced')).toBeNull();
    expect(urlOf('rel')).toBeNull();
  });

  it('reads FOLDED as collapsed', () => {
    const map = fromFreeMind(
      '<map><node TEXT="R"><node TEXT="shut" FOLDED="true"/><node TEXT="open" FOLDED="false"/></node></map>',
      { ids: idSource() }
    );
    expect(nodeNamed(map, 'shut').collapsed).toBe(true);
    expect(nodeNamed(map, 'open').collapsed).toBe(false);
  });

  it('snaps a foreign colour to the nearest palette entry and inherits a neutral one', () => {
    const map = fromFreeMind(
      '<map><node TEXT="R">' +
        `<node TEXT="exact" BACKGROUND_COLOR="${BRANCH_COLOURS[4].fill}"/>` +
        '<node TEXT="near" COLOR="#0a66cc"/>' +
        '<node TEXT="grey" COLOR="#9a9a9a"/>' +
        '<node TEXT="black" COLOR="#000000"/>' +
        '<node TEXT="none"/>' +
        '</node></map>',
      { ids: idSource() }
    );
    expect(nodeNamed(map, 'exact').colour).toBe(4);
    expect(nodeNamed(map, 'near').colour).toBe(0);
    expect(nodeNamed(map, 'grey').colour).toBeNull();
    expect(nodeNamed(map, 'black').colour).toBeNull();
    expect(nodeNamed(map, 'none').colour).toBeNull();
  });

  it('prefers BACKGROUND_COLOR over COLOR when a node carries both', () => {
    const map = fromFreeMind(
      `<map><node TEXT="R" BACKGROUND_COLOR="${BRANCH_COLOURS[5].fill}" COLOR="#ffffff"/></map>`,
      { ids: idSource() }
    );
    expect(map.nodes[map.rootId].colour).toBe(5);
  });

  it('maps button_ok to done, known icons to symbols, and ignores the rest', () => {
    const map = fromFreeMind(
      '<map><node TEXT="R">' +
        '<node TEXT="done"><icon BUILTIN="button_ok"/></node>' +
        '<node TEXT="idea"><icon BUILTIN="idea"/></node>' +
        '<node TEXT="both"><icon BUILTIN="button_ok"/><icon BUILTIN="help"/></node>' +
        '<node TEXT="odd"><icon BUILTIN="penguin"/></node>' +
        '</node></map>',
      { ids: idSource() }
    );
    expect(nodeNamed(map, 'done')).toMatchObject({ done: true, symbol: null });
    expect(nodeNamed(map, 'idea').symbol).toBe('\u{1f4a1}');
    expect(nodeNamed(map, 'both')).toMatchObject({ done: true, symbol: '\u2753' });
    expect(nodeNamed(map, 'odd')).toMatchObject({ done: false, symbol: null });
  });

  it('turns an arrowlink into a cross-link and drops one pointing outside the file', () => {
    const map = fromFreeMind(
      '<map><node TEXT="R" ID="a">' +
        '<node TEXT="from" ID="b"><arrowlink DESTINATION="a"/><arrowlink DESTINATION="ghost"/></node>' +
        '</node></map>',
      { ids: idSource() }
    );
    expect(map.links).toHaveLength(1);
    expect(map.links[0]).toMatchObject({
      from: nodeNamed(map, 'from').id,
      to: nodeNamed(map, 'R').id
    });
    expect(validateMap(map)).toEqual([]);
  });

  it('ignores an arrowlink a node points at itself', () => {
    const map = fromFreeMind(
      '<map><node TEXT="R" ID="a"><arrowlink DESTINATION="a"/></node></map>',
      { ids: idSource() }
    );
    expect(map.links).toEqual([]);
  });

  it('ignores hooks, fonts, clouds, edges and node attributes', () => {
    const map = fromFreeMind(fixture('freeplane-1.9.mm'), { ids: idSource() });
    const texts = Object.values(map.nodes).map(node => node.text);
    expect(texts.some(text => text.includes('Dr Quinn'))).toBe(false);
    expect(texts.some(text => text.includes('MapStyle'))).toBe(false);
  });

  it('takes the title from the root text and falls back when the root has none', () => {
    const named = fromFreeMind('<map><node TEXT="Photosynthesis"/></map>', { ids: idSource() });
    expect(named.title).toBe('Photosynthesis');
    const blank = fromFreeMind('<map><node TEXT="  "/></map>', {
      title: 'week 4',
      ids: idSource()
    });
    expect(blank.title).toBe('week 4');
  });

  it('attaches a second top-level node to the root rather than losing it', () => {
    const map = fromFreeMind('<map><node TEXT="One"/><node TEXT="Two"/></map>', {
      ids: idSource()
    });
    expect(map.nodes[map.rootId].text).toBe('One');
    expect(map.nodes[map.rootId].children).toHaveLength(1);
    expect(nodeNamed(map, 'Two').parentId).toBe(map.rootId);
    expect(validateMap(map)).toEqual([]);
  });

  it('decodes the five predefined entities and numeric character references', () => {
    const map = fromFreeMind(
      '<map><node TEXT="Fish &amp; &lt;chips&gt; &quot;best&quot; &apos;n &#65;&#x42; &#10; end"/></map>',
      { ids: idSource() }
    );
    expect(map.nodes[map.rootId].text).toBe('Fish & <chips> "best" \'n AB \n end');
  });

  it('reads CDATA as text', () => {
    const map = fromFreeMind(
      '<map><node TEXT="R"><richcontent TYPE="NOTE"><html><body><p><![CDATA[a & b < c]]></p></body></html></richcontent></node></map>',
      { ids: idSource() }
    );
    expect(map.nodes[map.rootId].notes).toBe('a & b < c');
  });

  it('takes its ids and its map id from the supplied source', () => {
    const map = fromFreeMind('<map><node TEXT="R"><node TEXT="One"/></node></map>', {
      ids: idSource('k')
    });
    expect(map.id.startsWith('k')).toBe(true);
    expect(Object.keys(map.nodes).every(id => id.startsWith('k'))).toBe(true);
  });
});

describe('fromFreeMind fixtures from the tools students arrive with', () => {
  it('reads a Freeplane 1.9 file whole', () => {
    const map = fromFreeMind(fixture('freeplane-1.9.mm'), { ids: idSource() });
    expect(validateMap(map)).toEqual([]);
    expect(shape(map).rows.map(row => [row.depth, row.text])).toEqual([
      [0, 'Dissertation'],
      [1, 'Method & design'],
      [2, 'Ethics approval'],
      [3, 'Consent form'],
      [1, 'Literature'],
      [2, 'Gaps in the field']
    ]);
    expect(nodeNamed(map, 'Dissertation').colour).toBe(0);
    expect(nodeNamed(map, 'Method & design')).toMatchObject({ colour: 3, symbol: '\u{1f4a1}' });
    expect(nodeNamed(map, 'Ethics approval')).toMatchObject({ done: true, collapsed: true });
    expect(nodeNamed(map, 'Consent form').source.url).toBe('https://example.ac.uk/ethics/consent');
    expect(nodeNamed(map, 'Literature')).toMatchObject({ colour: 2, symbol: '\u2753' });
    expect(map.links).toHaveLength(1);
  });

  it('reads a Coggle export, snapping its branch colours', () => {
    const map = fromFreeMind(fixture('coggle-export.mm'), { ids: idSource() });
    expect(validateMap(map)).toEqual([]);
    expect(map.title).toBe('Revision plan');
    expect(nodeNamed(map, 'Week one').colour).toBe(0);
    expect(nodeNamed(map, 'Week two').colour).toBeNull();
    expect(nodeNamed(map, 'Summarise the argument').source.url).toBe('https://example.org/notes');
  });

  it('reads a FreeMind 0.9 file, arrowlink and all', () => {
    const map = fromFreeMind(fixture('freemind-0.9.mm'), { ids: idSource() });
    expect(validateMap(map)).toEqual([]);
    expect(nodeNamed(map, 'Light reactions').done).toBe(true);
    expect(nodeNamed(map, 'Calvin cycle').collapsed).toBe(true);
    expect(nodeNamed(map, 'Ask about NADPH & ATP').symbol).toBe('\u2753');
    expect(map.links).toEqual([
      expect.objectContaining({
        from: nodeNamed(map, 'Calvin cycle').id,
        to: nodeNamed(map, 'Light reactions').id
      })
    ]);
  });
});

describe('fromFreeMind refuses what it cannot safely read', () => {
  it('rejects a DOCTYPE with an internal subset, and does so at once', () => {
    const bomb = fixture('billion-laughs.mm');
    const started = process.hrtime.bigint();
    expect(codeOf(() => fromFreeMind(bomb, { ids: idSource() }))).toBe('UNSAFE_XML');
    expect(Number(process.hrtime.bigint() - started) / 1e6).toBeLessThan(200);
    expect(messageOf(() => fromFreeMind(bomb, { ids: idSource() }))).toMatch(/entit/i);
  });

  describeImportCaps({
    read: (xml, options = {}) => fromFreeMind(xml, { ids: idSource(), ...options }),
    flat: count => `<map><node TEXT="R">${'<node TEXT="n"/>'.repeat(count - 1)}</node></map>`,
    nested: levels => `<map>${'<node TEXT="d">'.repeat(levels)}${'</node>'.repeat(levels)}</map>`,
    unnamed: () =>
      '<map><node><node/><node LOCALIZED_TEXT="new_node"/><node TEXT="  "/>' +
      '<node><richcontent TYPE="NODE"><html><body><p> </p></body></html></richcontent></node>' +
      '</node></map>'
  });

  it('names an unnamed node: the Freeplane key in words, anything else with the placeholder', () => {
    const map = fromFreeMind(
      '<map><node TEXT="Centre"><node/><node LOCALIZED_TEXT="new_node"/>' +
        '<node LOCALIZED_TEXT="constructor"/><node LOCALIZED_TEXT="new_node" TEXT="Mine"/></node></map>',
      { ids: idSource() }
    );
    expect(map.nodes.n1.children.map(id => map.nodes[id].text)).toEqual([
      '(untitled)',
      'New node',
      '(untitled)',
      'Mine'
    ]);
  });

  it('gives a centre with no name at all the name of the file', () => {
    const map = fromFreeMind('<map><node/></map>', { ids: idSource(), title: 'Lecture 4' });
    expect(map.nodes[map.rootId].text).toBe('Lecture 4');
    expect(map.title).toBe('Lecture 4');
  });

  it('counts the depth of a second root from where it lands, not from where it was written', () => {
    const chain = levels => `${'<node TEXT="d">'.repeat(levels)}${'</node>'.repeat(levels)}`;
    // Two chains of a hundred: the second hangs under the first root, which makes it 101 deep.
    expect(codeOf(() => fromFreeMind(`<map>${chain(100)}${chain(100)}</map>`, { ids: idSource() }))).toBe(
      'TOO_DEEP'
    );
    const map = fromFreeMind(`<map>${chain(100)}${chain(99)}</map>`, { ids: idSource() });
    expect(Object.keys(map.nodes)).toHaveLength(199);
    let deepest = 0;
    walk(map, (_node, depth) => {
      deepest = Math.max(deepest, depth);
    });
    expect(deepest).toBe(99);
    expect(map.nodes[map.rootId].children).toHaveLength(2);
  });

  it('stops reading a hundred thousand node file at the cap', () => {
    const xml = `<map><node TEXT="R">${'<node TEXT="n"/>'.repeat(100000)}</node></map>`;
    let made = 0;
    const counting = () => `n${++made}`;
    expect(codeOf(() => fromFreeMind(xml, { ids: counting }))).toBe('TOO_MANY_NODES');
    expect(made).toBeLessThanOrEqual(5001);
  });

  it('rejects a file that is not XML, and an empty one', () => {
    expect(codeOf(() => fromFreeMind('just some notes I typed', { ids: idSource() }))).toBe(
      'BAD_FREEMIND'
    );
    expect(codeOf(() => fromFreeMind('', { ids: idSource() }))).toBe('BAD_FREEMIND');
    expect(() => fromFreeMind('', { ids: idSource() })).toThrow(MindMapError);
  });

  it('rejects a map element holding no node', () => {
    expect(codeOf(() => fromFreeMind('<map version="1.0.1"></map>', { ids: idSource() }))).toBe(
      'BAD_FREEMIND'
    );
  });

  it('rejects a truncated file rather than half-reading it', () => {
    expect(codeOf(() => fromFreeMind('<map><node TEXT="R">', { ids: idSource() }))).toBe(
      'BAD_XML'
    );
    expect(
      codeOf(() => fromFreeMind('<map><node TEXT="R"></nope></map>', { ids: idSource() }))
    ).toBe('BAD_XML');
  });

  it('admits no character XML forbids, however the file spelled it', () => {
    const map = fromFreeMind(
      '<map><node TEXT="a&#0;b&#1;c&#11;d&#xD800;e\u000bf">' +
        '<richcontent TYPE="NOTE"><html><body><p>n&#12;o<![CDATA[t\u0001e]]></p></body></html>' +
        '</richcontent></node></map>',
      { ids: idSource() }
    );
    expect(map.nodes[map.rootId]).toMatchObject({ text: 'abcdef', notes: 'note' });
  });

  it('leaves markup inside TEXT as inert text', () => {
    const map = fromFreeMind(
      '<map><node TEXT="&lt;img src=x onerror=alert(1)&gt;&lt;b&gt;hi&lt;/b&gt;"/></map>',
      { ids: idSource() }
    );
    expect(map.nodes[map.rootId].text).toBe('<img src=x onerror=alert(1)><b>hi</b>');
  });

  it('drops script and style content inside a richcontent body', () => {
    const map = fromFreeMind(
      '<map><node TEXT="R"><richcontent TYPE="NOTE"><html><body>' +
        '<script>alert(1)</script><style>p{color:red}</style><p>real <b>note</b></p>' +
        '</body></html></richcontent></node></map>',
      { ids: idSource() }
    );
    expect(map.nodes[map.rootId].notes).toBe('real note');
  });
});

describe('freemind round trip', () => {
  it('keeps text, notes, order, colour, symbol, done, collapsed and cross-links', () => {
    const map = richMap();
    expect(shape(roundTrip(map))).toEqual(shape(map));
  });

  it('keeps generated maps', () => {
    for (const seed of [51, 52, 53, 54]) {
      const map = randomMap(seed, { nodes: 18 });
      expect(shape(roundTrip(map))).toEqual(shape(map));
    }
  });

  it('survives a second pass unchanged', () => {
    const map = richMap();
    const once = toFreeMind(roundTrip(map));
    expect(toFreeMind(roundTrip(fromFreeMind(once, { ids: idSource('s') })))).toBe(once);
  });

  it('brings the captured quote back as note text, which is the documented loss', () => {
    const map = buildMap({
      text: 'Root',
      children: [
        {
          text: 'Quoted',
          notes: 'my gloss',
          source: { url: 'https://example.org/a', quote: 'the words', title: 'The paper' }
        }
      ]
    });
    const quoted = nodeNamed(roundTrip(map), 'Quoted');
    expect(quoted.notes).toBe('my gloss\n\u201cthe words\u201d\nSource: The paper');
    expect(quoted.source).toEqual({ url: 'https://example.org/a', quote: '', title: '' });
  });
});

describe('fromFreeMind reads a link to another node as a cross-link', () => {
  const read = xml => fromFreeMind(xml, { ids: idSource() });
  const FILE =
    '<map><node ID="ID_1" TEXT="Centre">' +
    '<node ID="ID_2" TEXT="Cause" LINK="#ID_3"/>' +
    '<node ID="ID_3" TEXT="Effect"/>' +
    '<node ID="ID_4" TEXT="Gone" LINK="#ID_404"/>' +
    '<node ID="ID_5" TEXT="Self" LINK="#ID_5"/>' +
    '<node ID="ID_6" TEXT="File" LINK="other.mm"/>' +
    '<node ID="ID_7" TEXT="Anchor" LINK="other.mm#ID_3"/>' +
    '<node ID="ID_8" TEXT="Forward" LINK="#ID_9"><node ID="ID_9" TEXT="Later"/></node>' +
    '</node></map>';

  it('links the two nodes when the target is in the file, whichever comes first', () => {
    const map = read(FILE);
    const named = text => Object.values(map.nodes).find(node => node.text === text).id;
    expect(map.links.map(link => [link.from, link.to])).toEqual([
      [named('Cause'), named('Effect')],
      [named('Forward'), named('Later')],
    ]);
    expect(validateMap(map)).toEqual([]);
  });

  it('keeps none of them as a web link, and drops a target that is missing, itself, or a file', () => {
    const map = read(FILE);
    expect(Object.values(map.nodes).filter(node => node.source !== null)).toEqual([]);
    expect(map.links).toHaveLength(2);
  });

  it('does not double a link the file also draws as an arrow', () => {
    const map = read(
      '<map><node ID="a" TEXT="C"><node ID="b" TEXT="One" LINK="#c">' +
        '<arrowlink DESTINATION="c"/></node><node ID="c" TEXT="Two"/></node></map>'
    );
    expect(map.links).toHaveLength(1);
  });

  it('is still written as an arrowlink, never as a LINK', () => {
    const xml = toFreeMind(read(FILE));
    expect(xml).not.toMatch(/LINK="#/);
    expect(xml.match(/<arrowlink /g)).toHaveLength(2);
  });
});
