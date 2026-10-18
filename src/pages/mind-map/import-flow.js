/**
 * Bringing a file in — the one path, used by the File menu and by the library.
 *
 * ADR 0003: a student arrives with maps from Coggle, MindMeister, XMind or Freeplane, and with
 * plain indented outlines they pasted into a text file. Reading those is `core/`'s work and the zip
 * is `utils/zip-reader.js`'s; what lives here is the choosing, the announcing and the refusing.
 *
 * There are two places a file can be picked — the editor's File menu and the library's Import
 * button — and they used to be two flows: one with a progress sentence, a busy state and a refusal
 * for a second pick, and one with none of those, which dropped the news that an XMind file held
 * three sheets and could be raced by two quick picks. So the whole of it is here, driven by the
 * file input and the control the student pressed: same busy state, same refusal, same sentence,
 * and the keyboard back on the control that started it when a file will not open.
 *
 * Everything is said through `notify`, which is the page's `showToast` — toast AND live region, in
 * one call. It is never paired with a second `announce`: that is what made every progress sentence
 * and every refusal arrive in a screen reader twice, the second time prefixed "Problem:".
 *
 * The outcome is the one sentence that cannot be said here, because opening the map that came out
 * of the file navigates: the page is replaced before a live region can be read. So it is carried
 * across the load in `sessionStorage` and shown once the editor is up.
 *
 * @module pages/mind-map/import-flow
 */

import { MindMapError } from '../../features/mindMap/core/map-model.js';
import { nodeCount } from '../../features/mindMap/core/map-ops.js';
import { fromFreeMind } from '../../features/mindMap/core/serialisers/freemind.js';
import { fromJSON } from '../../features/mindMap/core/serialisers/json.js';
import { fromMarkdown } from '../../features/mindMap/core/serialisers/markdown.js';
import { fromOPML } from '../../features/mindMap/core/serialisers/opml.js';
import { fromOutlineText } from '../../features/mindMap/core/serialisers/outline-text.js';
import { MAX_XML_LENGTH } from '../../features/mindMap/core/serialisers/xml-scan.js';
import { fromXMind } from '../../features/mindMap/core/serialisers/xmind.js';
import { ZipError, readZip } from '../../utils/zip-reader.js';

/** Every extension the import accepts, for the File menu's input and for the library's. */
export const IMPORT_ACCEPT = '.mm,.xmind,.md,.markdown,.opml,.xml,.json,.txt';

/** Said when a second file is picked while one is still being read, from either surface. */
const STILL_OPENING =
  'AssisT is still opening a file, so wait for that to finish before picking another.';

/**
 * One limit for every import, and it is the scanner's: a file the XML scanner would refuse after
 * reading is a file worth refusing before reading, in the same number and the same sentence.
 */
const MAX_IMPORT_BYTES = MAX_XML_LENGTH;
const MAX_IMPORT_MB = MAX_XML_LENGTH / (1024 * 1024);

/** Fallback ids for an imported outline. The core never calls crypto, so the caller supplies them. */
let importSerial = 0;
const freshId = () =>
  window.crypto && typeof window.crypto.randomUUID === 'function'
    ? window.crypto.randomUUID()
    : `mm-import-${Date.now().toString(36)}-${(importSerial += 1)}`;

/**
 * What a file's name says it holds. A `Map`, because the key comes off a file the student picked:
 * an object literal would answer a file called `notes.constructor` with a function.
 *
 * @type {ReadonlyMap<string, string>}
 */
const EXTENSION_FORMATS = new Map([
  ['json', 'json'],
  ['md', 'markdown'],
  ['markdown', 'markdown'],
  ['opml', 'opml'],
  ['xml', 'opml'],
  ['mm', 'freemind'],
  ['xmind', 'xmind'],
  ['txt', 'outline'],
]);

/** The words the announcement uses for each format. @type {ReadonlyMap<string, string>} */
const FORMAT_NAMES = new Map([
  ['json', 'an AssisT file'],
  ['markdown', 'Markdown'],
  ['opml', 'OPML'],
  ['freemind', 'FreeMind'],
  ['xmind', 'XMind'],
  ['outline', 'a text outline'],
]);

/**
 * The four bytes a zip opens with: a local file header, or the end record of an empty archive.
 *
 * Two letters are not a signature. A revision outline whose first line is "PKU" or "PK unit
 * revision", and a `.mm` file whose text happens to start PK, were all refused as broken archives
 * because the check was `startsWith('PK')` on decoded text.
 */
const ZIP_SIGNATURES = [
  [0x50, 0x4b, 0x03, 0x04],
  [0x50, 0x4b, 0x05, 0x06],
];

/** @param {string} filename @returns {string|null} the format the name claims, if it claims one. */
function extensionFormat(filename) {
  const match = /\.([^.]+)$/.exec(String(filename).toLowerCase());
  return (match && EXTENSION_FORMATS.get(match[1])) || null;
}

/**
 * What the first characters of a file say it is, which is worth more than what it is called.
 *
 * Archives are not looked for here: they are bytes, and bytes are read before any of this.
 *
 * @param {string} text
 * @returns {string|null} null when the text identifies nothing, so the name decides.
 */
function sniffFormat(text) {
  const start = String(text).trimStart();
  const head = start.slice(0, 2048);
  if (/<map[\s>]/i.test(head)) {
    return 'freemind';
  }
  if (/<opml[\s>]/i.test(head)) {
    return 'opml';
  }
  if (start.startsWith('{')) {
    return 'json';
  }
  if (/^ {0,3}#{1,6}\s|^\s*[-*+]\s|^\s*\d+[.)]\s/m.test(start)) {
    return 'markdown';
  }
  return null;
}

/**
 * Choose the format: the extension first, the bytes when the extension is missing or wrong.
 *
 * They disagree only when the name is wrong — a Coggle outline saved as `.md`, a `.mm` renamed
 * `.xml`, an OPML file emailed as `.txt` — and then the bytes are right. A plain text outline is
 * the fallback because it reads anything: worst case a student gets one node per line.
 *
 * A name saying `.xmind` is caught by the same rule: the archive check ahead of this has already
 * said the bytes are not an archive, so the name was wrong and the content wins.
 *
 * @param {string} filename
 * @param {string} text
 * @returns {string}
 */
function formatOf(filename, text) {
  const byContent = sniffFormat(text);
  const byName = extensionFormat(filename);
  if (byContent && byContent !== byName) {
    return byContent;
  }
  return byName || 'outline';
}

/**
 * @param {string} format
 * @param {string} text
 * @param {Object} options - `{title, ids}`, as every importer in `core/` takes them.
 * @returns {Object} a valid map.
 * @throws {MindMapError}
 */
function parseText(format, text, options) {
  switch (format) {
    case 'json':
      return fromJSON(text);
    case 'opml':
      return fromOPML(text, options);
    case 'freemind':
      return fromFreeMind(text, options);
    case 'markdown':
      return fromMarkdown(text, options);
    default:
      return fromOutlineText(text, options);
  }
}

/**
 * @param {Blob} blob
 * @param {'text'|'bytes'} as
 * @returns {Promise<string|ArrayBuffer>}
 */
const readBlob = (blob, as) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(as === 'bytes' ? reader.result : String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('The file could not be read.'));
    if (as === 'bytes') {
      reader.readAsArrayBuffer(blob);
    } else {
      reader.readAsText(blob);
    }
  });

/**
 * Whether the file really is an archive, read from its first four bytes.
 *
 * Only four bytes: the rest of the file is read as text or unpacked as a zip, and which of those
 * to do is the whole question here.
 *
 * @param {File} file
 * @returns {Promise<boolean>} false for anything that cannot be sliced, which is not a file.
 */
async function isArchive(file) {
  if (typeof file.slice !== 'function') {
    return false;
  }
  const head = new Uint8Array(await readBlob(file.slice(0, ZIP_SIGNATURES[0].length), 'bytes'));
  return ZIP_SIGNATURES.some(signature => signature.every((byte, at) => head[at] === byte));
}

/**
 * Unpack an `.xmind` archive and read its first sheet.
 *
 * Only the two content entries are ever unpacked. An XMind file carries the images and attachments
 * of every sheet, none of which is imported (ADR 0003), and unpacking them would spend a student's
 * time and memory on bytes that go straight in the bin.
 *
 * @param {File} file
 * @param {string} title
 * @param {Function} [decompressionStream]
 * @returns {Promise<{format: string, map: Object, sheetCount: number}>}
 * @throws {ZipError|MindMapError}
 */
async function readXMind(file, title, decompressionStream) {
  const archive = await readZip(await readBlob(file, 'bytes'), {
    include: name => name === 'content.json' || name === 'content.xml',
    decompressionStream,
  });
  const { map, sheetCount } = fromXMind(
    { contentJson: archive.text('content.json'), contentXml: archive.text('content.xml') },
    { title, ids: freshId }
  );
  return { format: 'xmind', map, sheetCount };
}

/**
 * Read a file a student picked into a map.
 *
 * Nothing here writes anything: the caller decides what to do with the map that comes out.
 *
 * @param {File} file
 * @param {Function} [decompressionStream] - the inflater, defaulting to the platform's. Threaded
 *   through for the suite, which runs in jsdom where there is no `DecompressionStream`.
 * @returns {Promise<{format: string, map: Object, sheetCount: number}>} the map, the format it was
 *   read as, and — for XMind, whose files hold several sheets and give up only the first — how many
 *   there were. One sheet for every other format.
 * @throws {MindMapError} FILE_TOO_LARGE before the file is read, or whatever the chosen importer
 *   refuses the contents with; {@link ZipError} from an archive that cannot be trusted.
 */
async function readImport(file, decompressionStream) {
  const name = String(file.name || '');
  const title = name.replace(/\.[^.]+$/, '').trim() || 'Imported map';

  if (typeof file.size === 'number' && file.size > MAX_IMPORT_BYTES) {
    throw new MindMapError(
      'FILE_TOO_LARGE',
      `${name || 'That file'} is larger than ${MAX_IMPORT_MB} MB, so AssisT did not open it.`
    );
  }

  /** @param {string} [already] - the text, when a caller has had to read it to decide. */
  const asText = async already => {
    const text = already === undefined ? await readBlob(file, 'text') : already;
    const format = formatOf(name, text);
    return { format, map: parseText(format, text, { title, ids: freshId }), sheetCount: 1 };
  };

  if (await isArchive(file)) {
    return readXMind(file, title, decompressionStream);
  }
  if (extensionFormat(name) === 'xmind') {
    // A file with the wrong extension still opens, and `.xmind` on something whose first bytes are
    // not an archive is a wrong extension: a Freeplane file renamed `.xmind` is still a Freeplane
    // file. Only when the content names nothing either is the archive reader let loose on it, so
    // that what the student is told is the zip's own sentence rather than a one-node outline.
    const text = await readBlob(file, 'text');
    if (sniffFormat(text) !== null) {
      return asText(text);
    }
    return readXMind(file, title, decompressionStream);
  }
  return asText();
}

/**
 * What an import did, in the words a student would use: the map's name, where it came from, and
 * how much of it there is — one sentence, with the verb said once.
 *
 * An XMind file holding several sheets says which one arrived and that the others did not, because
 * they are not in the map and nothing else on screen would ever say so.
 *
 * @param {{format: string, map: Object, sheetCount: number}} outcome
 * @returns {string}
 */
function openedSentence({ format, map, sheetCount }) {
  const count = nodeCount(map);
  const nodes = `${count} node${count === 1 ? '' : 's'}`;
  const from = FORMAT_NAMES.get(format);
  if (sheetCount > 1) {
    const others = sheetCount - 1;
    const left =
      others === 1
        ? 'The other sheet was not imported.'
        : `The other ${others} sheets were not imported.`;
    return `Opened '${map.title}', the first of ${sheetCount} sheets, from ${from}: ${nodes}. ${left}`;
  }
  return `Opened '${map.title}' from ${from}: ${nodes}.`;
}

/**
 * The sentence to show for a failed import.
 *
 * Every refusal the serialisers and the zip reader raise is already one sentence written for a
 * student, so it is shown as it is. Anything else — a disk that would not read, a browser without a
 * FileReader — is not, and a stack trace or the word "undefined" in a live region is worse than no
 * detail at all.
 *
 * @param {unknown} error
 * @returns {string}
 */
const refusalSentence = error =>
  error instanceof MindMapError || error instanceof ZipError
    ? error.message
    : 'That file could not be opened.';

/** The one key the outcome sentence is carried across the page load in. */
const OUTCOME_KEY = 'assist-mm-import-outcome';

/**
 * Keep the outcome sentence for the page that is about to load.
 *
 * Storage can be refused — a private window, blocked site data — and an import that worked must
 * not fail over a sentence, so a refusal is silence rather than an error.
 *
 * @param {string} sentence
 */
export function rememberImportOutcome(sentence) {
  try {
    window.sessionStorage.setItem(OUTCOME_KEY, sentence);
  } catch {
    // Nothing to do: the map is open, and this was only the words about it.
  }
}

/**
 * The outcome sentence left by the load before this one, taken away as it is read so that a
 * reload, or the next map opened, never says it a second time.
 *
 * @returns {string} '' when there is nothing to say.
 */
export function takeImportOutcome() {
  try {
    const sentence = window.sessionStorage.getItem(OUTCOME_KEY);
    window.sessionStorage.removeItem(OUTCOME_KEY);
    return sentence || '';
  } catch {
    return '';
  }
}

/**
 * Wire a file input and the control that opens it into the import.
 *
 * @param {Object} options
 * @param {HTMLInputElement} options.input - the hidden `type="file"` input.
 * @param {HTMLElement} [options.control] - what the student pressed to get here. A refusal puts
 *   the keyboard back on it: by the time anything can be refused the picker has closed, and on a
 *   menu the item that was pressed is no longer on screen at all.
 * @param {(text: string, kind?: 'info'|'error') => void} options.notify - the page's `showToast`,
 *   which writes the toast AND the live region. The only channel this module speaks on.
 * @param {(map: Object, sentence: string) => (void|Promise<void>)} options.onImport - store the
 *   map and open it. Handed the outcome sentence to carry across the navigation. Throwing from
 *   here is refused in the caller's own words.
 * @param {(busy: boolean) => void} [options.setBusy] - mark the surface busy: `aria-busy` on the
 *   region and `aria-disabled` on the control, which then says why it cannot act.
 * @param {Function} [options.decompressionStream] - the inflater; threaded through for the suite.
 * @returns {{pick: () => void, destroy: () => void}}
 */
export function createImportFlow({
  input,
  control = null,
  notify = () => {},
  onImport = () => {},
  setBusy = () => {},
  decompressionStream,
} = {}) {
  /** Set while a file is being read, so a second pick cannot race the first. */
  let importing = false;

  const mark = busy => {
    importing = busy;
    setBusy(busy);
  };

  const refuse = text => {
    notify(text, 'error');
    if (control && control.isConnected) {
      control.focus();
    }
  };

  /**
   * Read the file the student picked.
   *
   * Reading one is work: a `.mm` file of a few thousand nodes is a few hundred milliseconds of
   * scanning, and an `.xmind` file has an inflate on top of that. So the wait is said, a second
   * file picked mid-read is refused rather than raced, and the attempt always ends with exactly
   * one outcome — the map, or the sentence saying why not.
   */
  const onFileChosen = async () => {
    const file = input.files && input.files[0];
    // Clearing lets the student pick the same file again after fixing it.
    input.value = '';
    if (!file) {
      return;
    }
    if (importing) {
      refuse(STILL_OPENING);
      return;
    }

    mark(true);
    notify(`Opening ${file.name}…`, 'info');
    try {
      const outcome = await readImport(file, decompressionStream);
      await onImport(outcome.map, openedSentence(outcome));
    } catch (error) {
      refuse(refusalSentence(error));
    } finally {
      mark(false);
    }
  };
  input.addEventListener('change', onFileChosen);

  return {
    /** Open the picker, or say why it cannot be opened yet. */
    pick() {
      if (importing) {
        refuse(STILL_OPENING);
        return;
      }
      input.click();
    },

    destroy() {
      input.removeEventListener('change', onFileChosen);
    },
  };
}
