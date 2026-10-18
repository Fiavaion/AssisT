/**
 * What the scanner refuses for its size, what it looks up by a name taken from the file, and the
 * HTML entities it decodes inside XHTML and nowhere else.
 */

import { scanXml } from '../../../../../../src/features/mindMap/core/serialisers/xml-scan.js';
import { fromFreeMind } from '../../../../../../src/features/mindMap/core/serialisers/freemind.js';
import { fromOPML } from '../../../../../../src/features/mindMap/core/serialisers/opml.js';
import { fromXMind } from '../../../../../../src/features/mindMap/core/serialisers/xmind.js';
import { MindMapError } from '../../../../../../src/features/mindMap/core/map-model.js';
import { idSource } from '../fixtures.js';

const events = (xml, extra = {}) => {
  const seen = [];
  scanXml(xml, {
    open: (name, attributes) => seen.push(['open', name, attributes]),
    close: name => seen.push(['close', name]),
    text: value => seen.push(['text', value]),
    ...extra,
  });
  return seen;
};

const textOf = (xml, extra) =>
  events(xml, extra)
    .filter(event => event[0] === 'text')
    .map(event => event[1])
    .join('');

const refusal = run => {
  const started = performance.now();
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(MindMapError);
    expect(error.message).toMatch(/^[A-Z].*\.$/s);
    return { code: error.code, message: error.message, ms: performance.now() - started };
  }
  return { code: null, message: '', ms: performance.now() - started };
};

const INHERITED = Object.getOwnPropertyNames(Object.prototype);

describe('names taken from the file', () => {
  it('hands over attributes that inherit nothing', () => {
    const [[, , attributes]] = events('<node/>');
    expect(Object.getPrototypeOf(attributes)).toBeNull();
    for (const name of INHERITED) {
      expect([name, attributes[name]]).toEqual([name, undefined]);
    }
  });

  it('keeps an attribute called constructor, __proto__ or toString as the value it was given', () => {
    const [[, , attributes]] = events(
      '<node constructor="a" __proto__="b" toString="c" TEXT="d"/>'
    );
    expect(Object.entries(attributes)).toEqual([
      ['constructor', 'a'],
      ['__proto__', 'b'],
      ['tostring', 'c'],
      ['text', 'd'],
    ]);
    expect({}.b).toBeUndefined();
  });

  it('imports a node carrying those attributes as an ordinary node', () => {
    const map = fromFreeMind(
      '<map><node TEXT="Centre" constructor="x" __proto__="y" toString="z" hasOwnProperty="w">' +
        '<node TEXT="Child" __proto__="polluted"/></node></map>',
      { ids: idSource() }
    );
    expect(Object.values(map.nodes).map(node => node.text)).toEqual(['Centre', 'Child']);
    expect(() => structuredClone(map)).not.toThrow();
  });

  it.each(INHERITED)('leaves &%s; as the letters it was written with', name => {
    const written = `&${name};`;
    // `__proto__` and its like are not XML names, so they never reach the table; the rest do.
    const [[, , attributes], [, text]] = events(`<a t="${written}">${written}</a>`);
    expect(attributes.t).toBe(written);
    expect(text).toBe(written);
    expect(textOf(`<a>${written}</a>`, { xhtml: () => true })).toBe(written);
  });

  it('and so a label spelling one out arrives as typed', () => {
    const map = fromFreeMind(
      '<map><node TEXT="&constructor; &toString; &__proto__;"><richcontent TYPE="NOTE"><html><body>' +
        '<p>&constructor; &valueOf;</p></body></html></richcontent></node></map>',
      { ids: idSource() }
    );
    expect(map.nodes.n1.text).toBe('&constructor; &toString; &__proto__;');
    expect(map.nodes.n1.notes).toBe('&constructor; &valueOf;');
  });
});

describe('HTML entities, inside XHTML only', () => {
  const NAMES =
    'nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn ' +
    'sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave ' +
    'Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ' +
    'ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN ' +
    'szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute ' +
    'icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml ' +
    'yacute thorn yuml ndash mdash lsquo rsquo sbquo ldquo rdquo bdquo dagger Dagger bull hellip ' +
    'permil prime Prime lsaquo rsaquo euro trade larr uarr rarr darr harr minus le ge ne asymp infin ' +
    'OElig oelig Scaron scaron Yuml fnof circ tilde ensp emsp thinsp zwnj zwj lrm rlm ' +
    'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigmaf ' +
    'sigma tau upsilon phi chi psi omega Alpha Beta Gamma Delta Epsilon Zeta Eta Theta Iota Kappa ' +
    'Lambda Mu Nu Xi Omicron Pi Rho Sigma Tau Upsilon Phi Chi Psi Omega';

  /** What a real HTML parser makes of the entity, which is the only authority on the table. */
  const browserSays = name => {
    const element = document.createElement('p');
    element.innerHTML = `&${name};`;
    return element.textContent;
  };

  it.each(NAMES.split(' '))('decodes &%s; as a browser does', name => {
    const expected = browserSays(name);
    expect(expected).not.toBe(`&${name};`);
    expect(textOf(`<p>&${name};</p>`, { xhtml: () => true })).toBe(expected);
  });

  it('decodes none of them outside XHTML, in text or in an attribute', () => {
    expect(textOf('<p>Caf&eacute; &ndash; &sigma;</p>')).toBe('Caf&eacute; &ndash; &sigma;');
    expect(textOf('<p>Caf&eacute;</p>', { xhtml: () => false })).toBe('Caf&eacute;');
    const [[, , attributes]] = events('<p t="Caf&eacute;"/>', { xhtml: () => true });
    expect(attributes.t).toBe('Caf&eacute;');
  });

  it('leaves a name HTML does not define, and one differing only in case, as written', () => {
    expect(textOf('<p>&lol9; &EACUTE; &Nbsp; &eacute</p>', { xhtml: () => true })).toBe(
      '&lol9; &EACUTE; &Nbsp; &eacute'
    );
  });

  it('decodes once: an escaped ampersand before a name is not a second entity', () => {
    expect(textOf('<p>&amp;eacute; &#38;ndash;</p>', { xhtml: () => true })).toBe(
      '&eacute; &ndash;'
    );
  });

  it('reads a Freeplane rich-text label and note that use them', () => {
    const map = fromFreeMind(
      '<map><node ID="a" TEXT="Caf&eacute; stays"><node ID="b">' +
        '<richcontent TYPE="NODE"><html><body><p>Caf&eacute; &ndash; cr&egrave;me</p></body></html></richcontent>' +
        '<richcontent TYPE="NOTE"><html><body><p>&ldquo;Na&iuml;ve&rdquo; &hellip; 5&euro; &amp;eacute;</p></body></html></richcontent>' +
        '</node></node></map>',
      { ids: idSource() }
    );
    expect(map.nodes.n1.text).toBe('Caf&eacute; stays');
    expect(map.nodes.n2.text).toBe('Café \u2013 cr\u00e8me');
    expect(map.nodes.n2.notes).toBe('\u201cNa\u00efve\u201d \u2026 5\u20ac &eacute;');
  });
});

describe('what the scanner refuses for its size', () => {
  it('reads an element with 256 attributes and refuses one with 257', () => {
    const element = count =>
      `<a ${Array.from({ length: count }, (_unused, at) => `k${at}="v"`).join(' ')}/>`;
    expect(Object.keys(events(element(256))[0][2])).toHaveLength(256);
    const refused = refusal(() => events(element(257)));
    expect(refused.code).toBe('UNSAFE_XML');
    expect(refused.message).toBe(
      'The tag <a> carries more than 256 attributes, which no mind map file does, so this file has not been read.'
    );
  });

  it('counts a repeated attribute each time it is written', () => {
    expect(refusal(() => events(`<a ${'k="v" '.repeat(257)}/>`)).code).toBe('UNSAFE_XML');
  });

  it('refuses a million attributes on one element at the 257th', () => {
    const xml = `<map><node ${Array.from({ length: 1e6 }, (_unused, at) => `a${at}="v"`).join(' ')} TEXT="x"/></map>`;
    const refused = refusal(() => fromFreeMind(xml, { ids: idSource() }));
    expect(refused.code).toBe('UNSAFE_XML');
    expect(refused.ms).toBeLessThan(1000);
  });

  it('reads 200,000 entity references and refuses one more', () => {
    const value = count => `<a t="${'&amp;'.repeat(count / 2)}">${'&#65;'.repeat(count / 2)}</a>`;
    expect(textOf(value(200000))).toHaveLength(100000);
    const refused = refusal(() => events(`${value(200000).slice(0, -4)}&lt;</a>`));
    expect(refused.code).toBe('UNSAFE_XML');
    expect(refused.message).toBe(
      'This file holds more than 200,000 XML entity references, which no mind map file does, so it has not been read.'
    );
  });

  it('refuses two million references in one value without decoding them all', () => {
    const xml = `<map><node TEXT="${'&amp;'.repeat(2e6)}"/></map>`;
    const refused = refusal(() => fromFreeMind(xml, { ids: idSource() }));
    expect(refused.code).toBe('UNSAFE_XML');
    expect(refused.ms).toBeLessThan(1000);
  });

  it('counts every ampersand, since a name it does not define or none at all costs as much to look at', () => {
    expect(textOf(`<a>${'& '.repeat(200000)}</a>`)).toHaveLength(400000);
    expect(refusal(() => events(`<a>${'& '.repeat(200001)}</a>`)).code).toBe('UNSAFE_XML');
    expect(refusal(() => events(`<a>${'&nope;'.repeat(200001)}</a>`)).code).toBe('UNSAFE_XML');
  });

  describe('a document past 20 MB', () => {
    const SENTENCE =
      'This file is larger than 20 MB, which is more than a mind map file holds, so it has not been read.';
    const padding = ' '.repeat(20 * 1024 * 1024);

    it('is refused before it is scanned', () => {
      let opened = 0;
      const refused = refusal(() =>
        scanXml(`<a/>${padding}`, { open: () => (opened += 1), close: () => {}, text: () => {} })
      );
      expect([refused.code, refused.message, opened]).toEqual(['TOO_LARGE', SENTENCE, 0]);
    });

    it('is read when it is exactly 20 MB', () => {
      expect(events(`<a/>${padding.slice(4)}`)[0][1]).toBe('a');
    });

    it('is refused in the same words by every XML importer', () => {
      const mm = `<map><node TEXT="x"/></map>${padding}`;
      const opml = `<opml><body><outline text="x"/></body></opml>${padding}`;
      const xmind = `<xmap-content><sheet><topic><title>x</title></topic></sheet></xmap-content>${padding}`;
      expect(refusal(() => fromFreeMind(mm)).message).toBe(SENTENCE);
      expect(refusal(() => fromOPML(opml)).message).toBe(SENTENCE);
      expect(refusal(() => fromXMind({ contentXml: xmind })).message).toBe(SENTENCE);
    });
  });
});
