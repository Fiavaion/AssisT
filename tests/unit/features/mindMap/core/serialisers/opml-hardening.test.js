/**
 * OPML read through the shared scanner: the caps, the strictness and the link allowlist that the
 * older suite beside this one never asked of it.
 */

import { fromOPML, toOPML } from '../../../../../../src/features/mindMap/core/serialisers/opml.js';
import { MindMapError } from '../../../../../../src/features/mindMap/core/map-model.js';
import { buildMap, idSource } from '../fixtures.js';
import { describeImportCaps } from './import-caps.js';

const read = (xml, options = {}) => fromOPML(xml, { ids: idSource(), ...options });

const codeOf = run => {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(MindMapError);
    return error.code;
  }
  return null;
};

const parses = xml =>
  new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('parsererror')
    .length === 0;

describe('fromOPML, by the thousand', () => {
  describeImportCaps({
    read,
    flat: count =>
      `<opml><body><outline text="Centre">${'<outline text="n"/>'.repeat(count - 1)}</outline></body></opml>`,
    nested: levels =>
      `<opml><body>${'<outline text="d">'.repeat(levels)}${'</outline>'.repeat(levels)}</body></opml>`,
    unnamed: () => '<opml><body><outline><outline/><outline text="  "/></outline></body></opml>',
  });

  it('names an outline that has no text', () => {
    const map = read(
      '<opml><head><title>T</title></head><body><outline text="C"><outline/></outline></body></opml>'
    );
    expect(map.nodes[map.nodes[map.rootId].children[0]].text).toBe('(untitled)');
  });

  it('counts the root it makes from the title against the cap', () => {
    const several = `<opml><body>${'<outline text="n"/>'.repeat(5000)}</body></opml>`;
    expect(codeOf(() => read(several))).toBe('TOO_MANY_NODES');
  });
});

describe('fromOPML refuses what it cannot safely read', () => {
  it('refuses a DOCTYPE that declares entities', () => {
    const bomb =
      '<!DOCTYPE opml [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;">]>' +
      '<opml><body><outline text="&b;"/></body></opml>';
    expect(codeOf(() => read(bomb))).toBe('UNSAFE_XML');
  });

  it('refuses a file cut short rather than importing the half that arrived', () => {
    expect(codeOf(() => read('<opml><body><outline text="Root"><outline text="One"/>'))).toBe(
      'BAD_XML'
    );
  });

  it('ignores an outline that sits outside the body', () => {
    const map = read(
      '<opml><head><outline text="stray"/></head><body><outline text="Root"/></body></opml>'
    );
    expect(Object.values(map.nodes).map(node => node.text)).toEqual(['Root']);
  });

  it('keeps a node source and the map source only when the link is safe to follow', () => {
    const map = read(
      '<opml><head><title>T</title><sourceUrl>javascript:alert(1)</sourceUrl></head><body>' +
        '<outline text="Root">' +
        '<outline text="ok" _source="https://example.org/a"/>' +
        '<outline text="bad" _source="java&#9;script:alert(1)"/>' +
        '</outline></body></opml>'
    );
    const sourceOf = text => Object.values(map.nodes).find(node => node.text === text).source;
    expect(map.source).toBeNull();
    expect(sourceOf('ok')).toEqual({ url: 'https://example.org/a', quote: '', title: '' });
    expect(sourceOf('bad')).toBeNull();
  });

  it('admits no character a later export could not write', () => {
    const map = read('<opml><body><outline text="a&#0;b&#11;c&#xD800;d"/></body></opml>');
    expect(map.nodes[map.rootId].text).toBe('abcd');
  });
});

describe('toOPML', () => {
  it('writes a document a real XML parser accepts, whatever a student pasted', () => {
    const hostile = 'soft\u000bbreak \u0000\u0001 \ud800 ]]> "q" & <b> \u{1f4a1} \u200f';
    const map = buildMap(
      { text: hostile, notes: `${hostile}\nsecond`, children: [{ text: hostile }] },
      { title: hostile }
    );
    const xml = toOPML(map);
    expect(parses(xml)).toBe(true);
    const back = read(xml);
    expect(back.nodes[back.rootId].text).toBe('softbreak   ]]> "q" & <b> \u{1f4a1} \u200f');
    expect(back.nodes[back.rootId].notes).toBe(
      'softbreak   ]]> "q" & <b> \u{1f4a1} \u200f\nsecond'
    );
  });
});
