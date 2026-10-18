/**
 * The XML every serialiser reads and writes goes through here: one scanner, one escape, one decode
 * and one link allowlist, so a hardening made once holds for `.mm`, OPML and legacy XMind alike.
 *
 * **Why the XML is scanned by hand.** `core/` has no DOM (ADR 0001) and the purity suite asserts
 * it, so `DOMParser` is not available. The scanner knows elements, attributes, text, CDATA, the five
 * predefined entities plus `nbsp`, and numeric character references. It skips comments and
 * processing instructions. It is strict, because a file from another program is either a whole
 * document or a damaged one: an unclosed comment, CDATA section, declaration or tag, a close that
 * does not match its open, and an unquoted attribute are all refused rather than half-read.
 *
 * A DOCTYPE carrying an internal subset is refused outright, before any element is announced. The
 * subset is where a document declares its own entities, and an entity that expands to ten copies
 * of another is how a kilobyte of file becomes gigabytes of memory. Nothing is ever fetched, no
 * external DTD is loaded, and an entity this module does not define is left as the letters it was
 * written with.
 *
 * Size is refused as well as shape, each with one sentence: a document past 20 MB before it is
 * scanned, an element with more than 256 attributes, and a document with more than 200,000 entity
 * references. Each of those costs a file a few bytes and costs the reader time and memory, and no
 * file a mind-mapping tool wrote comes near any of them.
 */

import { MindMapError } from '../map-model.js';

/** The schemes a link may use. Anything else, `javascript:` above all, never reaches a node. */
const SAFE_SCHEME = /^(?:https?|mailto):/i;

/**
 * Characters an XML 1.0 document may not contain, written raw or as a reference: the C0 controls
 * other than tab, line feed and carriage return, the two non-characters, and half a surrogate
 * pair. A conformant parser rejects the whole file on meeting one, and the everyday way in is a
 * paste from a word processor, whose soft line break is U+000B.
 */
const FORBIDDEN =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

/** Everything a URL parser ignores or a reader cannot see, taken out before the scheme is tested. */
const INVISIBLE_IN_A_SCHEME = /[\u0000-\u0020\u007f]+/g;

/**
 * The longest document that will be scanned, in UTF-16 units. It is the size the zip reader allows
 * one unpacked entry, so an XMind `content.xml` and a `.mm` file are held to the same limit — and
 * the page refuses a file this big before reading it, so a student meets one number and one
 * sentence rather than two limits that disagree.
 */
export const MAX_XML_LENGTH = 20 * 1024 * 1024;

/** Attributes on one element. FreeMind writes about ten on a node and Freeplane under thirty. */
const MAX_ATTRIBUTES = 256;

/**
 * Entity and character references in one document. Each one is a lookup and a new string, so two
 * million of them in a single attribute took two seconds and a quarter of a gigabyte. A five
 * thousand node map with forty in every node stays inside this.
 */
const MAX_REFERENCES = 200000;

/** One reference, matched where it stands: named, decimal or hexadecimal. */
const REFERENCE = /&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/y;

const NAMED_ENTITIES = new Map([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
  // Not one of XML's five, but richcontent is XHTML and Freeplane writes it anyway.
  ['nbsp', '\u00a0'],
]);

/** Names that stand for consecutive code points, as the HTML DTDs list them. */
const consecutive = (first, names) =>
  names.split(' ').map((name, at) => [name, String.fromCodePoint(first + at)]);

/**
 * The named entities of HTML's Latin-1 set, its Greek letters, and the punctuation and symbols a
 * word processor produces. XML defines none of them, but Freeplane's rich text is XHTML written by
 * an HTML editor, which does, so they are decoded inside XHTML text and nowhere else: a plain
 * `TEXT` attribute saying `&eacute;` means those letters. A `Map`, because the name comes from
 * the file.
 */
const HTML_ENTITIES = new Map([
  ...consecutive(
    0xa0,
    'nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr ' +
      'deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest ' +
      'Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ' +
      'ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig ' +
      'agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml ' +
      'eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml'
  ),
  ...consecutive(
    0x391,
    'Alpha Beta Gamma Delta Epsilon Zeta Eta Theta Iota Kappa Lambda Mu Nu Xi Omicron Pi Rho'
  ),
  ...consecutive(0x3a3, 'Sigma Tau Upsilon Phi Chi Psi Omega'),
  ...consecutive(
    0x3b1,
    'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigmaf ' +
      'sigma tau upsilon phi chi psi omega'
  ),
  ...consecutive(0x152, 'OElig oelig'),
  ...consecutive(0x160, 'Scaron scaron'),
  ...consecutive(0x2190, 'larr uarr rarr darr harr'),
  ...consecutive(0x200c, 'zwnj zwj lrm rlm'),
  ...consecutive(0x2020, 'dagger Dagger bull'),
  ...consecutive(0x2032, 'prime Prime'),
  ...consecutive(0x2264, 'le ge'),
  ...[
    ['Yuml', 0x178],
    ['fnof', 0x192],
    ['circ', 0x2c6],
    ['tilde', 0x2dc],
    ['ensp', 0x2002],
    ['emsp', 0x2003],
    ['thinsp', 0x2009],
    ['ndash', 0x2013],
    ['mdash', 0x2014],
    ['lsquo', 0x2018],
    ['rsquo', 0x2019],
    ['sbquo', 0x201a],
    ['ldquo', 0x201c],
    ['rdquo', 0x201d],
    ['bdquo', 0x201e],
    ['hellip', 0x2026],
    ['permil', 0x2030],
    ['lsaquo', 0x2039],
    ['rsaquo', 0x203a],
    ['euro', 0x20ac],
    ['trade', 0x2122],
    ['minus', 0x2212],
    ['infin', 0x221e],
    ['asymp', 0x2248],
    ['ne', 0x2260],
  ].map(([name, code]) => [name, String.fromCodePoint(code)]),
]);

/** No code point needs more digits than this; a longer run is an attack on the number parser. */
const MAX_REFERENCE_DIGITS = 8;

const badXml = detail => new MindMapError('BAD_XML', detail);

/** 200000 as a student reads it, without reaching for a locale. */
const grouped = value => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const withoutForbidden = value => value.replace(FORBIDDEN, '');

/**
 * Escape for an XML attribute or text node.
 *
 * Tab, line feed and carriage return become numeric references because a parser is required to
 * fold a literal one inside an attribute into a space, which would quietly flatten a multi-line
 * note. A character XML 1.0 forbids cannot be written even as a reference, so it is left out.
 *
 * @param {*} value
 * @returns {string}
 */
export function escapeXml(value) {
  return withoutForbidden(String(value))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\t/g, '&#9;')
    .replace(/\n/g, '&#10;')
    .replace(/\r/g, '&#13;');
}

/**
 * Resolve entities and numeric character references, and drop what XML forbids.
 *
 * An entity this build does not define is left as it was written: a file that says `&sigma;`
 * should show those letters rather than lose them, and with no DTD loaded there is nothing else it
 * could honestly mean. A reference to a forbidden character, to a surrogate or to anything past
 * U+10FFFF resolves to nothing at all, and so does one whose digits, leading zeros aside, run
 * longer than any code point needs.
 *
 * @param {string} value
 * @param {{references: number}} budget - the document's running count of references, kept by
 *   `scanXml` so that the cap is on the whole file and not on each value.
 * @param {boolean} [xhtml=false] - true for text inside XHTML, where HTML's entities also decode.
 * @returns {string}
 * @throws {MindMapError} UNSAFE_XML once the document has used more than MAX_REFERENCES.
 */
function decodeXml(value, budget, xhtml = false) {
  const text = withoutForbidden(String(value));

  const resolve = (whole, body) => {
    if (body[0] !== '#') {
      if (NAMED_ENTITIES.has(body)) {
        return NAMED_ENTITIES.get(body);
      }
      return xhtml && HTML_ENTITIES.has(body) ? HTML_ENTITIES.get(body) : whole;
    }
    const hex = body[1] === 'x' || body[1] === 'X';
    const digits = body.slice(hex ? 2 : 1).replace(/^0+(?=.)/, '');
    if (digits.length > MAX_REFERENCE_DIGITS) {
      return '';
    }
    const code = parseInt(digits, hex ? 16 : 10);
    return code > 0x10ffff ? '' : withoutForbidden(String.fromCodePoint(code));
  };

  // One ampersand at a time rather than `replace` with a function, which finds every match in the
  // value before it calls the function once, so a cap inside the function would come too late.
  // Every ampersand is counted, known name or not, because each costs the same to look at.
  let decoded = '';
  let kept = 0;
  let at = text.indexOf('&');
  while (at !== -1) {
    budget.references += 1;
    if (budget.references > MAX_REFERENCES) {
      throw new MindMapError(
        'UNSAFE_XML',
        `This file holds more than ${grouped(MAX_REFERENCES)} XML entity references, which no mind map file does, so it has not been read.`
      );
    }
    REFERENCE.lastIndex = at;
    const match = REFERENCE.exec(text);
    if (match) {
      decoded += text.slice(kept, at) + resolve(match[0], match[1]);
      kept = at + match[0].length;
    }
    at = text.indexOf('&', match ? kept : at + 1);
  }
  return kept === 0 ? text : decoded + text.slice(kept);
}

/**
 * A link a student can safely follow, or null.
 *
 * The scheme is tested on a copy with every control character and space taken out, because
 * `java&#9;script:` is the oldest way of smuggling one past a check that only looks at the start
 * of the string. What is kept is the link as it was written, trimmed: taking the spaces out of the
 * stored value would turn `http://a b/c` into a different address.
 *
 * @param {*} url
 * @returns {string|null}
 */
export function safeLink(url) {
  if (typeof url !== 'string') {
    return null;
  }
  return SAFE_SCHEME.test(url.replace(INVISIBLE_IN_A_SCHEME, '')) ? url.trim() : null;
}

const isSpace = code => code === 32 || code === 9 || code === 10 || code === 13;

/**
 * Step past a `<!…>` declaration, refusing a DOCTYPE that carries an internal subset.
 *
 * Refusing at the bracket, before a single expansion, is what makes a billion-laughs file fail in
 * microseconds rather than filling memory. Quotes are tracked so a `>` inside a SYSTEM identifier
 * cannot end the declaration early.
 *
 * @returns {number} the index just past the declaration.
 */
function skipDeclaration(xml, start) {
  let cursor = start + 2;
  let quote = '';
  while (cursor < xml.length) {
    const character = xml[cursor];
    if (quote) {
      if (character === quote) {
        quote = '';
      }
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '[') {
      throw new MindMapError(
        'UNSAFE_XML',
        'This file declares its own XML entities, which can expand without limit, so it has not been read.'
      );
    } else if (character === '>') {
      return cursor + 1;
    }
    cursor += 1;
  }
  throw badXml('A declaration near the top of this file is never closed.');
}

/**
 * Read one tag, starting at its `<`.
 *
 * @returns {{name: string, attributes: Object, closing: boolean, selfClosing: boolean, end: number}}
 * @throws {MindMapError} BAD_XML for a malformed tag, UNSAFE_XML for one with too many attributes.
 */
function readTag(xml, start, budget) {
  const length = xml.length;
  let cursor = start + 1;
  const closing = xml[cursor] === '/';
  if (closing) {
    cursor += 1;
  }

  const nameStart = cursor;
  while (cursor < length) {
    const code = xml.charCodeAt(cursor);
    if (isSpace(code) || code === 47 || code === 62) {
      break;
    }
    cursor += 1;
  }
  const name = xml.slice(nameStart, cursor).toLowerCase();
  if (name === '') {
    throw badXml('A tag in this file has no name, so it is not valid XML.');
  }

  // No prototype: an attribute called `constructor` is a value like any other, never a function.
  const attributes = Object.create(null);
  let written = 0;
  let selfClosing = false;
  for (;;) {
    while (cursor < length && isSpace(xml.charCodeAt(cursor))) {
      cursor += 1;
    }
    if (cursor >= length) {
      throw badXml(`The tag <${name}> is never closed, so this file is cut short.`);
    }
    if (xml[cursor] === '>') {
      cursor += 1;
      break;
    }
    if (xml[cursor] === '/') {
      if (xml[cursor + 1] !== '>') {
        throw badXml(`The tag <${name}> has a stray slash, so this file is not valid XML.`);
      }
      selfClosing = true;
      cursor += 2;
      break;
    }

    const attributeStart = cursor;
    while (cursor < length) {
      const code = xml.charCodeAt(cursor);
      if (isSpace(code) || code === 61 || code === 47 || code === 62) {
        break;
      }
      cursor += 1;
    }
    const attribute = xml.slice(attributeStart, cursor).toLowerCase();
    if (attribute === '') {
      throw badXml(`The tag <${name}> holds something that is not an attribute.`);
    }
    // Counted as written, not as kept, so one name repeated a million times is refused as well.
    written += 1;
    if (written > MAX_ATTRIBUTES) {
      throw new MindMapError(
        'UNSAFE_XML',
        `The tag <${name}> carries more than ${MAX_ATTRIBUTES} attributes, which no mind map file does, so this file has not been read.`
      );
    }
    while (cursor < length && isSpace(xml.charCodeAt(cursor))) {
      cursor += 1;
    }
    if (xml[cursor] !== '=') {
      throw badXml(`The ${attribute} attribute of <${name}> has no value.`);
    }
    cursor += 1;
    while (cursor < length && isSpace(xml.charCodeAt(cursor))) {
      cursor += 1;
    }
    const quote = xml[cursor];
    if (quote !== '"' && quote !== "'") {
      throw badXml(`The ${attribute} attribute of <${name}> is not quoted.`);
    }
    const valueEnd = xml.indexOf(quote, cursor + 1);
    if (valueEnd === -1) {
      throw badXml(`The ${attribute} attribute of <${name}> is never closed.`);
    }
    // XML folds a literal tab or newline inside an attribute to a space; a character reference for
    // one does not fold, which is how a multi-line label survives the trip.
    attributes[attribute] = decodeXml(
      xml.slice(cursor + 1, valueEnd).replace(/[\t\r\n]/g, ' '),
      budget
    );
    cursor = valueEnd + 1;
  }

  return { name, attributes, closing, selfClosing, end: cursor };
}

/**
 * Walk an XML document once, announcing elements and text as they arrive.
 *
 * Push rather than pull, and a loop rather than recursion, so a caller can stop on the five
 * thousandth node of a hundred thousand node file and so nesting cannot overflow the stack.
 *
 * @param {string} xml
 * @param {{open: (name: string, attributes: Object) => void, close: (name: string) => void,
 *   text: (value: string) => void, xhtml?: () => boolean}} handlers - element and attribute names
 *   arrive lower-cased, attribute values and text arrive decoded, and `attributes` has no
 *   prototype. `xhtml`, when given, is asked before each run of text whether that text sits inside
 *   XHTML, where HTML's named entities decode as well as XML's; attributes never decode them.
 * @throws {MindMapError} TOO_LARGE for a document past MAX_XML_LENGTH, UNSAFE_XML for a DOCTYPE
 *   with an internal subset, an element with too many attributes or a document with too many
 *   entity references, BAD_XML for anything malformed or cut short.
 */
export function scanXml(xml, handlers) {
  if (xml.length > MAX_XML_LENGTH) {
    throw new MindMapError(
      'TOO_LARGE',
      `This file is larger than ${MAX_XML_LENGTH / (1024 * 1024)} MB, which is more than a mind map file holds, so it has not been read.`
    );
  }

  const stack = [];
  const length = xml.length;
  const budget = { references: 0 };
  const inXhtml = typeof handlers.xhtml === 'function' ? handlers.xhtml : () => false;
  let index = 0;

  while (index < length) {
    const next = xml.indexOf('<', index);
    if (next === -1) {
      handlers.text(decodeXml(xml.slice(index), budget, inXhtml()));
      break;
    }
    if (next > index) {
      handlers.text(decodeXml(xml.slice(index, next), budget, inXhtml()));
    }

    if (xml.startsWith('<!--', next)) {
      const end = xml.indexOf('-->', next + 4);
      if (end === -1) {
        throw badXml('A comment in this file is never closed.');
      }
      index = end + 3;
      continue;
    }
    if (xml.startsWith('<![CDATA[', next)) {
      const end = xml.indexOf(']]>', next + 9);
      if (end === -1) {
        throw badXml('A CDATA section in this file is never closed.');
      }
      handlers.text(withoutForbidden(xml.slice(next + 9, end)));
      index = end + 3;
      continue;
    }
    if (xml.startsWith('<?', next)) {
      const end = xml.indexOf('?>', next + 2);
      if (end === -1) {
        throw badXml('A processing instruction in this file is never closed.');
      }
      index = end + 2;
      continue;
    }
    if (xml.startsWith('<!', next)) {
      index = skipDeclaration(xml, next);
      continue;
    }

    const tag = readTag(xml, next, budget);
    index = tag.end;
    if (tag.closing) {
      const opened = stack.pop();
      if (opened !== tag.name) {
        throw badXml(
          `The tag </${tag.name}> closes ${opened ? `<${opened}>` : 'nothing'}, so this file is not valid XML.`
        );
      }
      handlers.close(tag.name);
      continue;
    }
    handlers.open(tag.name, tag.attributes);
    if (tag.selfClosing) {
      handlers.close(tag.name);
    } else {
      stack.push(tag.name);
    }
  }

  if (stack.length > 0) {
    throw badXml(
      `The tag <${stack[stack.length - 1]}> is never closed, so this file is cut short.`
    );
  }
}
